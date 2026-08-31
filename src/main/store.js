/**
 * Kho lịch sử clipboard.
 *
 * Bố cục trên đĩa (%APPDATA%/ClipFull/history/):
 *   index.json          metadata + toàn văn của những mục NGẮN
 *   blobs/<hash>.txt    toàn văn của những mục DÀI
 *
 * Lý do tách: mục tiêu của app là "xem trọn nội dung", nên người dùng sẽ copy cả
 * file log vào đây. Giữ hết toàn văn trong RAM là vài trăm mục × vài MB — sập.
 * Danh sách chỉ cần `preview`, toàn văn đọc lười đúng lúc mở mục đó ra.
 */

import { app } from 'electron';
import { createHash } from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  writeFileSync,
  renameSync,
  unlinkSync
} from 'node:fs';
import { join } from 'node:path';
import { BLOB_MIN_QUERY, cached, countIn } from './search.js';
import * as crypt from './crypt.js';

/** Trên ngưỡng này thì text ra file riêng thay vì nằm trong index. */
const INLINE_LIMIT = 64 * 1024;

/** Số ký tự hiện trong danh sách. */
const PREVIEW_CHARS = 400;

const PERSIST_DELAY = 1500;

let items = [];
let dirty = false;
let timer = null;
const listeners = [];

/**
 * Giới hạn số mục. Tiêm từ ngoài vào thay vì để store tự đọc settings — store
 * không phụ thuộc gì ngoài Electron nên test được, và không có phụ thuộc vòng.
 */
let maxItems = 0;

export function setMaxItems(value) {
  maxItems = Math.max(0, Number(value) || 0);
  trim();
}

/* ------------------------------------------------------------------ đường dẫn */

const dir = () => join(app.getPath('userData'), 'history');
const blobDir = () => join(dir(), 'blobs');
const thumbDir = () => join(dir(), 'thumbs');
const indexFile = () => join(dir(), 'index.json');

/** Đuôi file blob theo loại nội dung. Mục 'files' không có blob — xem addFiles(). */
const BLOB_EXT = { text: 'txt', image: 'png' };

const blobName = (item) => `${item.hash}.${BLOB_EXT[item.type] ?? 'txt'}`;
const blobFile = (item) => join(blobDir(), blobName(item));
const textBlobFile = (hash) => join(blobDir(), `${hash}.txt`);
const thumbFile = (hash) => join(thumbDir(), `${hash}.png`);

function ensureDirs() {
  mkdirSync(blobDir(), { recursive: true });
  mkdirSync(thumbDir(), { recursive: true });
}

/* ---------------------------------------------------------------- vòng đời */

/**
 * Chuyện xảy ra ở lần load gần nhất mà người dùng cần biết. Lấy ra một lần rồi
 * thôi — index.js hiện dialog đúng một lần lúc khởi động.
 */
let loadError = null;

export function takeLoadError() {
  const error = loadError;
  loadError = null;
  return error;
}

export function load() {
  ensureDirs();
  loadError = null;

  let raw;
  try {
    // Đọc dạng Buffer rồi mới mở: file có thể đã mã hoá, mà đọc thẳng ra utf8
    // là biến dữ liệu nhị phân thành chuỗi rác không cứu lại được.
    raw = crypt.open(readFileSync(indexFile())).toString('utf8');
  } catch (error) {
    // Không có file là chuyện bình thường của lần chạy đầu. Còn giải mã hỏng —
    // đổi máy, đổi tài khoản Windows — thì phải xử như file hỏng, xem bên dưới.
    if (error?.code === 'ENOENT') {
      items = [];
      return items;
    }
    return recoverBrokenIndex();
  }

  // File rỗng thường là dấu vết của một lần tắt máy giữa chừng. Không có gì để
  // giữ lại nên reset lặng lẽ, khỏi làm phiền.
  if (!raw.trim()) {
    items = [];
    return items;
  }

  try {
    const parsed = JSON.parse(raw);
    items = Array.isArray(parsed.items) ? parsed.items : [];
    return items;
  } catch {
    /* rơi xuống nhánh xử lý file hỏng bên dưới */
  }

  return recoverBrokenIndex();
}

/**
 * File có nội dung nhưng đọc không ra — hỏng, hoặc mã hoá bằng khoá của một tài
 * khoản Windows khác.
 *
 * Ghi đè lên nó là xoá vĩnh viễn lịch sử của người ta trong im lặng. Giữ lại bản
 * gốc rồi mới bắt đầu lại từ đầu, và báo cho họ biết nó nằm ở đâu.
 */
