import { defineConfig, type Plugin } from 'vitest/config';
import react from '@vitejs/plugin-react';

import { createServiceWorkerSource } from './src/pwa/serviceWorkerSource';

declare const process: {
  env: {
    VITE_BASE_PATH?: string;
    GITHUB_SHA?: string;
  };
};

const base = process.env.VITE_BASE_PATH || '/';

/** Uses GitHub's commit ID as the cache build ID, with a unique fallback for local production builds. */
function getBuildFingerprint(): string {
  return process.env.GITHUB_SHA || 'local-' + Date.now().toString(36);
}

const appShellServiceWorker: Plugin = {
  name: 'digital-dj-app-shell-service-worker',
  apply: 'build',
  /** Emits a worker whose cache version changes whenever a new build is produced. */
  generateBundle(_options, bundle) {
    const assetPaths = Object.keys(bundle);
    const buildFingerprint = getBuildFingerprint();
    this.emitFile({
      type: 'asset',
      fileName: 'sw.js',
      source: createServiceWorkerSource(assetPaths, base, buildFingerprint),
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
