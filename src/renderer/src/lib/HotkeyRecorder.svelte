<script>
  /**
   * Ô ghi phím tắt.
   *
   * Bắt tổ hợp thật thay vì bắt người dùng gõ chuỗi "Ctrl+Alt+V" — gõ tay thì
   * sai chính tả là hỏng mà không biết vì sao.
   *
   * Dùng event.code chứ KHÔNG dùng event.key: `key` đã bị Shift và layout bàn
   * phím làm méo (Shift+2 ra "@" ở layout US, ra thứ khác ở layout khác), còn
   * `code` luôn là vị trí vật lý của phím.
   */
  export let value = '';
  export let onChange = async () => ({ ok: true });

  let recording = false;
  let error = '';
  let ok = '';

  /** Modifier bấm một mình không phải phím tắt — phải chờ phím thật. */
  const MODIFIER_CODES = /^(Control|Alt|Shift|Meta|OS)(Left|Right)?$/;

  function fromCode(code) {
    if (MODIFIER_CODES.test(code)) return null;
    if (/^Key([A-Z])$/.test(code)) return code.slice(3);
    if (/^Digit(\d)$/.test(code)) return code.slice(5);
    if (/^Numpad(\d)$/.test(code)) return `num${code.slice(6)}`;
    if (/^F\d{1,2}$/.test(code)) return code;

    const named = {
      Space: 'Space',
      Enter: 'Return',
      Tab: 'Tab',
      Backquote: '`',
      Minus: '-',
      Equal: '=',
      BracketLeft: '[',
      BracketRight: ']',
      Backslash: '\\',
      Semicolon: ';',
      Quote: "'",
      Comma: ',',
      Period: '.',
      Slash: '/',
      ArrowUp: 'Up',
      ArrowDown: 'Down',
      ArrowLeft: 'Left',
      ArrowRight: 'Right',
      Home: 'Home',
      End: 'End',
      PageUp: 'PageUp',
      PageDown: 'PageDown',
      Insert: 'Insert'
    };
    return named[code] || null;
  }

  function toAccelerator(e) {
    const parts = [];
    if (e.ctrlKey) parts.push('Control');
    if (e.altKey) parts.push('Alt');
    if (e.shiftKey) parts.push('Shift');
    if (e.metaKey) parts.push('Super');

    const key = fromCode(e.code);
    if (!key) return null; // mới giữ modifier, chưa xong
    // Bắt buộc có modifier: đăng ký một chữ cái trần là biến app thành thứ nuốt
    // phím toàn hệ thống — từ đó gõ chữ đó ở đâu cũng bật panel.
    if (!parts.length) return null;
    return [...parts, key].join('+');
  }

  export function pretty(accel) {
    if (!accel) return 'Chưa đặt';
    return String(accel)
      .replace(/CommandOrControl|Control/g, 'Ctrl')
      .replace(/Super|Meta/g, 'Win')
      .split('+')
      .join(' + ');
  }

  async function commit(accel) {
    recording = false;
    error = '';
    ok = '';
    const result = await onChange(accel);
    if (result?.ok) {
      value = accel;
      ok = 'Đã đổi phím tắt.';
      setTimeout(() => (ok = ''), 2000);
    } else {
      error = result?.error || 'Không đặt được phím tắt này.';
    }
  }

  function onKeydown(e) {
    if (!recording) return;
    e.preventDefault();
    e.stopPropagation();

    // Luôn phải có đường thoát khi đang ghi.
    if (e.code === 'Escape') {
      recording = false;
      error = '';
      return;
    }
    if (e.code === 'Delete' || e.code === 'Backspace') {
      commit('');
      return;
    }

    const accel = toAccelerator(e);
    if (!accel) return; // chưa đủ: vẫn đang giữ modifier

    if (e.metaKey) {
      // Windows giữ phần lớn tổ hợp có phím Win; đăng ký có thể "thành công"
      // nhưng không bao giờ bắn. Chặn trước còn hơn để người dùng tưởng đã xong.
      recording = false;
      error = 'Tổ hợp có phím Win bị Windows giữ, không dùng được. Chọn phím khác.';
      return;
    }
    commit(accel);
  }

  function start() {
    recording = true;
    error = '';
    ok = '';
  }
</script>

<svelte:window on:keydown|capture={onKeydown} />

<div class="wrap">
  <button class="field" class:recording on:click={start} type="button">
    {#if recording}
      <span class="hint">Nhấn tổ hợp phím…</span>
    {:else}
      <kbd>{pretty(value)}</kbd>
    {/if}
  </button>
  {#if recording}
    <span class="note">Esc để huỷ · Delete để xoá phím tắt</span>
  {/if}
  {#if error}<span class="err">{error}</span>{/if}
  {#if ok}<span class="ok">{ok}</span>{/if}
</div>

<style>
  .wrap {
    display: flex;
    flex-direction: column;
    gap: 5px;
  }
  .field {
    display: block;
    width: 100%;
    text-align: left;
    padding: 9px 11px;
    border-radius: 9px;
    border: 1px solid var(--line);
    background: var(--field);
    color: var(--fg);
    font: inherit;
    cursor: pointer;
  }
  .field:hover {
    border-color: var(--accent);
  }
  .field.recording {
    border-color: var(--accent);
    outline: 2px solid color-mix(in srgb, var(--accent) 35%, transparent);
    outline-offset: -1px;
  }
  kbd {
    font: inherit;
    font-weight: 600;
  }
  .hint {
    opacity: 0.7;
    font-style: italic;
  }
  .note,
  .err,
  .ok {
    font-size: 11.5px;
  }
  .note {
    color: var(--muted);
  }
  .err {
    color: #dc2626;
  }
  .ok {
    color: #16a34a;
  }
</style>