function recoverBrokenIndex() {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backup = join(dir(), `index.corrupt-${stamp}.json`);
  try {
    renameSync(indexFile(), backup);
    loadError = { backup };
  } catch {
    loadError = { backup: null }; // đổi tên không được thì ít nhất vẫn phải báo
  }
  items = [];
  return items;
}

function persist() {
  ensureDirs();
  const target = indexFile();
  const tmp = `${target}.tmp`;
  try {
    writeFileSync(tmp, crypt.seal(Buffer.from(JSON.stringify({ version: 1, items }), 'utf8')));
    renameSync(tmp, target);
    dirty = false;
  } catch {
    /* thử lại ở lần ghi sau */
  }
}

/** Gom nhiều lần copy liên tiếp thành một lần ghi đĩa. */
function schedulePersist() {
  dirty = true;
  clearTimeout(timer);
  timer = setTimeout(persist, PERSIST_DELAY);
}

/** Gọi lúc thoát app: không được để mất những gì vừa copy. */
export function flush() {
  clearTimeout(timer);
  if (dirty) persist();
}

export function onChange(fn) {
  listeners.push(fn);
}

function emit() {
  for (const fn of listeners) fn();
}

/* ------------------------------------------------------------------- đọc */

/** Danh sách cho UI: ghim lên đầu, phần còn lại theo thời gian giảm dần. */
export function list() {
  const pinned = items.filter((i) => i.pinned);
  const rest = items.filter((i) => !i.pinned);
  return [...pinned, ...rest].map(({ inline, ...meta }) => meta);
}

/** Toàn văn của một mục — đọc blob nếu mục đó dài. Ảnh thì không có text. */
export function full(id) {
  const item = items.find((i) => i.id === id);
  if (!item || item.type === 'image') return '';
  if (typeof item.inline === 'string') return item.inline;
  try {
    return crypt.open(readFileSync(blobFile(item))).toString('utf8');
  } catch {
    return '';
  }
}

/** Dữ liệu PNG của một mục ảnh. Trả null nếu không phải ảnh hoặc file đã mất. */
export function imageOf(id) {
  return readImageFile(id, (item) => blobFile(item));
}

/** Ảnh thu nhỏ cho danh sách — nhẹ hơn nhiều so với dựng ảnh gốc. */
export function thumbOf(id) {
  return readImageFile(id, (item) => thumbFile(item.hash));
}

function readImageFile(id, pick) {
  const item = items.find((i) => i.id === id);
  if (!item || item.type !== 'image') return null;
  try {
    return crypt.open(readFileSync(pick(item)));
  } catch {
    return null;
  }
}

export function hashOf(text) {
  return createHash('sha1').update(text).digest('hex');
}

/* --------------------------------------------------------- export / import */

/** Định dạng file export. Tăng số này nếu sau đổi cấu trúc. */
const EXPORT_VERSION = 1;

/**
 * Gói toàn bộ lịch sử thành một object ghi ra JSON được.
 *
 * Nội dung ra đây là CHỮ THƯỜNG, kể cả khi trên đĩa đang mã hoá — file export
 * nằm ngoài tầm bảo vệ của DPAPI. Chỗ gọi phải cảnh báo người dùng.
 */
export function exportAll() {
  return {
    app: 'ClipFull',
    version: EXPORT_VERSION,
    exportedAt: new Date().toISOString(),
    items: items.map((item) => {
      const base = {
        type: item.type,
        ts: item.ts,
        pinned: Boolean(item.pinned),
        masked: Boolean(item.masked),
        uses: item.uses ?? 0
      };
      if (item.type === 'image') {
        const png = imageOf(item.id);
        return { ...base, width: item.width, height: item.height, png: png?.toString('base64') };
      }
      if (item.type === 'files') return { ...base, paths: item.paths };
      return { ...base, text: full(item.id) };
    })
  };
}

/**
 * Nạp từ file export. Dedupe theo hash lo phần trùng lặp, nên nhập đè lên lịch
 * sử đang có là an toàn — mục trùng chỉ được đẩy lên đầu.
 *
 * @returns {{added: number, skipped: number}}
 */
export function importAll(data) {
  if (!data || data.app !== 'ClipFull' || !Array.isArray(data.items)) {
    throw new Error('Không phải file export của ClipFull.');
  }

  let added = 0;
  let skipped = 0;

  // Nhập từ cuối lên đầu: addText() luôn chèn lên đầu, nên đi ngược mới giữ
  // đúng thứ tự thời gian của file gốc.
  for (const entry of [...data.items].reverse()) {
    const item = importOne(entry);
    if (item) added++;
    else skipped++;
  }
  return { added, skipped };
}

