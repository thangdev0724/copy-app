import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { paste, isSupported, POWERSHELL_ARGS, DEFAULT_DELAY_MS } from '../src/main/autopaste.js';

/**
 * Chỉ test được phần LOGIC: dựng lệnh, nhịp chờ, no-op ngoài Windows.
 *
 * Bốn câu hỏi thật sự quyết định tính năng này có dùng được không — cướp
 * foreground, phần mềm diệt virus, UIPI với app admin, độ trễ — đều phải chạy
 * app thật mới trả lời được. Xem phần đầu src/main/autopaste.js.
 */

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('isSupported', () => {
  it('chỉ chạy trên Windows', () => {
    expect(isSupported()).toBe(process.platform === 'win32');
  });
});

describe('POWERSHELL_ARGS', () => {
  it('là hằng số cố định, không ghép chuỗi từ dữ liệu nào', () => {
    expect(Object.isFrozen(POWERSHELL_ARGS)).toBe(true);
  });

  it('chạy ẩn và không đọc profile — profile có thể in ra thứ gì đó rồi treo', () => {
    expect(POWERSHELL_ARGS).toContain('-NoProfile');
    expect(POWERSHELL_ARGS).toContain('-NonInteractive');
    expect(POWERSHELL_ARGS).toContain('Hidden');
  });

  it('gửi đúng Ctrl+V', () => {
    expect(POWERSHELL_ARGS.at(-1)).toContain('SendKeys("^v")');
  });
});

describe('paste', () => {
  const fakeChild = () => ({ unref: vi.fn() });

  it('spawn sau nhịp chờ chứ không spawn ngay', () => {
    if (!isSupported()) return;
    const spawnFn = vi.fn(fakeChild);

    paste({ spawnFn });
    expect(spawnFn).not.toHaveBeenCalled(); // phải để Windows trả foreground đã

    vi.advanceTimersByTime(DEFAULT_DELAY_MS);
    expect(spawnFn).toHaveBeenCalledOnce();
  });

  it('spawn detached + windowsHide, và unref để không giữ app sống', () => {
    if (!isSupported()) return;
    const child = fakeChild();
    const spawnFn = vi.fn(() => child);

    paste({ spawnFn, delayMs: 0 });
    vi.advanceTimersByTime(1);

    const [command, args, options] = spawnFn.mock.calls[0];
    expect(command).toBe('powershell.exe');
    expect(args).toEqual([...POWERSHELL_ARGS]);
    expect(options).toMatchObject({ detached: true, windowsHide: true, stdio: 'ignore' });
    expect(child.unref).toHaveBeenCalled();
  });

  it('spawn ném lỗi thì nuốt, không làm sập main process', () => {
    if (!isSupported()) return;
    const spawnFn = vi.fn(() => {
      throw new Error('không tìm thấy powershell');
    });

    paste({ spawnFn, delayMs: 0 });
    expect(() => vi.advanceTimersByTime(1)).not.toThrow();
  });

  it('nhịp chờ âm bị kẹp về 0 chứ không làm vỡ setTimeout', () => {
    if (!isSupported()) return;
    const spawnFn = vi.fn(fakeChild);
    paste({ spawnFn, delayMs: -500 });
    vi.advanceTimersByTime(1);
    expect(spawnFn).toHaveBeenCalledOnce();
  });

  it('ngoài Windows thì không làm gì cả', () => {
    if (isSupported()) return;
    const spawnFn = vi.fn(fakeChild);
    expect(paste({ spawnFn })).toBe(false);
    vi.advanceTimersByTime(1000);
    expect(spawnFn).not.toHaveBeenCalled();
  });
});
