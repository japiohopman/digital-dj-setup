import { describe, expect, it, vi } from 'vitest';

import { registerAppServiceWorker } from './registerServiceWorker';

describe('registerAppServiceWorker', () => {
  it('registers the root app-shell worker after the page load event', () => {
    const register = vi.fn(() => Promise.resolve({} as ServiceWorkerRegistration));
    let onLoad: (() => void) | undefined;

    registerAppServiceWorker(
      { register },
      (listener) => { onLoad = listener; },
    );

    expect(register).not.toHaveBeenCalled();
    onLoad?.();
    expect(register).toHaveBeenCalledWith('/sw.js', { scope: '/' });
  });

  it('does nothing when service workers are unavailable', () => {
    const addLoadListener = vi.fn();

    registerAppServiceWorker(undefined, addLoadListener);

    expect(addLoadListener).not.toHaveBeenCalled();
  });

  it('reports registration failures without throwing into app startup', async () => {
    const error = new Error('registration failed');
    const register = vi.fn(() => Promise.reject(error));
    const onError = vi.fn();
    let onLoad: (() => void) | undefined;

    registerAppServiceWorker(
      { register },
      (listener) => { onLoad = listener; },
      onError,
    );

    onLoad?.();
    await Promise.resolve();

    expect(onError).toHaveBeenCalledWith(error);
  });
});
