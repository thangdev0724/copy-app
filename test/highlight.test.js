import { describe, it, expect } from 'vitest';
import { tokenize, tokenizeLines, SUPPORTED } from '../src/renderer/src/lib/highlight.js';

const joined = (tokens) => tokens.map((t) => t.text).join('');

const SAMPLES = [
  'const x = "a"; // ghi chú\nfunction f() {}',
  '{"key": "value", "n": 1, "ok": true}',
  'def f(x):\n    # ghi chú\n    return "a"',
  'SELECT a FROM t WHERE b = 1 -- ghi chú',
  '<!doctype html>\n<div class="a">x</div>',
  '.a { color: #fff; width: 10px; }',
  '#!/bin/bash\necho "$HOME" --flag',
  '# Tiêu đề\n- mục\n`code`'
];

describe('tokenize', () => {
  it('ngôn ngữ không biết thì trả nguyên một token không màu', () => {
    expect(tokenize('bất kỳ', 'klingon')).toEqual([{ text: 'bất kỳ', type: null }]);
  });

  it.each(SUPPORTED)('ghép token lại đúng bằng chuỗi gốc — %s', (lang) => {
    for (const sample of SAMPLES) {
      expect(joined(tokenize(sample, lang))).toBe(sample);
    }
  });

  it('nhận ra từ khoá và chuỗi trong js', () => {
    const tokens = tokenize('const a = "x";', 'js');
    expect(tokens.find((t) => t.text === 'const')?.type).toBe('keyword');
    expect(tokens.find((t) => t.text === '"x"')?.type).toBe('string');
  });

  it('phân biệt khoá và giá trị trong json', () => {
    const tokens = tokenize('{"a": "b"}', 'json');
    expect(tokens.find((t) => t.text === '"a"')?.type).toBe('key');
    expect(tokens.find((t) => t.text === '"b"')?.type).toBe('string');
  });

  it('text quá dài thì bỏ tô màu thay vì làm treo panel', () => {
    const huge = 'const x = 1;\n'.repeat(20_000);
    const tokens = tokenize(huge, 'js');
    expect(tokens).toHaveLength(1);
    expect(tokens[0].type).toBeNull();
  });

  it('không luật nào dùng nhóm bắt — nhóm bắt lạc vào là lệch cả bảng màu', () => {
    // Ánh xạ nhóm regex -> loại token sẽ trượt nếu có nhóm bắt thừa, và token
    // nhận sai loại. Kiểm gián tiếp: token đầu của mỗi mẫu phải đúng loại.
    expect(tokenize('// hi', 'js')[0].type).toBe('comment');
    expect(tokenize('-- hi', 'sql')[0].type).toBe('comment');
    expect(tokenize('# hi', 'python')[0].type).toBe('comment');
    expect(tokenize('/* hi */', 'css')[0].type).toBe('comment');
    expect(tokenize('<!-- hi -->', 'html')[0].type).toBe('comment');
  });

  it('không kẹt vòng lặp với chuỗi rỗng hay chỉ có xuống dòng', () => {
    for (const lang of SUPPORTED) {
      expect(() => tokenize('', lang)).not.toThrow();
      expect(() => tokenize('\n\n\n', lang)).not.toThrow();
    }
  });
});

describe('tokenizeLines', () => {
  it('cắt theo dòng, giữ đúng số dòng', () => {
    const lines = tokenizeLines('const a = 1;\nconst b = 2;\n\nconst c = 3;', 'js');
    expect(lines).toHaveLength(4);
    expect(lines[2]).toEqual([]); // dòng trống
  });

  it('chuỗi nhiều dòng không bị vỡ token ở chỗ xuống dòng', () => {
    const lines = tokenizeLines('const a = `một\nhai`;', 'js');
    expect(lines).toHaveLength(2);
    // Cả hai mảnh của template string đều phải mang loại 'string'.
    expect(lines[0].some((t) => t.type === 'string')).toBe(true);
    expect(lines[1].some((t) => t.type === 'string')).toBe(true);
  });

  it('ghép mọi dòng lại đúng bằng chuỗi gốc', () => {
    const text = 'a\nbb\n\nccc';
    const rebuilt = tokenizeLines(text, 'js')
      .map((line) => line.map((t) => t.text).join(''))
      .join('\n');
    expect(rebuilt).toBe(text);
  });
});
