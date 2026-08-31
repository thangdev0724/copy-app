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
 * Phạm vi đã kiểm chứng — đọc kỹ trước khi tin:
 *
 *   'Clipboard Viewer Ignore'  ĐÃ KIỂM CHỨNG. Đặt clipboard kèm cờ này thì nội
 *                              dung không được lưu; đối chứng cùng nội dung
 *                              không kèm cờ thì lưu bình thường.
 *   hai cờ còn lại             CHƯA. Tài liệu Electron không nói rõ clipboard.has()
 *                              đọc được tới đâu trong đám format tuỳ biến của
 *                              Windows. Nếu không đọc được thì isExcluded() lặng
 *                              lẽ trả false và mật khẩu vẫn bị lưu.
 *
 * Và kể cả ba cờ đều chạy, cơ chế này chỉ bắt được password manager nào CHỊU đặt
 * cờ. Dùng ipc 'clipboard:diagnose' (nút "Chẩn đoán" trong Cài đặt) để tự kiểm
 * tra trên máy mình: copy một mật khẩu rồi xem `excluded` có true không.
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
/**
 * `clipboard.has()` ném lỗi với format lạ trên vài nền tảng. Không đọc được thì
 * coi như không có — đây là câu hỏi "clipboard có mang cờ này không", nên câu
 * trả lời an toàn khi không biết là "không thấy".
 */
function hasFormat(flag) {
  try {
    return clipboard.has(flag);
  } catch {
    return false;
  }
}

export function isExcluded() {
  for (const flag of EXCLUDE_FLAGS) {
    if (!hasFormat(flag)) continue;

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
  const flags = EXCLUDE_FLAGS.map((flag) => ({ flag, present: hasFormat(flag) }));
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
    let text;
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
  let formats;
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
