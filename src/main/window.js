/**
 * Cửa sổ panel.
 *
 * Dựng sẵn NGAY lúc khởi động rồi ẩn đi, chứ không tạo mới mỗi lần bấm phím tắt.
 * Người dùng bấm hotkey là muốn thấy panel ngay lập tức; dựng lại renderer mỗi
 * lần thì mất vài trăm ms — đủ để cảm giác "ì" và bỏ dùng app.
 *
 * Không dùng `transparent: true`: trên Windows nó kéo theo hàng loạt hạn chế
 * (resize, khử răng cưa subpixel tắt, click-through lằng nhằng). Cửa sổ đục +
 * setOpacity() cho kết quả đẹp hơn và ổn định hơn nhiều.
 */

import { BrowserWindow, screen, shell } from 'electron';
import { join } from 'node:path';

// Bundle xuất ra CommonJS nên __dirname có sẵn lúc chạy (global khai báo trong eslint.config.mjs).
const dirname = __dirname;

/** Chừa mép để panel không dính sát cạnh màn hình / đè lên thanh tác vụ. */
const MARGIN = 12;

let win = null;

export function createWindow(settings) {
  win = new BrowserWindow({
    width: settings.panelWidth,
    height: settings.panelHeight,
    show: false,
    frame: false,
    resizable: true,
    minWidth: 620,
    minHeight: 380,
    skipTaskbar: true,
    alwaysOnTop: true,
    maximizable: false,
    fullscreenable: false,
    backgroundColor: '#00000000',
    webPreferences: {
      preload: join(dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  });

  // Nổi trên cả cửa sổ toàn màn hình của app khác.
  win.setAlwaysOnTop(true, 'screen-saver');
  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  applyAppearance(settings);

  // Bấm ra ngoài là ẩn — panel kiểu Win+V phải biến đi khi không dùng tới.
  win.on('blur', () => {
    if (!win || win.isDestroyed()) return;
    if (settingsPinnedOpen) return;
    if (currentSettings.hideOnBlur) win.hide();
  });

  // Người dùng đóng bằng Alt+F4 thì chỉ ẩn, app vẫn sống dưới tray.
  win.on('close', (e) => {
    if (quitting) return;
    e.preventDefault();
    win.hide();
  });

  // Link ngoài mở bằng trình duyệt, đừng biến panel thành cửa sổ web.
  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  loadRenderer();
  currentSettings = settings;
  return win;
}

/** Dev thì nạp từ vite dev server (có hot reload), production thì nạp file đã build. */
function loadRenderer() {
  if (process.env.ELECTRON_RENDERER_URL) {
    win.loadURL(process.env.ELECTRON_RENDERER_URL);
  } else {
    win.loadFile(join(dirname, '../renderer/index.html'));
  }
}

let currentSettings = {};
let settingsPinnedOpen = false;
let quitting = false;

/**
 * Con trỏ có đang nằm trên panel không.
 *
 * Main process không tự biết được — không có sự kiện hover ở cấp cửa sổ. Renderer
 * bắt mouseenter/mouseleave rồi báo sang qua IPC `panel:hover`.
 */
let hovering = false;

/** Mức mờ đáng lẽ phải hiện: rê chuột vào là rõ hẳn, rời ra thì mờ lại. */
function targetOpacity() {
  if (hovering) return 1;
  return Number(currentSettings.opacity) || 1;
}

export function setHover(on) {
  hovering = Boolean(on);
  if (!win || win.isDestroyed()) return;
  win.setOpacity(targetOpacity());
}

/** Khi mở tab Cài đặt thì tạm ngừng auto-hide, không thì chỉnh chưa xong đã biến mất. */
export function setSettingsOpen(open) {
  settingsPinnedOpen = Boolean(open);
}

export function markQuitting() {
  quitting = true;
}

export function applyAppearance(settings) {
  currentSettings = settings;
  if (!win || win.isDestroyed()) return;
  // Qua targetOpacity() chứ không đọc thẳng settings.opacity: đổi cài đặt trong
  // lúc con trỏ đang nằm trên panel thì không được kéo nó mờ lại giữa chừng.
  win.setOpacity(targetOpacity());

  // Nền acrylic/mica là hiệu ứng gốc của Windows 11 — rẻ và đẹp hơn tự làm blur.
  // Máy cũ hơn thì lặng lẽ bỏ qua, không phải lỗi.
  try {
    win.setBackgroundMaterial?.(settings.background === 'opaque' ? 'none' : settings.background);
  } catch {
    /* Windows 10 hoặc Electron cũ: không có API này */
  }
}

/**
 * Đặt panel vào góc đã chọn CỦA MÀN HÌNH ĐANG CÓ CON TRỎ — không phải màn hình
 * chính. Người dùng hai màn hình mà panel cứ nhảy về màn kia là hỏng.
 */
function positionAtCorner(settings) {
  const cursor = screen.getCursorScreenPoint();
  const { workArea } = screen.getDisplayNearestPoint(cursor);
  const [w, h] = win.getSize();

  const left = workArea.x + MARGIN;
  const right = workArea.x + workArea.width - w - MARGIN;
  const top = workArea.y + MARGIN;
  const bottom = workArea.y + workArea.height - h - MARGIN;

  const spots = {
    'top-left': [left, top],
    'top-right': [right, top],
    'bottom-left': [left, bottom],
    'bottom-right': [right, bottom],
    center: [
      Math.round(workArea.x + (workArea.width - w) / 2),
      Math.round(workArea.y + (workArea.height - h) / 2)
    ]
  };
  const [x, y] = spots[settings.corner] || spots['bottom-right'];
  win.setPosition(Math.round(x), Math.round(y));
}

export function showPanel(settings) {
  if (!win || win.isDestroyed()) return;
  currentSettings = settings;
  win.setSize(settings.panelWidth, settings.panelHeight);
  positionAtCorner(settings);
  win.show();
  win.focus();
  win.webContents.send('panel:shown');
}

export function hidePanel() {
  if (!win || win.isDestroyed()) return;
  // Ẩn đi thì renderer không còn cơ hội bắn mouseleave — tự gỡ cờ, không thì
  // lần mở sau panel hiện ra ở mức rõ 100% dù con trỏ đang ở tận đâu.
  hovering = false;
  win.setOpacity(targetOpacity());
  win.hide();
}

export function togglePanel(settings) {
  if (!win || win.isDestroyed()) return;
  if (win.isVisible()) hidePanel();
  else showPanel(settings);
}

export function getWindow() {
  return win;
}

export function send(channel, payload) {
  if (win && !win.isDestroyed()) win.webContents.send(channel, payload);
}
