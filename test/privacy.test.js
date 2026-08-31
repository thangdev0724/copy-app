import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, rmSync, readFileSync, existsSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

async function loadAll(dataDir) {
  vi.resetModules();
  const electron = await import('./stubs/electron.js');
  electron.__setUserData(dataDir);
  electron.__setEncryptionAvailable(true);
  const crypt = await import('../src/main/crypt.js');
  const store = await import('../src/main/store.js');
  return { electron, crypt, store };
}

let tmp;
let store;
let crypt;
let electron;

const historyDir = () => join(tmp, 'history');
const indexPath = () => join(historyDir(), 'index.json');

beforeEach(async () => {
  tmp = mkdtempSync(join(tmpdir(), 'clipfull-privacy-'));
  ({ electron, crypt, store } = await loadAll(tmp));
  store.load();
});

afterEach(() => {
  store.flush();
  rmSync(tmp, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
});

describe('mã hoá lịch sử', () => {
  it('tắt thì index là JSON đọc được bằng mắt thường', () => {
    store.addText('nội dung thấy được');
    store.flush();
    expect(readFileSync(indexPath(), 'utf8')).toContain('nội dung thấy được');
  });

  it('bật thì nội dung không còn nằm trần trong file', () => {
    crypt.setEnabled(true);
    store.addText('bí mật của tôi');
    store.flush();

    const raw = readFileSync(indexPath());
    expect(raw.toString('utf8')).not.toContain('bí mật của tôi');
    expect(crypt.isSealed(raw)).toBe(true);
  });

  it('bật rồi nạp lại vẫn đọc ra đúng nội dung', async () => {
    crypt.setEnabled(true);
    const item = store.addText('đọc lại được chứ');
    store.flush();

    const next = await loadAll(tmp);
    next.crypt.setEnabled(true);
    next.store.load();

    expect(next.store.full(item.id)).toBe('đọc lại được chứ');
    store = next.store;
  });

  it('blob text dài cũng được mã hoá, không chỉ mỗi index', () => {
    crypt.setEnabled(true);
    const long = `MẬT${'x'.repeat(70_000)}`;
    const item = store.addText(long);

    const blob = readFileSync(join(historyDir(), 'blobs', `${item.hash}.txt`));
    expect(crypt.isSealed(blob)).toBe(true);
    expect(blob.toString('utf8')).not.toContain('MẬT');
    expect(store.full(item.id)).toBe(long); // vẫn đọc lại đúng
  });

  it('ảnh cũng được mã hoá — mã hoá index mà để ảnh nằm trần là hứa nửa vời', () => {
    crypt.setEnabled(true);
    const png = Buffer.from('dữ-liệu-ảnh-nhạy-cảm', 'utf8');
    const item = store.addImage({ png, thumb: png, width: 2, height: 2 });

    const onDisk = readFileSync(join(historyDir(), 'blobs', `${item.hash}.png`));
    expect(crypt.isSealed(onDisk)).toBe(true);
    expect(store.imageOf(item.id)).toEqual(png);
  });

  it('tìm kiếm vẫn chạy trên blob đã mã hoá', () => {
    crypt.setEnabled(true);
    const item = store.addText(`${'a'.repeat(70_000)}KIMCUONG`);
    expect(store.search('kimcuong')).toHaveProperty(item.id);
  });

  it('máy không hỗ trợ thì setEnabled trả false, không giả vờ đã bật', () => {
    electron.__setEncryptionAvailable(false);
    expect(crypt.setEnabled(true)).toBe(false);
    expect(crypt.isEnabled()).toBe(false);
  });
});

describe('reseal — bật/tắt mã hoá giữa chừng', () => {
  it('bật lên thì dữ liệu cũ chưa mã hoá cũng được mã hoá lại', () => {
    const item = store.addText('L'.repeat(70_000));
    store.flush();

    const before = readFileSync(join(historyDir(), 'blobs', `${item.hash}.txt`));
    expect(crypt.isSealed(before)).toBe(false);

    expect(store.reseal(true)).toBe(true);

    const after = readFileSync(join(historyDir(), 'blobs', `${item.hash}.txt`));
    expect(crypt.isSealed(after)).toBe(true);
    expect(store.full(item.id)).toBe('L'.repeat(70_000));
  });

  it('tắt đi thì giải mã ngược lại, không mất dữ liệu', () => {
    crypt.setEnabled(true);
    const item = store.addText('M'.repeat(70_000));
    store.flush();

    expect(store.reseal(false)).toBe(false);

    const after = readFileSync(join(historyDir(), 'blobs', `${item.hash}.txt`));
    expect(crypt.isSealed(after)).toBe(false);
    expect(store.full(item.id)).toBe('M'.repeat(70_000));
  });
});

describe('giải mã hỏng', () => {
  it('không xoá im lặng — backup lại rồi mới bắt đầu từ đầu', async () => {
    crypt.setEnabled(true);
    store.addText('lịch sử quý giá');
    store.flush();

    // Giả lập đổi máy / đổi tài khoản Windows: khoá không mở được nữa.
    const next = await loadAll(tmp);
    next.electron.__setEncryptionAvailable(false);
    next.crypt.setEnabled(false);
    next.store.load();

    expect(next.store.list()).toHaveLength(0);
    expect(next.store.takeLoadError()).toBeTruthy();
    expect(readdirSync(historyDir()).filter((f) => f.startsWith('index.corrupt-'))).toHaveLength(1);
    store = next.store;
  });
});

describe('sweepExpired — tự xoá theo thời gian', () => {
  const daysAgo = (n) => Date.now() - n * 24 * 60 * 60 * 1000;

  it('0 nghĩa là giữ mãi', () => {
    const item = store.addText('cũ mèm');
    item.ts = daysAgo(999);
    expect(store.sweepExpired(0)).toBe(0);
    expect(store.list()).toHaveLength(1);
  });

  it('xoá mục quá hạn, giữ mục còn hạn', () => {
    const old = store.addText('cũ');
    const fresh = store.addText('mới');
    old.ts = daysAgo(30);

    expect(store.sweepExpired(7)).toBe(1);
    expect(store.list().map((i) => i.id)).toEqual([fresh.id]);
  });

  it('mục đã ghim được miễn trừ — ghim là để giữ lại', () => {
    const pinned = store.addText('ghim lại');
    pinned.ts = daysAgo(30);
    store.togglePin(pinned.id);

    expect(store.sweepExpired(7)).toBe(0);
    expect(store.list()).toHaveLength(1);
  });

  it('xoá luôn blob của mục quá hạn', () => {
    const old = store.addText('B'.repeat(70_000));
    const blob = join(historyDir(), 'blobs', `${old.hash}.txt`);
    expect(existsSync(blob)).toBe(true);

    old.ts = daysAgo(30);
    store.sweepExpired(7);

    expect(existsSync(blob)).toBe(false);
  });
});

describe('toggleMask', () => {
  it('bật/tắt được cờ nhạy cảm và cờ đó sống sót qua ghi đĩa', async () => {
    const item = store.addText('nhạy cảm');
    store.toggleMask(item.id);
    expect(store.list()[0].masked).toBe(true);

    store.flush();
    const next = await loadAll(tmp);
    next.store.load();
    expect(next.store.list()[0].masked).toBe(true);
    store = next.store;
  });
});
