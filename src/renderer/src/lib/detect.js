/**
 * Đoán xem một mục clipboard thật ra là cái gì.
 *
 * Đây là chỗ "xem trọn nội dung" nâng lên thành "xem hiểu nội dung" — thứ duy
 * nhất Win+V không làm. Kết quả chỉ là GỢI Ý: người dùng luôn bật lại được về
 * chế độ thô, nên đoán sai thì phiền chứ không hỏng.
 *
 * Mọi hàm ở đây phải rẻ. Nó chạy mỗi lần chọn một mục, trên nội dung có thể dài
 * vài MB.
 */

/** Trên ngưỡng này thì không thử JSON.parse nữa — parse vài MB là thấy khựng. */
const JSON_PARSE_LIMIT = 2 * 1024 * 1024;

/** Bảng quá dài thì không dựng <table>: vài chục nghìn ô là treo panel. */
const TABLE_MAX_ROWS = 5000;

const JWT_SHAPE = /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]*$/;

/**
 * Thứ tự xét là từ hẹp tới rộng. JWT trước URL vì token không chứa khoảng
 * trắng và dễ bị nhầm; JSON trước bảng vì `[1,2]` cũng trông như một dòng CSV.
 */
export function detect(text) {
  const trimmed = String(text ?? '').trim();
  if (!trimmed) return { kind: 'plain' };

  const jwt = trimmed.length < 8192 && JWT_SHAPE.test(trimmed) ? decodeJwt(trimmed) : null;
  if (jwt) return { kind: 'jwt', meta: jwt };

  const url = parseUrl(trimmed);
  if (url) return { kind: 'url', meta: url };

  const json = parseJson(trimmed);
  if (json) return { kind: 'json', meta: json };

  const table = detectTable(text);
  if (table) return { kind: 'table', meta: table };

  const lang = detectLanguage(text);
  if (lang) return { kind: 'code', meta: { lang } };

  return { kind: 'plain' };
}

/* -------------------------------------------------------------------- JWT */

export function decodeJwt(token) {
  const [rawHeader, rawPayload] = token.split('.');
  const header = decodeJwtPart(rawHeader);
  const payload = decodeJwtPart(rawPayload);
  // Header của JWT luôn có `alg`. Thiếu nó thì đây chỉ là chuỗi ba đoạn ngăn
  // bằng dấu chấm, không phải token.
  if (!header || !payload || typeof header.alg !== 'string') return null;
  return { header, payload };
}

function decodeJwtPart(part) {
  if (!part) return null;
  try {
    const base64 = part.replace(/-/g, '+').replace(/_/g, '/');
    const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4);
    const bytes = Uint8Array.from(atob(padded), (c) => c.charCodeAt(0));
    return JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    return null;
  }
}

/** Giây epoch -> chuỗi người đọc được. Dùng cho exp/iat/nbf của JWT. */
export function jwtTime(seconds) {
  if (typeof seconds !== 'number' || !Number.isFinite(seconds)) return null;
  const at = new Date(seconds * 1000);
  if (Number.isNaN(at.getTime())) return null;
  return { at, expired: at.getTime() < Date.now() };
}

/* -------------------------------------------------------------------- URL */

export function parseUrl(text) {
  // URL không bao giờ có khoảng trắng hay xuống dòng — loại sớm cho rẻ.
  if (/\s/.test(text) || text.length > 8192) return null;
  if (!/^https?:\/\//i.test(text)) return null;

  let url;
  try {
    url = new URL(text);
  } catch {
    return null;
  }
  return {
    protocol: url.protocol.replace(':', ''),
    host: url.host,
    path: url.pathname,
    hash: url.hash,
    // Query string đã decode sẵn — đây thường là cái người ta thật sự muốn đọc.
    params: [...url.searchParams.entries()].map(([key, value]) => ({ key, value }))
  };
}

/* ------------------------------------------------------------------- JSON */

export function parseJson(text) {
  const first = text[0];
  if (first !== '{' && first !== '[') return null;
  if (text.length > JSON_PARSE_LIMIT) return null;
  try {
    const value = JSON.parse(text);
    // JSON.parse('123') cũng chạy, nhưng một con số thì chẳng có gì để gập.
    if (value === null || typeof value !== 'object') return null;
    return { value };
  } catch {
    return null;
  }
}

/* ------------------------------------------------------------------ bảng */

/**
 * Tách một dòng CSV/TSV, tôn trọng dấu nháy kép và nháy đôi lồng ("" -> ").
 * Viết tay vì đây là toàn bộ phần CSV mà app cần — kéo cả thư viện về cho việc
 * này là không đáng.
 */
export function splitRow(line, delimiter) {
  const cells = [];
  let cell = '';
  let quoted = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (quoted) {
      if (ch !== '"') {
        cell += ch;
      } else if (line[i + 1] === '"') {
        cell += '"';
        i++;
      } else {
        quoted = false;
      }
    } else if (ch === '"') {
      quoted = true;
    } else if (ch === delimiter) {
      cells.push(cell);
      cell = '';
    } else {
      cell += ch;
    }
  }
  cells.push(cell);
  return cells;
}

