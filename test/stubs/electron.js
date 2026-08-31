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

/**
 * safeStorage giả lập.
 *
 * KHÔNG phải mã hoá thật — chỉ là một phép biến đổi đảo ngược được, đủ để test
 * xác nhận dữ liệu đi qua đúng đường seal/open và đọc lại ra nguyên bản. Test
 * cũng bật/tắt được `available` để kiểm nhánh máy không hỗ trợ.
 */
let encryptionAvailable = true;

export function __setEncryptionAvailable(on) {
  encryptionAvailable = Boolean(on);
}

const SCRAMBLE = 0x5a;

export const safeStorage = {
  isEncryptionAvailable: () => encryptionAvailable,
  encryptString: (text) => {
    const buf = Buffer.from(text, 'utf8');
    return Buffer.from(buf.map((b) => b ^ SCRAMBLE));
  },
  decryptString: (buffer) => {
    if (!Buffer.isBuffer(buffer)) throw new TypeError('cần Buffer');
    // Không có khoá thì KHÔNG giải mã được — đây chính là cảnh đổi máy hoặc đổi
    // tài khoản Windows, và là nhánh quan trọng nhất phải test.
    if (!encryptionAvailable) throw new Error('không lấy được khoá giải mã');
    return Buffer.from(buffer.map((b) => b ^ SCRAMBLE)).toString('utf8');
  }
};
