/**
 * ClipFull — main process.
 *
 * Ghép các mảnh lại: watcher (polling clipboard) -> store (lịch sử trên đĩa)
 * -> panel (Svelte). Phím tắt và tray là hai đường vào; tray là đường dự phòng
 * bắt buộc phải có vì phím tắt có thể bị ứng dụng khác chiếm.
 */

import { app, BrowserWindow, ipcMain, clipboard, dialog, nativeImage, shell } from 'electron';
import { getSettings, setSettings } from './settings.js';
import * as store from './store.js';
import * as watcher from './watcher.js';
import * as hotkey from './hotkey.js';
import * as tray from './tray.js';
import * as redact from './redact.js';
import * as crypt from './crypt.js';
import {
  createWindow,
  showPanel,
  hidePanel,
  togglePanel,
  applyAppearance,
  setHover,
  setSettingsOpen,
  markQuitting,
  send
} from './window.js';

/** Chạy hai bản cùng lúc là hai watcher ghi đè lên cùng một file index.json. */
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => showPanel(getSettings()));
  main();
}

let hotkeyFailed = false;

function main() {
  // App chạy nền dưới tray: đóng hết cửa sổ KHÔNG có nghĩa là thoát.
  // Chỉ cần ĐĂNG KÝ listener này là đã chặn được hành vi tự thoát mặc định của
  // Electron; thân hàm cố ý để trống.
  app.on('window-all-closed', () => {});

  app.whenReady().then(() => {
    const settings = getSettings();

    // Bật mã hoá TRƯỚC khi load: crypt.open() tự nhận ra file đã mã hoá hay
    // chưa, nhưng mọi lần ghi sau đó phải theo đúng lựa chọn của người dùng.
    crypt.setEnabled(settings.encryptHistory);

    store.load();
    const loadError = store.takeLoadError();
    store.sweepExpired(settings.retentionDays);
    startRetentionSweep();
    store.setMaxItems(settings.maxItems);
    store.sweepOrphanBlobs();
    store.onChange(() => send('items:changed'));

    createWindow(settings);
    registerIpc();

    hotkey.setHandlers({
      'toggle-panel': () => togglePanel(getSettings())
    });
    hotkeyFailed = hotkey.applyAll(settings.hotkeys).length > 0;

    tray.createTray({
      toggle: () => togglePanel(getSettings()),
      togglePause: () => applyPatch({ paused: !getSettings().paused }),
      toggleAutoStart: () => applyPatch({ openAtLogin: !getSettings().openAtLogin }),
      openSettings: () => {
        showPanel(getSettings());
        send('view:settings');
      },
      quit: () => quit()
    });
    tray.refreshTray(settings, hotkeyFailed);

    applyAutoStart(settings.openAtLogin);
    startWatching();

    // Lịch sử vừa mất mà không nói gì thì người dùng tưởng app tự xoá sạch.
    // Bản hỏng vẫn còn trên đĩa, phải chỉ cho họ biết nó nằm ở đâu.
    if (loadError) {
      dialog.showMessageBox({
        type: 'warning',
        title: 'ClipFull',
        message: 'Không đọc được lịch sử clipboard',
        detail: loadError.backup
          ? `File index.json bị hỏng nên ClipFull bắt đầu lại từ đầu.\n\n` +
            `Bản hỏng đã được giữ lại tại:\n${loadError.backup}`
          : 'File index.json bị hỏng và cũng không đổi tên để giữ lại được. ' +
            'ClipFull bắt đầu lại từ đầu.',
        buttons: ['Đã hiểu']
      });
    }

    // Phím tắt hỏng mà app lại không có cửa sổ -> người dùng tưởng nó chết.
    // Phải nói ra, đúng một lần, ngay lúc khởi động.
    if (hotkeyFailed) {
      dialog.showMessageBox({
        type: 'warning',
        title: 'ClipFull',
        message: 'Không đăng ký được phím tắt',
        detail:
          `Tổ hợp ${hotkey.pretty(settings.hotkeys['toggle-panel'])} đang bị ứng dụng khác dùng.\n\n` +
          'Bấm vào biểu tượng ClipFull ở khay hệ thống để mở bảng và chọn phím khác.',
        buttons: ['Đã hiểu']
      });
    }
  });

  app.on('will-quit', () => {
    hotkey.unregisterAll();
    watcher.stop();
    clearInterval(retentionTimer);
    store.flush(); // chưa kịp ghi thì ghi nốt, đừng để mất
  });
}

function quit() {
  markQuitting();
  tray.destroyTray();
  app.quit();
}

/* ------------------------------------------------------------------ watcher */

/** Bề ngang ảnh thu nhỏ trong danh sách. */
const THUMB_WIDTH = 160;