/**
 * Tab là dấu hiệu MẠNH: dán từ Excel ra là TSV, còn văn xuôi và code gần như
 * không bao giờ có tab đều đặn giữa các cột.
 *
 * Ba dấu còn lại YẾU — chúng xuất hiện đầy trong code và văn xuôi — nên phải
 * đòi thêm bằng chứng, xem hàm bên dưới.
 */
const STRONG_DELIMITERS = ['\t'];
const WEAK_DELIMITERS = [',', ';', '|'];

export function detectTable(text) {
  const lines = text.split('\n').filter((line) => line.trim());
  if (lines.length < 2 || lines.length > TABLE_MAX_ROWS) return null;

  const sample = lines.slice(0, 20);

  for (const delimiter of [...STRONG_DELIMITERS, ...WEAK_DELIMITERS]) {
    const counts = sample.map((line) => splitRow(line, delimiter).length);
    const columns = counts[0];

    // Mọi dòng mẫu phải cùng số cột — đây là thứ phân biệt bảng thật với văn
    // xuôi tình cờ có dấu phẩy.
    if (columns < 2 || !counts.every((count) => count === columns)) continue;

    if (WEAK_DELIMITERS.includes(delimiter) && !looksLikeRealTable(sample, delimiter)) continue;

    return { delimiter, columns, rows: lines.length };
  }
  return null;
}

/**
 * Bằng chứng phụ cho các dấu phân cách yếu.
 *
 * Dấu hiệu quyết định là ô CUỐI RỖNG: `const x = 1;` tách theo `;` ra
 * ['const x = 1', ''] — trong bảng thật, cột cuối rỗng ở mọi dòng là chuyện gần
 * như không xảy ra, còn trong code thì dòng nào cũng kết thúc bằng `;`. Không
 * có luật này thì mọi đoạn JavaScript đều bị hiển thị thành bảng hai cột.
 */
function looksLikeRealTable(sample, delimiter) {
  return sample.every((line) => {
    const cells = splitRow(line, delimiter);
    return cells[cells.length - 1].trim() !== '';
  });
}

/* --------------------------------------------------------------- ngôn ngữ */

/**
 * Đoán ngôn ngữ bằng dấu hiệu đặc trưng nhất của từng loại. Thứ tự quan trọng:
 * dấu hiệu hẹp (shebang, doctype) đứng trước dấu hiệu rộng (từ khoá chung).
 */
const LANGUAGE_HINTS = [
  ['shell', /^#!.*\b(?:bash|sh|zsh|fish)\b/m],
  ['html', /^\s*<(?:!doctype|html|head|body|div|span|table|section)\b/im],
  ['python', /^\s*(?:def |class |import |from \S+ import |if __name__)/m],
  ['sql', /\b(?:SELECT\s+[\s\S]*\bFROM\b|INSERT\s+INTO|UPDATE\s+\S+\s+SET|CREATE\s+TABLE)\b/i],
  ['css', /^[^{}\n]*\{[^{}]*[a-z-]+\s*:\s*[^{};]+;/m],
  ['js', /(?:^|\s)(?:const|let|var|function|=>|require\(|export\s+(?:default|const|function))/],
  ['markdown', /^(?:#{1,6}\s+\S|\s*[-*]\s+\S|```)/m],
  ['shell', /^\s*(?:\$ |sudo |npm |git |cd |ls |echo )/m]
];

export function detectLanguage(text) {
  const head = text.slice(0, 8192);
  for (const [lang, pattern] of LANGUAGE_HINTS) {
    if (pattern.test(head)) return lang;
  }
  return null;
}