/** Tám byte mở đầu mà mọi file PNG hợp lệ đều có. */
const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

function importOne(entry) {
  try {
    if (entry.type === 'image' && entry.png) {
      // Buffer.from(x, 'base64') KHÔNG ném lỗi với chuỗi rác — nó lặng lẽ giải
      // ra một mớ byte vô nghĩa. File nhập vào là dữ liệu ngoài tầm kiểm soát,
      // nên phải tự kiểm: không đúng chữ ký PNG thì đây không phải ảnh.
      const png = Buffer.from(entry.png, 'base64');
      if (!png.subarray(0, PNG_MAGIC.length).equals(PNG_MAGIC)) return null;
      return restore(addImage({ png, thumb: png, width: entry.width, height: entry.height }), entry);
    }
    if (entry.type === 'files') return restore(addFiles(entry.paths), entry);
    if (typeof entry.text === 'string') return restore(addText(entry.text), entry);
  } catch {
    /* một mục hỏng không được làm hỏng cả lần nhập */
  }
  return null;
}

/** Trả lại mấy trường không suy ra được từ nội dung. */
function restore(item, entry) {
  if (!item) return null;
  if (Number.isFinite(entry.ts)) item.ts = entry.ts;
  if (entry.pinned) item.pinned = true;
  if (entry.masked) item.masked = true;
  if (Number.isFinite(entry.uses)) item.uses = entry.uses;
  return item;
}

/**
 * Tìm trên TOÀN VĂN, không phải trên preview.
 *
 * Đây là việc của main process chứ không phải renderer: list() cố tình không gửi
 * `inline` sang renderer, còn mục dài thì toàn văn nằm trên đĩa. Renderer lọc
 * theo preview để gõ không thấy khựng, kết quả đầy đủ trộn vào sau.
 *
 * Trả null nghĩa là "không có gì để lọc", khác hẳn với {} nghĩa là "đã tìm và
 * không mục nào khớp".
 */
export function search(query) {
  const needle = String(query ?? '')
    .trim()
    .toLowerCase();
  if (!needle) return null;

  const hits = {};
  for (const item of items) {
    const info = matchItem(item, needle);
    if (info) hits[item.id] = info;
  }
  return hits;
}

function matchItem(item, needle) {
  // Mục ngắn: toàn văn nằm sẵn trong index, khớp là chính xác tuyệt đối.
  if (typeof item.inline === 'string') {
    return countIn(cached(item.hash, () => item.inline), needle);
  }

  // Ảnh không có gì để tìm ngoài dòng mô tả trong preview.
  if (item.type === 'text' && needle.length >= BLOB_MIN_QUERY) {
    const text = cached(item.hash, () => readBlob(item.hash));
    if (text !== null) return countIn(text, needle);
  }

  // Chuỗi tìm quá ngắn để đáng mở file, hoặc blob đọc hỏng. Preview vẫn hơn
  // không có gì — chỉ là số lần khớp sẽ thiếu.
  return countIn((item.preview || '').toLowerCase(), needle);
}

function readBlob(hash) {
  try {
    return crypt.open(readFileSync(textBlobFile(hash))).toString('utf8');
  } catch {
    return null;
  }
}

/* ------------------------------------------------------------------- ghi */

/**
 * Thêm một mục text. Trả về mục vừa thêm, hoặc null nếu bỏ qua.
 *
 * Copy lại đúng nội dung cũ thì đẩy mục đó lên đầu chứ không tạo bản trùng —
 * lịch sử clipboard mà đầy bản sao thì vô dụng.
 */
export function addText(text) {
  const value = String(text ?? '');
  if (!value.trim()) return null;

  const hash = hashOf(value);
  const existing = items.find((i) => i.hash === hash);
  if (existing) return bump(existing);

  const item = {
    id: `${Date.now()}-${hash.slice(0, 8)}`,
    type: 'text',
    hash,
    ts: Date.now(),
    pinned: false,
    chars: value.length,
    lines: value.split('\n').length,
    preview: value.slice(0, PREVIEW_CHARS)
  };

  if (value.length <= INLINE_LIMIT) {
    item.inline = value;
  } else {
    ensureDirs();
    try {
      writeFileSync(blobFile(item), crypt.seal(Buffer.from(value, 'utf8')));
    } catch {
      // Không ghi được blob thì thà giữ mỗi preview còn hơn mất luôn mục này.
      item.truncated = true;
      item.inline = item.preview;
    }
  }

  return insert(item);
}

