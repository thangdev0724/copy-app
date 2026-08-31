<script>
  /**
   * Bóc một JWT ra header + payload.
   *
   * Thứ người ta mở token ra để xem gần như luôn là `exp` — nên nó được dịch
   * sang giờ người đọc được và nói thẳng còn hạn hay đã hết.
   *
   * Đây CHỈ là decode, không phải xác minh: chữ ký không hề được kiểm tra. Nói
   * rõ ra ngay trên giao diện, đừng để ai tưởng token này đã được xác thực.
   */
  import { jwtTime } from '../detect.js';
  import JsonViewer from './JsonViewer.svelte';

  export let jwt;

  /** Các trường thời gian chuẩn của JWT, tính bằng giây epoch. */
  const TIME_CLAIMS = [
    ['exp', 'Hết hạn'],
    ['iat', 'Phát hành'],
    ['nbf', 'Có hiệu lực từ']
  ];

  $: times = TIME_CLAIMS.map(([claim, label]) => ({
    claim,
    label,
    time: jwtTime(jwt.payload?.[claim])
  })).filter((entry) => entry.time);

  const format = (date) => date.toLocaleString('vi-VN');
</script>

<div class="jwt">
  <p class="warn">Chỉ decode để đọc — <b>chữ ký chưa được xác minh</b>.</p>

  {#if times.length}
    <dl>
      {#each times as entry (entry.claim)}
        <dt>{entry.label} <code>{entry.claim}</code></dt>
        <dd class:expired={entry.claim === 'exp' && entry.time.expired}>
          {format(entry.time.at)}
          {#if entry.claim === 'exp'}
            {entry.time.expired ? '— đã hết hạn' : '— còn hạn'}
          {/if}
        </dd>
      {/each}
    </dl>
  {/if}

  <h4>Header</h4>
  <JsonViewer value={jwt.header} depth={1} />

  <h4>Payload</h4>
  <JsonViewer value={jwt.payload} depth={1} />
</div>

<style>
  .jwt {
    font-size: 0.95em;
  }
  .warn {
    background: color-mix(in srgb, #b45309 14%, transparent);
    border: 1px solid color-mix(in srgb, #b45309 34%, transparent);
    border-radius: 8px;
    padding: 7px 10px;
    font-size: 12px;
    margin: 0 0 14px;
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
    font-variant-numeric: tabular-nums;
  }
  dd.expired {
    color: #dc2626;
    font-weight: 600;
  }
  code {
    background: var(--field);
    padding: 0 4px;
    border-radius: 3px;
    font-size: 0.85em;
  }
  h4 {
    font-size: 12px;
    text-transform: uppercase;
    letter-spacing: 0.4px;
    color: var(--muted);
    margin: 14px 0 6px;
  }
</style>
