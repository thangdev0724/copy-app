<script>
  /**
   * Hiện text với các đoạn khớp được tô sáng.
   *
   * Dùng {#each} + <mark> chứ không dùng {@html}: Svelte escape từng mảnh, nên
   * nội dung clipboard không bao giờ được diễn giải thành thẻ HTML.
   *
   * Markup bên dưới cố ý viết dính liền, không xuống dòng giữa các thẻ —
   * component này nằm trong <pre>, mọi khoảng trắng thừa đều hiện ra màn hình.
   */
  import { findMatches, toSegments } from './matches.js';

  export let text = '';
  export let query = '';

  /** Vệt đang được nhảy tới bằng F3, tô đậm hơn phần còn lại. */
  export let current = -1;

  $: segments = toSegments(text, findMatches(text, query));
</script>

{#each segments as segment, index (index)}{#if segment.hit}<mark class:current={segment.hitIndex === current}>{segment.text}</mark>{:else}{segment.text}{/if}{/each}

<style>
  mark {
    background: color-mix(in srgb, var(--accent) 34%, transparent);
    color: inherit;
    border-radius: 2px;
  }
  mark.current {
    background: var(--accent);
    color: #fff;
  }
</style>
