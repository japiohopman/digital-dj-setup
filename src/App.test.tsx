import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { App } from './App';

describe('App dual-deck workspace', () => {
  it('renders two independent instances of the reusable turntable with Web Audio connected', () => {
    const markup = renderToStaticMarkup(<App />);

    expect(markup).toContain('id="deck-a-panel"');
    expect(markup).toContain('id="deck-b-panel"');
    expect(markup).toContain('DECK A Technics-inspired turntable');
    expect(markup).toContain('DECK B Technics-inspired turntable');
    expect(markup).toContain('WEB AUDIO ENGINE CONNECTED');
    expect(markup).toContain('INDEPENDENT DUAL TRANSPORT');
    expect(markup.match(/class="turntable power-on motor-on has-slipmat"/g)).toHaveLength(2);
    expect(markup).toContain('aria-label="Developer tools"');
    expect(markup).toContain('DEVKIT');
    expect(markup).toContain('aria-label="Open workspace tools"');
    expect(markup).not.toContain('class="devkit-trigger"');
    expect(markup).not.toContain('class="deck-load-btn"');
    expect(markup).not.toContain('tonearm-meter-panel');
  });

  it('provides an accessible portrait deck selector', () => {
    const markup = renderToStaticMarkup(<App />);

    expect(markup).toContain('aria-label="Choose workspace view"');
    expect(markup).toContain('aria-controls="deck-a-panel"');
    expect(markup).toContain('aria-controls="deck-b-panel"');
    expect(markup).toContain('aria-pressed="true"');
    expect(markup).toContain('aria-pressed="false"');
  });
  it('renders the dedicated two-channel mixer with accessible fader controls', () => {
    const markup = renderToStaticMarkup(<App />);

    expect(markup).toContain('aria-controls="mixer-panel"');
    expect(markup).toContain('aria-label="Digital DJ mixer"');
    expect(markup).toContain('aria-label="Deck A channel level"');
    expect(markup).toContain('aria-label="Deck B channel level"');
    expect(markup).toContain('aria-label="Crossfader position"');
    expect(markup).toContain('role="meter"');
  });

});
