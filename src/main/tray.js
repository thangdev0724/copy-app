/**
 * Biểu tượng khay hệ thống.
 *
 * App không có cửa sổ chính, nên tray là đường sống duy nhất khi phím tắt hỏng
 * (bị app khác chiếm mất). Menu luôn phải có mục "Mở bảng" — không có nó, người
 * dùng mất phím tắt là mất luôn app, chỉ còn cách vào Task Manager.
 */

import { Tray, Menu, nativeImage } from 'electron';
import { join } from 'node:path';
import { pretty } from './hotkey.js';

// Bundle xuất ra CommonJS nên __dirname có sẵn lúc chạy (global khai báo trong eslint.config.mjs).
const dirname = __dirname;

let tray = null;
let actions = {};

function icon(paused) {
  const file = paused ? 'tray-paused.png' : 'tray.png';
  const img = nativeImage.createFromPath(join(dirname, '../../build', file));
  // Thiếu file icon thì tạo ảnh rỗng: tray vẫn hiện được, không làm sập app.
  return img.isEmpty() ? nativeImage.createEmpty() : img;
}

export function createTray(handlers) {
  actions = handlers;
  tray = new Tray(icon(false));
  tray.setToolTip('ClipFull');
  tray.on('click', () => actions.toggle());
  return tray;
}

export function refreshTray(settings, hotkeyFailed) {
  if (!tray) return;

  const accel = settings.hotkeys?.['toggle-panel'];
  tray.setImage(icon(settings.paused));
  tray.setToolTip(
    hotkeyFailed
      ? 'ClipFull — phím tắt bị ứng dụng khác chiếm, bấm vào đây để mở'
      : `ClipFull — ${pretty(accel)}`
  );

  tray.setContextMenu(
    Menu.buildFromTemplate([
      {
        label: hotkeyFailed ? 'Mở bảng  (phím tắt đang hỏng)' : `Mở bảng   ${pretty(accel)}`,
        click: () => actions.toggle()
      },
      { type: 'separator' },
      {
        label: 'Tạm dừng theo dõi',
        type: 'checkbox',
        checked: Boolean(settings.paused),
        click: () => actions.togglePause()
      },
      {
        label: 'Khởi động cùng Windows',
        type: 'checkbox',
        checked: Boolean(settings.openAtLogin),
        click: () => actions.toggleAutoStart()
      },
      { type: 'separator' },
      { label: 'Cài đặt…', click: () => actions.openSettings() },
      { label: 'Thoát', click: () => actions.quit() }
    ])
  );
}

export function destroyTray() {
  tray?.destroy();
  tray = null;
}
