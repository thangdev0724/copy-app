<script>
  /**
   * Bóc một URL ra thành phần.
   *
   * Giá trị thật nằm ở query string: nó thường bị encode phần trăm tới mức
   * không đọc nổi, mà đó lại chính là chỗ người ta cần nhìn.
   */
  export let url;
  export let text = '';
</script>

<div class="url">
  <div class="full">{text}</div>

  <dl>
    <dt>Giao thức</dt>
    <dd>{url.protocol}</dd>

    <dt>Máy chủ</dt>
    <dd class="host">{url.host}</dd>

    <dt>Đường dẫn</dt>
    <dd>{url.path || '/'}</dd>

    {#if url.hash}
      <dt>Neo</dt>
      <dd>{url.hash}</dd>
    {/if}
  </dl>

  {#if url.params.length}
    <h4>Tham số ({url.params.length}) — đã decode</h4>
    <table>
      <tbody>
        {#each url.params as param, index (index)}
          <tr>
            <td class="k">{param.key}</td>
            <td class="v">{param.value}</td>
          </tr>
        {/each}
      </tbody>
    </table>
  {:else}
    <p class="none">Không có tham số truy vấn.</p>
  {/if}
</div>

<style>
  .url {
    font-size: 0.95em;
  }
  .full {
    font-family: ui-monospace, Consolas, 'Courier New', monospace;
    font-size: 0.9em;
    word-break: break-all;
    background: var(--field);
    border: 1px solid var(--line);
    border-radius: 8px;
    padding: 8px 10px;
    margin-bottom: 14px;
  }
  dl {
    display: grid;
    grid-template-columns: auto 1fr;
    gap: 4px 14px;
    margin: 0 0 16px;
  }
  dt {
    color: var(--muted);
    font-size: 12px;
  }
  dd {
    margin: 0;
    word-break: break-all;
  }
  .host {
    font-weight: 600;
  }
  h4 {
    font-size: 12px;
    text-transform: uppercase;
    letter-spacing: 0.4px;
    color: var(--muted);
    margin: 0 0 7px;
  }
  table {
    border-collapse: collapse;
    width: 100%;
  }
  td {
    border: 1px solid var(--line);
    padding: 5px 9px;
    vertical-align: top;
    word-break: break-word;
  }
  .k {
    color: #2563eb;
    font-weight: 600;
    white-space: nowrap;
    width: 1%;
  }
  .v {
    font-family: ui-monospace, Consolas, 'Courier New', monospace;
    font-size: 0.9em;
  }
  .none {
    color: var(--muted);
    font-size: 12px;
  }
  :global(.app[data-theme='dark']) .k {
    color: #93c5fd;
  }
  @media (prefers-color-scheme: dark) {
    :global(.app[data-theme='system']) .k {
      color: #93c5fd;
    }
  }
</style>
