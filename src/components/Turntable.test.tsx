import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { Turntable } from './Turntable';

describe('Turntable', () => {
  it('renders the main hardware elements and accessible controls', () => {
    const markup = renderToStaticMarkup(<Turntable deckLabel="DECK 01" />);

    expect(markup).toContain('DECK 01 Technics-inspired turntable');
    expect(markup).toContain('class="platter"');
    expect(markup).toContain('class="record"');
    expect(markup).toContain('class="tonearm"');
    expect(markup).toContain('aria-label="DECK 01 Power"');
    expect(markup).toContain('aria-label="DECK 01 Start / Stop"');
    expect(markup).toContain('aria-label="DECK 01 33 RPM"');
    expect(markup).toContain('aria-label="DECK 01 45 RPM"');
    expect(markup).toContain('aria-label="DECK 01 Target light"');
    expect(markup).toContain('/turntable/landscape/tt_case_and_lighting.png');
  });

  it('supports a reusable deck label, model and initial speed', () => {
    const markup = renderToStaticMarkup(
      <Turntable deckLabel="DECK B" modelName="SL-1210 MK2" initialSpeed={45} />,
    );

    expect(markup).toContain('DECK B');
    expect(markup).toContain('SL-1210 MK2');
    expect(markup).toContain('data-speed="45"');
    expect(markup).toContain('45 RPM');
  });

  it('does not start the platter when the deck is initially powered off', () => {
    const markup = renderToStaticMarkup(
      <Turntable initiallyPowered={false} initiallySpinning />,
    );

    expect(markup).not.toContain('motor-on');
    expect(markup).toContain('disabled=""');
  });
});
