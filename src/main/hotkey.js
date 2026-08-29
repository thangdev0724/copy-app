/**
 * Đăng ký phím tắt toàn cục.
 *
 * Hai điều hầu hết app làm ẩu và người dùng phải trả giá:
 *
 * 1. globalShortcut.register() TRẢ VỀ false khi tổ hợp đã bị app khác chiếm.
 *    Bỏ qua giá trị này là để người dùng ngồi bấm phím vô vọng không hiểu vì sao.
 * 2. Đổi phím mà phím mới hỏng thì phải ĐĂNG KÝ LẠI phím cũ. Không rollback là
 *    người dùng mất luôn đường mở app — mà app này không có cửa sổ chính.
 *
 * Còn một trường hợp không phát hiện tự động được: vài tổ hợp đăng ký THÀNH CÔNG
 * nhưng Windows nuốt trước nên không bao giờ bắn (điển hình là tổ hợp có phím
 * Win). Vì thế phần Cài đặt có nút "Thử phím tắt" để người dùng tự xác nhận.
 */

import { globalShortcut } from 'electron';

let handlers = {};
let active = {}; // action -> accelerator đang thật sự giữ

export function setHandlers(map) {
  handlers = map;
}

/**
 * Áp cả bảng phím tắt. Trả về danh sách hành động đăng ký hỏng để UI báo đỏ.
 */
export function applyAll(hotkeys) {
  unregisterAll();
  const failed = [];
  for (const [action, accel] of Object.entries(hotkeys || {})) {
    if (!accel || !handlers[action]) continue;
    if (tryRegister(action, accel)) continue;
    failed.push({ action, accel });
  }
  return failed;
}

/**
 * Đổi phím của một hành động. Hỏng thì trả phím cũ về chỗ cũ.
 * @returns {{ok: boolean, error?: string}}
 */
export function setHotkey(action, accel) {
  if (!handlers[action]) return { ok: false, error: 'Hành động không tồn tại.' };

  const previous = active[action];
  if (previous) {
    globalShortcut.unregister(previous);
    delete active[action];
  }

  // Để trống nghĩa là tắt hẳn phím tắt cho hành động này — hợp lệ.
  if (!accel) return { ok: true };

  if (tryRegister(action, accel)) return { ok: true };

  if (previous) tryRegister(action, previous);
  return {
    ok: false,
    error: `"${pretty(accel)}" đang bị ứng dụng khác dùng. Đã giữ nguyên phím cũ.`
  };
}

function tryRegister(action, accel) {
  try {
    if (globalShortcut.register(accel, () => handlers[action]())) {
      active[action] = accel;
      return true;
    }
  } catch {
    /* accelerator sai cú pháp */
  }
  return false;
}

export function unregisterAll() {
  globalShortcut.unregisterAll();
  active = {};
}

export function activeHotkeys() {
  return { ...active };
}

/** "Control+Alt+V" -> "Ctrl + Alt + V" để hiện cho người đọc. */
export function pretty(accel) {
  if (!accel) return 'Chưa đặt';
  return String(accel)
    .replace(/CommandOrControl|Control/g, 'Ctrl')
    .replace(/Super|Meta/g, 'Win')
    .split('+')
    .join(' + ');
}