function startWatching() {
  const settings = getSettings();
  watcher.stop();
  if (settings.paused) return;
  watcher.start({
    pollMs: settings.pollMs,
    captureImages: settings.captureImages,
    captureFiles: settings.captureFiles,
    onText: (text) => addTextGuarded(text),
    onFiles: (paths) => store.addFiles(paths),
    onImage: (image) => store.addImage(prepareImage(image))
  });
}

/**
 * Cửa duy nhất mà text đi vào lịch sử — nên cũng là chỗ duy nhất cần đặt bộ lọc
 * bí mật. store.js không phải biết gì về khái niệm "bí mật".
 */
function addTextGuarded(text) {
  const { redact: rules } = getSettings();
  if (!rules?.enabled) return store.addText(text);

  const found = redact.scan(text, rules.patterns ?? undefined);
  if (!found.length) return store.addText(text);

  // 'skip' là mặc định: lưu rồi che thì nội dung gốc vẫn đã kịp nằm trên đĩa
  // một lần. Không lưu là lựa chọn duy nhất thật sự an toàn.
  if (rules.action !== 'mask') return null;

  const item = store.addText(redact.mask(text, rules.patterns ?? undefined));
  if (item) store.toggleMask(item.id);
  return item;
}

/** Quét mục quá hạn mỗi giờ — app chạy nền hàng tuần liền là chuyện bình thường. */
const RETENTION_SWEEP_MS = 60 * 60 * 1000;
let retentionTimer = null;

function startRetentionSweep() {
  clearInterval(retentionTimer);
  retentionTimer = setInterval(() => {
    store.sweepExpired(getSettings().retentionDays);
  }, RETENTION_SWEEP_MS);
}

/**
 * Đổi NativeImage thành mấy buffer mà store cần.
 *
 * Phần đụng tới API ảnh của Electron gom hết vào đây, để store.js chỉ phụ thuộc
 * `app.getPath` và vẫn test được mà không cần dựng cả runtime Electron.
 */
function prepareImage(image) {
  const { width, height } = image.getSize();
  const thumbSource = width > THUMB_WIDTH ? image.resize({ width: THUMB_WIDTH }) : image;
  return {
    png: image.toPNG(),
    thumb: thumbSource.toPNG(),
    width,
    height
  };
}

/* ----------------------------------------------------------------- settings */

/** Đổi bất kỳ cái nào trong số này thì watcher phải dựng lại với tham số mới. */
const RESTART_WATCHER = ['paused', 'pollMs', 'captureImages', 'captureFiles'];

function applyPatch(patch) {
  const before = getSettings();
  const next = setSettings(patch);

  if ('maxItems' in patch) store.setMaxItems(next.maxItems);
  if ('retentionDays' in patch) store.sweepExpired(next.retentionDays);
  if ('encryptHistory' in patch && before.encryptHistory !== next.encryptHistory) {
    applyEncryption(next.encryptHistory);
  }
  // Gọi vô điều kiện: window.js giữ bản sao settings riêng để dùng lúc blur và
  // lúc tính độ mờ. Chỉ đồng bộ khi đổi opacity/background là để nó ôm bản cũ —
  // tắt "tự ẩn khi bấm ra ngoài" mà panel vẫn ẩn cho tới lần mở kế.
  applyAppearance(next);
  if ('openAtLogin' in patch) applyAutoStart(next.openAtLogin);
  if (RESTART_WATCHER.some((key) => key in patch) && (!next.paused || 'paused' in patch)) {
    startWatching();
  }

  if (before.paused !== next.paused || before.openAtLogin !== next.openAtLogin) {
    tray.refreshTray(next, hotkeyFailed);
  }
  send('settings:changed', next);
  return next;
}

/**
 * Bật/tắt mã hoá rồi ghi lại toàn bộ dữ liệu.
 *
 * Máy không hỗ trợ safeStorage thì store.reseal() trả về false — phải nói ra và
 * chỉnh lại setting cho khớp thực tế, không để giao diện hiện "đã bật" trong
 * khi trên đĩa vẫn là chữ thường.
 */
function applyEncryption(enable) {
  const applied = store.reseal(enable);
  if (applied === enable) return;

  setSettings({ encryptHistory: applied });
  dialog.showMessageBox({
    type: 'warning',
    title: 'ClipFull',
    message: 'Không mã hoá được lịch sử',
    detail:
      'Windows không cung cấp được khoá mã hoá cho ClipFull trên máy này, nên lịch sử ' +
      'vẫn được lưu ở dạng chữ thường.',
    buttons: ['Đã hiểu']
  });
}

function applyAutoStart(enabled) {
  // --hidden để lần khởi động cùng Windows không bật panel lên trước mặt.
  app.setLoginItemSettings({
    openAtLogin: Boolean(enabled),
    args: ['--hidden']
  });
}

/* ---------------------------------------------------------------------- IPC */

/** Trần cho items:copyText. Không ai copy tay 50 triệu ký tự. */
const MAX_COPY_CHARS = 50_000_000;

