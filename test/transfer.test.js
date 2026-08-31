import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

async function loadStore(dataDir) {
  vi.resetModules();
  const electron = await import('./stubs/electron.js');
  electron.__setUserData(dataDir);
  return import('../src/main/store.js');
}

/** PNG giả nhưng có đúng chữ ký — importAll() kiểm chữ ký trước khi nhận ảnh. */
const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const fakePng = (payload) => Buffer.concat([PNG_MAGIC, Buffer.from(payload, 'utf8')]);

let tmp;
let store;

beforeEach(async () => {
  tmp = mkdtempSync(join(tmpdir(), 'clipfull-transfer-'));
  store = await loadStore(tmp);
  store.load();
});

afterEach(() => {
  store.flush();
  rmSync(tmp, { recursive: true, force: true });
});

describe('exportAll', () => {
  it('gói đủ ba loại nội dung', () => {
    store.addText('một đoạn text');
    store.addFiles(['C:\\a.txt', 'C:\\b.txt']);
    store.addImage({ png: fakePng('ảnh'), thumb: fakePng('t'), width: 3, height: 4 });

    const dump = store.exportAll();
    expect(dump.app).toBe('ClipFull');
    expect(dump.items).toHaveLength(3);

    const byType = Object.fromEntries(dump.items.map((i) => [i.type, i]));
    expect(byType.text.text).toBe('một đoạn text');
    expect(byType.files.paths).toEqual(['C:\\a.txt', 'C:\\b.txt']);
    expect(Buffer.from(byType.image.png, 'base64')).toEqual(fakePng('ảnh'));
  });

  it('mang theo toàn văn của mục dài, không phải mỗi preview', () => {
    const long = 'D'.repeat(70_000);
    store.addText(long);
    expect(store.exportAll().items[0].text).toBe(long);
  });

  it('giữ cờ ghim, cờ nhạy cảm và số lần dùng', () => {
    const item = store.addText('quan trọng');
    store.togglePin(item.id);
    store.toggleMask(item.id);
    store.markUsed(item.id);
    store.markUsed(item.id);

    expect(store.exportAll().items[0]).toMatchObject({ pinned: true, masked: true, uses: 2 });
  });
});

describe('importAll', () => {
  it('nạp lại được đúng những gì đã xuất', async () => {
    store.addText('một');
    store.addText('hai');
    const dump = store.exportAll();

    const fresh = await loadStore(mkdtempSync(join(tmpdir(), 'clipfull-into-')));
    fresh.load();
    expect(fresh.importAll(dump)).toEqual({ added: 2, skipped: 0 });
    expect(fresh.list().map((i) => i.preview)).toEqual(['hai', 'một']); // đúng thứ tự cũ
  });

  it('nhập đè lên lịch sử đang có thì mục trùng chỉ được đẩy lên đầu', () => {
    store.addText('đã có sẵn');
    const dump = store.exportAll();

    store.addText('mục mới hơn');
    store.importAll(dump);

    expect(store.list()).toHaveLength(2); // không nhân bản
    expect(store.list()[0].preview).toBe('đã có sẵn');
  });

  it('giữ lại mốc thời gian gốc chứ không đóng dấu giờ nhập', () => {
    const item = store.addText('cũ');
    item.ts = 1_600_000_000_000;
    const dump = store.exportAll();

    store.clear();
    store.importAll(dump);

    expect(store.list()[0].ts).toBe(1_600_000_000_000);
  });

  it('ảnh nhập vào vẫn đọc lại được đúng dữ liệu', () => {
    const png = fakePng('dữ liệu ảnh');
    store.addImage({ png, thumb: png, width: 5, height: 5 });
    const dump = store.exportAll();

    store.clear();
    const result = store.importAll(dump);

    expect(result.added).toBe(1);
    expect(store.imageOf(store.list()[0].id)).toEqual(png);
  });

  it('file lạ thì từ chối rõ ràng chứ không nuốt lỗi', () => {
    expect(() => store.importAll({ app: 'app khác', items: [] })).toThrow(/ClipFull/);
    expect(() => store.importAll(null)).toThrow();
    expect(() => store.importAll({ app: 'ClipFull' })).toThrow();
  });

  it('một mục hỏng không làm hỏng cả lần nhập', () => {
    const result = store.importAll({
      app: 'ClipFull',
      items: [
        { type: 'text', text: 'lành lặn' },
        { type: 'image', png: 'khong-phai-anh-that-dau' },
        { type: 'text' }
      ]
    });
    expect(result.added).toBe(1);
    expect(result.skipped).toBe(2);
    expect(store.list()).toHaveLength(1);
  });
});

describe('markUsed', () => {
  it('đếm lên nhưng KHÔNG đụng vào thời điểm copy vào', () => {
    const item = store.addText('dùng nhiều');
    const original = item.ts;

    store.markUsed(item.id);
    store.markUsed(item.id);

    expect(store.list()[0].uses).toBe(2);
    expect(store.list()[0].ts).toBe(original);
  });

  it('id không tồn tại thì không ném lỗi', () => {
    expect(() => store.markUsed('khong-co')).not.toThrow();
  });
});
