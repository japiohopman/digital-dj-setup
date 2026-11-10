import { describe, expect, it } from 'vitest';

import {
  createServiceWorkerSource,
  getPrecacheUrls,
  shouldCacheRuntimeRequest,
} from './serviceWorkerSource';

describe('PWA app-shell caching policy', () => {
  it('pre-caches the app shell, app-owned UI assets and hashed build assets', () => {
    const urls = getPrecacheUrls([
      'assets/index-a1b2c3.js',
      'assets/index-d4e5f6.css',
      'assets/turntable-123.png',
      'assets/user-audio-preview-456.mp3',
      'assets/sample-789.wav',
    ]);

    expect(urls).toContain('/');
    expect(urls).toContain('/manifest.webmanifest');
    expect(urls).toContain('/turntable/landscape/tt_case_and_lighting.png');
    expect(urls).toContain('/sounds/vinyl_loop.wav');
    expect(urls).toContain('/assets/index-a1b2c3.js');
    expect(urls).toContain('/assets/index-d4e5f6.css');
    expect(urls).toContain('/assets/turntable-123.png');
    expect(urls).not.toContain('/assets/user-audio-preview-456.mp3');
    expect(urls).not.toContain('/assets/sample-789.wav');
  });

  it('does not cache user-selected audio URLs, cross-origin requests or writes', () => {
    expect(shouldCacheRuntimeRequest(
      { method: 'GET', destination: 'audio' },
      '/uploads/my-record.mp3',
      'https://dj.example',
      'https://dj.example',
    )).toBe(false);

    expect(shouldCacheRuntimeRequest(
      { method: 'GET', destination: 'audio' },
      '/my-record.wav',
      'https://dj.example',
      'https://dj.example',
    )).toBe(false);

    expect(shouldCacheRuntimeRequest(
      { method: 'GET', destination: 'image' },
      '/album-cover.png',
      'https://images.example',
      'https://dj.example',
    )).toBe(false);

    expect(shouldCacheRuntimeRequest(
      { method: 'POST', destination: '' },
      '/api/tracks',
      'https://dj.example',
      'https://dj.example',
    )).toBe(false);
  });

  it('allows the app-owned sound effects and turntable art to work offline', () => {
    expect(shouldCacheRuntimeRequest(
      { method: 'GET', destination: '' },
      '/sounds/vinyl_loop.wav',
      'https://dj.example',
      'https://dj.example',
    )).toBe(true);

    expect(shouldCacheRuntimeRequest(
      { method: 'GET', destination: 'image' },
      '/turntable/platter.png',
      'https://dj.example',
      'https://dj.example',
    )).toBe(true);
  });

  it('generates offline navigation fallback and a versioned cache', () => {
    const source = createServiceWorkerSource(['assets/app-a1b2.js']);
    expect(source).toContain('digital-dj-shell-');
    expect(source).toContain('self.skipWaiting()');
    expect(source).toContain('self.clients.claim()');
    expect(source).toContain('await caches.match(\'/\')');
    expect(source).toContain('not available offline');
    expect(source).toContain('/assets/app-a1b2.js');
    expect(source).not.toContain('user-audio-preview');
  });
});
