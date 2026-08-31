/**
 * Tô màu cú pháp, tự viết.
 *
 * Dự án này giữ nguyên tắc không có runtime dependency — scripts/make-icons.mjs
 * còn tự tay encode PNG thay vì kéo thư viện về. Prism/Shiki cho kết quả tinh
 * hơn, nhưng chừng này regex đủ để đọc code trong một panel clipboard, và bundle
 * không phình thêm một byte nào.
 *
 * Trả về MẢNG TOKEN chứ không trả chuỗi HTML — chỗ gọi render bằng {#each} để
 * Svelte tự escape. Nội dung clipboard là dữ liệu không kiểm soát được.
 *
 * QUY TẮC BẮT BUỘC khi thêm luật: mọi nhóm trong regex phải là nhóm KHÔNG BẮT
 * `(?:...)`. Phần tokenize dò xem nhóm thứ mấy khớp để suy ra loại token, nên
 * một nhóm bắt lạc vào là lệch toàn bộ bảng màu. Có test canh chuyện này.
 */

/** Trên ngưỡng này thì bỏ tô màu: quét regex vài trăm KB là thấy giật. */
export const HIGHLIGHT_LIMIT = 120_000;

const COMMENT_HASH = /#[^\n]*/;
const STRING_QUOTED = /'(?:\\.|[^'\\])*'|"(?:\\.|[^"\\])*"/;
const NUMBER = /\b\d(?:[\d._]*\d)?(?:[eE][+-]?\d+)?\b/;

const LANGUAGES = {
  js: [
    ['comment', /\/\/[^\n]*|\/\*[\s\S]*?\*\//],
    ['string', /`(?:\\.|[^`\\])*`|'(?:\\.|[^'\\])*'|"(?:\\.|[^"\\])*"/],
    ['number', NUMBER],
    [
      'keyword',
      /\b(?:const|let|var|function|return|if|else|for|while|do|switch|case|break|continue|class|extends|new|delete|import|export|default|from|as|async|await|try|catch|finally|throw|typeof|instanceof|in|of|this|yield|static)\b/
    ],
    ['literal', /\b(?:true|false|null|undefined|NaN|Infinity)\b/],
    ['function', /\b[A-Za-z_$][\w$]*(?=\s*\()/]
  ],

  json: [
    ['key', /"(?:\\.|[^"\\])*"(?=\s*:)/],
    ['string', /"(?:\\.|[^"\\])*"/],
    ['number', /-?\b\d(?:[\d.]*\d)?(?:[eE][+-]?\d+)?\b/],
    ['literal', /\b(?:true|false|null)\b/]
  ],

  python: [
    ['comment', COMMENT_HASH],
    ['string', /"""[\s\S]*?"""|'''[\s\S]*?'''|'(?:\\.|[^'\\])*'|"(?:\\.|[^"\\])*"/],
    ['number', NUMBER],
    [
      'keyword',
      /\b(?:def|class|return|if|elif|else|for|while|break|continue|import|from|as|try|except|finally|raise|with|lambda|yield|global|nonlocal|pass|assert|async|await|and|or|not|in|is)\b/
    ],
    ['literal', /\b(?:True|False|None|self)\b/],
    ['function', /\b[A-Za-z_]\w*(?=\s*\()/]
  ],

  sql: [
    ['comment', /--[^\n]*|\/\*[\s\S]*?\*\//],
    ['string', /'(?:''|[^'])*'/],
    ['number', NUMBER],
    [
      'keyword',
      /\b(?:SELECT|FROM|WHERE|INSERT|INTO|VALUES|UPDATE|SET|DELETE|CREATE|ALTER|DROP|TABLE|INDEX|VIEW|JOIN|LEFT|RIGHT|INNER|OUTER|FULL|ON|GROUP|ORDER|BY|HAVING|LIMIT|OFFSET|UNION|ALL|DISTINCT|AS|AND|OR|NOT|IN|EXISTS|BETWEEN|LIKE|IS|NULL|CASE|WHEN|THEN|ELSE|END|WITH|PRIMARY|FOREIGN|KEY|REFERENCES|DEFAULT|CONSTRAINT)\b/i
    ]
  ],

  html: [
    ['comment', /<!--[\s\S]*?-->/],
    ['doctype', /<!doctype[^>]*>/i],
    ['tag', /<\/?[a-zA-Z][\w:-]*/],
    ['string', STRING_QUOTED],
    ['attr', /\b[a-zA-Z_:][\w:.-]*(?=\s*=)/],
    ['tag', /\/?>/]
  ],

  css: [
    ['comment', /\/\*[\s\S]*?\*\//],
    ['string', STRING_QUOTED],
    ['selector', /^[^{}\n][^{}\n]*(?=\{)/m],
    ['property', /[a-z-]+(?=\s*:)/i],
    ['number', /-?\b\d(?:[\d.]*\d)?(?:px|em|rem|%|vh|vw|s|ms|deg|fr)?\b/],
    ['literal', /#[0-9a-fA-F]{3,8}\b/]
  ],

  shell: [
    ['comment', COMMENT_HASH],
    ['string', /'[^']*'|"(?:\\.|[^"\\])*"/],
    ['variable', /\$\{?[A-Za-z_]\w*\}?/],
    [
      'keyword',
      /\b(?:if|then|else|elif|fi|for|while|do|done|case|esac|function|return|export|local|source|echo|cd|sudo|npm|npx|git|node)\b/
    ],
    ['flag', /(?:^|\s)--?[A-Za-z][\w-]*/]
  ],

  markdown: [
    ['heading', /^#{1,6}[^\n]*/m],
    ['code', /```[\s\S]*?```|`[^`\n]+`/],
    ['bold', /\*\*[^*\n]+\*\*|__[^_\n]+__/],
    ['link', /\[[^\]\n]*\]\([^)\n]*\)/],
    ['bullet', /^[ \t]*(?:[-*+]|\d+\.)\s/m]
  ]
};

