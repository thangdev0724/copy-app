/**
 * Nhận diện bí mật trong nội dung clipboard.
 *
 * Vì sao cần: cờ loại trừ của Windows (xem watcher.js) chỉ bắt được trình quản
 * lý mật khẩu nào CHỊU đặt cờ. Copy một API key từ trang web, từ terminal, từ
 * file .env — không có cờ nào cả, và nó nằm thẳng trong index.json.
 *
 * NGUYÊN TẮC CHỌN MẪU: chỉ nhận những thứ có dấu hiệu RIÊNG, gần như không thể
 * nhầm — tiền tố khoá API, header private key, số thẻ đã qua Luhn. Đoán mò dựa
 * trên "trông có vẻ ngẫu nhiên" là lặng lẽ vứt đi nội dung hợp lệ của người
 * dùng, mà họ không bao giờ biết vì sao. Vì thế mẫu entropy nằm riêng và mặc
 * định TẮT.
 */

/**
 * Mẫu bật sẵn. Mỗi mẫu phải đủ đặc trưng để một lần khớp gần như chắc chắn là
 * bí mật thật.
 */
export const BUILTIN = [
  { id: 'openai', label: 'Khoá API OpenAI', re: /\bsk-(?:proj-)?[A-Za-z0-9_-]{20,}/g },
  { id: 'github', label: 'Token GitHub', re: /\bgh[pousr]_[A-Za-z0-9]{20,}/g },
  { id: 'aws', label: 'Khoá AWS', re: /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/g },
  { id: 'google', label: 'Khoá API Google', re: /\bAIza[0-9A-Za-z_-]{35}\b/g },
  { id: 'slack', label: 'Token Slack', re: /\bxox[abprs]-[A-Za-z0-9-]{10,}/g },
  {
    id: 'jwt',
    label: 'JWT',
    re: /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]*/g
  },
  {
    id: 'privatekey',
    label: 'Private key',
    re: /-----BEGIN (?:[A-Z]+ )?PRIVATE KEY-----/g
  },
  {
    id: 'card',
    label: 'Số thẻ ngân hàng',
    re: /\b(?:\d[ -]?){13,19}\b/g,
    // Chuỗi 16 chữ số có thể là mã đơn hàng, mã vận đơn, số điện thoại nối
    // nhau… Luhn loại gần hết những thứ đó.
    verify: (match) => luhn(match.replace(/\D/g, ''))
  }
];

/**
 * Mẫu tuỳ chọn, MẶC ĐỊNH TẮT.
 *
 * Nó bắt được token của những dịch vụ không có tiền tố riêng, nhưng cũng bắt
 * nhầm mã băm, chuỗi base64, id ngẫu nhiên — nghĩa là lặng lẽ vứt đi nội dung
 * hợp lệ. Chỉ nên bật nếu bạn chấp nhận đánh đổi đó.
 */
export const OPTIONAL = [
  {
    id: 'entropy',
    label: 'Chuỗi ngẫu nhiên dài',
    re: /\b[A-Za-z0-9+/_-]{32,}\b/g,
    // Đòi cả chữ hoa, chữ thường VÀ chữ số: mã băm hex hay base64 của text
    // thường thiếu ít nhất một loại.
    verify: (match) =>
      /[a-z]/.test(match) && /[A-Z]/.test(match) && /\d/.test(match) && entropy(match) > 3.5
  }
];

const ALL = [...BUILTIN, ...OPTIONAL];

/**
 * Quét text, trả về danh sách loại bí mật tìm thấy.
 *
 * @param {string} text
 * @param {string[]} enabledIds - id các mẫu đang bật
 * @returns {{id: string, label: string, count: number}[]}
 */
export function scan(text, enabledIds) {
  const value = String(text ?? '');
  if (!value) return [];

  const active = new Set(enabledIds ?? BUILTIN.map((p) => p.id));
  const found = [];

  for (const pattern of ALL) {
    if (!active.has(pattern.id)) continue;

    // Regex có cờ /g mang trạng thái lastIndex — phải reset, không thì lần quét
    // sau bắt đầu từ giữa chuỗi và bỏ sót.
    pattern.re.lastIndex = 0;
    const matches = value.match(pattern.re) ?? [];
    const real = pattern.verify ? matches.filter(pattern.verify) : matches;
    if (real.length) found.push({ id: pattern.id, label: pattern.label, count: real.length });
  }
  return found;
}

/** Thay mọi chỗ khớp bằng ký hiệu che, giữ nguyên phần còn lại của text. */
export function mask(text, enabledIds) {
  const active = new Set(enabledIds ?? BUILTIN.map((p) => p.id));
  let out = String(text ?? '');

  for (const pattern of ALL) {
    if (!active.has(pattern.id)) continue;
    pattern.re.lastIndex = 0;
    out = out.replace(pattern.re, (match) => {
      if (pattern.verify && !pattern.verify(match)) return match;
      return `[đã che: ${pattern.label}]`;
    });
  }
  return out;
}

export const DEFAULT_PATTERN_IDS = BUILTIN.map((p) => p.id);
export const ALL_PATTERNS = ALL.map(({ id, label }) => ({ id, label }));

/* ------------------------------------------------------------- phụ trợ */

/** Kiểm tra Luhn — thuật toán mọi số thẻ ngân hàng thật đều thoả. */
function luhn(digits) {
  if (digits.length < 13 || digits.length > 19) return false;

  let sum = 0;
  let double = false;
  for (let i = digits.length - 1; i >= 0; i--) {
    let n = digits.charCodeAt(i) - 48;
    if (double) {
      n *= 2;
      if (n > 9) n -= 9;
    }
    sum += n;
    double = !double;
  }
  return sum % 10 === 0;
}

/** Entropy Shannon, tính bằng bit trên mỗi ký tự. */
function entropy(text) {
  const counts = new Map();
  for (const ch of text) counts.set(ch, (counts.get(ch) ?? 0) + 1);

  let bits = 0;
  for (const count of counts.values()) {
    const p = count / text.length;
    bits -= p * Math.log2(p);
  }
  return bits;
}
