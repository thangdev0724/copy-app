<script>
  /**
   * Pane nội dung: chọn cách hiện phù hợp với thứ đang xem, và cho phép biến
   * đổi nhanh trước khi copy.
   *
   * Nhận diện chỉ là GỢI Ý — nút "Thô" luôn có mặt để quay về xem nguyên bản.
   * Đoán sai thì phiền một cú click, chứ không mất gì.
   */
  import { detect } from './detect.js';
  import { availableFor, TRANSFORMS } from './transform.js';
  import PlainViewer from './viewers/PlainViewer.svelte';
  import JsonViewer from './viewers/JsonViewer.svelte';
  import TableViewer from './viewers/TableViewer.svelte';
  import UrlViewer from './viewers/UrlViewer.svelte';
  import JwtViewer from './viewers/JwtViewer.svelte';
  import ImageViewer from './viewers/ImageViewer.svelte';
  import FilesViewer from './viewers/FilesViewer.svelte';

  /** Mục đang xem — cần `type` để biết đây là text, ảnh hay danh sách file. */
  export let item = null;

  export let text = '';
  export let query = '';
  export let settings;

  /** id phép biến đổi đang bật; App đọc để biết phải copy bản nào. */
  export let transformId = null;

  /** Người dùng ép về chế độ thô. Reset mỗi khi đổi mục. */
  export let raw = false;

  let wrap = true;

  $: transform = TRANSFORMS.find((t) => t.id === transformId) ?? null;

  // Biến đổi hỏng (JSON không parse được chẳng hạn) thì lặng lẽ hiện bản gốc —
  // nút đã bật rồi mà nội dung biến mất thì đáng sợ hơn nhiều.
  $: shown = transform ? (transform.apply(text) ?? text) : text;

  $: detected = detect(shown);
  $: kind = raw ? 'plain' : detected.kind;
  $: transforms = availableFor(text);

  // Đang tìm kiếm thì phải về chế độ thô: cây JSON gập lại hay bảng canh cột
  // đều không tô được vệt tìm kiếm, mà lúc đó người ta cần thấy chỗ khớp.
  $: searching = Boolean(query.trim());
  $: effectiveKind = searching ? 'plain' : kind;

  const KIND_LABEL = {
    json: 'JSON',
    table: 'Bảng',
    url: 'URL',
    jwt: 'JWT',
    code: 'Code',
    plain: 'Thô'
  };

  function toggleTransform(id) {
    transformId = transformId === id ? null : id;
  }
</script>

{#if item?.type === 'image'}
  <div class="body">
    <ImageViewer {item} />
  </div>
{:else if item?.type === 'files'}
  <div class="body">
    <FilesViewer paths={item.paths ?? []} />
  </div>
{:else}
  <div class="bar">
    {#if !searching && detected.kind !== 'plain'}
      <button class="chip" class:on={!raw} on:click={() => (raw = false)}>
        {KIND_LABEL[detected.kind]}{detected.meta?.lang ? ` · ${detected.meta.lang}` : ''}
      </button>
      <button class="chip" class:on={raw} on:click={() => (raw = true)}>Thô</button>
      <span class="sep"></span>
    {/if}

    {#if effectiveKind === 'plain' || effectiveKind === 'code'}
      <button
        class="chip"
        class:on={!wrap}
        on:click={() => (wrap = !wrap)}
        title="Không xuống dòng"
      >
        ⇥ Không wrap
      </button>
    {/if}

    {#each transforms as option (option.id)}
      <button
        class="chip"
        class:on={transformId === option.id}
        on:click={() => toggleTransform(option.id)}
      >
        {option.label}
      </button>
    {/each}

    {#if transform}
      <span class="applied">đang xem bản đã biến đổi — Enter copy bản này</span>
    {/if}
  </div>

  <div class="body">
    {#if searching}
      <PlainViewer
        text={shown}
        {query}
        lang={null}
        showLineNumbers={settings.showLineNumbers}
        {wrap}
        mono={settings.monospaceDetail}
      />
    {:else if effectiveKind === 'json'}
      <JsonViewer value={detected.meta.value} />
    {:else if effectiveKind === 'table'}
      <TableViewer text={shown} delimiter={detected.meta.delimiter} />
    {:else if effectiveKind === 'url'}
      <UrlViewer url={detected.meta} text={shown} />
    {:else if effectiveKind === 'jwt'}
      <JwtViewer jwt={detected.meta} />
    {:else}
      <PlainViewer
        text={shown}
        {query}
        lang={effectiveKind === 'code' ? detected.meta.lang : null}
        showLineNumbers={settings.showLineNumbers}
        {wrap}
        mono={settings.monospaceDetail}
      />
    {/if}
  </div>
{/if}

<style>
  .bar {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 5px;
    padding: 6px 12px;
    border-bottom: 1px solid var(--line);
    flex: none;
  }
  .sep {
    width: 1px;
    height: 16px;
    background: var(--line);
    margin: 0 3px;
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
    white-space: nowrap;
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
  .applied {
    font-size: 11px;
    color: var(--muted);
    font-style: italic;
  }

  .body {
    flex: 1;
    overflow: auto;
    padding: 12px 14px;
    user-select: text;
  }
</style>
