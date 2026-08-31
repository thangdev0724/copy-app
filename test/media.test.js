import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, rmSync, existsSync, writeFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

async function loadStore(dataDir) {
  vi.resetModules();
  const electron = await import('./stubs/electron.js');
  electron.__setUserData(dataDir);
  return import('../src/main/store.js');
}

let tmp;
let store;

const historyDir = () => join(tmp, 'history');
const blobPath = (name) => join(historyDir(), 'blobs', name);
const thumbPath = (hash) => join(historyDir(), 'thumbs', `${hash}.png`);

const png = (marker) => Buffer.from(`giả-lập-png-${marker}`, 'utf8');

beforeEach(async () => {
  tmp = mkdtempSync(join(tmpdir(), 'clipfull-media-'));
  store = await loadStore(tmp);
  store.load();
});

afterEach(() => {
  store.flush();
  rmSync(tmp, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
});

describe('addImage', () => {
  it('ghi PNG và thumbnail ra đĩa, không nhét vào index', () => {
    const item = store.addImage({ png: png('a'), thumb: png('a-thumb'), width: 800, height: 600 });

    expect(item.type).toBe('image');
    expect(item.inline).toBeUndefined(); // ảnh KHÔNG bao giờ inline
    expect(existsSync(blobPath(`${item.hash}.png`))).toBe(true);
    expect(existsSync(thumbPath(item.hash))).toBe(true);
    expect(item.preview).toBe('Ảnh 800×600');
  });

  it('đọc lại được đúng buffer đã ghi', () => {
    const data = png('b');
    const item = store.addImage({ png: data, thumb: png('b-thumb'), width: 4, height: 4 });
    expect(store.imageOf(item.id)).toEqual(data);
    expect(store.thumbOf(item.id)).toEqual(png('b-thumb'));
  });

  it('copy lại đúng ảnh cũ thì đẩy lên đầu chứ không tạo bản trùng', () => {
    const same = { png: png('c'), thumb: png('c-t'), width: 2, height: 2 };
    store.addImage(same);
    store.addText('xen giữa');
    store.addImage(same);

    expect(store.list()).toHaveLength(2);
    expect(store.list()[0].type).toBe('image');
  });

  it('buffer rỗng thì bỏ qua', () => {
    expect(store.addImage({ png: Buffer.alloc(0), width: 1, height: 1 })).toBeNull();
    expect(store.list()).toHaveLength(0);
  });

  it('full() của ảnh là chuỗi rỗng — ảnh không có text', () => {
    const item = store.addImage({ png: png('d'), thumb: png('d-t'), width: 1, height: 1 });
    expect(store.full(item.id)).toBe('');
  });

  it('xoá ảnh thì xoá cả PNG lẫn thumbnail', () => {
    const item = store.addImage({ png: png('e'), thumb: png('e-t'), width: 1, height: 1 });
    store.remove(item.id);

    expect(existsSync(blobPath(`${item.hash}.png`))).toBe(false);
    expect(existsSync(thumbPath(item.hash))).toBe(false);
  });

  it('imageOf trả null với mục không phải ảnh', () => {
    const text = store.addText('chỉ là text');
    expect(store.imageOf(text.id)).toBeNull();
    expect(store.thumbOf(text.id)).toBeNull();
  });
});

describe('addFiles', () => {
  it('lưu danh sách đường dẫn, nằm inline nên không sinh blob', () => {
    const paths = ['C:\\a\\x.txt', 'C:\\a\\y.txt'];
    const item = store.addFiles(paths);

    expect(item.type).toBe('files');
    expect(item.paths).toEqual(paths);
    expect(item.lines).toBe(2);
    expect(readdirSync(join(historyDir(), 'blobs'))).toHaveLength(0);
  });

  it('full() trả các đường dẫn nối bằng xuống dòng', () => {
    const item = store.addFiles(['C:\\a.txt', 'C:\\b.txt']);
    expect(store.full(item.id)).toBe('C:\\a.txt\nC:\\b.txt');
  });

  it('tìm kiếm thấy được đường dẫn file', () => {
    const item = store.addFiles(['C:\\duan\\baocao.docx']);
    expect(store.search('baocao')).toHaveProperty(item.id);
  });

  it('danh sách rỗng thì bỏ qua', () => {
    expect(store.addFiles([])).toBeNull();
    expect(store.addFiles(null)).toBeNull();
    expect(store.addFiles(['', '  '])).not.toBeNull(); // '  ' vẫn là chuỗi có nội dung
  });

  it('cùng bộ file copy lại thì đẩy lên đầu, không nhân bản', () => {
    store.addFiles(['C:\\a.txt']);
    store.addText('xen giữa');
    store.addFiles(['C:\\a.txt']);
    expect(store.list()).toHaveLength(2);
  });
});

describe('sweepOrphanBlobs với nhiều loại file', () => {
  it('không xoá nhầm file .png của ảnh khi quét blob text', () => {
    const image = store.addImage({ png: png('keep'), thumb: png('keep-t'), width: 1, height: 1 });
    const long = store.addText('L'.repeat(70_000));

    store.sweepOrphanBlobs();

    expect(existsSync(blobPath(`${image.hash}.png`))).toBe(true);
    expect(existsSync(thumbPath(image.hash))).toBe(true);
    expect(existsSync(blobPath(`${long.hash}.txt`))).toBe(true);
  });

  it('vẫn dọn được file mồ côi ở cả hai thư mục', () => {
    store.addText('gì đó ngắn');
    writeFileSync(blobPath('mocoi.txt'), 'rác', 'utf8');
    writeFileSync(thumbPath('mocoi'), 'rác', 'utf8');

    store.sweepOrphanBlobs();

    expect(existsSync(blobPath('mocoi.txt'))).toBe(false);
    expect(existsSync(thumbPath('mocoi'))).toBe(false);
  });
});

describe('ghi xuống đĩa rồi nạp lại', () => {
  it('ảnh và danh sách file đều sống sót qua một lần khởi động lại', async () => {
    const image = store.addImage({ png: png('z'), thumb: png('z-t'), width: 9, height: 9 });
    const files = store.addFiles(['C:\\z.txt']);
    store.flush();

    const again = await loadStore(tmp);
    again.load();

    expect(again.list()).toHaveLength(2);
    expect(again.imageOf(image.id)).toEqual(png('z'));
    expect(again.full(files.id)).toBe('C:\\z.txt');
    store = again;
  });
});
