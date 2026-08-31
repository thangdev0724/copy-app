<script>
  /**
   * Hiện CSV/TSV thành bảng canh cột.
   *
   * Dòng đầu coi là tiêu đề — gần như luôn đúng với dữ liệu dán từ Excel hay
   * xuất từ database, và nếu sai thì chỉ là một hàng bị in đậm.
   */
  import { splitRow } from '../detect.js';

  export let text = '';
  export let delimiter = '\t';

  /** Cắt bớt để không dựng hàng chục nghìn ô: mỗi ô là một node DOM. */
  const MAX_ROWS = 1000;

  $: lines = text.split('\n').filter((line) => line.trim());
  $: rows = lines.slice(0, MAX_ROWS).map((line) => splitRow(line, delimiter));
  $: header = rows[0] ?? [];
  $: body = rows.slice(1);
  $: hidden = lines.length - rows.length;
</script>

<div class="wrap">
  <table>
    <thead>
      <tr>
        <th class="rownum" scope="col">#</th>
        {#each header as cell, index (index)}
          <th scope="col">{cell}</th>
        {/each}
      </tr>
    </thead>
    <tbody>
      {#each body as row, index (index)}
        <tr>
          <td class="rownum">{index + 1}</td>
          {#each header as _, column (column)}
            <td>{row[column] ?? ''}</td>
          {/each}
        </tr>
      {/each}
    </tbody>
  </table>

  {#if hidden > 0}
    <p class="more">… còn {hidden.toLocaleString('vi-VN')} dòng nữa, xem bằng chế độ Thô.</p>
  {/if}
</div>

<style>
  /* Bảng rộng phải tự cuộn ngang bên trong, không được đẩy cả panel giãn ra. */
  .wrap {
    overflow-x: auto;
    max-width: 100%;
  }
  table {
    border-collapse: collapse;
    font-size: 0.92em;
    white-space: nowrap;
  }
  th,
  td {
    border: 1px solid var(--line);
    padding: 4px 9px;
    text-align: left;
    max-width: 380px;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  th {
    background: var(--field);
    font-weight: 600;
    position: sticky;
    top: 0;
  }
  .rownum {
    color: var(--muted);
    text-align: right;
    user-select: none;
    font-variant-numeric: tabular-nums;
  }
  tbody tr:hover td {
    background: var(--field);
  }
  .more {
    color: var(--muted);
    font-size: 11.5px;
    padding: 8px 2px 0;
    margin: 0;
  }
</style>
