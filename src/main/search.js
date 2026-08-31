/**
 * Phần đếm khớp cho tìm kiếm toàn văn.
 *
 * Tách khỏi store.js vì hai lý do: nó là logic thuần (test được mà không cần
 * đĩa), và nó giữ một cache riêng có ngân sách bộ nhớ — thứ không nên trộn vào
 * kho dữ liệu.
 *
 * Vì sao cần cache: mỗi lần gõ một ký tự là quét lại toàn bộ lịch sử. Mục ngắn
 * nằm sẵn trong RAM nhưng vẫn phải toLowerCase() lại; mục dài thì nằm trên đĩa.
 * Cả hai đều được nhớ ở dạng đã viết thường, khoá theo hash nội dung.
 *
 * Khoá theo hash là an toàn tuyệt đối: hash đổi nghĩa là nội dung đổi, nên
 * không có chuyện cache lệch với thực tế — không cần cơ chế vô hiệu hoá nào.
 */

/**
 * Dưới ngưỡng này thì không đáng mở file blob ra đọc: gõ "a" mà quét mọi file
 * log trong lịch sử là treo panel ngay ký tự đầu tiên.
 */
export const BLOB_MIN_QUERY = 3;

/** Trần bộ nhớ cho cache. Vượt thì đẩy mục cũ nhất ra. */
const CACHE_BUDGET = 20 * 1024 * 1024;

const cache = new Map(); // hash -> nội dung đã viết thường
let cacheBytes = 0;

/**
 * Lấy nội dung đã viết thường của một hash, đọc qua `read()` nếu chưa có.
 * `read()` trả null nghĩa là không đọc được — không cache cái đó lại.
 */
export function cached(hash, read) {
  const hit = cache.get(hash);
  if (hit !== undefined) {
    // Chạm vào là mới lại: Map giữ đúng thứ tự chèn nên xoá rồi set lại là đủ
    // để biến nó thành LRU, không cần cấu trúc dữ liệu riêng.
    cache.delete(hash);
    cache.set(hash, hit);
    return hit;
  }

  const text = read();
  if (typeof text !== 'string') return null;

  const lower = text.toLowerCase();
  cache.set(hash, lower);
  cacheBytes += lower.length;

  while (cacheBytes > CACHE_BUDGET && cache.size > 1) {
    const oldest = cache.keys().next().value;
    cacheBytes -= cache.get(oldest).length;
    cache.delete(oldest);
  }
  return lower;
}

export function resetCache() {
  cache.clear();
  cacheBytes = 0;
}

/** Chỉ dùng cho test — xem cache đang giữ bao nhiêu. */
export function cacheStats() {
  return { entries: cache.size, bytes: cacheBytes };
}

/**
 * Đếm số lần `needle` xuất hiện trong `haystack`. Cả hai PHẢI đã viết thường.
 *
 * Trả null khi không khớp, để chỗ gọi chỉ cần kiểm tra truthy.
 */
export function countIn(haystack, needle) {
  if (typeof haystack !== 'string' || !needle) return null;

  let count = 0;
  let firstIndex = -1;
  // Nhảy qua cả cụm vừa khớp: tìm "aa" trong "aaaa" là 2 lần, không phải 3.
  let at = haystack.indexOf(needle);
  while (at !== -1) {
    if (firstIndex === -1) firstIndex = at;
    count++;
    at = haystack.indexOf(needle, at + needle.length);
  }
  return count ? { count, firstIndex } : null;
}
