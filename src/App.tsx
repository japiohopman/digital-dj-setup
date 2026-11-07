import { useState } from 'react';

import { Turntable } from './components/Turntable';
import './components/Turntable.css';

type ActiveDeck = 'a' | 'b';

export function App() {
  const [activeDeck, setActiveDeck] = useState<ActiveDeck>('a');

  return (
    <main className="app-shell">
      <header className="app-header">
        <div>
          <p className="eyebrow">DIGITAL DJ SETUP</p>
          <h1>Two decks. One battle setup.</h1>
        </div>
        <span className="app-header__mode">DMC / DUAL DECK</span>
      </header>

      <nav className="deck-selector" aria-label="Choose active deck">
        <button
          className="deck-selector__button"
          type="button"
          aria-pressed={activeDeck === 'a'}
          aria-controls="deck-a-panel"
          onClick={() => setActiveDeck('a')}
        >
          <span className="deck-selector__number">01</span>
          DECK A
        </button>
        <button
          className="deck-selector__button"
          type="button"
          aria-pressed={activeDeck === 'b'}
          aria-controls="deck-b-panel"
          onClick={() => setActiveDeck('b')}
        >
          <span className="deck-selector__number">02</span>
          DECK B
        </button>
      </nav>

      <section className="deck-workspace" aria-label="DJ dual-deck workspace">
        <div className="dual-deck-layout">
          <div
            className={`dual-deck__slot dual-deck__slot--a${activeDeck === 'a' ? ' is-active' : ''}`}
            id="deck-a-panel"
          >
            <div className="dual-deck__turntable">
              <Turntable deckLabel="DECK A" modelName="SL-1200 MK2" />
            </div>
          </div>

          <div
            className={`dual-deck__slot dual-deck__slot--b${activeDeck === 'b' ? ' is-active' : ''}`}
            id="deck-b-panel"
          >
            <div className="dual-deck__turntable">
              <Turntable deckLabel="DECK B" modelName="SL-1200 MK2" />
            </div>
          </div>
        </div>
      </section>

      <footer className="app-footer">
        <span className="app-footer__status" />
        VISUAL CONTROLS ONLY <span aria-hidden="true">·</span> AUDIO ENGINE NOT CONNECTED
      </footer>
    </main>
  );
}
