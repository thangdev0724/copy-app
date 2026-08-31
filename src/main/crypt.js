/**
 * Mã hoá dữ liệu trên đĩa bằng safeStorage của Electron (trên Windows là DPAPI).
 *
 * GIỚI HẠN — phải nói rõ, đừng để ai tưởng nhiều hơn thực tế: DPAPI gắn khoá với
 * TÀI KHOẢN WINDOWS đang đăng nhập. Nó chặn được người bê ổ cứng đi đọc, hoặc
 * người mở file bằng tài khoản khác. Nó KHÔNG chặn được phần mềm khác đang chạy
 * dưới chính tài khoản của bạn — thứ đó giải mã được y như ClipFull.
 *
 * Mọi file đều mang tiền tố nhận dạng, nên đọc file cũ (chưa mã hoá) và file mới
 * (đã mã hoá) đều đúng, không cần cờ nào ở ngoài. Nhờ vậy bật/tắt giữa chừng
 * không làm mất dữ liệu.
 */

import { safeStorage } from 'electron';

/** Tiền tố nhận dạng file đã mã hoá. Đổi số cuối nếu sau này đổi định dạng. */
const MAGIC = Buffer.from('CFENC1\n', 'utf8');

let enabled = false;

export function isAvailable() {
  try {
    return safeStorage.isEncryptionAvailable();
  } catch {
    return false; // nền tảng không hỗ trợ, hoặc keyring chưa mở khoá
  }
}

/** Trả về trạng thái THẬT SỰ áp dụng — bật mà máy không hỗ trợ thì vẫn là tắt. */
export function setEnabled(on) {
  enabled = Boolean(on) && isAvailable();
  return enabled;
}

export function isEnabled() {
  return enabled;
}

export function isSealed(buffer) {
  return Buffer.isBuffer(buffer) && buffer.length >= MAGIC.length && buffer.subarray(0, MAGIC.length).equals(MAGIC);
}

/**
 * Đóng gói một buffer để ghi đĩa. Tắt mã hoá thì trả nguyên trạng.
 *
 * safeStorage chỉ nhận và trả CHUỖI, nên dữ liệu nhị phân (ảnh PNG) phải đi qua
 * base64. Phình 33% nhưng nhờ đó ảnh cũng được bảo vệ như text — mã hoá index
 * mà để ảnh chụp màn hình nằm trần trên đĩa thì lời hứa riêng tư chỉ đúng một nửa.
 */
export function seal(buffer) {
  if (!enabled) return buffer;
  const encrypted = safeStorage.encryptString(buffer.toString('base64'));
  return Buffer.concat([MAGIC, encrypted]);
}

/**
 * Mở một buffer đọc từ đĩa. File chưa mã hoá thì trả nguyên trạng.
 *
 * NÉM LỖI khi giải mã hỏng (đổi máy, đổi tài khoản Windows) — cố ý: chỗ gọi phải
 * xử lý như file hỏng, tức là backup lại rồi mới bắt đầu từ đầu. Trả về buffer
 * rỗng ở đây là lặng lẽ xoá sạch lịch sử của người ta.
 */
export function open(buffer) {
  if (!isSealed(buffer)) return buffer;
  const base64 = safeStorage.decryptString(buffer.subarray(MAGIC.length));
  return Buffer.from(base64, 'base64');
}
