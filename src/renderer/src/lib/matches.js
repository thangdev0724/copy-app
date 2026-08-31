/**
 * Cắt một đoạn text thành các mảnh "khớp" / "không khớp" để tô sáng.
 *
 * Trả về MẢNG chứ không trả về chuỗi HTML — chỗ gọi render bằng {#each} và để
 * Svelte tự escape. Nội dung clipboard là dữ liệu hoàn toàn không kiểm soát
 * được; nối chuỗi HTML ở đây là mở cửa cho nó chạy như mã.
 */

/** Trần số vệt tô. Log 5MB toàn chữ "e" mà tô hết là dựng vài trăm nghìn node. */
const MAX_MATCHES = 2000;

export function findMatches(text, query, limit = MAX_MATCHES) {
  const needle = String(query ?? '')
    .trim()
    .toLowerCase();
  if (!needle || typeof text !== 'string') return [];

  const hay = text.toLowerCase();

  // Vài ký tự Unicode đổi độ dài khi viết thường (ví dụ 'İ' -> 2 ký tự). Lúc đó
  // chỉ số trong `hay` không còn ứng với `text` nữa, tô sẽ lệch sang ký tự khác.
  // Thà không tô còn hơn tô sai chỗ.
  if (hay.length !== text.length) return [];

  const found = [];
  let at = hay.indexOf(needle);
  while (at !== -1 && found.length < limit) {
    found.push({ start: at, end: at + needle.length });
    at = hay.indexOf(needle, at + needle.length);
  }
  return found;
}

/**
 * Ghép text + vị trí khớp thành danh sách mảnh liền mạch.
 *
 * Mảnh khớp mang sẵn `hitIndex` (thứ tự trong số các vệt tô) để phần điều hướng
 * F3 biết đang đứng ở vệt nào. Tính ngay tại đây vì đằng nào cũng đang duyệt
 * một lượt — để component tự dò lại là biến việc O(n) thành O(n²).
 */
export function toSegments(text, matches) {
  if (!matches.length) return [{ text, hit: false }];

  const segments = [];
  let at = 0;
  let hitIndex = 0;
  for (const { start, end } of matches) {
    if (start > at) segments.push({ text: text.slice(at, start), hit: false });
    segments.push({ text: text.slice(start, end), hit: true, hitIndex: hitIndex++ });
    at = end;
  }
  if (at < text.length) segments.push({ text: text.slice(at), hit: false });
  return segments;
}
