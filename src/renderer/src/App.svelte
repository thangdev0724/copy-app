<script>
  import { onMount, onDestroy } from 'svelte';
  import Settings from './lib/Settings.svelte';
  import DetailPane from './lib/DetailPane.svelte';
  import DiffView from './lib/DiffView.svelte';
  import { TRANSFORMS } from './lib/transform.js';

  const api = window.clipfull;

  let settings = null;
  let items = [];
  let query = '';
  let selectedId = null;
  let fullText = '';
  let loadingFull = false;
  let showSettings = false;
  let toast = '';
  let listEl;

  let unsubs = [];

  /**
   * Cắt hiển thị ở ngưỡng này. Ai đó copy nguyên file log 5MB thì nhét cả vào
   * DOM là treo cửa sổ — mà treo đúng lúc người ta đang cần dán.
   */
  const RENDER_LIMIT = 200_000;
  let showAll = false;

  /**
   * Kết quả tìm TOÀN VĂN từ main process: { id: {count, firstIndex} }.
   * null nghĩa là chưa tìm gì; {} nghĩa là đã tìm và không mục nào khớp.
   */
  let searchHits = null;
  let searchTimer;
  let matchIndex = 0;

  /** Phép biến đổi đang bật trong pane chi tiết, và cờ ép về xem thô. */
  let transformId = null;
  let rawView = false;
  let detailEl;

  /** Mục được ghim làm vế TRÁI của phép so sánh (Ctrl+D). */
  let compareId = null;
  let compareText = '';

  // So sánh chỉ có nghĩa khi đã chọn đủ hai mục khác nhau.
  $: comparing = Boolean(compareId && selectedId && compareId !== selectedId);
  $: compareItem = compareId ? items.find((i) => i.id === compareId) : null;

  /**
   * Ctrl+D: lần đầu ghim mục đang chọn làm vế trái, lần sau huỷ.
   * Vế phải chính là mục đang chọn, nên chỉ cần bấm ↑↓ là so với mục khác.
   */
  async function toggleCompare() {
    if (compareId) {
      compareId = null;
      compareText = '';
      return;
    }
    if (!selectedId) return;
    compareId = selectedId;
    compareText = await api.items.full(compareId);
    flash('Đã ghim mục này — chọn mục khác để so sánh');
  }

  function label(item) {
    if (!item) return '';
    return firstLine(item.preview) || `${item.chars} ký tự`;
  }

  const SEARCH_DEBOUNCE = 150;

  $: filtered = filterItems(items, query, searchHits);
  $: pinned = filtered.filter((i) => i.pinned);
  $: rest = filtered.filter((i) => !i.pinned);
  $: selected = items.find((i) => i.id === selectedId) || null;
  $: tooLong = fullText.length > RENDER_LIMIT;
  $: shownText = tooLong && !showAll ? fullText.slice(0, RENDER_LIMIT) : fullText;

  // Mục đang chọn có khớp, nhưng chỗ khớp nằm ngoài phần đang render.
  $: hiddenMatch =
    tooLong && !showAll && selectedId && (searchHits?.[selectedId]?.firstIndex ?? -1) >= RENDER_LIMIT;

  $: scheduleSearch(query);

  /**
   * Hai tầng lọc. Preview khớp ngay tại renderer để gõ không thấy khựng; kết quả
   * toàn văn từ main tới sau vài trăm ms rồi trộn thêm vào. Không làm thế thì
   * mỗi ký tự gõ ra phải chờ một vòng IPC.
   */
  function filterItems(list, q, hits) {
    const needle = q.trim().toLowerCase();
    if (!needle) return list;
    return list.filter((i) => hits?.[i.id] || i.preview.toLowerCase().includes(needle));
  }

  function scheduleSearch(q) {
    clearTimeout(searchTimer);
    const needle = q.trim();
    if (!needle) {
      searchHits = null;
      return;
    }
    searchTimer = setTimeout(async () => {
      const hits = await api.items.search(needle);
      // Gõ tiếp trong lúc chờ thì kết quả này đã lỗi thời — vứt đi, đừng để nó
      // ghi đè lên kết quả của chuỗi mới hơn.
      if (needle === query.trim()) {
        searchHits = hits;
        matchIndex = 0;
      }
    }, SEARCH_DEBOUNCE);
  }

  /**
   * Nhảy giữa các vệt tô trong pane nội dung.
   *
   * Đọc thẳng từ DOM thay vì truyền chỉ số xuống qua các component: thứ tự các
   * thẻ <mark> trong DOM đã đúng là thứ tự xuất hiện, nên không phải đánh số
   * xuyên qua PlainViewer -> Highlighted rồi ghép lại cho khớp.
   */
  function jumpMatch(delta) {
    const marks = detailEl ? [...detailEl.querySelectorAll('mark')] : [];
    if (!marks.length) return;
    matchIndex = (matchIndex + delta + marks.length) % marks.length;
    marks.forEach((mark, at) => mark.classList.toggle('current', at === matchIndex));
    marks[matchIndex].scrollIntoView({ block: 'center' });
  }

  async function refresh() {
    items = await api.items.list();
    // Mục đang chọn có thể vừa bị xoá; đừng để phần chi tiết trỏ vào hư vô.
    if (!items.some((i) => i.id === selectedId)) select(items[0]?.id ?? null);
  }

  async function select(id) {
    selectedId = id;
    showAll = false;
    fullText = '';
    matchIndex = 0;
    // Mỗi mục là một thứ khác nhau — giữ lại "Format JSON" từ mục trước rồi áp
    // lên một đoạn văn xuôi là vô nghĩa.
    transformId = null;
    rawView = false;
    if (!id) return;
    loadingFull = true;
    fullText = await api.items.full(id);
    loadingFull = false;
  }

  /**
   * Ba đường copy, xét theo thứ tự cụ thể dần:
   *   1. có bôi đen trong pane nội dung -> chỉ copy phần bôi đen
   *   2. có phép biến đổi đang bật     -> áp lên TOÀN VĂN rồi copy
   *   3. còn lại                        -> main tự đọc toàn văn từ store
   *
   * Chỗ dễ sai: ở bước 2 phải dùng `fullText` chứ không dùng bản đang hiện —
   * nội dung dài đã bị cắt ở RENDER_LIMIT để khỏi treo DOM, copy bản cắt là
   * lặng lẽ đưa cho người ta một mẩu cụt.
   */
  async function copySelected() {
    if (!selectedId) return;

    // Ảnh không có toàn văn để copy — phải dựng lại NativeImage ở main process.
    if (selected?.type === 'image') {
      return finishCopy(await api.items.copyImage(selectedId));
    }

    const picked = selectionInDetail();
    if (picked) return finishCopy(await api.items.copyText(picked));

    if (transformId) {
      const transform = TRANSFORMS.find((t) => t.id === transformId);
      const transformed = transform?.apply(fullText);
      if (typeof transformed === 'string' && transformed) {
        return finishCopy(await api.items.copyText(transformed));
      }
    }

    finishCopy(await api.items.copy(selectedId));
  }

  /** Phần bôi đen, nhưng chỉ khi nó nằm trong pane nội dung. */
  function selectionInDetail() {
    const selection = window.getSelection();
    if (!selection || selection.isCollapsed || !detailEl) return '';
    if (!detailEl.contains(selection.anchorNode) || !detailEl.contains(selection.focusNode)) {
      return '';
    }
    const picked = selection.toString();
    return picked.trim() ? picked : '';
  }

  async function finishCopy(result) {
    if (result?.ok && !settings.seenPasteHint) {
      // Bản này không tự dán, nên phải nói ra một lần — không thì người dùng chọn
      // xong thấy panel biến mất mà chẳng có gì xảy ra và tưởng app hỏng.
      await api.settings.set({ seenPasteHint: true });
      flash('Đã copy — bấm Ctrl + V để dán');
    }
  }

  function flash(message) {
    toast = message;
    setTimeout(() => (toast = ''), 2600);
  }

  function move(delta) {
    const order = [...pinned, ...rest];
    if (!order.length) return;
    const at = order.findIndex((i) => i.id === selectedId);
    const next = Math.max(0, Math.min(order.length - 1, (at === -1 ? 0 : at) + delta));
    select(order[next].id);
    listEl?.querySelector('.item.active')?.scrollIntoView({ block: 'nearest' });
  }

  async function onKey(e) {
    if (showSettings) {
      if (e.key === 'Escape') closeSettings();
      return;
    }
    if (e.key === 'Escape') {
      // Đang so sánh thì Esc thoát so sánh trước, chứ không đóng luôn cả panel.
      if (compareId) {
        compareId = null;
        compareText = '';
        return;
      }
      api.panel.hide();
      return;
    }
    if (e.key === 'd' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      toggleCompare();
      return;
    }
    // Ctrl+F là phản xạ có sẵn của mọi người khi muốn tìm — ô tìm kiếm đã nằm
    // sẵn trên đầu, chỉ cần đưa con trỏ vào đó.
    if (e.key === 'f' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      document.querySelector('.search')?.focus();
      return;
    }
    if (e.key === 'F3') {
      e.preventDefault();
      jumpMatch(e.shiftKey ? -1 : 1);
      return;
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      move(1);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      move(-1);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      copySelected();
    } else if (e.key === 'Delete' && selectedId && !isTyping(e.target)) {
      // Không chặn thì đang sửa chuỗi tìm kiếm mà bấm Delete là xoá luôn mục
      // đang chọn — mất dữ liệu vì một phím hoàn toàn vô hại.
      e.preventDefault();
      await api.items.remove(selectedId);
    }
  }

  function isTyping(target) {
    return target instanceof HTMLElement && /^(INPUT|TEXTAREA)$/.test(target.tagName);
  }

  function openSettings() {
    showSettings = true;
    api.panel.settingsOpen(true);
  }

  function closeSettings() {
    showSettings = false;
    api.panel.settingsOpen(false);
  }

  async function patch(p) {
    settings = await api.settings.set(p);
  }

  function when(ts) {
    const diff = Math.floor((Date.now() - ts) / 1000);
    if (diff < 60) return 'vừa xong';
    if (diff < 3600) return `${Math.floor(diff / 60)} phút trước`;
    if (diff < 86400) return `${Math.floor(diff / 3600)} giờ trước`;
    return new Date(ts).toLocaleDateString('vi-VN');
  }

  function firstLine(text) {
    const line = text.split('\n').find((l) => l.trim());
    return (line || '').trim().slice(0, 120);
  }

  onMount(async () => {
    settings = await api.settings.get();
    await refresh();

    unsubs = [
      api.onItemsChanged(refresh),
      api.onSettingsChanged((next) => (settings = next)),
      api.onShowSettings(openSettings),
      api.onPanelShown(() => {
        // Mỗi lần mở lại là một lượt dùng mới: xoá ô tìm kiếm, nhảy về mục mới nhất.
        query = '';
        showSettings = false;
        api.panel.settingsOpen(false);
        refresh();
        document.querySelector('.search')?.focus();
      })
    ];
  });

  onDestroy(() => unsubs.forEach((fn) => fn?.()));
