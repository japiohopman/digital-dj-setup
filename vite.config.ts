import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { defineConfig, type Plugin } from 'vitest/config';
import react from '@vitejs/plugin-react';

import {
  createServiceWorkerSource,
  PUBLIC_APP_ASSETS,
} from './src/pwa/serviceWorkerSource';

const base = process.env.VITE_BASE_PATH || '/';

/** Hashes emitted bundle content and public assets so cache versions change when bytes change. */
function createBuildFingerprint(bundle: Record<string, {
  type: string;
  fileName: string;
  code?: string;
  source?: string | Uint8Array;
}>): string {
  const hash = createHash('sha256');

  for (const asset of Object.values(bundle).sort((left, right) => left.fileName.localeCompare(right.fileName))) {
    hash.update(asset.fileName);
    hash.update(asset.type === 'chunk' ? asset.code ?? '' : asset.source ?? '');
  }

  const publicAssetPaths = [...PUBLIC_APP_ASSETS, '/manifest.webmanifest'];
  for (const publicAsset of publicAssetPaths) {
    const filePath = resolve(process.cwd(), 'public', publicAsset.replace(/^\/+/, ''));
    if (!existsSync(filePath)) {
      throw new Error('Missing public app-shell asset: ' + publicAsset);
    }
    hash.update(publicAsset);
    hash.update(readFileSync(filePath));
  }

  return hash.digest('hex');
}

const appShellServiceWorker: Plugin = {
  name: 'digital-dj-app-shell-service-worker',
  apply: 'build',
  /** Emits a worker whose cache name changes whenever bundled or public asset bytes change. */
  generateBundle(_options, bundle) {
    const assetPaths = Object.keys(bundle);
    const buildFingerprint = createBuildFingerprint(bundle);
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
