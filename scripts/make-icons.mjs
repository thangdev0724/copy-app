/**
 * Sinh icon cho tray và cho installer, không cần thư viện ngoài.
 *
 * PNG được ghi tay (chunk IHDR/IDAT/IEND + zlib của Node), còn ICO thì bọc
 * thẳng PNG vào — Windows Vista trở lên đọc được ICO chứa PNG, nên không phải
 * encode BMP kiểu cũ.
 *
 * Chạy: npm run icons
 */

import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

const OUT = join(process.cwd(), 'build');

function crc32(buf) {
  let c;
  const table = [];
  for (let n = 0; n < 256; n++) {
    c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  let crc = 0xffffffff;
  for (const byte of buf) crc = table[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

/** @param {(x:number,y:number)=>[number,number,number,number]} shade */
function png(size, shade) {
  const rows = [];
  for (let y = 0; y < size; y++) {
    const row = Buffer.alloc(size * 4 + 1);
    row[0] = 0; // filter: none
    for (let x = 0; x < size; x++) {
      const [r, g, b, a] = shade(x, y);
      row.writeUInt8(r, 1 + x * 4);
      row.writeUInt8(g, 2 + x * 4);
      row.writeUInt8(b, 3 + x * 4);
      row.writeUInt8(a, 4 + x * 4);
    }
    rows.push(row);
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(Buffer.concat(rows), { level: 9 })),
    chunk('IEND', Buffer.alloc(0))
  ]);
}

/** Bọc các PNG vuông thành một file .ico nhiều kích thước. */
function ico(images) {
  const count = images.length;
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2); // type: icon
  header.writeUInt16LE(count, 4);

  const entries = [];
  let offset = 6 + count * 16;
  for (const { size, data } of images) {
    const e = Buffer.alloc(16);
    e[0] = size >= 256 ? 0 : size; // 0 nghĩa là 256
    e[1] = size >= 256 ? 0 : size;
    e[2] = 0; // số màu trong bảng màu
    e[4] = 1; // color planes
    e.writeUInt16LE(32, 6); // bits per pixel
    e.writeUInt32LE(data.length, 8);
    e.writeUInt32LE(offset, 12);
    entries.push(e);
    offset += data.length;
  }
  return Buffer.concat([header, ...entries, ...images.map((i) => i.data)]);
}

/* --------------------------------------------------------------- hình vẽ */

/** Hai tấm thẻ chồng nhau — ẩn dụ quen thuộc của clipboard/bản sao. */
function makeShade(paused) {
  const BLUE = [37, 99, 235];
  const GREY = [120, 132, 150];
  const ink = paused ? GREY : BLUE;

  return (size) => (x, y) => {
    const u = x / size;
    const v = y / size;

    const inRect = (x0, y0, x1, y1) => u >= x0 && u <= x1 && v >= y0 && v <= y1;
    const onEdge = (x0, y0, x1, y1, t) =>
      inRect(x0, y0, x1, y1) &&
      !(u >= x0 + t && u <= x1 - t && v >= y0 + t && v <= y1 - t);

    const t = 0.055;

    // Thẻ sau: chỉ viền, mờ hơn.
    if (onEdge(0.16, 0.1, 0.68, 0.74, t)) return [...ink, 130];
    // Thẻ trước: đặc.
    if (inRect(0.32, 0.26, 0.86, 0.9)) {
      // ba vạch chữ bên trong thẻ trước
      const line = (yy) => v >= yy && v <= yy + 0.055 && u >= 0.41 && u <= 0.77;
      if (line(0.4) || line(0.53) || line(0.66)) return [255, 255, 255, 235];
      return [...ink, 255];
    }
    return [0, 0, 0, 0];
  };
}

mkdirSync(OUT, { recursive: true });

const shade = makeShade(false);
const shadePaused = makeShade(true);

writeFileSync(join(OUT, 'tray.png'), png(32, shade(32)));
writeFileSync(join(OUT, 'tray-paused.png'), png(32, shadePaused(32)));

writeFileSync(
  join(OUT, 'icon.ico'),
  ico([16, 32, 48, 64, 128, 256].map((size) => ({ size, data: png(size, shade(size)) })))
);

console.log('Đã sinh build/tray.png, build/tray-paused.png, build/icon.ico');
