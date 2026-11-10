import { cleanup, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { useDeckTransport } from './useDeckTransport';

describe('useDeckTransport render stability', () => {
  afterEach(cleanup);

  it('keeps the transport snapshot stable across unrelated parent rerenders', () => {
    const { result, rerender, unmount } = renderHook(() => useDeckTransport());
    const firstSnapshot = result.current;

    rerender();

    expect(result.current).toBe(firstSnapshot);
    unmount();
  });
});