/**
 * Thêm một mục ảnh.
 *
 * Nhận buffer PNG đã dựng sẵn thay vì nhận NativeImage, để store chỉ phụ thuộc
 * `app.getPath` — phần đụng tới API ảnh của Electron nằm ở index.js.
 *
 * Ảnh LUÔN ra blob, không bao giờ inline: nhét vài MB base64 vào index.json là
 * biến file danh sách thành thứ phải đọc hết mới mở được panel.
 */
export function addImage({ png, thumb, width, height }) {
  if (!png?.length) return null;

  const hash = createHash('sha1').update(png).digest('hex');
  const existing = items.find((i) => i.hash === hash);
  if (existing) return bump(existing);

  const item = {
    id: `${Date.now()}-${hash.slice(0, 8)}`,
    type: 'image',
    hash,
    ts: Date.now(),
    pinned: false,
    width,
    height,
    bytes: png.length,
    chars: 0,
    lines: 0,
    preview: `Ảnh ${width}×${height}`
  };

  ensureDirs();
  try {
    writeFileSync(blobFile(item), crypt.seal(png));
    if (thumb?.length) writeFileSync(thumbFile(hash), crypt.seal(thumb));
  } catch {
    return null; // ghi không được thì đừng ghi một mục trỏ vào hư vô
  }

  return insert(item);
}

/**
 * Thêm một mục "đường dẫn file" (copy file trong Explorer).
 *
 * Danh sách đường dẫn nhỏ nên nằm inline luôn — vừa không cần blob, vừa khiến
 * tìm kiếm và full() chạy đúng mà không phải thêm nhánh riêng nào.
 */
export function addFiles(paths) {
  const list = (paths ?? []).map((path) => String(path)).filter(Boolean);
  if (!list.length) return null;

  const joined = list.join('\n');
  const hash = hashOf(joined);
  const existing = items.find((i) => i.hash === hash);
  if (existing) return bump(existing);

  return insert({
    id: `${Date.now()}-${hash.slice(0, 8)}`,
    type: 'files',
    hash,
    ts: Date.now(),
    pinned: false,
    paths: list,
    chars: joined.length,
    lines: list.length,
    preview: joined.slice(0, PREVIEW_CHARS),
    inline: joined
  });
}

/** Copy lại thứ đã có: đẩy lên đầu chứ không tạo bản trùng. */
function bump(item) {
  item.ts = Date.now();
  items = [item, ...items.filter((i) => i !== item)];
  schedulePersist();
  emit();
  return item;
}

function insert(item) {
  items = [item, ...items];
  trim();
  schedulePersist();
  emit();
  return item;
}

export function togglePin(id) {
  const item = items.find((i) => i.id === id);
  if (!item) return;
  item.pinned = !item.pinned;
  schedulePersist();
  emit();
}

/**
 * Đếm số lần một mục được dùng lại.
 *
 * KHÔNG chạm vào `ts`: thứ tự "gần đây" phải phản ánh lúc COPY VÀO, không phải
 * lúc lấy ra. Trộn hai thứ đó là danh sách nhảy loạn mỗi lần dùng một mục cũ.
 */
export function markUsed(id) {
  const item = items.find((i) => i.id === id);
  if (!item) return;
  item.uses = (item.uses ?? 0) + 1;
  schedulePersist();
}

/** Đánh dấu một mục là nhạy cảm: danh sách chỉ hiện dấu chấm, phải bấm mới lộ. */
export function toggleMask(id) {
  const item = items.find((i) => i.id === id);
  if (!item) return;
  item.masked = !item.masked;
  schedulePersist();
  emit();
}

/**
 * Xoá những mục quá hạn. Mục đã ghim được miễn trừ — ghim là để giữ lại.
 *
 * @param {number} days 0 nghĩa là không giới hạn thời gian.
 * @returns {number} số mục đã xoá
 */
export function sweepExpired(days) {
  const limit = Number(days) || 0;
  if (limit <= 0) return 0;

  const cutoff = Date.now() - limit * 24 * 60 * 60 * 1000;
  const dropped = items.filter((i) => !i.pinned && i.ts < cutoff);
  if (!dropped.length) return 0;

  items = items.filter((i) => i.pinned || i.ts >= cutoff);
  dropBlobs(dropped);
  schedulePersist();
  emit();
  return dropped.length;
}

