<script>
  /**
   * So sánh hai mục, hiện cạnh nhau.
   *
   * Dòng giống hệt nhau chiếm phần lớn màn hình mà chẳng nói lên điều gì, nên có
   * nút gập chúng lại — chỉ chừa vài dòng ngữ cảnh quanh mỗi chỗ khác.
   */
  import { diffLines, summarize } from './diff.js';

  export let leftText = '';
  export let rightText = '';
  export let leftLabel = 'Mục A';
  export let rightLabel = 'Mục B';
  export let onClose = () => {};

  /** Số dòng giống nhau giữ lại hai bên mỗi chỗ khác, khi đang gập. */
  const CONTEXT = 3;

  let collapse = true;

  $: result = diffLines(leftText, rightText);
  $: rows = result.rows ?? [];
  $: stats = summarize(rows);
  $: identical = !result.tooBig && stats.added === 0 && stats.removed === 0;
  $: visible = collapse ? withContext(rows, CONTEXT) : rows.map((row) => ({ row }));

  /**
   * Giữ lại các dòng khác nhau cộng vài dòng ngữ cảnh, chỗ bị bỏ thì thay bằng
   * một dải "… n dòng giống nhau".
   */
  function withContext(all, context) {
    const keep = new Array(all.length).fill(false);
    all.forEach((row, at) => {
      if (row.type === 'same') return;
      for (let i = Math.max(0, at - context); i <= Math.min(all.length - 1, at + context); i++) {
        keep[i] = true;
      }
    });

    const out = [];
    let skipped = 0;
    all.forEach((row, at) => {
      if (keep[at]) {
        if (skipped) {
          out.push({ gap: skipped });
          skipped = 0;
        }
        out.push({ row });
      } else {
        skipped++;
      }
    });
    if (skipped) out.push({ gap: skipped });
    return out;
  }
</script>

<div class="diff">
  <div class="bar">
    <span class="title">So sánh</span>
    {#if !result.tooBig}
      <span class="stat add">+{stats.added}</span>
      <span class="stat del">−{stats.removed}</span>
      <button class="chip" class:on={collapse} on:click={() => (collapse = !collapse)}>
        Gập dòng giống nhau
      </button>
    {/if}
    <span class="grow"></span>
    <button class="chip" on:click={onClose}>Đóng (Esc)</button>
  </div>

  <div class="heads">
    <div class="head">{leftLabel}</div>
    <div class="head">{rightLabel}</div>
  </div>

  <div class="body">
    {#if result.tooBig}
      <p class="empty">{result.tooBig}</p>
    {:else if identical}
      <p class="empty">Hai mục giống hệt nhau.</p>
    {:else}
      {#each visible as entry, index (index)}
        {#if entry.gap}
          <div class="gap">… {entry.gap} dòng giống nhau</div>
        {:else}
          <div class="line {entry.row.type}">
            <span class="no">{entry.row.leftNo ?? ''}</span>
            <span class="cell left">{entry.row.left ?? ''}</span>
            <span class="no">{entry.row.rightNo ?? ''}</span>
            <span class="cell right">{entry.row.right ?? ''}</span>
          </div>
        {/if}
      {/each}
    {/if}
  </div>
</div>

<style>
  /* .detail là flex column, nên phải flex:1 + min-height:0 mới cuộn được bên
     trong thay vì đẩy cả pane dài ra. */
  .diff {
    display: flex;
    flex-direction: column;
    flex: 1;
    min-height: 0;
  }
  .bar {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 7px 12px;
    border-bottom: 1px solid var(--line);
    flex: none;
  }
  .title {
    font-size: 12px;
    font-weight: 600;
  }
  .grow {
    flex: 1;
  }
  .stat {
    font-size: 11.5px;
    font-weight: 700;
    font-variant-numeric: tabular-nums;
  }
  .stat.add {
    color: #16a34a;
  }
  .stat.del {
    color: #dc2626;
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

  .heads {
    display: grid;
    grid-template-columns: 1fr 1fr;
    flex: none;
    border-bottom: 1px solid var(--line);
  }
  .head {
    padding: 5px 12px;
    font-size: 11px;
    color: var(--muted);
    font-weight: 600;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .head + .head {
    border-left: 1px solid var(--line);
  }

  .body {
    flex: 1;
    overflow: auto;
    font-family: ui-monospace, Consolas, 'Courier New', monospace;
    font-size: 0.88em;
    line-height: 1.55;
    user-select: text;
  }

  .line {
    display: grid;
    grid-template-columns: 3.2em 1fr 3.2em 1fr;
  }
  .no {
    text-align: right;
    padding-right: 8px;
    color: var(--muted);
    opacity: 0.6;
    user-select: none;
  }
  .cell {
    padding: 0 8px;
    white-space: pre-wrap;
    word-break: break-word;
  }
  .cell.right {
    border-left: 1px solid var(--line);
  }

  .line.del .left {
    background: color-mix(in srgb, #dc2626 18%, transparent);
  }
  .line.add .right {
    background: color-mix(in srgb, #16a34a 18%, transparent);
  }

  .gap {
    padding: 3px 12px;
    color: var(--muted);
    font-size: 0.9em;
    font-style: italic;
    background: var(--field);
    border-top: 1px solid var(--line);
    border-bottom: 1px solid var(--line);
  }
  .empty {
    color: var(--muted);
    font-size: 12.5px;
    padding: 18px;
    text-align: center;
  }
</style>
