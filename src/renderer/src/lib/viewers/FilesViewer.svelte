<script>
  /**
   * Danh sách file đang được copy (copy file trong Explorer).
   *
   * Bấm một dòng là mở Explorer trỏ thẳng vào file đó — thao tác duy nhất thật
   * sự có ích với một đường dẫn nằm trong lịch sử clipboard.
   */
  const api = window.clipfull;

  export let paths = [];

  /** Tách tên file khỏi thư mục để dòng nào cũng đọc được ngay phần quan trọng. */
  function split(path) {
    const at = Math.max(path.lastIndexOf('\\'), path.lastIndexOf('/'));
    return at === -1 ? { dir: '', name: path } : { dir: path.slice(0, at), name: path.slice(at + 1) };
  }
</script>

<div class="files">
  <p class="count">{paths.length} đường dẫn — bấm để mở trong Explorer</p>

  <ul>
    {#each paths as path, index (index)}
      {@const parts = split(path)}
      <li>
        <button on:click={() => api.shell.reveal(path)} title={path}>
          <span class="name">{parts.name}</span>
          {#if parts.dir}<span class="dir">{parts.dir}</span>{/if}
        </button>
      </li>
    {/each}
  </ul>
</div>

<style>
  .count {
    font-size: 11.5px;
    color: var(--muted);
    margin: 0 0 10px;
  }
  ul {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 3px;
  }
  button {
    display: block;
    width: 100%;
    text-align: left;
    border: 1px solid var(--line);
    background: var(--field);
    color: inherit;
    font: inherit;
    padding: 7px 10px;
    border-radius: 8px;
    cursor: pointer;
  }
  button:hover {
    border-color: var(--accent);
  }
  .name {
    display: block;
    font-weight: 600;
    word-break: break-all;
  }
  .dir {
    display: block;
    font-size: 11px;
    color: var(--muted);
    word-break: break-all;
    margin-top: 1px;
  }
</style>
