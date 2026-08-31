/**
 * Biến đổi nhanh nội dung trước khi copy.
 *
 * Ý tưởng: ghép clipboard manager với mấy thao tác text mà người ta vẫn phải mở
 * tab khác để làm — format JSON, gỡ hard-wrap, decode base64. Đúng ngữ cảnh,
 * đúng lúc, vì nội dung đã nằm sẵn trước mắt.
 *
 * Mọi hàm ở đây là hàm THUẦN và KHÔNG bao giờ ném lỗi: hỏng thì trả về null để
 * chỗ gọi tắt nút đi. Bản gốc trong lịch sử không bao giờ bị đụng tới.
 */

// no-control-regex tat co chu dich: muon xoa ma mau cua terminal thi bat buoc
// phai khop dung ky tu ESC. Day chinh la viec can lam, khong phai so suat.
// eslint-disable-next-line no-control-regex
const ANSI = /\u001B\[[0-9;?]*[A-Za-z]/g;

/** Gỡ xuống dòng cứng của email/PDF, nhưng giữ ranh giới đoạn văn. */
export function joinLines(text) {
  return text
    .split(/\n[ \t]*\n/)
    .map((paragraph) =>
      paragraph
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean)
        .join(' ')
    )
    .filter(Boolean)
    .join('\n\n');
}

export function dropBlankLines(text) {
  return text
    .split('\n')
    .filter((line) => line.trim())
    .join('\n');
}

export function stripAnsi(text) {
  return text.replace(ANSI, '');
}

export function collapseSpaces(text) {
  return text
    .split('\n')
    .map((line) => line.replace(/[ \t]+/g, ' ').trim())
    .join('\n');
}

export function formatJson(text) {
  try {
    return JSON.stringify(JSON.parse(text), null, 2);
  } catch {
    return null;
  }
}

export function minifyJson(text) {
  try {
    return JSON.stringify(JSON.parse(text));
  } catch {
    return null;
  }
}

export function decodeUri(text) {
  try {
    // '+' là dấu cách trong query string, decodeURIComponent không biết chuyện đó.
    return decodeURIComponent(text.replace(/\+/g, ' '));
  } catch {
    return null; // chuỗi có '%' lạc lõng
  }
}

export function decodeBase64(text) {
  const compact = text.replace(/\s+/g, '');
  if (!compact || !/^[A-Za-z0-9+/_-]*={0,2}$/.test(compact)) return null;
  try {
    const base64 = compact.replace(/-/g, '+').replace(/_/g, '/');
    const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4);
    const bytes = Uint8Array.from(atob(padded), (c) => c.charCodeAt(0));
    const decoded = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    // Decode ra một mớ ký tự điều khiển nghĩa là dữ liệu nhị phân, không phải
    // text — hiện ra chỉ tổ rác màn hình.
    // eslint-disable-next-line no-control-regex
    return /[\u0000-\u0008\u000E-\u001F]/.test(decoded) ? null : decoded;
  } catch {
    return null;
  }
}

/**
 * Bảng biến đổi cho thanh nút. Thứ tự ở đây là thứ tự nút hiện ra.
 *
 * Nút nào hiện thì do availableFor() quyết định — bày "Format JSON" trên một
 * đoạn văn xuôi chỉ làm rối mắt.
 */
export const TRANSFORMS = [
  { id: 'trim', label: 'Trim', apply: (text) => text.trim() },
  { id: 'joinLines', label: 'Nối dòng', apply: joinLines },
  { id: 'dropBlankLines', label: 'Bỏ dòng trống', apply: dropBlankLines },
  { id: 'collapseSpaces', label: 'Gộp khoảng trắng', apply: collapseSpaces },
  { id: 'formatJson', label: 'Format JSON', apply: formatJson },
  { id: 'minifyJson', label: 'Nén JSON', apply: minifyJson },
  { id: 'decodeUri', label: 'Decode URL', apply: decodeUri },
  { id: 'decodeBase64', label: 'Decode base64', apply: stripThenDecodeBase64 },
  { id: 'stripAnsi', label: 'Xoá màu ANSI', apply: stripAnsi }
];

function stripThenDecodeBase64(text) {
  return decodeBase64(text.trim());
}

/**
 * Trên ngưỡng này thì chỉ thử trên phần đầu để quyết định hiện nút hay không.
 * Chạy cả 9 phép biến đổi lên một file log 5MB chỉ để vẽ thanh nút là việc
 * người dùng phải chờ mà chẳng nhận lại gì.
 */
const PROBE_LIMIT = 256 * 1024;
const PROBE_SAMPLE = 64 * 1024;

/**
 * Những phép biến đổi thật sự có tác dụng lên đoạn text này.
 *
 * Với text rất dài, quyết định dựa trên phần đầu — nên đôi khi một nút hiện ra
 * mà bấm vào không đổi gì. Phiền hơn hẳn chiều ngược lại: bắt người dùng chờ
 * mỗi lần chọn một mục.
 */
export function availableFor(text) {
  if (typeof text !== 'string' || !text) return [];
  const probe = text.length > PROBE_LIMIT ? text.slice(0, PROBE_SAMPLE) : text;

  return TRANSFORMS.filter((transform) => {
    const result = transform.apply(probe);
    return typeof result === 'string' && result !== probe && result.length > 0;
  });
}
