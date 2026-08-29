<script>
  import HotkeyRecorder from './HotkeyRecorder.svelte';

  export let settings;
  export let onPatch;
  export let onClose;

  const api = window.clipfull;

  let diagnosis = null;
  let paths = null;

  const CORNERS = [
    ['bottom-right', 'Dưới phải'],
    ['bottom-left', 'Dưới trái'],
    ['top-right', 'Trên phải'],
    ['top-left', 'Trên trái'],
    ['center', 'Giữa màn hình']
  ];

  async function setHotkey(accel) {
    return api.hotkey.set('toggle-panel', accel);
  }

  async function diagnose() {
    diagnosis = await api.app.diagnose();
  }

  async function showPaths() {
    paths = await api.app.paths();
  }
</script>

<div class="settings">
  <header>
    <h2>Cài đặt</h2>
    <button class="icon" on:click={onClose} title="Đóng cài đặt">✕</button>
  </header>

  <div class="body">
    <section>
      <h3>Phím tắt</h3>
      <label for="hk">Mở / đóng bảng</label>
      <HotkeyRecorder value={settings.hotkeys?.['toggle-panel']} onChange={setHotkey} />
      <p class="hint">
        Tránh <b>Ctrl + Shift + V</b>: đó là "dán không định dạng" của Chrome, VS Code, Slack…
        Đặt làm phím tắt toàn cục là cướp mất phím đó ở mọi ứng dụng.
      </p>
      <p class="hint">
        Vài tổ hợp đăng ký được nhưng bị Windows nuốt nên không bao giờ chạy. Cách duy nhất
        để chắc là đóng bảng rồi bấm thử.
      </p>
    </section>

    <section>
      <h3>Giao diện</h3>

      <label for="theme">Màu nền</label>
      <select id="theme" value={settings.theme} on:change={(e) => onPatch({ theme: e.target.value })}>
        <option value="system">Theo hệ thống</option>
        <option value="light">Sáng</option>
        <option value="dark">Tối</option>
      </select>

      <label for="opacity">Độ mờ khi không rê chuột — {Math.round(settings.opacity * 100)}%</label>
      <input
        id="opacity"
        type="range"
        min="15"
        max="100"
        value={Math.round(settings.opacity * 100)}
        on:change={(e) => onPatch({ opacity: Number(e.target.value) / 100 })}
      />
      <p class="hint tight">Rê chuột vào bảng là rõ hẳn 100%.</p>

      <label for="bg">Nền</label>
      <select id="bg" value={settings.background} on:change={(e) => onPatch({ background: e.target.value })}>
        <option value="opaque">Đục</option>
        <option value="acrylic">Acrylic (Windows 11)</option>
        <option value="mica">Mica (Windows 11)</option>
      </select>

      <label for="accent">Màu nhấn</label>
      <input
        id="accent"
        type="color"
        value={settings.accent}
        on:change={(e) => onPatch({ accent: e.target.value })}
      />

      <label for="font">Cỡ chữ — {settings.fontSize}px</label>
      <input
        id="font"
        type="range"
        min="11"
        max="22"
        value={settings.fontSize}
        on:change={(e) => onPatch({ fontSize: Number(e.target.value) })}
      />

      <label for="density">Mật độ danh sách</label>
      <select
        id="density"
        value={settings.density}
        on:change={(e) => onPatch({ density: e.target.value })}
      >
        <option value="comfortable">Thoáng</option>
        <option value="compact">Gọn</option>
      </select>

      <label class="sw">
        <input
          type="checkbox"
          checked={settings.monospaceDetail}
          on:change={(e) => onPatch({ monospaceDetail: e.target.checked })}
        />
        <span>Dùng font monospace cho phần nội dung (hợp khi hay copy code)</span>
      </label>
    </section>

    <section>
      <h3>Vị trí &amp; kích thước</h3>
      <label for="corner">Bảng hiện ở góc</label>
      <select id="corner" value={settings.corner} on:change={(e) => onPatch({ corner: e.target.value })}>
        {#each CORNERS as [value, label]}
          <option {value}>{label}</option>
        {/each}
      </select>
      <p class="hint tight">Luôn tính trên màn hình đang có con trỏ chuột.</p>

      <div class="pair">
        <div>
          <label for="w">Rộng</label>
          <input
            id="w"
            type="number"
            min="620"
            step="20"
            value={settings.panelWidth}
            on:change={(e) => onPatch({ panelWidth: Number(e.target.value) })}
          />
        </div>
        <div>
          <label for="h">Cao</label>
          <input
            id="h"
            type="number"
            min="380"
            step="20"
            value={settings.panelHeight}
            on:change={(e) => onPatch({ panelHeight: Number(e.target.value) })}
          />
        </div>
      </div>
    </section>

    <section>
      <h3>Hành vi</h3>
      <label class="sw">
        <input
          type="checkbox"
          checked={settings.openAtLogin}
          on:change={(e) => onPatch({ openAtLogin: e.target.checked })}
        />
        <span>Khởi động cùng Windows</span>
      </label>
      <label class="sw">
        <input
          type="checkbox"
          checked={settings.hideOnBlur}
          on:change={(e) => onPatch({ hideOnBlur: e.target.checked })}
        />
        <span>Tự ẩn khi bấm ra ngoài</span>
      </label>
      <label class="sw">
        <input
          type="checkbox"
          checked={settings.paused}
          on:change={(e) => onPatch({ paused: e.target.checked })}
        />
        <span>Tạm dừng theo dõi clipboard</span>
      </label>

      <label for="poll">Nhịp kiểm tra clipboard — {settings.pollMs}ms</label>
      <input
        id="poll"
        type="range"
        min="100"
        max="1000"
        step="50"
        value={settings.pollMs}
        on:change={(e) => onPatch({ pollMs: Number(e.target.value) })}
      />
      <p class="hint tight">
        Thấp hơn thì bắt nhanh hơn nhưng tốn CPU hơn. Copy hai lần trong cùng một nhịp thì
        mất một lần.
      </p>

      <label for="max">Số mục tối đa (0 = không giới hạn)</label>
      <input
        id="max"
        type="number"
        min="0"
        step="50"
        value={settings.maxItems}
        on:change={(e) => onPatch({ maxItems: Number(e.target.value) })}
      />
    </section>

    <section>
      <h3>Riêng tư</h3>
      <p class="hint">
        Lịch sử nằm ở <code>index.json</code> dạng <b>chữ thường, không mã hoá</b>. Bất cứ thứ gì
        bạn copy — kể cả mật khẩu — đều nằm trong đó. ClipFull cố gắng bỏ qua nội dung được
        trình quản lý mật khẩu đánh dấu, nhưng <b>chưa được kiểm chứng</b> là Electron đọc được
        các dấu đó trên máy bạn hay không.
      </p>
      <div class="row">
        <button on:click={diagnose}>Chẩn đoán clipboard</button>
        <button on:click={showPaths}>Xem chỗ lưu</button>
      </div>
      <p class="hint tight">
        Cách kiểm tra: copy một mật khẩu từ trình quản lý mật khẩu của bạn, rồi bấm
        <b>Chẩn đoán</b>. Nếu <code>excluded</code> là <code>true</code> thì cơ chế bảo vệ đang
        chạy đúng.
      </p>

      {#if diagnosis}
        <pre class="diag">{JSON.stringify(diagnosis, null, 2)}</pre>
      {/if}
      {#if paths}
        <pre class="diag">{paths.userData}</pre>
      {/if}
    </section>

    <section>
      <button class="danger" on:click={() => api.app.quit()}>Thoát ClipFull</button>
    </section>
  </div>
</div>

<style>
  .settings {
    display: flex;
    flex-direction: column;
    height: 100%;
    overflow: hidden;
  }
  header {
    display: flex;
    align-items: center;
    padding: 10px 14px;
    border-bottom: 1px solid var(--line);
    flex: none;
  }
  h2 {
    font-size: 14px;
    margin: 0;
    flex: 1;
  }
  h3 {
    font-size: 12px;
    text-transform: uppercase;
    letter-spacing: 0.4px;
    color: var(--muted);
    margin: 0 0 10px;
  }
  .body {
    overflow: auto;
    padding: 4px 14px 18px;
  }
  section {
    padding: 14px 0;
    border-bottom: 1px solid var(--line);
  }
  section:last-child {
    border-bottom: 0;
  }
  label {
    display: block;
    font-size: 12px;
    font-weight: 600;
    color: var(--muted);
    margin: 12px 0 5px;
  }
  label.sw {
    display: flex;
    align-items: center;
    gap: 8px;
    font-weight: 500;
    color: var(--fg);
    font-size: 12.5px;
    margin: 9px 0 0;
    cursor: pointer;
  }
  label.sw input {
    width: auto;
    margin: 0;
    accent-color: var(--accent);
  }
  input,
  select {
    width: 100%;
    padding: 8px 10px;
    font: inherit;
    font-size: 13px;
    color: var(--fg);
    background: var(--field);
    border: 1px solid var(--line);
    border-radius: 9px;
  }
  input[type='range'] {
    padding: 0;
    accent-color: var(--accent);
    border: 0;
    background: none;
  }
  input[type='color'] {
    padding: 2px;
    height: 34px;
  }
  .pair {
    display: flex;
    gap: 10px;
  }
  .pair > div {
    flex: 1;
  }
  .row {
    display: flex;
    gap: 8px;
    margin-top: 10px;
  }
  button {
    font: inherit;
    font-size: 12.5px;
    font-weight: 600;
    padding: 7px 11px;
    border-radius: 9px;
    border: 1px solid var(--line);
    background: var(--field);
    color: var(--fg);
    cursor: pointer;
  }
  button:hover {
    border-color: var(--accent);
  }
  button.danger {
    color: #dc2626;
  }
  button.icon {
    border: 0;
    background: none;
    padding: 4px 8px;
  }
  .hint {
    font-size: 11.5px;
    color: var(--muted);
    line-height: 1.5;
    margin: 10px 0 0;
  }
  .hint.tight {
    margin-top: 5px;
  }
  code {
    background: var(--field);
    padding: 1px 5px;
    border-radius: 4px;
    font-size: 11.5px;
  }
  .diag {
    background: var(--field);
    border: 1px solid var(--line);
    border-radius: 8px;
    padding: 9px 11px;
    font-size: 11px;
    overflow: auto;
    max-height: 220px;
    margin-top: 10px;
    white-space: pre-wrap;
  }
</style>
