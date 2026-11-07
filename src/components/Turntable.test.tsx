import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { Turntable } from './Turntable';

describe('Turntable', () => {
  it('renders the main hardware elements and accessible controls', () => {
    const markup = renderToStaticMarkup(<Turntable />);

    expect(markup).toContain('Technics-inspired turntable');
    expect(markup).toContain('turntable__platter');
    expect(markup).toContain('turntable__record');
    expect(markup).toContain('Tonearm and cartridge');
    expect(markup).toContain('aria-label="Power"');
    expect(markup).toContain('START / STOP');
    expect(markup).toContain('33 and one third revolutions per minute');
    expect(markup).toContain('45 revolutions per minute');
    expect(markup).toContain('aria-label="Target light"');
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

    expect(markup).not.toContain(' is-spinning');
    expect(markup).toContain('disabled=""');
  });
});
