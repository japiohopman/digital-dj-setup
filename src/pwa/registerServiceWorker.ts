export type ServiceWorkerRegistrar = Pick<ServiceWorkerContainer, 'register'>;
export type LoadListener = (callback: () => void) => void;

/** Registers the root-scoped app-shell worker after the first page load. */
export function registerAppServiceWorker(
  serviceWorker: ServiceWorkerRegistrar | undefined,
  addLoadListener: LoadListener,
  onError: (error: unknown) => void = (error) => {
    console.error('The Digital DJ app shell could not register its service worker.', error);
  },
): void {
  if (!serviceWorker) return;

  addLoadListener(() => {
    void serviceWorker.register('/sw.js', { scope: '/' }).catch(onError);
  });
}
