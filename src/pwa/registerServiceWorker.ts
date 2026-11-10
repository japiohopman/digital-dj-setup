export type ServiceWorkerRegistrar = Pick<ServiceWorkerContainer, 'register'>;
export type LoadListener = (callback: () => void) => void;

/** Registers the app-shell worker and limits its control to the deployment base path. */
export function registerAppServiceWorker(
  serviceWorker: ServiceWorkerRegistrar | undefined,
  addLoadListener: LoadListener,
  basePath = '/',
  onError: (error: unknown) => void = (error) => {
    console.error('The Digital DJ app shell could not register its service worker.', error);
  },
): void {
  if (!serviceWorker) return;

  const normalizedBasePath = basePath.startsWith('/')
    ? basePath
    : '/' + basePath;
  const workerBasePath = normalizedBasePath.endsWith('/')
    ? normalizedBasePath
    : normalizedBasePath + '/';

  addLoadListener(() => {
    void serviceWorker.register(workerBasePath + 'sw.js', { scope: workerBasePath }).catch(onError);
  });
}