/** Ghép các luật của một ngôn ngữ thành một regex duy nhất, quét một lượt. */
function compile(rules) {
  const source = rules.map(([, pattern]) => `(${pattern.source})`).join('|');
  const flags = rules.some(([, pattern]) => pattern.flags.includes('i')) ? 'gmi' : 'gm';
  return { pattern: new RegExp(source, flags), types: rules.map(([type]) => type) };
}

const COMPILED = Object.fromEntries(
  Object.entries(LANGUAGES).map(([lang, rules]) => [lang, compile(rules)])
);

export const SUPPORTED = Object.keys(LANGUAGES);

/**
 * Cắt text thành token. Ngôn ngữ không biết, hoặc text quá dài, thì trả về đúng
 * một token không màu — chỗ gọi không phải xử lý trường hợp riêng nào.
 */
export function tokenize(text, lang) {
  const spec = COMPILED[lang];
  const value = String(text ?? '');
  if (!spec || value.length > HIGHLIGHT_LIMIT) {
    return [{ text: value, type: null }];
  }

  const tokens = [];
  let last = 0;
  spec.pattern.lastIndex = 0;

  let match;
  while ((match = spec.pattern.exec(value)) !== null) {
    // Luật nào đó khớp chuỗi rỗng thì exec() đứng yên tại chỗ — đẩy con trỏ đi
    // một bước để không kẹt vòng lặp vô hạn.
    if (match[0] === '') {
      spec.pattern.lastIndex++;
      continue;
    }
    if (match.index > last) tokens.push({ text: value.slice(last, match.index), type: null });

    let type = null;
    for (let group = 1; group < match.length; group++) {
      if (match[group] !== undefined) {
        type = spec.types[group - 1];
        break;
      }
    }
    tokens.push({ text: match[0], type });
    last = match.index + match[0].length;
  }

  if (last < value.length) tokens.push({ text: value.slice(last), type: null });
  return tokens;
}

/**
 * Như tokenize() nhưng gom theo dòng, để hiện số dòng được.
 *
 * Phải tokenize TOÀN VĂN trước rồi mới cắt theo dòng — cắt dòng trước rồi mới
 * tokenize là chuỗi nhiều dòng và comment khối bị vỡ ở mỗi lần xuống dòng.
 */
export function tokenizeLines(text, lang) {
  const lines = [[]];
  for (const token of tokenize(text, lang)) {
    const parts = token.text.split('\n');
    parts.forEach((part, index) => {
      if (index > 0) lines.push([]);
      if (part) lines[lines.length - 1].push({ text: part, type: token.type });
    });
  }
  return lines;
}
