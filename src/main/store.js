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

/** Trên ngưỡng này thì text ra file riêng thay vì nằm trong index. */
const INLINE_LIMIT = 64 * 1024;

/** Số ký tự hiện trong danh sách. */
const PREVIEW_CHARS = 400;

const PERSIST_DELAY = 1500;

let items = [];
let dirty = false;
let timer = null;
let listeners = [];

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

export function load() {
  ensureDirs();
  try {
    const raw = JSON.parse(readFileSync(indexFile(), 'utf8'));
    items = Array.isArray(raw.items) ? raw.items : [];
  } catch {
    items = []; // chưa có file, hoặc file hỏng: bắt đầu lại từ đầu
  }
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
  const keep = items.filter((i) => i.pinned);
  for (const item of items) if (!item.pinned) dropBlob(item);
  items = keep;
  schedulePersist();
  emit();
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
  for (const item of rest.slice(room)) dropBlob(item);
  items = [...pinned, ...rest.slice(0, room)];
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