function toDataUrl(png) {
  return png ? `data:image/png;base64,${png.toString('base64')}` : null;
}

/**
 * Ghi clipboard rồi ẩn panel.
 *
 * markSelfWrite là chốt chặn vòng lặp — không có nó, watcher thấy clipboard vừa
 * đổi và thêm lại chính nội dung vừa ghi, thành vòng vô tận.
 */
function writeClipboard(text) {
  watcher.markSelfWrite(text);
  clipboard.writeText(text);
  hidePanel();
  return { ok: true };
}

function registerIpc() {
  ipcMain.handle('items:list', () => store.list());
  ipcMain.handle('items:full', (_e, id) => store.full(id));
  ipcMain.handle('items:search', (_e, query) => store.search(query));
  ipcMain.handle('items:pin', (_e, id) => store.togglePin(id));
  ipcMain.handle('items:mask', (_e, id) => store.toggleMask(id));
  ipcMain.handle('items:remove', (_e, id) => store.remove(id));
  ipcMain.handle('items:clear', () => store.clear());

  /** Chọn một mục: ghi toàn văn vào clipboard rồi ẩn panel. */
  ipcMain.handle('items:copy', (_e, id) => {
    const text = store.full(id);
    if (!text) return { ok: false };
    return writeClipboard(text);
  });

  /**
   * Copy một đoạn text tuỳ ý thay vì copy nguyên mục: dùng cho bản đã biến đổi
   * (format JSON, gỡ hard-wrap…) và cho phần người dùng bôi đen.
   *
   * Text đến từ renderer, nhưng gốc gác của nó vốn là clipboard nên không có
   * thêm rủi ro nào — vẫn chặn ở mức kích thước để một renderer hỏng không đẩy
   * được vài trăm MB vào clipboard.
   */
  ipcMain.handle('items:copyText', (_e, text) => {
    const value = String(text ?? '');
    if (!value || value.length > MAX_COPY_CHARS) return { ok: false };
    return writeClipboard(value);
  });

  /**
   * Ảnh đi sang renderer dạng data URL.
   *
   * CSP của panel chỉ cho `img-src 'self' data:`, nên đây là đường duy nhất —
   * và cũng là đường đúng: không phải mở thêm protocol tuỳ biến hay cho renderer
   * đọc file, chỉ để hiện một tấm ảnh.
   */
  ipcMain.handle('items:image', (_e, id) => toDataUrl(store.imageOf(id)));
  ipcMain.handle('items:thumb', (_e, id) => toDataUrl(store.thumbOf(id)));

  /** Copy một mục ảnh: dựng lại NativeImage từ PNG trên đĩa rồi ghi clipboard. */
  ipcMain.handle('items:copyImage', (_e, id) => {
    const png = store.imageOf(id);
    if (!png) return { ok: false };
    const image = nativeImage.createFromBuffer(png);
    if (image.isEmpty()) return { ok: false };
    clipboard.writeImage(image);
    watcher.markSelfImage(); // nếu không, nhịp kiểm ảnh thêm lại chính mục này
    hidePanel();
    return { ok: true };
  });

  /** Mở Explorer và trỏ vào đúng file — dùng cho mục đường dẫn file. */
  ipcMain.handle('shell:reveal', (_e, path) => {
    if (typeof path !== 'string' || !path) return { ok: false };
    shell.showItemInFolder(path);
    return { ok: true };
  });

  ipcMain.handle('settings:get', () => getSettings());
  ipcMain.handle('settings:set', (_e, patch) => applyPatch(patch || {}));

  ipcMain.handle('hotkey:set', (_e, { action, accel }) => {
    const result = hotkey.setHotkey(action, accel);
    if (result.ok) {
      const next = setSettings({ hotkeys: { [action]: accel } });
      hotkeyFailed = false;
      tray.refreshTray(next, false);
      send('settings:changed', next);
    }
    return result;
  });

  /** Nút "Thử phím tắt": tổ hợp đăng ký được nhưng bị OS nuốt thì chỉ cách này mới biết. */
  ipcMain.handle('hotkey:active', () => hotkey.activeHotkeys());

  ipcMain.handle('clipboard:diagnose', () => watcher.diagnose());
  ipcMain.handle('redact:patterns', () => ({
    all: redact.ALL_PATTERNS,
    defaults: redact.DEFAULT_PATTERN_IDS,
    encryptionAvailable: crypt.isAvailable()
  }));

  ipcMain.handle('panel:hide', () => hidePanel());
  ipcMain.handle('panel:hover', (_e, on) => setHover(on));
  ipcMain.handle('panel:settings-open', (_e, open) => setSettingsOpen(open));
  ipcMain.handle('app:quit', () => quit());
  ipcMain.handle('app:paths', () => ({ userData: app.getPath('userData') }));
}

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow(getSettings());
});
