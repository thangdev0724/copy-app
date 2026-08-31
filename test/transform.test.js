import { describe, it, expect } from 'vitest';
import {
  joinLines,
  dropBlankLines,
  stripAnsi,
  collapseSpaces,
  formatJson,
  minifyJson,
  decodeUri,
  decodeBase64,
  availableFor
} from '../src/renderer/src/lib/transform.js';

describe('joinLines', () => {
  it('gỡ hard-wrap trong một đoạn', () => {
    expect(joinLines('Câu này bị\ncắt làm hai dòng.')).toBe('Câu này bị cắt làm hai dòng.');
  });

  it('giữ ranh giới đoạn văn', () => {
    expect(joinLines('Đoạn một\nnối lại.\n\nĐoạn hai.')).toBe('Đoạn một nối lại.\n\nĐoạn hai.');
  });
});

describe('dropBlankLines', () => {
  it('bỏ dòng trống và dòng chỉ có khoảng trắng', () => {
    expect(dropBlankLines('a\n\n  \nb')).toBe('a\nb');
  });
});

describe('stripAnsi', () => {
  // ESC viết bằng fromCharCode: ký tự điều khiển thô nằm trong source thì vô
  // hình trong diff và dễ bị editor nuốt mất.
  const ESC = String.fromCharCode(27);

  it('xoá mã màu của terminal, giữ nguyên chữ', () => {
    expect(stripAnsi(`${ESC}[31mlỗi${ESC}[0m rồi`)).toBe('lỗi rồi');
  });

  it('không đụng vào text không có mã màu', () => {
    expect(stripAnsi('bình thường')).toBe('bình thường');
  });
});

describe('collapseSpaces', () => {
  it('gộp khoảng trắng thừa từng dòng', () => {
    expect(collapseSpaces('  a    b  \n  c ')).toBe('a b\nc');
  });
});

describe('JSON', () => {
  it('format ra dạng thụt lề', () => {
    expect(formatJson('{"a":1}')).toBe('{\n  "a": 1\n}');
  });

  it('nén lại một dòng', () => {
    expect(minifyJson('{\n  "a": 1\n}')).toBe('{"a":1}');
  });

  it('JSON hỏng trả null chứ không ném lỗi', () => {
    expect(formatJson('{a}')).toBeNull();
    expect(minifyJson('nope')).toBeNull();
  });
});

describe('decodeUri', () => {
  it('decode phần trăm và dấu cộng thành khoảng trắng', () => {
    expect(decodeUri('xin%20chao+ban')).toBe('xin chao ban');
  });

  it('phần trăm lạc lõng trả null chứ không ném lỗi', () => {
    expect(decodeUri('100% chac chan')).toBeNull();
  });
});

describe('decodeBase64', () => {
  it('decode chuỗi base64 hợp lệ, kể cả tiếng Việt', () => {
    const encoded = Buffer.from('xin chào', 'utf8').toString('base64');
    expect(decodeBase64(encoded)).toBe('xin chào');
  });

  it('base64url dùng - và _ cũng decode được', () => {
    const encoded = Buffer.from('a?b>c', 'utf8')
      .toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_');
    expect(decodeBase64(encoded)).toBe('a?b>c');
  });

  it('chuỗi thường không phải base64 thì trả null', () => {
    expect(decodeBase64('xin chào!')).toBeNull();
  });

  it('decode ra dữ liệu nhị phân thì từ chối, đừng rác màn hình', () => {
    const binary = Buffer.from([0, 1, 2, 3, 4, 5, 6, 7]).toString('base64');
    expect(decodeBase64(binary)).toBeNull();
  });
});

describe('availableFor', () => {
  it('văn xuôi sạch thì không bày nút format JSON hay trim', () => {
    const ids = availableFor('Một câu hoàn chỉnh.').map((t) => t.id);
    expect(ids).not.toContain('formatJson');
    expect(ids).not.toContain('trim');
  });

  it('JSON một dòng thì có nút format', () => {
    expect(availableFor('{"a":1}').map((t) => t.id)).toContain('formatJson');
  });

  it('text có khoảng trắng thừa hai đầu thì có nút trim', () => {
    expect(availableFor('  a  ').map((t) => t.id)).toContain('trim');
  });

  it('không bao giờ ném lỗi dù đưa vào gì', () => {
    for (const input of ['', '%%%', ' ', '{[', 'a'.repeat(1000)]) {
      expect(() => availableFor(input)).not.toThrow();
    }
  });
});
