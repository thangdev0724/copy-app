import { defineConfig } from 'vitest/config';
import { resolve } from 'node:path';

/**
 * `electron` được thay bằng stub: store.js và watcher.js chỉ dùng vài API nhỏ
 * của Electron, nên không cần dựng cả runtime chỉ để test phần logic thuần.
 */
export default defineConfig({
  resolve: {
    alias: { electron: resolve('test/stubs/electron.js') }
  },
  test: {
    environment: 'node',
    include: ['test/**/*.test.js']
  }
});
