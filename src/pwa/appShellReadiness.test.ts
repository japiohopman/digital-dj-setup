import { describe, expect, it, vi } from 'vitest';

import { inspectAppShellReadiness } from './appShellReadiness';

function createServiceWorker(active: boolean, controlsPage: boolean) {
  return {
    ready: Promise.resolve({
      active: active ? ({} as ServiceWorker) : null,
    } as ServiceWorkerRegistration),
    controller: controlsPage ? ({} as ServiceWorker) : null,
  };
}

describe('inspectAppShellReadiness', () => {
  it('reports ready only when the active worker controls the page and all entry resources are cached', async () => {
    const resources = [
      'https://dj.example/app/',
      'https://dj.example/app/assets/main.js',
      'https://dj.example/app/assets/main.css',
    ];
    const cacheStorage = {
      match: vi.fn(async () => ({} as Response)),
    };

    await expect(inspectAppShellReadiness(
      createServiceWorker(true, true),
      cacheStorage,
      resources,
    )).resolves.toEqual({
      ready: true,
      serviceWorkerControlsPage: true,
      missingResources: [],
    });
  });

  it('reports missing entry resources instead of treating navigator.onLine as cache readiness', async () => {
    const resources = [
      'https://dj.example/app/',
      'https://dj.example/app/assets/main.js',
      'https://dj.example/app/assets/main.css',
    ];
    const cacheStorage = {
      match: vi.fn(async (url: RequestInfo) =>
        String(url).endsWith('main.js') ? undefined : ({} as Response),
      ),
    };

    await expect(inspectAppShellReadiness(
      createServiceWorker(true, true),
      cacheStorage,
      resources,
    )).resolves.toEqual({
      ready: false,
      serviceWorkerControlsPage: true,
      missingResources: ['https://dj.example/app/assets/main.js'],
    });
  });

  it('reports not ready when the worker is installed but does not control the current page', async () => {
    const cacheStorage = { match: vi.fn(async () => ({} as Response)) };

    await expect(inspectAppShellReadiness(
      createServiceWorker(true, false),
      cacheStorage,
      ['https://dj.example/app/'],
    )).resolves.toEqual({
      ready: false,
      serviceWorkerControlsPage: false,
      missingResources: [],
    });
  });

  it('reports unsupported or unavailable browser APIs without throwing', async () => {
    await expect(inspectAppShellReadiness(
      undefined,
      undefined,
      ['https://dj.example/app/'],
    )).resolves.toEqual({
      ready: false,
      serviceWorkerControlsPage: false,
      missingResources: ['https://dj.example/app/'],
    });
  });
});
