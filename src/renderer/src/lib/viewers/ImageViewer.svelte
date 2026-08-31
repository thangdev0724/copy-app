<script>
  /**
   * Hiện một mục ảnh.
   *
   * Ảnh đi qua IPC dạng data URL — CSP của panel chỉ cho `img-src 'self' data:`,
   * nên không phải mở protocol tuỳ biến hay cho renderer đọc file chỉ để hiện
   * một tấm ảnh.
   */
  const api = window.clipfull;

  export let item;

  let src = null;
  let loading = true;
  let actualSize = false;

  // Đổi mục thì nạp lại; `item.id` trong điều kiện để không nạp lại vô ích khi
  // chỉ có mấy trường khác của item thay đổi (ví dụ vừa ghim).
  $: load(item.id);

  async function load(id) {
    loading = true;
    src = null;
    actualSize = false;
    src = await api.items.image(id);
    loading = false;
  }

  const kb = (bytes) => `${Math.round(bytes / 1024).toLocaleString('vi-VN')} KB`;
</script>

<div class="image">
  <div class="meta">
    {item.width} × {item.height} px · {kb(item.bytes)}
    <button class="chip" class:on={actualSize} on:click={() => (actualSize = !actualSize)}>
      {actualSize ? 'Vừa khung' : 'Kích thước thật'}
    </button>
  </div>

  {#if loading}
    <p class="empty">Đang đọc ảnh…</p>
  {:else if src}
    <div class="frame" class:actual={actualSize}>
      <img {src} alt="Ảnh trong lịch sử clipboard, {item.width} nhân {item.height} pixel" />
    </div>
  {:else}
    <p class="empty">Không đọc được file ảnh — có thể nó đã bị xoá khỏi đĩa.</p>
  {/if}
</div>

<style>
  .image {
    display: flex;
    flex-direction: column;
    gap: 10px;
    min-height: 0;
  }
  .meta {
    display: flex;
    align-items: center;
    gap: 10px;
    font-size: 11.5px;
    color: var(--muted);
    flex: none;
  }
  .chip {
    border: 1px solid var(--line);
    background: var(--field);
    color: var(--muted);
    font: inherit;
    font-size: 11px;
    font-weight: 600;
    padding: 3px 9px;
    border-radius: 999px;
    cursor: pointer;
  }
  .chip:hover {
    border-color: var(--accent);
    color: var(--fg);
  }
  .chip.on {
    background: var(--accent);
    border-color: var(--accent);
    color: #fff;
  }

  .frame {
    /* Nền ca-rô để thấy được phần trong suốt của ảnh PNG. */
    background-image:
      linear-gradient(45deg, var(--line) 25%, transparent 25%),
      linear-gradient(-45deg, var(--line) 25%, transparent 25%),
      linear-gradient(45deg, transparent 75%, var(--line) 75%),
      linear-gradient(-45deg, transparent 75%, var(--line) 75%);
    background-size: 16px 16px;
    background-position:
      0 0,
      0 8px,
      8px -8px,
      -8px 0;
    border: 1px solid var(--line);
    border-radius: 8px;
    padding: 8px;
    overflow: auto;
  }
  .frame img {
    display: block;
    max-width: 100%;
    height: auto;
  }
  .frame.actual img {
    max-width: none;
  }
  .empty {
    color: var(--muted);
    font-size: 12.5px;
    padding: 18px;
    text-align: center;
  }
</style>
