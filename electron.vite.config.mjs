import { defineConfig } from 'electron-vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { resolve } from 'node:path';

export default defineConfig({
  main: {
    build: {
      rollupOptions: { input: resolve('src/main/index.js') }
    }
  },
  preload: {
    build: {
      rollupOptions: { input: resolve('src/preload/index.js') }
    }
  },
  renderer: {
    root: 'src/renderer',
    build: {
      rollupOptions: { input: resolve('src/renderer/index.html') }
    },
    plugins: [svelte()]
  }
});
