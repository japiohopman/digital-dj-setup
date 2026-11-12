import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { getUiIconUrl, UI_ICON_PATHS, UiIcon } from './UiIcon';

describe('UI icon registry', () => {
  it('registers the album crate icon by a semantic name', () => {
    expect(UI_ICON_PATHS.albumCrate).toBe('icons/UI/album_crate.svg');
  });

  it.each([
    ['/', '/icons/UI/album_crate.svg'],
    ['/digital-dj-setup/', '/digital-dj-setup/icons/UI/album_crate.svg'],
    ['/digital-dj-setup', '/digital-dj-setup/icons/UI/album_crate.svg'],
  ])('resolves the album crate icon for base path %s', (basePath, expectedUrl) => {
    expect(getUiIconUrl('albumCrate', basePath)).toBe(expectedUrl);
  });

  it('renders registered icons as decorative images', () => {
    const { container } = render(<UiIcon name="albumCrate" />);

    const image = container.querySelector('img');
    expect(image?.getAttribute('src')).toBe(getUiIconUrl('albumCrate'));
    expect(image?.getAttribute('alt')).toBe('');
    expect(image?.getAttribute('aria-hidden')).toBe('true');
    expect(image?.getAttribute('draggable')).toBe('false');
  });
});
