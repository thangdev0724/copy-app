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
  monospaceDetail: false,

  // Hành vi
  paused: false,
  openAtLogin: false,
  hideOnBlur: true,
  pollMs: 300,

  // 0 = không giới hạn. Đổi thành số item tối đa nếu muốn tự dọn bớt.
  maxItems: 0,

  // Đã hiện mẹo "đã copy, bấm Ctrl+V" lần nào chưa.
  seenPasteHint: false
};

const MIN_OPACITY = 0.15;

let cache = null;

function file() {
  return join(app.getPath('userData'), 'settings.json');
}

export function getSettings() {
  if (cache) return cache;
  try {
    cache = { ...DEFAULTS, ...JSON.parse(readFileSync(file(), 'utf8')) };
    // hotkeys là object lồng: spread ở trên sẽ thay nguyên cụm, phải trộn riêng
    // để phím tắt mới thêm trong DEFAULTS không biến mất với người dùng cũ.
    cache.hotkeys = { ...DEFAULTS.hotkeys, ...(cache.hotkeys || {}) };
  } catch {
    cache = { ...DEFAULTS, hotkeys: { ...DEFAULTS.hotkeys } };
  }
  return cache;
}

export function setSettings(patch) {
  const next = { ...getSettings(), ...patch };
  if (patch.hotkeys) next.hotkeys = { ...getSettings().hotkeys, ...patch.hotkeys };

  // Chặn dưới để panel không bao giờ mờ tới mức không thấy mà bấm.
  next.opacity = Math.max(MIN_OPACITY, Math.min(1, Number(next.opacity) || 1));
  next.pollMs = Math.max(100, Math.min(2000, Number(next.pollMs) || DEFAULTS.pollMs));
  next.fontSize = Math.max(11, Math.min(22, Number(next.fontSize) || DEFAULTS.fontSize));
  next.maxItems = Math.max(0, Number(next.maxItems) || 0);

  cache = next;
  persist();
  return cache;
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
