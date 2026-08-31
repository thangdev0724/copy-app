import { describe, it, expect } from 'vitest';
import { repoSlug, isNewer } from '../src/main/update.js';

describe('repoSlug', () => {
  it('đọc được các dạng URL GitHub thường gặp', () => {
    const cases = [
      'https://github.com/ai-do/clipfull',
      'https://github.com/ai-do/clipfull.git',
      'https://github.com/ai-do/clipfull/',
      'git+https://github.com/ai-do/clipfull.git',
      { type: 'git', url: 'https://github.com/ai-do/clipfull.git' }
    ];
    for (const input of cases) {
      expect(repoSlug(input)).toBe('ai-do/clipfull');
    }
  });

  it('chưa cấu hình thì trả null — mọi thứ còn lại thành no-op', () => {
    expect(repoSlug(undefined)).toBeNull();
    expect(repoSlug(null)).toBeNull();
    expect(repoSlug({})).toBeNull();
    expect(repoSlug('')).toBeNull();
  });

  it('không phải GitHub thì không nhận', () => {
    expect(repoSlug('https://gitlab.com/ai-do/clipfull')).toBeNull();
  });
});

describe('isNewer', () => {
  it('so đúng theo từng bậc major.minor.patch', () => {
    expect(isNewer('2.0.1', '2.0.0')).toBe(true);
    expect(isNewer('2.1.0', '2.0.9')).toBe(true);
    expect(isNewer('3.0.0', '2.9.9')).toBe(true);
  });

  it('bằng nhau hoặc cũ hơn thì không báo', () => {
    expect(isNewer('2.0.0', '2.0.0')).toBe(false);
    expect(isNewer('1.9.9', '2.0.0')).toBe(false);
    expect(isNewer('2.0.0', '2.0.1')).toBe(false);
  });

  it('bỏ qua tiền tố v', () => {
    expect(isNewer('v2.0.1', '2.0.0')).toBe(true);
    expect(isNewer('v2.0.0', 'v2.0.0')).toBe(false);
  });

  it('10 lớn hơn 9 — so theo số chứ không so theo chuỗi', () => {
    expect(isNewer('2.10.0', '2.9.0')).toBe(true);
    expect(isNewer('2.9.0', '2.10.0')).toBe(false);
  });

  it('bỏ hậu tố pre-release và build', () => {
    expect(isNewer('2.0.1-beta.1', '2.0.0')).toBe(true);
    expect(isNewer('2.0.0+build9', '2.0.0')).toBe(false);
  });

  it('chuỗi rác không làm nó báo bừa', () => {
    expect(isNewer('không phải phiên bản', '2.0.0')).toBe(false);
    expect(isNewer(undefined, '2.0.0')).toBe(false);
    expect(isNewer(null, '2.0.0')).toBe(false);
  });

  it('thiếu bậc thì coi như 0', () => {
    expect(isNewer('2.1', '2.0.5')).toBe(true);
    expect(isNewer('2', '2.0.0')).toBe(false);
  });
});
