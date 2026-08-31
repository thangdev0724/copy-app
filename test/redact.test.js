import { describe, it, expect } from 'vitest';
import { scan, mask, DEFAULT_PATTERN_IDS, ALL_PATTERNS } from '../src/main/redact.js';

const ids = (text, patterns) => scan(text, patterns).map((f) => f.id);

describe('scan — mẫu bật sẵn', () => {
  it('bắt được khoá OpenAI', () => {
    expect(ids('OPENAI_KEY=sk-proj-abcdefghij1234567890XYZ')).toContain('openai');
  });

  it('bắt được token GitHub', () => {
    expect(ids('ghp_abcdefghijklmnopqrstuvwxyz0123456789')).toContain('github');
  });

  it('bắt được khoá AWS', () => {
    expect(ids('AKIAIOSFODNN7EXAMPLE')).toContain('aws');
  });

  it('bắt được header private key', () => {
    expect(ids('-----BEGIN RSA PRIVATE KEY-----\nMII...')).toContain('privatekey');
  });

  it('bắt được JWT', () => {
    expect(ids('eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjMifQ.abcdef')).toContain('jwt');
  });

  it('đếm được nhiều lần xuất hiện', () => {
    const text = 'AKIAIOSFODNN7EXAMPLE và AKIAIOSFODNN7EXAMPLB';
    expect(scan(text).find((f) => f.id === 'aws').count).toBe(2);
  });
});

describe('scan — số thẻ phải qua Luhn', () => {
  it('số thẻ thật (thoả Luhn) thì bắt', () => {
    expect(ids('4111 1111 1111 1111')).toContain('card');
  });

  it('chuỗi 16 chữ số KHÔNG thoả Luhn thì bỏ qua — mã đơn hàng, mã vận đơn…', () => {
    expect(ids('1234567890123456')).not.toContain('card');
  });
});

describe('scan — không bắt nhầm nội dung bình thường', () => {
  it.each([
    'Hôm nay trời đẹp, tôi đi chợ mua rau và thịt.',
    'const x = 1;\nfunction hello() { return x; }',
    'https://example.com/duong-dan/rat-dai?tham=so&khac=nua',
    'SELECT id, ten FROM nguoi_dung WHERE tuoi > 18',
    '{"ten": "An", "tuoi": 30, "thanhpho": "Ha Noi"}',
    'a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2' // mã băm git, toàn chữ thường
  ])('không báo động với: %s', (text) => {
    expect(scan(text)).toEqual([]);
  });
});

describe('mẫu entropy — mặc định TẮT', () => {
  const random = 'aZ3kP9mQ7xL2vB8nR4tY6wS1dF5gH0jK';

  it('không nằm trong danh sách bật sẵn', () => {
    expect(DEFAULT_PATTERN_IDS).not.toContain('entropy');
    expect(scan(random)).toEqual([]);
  });

  it('bật lên thì bắt được chuỗi ngẫu nhiên dài', () => {
    expect(ids(random, [...DEFAULT_PATTERN_IDS, 'entropy'])).toContain('entropy');
  });

  it('vẫn nằm trong danh sách mẫu để giao diện bày ra cho người dùng chọn', () => {
    expect(ALL_PATTERNS.map((p) => p.id)).toContain('entropy');
  });
});

describe('mask', () => {
  it('thay bí mật bằng nhãn, giữ nguyên phần còn lại', () => {
    const masked = mask('key=AKIAIOSFODNN7EXAMPLE xong');
    expect(masked).not.toContain('AKIAIOSFODNN7EXAMPLE');
    expect(masked).toContain('key=');
    expect(masked).toContain('xong');
  });

  it('không đụng vào text không chứa bí mật', () => {
    const clean = 'chỉ là một câu bình thường';
    expect(mask(clean)).toBe(clean);
  });

  it('số không thoả Luhn thì không bị che', () => {
    expect(mask('1234567890123456')).toBe('1234567890123456');
  });
});

describe('regex dùng cờ /g không được mang trạng thái sang lần quét sau', () => {
  it('quét cùng một chuỗi hai lần cho kết quả giống hệt nhau', () => {
    const text = 'AKIAIOSFODNN7EXAMPLE';
    expect(scan(text)).toEqual(scan(text));
    expect(mask(text)).toBe(mask(text));
  });
});
