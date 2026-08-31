/**
 * Cầu nối duy nhất giữa renderer và main.
 *
 * contextIsolation bật, nodeIntegration tắt: renderer không đụng được vào fs hay
 * Node. Nó chỉ gọi được đúng những hàm liệt kê dưới đây — quan trọng vì nội dung
 * clipboard là dữ liệu không kiểm soát được, đừng cho nó nhiều quyền hơn mức cần.
 */

import { contextBridge, ipcRenderer } from 'electron';

const invoke = (channel, payload) => ipcRenderer.invoke(channel, payload);

/** Đăng ký listener và trả về hàm gỡ — tránh rò khi component Svelte bị huỷ. */
function on(channel, fn) {
  const wrapped = (_event, payload) => fn(payload);
  ipcRenderer.on(channel, wrapped);
  return () => ipcRenderer.removeListener(channel, wrapped);
}

contextBridge.exposeInMainWorld('clipfull', {
  items: {
    list: () => invoke('items:list'),
    full: (id) => invoke('items:full', id),
    search: (query) => invoke('items:search', query),
    copy: (id) => invoke('items:copy', id),
    copyText: (text) => invoke('items:copyText', text),
    pin: (id) => invoke('items:pin', id),
    remove: (id) => invoke('items:remove', id),
    clear: () => invoke('items:clear')
  },
  settings: {
    get: () => invoke('settings:get'),
    set: (patch) => invoke('settings:set', patch)
  },
  hotkey: {
    set: (action, accel) => invoke('hotkey:set', { action, accel }),
    active: () => invoke('hotkey:active')
  },
  panel: {
    hide: () => invoke('panel:hide'),
    hover: (on) => invoke('panel:hover', on),
    settingsOpen: (open) => invoke('panel:settings-open', open)
  },
  app: {
    quit: () => invoke('app:quit'),
    paths: () => invoke('app:paths'),
    diagnose: () => invoke('clipboard:diagnose')
  },
  onItemsChanged: (fn) => on('items:changed', fn),
  onSettingsChanged: (fn) => on('settings:changed', fn),
  onPanelShown: (fn) => on('panel:shown', fn),
  onShowSettings: (fn) => on('view:settings', fn)
});
