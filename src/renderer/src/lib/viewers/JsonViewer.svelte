<script>
  /**
   * Cây JSON gập được.
   *
   * Đệ quy bằng <svelte:self>. Mở sẵn hai tầng đầu — đủ để thấy hình dạng dữ
   * liệu ngay, mà không đổ hết một response 2000 dòng ra màn hình.
   */
  export let value;
  export let name = null;
  export let depth = 0;

  /** Nhánh quá nhiều phần tử thì cắt bớt: 10.000 hàng DOM là treo panel. */
  const MAX_CHILDREN = 500;

  let open = depth < 2;

  $: isBranch = value !== null && typeof value === 'object';
  $: isArray = Array.isArray(value);
  $: entries = isBranch ? (isArray ? value.map((v, i) => [i, v]) : Object.entries(value)) : [];
  $: shown = entries.slice(0, MAX_CHILDREN);
  $: hidden = entries.length - shown.length;

  /** {…} hay […] kèm số phần tử, để biết bên trong có gì mà không cần mở ra. */
  $: summary = isArray ? `[${entries.length}]` : `{${entries.length}}`;

  function kindOf(v) {
    if (v === null) return 'null';
    if (Array.isArray(v)) return 'array';
    return typeof v;
  }
</script>

<div class="node" style="--depth: {depth}">
  {#if isBranch}
    <button class="twist" on:click={() => (open = !open)}>
      <span class="caret" class:open>▸</span>
      {#if name !== null}<span class="key">{name}</span><span class="punct">:</span>{/if}
      <span class="summary">{summary}</span>
    </button>

    {#if open}
      <div class="children">
        {#each shown as [childName, childValue] (childName)}
          <svelte:self name={childName} value={childValue} depth={depth + 1} />
        {/each}
        {#if hidden > 0}
          <div class="more">… còn {hidden} phần tử nữa</div>
        {/if}
      </div>
    {/if}
  {:else}
    <div class="leaf">
      {#if name !== null}<span class="key">{name}</span><span class="punct">:</span>{/if}
      <span class="v v-{kindOf(value)}">{value === null ? 'null' : String(value)}</span>
    </div>
  {/if}
</div>

<style>
  .node {
    font-family: ui-monospace, Consolas, 'Courier New', monospace;
    font-size: 0.92em;
    line-height: 1.6;
  }
  .children {
    padding-left: 15px;
    border-left: 1px solid var(--line);
    margin-left: 5px;
  }
  .twist {
    display: flex;
    align-items: center;
    gap: 5px;
    width: 100%;
    text-align: left;
    border: 0;
    background: none;
    color: inherit;
    font: inherit;
    padding: 0;
    cursor: pointer;
  }
  .twist:hover .summary {
    color: var(--accent);
  }
  .caret {
    display: inline-block;
    transition: transform 0.12s;
    color: var(--muted);
  }
  .caret.open {
    transform: rotate(90deg);
  }
  .leaf {
    display: flex;
    gap: 5px;
    padding-left: 17px;
  }
  .key {
    color: #2563eb;
  }
  .punct,
  .summary {
    color: var(--muted);
  }
  .v {
    word-break: break-word;
    min-width: 0;
  }
  .v-string {
    color: #16a34a;
  }
  .v-number,
  .v-boolean {
    color: #b45309;
  }
  .v-null {
    color: var(--muted);
    font-style: italic;
  }
  .more {
    color: var(--muted);
    font-style: italic;
    padding-left: 17px;
  }

  :global(.app[data-theme='dark']) .key {
    color: #93c5fd;
  }
  :global(.app[data-theme='dark']) .v-string {
    color: #4ade80;
  }
  :global(.app[data-theme='dark']) .v-number,
  :global(.app[data-theme='dark']) .v-boolean {
    color: #fbbf24;
  }
  @media (prefers-color-scheme: dark) {
    :global(.app[data-theme='system']) .key {
      color: #93c5fd;
    }
    :global(.app[data-theme='system']) .v-string {
      color: #4ade80;
    }
    :global(.app[data-theme='system']) .v-number,
    :global(.app[data-theme='system']) .v-boolean {
      color: #fbbf24;
    }
  }
</style>
