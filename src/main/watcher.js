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
let imageTimer = null;
let lastStamp = null;
let lastImageStamp = null;
let selfWritten = null; // hash của nội dung do CHÍNH app này ghi ra

/**
 * Ảnh được kiểm bằng một nhịp RIÊNG, chậm hơn hẳn.
 *
 * Lý do: chữ ký rẻ tiền của clipboard chỉ gồm danh sách format + hash của text,
 * nên copy ảnh A rồi ảnh B cho ra CÙNG một chữ ký — muốn phân biệt thì buộc
 * phải giải mã bitmap, mà readImage() là thứ đắt nhất trong cả file này.
 *
 * Trộn nó vào nhịp 300ms là đốt CPU cả ngày cho một việc hiếm. Tách ra một nhịp
 * ~1,2s và chỉ chạy khi người dùng bật captureImages là đánh đổi đúng: chậm hơn
 * một chút khi copy ảnh, đổi lấy việc không tốn gì khi không copy ảnh.
 */
const IMAGE_POLL_MS = 1200;

/** Ảnh thu nhỏ tới cỡ này rồi mới hash — đủ để phân biệt, rẻ hơn nhiều. */
const IMAGE_STAMP_WIDTH = 64;

/**
 * Ta ghi clipboard khi người dùng chọn một mục. Không đánh dấu thì vòng sau
 * watcher thấy "clipboard đổi" và thêm lại chính mục vừa chọn — vòng lặp vô tận.
 */
export function markSelfWrite(text) {
  selfWritten = hash(String(text ?? ''));
}

/**
 * Chốt chặn vòng lặp cho ẢNH.
 *
 * Ảnh không hash được từ bên ngoài như text, nên thay vì đánh dấu nội dung thì
 * đồng bộ lại luôn mốc so sánh: gọi ngay sau khi tự ghi ảnh vào clipboard, nhịp
 * kiểm ảnh kế tiếp sẽ thấy "không có gì đổi" và không thêm lại chính nó.
 */
export function markSelfImage() {
  lastImageStamp = imageStamp();
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
export function start({
  pollMs = 300,
  onText,
  onImage,
  onFiles,
  captureImages = false,
  captureFiles = true
}) {
  stop();
  // Nhận diện trạng thái hiện tại làm mốc, để không nuốt luôn thứ đang nằm sẵn
  // trên clipboard lúc app khởi động thành "mục mới".
  lastStamp = stamp();
  lastImageStamp = captureImages ? imageStamp() : null;

  timer = setInterval(() => {
    const current = stamp();
    if (current === lastStamp) return; // đường thoát rẻ tiền, đi qua 99% số tick
    lastStamp = current;

    if (isExcluded()) return; // mật khẩu: không đụng vào

    // Đường dẫn file trước text: copy file trong Explorer thì clipboard mang cả
    // CF_HDROP lẫn một chuỗi text, mà cái người dùng thật sự copy là file.
    if (captureFiles && onFiles) {
      const paths = readFilePaths();
      if (paths.length) {
        onFiles(paths);
        return;
      }
    }

    let text;
    try {
      text = clipboard.readText();
    } catch {
      return;
    }
    if (!text.trim()) return;

    // Chính ta vừa ghi ra -> bỏ qua đúng một lần.
    if (hash(text) === selfWritten) {
      selfWritten = null;
      return;
    }

    onText(text);
  }, pollMs);

  if (captureImages && onImage) {
    imageTimer = setInterval(() => {
      const current = imageStamp();
      if (current === lastImageStamp) return;
      lastImageStamp = current;
      if (!current) return; // clipboard không còn ảnh nữa

      if (isExcluded()) return;

      const image = readImage();
      if (image) onImage(image);
    }, IMAGE_POLL_MS);
  }
}

export function stop() {
  clearInterval(timer);
  clearInterval(imageTimer);
  timer = null;
  imageTimer = null;
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
/* -------------------------------------------------------------------- ảnh */

function readImage() {
  try {
    const image = clipboard.readImage();
    return image && !image.isEmpty() ? image : null;
  } catch {
    return null;
  }
}

/** Chữ ký của ảnh đang nằm trên clipboard, hoặc null nếu không có ảnh. */
function imageStamp() {
  const image = readImage();
  if (!image) return null;
  try {
    const { width } = image.getSize();
    const small = width > IMAGE_STAMP_WIDTH ? image.resize({ width: IMAGE_STAMP_WIDTH }) : image;
    return createHash('sha1').update(small.toBitmap()).digest('hex');
  } catch {
    return null;
  }
}

/* -------------------------------------------------------- đường dẫn file */

/**
 * Đọc danh sách file đang được copy.
 *
 * CF_HDROP là format chuẩn của Windows cho việc này. Cấu trúc DROPFILES:
 *   offset 0   DWORD pFiles  — vị trí bắt đầu danh sách
 *   offset 4   POINT pt      (8 byte, không dùng)
 *   offset 12  BOOL  fNC     (không dùng)
 *   offset 16  BOOL  fWide   — 1 nghĩa là danh sách mã hoá UTF-16LE
 * Sau đó là các đường dẫn nối nhau, mỗi cái kết thúc bằng NUL, cả khối kết thúc
 * bằng một NUL nữa.
 *
 * CHƯA KIỂM CHỨNG là Electron trả về đúng buffer HDROP thô trên mọi phiên bản
 * Windows — nên có đường lùi về 'FileNameW' (chỉ đọc được MỘT đường dẫn).
 */
export function readFilePaths() {
  const fromHdrop = parseHdrop();
  if (fromHdrop.length) return fromHdrop;

  try {
    if (hasFormat('FileNameW')) {
      const single = decodeUtf16(clipboard.readBuffer('FileNameW'));
      if (single) return [single];
    }
  } catch {
    /* không đọc được thì coi như không có file */
  }
  return [];
}

function parseHdrop() {
  if (!hasFormat('CF_HDROP')) return [];

  let buffer;
  try {
    buffer = clipboard.readBuffer('CF_HDROP');
  } catch {
    return [];
  }
  if (!buffer || buffer.length < 20) return [];

  try {
    const offset = buffer.readUInt32LE(0);
    const wide = buffer.readUInt32LE(16) !== 0;
    if (offset < 20 || offset >= buffer.length) return [];

    const body = buffer.subarray(offset);
    const raw = wide ? decodeUtf16(body, true) : body.toString('latin1');
    return raw.split('\0').filter(Boolean);
  } catch {
    return [];
  }
}

function decodeUtf16(buffer, keepNulls = false) {
  if (!buffer?.length) return '';
  const text = buffer.toString('utf16le');
  return keepNulls ? text : text.replace(/\0+$/, '');
}

/* ---------------------------------------------------------------- chữ ký */

function stamp() {
  let formats;
  try {
    formats = clipboard.availableFormats();
  } catch {
    return lastStamp;
  }
  // CF_HDROP có thể không nằm trong availableFormats() — tài liệu không nói rõ.
  // Thêm nó vào chữ ký cho chắc: không có thì copy file trong Explorer có nguy
  // cơ không được nhận ra là thay đổi. Đây chỉ là một lời gọi has() rẻ tiền.
  const sig = `${formats.join('|')}|hdrop:${hasFormat('CF_HDROP') ? 1 : 0}`;
  if (!formats.some((f) => f.startsWith('text/'))) return sig;

  try {
    return `${sig}:${hash(clipboard.readText())}`;
  } catch {
    return sig;
  }
}
