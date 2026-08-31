import { describe, it, expect } from 'vitest';
import { diffLines, summarize } from '../src/renderer/src/lib/diff.js';

/** Dựng lại từng bên từ kết quả diff — bất biến quan trọng nhất của thuật toán. */
function rebuild(rows) {
  return {
    left: rows
      .filter((r) => r.left !== null)
      .map((r) => r.left)
      .join('\n'),
    right: rows
      .filter((r) => r.right !== null)
      .map((r) => r.right)
      .join('\n')
  };
}

describe('diffLines', () => {
  it('hai bản giống hệt thì không có dòng nào thêm hay bớt', () => {
    const { rows } = diffLines('a\nb\nc', 'a\nb\nc');
    expect(summarize(rows)).toEqual({ added: 0, removed: 0, same: 3 });
  });

  it('đổi một dòng ở giữa thì chỉ đánh dấu đúng dòng đó', () => {
    const { rows } = diffLines('a\nb\nc', 'a\nX\nc');
    const stats = summarize(rows);
    expect(stats.added).toBe(1);
    expect(stats.removed).toBe(1);
    expect(stats.same).toBe(2);
    expect(rows.find((r) => r.type === 'del').left).toBe('b');
    expect(rows.find((r) => r.type === 'add').right).toBe('X');
  });

  it('thêm dòng vào cuối', () => {
    const { rows } = diffLines('a\nb', 'a\nb\nc');
    expect(summarize(rows)).toEqual({ added: 1, removed: 0, same: 2 });
  });

  it('xoá dòng ở đầu', () => {
    const { rows } = diffLines('a\nb\nc', 'b\nc');
    expect(summarize(rows)).toEqual({ added: 0, removed: 1, same: 2 });
  });

  it('luôn dựng lại được nguyên vẹn cả hai bên', () => {
    const cases = [
      ['a\nb\nc', 'a\nX\nc'],
      ['', 'a\nb'],
      ['a\nb', ''],
      ['a\nb\nc\nd\ne', 'a\nc\ne\nf'],
      ['một\nhai\nba', 'một\nhai\nba'],
      ['x', 'y']
    ];
    for (const [left, right] of cases) {
      const { rows } = diffLines(left, right);
      expect(rebuild(rows)).toEqual({ left, right });
    }
  });

  it('đánh số dòng liên tục cho từng bên', () => {
    const { rows } = diffLines('a\nb\nc', 'a\nX\nc');
    const leftNos = rows.filter((r) => r.leftNo !== null).map((r) => r.leftNo);
    const rightNos = rows.filter((r) => r.rightNo !== null).map((r) => r.rightNo);
    expect(leftNos).toEqual([1, 2, 3]);
    expect(rightNos).toEqual([1, 2, 3]);
  });

  it('hai bản rất dài nhưng gần giống nhau vẫn chạy nhanh', () => {
    // Đây chính là ca dùng thật: hai JSON response chỉ khác một field.
    const base = Array.from({ length: 8000 }, (_, i) => `dòng ${i}`);
    const changed = [...base];
    changed[4000] = 'dòng ĐÃ ĐỔI';

    const started = Date.now();
    const { rows } = diffLines(base.join('\n'), changed.join('\n'));
    const elapsed = Date.now() - started;

    expect(summarize(rows)).toMatchObject({ added: 1, removed: 1 });
    expect(elapsed).toBeLessThan(1000);
  });

  it('quá nhiều dòng thì từ chối thay vì treo panel', () => {
    const huge = Array.from({ length: 20_001 }, (_, i) => String(i)).join('\n');
    expect(diffLines(huge, 'a')).toHaveProperty('tooBig');
  });

  it('khác nhau hoàn toàn và quá dài thì báo không so sánh được', () => {
    const left = Array.from({ length: 3000 }, (_, i) => `trái ${i}`).join('\n');
    const right = Array.from({ length: 3000 }, (_, i) => `phải ${i}`).join('\n');
    expect(diffLines(left, right)).toHaveProperty('tooBig');
  });

  it('chuỗi rỗng ở cả hai bên không làm vỡ gì', () => {
    const { rows } = diffLines('', '');
    expect(rebuild(rows)).toEqual({ left: '', right: '' });
  });
});
