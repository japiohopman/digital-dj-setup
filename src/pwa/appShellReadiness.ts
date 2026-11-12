export interface AppShellReadiness {
  ready: boolean;
  serviceWorkerControlsPage: boolean;
  missingResources: string[];
}

export type AppShellServiceWorker = Pick<ServiceWorkerContainer, 'ready' | 'controller'>;
export type AppShellCacheStorage = Pick<CacheStorage, 'match'>;

/**
 * Confirms that an active service worker controls this page and that the exact
 * HTML/JS/CSS entry resources for the loaded build exist in Cache Storage.
 */
export async function inspectAppShellReadiness(
  serviceWorker: AppShellServiceWorker | undefined,
  cacheStorage: AppShellCacheStorage | undefined,
  requiredResourceUrls: readonly string[],
): Promise<AppShellReadiness> {
  if (!serviceWorker || !cacheStorage) {
    return {
      ready: false,
      serviceWorkerControlsPage: false,
      missingResources: [...requiredResourceUrls],
    };
  }

  let registration: ServiceWorkerRegistration;
  try {
    registration = await serviceWorker.ready;
  } catch {
    return {
      ready: false,
      serviceWorkerControlsPage: false,
      missingResources: [...requiredResourceUrls],
    };
  }

  const missingResources = (await Promise.all(
    requiredResourceUrls.map(async (url) => {
      try {
        return await cacheStorage.match(url) ? null : url;
      } catch {
        return url;
      }
    }),
  )).filter((url): url is string => url !== null);

  const serviceWorkerControlsPage = Boolean(registration.active && serviceWorker.controller);
  return {
    ready: serviceWorkerControlsPage && missingResources.length === 0,
    serviceWorkerControlsPage,
    missingResources,
  };
}