/**
 * Ghi lại toàn bộ dữ liệu theo trạng thái mã hoá hiện tại.
 *
 * Gọi khi người dùng bật/tắt mã hoá. Thứ tự bắt buộc: ĐỌC hết trước (crypt.open
 * tự nhận ra file cũ đã mã hoá hay chưa), rồi mới đổi cờ, rồi mới GHI — đổi cờ
 * trước là đọc file cũ bằng chế độ mới và hỏng sạch.
 */
export function reseal(enable) {
  const payload = [];
  for (const item of items) {
    if (item.inline !== undefined) continue;
    const blob = tryRead(blobFile(item));
    const thumb = item.type === 'image' ? tryRead(thumbFile(item.hash)) : null;
    payload.push({ item, blob, thumb });
  }

  crypt.setEnabled(enable);

  ensureDirs();
  for (const { item, blob, thumb } of payload) {
    if (blob) safeWrite(blobFile(item), crypt.seal(blob));
    if (thumb) safeWrite(thumbFile(item.hash), crypt.seal(thumb));
  }
  persist();
  return crypt.isEnabled();
}

function tryRead(path) {
  try {
    return crypt.open(readFileSync(path));
  } catch {
    return null; // đọc không được thì để nguyên file đó, đừng ghi đè lên
  }
}

function safeWrite(path, buffer) {
  try {
    writeFileSync(path, buffer);
  } catch {
    /* đĩa đầy hoặc file bị khoá — lần bật/tắt sau sẽ thử lại */
  }
}

export function remove(id) {
  const item = items.find((i) => i.id === id);
  if (!item) return;
  items = items.filter((i) => i !== item);
  dropBlob(item);
  schedulePersist();
  emit();
}

/** Xoá sạch, trừ những mục đã ghim — ghim là để giữ lại. */
export function clear() {
  const dropped = items.filter((i) => !i.pinned);
  items = items.filter((i) => i.pinned);
  dropBlobs(dropped);
  schedulePersist();
  emit();
}

/**
 * Xoá blob của những mục vừa bị loại.
 *
 * BẮT BUỘC gọi SAU khi đã gán lại `items` — dropBlob() hỏi `items` xem còn ai
 * dùng chung hash không, nên nếu mục cần xoá vẫn còn trong mảng thì nó luôn tự
 * thấy chính mình và không bao giờ xoá gì cả.
 */
function dropBlobs(dropped) {
  for (const item of dropped) dropBlob(item);
}

function dropBlob(item) {
  if (typeof item.inline === 'string') return;
  // Hash có thể còn được mục khác dùng chung (cùng nội dung, đã dedupe) —
  // kiểm tra trước khi xoá file.
  if (items.some((i) => i.hash === item.hash)) return;

  remove_(blobFile(item));
  if (item.type === 'image') remove_(thumbFile(item.hash));
}

function remove_(path) {
  try {
    unlinkSync(path);
  } catch {
    /* file đã biến mất từ trước */
  }
}

/** Cắt bớt khi vượt maxItems. maxItems = 0 nghĩa là không giới hạn. */
function trim() {
  if (!maxItems) return;
  const pinned = items.filter((i) => i.pinned);
  const rest = items.filter((i) => !i.pinned);
  if (pinned.length + rest.length <= maxItems) return;

  const room = Math.max(0, maxItems - pinned.length);
  const dropped = rest.slice(room);
  items = [...pinned, ...rest.slice(0, room)];
  dropBlobs(dropped);
}

/**
 * Có blob mồ côi khi index hỏng; dọn lúc khởi động cho khỏi phình đĩa.
 *
 * So khớp theo TÊN FILE chứ không theo hash: từ khi có ảnh, một hash có thể ứng
 * với `<hash>.txt` hoặc `<hash>.png`, nên chỉ so hash là xoá nhầm file của loại
 * còn lại.
 */
export function sweepOrphanBlobs() {
  const stored = items.filter((i) => i.inline === undefined);
  sweep(blobDir(), new Set(stored.map(blobName)));
  sweep(
    thumbDir(),
    new Set(stored.filter((i) => i.type === 'image').map((i) => `${i.hash}.png`))
  );
}

function sweep(directory, used) {
  try {
    for (const name of readdirSync(directory)) {
      if (!used.has(name)) unlinkSync(join(directory, name));
    }
  } catch {
    /* không quét được thì thôi, không đáng để chặn khởi động */
  }
}

export function exists() {
  return existsSync(indexFile());
}
