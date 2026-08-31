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

const LONG = (filler, needle = '') =>
  filler.repeat(70_000) + needle + filler.repeat(1_000);

let tmp;
let store;

beforeEach(async () => {
  tmp = mkdtempSync(join(tmpdir(), 'clipfull-search-'));
  store = await loadStore(tmp);
  store.load();
});

afterEach(() => {
  store.flush();
  rmSync(tmp, { recursive: true, force: true });
});

describe('search', () => {
  it('chuỗi rỗng nghĩa là không lọc gì cả', () => {
    store.addText('bất kỳ');
    expect(store.search('')).toBeNull();
    expect(store.search('   ')).toBeNull();
  });

  it('không mục nào khớp thì trả object rỗng, không phải null', () => {
    store.addText('xin chào');
    expect(store.search('không có đâu')).toEqual({});
  });

  it('không phân biệt hoa thường', () => {
    const item = store.addText('Xin Chào Thế Giới');
    expect(store.search('chào')).toHaveProperty(item.id);
    expect(store.search('CHÀO')).toHaveProperty(item.id);
  });

  it('đếm đúng số lần khớp và vị trí đầu tiên', () => {
    const item = store.addText('aa bb aa cc aa');
    expect(store.search('aa')[item.id]).toEqual({ count: 3, firstIndex: 0 });
  });

  it('cụm chồng nhau chỉ tính một lần: "aa" trong "aaaa" là 2', () => {
    const item = store.addText('aaaa');
    expect(store.search('aa')[item.id].count).toBe(2);
  });

  it('TÌM ĐƯỢC chuỗi nằm ngoài 400 ký tự preview của mục dài', () => {
    // Đây chính là lỗ hổng của v1: lọc theo preview thì mục này không bao giờ hiện.
    const item = store.addText(LONG('a', 'KIMCUONG'));
    expect(item.inline).toBeUndefined(); // đã ra blob thật
    expect(item.preview).not.toContain('KIMCUONG');

    const hits = store.search('kimcuong');
    expect(hits[item.id]).toMatchObject({ count: 1 });
  });

  it('tìm được chuỗi nằm ngoài preview của mục NGẮN (nằm inline)', () => {
    const text = 'x'.repeat(500) + 'VIENNGOC';
    const item = store.addText(text);
    expect(typeof item.inline).toBe('string');
    expect(item.preview).not.toContain('VIENNGOC');

    expect(store.search('vienngoc')[item.id]).toMatchObject({ count: 1 });
  });

  it('chuỗi ngắn hơn 3 ký tự thì không mở blob — chỉ dựa vào preview', () => {
    const item = store.addText(LONG('a', 'ZZ'));
    // 'zz' chỉ có ở sâu trong blob, mà 2 ký tự thì dưới ngưỡng đọc file.
    expect(store.search('zz')).toEqual({});
    // Đủ 3 ký tự thì mở file và thấy.
    expect(store.search('aaa')).toHaveProperty(item.id);
  });

  it('mục đã xoá không còn trong kết quả', () => {
    const item = store.addText('tìm thấy tôi');
    expect(store.search('tìm thấy')).toHaveProperty(item.id);
    store.remove(item.id);
    expect(store.search('tìm thấy')).toEqual({});
  });
});

describe('cache của search', () => {
  it('đọc lại cùng một mục không phình bộ nhớ thêm lần nữa', async () => {
    const { cacheStats, resetCache } = await import('../src/main/search.js');
    resetCache();

    store.addText(LONG('a', 'MOC'));
    store.search('moc');
    const first = cacheStats();

    store.search('moc');
    store.search('aaa');
    expect(cacheStats()).toEqual(first);
  });
});
