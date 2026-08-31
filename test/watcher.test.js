import { describe, it, expect, beforeEach, vi } from 'vitest';

async function loadWatcher() {
  vi.resetModules();
  const electron = await import('./stubs/electron.js');
  const watcher = await import('../src/main/watcher.js');
  return { electron, watcher };
}

/**
 * Dựng một buffer CF_HDROP đúng như Windows đặt lên clipboard.
 *
 * Cấu trúc DROPFILES: pFiles(4) pt(8) fNC(4) fWide(4) = 20 byte header, rồi tới
 * danh sách đường dẫn nối nhau, mỗi cái kết thúc NUL, cả khối kết thúc NUL nữa.
 */
function hdrop(paths, { wide = true } = {}) {
  const header = Buffer.alloc(20);
  header.writeUInt32LE(20, 0); // pFiles
  header.writeUInt32LE(wide ? 1 : 0, 16); // fWide

  const listing = `${paths.join('\0')}\0\0`;
  const body = Buffer.from(listing, wide ? 'utf16le' : 'latin1');
  return Buffer.concat([header, body]);
}

let electron;
let watcher;

beforeEach(async () => {
  ({ electron, watcher } = await loadWatcher());
});

describe('readFilePaths — CF_HDROP', () => {
  it('đọc được nhiều đường dẫn từ buffer HDROP kiểu UTF-16', () => {
    const paths = ['C:\\Users\\a\\bao cao.docx', 'C:\\Users\\a\\ảnh.png'];
    electron.__setClipboard({
      formats: ['CF_HDROP'],
      buffers: { CF_HDROP: hdrop(paths) }
    });

    expect(watcher.readFilePaths()).toEqual(paths);
  });

  it('một file duy nhất cũng đọc đúng', () => {
    electron.__setClipboard({
      formats: ['CF_HDROP'],
      buffers: { CF_HDROP: hdrop(['C:\\x.txt']) }
    });
    expect(watcher.readFilePaths()).toEqual(['C:\\x.txt']);
  });

  it('HDROP kiểu ANSI (fWide = 0) cũng đọc được', () => {
    electron.__setClipboard({
      formats: ['CF_HDROP'],
      buffers: { CF_HDROP: hdrop(['C:\\x.txt'], { wide: false }) }
    });
    expect(watcher.readFilePaths()).toEqual(['C:\\x.txt']);
  });

  it('lùi về FileNameW khi không có CF_HDROP', () => {
    electron.__setClipboard({
      formats: ['FileNameW'],
      buffers: { FileNameW: Buffer.from('C:\\lui\\ve.txt\0', 'utf16le') }
    });
    expect(watcher.readFilePaths()).toEqual(['C:\\lui\\ve.txt']);
  });

  it('clipboard không có file thì trả mảng rỗng', () => {
    electron.__setClipboard({ formats: ['text/plain'], text: 'chỉ là text' });
    expect(watcher.readFilePaths()).toEqual([]);
  });

  it('buffer cụt hoặc rác thì trả rỗng chứ không ném lỗi', () => {
    for (const bad of [Buffer.alloc(0), Buffer.alloc(5), Buffer.alloc(24)]) {
      electron.__setClipboard({ formats: ['CF_HDROP'], buffers: { CF_HDROP: bad } });
      expect(() => watcher.readFilePaths()).not.toThrow();
      expect(watcher.readFilePaths()).toEqual([]);
    }
  });

  it('offset pFiles trỏ ra ngoài buffer thì từ chối', () => {
    const bogus = Buffer.alloc(40);
    bogus.writeUInt32LE(9999, 0);
    electron.__setClipboard({ formats: ['CF_HDROP'], buffers: { CF_HDROP: bogus } });
    expect(watcher.readFilePaths()).toEqual([]);
  });
});

describe('isExcluded — cờ loại trừ của Windows', () => {
  it('có cờ Clipboard Viewer Ignore thì không được lưu', () => {
    electron.__setClipboard({ formats: ['text/plain', 'Clipboard Viewer Ignore'] });
    expect(watcher.isExcluded()).toBe(true);
  });

  it('clipboard bình thường thì lưu được', () => {
    electron.__setClipboard({ formats: ['text/plain'] });
    expect(watcher.isExcluded()).toBe(false);
  });

  it('CanIncludeInClipboardHistory khác 0 nghĩa là CHO PHÉP lưu', () => {
    const allow = Buffer.alloc(4);
    allow.writeUInt32LE(1, 0);
    electron.__setClipboard({
      formats: ['text/plain', 'CanIncludeInClipboardHistory'],
      buffers: { CanIncludeInClipboardHistory: allow }
    });
    expect(watcher.isExcluded()).toBe(false);
  });

  it('CanIncludeInClipboardHistory bằng 0 nghĩa là CẤM', () => {
    electron.__setClipboard({
      formats: ['text/plain', 'CanIncludeInClipboardHistory'],
      buffers: { CanIncludeInClipboardHistory: Buffer.alloc(4) }
    });
    expect(watcher.isExcluded()).toBe(true);
  });

  it('có cờ nhưng đọc buffer hỏng thì coi như CẤM, chọn phía an toàn', () => {
    electron.__setClipboard({
      formats: ['text/plain', 'CanIncludeInClipboardHistory'],
      buffers: {} // readBuffer sẽ ném lỗi
    });
    expect(watcher.isExcluded()).toBe(true);
  });
});

describe('diagnose', () => {
  it('báo lại đủ format và trạng thái từng cờ', () => {
    electron.__setClipboard({ formats: ['text/plain', 'Clipboard Viewer Ignore'] });
    const report = watcher.diagnose();

    expect(report.formats).toContain('text/plain');
    expect(report.excluded).toBe(true);
    expect(report.flags.find((f) => f.flag === 'Clipboard Viewer Ignore').present).toBe(true);
    expect(report.flags.find((f) => f.flag === 'ExcludeClipboardContentFromMonitorProcessing').present).toBe(
      false
    );
  });
});
