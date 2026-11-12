import { describe, expect, it, vi } from 'vitest';
// @ts-expect-error Node's built-in vm module is used by the Node-based Vitest runner.
import { runInNewContext } from 'node:vm';

import {
  createServiceWorkerSource,
  getPrecachePlan,
  getPrecacheUrls,
  shouldCacheRuntimeRequest,
} from './serviceWorkerSource';

type FakeWorkerResponse = { ok: boolean };
type WorkerEvent = { waitUntil: (promise: Promise<unknown>) => void };
type WorkerListener = (event: WorkerEvent) => void;

function createServiceWorkerHarness(
  fetchResource: (url: string, init?: RequestInit) => Promise<FakeWorkerResponse>,
  timers: { setTimeout?: (callback: () => void) => number } = {},
) {
  const listeners = new Map<string, WorkerListener>();
  const cachedResources = new Map<string, FakeWorkerResponse>();
  const cache = {
    put: vi.fn(async (request: RequestInfo | URL, response: FakeWorkerResponse) => {
      cachedResources.set(String(request), response);
    }),
  };
  const self = {
    location: { origin: 'https://dj.example' },
    addEventListener: (type: string, listener: WorkerListener) => listeners.set(type, listener),
    skipWaiting: vi.fn(async () => undefined),
    clients: { claim: vi.fn(async () => undefined) },
  };
  const caches = {
    open: vi.fn(async () => cache),
    keys: vi.fn(async () => [] as string[]),
    delete: vi.fn(async () => true),
    match: vi.fn(async (request: RequestInfo | URL) => cachedResources.get(String(request))),
  };
  const setTimeout = timers.setTimeout ?? ((callback: () => void) => globalThis.setTimeout(callback, 8000) as unknown as number);

  return {
    listeners,
    self,
    caches,
    cache,
    cachedResources,
    execute(source: string) {
      runInNewContext(source, {
        self,
        caches,
        fetch: fetchResource,
        URL,
        AbortController,
        setTimeout,
        clearTimeout: globalThis.clearTimeout,
        console,
      });
    },
  };
}

