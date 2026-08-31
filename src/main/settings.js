/**
 * Cấu hình người dùng, lưu trong %APPDATA%/ClipFull/settings.json.
 *
 * Mọi thứ đi qua getSettings()/setSettings() để sau này muốn mã hoá hay đổi chỗ
 * lưu thì chỉ phải sửa đúng một nơi.
 */

import { app } from 'electron';
import { readFileSync, writeFileSync, renameSync } from 'node:fs';
import { join } from 'node:path';

export const DEFAULTS = {
  // Bảng hành động -> tổ hợp phím. Thêm phím tắt mới chỉ là thêm một dòng ở đây.
  hotkeys: {
    'toggle-panel': 'Control+Alt+V'
  },

  // Góc màn hình panel neo vào. Luôn tính trên màn hình đang có con trỏ.
  corner: 'bottom-right',
  panelWidth: 940,
  panelHeight: 580,

  // Giao diện
  theme: 'system', // 'system' | 'light' | 'dark'
  accent: '#2563eb',
  opacity: 0.96, // độ mờ lúc không rê chuột
  background: 'opaque', // 'opaque' | 'acrylic' | 'mica' (acrylic/mica: Windows 11)
  fontSize: 14,
  density: 'comfortable', // 'comfortable' | 'compact'
  groupByDay: true, // gom danh sách theo ngày
  sortBy: 'recent', // 'recent' | 'frequent'
  monospaceDetail: false,
  showLineNumbers: false,

  // Hành vi
  paused: false,
  openAtLogin: false,
  hideOnBlur: true,

  // Copy xong thì lần mở panel kế tự nhảy sang mục dưới — dán liên tiếp 1→2→3.
  pasteStack: false,
  pollMs: 300,

  // Ảnh mặc định TẮT: nhận diện ảnh đổi buộc phải giải mã bitmap, nên ai không
  // cần thì không phải trả giá CPU nào. Đường dẫn file thì rẻ nên bật sẵn.
  captureImages: false,
  captureFiles: true,

  // 0 = không giới hạn. Đổi thành số item tối đa nếu muốn tự dọn bớt.
  maxItems: 0,

  // 0 = giữ mãi. Mục đã ghim luôn được miễn trừ.
  retentionDays: 0,

  // Mã hoá index.json và blob bằng safeStorage (Windows: DPAPI).
  encryptHistory: false,

  // Bỏ qua nội dung trông như bí mật. action: 'skip' (không lưu) | 'mask' (lưu
  // nhưng che). Mặc định skip — lưu rồi che vẫn là đã ghi nó xuống đĩa một lần.
  redact: { enabled: true, action: 'skip', patterns: null },

  // Kiểm tra bản mới lúc khởi động và mỗi 24h. Chỉ báo, không tự tải.
  checkUpdates: true,

  // Đã hiện mẹo "đã copy, bấm Ctrl+V" lần nào chưa.
  seenPasteHint: false
};

const MIN_OPACITY = 0.15;

/** Khớp với minWidth/minHeight của BrowserWindow trong window.js. */
const MIN_PANEL_WIDTH = 620;
const MIN_PANEL_HEIGHT = 380;
const MAX_PANEL = 4000;

let cache = null;

function file() {
  return join(app.getPath('userData'), 'settings.json');
}

export function getSettings() {
  if (cache) return cache;
  try {
    cache = { ...DEFAULTS, ...JSON.parse(readFileSync(file(), 'utf8')) };
    // Object lồng: spread ở trên thay nguyên cụm, phải trộn riêng để trường mới
    // thêm trong DEFAULTS không biến mất với người dùng cũ.
    cache.hotkeys = { ...DEFAULTS.hotkeys, ...(cache.hotkeys || {}) };
    cache.redact = { ...DEFAULTS.redact, ...(cache.redact || {}) };
  } catch {
    cache = { ...DEFAULTS, hotkeys: { ...DEFAULTS.hotkeys }, redact: { ...DEFAULTS.redact } };
  }
  return cache;
}

export function setSettings(patch) {
  const next = { ...getSettings(), ...patch };
  if (patch.hotkeys) next.hotkeys = { ...getSettings().hotkeys, ...patch.hotkeys };
  if (patch.redact) next.redact = { ...getSettings().redact, ...patch.redact };

  // Chặn dưới để panel không bao giờ mờ tới mức không thấy mà bấm.
  next.opacity = clamp(next.opacity, MIN_OPACITY, 1, DEFAULTS.opacity);
  next.pollMs = Math.round(clamp(next.pollMs, 100, 2000, DEFAULTS.pollMs));
  next.fontSize = Math.round(clamp(next.fontSize, 11, 22, DEFAULTS.fontSize));

  // 0 ở đây KHÔNG phải giá trị hỏng — nó có nghĩa là "không giới hạn".
  next.maxItems = Math.round(clamp(next.maxItems, 0, Number.MAX_SAFE_INTEGER, 0));
  next.retentionDays = Math.round(clamp(next.retentionDays, 0, 3650, 0));

  // Ô nhập kích thước cho gõ tay, mà gõ 20 vào ô "Rộng" thì panel biến mất khỏi
  // tầm với — Electron tự chặn ở minWidth nhưng settings.json vẫn giữ số bậy.
  next.panelWidth = Math.round(
    clamp(next.panelWidth, MIN_PANEL_WIDTH, MAX_PANEL, DEFAULTS.panelWidth)
  );
  next.panelHeight = Math.round(
    clamp(next.panelHeight, MIN_PANEL_HEIGHT, MAX_PANEL, DEFAULTS.panelHeight)
  );

  cache = next;
  persist();
  return cache;
}

/**
 * Kẹp một số vào khoảng, rơi về `fallback` nếu không đọc ra số.
 *
 * Phải tách riêng "không phải số" khỏi "bằng 0": viết `Number(v) || fallback`
 * là gộp hai chuyện đó làm một, và 0 — một giá trị hợp lệ — bị đánh đồng với
 * rác rồi thay bằng mặc định.
 */
function clamp(value, min, max, fallback) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.max(min, Math.min(max, number));
}

function persist() {
  // Ghi tmp rồi đổi tên: tắt máy giữa chừng cũng không để lại file JSON cụt.
  const target = file();
  const tmp = `${target}.tmp`;
  try {
    writeFileSync(tmp, JSON.stringify(cache, null, 2), 'utf8');
    renameSync(tmp, target);
  } catch {
    /* đĩa đầy hoặc bị khoá: giữ nguyên bản trong RAM, lần sau ghi lại */
  }
}