</script>

<svelte:window on:keydown={onKey} />

{#if settings}
  <!-- Main process không có sự kiện hover ở cấp cửa sổ, nên độ mờ phải do đây báo sang. -->
  <!-- svelte-ignore a11y-no-static-element-interactions -->
  <div
    class="app"
    class:compact={settings.density === 'compact'}
    data-theme={settings.theme}
    style="--accent: {settings.accent}; --font: {settings.fontSize}px"
    on:mouseenter={() => api.panel.hover(true)}
    on:mouseleave={() => api.panel.hover(false)}
  >
    {#if showSettings}
      <Settings {settings} onPatch={patch} onClose={closeSettings} />
    {:else}
      <header class="bar">
        <input
          class="search"
          type="search"
          bind:value={query}
          placeholder="Tìm trong lịch sử…"
          spellcheck="false"
        />
        <span class="count">{filtered.length}</span>
        <button class="icon" title="Cài đặt" on:click={openSettings}>⚙</button>
        <button class="icon" title="Đóng (Esc)" on:click={() => api.panel.hide()}>✕</button>
      </header>

      <div class="main">
        <div class="list" bind:this={listEl}>
          {#if !filtered.length}
            <p class="empty">
              {query ? 'Không có mục nào khớp.' : 'Chưa có gì. Copy một đoạn text để bắt đầu.'}
            </p>
          {/if}

          {#if pinned.length}
            <div class="group">Đã ghim</div>
            {#each pinned as item (item.id)}
              <button
                class="item"
                class:active={item.id === selectedId}
                on:click={() => select(item.id)}
                on:dblclick={copySelected}
              >
                <span class="line">
                {#if item.id === compareId}<span class="cmp" title="Vế trái của phép so sánh">◧</span
                  >{/if}{#if item.type === 'image'}<span class="kind">🖼</span
                  >{:else if item.type === 'files'}<span class="kind">📁</span
                  >{/if}{firstLine(item.preview)}
              </span>
                <span class="meta">📌 {item.chars} ký tự · {when(item.ts)}</span>
              </button>
            {/each}
          {/if}

          {#if rest.length && pinned.length}
            <div class="group">Gần đây</div>
          {/if}
          {#each rest as item (item.id)}
            <button
              class="item"
              class:active={item.id === selectedId}
              on:click={() => select(item.id)}
              on:dblclick={copySelected}
            >
              <span class="line">
                {#if item.id === compareId}<span class="cmp" title="Vế trái của phép so sánh">◧</span
                  >{/if}{#if item.type === 'image'}<span class="kind">🖼</span
                  >{:else if item.type === 'files'}<span class="kind">📁</span
                  >{/if}{firstLine(item.preview)}
              </span>
              <span class="meta">
                {item.chars} ký tự{item.lines > 1 ? ` · ${item.lines} dòng` : ''} · {when(item.ts)}
                {#if searchHits?.[item.id]}
                  · <span class="hits">{searchHits[item.id].count} khớp</span>
                {/if}
              </span>
            </button>
          {/each}
        </div>

        <div class="detail" bind:this={detailEl}>
          {#if comparing}
            <DiffView
              leftText={compareText}
              rightText={fullText}
              leftLabel={label(compareItem)}
              rightLabel={label(selected)}
              onClose={() => {
                compareId = null;
                compareText = '';
              }}
            />
          {:else if selected}
            <div class="detail-bar">
              <span class="detail-meta">
                {selected.chars} ký tự · {selected.lines} dòng · {when(selected.ts)}
              </span>
              <button class="icon" title="Ghim" on:click={() => api.items.pin(selected.id)}>
                {selected.pinned ? '📌' : '📍'}
              </button>
              <button class="icon" title="Xoá" on:click={() => api.items.remove(selected.id)}>🗑</button>
              <button class="primary" on:click={copySelected}>Copy (Enter)</button>
            </div>

            {#if loadingFull}
              <p class="empty">Đang đọc…</p>
            {:else}
              <DetailPane
                item={selected}
                text={shownText}
                {query}
                {settings}
                bind:transformId
                bind:raw={rawView}
              />
              {#if tooLong && !showAll}
                <div class="more">
                  {#if hiddenMatch}
                    <b>Chỗ khớp nằm ngoài phần đang hiện.</b>
                  {/if}
                  Đang hiện {RENDER_LIMIT.toLocaleString('vi-VN')} / {fullText.length.toLocaleString('vi-VN')}
                  ký tự đầu.
                  <button on:click={() => (showAll = true)}>Hiện tất cả</button>
                </div>
              {/if}
            {/if}
          {:else}
            <p class="empty">Chọn một mục để xem trọn nội dung.</p>
          {/if}
        </div>
      </div>

      <footer class="bar foot">
        <span>↑↓ chọn · Enter copy · Ctrl+F tìm · F3 khớp kế · Ctrl+D so sánh · Del xoá · Esc đóng</span>
        <span class="grow"></span>
        {#if settings.paused}<span class="paused">Đang tạm dừng</span>{/if}
        <button class="link" on:click={() => api.items.clear()}>Xoá tất cả (giữ mục ghim)</button>
      </footer>
    {/if}

    {#if toast}<div class="toast">{toast}</div>{/if}
  </div>
{/if}

<style>
  :global(:root) {
    --bg: #ffffff;
    --fg: #0f172a;
    --muted: #64748b;
    --line: rgba(15, 23, 42, 0.12);
    --field: #f8fafc;
    --sel: rgba(37, 99, 235, 0.12);
  }
  :global(:root:not([data-theme='light'])) {
    color-scheme: light dark;
  }
  @media (prefers-color-scheme: dark) {
    :global(.app[data-theme='system']) {
      --bg: #0f172a;
      --fg: #e2e8f0;
      --muted: #94a3b8;
      --line: rgba(148, 163, 184, 0.22);
      --field: #1e293b;
      --sel: rgba(59, 130, 246, 0.22);
    }
  }
  :global(.app[data-theme='dark']) {
    --bg: #0f172a;
    --fg: #e2e8f0;
    --muted: #94a3b8;
    --line: rgba(148, 163, 184, 0.22);
    --field: #1e293b;
    --sel: rgba(59, 130, 246, 0.22);
  }
  :global(body) {
    margin: 0;
    overflow: hidden;
  }

  .app {
    display: flex;
    flex-direction: column;
    height: 100vh;
    background: var(--bg);
    color: var(--fg);
    font: var(--font, 14px) / 1.55 -apple-system, 'Segoe UI', Roboto, Arial, sans-serif;
    border: 1px solid var(--line);
    border-radius: 12px;
    overflow: hidden;
  }

  .bar {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 10px;
    border-bottom: 1px solid var(--line);
    flex: none;
    -webkit-app-region: drag;
  }
  .bar input,
  .bar button {
    -webkit-app-region: no-drag;
  }
  .foot {
    border-bottom: 0;
    border-top: 1px solid var(--line);
    font-size: 11.5px;
    color: var(--muted);
  }
  .grow {
    flex: 1;
  }
  .paused {
    color: #b45309;
    font-weight: 600;
  }

  .search {
    flex: 1;
    padding: 7px 10px;
    font: inherit;
    font-size: 13px;
    color: var(--fg);
    background: var(--field);
    border: 1px solid var(--line);
    border-radius: 9px;
  }
  .search:focus {
    outline: 2px solid var(--accent);
    outline-offset: -1px;
  }
  .count {
    font-size: 11.5px;
    color: var(--muted);
    min-width: 26px;
    text-align: right;
  }

  .main {
    display: flex;
    flex: 1;
    min-height: 0;
  }
  .list {
    width: 40%;
    min-width: 240px;
    max-width: 420px;
    overflow: auto;
    border-right: 1px solid var(--line);
    padding: 6px;
  }
  .group {
    font-size: 10.5px;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    color: var(--muted);
    padding: 8px 8px 4px;
  }
  .item {
    display: block;
    width: 100%;
    text-align: left;
    border: 0;
    background: none;
    color: inherit;
    font: inherit;
    padding: 9px 10px;
    border-radius: 9px;
    cursor: pointer;
  }
  .compact .item {
    padding: 6px 10px;
  }
  .item:hover {
    background: var(--field);
  }
  .item.active {
    background: var(--sel);
  }
  .line {
    display: block;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .meta {
    display: block;
    font-size: 11px;
    color: var(--muted);
    margin-top: 2px;
  }
  .compact .meta {
    display: none;
  }
  .hits {
    color: var(--accent);
    font-weight: 600;
  }
  .cmp {
    color: var(--accent);
    margin-right: 4px;
  }
  .kind {
    margin-right: 4px;
    opacity: 0.85;
  }

  .detail {
    flex: 1;
    display: flex;
    flex-direction: column;
    min-width: 0;
  }
  .detail-bar {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 7px 10px;
    border-bottom: 1px solid var(--line);
    flex: none;
  }
  .detail-meta {
    flex: 1;
    font-size: 11.5px;
    color: var(--muted);
  }
  /* Phần cuộn và font của nội dung giờ do DetailPane tự lo. Vệt tô tìm kiếm thì
     phải khai báo global ở đây: class .current được jumpMatch() gắn qua DOM, nên
     component Highlighted không nhìn thấy nó lúc biên dịch. */
  .detail :global(mark.current) {
    outline: 2px solid var(--accent);
    outline-offset: 1px;
  }
  .more {
    padding: 8px 14px;
    border-top: 1px solid var(--line);
    font-size: 11.5px;
    color: var(--muted);
    display: flex;
    align-items: center;
    gap: 10px;
  }

  .empty {
    color: var(--muted);
    font-size: 12.5px;
    padding: 18px;
    text-align: center;
  }

  button.icon {
    border: 0;
    background: none;
    color: inherit;
    font: inherit;
    cursor: pointer;
    padding: 4px 7px;
    border-radius: 7px;
  }
  button.icon:hover {
    background: var(--field);
  }
  button.primary {
    border: 0;
    background: var(--accent);
    color: #fff;
    font: inherit;
    font-size: 12.5px;
    font-weight: 600;
    padding: 6px 12px;
    border-radius: 8px;
    cursor: pointer;
  }
  button.link {
    border: 0;
    background: none;
    color: var(--muted);
    font: inherit;
    font-size: 11.5px;
    cursor: pointer;
    text-decoration: underline;
  }
  .more button {
    border: 1px solid var(--line);
    background: var(--field);
    color: var(--fg);
    font: inherit;
    font-size: 11.5px;
    padding: 4px 9px;
    border-radius: 7px;
    cursor: pointer;
  }

  .toast {
    position: fixed;
    left: 50%;
    bottom: 46px;
    transform: translateX(-50%);
    background: #15803d;
    color: #fff;
    font-size: 12px;
    font-weight: 600;
    padding: 7px 13px;
    border-radius: 999px;
    box-shadow: 0 4px 14px rgba(0, 0, 0, 0.25);
    pointer-events: none;
  }
</style>
