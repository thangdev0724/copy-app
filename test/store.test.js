import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  mkdtempSync,
  mkdirSync,
  rmSync,
  existsSync,
  writeFileSync,
  readFileSync,
  readdirSync
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/**
 * store.js giữ trạng thái ở cấp module, nên mỗi test phải nạp lại module mới
 * thay vì dùng chung — không thì mục của test trước rơi sang test sau.
 */
async function loadStore(dataDir) {
  vi.resetModules();
  const electron = await import('./stubs/electron.js');
  electron.__setUserData(dataDir);
  return import('../src/main/store.js');
}

/** Trên ngưỡng INLINE_LIMIT (64KB) để buộc store tách ra file blob. */
const LONG = (ch) => ch.repeat(70_000);

let tmp;
let store;

const historyDir = () => join(tmp, 'history');
const blobPath = (hash) => join(historyDir(), 'blobs', `${hash}.txt`);

beforeEach(async () => {
  tmp = mkdtempSync(join(tmpdir(), 'clipfull-test-'));
  store = await loadStore(tmp);
  store.load();
});

afterEach(() => {
  store.flush(); // dọn timer đang treo, đừng để rò sang test sau
  rmSync(tmp, { recursive: true, force: true });
});

describe('addText', () => {
  it('bỏ qua chuỗi rỗng và chuỗi chỉ có khoảng trắng', () => {
    expect(store.addText('')).toBeNull();
    expect(store.addText('   \n\t ')).toBeNull();
    expect(store.list()).toHaveLength(0);
  });

  it('copy lại nội dung cũ thì đẩy lên đầu chứ không tạo bản trùng', () => {
    store.addText('một');
    store.addText('hai');
    store.addText('một');

    const list = store.list();
    expect(list).toHaveLength(2);
    expect(list[0].preview).toBe('một');
  });

  it('text ngắn nằm inline, không sinh file blob', () => {
    const item = store.addText('ngắn thôi');
    expect(existsSync(blobPath(item.hash))).toBe(false);
    expect(store.full(item.id)).toBe('ngắn thôi');
  });

  it('text dài ra blob riêng, và list() không mang theo toàn văn', () => {
    const text = LONG('A');
    const item = store.addText(text);

    expect(existsSync(blobPath(item.hash))).toBe(true);
    expect(store.full(item.id)).toBe(text);

    const [meta] = store.list();
    expect(meta.inline).toBeUndefined();
    expect(meta.preview).toHaveLength(400);
    expect(meta.chars).toBe(70_000);
  });
});

describe('list', () => {
  it('mục ghim luôn nằm trên', () => {
    store.addText('cũ');
    const pinned = store.addText('quan trọng');
    store.addText('mới nhất');
    store.togglePin(pinned.id);

    expect(store.list()[0].id).toBe(pinned.id);
  });
});

describe('remove', () => {
  it('xoá mục thì xoá luôn blob của nó', () => {
    const item = store.addText(LONG('A'));
    store.remove(item.id);

    expect(store.list()).toHaveLength(0);
    expect(existsSync(blobPath(item.hash))).toBe(false);
  });
});

describe('clear', () => {
  it('giữ mục ghim, xoá phần còn lại', () => {
    const pinned = store.addText('giữ');
    store.togglePin(pinned.id);
    store.addText('bỏ');

    store.clear();

    const list = store.list();
    expect(list).toHaveLength(1);
    expect(list[0].id).toBe(pinned.id);
  });

  it('xoá blob của mục bị dọn, giữ blob của mục ghim', () => {
    const dropped = store.addText(LONG('A'));
    const kept = store.addText(LONG('B'));
    store.togglePin(kept.id);

    store.clear();

    expect(existsSync(blobPath(dropped.hash))).toBe(false);
    expect(existsSync(blobPath(kept.hash))).toBe(true);
    expect(store.full(kept.id)).toBe(LONG('B'));
  });
});

describe('trim', () => {
  it('cắt bớt khi vượt maxItems', () => {
    store.setMaxItems(2);
    store.addText('một');
    store.addText('hai');
    store.addText('ba');

    const list = store.list();
    expect(list).toHaveLength(2);
    expect(list.map((i) => i.preview)).toEqual(['ba', 'hai']);
  });

  it('mục ghim không bị cắt dù vượt maxItems', () => {
    const pinned = store.addText('ghim');
    store.togglePin(pinned.id);
    store.addText('x');
    store.addText('y');

    store.setMaxItems(1);

    expect(store.list().map((i) => i.id)).toContain(pinned.id);
  });

  it('mục bị cắt thì blob của nó cũng phải biến mất', () => {
    store.setMaxItems(1);
    const dropped = store.addText(LONG('A'));
    store.addText(LONG('B'));

    expect(store.list()).toHaveLength(1);
    expect(existsSync(blobPath(dropped.hash))).toBe(false);
  });
});

describe('sweepOrphanBlobs', () => {
  it('xoá blob không còn mục nào trỏ tới', () => {
    mkdirSync(join(historyDir(), 'blobs'), { recursive: true });
    writeFileSync(blobPath('deadbeef'), 'rác sót lại', 'utf8');

    store.sweepOrphanBlobs();

    expect(existsSync(blobPath('deadbeef'))).toBe(false);
  });

  it('không đụng vào blob còn được dùng', () => {
    const item = store.addText(LONG('A'));
    store.sweepOrphanBlobs();
    expect(existsSync(blobPath(item.hash))).toBe(true);
  });
});

describe('load', () => {
  it('lần chạy đầu chưa có file thì không coi là hỏng', () => {
    expect(store.list()).toHaveLength(0);
    expect(store.takeLoadError()).toBeNull();
  });

  it('index hỏng thì backup lại rồi mới reset — không mất im lặng', async () => {
    const broken = '{ đây rõ ràng không phải JSON';
    mkdirSync(historyDir(), { recursive: true });
    writeFileSync(join(historyDir(), 'index.json'), broken, 'utf8');

    store = await loadStore(tmp);
    store.load();

    expect(store.list()).toHaveLength(0);

    const backups = readdirSync(historyDir()).filter((f) => f.startsWith('index.corrupt-'));
    expect(backups).toHaveLength(1);
    expect(readFileSync(join(historyDir(), backups[0]), 'utf8')).toBe(broken);
    expect(store.takeLoadError()).toMatchObject({ backup: expect.any(String) });
  });

  it('file rỗng thì reset lặng lẽ, không cần backup', async () => {
    mkdirSync(historyDir(), { recursive: true });
    writeFileSync(join(historyDir(), 'index.json'), '', 'utf8');

    store = await loadStore(tmp);
    store.load();

    expect(store.list()).toHaveLength(0);
    expect(store.takeLoadError()).toBeNull();
    expect(readdirSync(historyDir()).filter((f) => f.startsWith('index.corrupt-'))).toHaveLength(0);
  });

  it('ghi xuống đĩa rồi nạp lại thì còn nguyên, kể cả blob', async () => {
    store.addText('mục ngắn');
    const long = store.addText(LONG('A'));
    store.flush();

    const again = await loadStore(tmp);
    again.load();

    expect(again.list()).toHaveLength(2);
    expect(again.full(long.id)).toBe(LONG('A'));
    store = again;
  });
});
