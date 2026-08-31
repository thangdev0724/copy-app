import { describe, it, expect } from 'vitest';
import { findMatches, toSegments } from '../src/renderer/src/lib/matches.js';

describe('findMatches', () => {
  it('chuỗi rỗng thì không có vệt tô nào', () => {
    expect(findMatches('abc', '')).toEqual([]);
    expect(findMatches('abc', '   ')).toEqual([]);
  });

  it('tìm mọi lần xuất hiện, không phân biệt hoa thường', () => {
    expect(findMatches('Ba BA ba', 'ba')).toEqual([
      { start: 0, end: 2 },
      { start: 3, end: 5 },
      { start: 6, end: 8 }
    ]);
  });

  it('không đếm chồng lấn', () => {
    expect(findMatches('aaaa', 'aa')).toEqual([
      { start: 0, end: 2 },
      { start: 2, end: 4 }
    ]);
  });

  it('tôn trọng giới hạn số vệt tô', () => {
    expect(findMatches('a'.repeat(100), 'a', 5)).toHaveLength(5);
  });

  it('bỏ tô khi viết thường làm đổi độ dài chuỗi — thà không tô còn hơn tô lệch', () => {
    // 'İ'.toLowerCase() dài 2 ký tự, nên mọi chỉ số sau nó đều lệch.
    const text = 'İxyz';
    expect(text.toLowerCase().length).not.toBe(text.length);
    expect(findMatches(text, 'xyz')).toEqual([]);
  });
});

describe('toSegments', () => {
  it('không khớp thì trả nguyên một mảnh', () => {
    expect(toSegments('abc', [])).toEqual([{ text: 'abc', hit: false }]);
  });

  it('ghép lại đúng bằng chuỗi gốc', () => {
    const text = 'con mèo ngồi trên con chó';
    const segments = toSegments(text, findMatches(text, 'con'));
    expect(segments.map((s) => s.text).join('')).toBe(text);
  });

  it('đánh số thứ tự cho từng vệt tô, bỏ qua mảnh thường', () => {
    const text = 'x ab y ab';
    const segments = toSegments(text, findMatches(text, 'ab'));
    expect(segments.filter((s) => s.hit).map((s) => s.hitIndex)).toEqual([0, 1]);
  });

  it('khớp ngay đầu và ngay cuối cũng ghép đúng', () => {
    const text = 'abXab';
    const segments = toSegments(text, findMatches(text, 'ab'));
    expect(segments).toEqual([
      { text: 'ab', hit: true, hitIndex: 0 },
      { text: 'X', hit: false },
      { text: 'ab', hit: true, hitIndex: 1 }
    ]);
  });
});
