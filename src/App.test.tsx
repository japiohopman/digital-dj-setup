import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { App } from './App';

describe('App dual-deck workspace', () => {
  it('renders two independent instances of the reusable turntable', () => {
    const markup = renderToStaticMarkup(<App />);

    expect(markup).toContain('id="deck-a-panel"');
    expect(markup).toContain('id="deck-b-panel"');
    expect(markup).toContain('DECK A Technics SL-1200 MK2 turntable');
    expect(markup).toContain('DECK B Technics SL-1200 MK2 turntable');
    expect(markup.match(/class="turntable is-powered is-spinning"/g)).toHaveLength(2);
  });

  it('provides an accessible portrait deck selector', () => {
    const markup = renderToStaticMarkup(<App />);

    expect(markup).toContain('aria-label="Choose active deck"');
    expect(markup).toContain('aria-controls="deck-a-panel"');
    expect(markup).toContain('aria-controls="deck-b-panel"');
    expect(markup).toContain('aria-pressed="true"');
    expect(markup).toContain('aria-pressed="false"');
  });
});
