import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { Turntable } from './Turntable';

describe('Turntable deck configuration and isolation', () => {
  it('renders a fully powered and spinning deck by default', () => {
    const markup = renderToStaticMarkup(<Turntable deckLabel="DECK 01" />);

    expect(markup).toContain('class="turntable power-on motor-on has-record"');
    expect(markup).toContain('aria-pressed="true"');
    expect(markup).not.toContain('disabled=""');
  });

  it('renders unpowered state with controls disabled', () => {
    const markup = renderToStaticMarkup(
      <Turntable deckLabel="DECK 01" initiallyPowered={false} initiallySpinning />,
    );

    // Motor should not be on if unpowered
    expect(markup).not.toContain('power-on');
    expect(markup).not.toContain('motor-on');
    // Interactive buttons disabled
    expect(markup).toContain('aria-pressed="false"');
    expect(markup).toContain('disabled=""');
  });

  it('renders powered deck with motor stopped', () => {
    const markup = renderToStaticMarkup(
      <Turntable deckLabel="DECK 01" initiallyPowered initiallyMotorOn={false} />,
    );

    expect(markup).toContain('class="turntable power-on has-record"');
    expect(markup).not.toContain('motor-on');
  });

  it('renders slipmat deck state without vinyl record when configured', () => {
    const markup = renderToStaticMarkup(
      <Turntable deckLabel="DECK 02" initiallyHasRecord={false} initiallyHasSlipmat />,
    );

    expect(markup).toContain('has-slipmat');
    expect(markup).not.toContain('has-record');
  });

  it('isolates initial configuration between independent deck instances', () => {
    const deckAMarkup = renderToStaticMarkup(
      <Turntable deckLabel="DECK A" initiallyPowered initiallyMotorOn initialSpeed={33} />,
    );
    const deckBMarkup = renderToStaticMarkup(
      <Turntable deckLabel="DECK B" initiallyPowered={false} initialSpeed={45} />,
    );

    expect(deckAMarkup).toContain('DECK A');
    expect(deckAMarkup).toContain('power-on motor-on');
    expect(deckAMarkup).toContain('data-speed="33"');

    expect(deckBMarkup).toContain('DECK B');
    expect(deckBMarkup).not.toContain('power-on');
    expect(deckBMarkup).not.toContain('motor-on');
    expect(deckBMarkup).toContain('data-speed="45"');
  });
});

describe('Turntable static markup', () => {
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
    expect(markup).toContain('aria-label="DECK 01 Pitch Control"');
    expect(markup).toContain('aria-label="DECK 01 pitch slider"');
    expect(markup).toContain('aria-label="DECK 01 Reset pitch to 0%"');
    expect(markup).toContain('class="pitch-track"');
    expect(markup).toContain('class="pitch-knob"');
    expect(markup).toContain('/turntable/landscape/tt_case_and_lighting.png');
  });

  it('renders realistic pitch assembly with scale markers and 0.0% quartz lock', () => {
    const markup = renderToStaticMarkup(<Turntable deckLabel="DECK A" />);

    expect(markup).toContain('PITCH ADJ.');
    expect(markup).toContain('+8');
    expect(markup).toContain('-8');
    expect(markup).toContain('RESET');
    expect(markup).toContain('0.0%');
    expect(markup).toContain('pitch-reset-btn locked');
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
