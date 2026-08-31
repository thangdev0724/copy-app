import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

async function loadSettings(dataDir) {
  vi.resetModules();
  const electron = await import('./stubs/electron.js');
  electron.__setUserData(dataDir);
  return import('../src/main/settings.js');
}

let tmp;
let settings;

beforeEach(async () => {
  tmp = mkdtempSync(join(tmpdir(), 'clipfull-settings-'));
  settings = await loadSettings(tmp);
});

afterEach(() => {
  rmSync(tmp, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
});

describe('setSettings — chặn giá trị vô lý', () => {
  it('kích thước panel không tụt xuống dưới mức còn bấm được', () => {
    const next = settings.setSettings({ panelWidth: 20, panelHeight: 5 });
    expect(next.panelWidth).toBe(620);
    expect(next.panelHeight).toBe(380);
  });

  it('kích thước không đọc ra số thì quay về mặc định chứ không thành NaN', () => {
    const next = settings.setSettings({ panelWidth: 'to đùng', panelHeight: undefined });
    expect(next.panelWidth).toBe(settings.DEFAULTS.panelWidth);
    expect(next.panelHeight).toBe(settings.DEFAULTS.panelHeight);
  });

  it('số âm là số hợp lệ nhưng ngoài khoảng — kẹp về mức nhỏ nhất', () => {
    expect(settings.setSettings({ panelHeight: -1 }).panelHeight).toBe(380);
  });

  it('kích thước hợp lệ thì giữ nguyên', () => {
    const next = settings.setSettings({ panelWidth: 1200, panelHeight: 700 });
    expect(next.panelWidth).toBe(1200);
    expect(next.panelHeight).toBe(700);
  });

  it('độ mờ không bao giờ xuống tới mức nhìn không thấy', () => {
    expect(settings.setSettings({ opacity: 0 }).opacity).toBe(0.15);
    expect(settings.setSettings({ opacity: 5 }).opacity).toBe(1);
  });

  it('pollMs bị kẹp trong khoảng an toàn', () => {
    expect(settings.setSettings({ pollMs: 1 }).pollMs).toBe(100);
    expect(settings.setSettings({ pollMs: 99999 }).pollMs).toBe(2000);
  });
});

describe('getSettings — trộn với DEFAULTS', () => {
  it('phím tắt mới thêm trong DEFAULTS không biến mất với người dùng cũ', async () => {
    // File cũ chỉ có một phím tắt và thiếu hẳn các trường mới.
    writeFileSync(
      join(tmp, 'settings.json'),
      JSON.stringify({ hotkeys: { 'toggle-panel': 'Control+Alt+K' }, accent: '#ff0000' }),
      'utf8'
    );

    settings = await loadSettings(tmp);
    const current = settings.getSettings();

    expect(current.hotkeys['toggle-panel']).toBe('Control+Alt+K'); // giữ lựa chọn của họ
    expect(current.accent).toBe('#ff0000');
    expect(current.pollMs).toBe(settings.DEFAULTS.pollMs); // trường thiếu được bù
  });

  it('file settings hỏng thì quay về mặc định chứ không sập', async () => {
    writeFileSync(join(tmp, 'settings.json'), 'không phải json', 'utf8');
    settings = await loadSettings(tmp);
    expect(settings.getSettings().pollMs).toBe(settings.DEFAULTS.pollMs);
  });
});

describe('persist', () => {
  it('ghi ra đĩa để lần chạy sau đọc lại được', async () => {
    settings.setSettings({ accent: '#00ff00' });
    const raw = JSON.parse(readFileSync(join(tmp, 'settings.json'), 'utf8'));
    expect(raw.accent).toBe('#00ff00');
  });
});
