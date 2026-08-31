<script>
  /**
   * Hiện text thô, có thể kèm số dòng và tô màu cú pháp.
   *
   * Quy tắc: ĐANG TÌM KIẾM thì tô vệt tìm kiếm, KHÔNG tô cú pháp. Chồng hai lớp
   * tô lên nhau vừa rối mắt vừa làm phần đánh số vệt tô phức tạp lên nhiều, mà
   * lúc đang tìm thì người ta cần thấy chỗ khớp chứ không cần thấy từ khoá.
   */
  import { tokenizeLines, tokenize } from '../highlight.js';
  import Highlighted from '../Highlighted.svelte';

  export let text = '';
  export let query = '';
  export let lang = null;
  export let showLineNumbers = false;
  export let wrap = true;
  export let mono = false;

  /** Nhiều hơn chừng này dòng thì bỏ đánh số: mỗi dòng là một hàng DOM riêng. */
  const LINE_NUMBER_LIMIT = 5000;

  $: searching = Boolean(query.trim());
  $: effectiveLang = searching ? null : lang;

  $: lines = showLineNumbers ? tokenizeLines(text, effectiveLang) : null;
  $: numbered = Boolean(lines) && lines.length <= LINE_NUMBER_LIMIT;
  $: flatTokens = numbered ? null : tokenize(text, effectiveLang);

  const plainOf = (line) => line.map((token) => token.text).join('');
</script>

{#if numbered}
  <div class="numbered" class:mono class:nowrap={!wrap}>
    {#each lines as line, index (index)}
      <div class="row">
        <span class="ln">{index + 1}</span><span class="lt"
          >{#if searching}<Highlighted text={plainOf(line)} {query} />{:else}{#each line as token, at (at)}<span
                class="t-{token.type ?? 'none'}">{token.text}</span
              >{/each}{/if}</span
        >
      </div>
    {/each}
  </div>
{:else}
  <div class="flat" class:mono class:nowrap={!wrap}>
    {#if searching}<Highlighted {text} {query} />{:else}{#each flatTokens as token, at (at)}<span
          class="t-{token.type ?? 'none'}">{token.text}</span
        >{/each}{/if}
  </div>
{/if}

<style>
  .flat,
  .numbered {
    white-space: pre-wrap;
    word-break: break-word;
    font: inherit;
  }
  .nowrap {
    white-space: pre;
    word-break: normal;
  }
  .mono {
    font-family: ui-monospace, Consolas, 'Courier New', monospace;
    font-size: 0.92em;
  }

  .row {
    display: flex;
    gap: 10px;
  }
  .ln {
    flex: none;
    width: 3.4em;
    text-align: right;
    color: var(--muted);
    opacity: 0.65;
    user-select: none;
    /* Số dòng không được cuộn theo khi dòng dài bị wrap xuống nhiều hàng. */
    align-self: flex-start;
  }
  .lt {
    flex: 1;
    min-width: 0;
  }

  /* Bảng màu cú pháp. Dùng một dải hẹp, đủ phân biệt mà không thành cầu vồng. */
  .t-comment {
    color: var(--muted);
    font-style: italic;
  }
  .t-string,
  .t-code {
    color: #16a34a;
  }
  .t-number,
  .t-literal {
    color: #b45309;
  }
  .t-keyword,
  .t-tag,
  .t-doctype,
  .t-bullet {
    color: #7c3aed;
  }
  .t-key,
  .t-attr,
  .t-property {
    color: #2563eb;
  }
  .t-function,
  .t-selector,
  .t-heading {
    color: #0891b2;
  }
  .t-variable,
  .t-flag,
  .t-link {
    color: #db2777;
  }
  .t-bold,
  .t-heading {
    font-weight: 700;
  }

  /* Nền tối cần màu sáng hơn, không thì chữ chìm hẳn vào nền. */
  :global(.app[data-theme='dark']) .t-string,
  :global(.app[data-theme='dark']) .t-code {
    color: #4ade80;
  }
  :global(.app[data-theme='dark']) .t-number,
  :global(.app[data-theme='dark']) .t-literal {
    color: #fbbf24;
  }
  :global(.app[data-theme='dark']) .t-keyword,
  :global(.app[data-theme='dark']) .t-tag,
  :global(.app[data-theme='dark']) .t-doctype,
  :global(.app[data-theme='dark']) .t-bullet {
    color: #c4b5fd;
  }
  :global(.app[data-theme='dark']) .t-key,
  :global(.app[data-theme='dark']) .t-attr,
  :global(.app[data-theme='dark']) .t-property {
    color: #93c5fd;
  }
  :global(.app[data-theme='dark']) .t-function,
  :global(.app[data-theme='dark']) .t-selector,
  :global(.app[data-theme='dark']) .t-heading {
    color: #67e8f9;
  }
  :global(.app[data-theme='dark']) .t-variable,
  :global(.app[data-theme='dark']) .t-flag,
  :global(.app[data-theme='dark']) .t-link {
    color: #f9a8d4;
  }

  @media (prefers-color-scheme: dark) {
    :global(.app[data-theme='system']) .t-string,
    :global(.app[data-theme='system']) .t-code {
      color: #4ade80;
    }
    :global(.app[data-theme='system']) .t-number,
    :global(.app[data-theme='system']) .t-literal {
      color: #fbbf24;
    }
    :global(.app[data-theme='system']) .t-keyword,
    :global(.app[data-theme='system']) .t-tag,
    :global(.app[data-theme='system']) .t-doctype,
    :global(.app[data-theme='system']) .t-bullet {
      color: #c4b5fd;
    }
    :global(.app[data-theme='system']) .t-key,
    :global(.app[data-theme='system']) .t-attr,
    :global(.app[data-theme='system']) .t-property {
      color: #93c5fd;
    }
    :global(.app[data-theme='system']) .t-function,
    :global(.app[data-theme='system']) .t-selector,
    :global(.app[data-theme='system']) .t-heading {
      color: #67e8f9;
    }
    :global(.app[data-theme='system']) .t-variable,
    :global(.app[data-theme='system']) .t-flag,
    :global(.app[data-theme='system']) .t-link {
      color: #f9a8d4;
    }
  }
</style>
