import { defineConfig, type Plugin } from 'vitest/config';
import react from '@vitejs/plugin-react';

import { createServiceWorkerSource } from './src/pwa/serviceWorkerSource';

const base = process.env.VITE_BASE_PATH || '/';

const appShellServiceWorker: Plugin = {
  name: 'digital-dj-app-shell-service-worker',
  apply: 'build',
  generateBundle(_options, bundle) {
    const assetPaths = Object.keys(bundle);
    this.emitFile({
      type: 'asset',
      fileName: 'sw.js',
      source: createServiceWorkerSource(assetPaths, base),
    });
  },
};

export default defineConfig({
  base,
  plugins: [react(), appShellServiceWorker],
  test: {
    environment: 'jsdom',
  },
});
