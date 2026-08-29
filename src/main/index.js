/**
 * ClipFull — main process.
 *
 * Ghép các mảnh lại: watcher (polling clipboard) -> store (lịch sử trên đĩa)
 * -> panel (Svelte). Phím tắt và tray là hai đường vào; tray là đường dự phòng
 * bắt buộc phải có vì phím tắt có thể bị ứng dụng khác chiếm.
 */

import { app, BrowserWindow, ipcMain, clipboard, dialog } from 'electron';
import { getSettings, setSettings } from './settings.js';
import * as store from './store.js';
import * as watcher from './watcher.js';
import * as hotkey from './hotkey.js';
import * as tray from './tray.js';
import {
  createWindow,
  showPanel,
  hidePanel,
  togglePanel,
  applyAppearance,
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

    store.load();
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
    store.flush(); // chưa kịp ghi thì ghi nốt, đừng để mất
  });
}

function quit() {
  markQuitting();
  tray.destroyTray();
  app.quit();
}

/* ------------------------------------------------------------------ watcher */

function startWatching() {
  const settings = getSettings();
  watcher.stop();
  if (settings.paused) return;
  watcher.start({
    pollMs: settings.pollMs,
    onText: (text) => store.addText(text)
  });
}

/* ----------------------------------------------------------------- settings */

function applyPatch(patch) {
  const before = getSettings();
  const next = setSettings(patch);

  if ('maxItems' in patch) store.setMaxItems(next.maxItems);
  if ('opacity' in patch || 'background' in patch) applyAppearance(next);
  if ('openAtLogin' in patch) applyAutoStart(next.openAtLogin);
  if ('paused' in patch || (('pollMs' in patch) && !next.paused)) startWatching();

  if (before.paused !== next.paused || before.openAtLogin !== next.openAtLogin) {
    tray.refreshTray(next, hotkeyFailed);
  }
  send('settings:changed', next);
  return next;
}

function applyAutoStart(enabled) {
  // --hidden để lần khởi động cùng Windows không bật panel lên trước mặt.
  app.setLoginItemSettings({
    openAtLogin: Boolean(enabled),
    args: ['--hidden']
  });
}

/* ---------------------------------------------------------------------- IPC */

function registerIpc() {
  ipcMain.handle('items:list', () => store.list());
  ipcMain.handle('items:full', (_e, id) => store.full(id));
  ipcMain.handle('items:pin', (_e, id) => store.togglePin(id));
  ipcMain.handle('items:remove', (_e, id) => store.remove(id));
  ipcMain.handle('items:clear', () => store.clear());

  /**
   * Chọn một mục: ghi vào clipboard rồi ẩn panel.
   * markSelfWrite là chốt chặn vòng lặp — không có nó, watcher sẽ thấy clipboard
   * vừa đổi và thêm lại chính mục vừa chọn.
   */
  ipcMain.handle('items:copy', (_e, id) => {
    const text = store.full(id);
    if (!text) return { ok: false };
    watcher.markSelfWrite(text);
    clipboard.writeText(text);
    hidePanel();
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

  ipcMain.handle('panel:hide', () => hidePanel());
  ipcMain.handle('panel:settings-open', (_e, open) => setSettingsOpen(open));
  ipcMain.handle('app:quit', () => quit());
  ipcMain.handle('app:paths', () => ({ userData: app.getPath('userData') }));
}

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow(getSettings());
});
