/**
 * So sánh hai đoạn text theo dòng.
 *
 * Dùng thuật toán Myers chứ không dùng LCS quy hoạch động: LCS tốn O(n×m) bộ
 * nhớ, hai file 5.000 dòng là 25 triệu ô. Myers chạy theo O((n+m)·D) với D là
 * số phép sửa — mà đúng trường hợp app này phục vụ (copy hai bản JSON gần giống
 * nhau để tìm chỗ khác) thì D rất nhỏ và nó gần như tức thì.
 *
 * Trước khi chạy còn cắt phần đầu và phần đuôi giống hệt nhau — với hai bản chỉ
 * khác một field ở giữa, bước này một mình đã bỏ đi gần hết công việc.
 */

/**
 * Trần số phép sửa. Vượt nghĩa là hai bản khác nhau quá nhiều, diff cũng không
 * còn ý nghĩa gì để đọc — thà nói thẳng còn hơn để panel treo vài giây.
 */
const MAX_EDITS = 1200;

/** Trần số dòng mỗi bên. */
export const MAX_LINES = 20_000;

/**
 * @returns {{rows: Array, truncated?: string} | {tooBig: string}}
 */
export function diffLines(leftText, rightText) {
  const left = String(leftText ?? '').split('\n');
  const right = String(rightText ?? '').split('\n');

  if (left.length > MAX_LINES || right.length > MAX_LINES) {
    return { tooBig: `Quá ${MAX_LINES.toLocaleString('vi-VN')} dòng — không so sánh được.` };
  }

  // Cắt phần đầu/đuôi giống hệt: giữ lại để hiện, nhưng không đưa vào thuật toán.
  let head = 0;
  while (head < left.length && head < right.length && left[head] === right[head]) head++;

  let tail = 0;
  while (
    tail < left.length - head &&
    tail < right.length - head &&
    left[left.length - 1 - tail] === right[right.length - 1 - tail]
  ) {
    tail++;
  }

  const midLeft = left.slice(head, left.length - tail);
  const midRight = right.slice(head, right.length - tail);

  const ops = shortestEdit(midLeft, midRight);
  if (!ops) {
    return { tooBig: 'Hai mục khác nhau quá nhiều để so sánh theo dòng.' };
  }

  const rows = [];
  let leftNo = 1;
  let rightNo = 1;

  for (let i = 0; i < head; i++) {
    rows.push({ type: 'same', left: left[i], right: right[i], leftNo: leftNo++, rightNo: rightNo++ });
  }

  for (const op of ops) {
    if (op.type === 'same') {
      rows.push({
        type: 'same',
        left: midLeft[op.a],
        right: midRight[op.b],
        leftNo: leftNo++,
        rightNo: rightNo++
      });
    } else if (op.type === 'del') {
      rows.push({ type: 'del', left: midLeft[op.a], right: null, leftNo: leftNo++, rightNo: null });
    } else {
      rows.push({ type: 'add', left: null, right: midRight[op.b], leftNo: null, rightNo: rightNo++ });
    }
  }

  for (let i = 0; i < tail; i++) {
    const at = left.length - tail + i;
    rows.push({
      type: 'same',
      left: left[at],
      right: right[right.length - tail + i],
      leftNo: leftNo++,
      rightNo: rightNo++
    });
  }

  return { rows };
}

/** Thống kê nhanh cho thanh tiêu đề. */
export function summarize(rows) {
  let added = 0;
  let removed = 0;
  for (const row of rows) {
    if (row.type === 'add') added++;
    else if (row.type === 'del') removed++;
  }
  return { added, removed, same: rows.length - added - removed };
}

/* ------------------------------------------------------------------ Myers */

/**
 * Tìm đường đi ngắn nhất trong "đồ thị sửa" của Myers, rồi lần ngược lại để
 * dựng danh sách thao tác.
 *
 * `v[k]` là hoành độ x xa nhất đạt được trên đường chéo k. Mỗi vòng d là một
 * lớp: đi được tới đâu chỉ với d phép sửa. Lưu lại từng lớp (`trace`) vì lúc
 * lần ngược cần biết ở mỗi bước đã rẽ từ đường chéo nào sang.
 */
function shortestEdit(a, b) {
  const n = a.length;
  const m = b.length;
  const max = Math.min(n + m, MAX_EDITS);
  const offset = max;
  const v = new Int32Array(2 * max + 2);
  const trace = [];

  for (let d = 0; d <= max; d++) {
    trace.push(Int32Array.prototype.slice.call(v));

    for (let k = -d; k <= d; k += 2) {
      // Chọn giữa "đi xuống" (thêm một dòng của b) và "đi sang phải" (bỏ một
      // dòng của a): lấy nhánh đang tiến xa hơn.
      let x;
      if (k === -d || (k !== d && v[k - 1 + offset] < v[k + 1 + offset])) {
        x = v[k + 1 + offset];
      } else {
        x = v[k - 1 + offset] + 1;
      }
      let y = x - k;

      // Trượt tự do qua các dòng giống nhau — đây là chỗ thuật toán ăn tiền.
      while (x < n && y < m && a[x] === b[y]) {
        x++;
        y++;
      }

      v[k + offset] = x;
      if (x >= n && y >= m) return backtrack(trace, offset, n, m);
    }
  }
  return null; // vượt trần MAX_EDITS
}

function backtrack(trace, offset, n, m) {
  const ops = [];
  let x = n;
  let y = m;

  for (let d = trace.length - 1; d >= 0 && (x > 0 || y > 0); d--) {
    const v = trace[d];
    const k = x - y;

    let prevK;
    if (k === -d || (k !== d && v[k - 1 + offset] < v[k + 1 + offset])) {
      prevK = k + 1;
    } else {
      prevK = k - 1;
    }
    const prevX = v[prevK + offset];
    const prevY = prevX - prevK;

    // Phần trượt qua các dòng giống nhau, đi ngược lại.
    while (x > prevX && y > prevY) {
      ops.push({ type: 'same', a: x - 1, b: y - 1 });
      x--;
      y--;
    }

    if (d > 0) {
      if (x === prevX) {
        ops.push({ type: 'add', b: y - 1 });
      } else {
        ops.push({ type: 'del', a: x - 1 });
      }
      x = prevX;
      y = prevY;
    }
  }

  return ops.reverse();
}
