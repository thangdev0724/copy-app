/**
 * Stub Electron cho test.
 *
 * Chỉ phơi đúng những gì code trong src/main dùng tới. Mỗi test tự trỏ userData
 * vào một thư mục tạm riêng để không dẫm lên nhau.
 */

let userData = '';

export function __setUserData(path) {
  userData = path;
}

export const app = {
  getPath: () => userData,
  getVersion: () => '0.0.0-test'
};

/* Clipboard giả lập: test tự đặt trạng thái rồi gọi watcher. */
let clipboardState = { text: '', formats: [], buffers: {} };

export function __setClipboard(state) {
  clipboardState = { text: '', formats: [], buffers: {}, ...state };
}

export const clipboard = {
  readText: () => clipboardState.text,
  writeText: (value) => {
    clipboardState.text = value;
  },
  availableFormats: () => clipboardState.formats,
  has: (format) => clipboardState.formats.includes(format),
  readBuffer: (format) => {
    const buf = clipboardState.buffers[format];
    if (!buf) throw new Error(`không có format ${format}`);
    return buf;
  }
};
