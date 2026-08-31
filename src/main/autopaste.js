/**
 * THÍ NGHIỆM — tự động dán vào ứng dụng đang dùng.
 *
 * Ý tưởng: khi panel ẩn đi, Windows tự trả foreground về cửa sổ trước đó. Chờ
 * một nhịp ngắn rồi nhờ PowerShell gửi Ctrl+V tới cửa sổ đang có foreground —
 * làm được mà không cần native module nào.
 *
 * BỐN ĐIỀU CHƯA KIỂM CHỨNG. Không có máy chạy được app thật thì không thể kết
 * luận, nên tính năng này MẶC ĐỊNH TẮT và nằm trên nhánh thí nghiệm riêng:
 *
 *   1. Tiến trình PowerShell có tự cướp foreground không. `-WindowStyle Hidden`
 *      + `windowsHide` là để tránh, nhưng Windows vẫn có thể chớp focus một
 *      nhịp — mà chỉ cần một nhịp là SendKeys gửi nhầm chỗ.
 *   2. Phần mềm diệt virus có chặn không. SendKeys qua WScript.Shell là mẫu
 *      hành vi mà nhiều bộ diệt virus coi là đáng ngờ.
 *   3. Gửi được vào app chạy quyền admin không. Gần như chắc là KHÔNG: UIPI của
 *      Windows chặn tiến trình quyền thấp gửi input cho cửa sổ quyền cao, mà
 *      ClipFull không chạy elevated.
 *   4. Độ trễ có chấp nhận được không. Khởi động PowerShell tốn 100-300ms, cộng
 *      thêm nhịp chờ ở đây.
 *
 * Nếu bất kỳ điều nào trong số đó hỏng thì đường đúng là native module (nut.js
 * hoặc addon N-API) — chứ không phải vá thêm vào cách này.
 */

import { spawn } from 'node:child_process';

/** Chờ Windows trả foreground về cửa sổ cũ trước khi gửi phím. */
export const DEFAULT_DELAY_MS = 90;

/**
 * Tham số truyền cho powershell.exe.
 *
 * Là hằng số cố định, KHÔNG ghép chuỗi từ dữ liệu nào cả: nội dung cần dán đã
 * nằm sẵn trên clipboard rồi. Chuỗi lệnh mà nhận dữ liệu từ ngoài vào là mở
 * đường cho việc chèn lệnh.
 */
export const POWERSHELL_ARGS = Object.freeze([
  '-NoProfile',
  '-NonInteractive',
  '-WindowStyle',
  'Hidden',
  '-Command',
  '$wshell = New-Object -ComObject WScript.Shell; $wshell.SendKeys("^v")'
]);

export function isSupported() {
  return process.platform === 'win32';
}

/**
 * Gửi Ctrl+V tới cửa sổ đang có foreground, sau một nhịp chờ.
 *
 * @returns {boolean} đã lên lịch gửi hay chưa (không phải "đã dán thành công" —
 *   không có cách nào biết điều đó từ đây).
 */
export function paste({ delayMs = DEFAULT_DELAY_MS, spawnFn = spawn } = {}) {
  if (!isSupported()) return false;

  setTimeout(() => {
    try {
      const child = spawnFn('powershell.exe', POWERSHELL_ARGS, {
        detached: true,
        stdio: 'ignore',
        windowsHide: true
      });
      // unref để tiến trình con không giữ ClipFull sống khi người dùng thoát.
      child?.unref?.();
    } catch {
      /* không có PowerShell, hoặc bị chính sách chặn — im lặng bỏ qua */
    }
  }, Math.max(0, delayMs));

  return true;
}
