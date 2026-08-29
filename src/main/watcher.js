/**
 * Theo dõi clipboard bằng polling.
 *
 * Electron không có sự kiện "clipboard đã đổi", nên phải tự hỏi. Bí quyết để
 * không đốt CPU là ĐỪNG đọc nội dung mỗi vòng: availableFormats() rẻ hơn hẳn
 * readText() trên nội dung lớn, và readImage() thì đắt gấp bội. Mỗi tick chỉ
 * dựng một "chữ ký" rẻ tiền; 99% số tick dừng lại ở đó.
 */

import { clipboard } from 'electron';
import { createHash } from 'node:crypto';

/**
 * Các format mà trình quản lý mật khẩu đặt lên clipboard để báo "đừng lưu cái
 * này". KeePass, 1Password, Bitwarden... đều dùng một trong số này.
 *
 * CHƯA ĐƯỢC KIỂM CHỨNG trên Electron: clipboard.has() của Electron có đọc được
 * format tuỳ biến của Windows hay không thì tài liệu không nói rõ. Nếu không
 * đọc được, hàm isExcluded() sẽ luôn trả false và app sẽ lưu cả mật khẩu.
 * Dùng ipc 'clipboard:diagnose' (nút "Chẩn đoán" trong Cài đặt) để tự kiểm tra:
 * copy một mật khẩu từ password manager rồi xem danh sách format hiện ra.
 */
const EXCLUDE_FLAGS = [
  'Clipboard Viewer Ignore',
  'ExcludeClipboardContentFromMonitorProcessing',
  'CanIncludeInClipboardHistory'
];

const hash = (text) => createHash('sha1').update(text).digest('hex');

let timer = null;
let lastStamp = null;
let selfWritten = null; // hash của nội dung do CHÍNH app này ghi ra

/**
 * Ta ghi clipboard khi người dùng chọn một mục. Không đánh dấu thì vòng sau
 * watcher thấy "clipboard đổi" và thêm lại chính mục vừa chọn — vòng lặp vô tận.
 */
export function markSelfWrite(text) {
  selfWritten = hash(String(text ?? ''));
}

/**
 * Đọc cờ loại trừ. Trả về true nghĩa là KHÔNG được lưu nội dung này.
 *
 * `CanIncludeInClipboardHistory` mang giá trị: DWORD 0 = cấm, khác 0 = cho phép.
 * Hai cờ còn lại chỉ cần có mặt là đủ hiểu.
 */
export function isExcluded() {
  for (const flag of EXCLUDE_FLAGS) {
    let present = false;
    try {
      present = clipboard.has(flag);
    } catch {
      continue; // format không hợp lệ trên nền tảng này
    }
    if (!present) continue;

    if (flag === 'CanIncludeInClipboardHistory') {
      try {
        const buf = clipboard.readBuffer(flag);
        if (buf.length >= 4 && buf.readUInt32LE(0) !== 0) continue; // cho phép
      } catch {
        /* đọc không được thì coi như cấm cho an toàn */
      }
    }
    return true;
  }
  return false;
}

/** Dữ liệu cho nút "Chẩn đoán": xem thật sự clipboard đang mang những gì. */
export function diagnose() {
  let formats = [];
  try {
    formats = clipboard.availableFormats();
  } catch {
    /* bỏ qua */
  }
  const flags = EXCLUDE_FLAGS.map((flag) => {
    let present = false;
    try {
      present = clipboard.has(flag);
    } catch {
      present = false;
    }
    return { flag, present };
  });
  return { formats, flags, excluded: isExcluded() };
}

/**
 * Bắt đầu theo dõi. onText(text) được gọi mỗi khi có nội dung text mới và hợp lệ.
 */
export function start({ pollMs = 300, onText }) {
  stop();
  // Nhận diện trạng thái hiện tại làm mốc, để không nuốt luôn thứ đang nằm sẵn
  // trên clipboard lúc app khởi động thành "mục mới".
  lastStamp = stamp();

  timer = setInterval(() => {
    const current = stamp();
    if (current === lastStamp) return; // đường thoát rẻ tiền, đi qua 99% số tick
    lastStamp = current;

    // Ảnh, file, HTML thuần: v1 chỉ nhận text nên bỏ qua, nhưng vẫn phải cập
    // nhật lastStamp ở trên, nếu không mỗi tick lại tưởng là vừa đổi.
    let text = '';
    try {
      text = clipboard.readText();
    } catch {
      return;
    }
    if (!text.trim()) return;

    // Chính ta vừa ghi ra -> bỏ qua đúng một lần.
    const h = hash(text);
    if (h === selfWritten) {
      selfWritten = null;
      return;
    }

    if (isExcluded()) return; // mật khẩu: không đụng vào

    onText(text);
  }, pollMs);
}

export function stop() {
  clearInterval(timer);
  timer = null;
}

export function isRunning() {
  return timer !== null;
}

/**
 * Chữ ký rẻ tiền của clipboard hiện tại.
 *
 * Chỉ băm text khi thật sự có text; với ảnh thì danh sách format đủ để biết đã
 * đổi mà không phải giải mã bitmap.
 */
function stamp() {
  let formats = [];
  try {
    formats = clipboard.availableFormats();
  } catch {
    return lastStamp;
  }
  const sig = formats.join('|');
  if (!formats.some((f) => f.startsWith('text/'))) return sig;

  try {
    return `${sig}:${hash(clipboard.readText())}`;
  } catch {
    return sig;
  }
}
