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
const indexFile = () => join(dir(), 'index.json');
const blobFile = (hash) => join(blobDir(), `${hash}.txt`);

function ensureDirs() {
  mkdirSync(blobDir(), { recursive: true });
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
    raw = readFileSync(indexFile(), 'utf8');
  } catch {
    items = []; // chưa có file: lần chạy đầu, hoàn toàn bình thường
    return items;
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

  // File có nội dung nhưng đọc không ra. Ghi đè lên nó là xoá vĩnh viễn lịch sử
  // của người ta trong im lặng — giữ lại bản gốc rồi mới bắt đầu lại từ đầu.
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
    writeFileSync(tmp, JSON.stringify({ version: 1, items }), 'utf8');
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

/** Toàn văn của một mục — đọc blob nếu mục đó dài. */
export function full(id) {
  const item = items.find((i) => i.id === id);
  if (!item) return '';
  if (typeof item.inline === 'string') return item.inline;
  try {
    return readFileSync(blobFile(item.hash), 'utf8');
  } catch {
    return '';
  }
}

export function hashOf(text) {
  return createHash('sha1').update(text).digest('hex');
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

  if (needle.length >= BLOB_MIN_QUERY) {
    const text = cached(item.hash, () => readBlob(item.hash));
    if (text !== null) return countIn(text, needle);
  }

  // Chuỗi tìm quá ngắn để đáng mở file, hoặc blob đọc hỏng. Preview vẫn hơn
  // không có gì — chỉ là số lần khớp sẽ thiếu.
  return countIn((item.preview || '').toLowerCase(), needle);
}

function readBlob(hash) {
  try {
    return readFileSync(blobFile(hash), 'utf8');
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
  if (existing) {
    existing.ts = Date.now();
    items = [existing, ...items.filter((i) => i !== existing)];
    schedulePersist();
    emit();
    return existing;
  }

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
      writeFileSync(blobFile(hash), value, 'utf8');
    } catch {
      // Không ghi được blob thì thà giữ mỗi preview còn hơn mất luôn mục này.
      item.truncated = true;
      item.inline = item.preview;
    }
  }

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
  try {
    unlinkSync(blobFile(item.hash));
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

/** Có blob mồ côi khi index hỏng; dọn lúc khởi động cho khỏi phình đĩa. */
export function sweepOrphanBlobs() {
  try {
    const used = new Set(items.filter((i) => i.inline === undefined).map((i) => i.hash));
    for (const name of readdirSync(blobDir())) {
      const hash = name.replace(/\.txt$/, '');
      if (!used.has(hash)) unlinkSync(join(blobDir(), name));
    }
  } catch {
    /* không quét được thì thôi, không đáng để chặn khởi động */
  }
}

export function exists() {
  return existsSync(indexFile());
}
