/**
 * Kiểm tra có bản mới không.
 *
 * CHỈ THÔNG BÁO — không tự tải, không tự cài.
 *
 * Vì sao không làm auto-update thật: dự án giữ nguyên tắc không có runtime
 * dependency, mà tự viết phần tải + xác minh chữ ký + tráo installer là đúng
 * chỗ dễ tạo lỗ hổng thực thi mã nhất trong cả app. Nếu sau này thật sự cần
 * auto-update thì đó là lúc cân nhắc `electron-updater`, chứ không phải lúc tự
 * viết lấy. Ở đây chỉ dùng `net` — API có sẵn của Electron.
 *
 * CHƯA CẤU HÌNH KHO thì hàm này lặng lẽ không làm gì: đặt `repository` trong
 * package.json để bật.
 */

import { net, app, shell } from 'electron';

const CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000;

/** Bỏ cuộc sớm thay vì treo một request lơ lửng suốt phiên làm việc. */
const TIMEOUT_MS = 10_000;

let timer = null;

/**
 * Tách "owner/repo" từ trường repository của package.json.
 * Trả null nghĩa là chưa cấu hình — mọi thứ khác trong file này thành no-op.
 */
export function repoSlug(repository) {
  const url = typeof repository === 'string' ? repository : repository?.url;
  if (typeof url !== 'string') return null;
  const match = url.match(/github\.com[/:]([\w.-]+)\/([\w.-]+?)(?:\.git)?\/?$/i);
  return match ? `${match[1]}/${match[2]}` : null;
}

/**
 * So hai chuỗi phiên bản kiểu semver. Trả true nếu `candidate` mới hơn `current`.
 *
 * Cố ý đơn giản: chỉ so ba số major.minor.patch, bỏ tiền tố 'v' và mọi hậu tố
 * (-beta, +build). App này không phát hành bản pre-release.
 */
export function isNewer(candidate, current) {
  const parse = (value) =>
    String(value ?? '')
      .replace(/^v/i, '')
      .split(/[-+]/)[0]
      .split('.')
      .map((part) => Number.parseInt(part, 10) || 0);

  const a = parse(candidate);
  const b = parse(current);
  for (let i = 0; i < 3; i++) {
    if ((a[i] ?? 0) !== (b[i] ?? 0)) return (a[i] ?? 0) > (b[i] ?? 0);
  }
  return false;
}

/**
 * Hỏi GitHub xem bản phát hành mới nhất là gì.
 * @returns {Promise<{tag: string, url: string} | null>}
 */
export function fetchLatest(slug) {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (value) => {
      if (settled) return;
      settled = true;
      resolve(value);
    };

    const timeout = setTimeout(() => finish(null), TIMEOUT_MS);

    let request;
    try {
      request = net.request(`https://api.github.com/repos/${slug}/releases/latest`);
    } catch {
      clearTimeout(timeout);
      return finish(null);
    }

    // GitHub từ chối request không có User-Agent.
    request.setHeader('User-Agent', `ClipFull/${app.getVersion()}`);
    request.setHeader('Accept', 'application/vnd.github+json');

    request.on('response', (response) => {
      if (response.statusCode !== 200) {
        clearTimeout(timeout);
        response.on('data', () => {}); // vẫn phải đọc hết, không thì socket treo
        response.on('end', () => finish(null));
        return;
      }

      let body = '';
      response.on('data', (chunk) => {
        body += chunk;
      });
      response.on('end', () => {
        clearTimeout(timeout);
        try {
          const release = JSON.parse(body);
          finish(release?.tag_name ? { tag: release.tag_name, url: release.html_url } : null);
        } catch {
          finish(null);
        }
      });
    });

    request.on('error', () => {
      clearTimeout(timeout);
      finish(null);
    });

    request.end();
  });
}

/**
 * Kiểm tra một lần. `onUpdate({tag, url})` chỉ được gọi khi thật sự có bản mới.
 */
export async function checkOnce(slug, onUpdate) {
  if (!slug) return null;
  const latest = await fetchLatest(slug);
  if (!latest || !isNewer(latest.tag, app.getVersion())) return null;
  onUpdate?.(latest);
  return latest;
}

/** Kiểm tra lúc khởi động rồi mỗi 24 giờ. Gọi lại là đặt lại lịch. */
export function start(slug, onUpdate) {
  stop();
  if (!slug) return;
  checkOnce(slug, onUpdate);
  timer = setInterval(() => checkOnce(slug, onUpdate), CHECK_INTERVAL_MS);
}

export function stop() {
  clearInterval(timer);
  timer = null;
}

export function openReleasePage(url) {
  if (typeof url === 'string' && /^https:\/\/github\.com\//.test(url)) shell.openExternal(url);
}