function captureInstallPromise(harness: ReturnType<typeof createServiceWorkerHarness>): Promise<unknown> {
  let installPromise: Promise<unknown> | undefined;
  harness.listeners.get('install')?.({
    waitUntil: (promise) => {
      installPromise = promise;
    },
  });
  if (!installPromise) throw new Error('The generated worker did not register an install promise.');
  return installPromise;
}


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
    expect(urls).toContain('/icons/UI/album_crate.svg');
    expect(urls).toContain('/turntable/landscape/tt_case_and_lighting.png');
    expect(urls).toContain('/sounds/vinyl_loop.wav');
    expect(urls).toContain('/sounds/battle_amo/scratch_making_me_itch.mp3');
    expect(urls).toContain('/sounds/battle_amo/super_duck_breaks.mp3');
    expect(urls).toContain('/assets/index-a1b2c3.js');
    expect(urls).toContain('/assets/index-d4e5f6.css');
    expect(urls).toContain('/assets/turntable-123.png');
    expect(urls).not.toContain('/assets/user-audio-preview-456.mp3');
    expect(urls).not.toContain('/assets/sample-789.wav');
  });

  it('keeps the offline boot resources separate from best-effort media and artwork', () => {
    const plan = getPrecachePlan([
      'assets/index-a1b2c3.js',
      'assets/index-d4e5f6.css',
      'assets/turntable-123.png',
      'assets/local-font-456.woff2',
      'assets/user-audio-preview-456.mp3',
    ], '/digital-dj-setup/');

    expect(plan.critical).toContain('/digital-dj-setup/');
    expect(plan.critical).toContain('/digital-dj-setup/manifest.webmanifest');
    expect(plan.critical).toContain('/digital-dj-setup/assets/index-a1b2c3.js');
    expect(plan.critical).toContain('/digital-dj-setup/assets/index-d4e5f6.css');
    expect(plan.critical).not.toContain('/digital-dj-setup/turntable-123.png');

    expect(plan.optional).toContain('/digital-dj-setup/assets/turntable-123.png');
    expect(plan.optional).toContain('/digital-dj-setup/icons/UI/album_crate.svg');
    expect(plan.optional).toContain('/digital-dj-setup/assets/local-font-456.woff2');
    expect(plan.optional).toContain('/digital-dj-setup/turntable/landscape/tt_case_and_lighting.png');
    expect(plan.optional).toContain('/digital-dj-setup/sounds/vinyl_loop.wav');
    expect(plan.optional).not.toContain('/digital-dj-setup/assets/user-audio-preview-456.mp3');
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

  it('allows the app-owned album crate SVG to be cached as a same-origin image', () => {
    expect(shouldCacheRuntimeRequest(
      { method: 'GET', destination: 'image' },
      '/icons/UI/album_crate.svg',
      'https://dj.example',
      'https://dj.example',
    )).toBe(true);
  });

  it('allows the app-owned sound effects and turntable art to work offline', () => {
    expect(shouldCacheRuntimeRequest(
      { method: 'GET', destination: '' },
      '/sounds/vinyl_loop.wav',
      'https://dj.example',
      'https://dj.example',
    )).toBe(true);

    expect(shouldCacheRuntimeRequest(
      { method: 'GET', destination: 'audio' },
      '/sounds/battle_amo/scratch_making_me_itch.mp3',
      'https://dj.example',
      'https://dj.example',
    )).toBe(true);

    expect(shouldCacheRuntimeRequest(
      { method: 'GET', destination: 'audio' },
      '/sounds/battle_amo/super_duck_breaks.mp3',
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

  it('builds every precache URL under a GitHub Pages project path', () => {
    const urls = getPrecacheUrls(['assets/app-a1b2.js'], '/digital-dj-setup/');

    expect(urls).toContain('/digital-dj-setup/');
    expect(urls).toContain('/digital-dj-setup/manifest.webmanifest');
    expect(urls).toContain('/digital-dj-setup/icons/UI/album_crate.svg');
    expect(urls).toContain('/digital-dj-setup/turntable/landscape/tt_case_and_lighting.png');
    expect(urls).toContain('/digital-dj-setup/sounds/vinyl_loop.wav');
    expect(urls).toContain('/digital-dj-setup/sounds/battle_amo/scratch_making_me_itch.mp3');
    expect(urls).toContain('/digital-dj-setup/sounds/battle_amo/super_duck_breaks.mp3');
    expect(urls).toContain('/digital-dj-setup/assets/app-a1b2.js');
    expect(urls.every((url) => url.startsWith('/digital-dj-setup/'))).toBe(true);
  });

  it('does not apply the app-shell cache policy outside its project path', () => {
    expect(shouldCacheRuntimeRequest(
      { method: 'GET', destination: 'image' },
      '/turntable/platter.png',
      'https://dj.example',
      'https://dj.example',
      '/digital-dj-setup/',
    )).toBe(false);

    expect(shouldCacheRuntimeRequest(
      { method: 'GET', destination: 'image' },
      '/digital-dj-setup/turntable/platter.png',
      'https://dj.example',
      'https://dj.example',
      '/digital-dj-setup/',
    )).toBe(true);

    expect(shouldCacheRuntimeRequest(
      { method: 'GET', destination: 'audio' },
      '/digital-dj-setup/uploads/my-record.mp3',
      'https://dj.example',
      'https://dj.example',
      '/digital-dj-setup/',
    )).toBe(false);
  });

  it('generates a service worker whose scope and fallback use the Pages base path', () => {
    const source = createServiceWorkerSource(['assets/app-a1b2.js'], '/digital-dj-setup/');

    expect(source).toContain('const APP_BASE_PATH = "/digital-dj-setup/";');
    expect(source).toContain('"/digital-dj-setup/manifest.webmanifest"');
    expect(source).toContain('"/digital-dj-setup/assets/app-a1b2.js"');
    expect(source).not.toContain('"/assets/app-a1b2.js"');
  });

  it('changes the cache version when public asset content changes at the same URLs', () => {
    const firstBuild = createServiceWorkerSource(
      ['assets/app-a1b2.js'],
      '/digital-dj-setup/',
      'public-bytes-v1',
    );
    const secondBuild = createServiceWorkerSource(
      ['assets/app-a1b2.js'],
      '/digital-dj-setup/',
      'public-bytes-v2',
    );

    const firstCacheName = firstBuild.match(/const CACHE_NAME = "([^"]+)";/)?.[1];
    const secondCacheName = secondBuild.match(/const CACHE_NAME = "([^"]+)";/)?.[1];

    expect(firstCacheName).toBeTruthy();
    expect(secondCacheName).toBeTruthy();
    expect(firstCacheName).not.toBe(secondCacheName);
  });

  it('installs boot-critical resources before best-effort assets and never lets optional failures block the shell', () => {
    const source = createServiceWorkerSource(['assets/app-a1b2.js', 'assets/app-c3d4.css']);

    expect(source).toContain('const CRITICAL_PRECACHE_URLS =');
    expect(source).toContain('const OPTIONAL_PRECACHE_URLS =');
    expect(source).toContain('await Promise.all(CRITICAL_PRECACHE_URLS.map((url) => cachePrecacheResource(cache, url)))');
    expect(source).toContain('await Promise.allSettled(');
    expect(source).toContain('setTimeout(() => controller.abort(), 8000)');
    expect(source).toContain('clearTimeout(timeoutId)');
    expect(source).toContain('OPTIONAL_PRECACHE_URLS.map((url) => cachePrecacheResource(cache, url))');
    expect(source).toContain('await self.skipWaiting()');
  });

  it('rejects installation when a boot-critical resource cannot be cached', async () => {
    const fetchResource = vi.fn(async (url: string) => {
      if (url.endsWith('/assets/app.js')) throw new Error('critical resource unavailable');
      return { ok: true };
    });
    const worker = createServiceWorkerHarness(fetchResource);
    worker.execute(createServiceWorkerSource(['assets/app.js']));

    await expect(captureInstallPromise(worker)).rejects.toThrow('critical resource unavailable');
    expect(worker.self.skipWaiting).not.toHaveBeenCalled();
  });

  it('continues installation and activation when an optional asset cannot be cached', async () => {
    const fetchResource = vi.fn(async (url: string) => {
      if (url.includes('/turntable/')) throw new Error('optional artwork unavailable');
      return { ok: true };
    });
    const worker = createServiceWorkerHarness(fetchResource);
    worker.execute(createServiceWorkerSource(['assets/app.js']));

    await expect(captureInstallPromise(worker)).resolves.toBeUndefined();
    expect(worker.self.skipWaiting).toHaveBeenCalledOnce();

    let activationPromise: Promise<unknown> | undefined;
    worker.listeners.get('activate')?.({
      waitUntil: (promise) => {
        activationPromise = promise;
      },
    });
    await expect(activationPromise).resolves.toBeUndefined();
    expect(worker.self.clients.claim).toHaveBeenCalledOnce();
  });

  it('aborts a precache request when its eight-second timeout expires', async () => {
    const scheduledTimeouts: Array<() => void> = [];
    const receivedSignals: AbortSignal[] = [];
    const fetchResource = vi.fn((_url: string, init?: RequestInit) =>
      new Promise<FakeWorkerResponse>((_resolve, reject) => {
        const signal = init?.signal;
        if (!signal) {
          reject(new Error('fetch did not receive an abort signal'));
          return;
        }
        receivedSignals.push(signal);
        signal.addEventListener('abort', () => reject(new Error('aborted')), { once: true });
      }),
    );
    const worker = createServiceWorkerHarness(fetchResource, {
      setTimeout: (callback) => {
        scheduledTimeouts.push(callback);
        return scheduledTimeouts.length;
      },
    });
    worker.execute(createServiceWorkerSource(['assets/app.js']));
    const installPromise = captureInstallPromise(worker);

    await vi.waitFor(() => expect(receivedSignals.length).toBeGreaterThan(0));
    expect(scheduledTimeouts.length).toBeGreaterThan(0);
    scheduledTimeouts[0]?.();

    await expect(installPromise).rejects.toThrow('aborted');
    expect(receivedSignals[0]?.aborted).toBe(true);
  });

  it('generates offline navigation fallback and a versioned cache', () => {
    const source = createServiceWorkerSource(['assets/app-a1b2.js']);
    expect(source).toContain('digital-dj-shell-');
    expect(source).toContain('self.skipWaiting()');
    expect(source).toContain('self.clients.claim()');
    expect(source).toContain('const APP_SHELL_URL = new URL(APP_BASE_PATH, self.location.origin).href;');
    expect(source).toContain('await caches.match(APP_SHELL_URL)');
    expect(source).toContain('not available offline');
    expect(source).toContain('Preserve a successful page response when storage is unavailable or full.');
    expect(source).toContain('Return the successful network response even when cache storage cannot be written.');
    expect(source).toContain('/assets/app-a1b2.js');
    expect(source).not.toContain('user-audio-preview');
  });
});
