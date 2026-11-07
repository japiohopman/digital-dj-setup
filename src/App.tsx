import { Turntable } from './components/Turntable';
import './components/Turntable.css';

export function App() {
  return (
    <main className="app-shell">
      <header className="app-header">
        <div>
          <p className="eyebrow">DIGITAL DJ SETUP</p>
          <h1>The first deck is ready.</h1>
        </div>
        <span className="app-header__mode">VISUAL PROTOTYPE</span>
      </header>

      <section className="deck-workspace" aria-label="Turntable preview">
        <Turntable deckLabel="DECK 01" modelName="SL-1200 MK2" />
      </section>

      <footer className="app-footer">
        <span className="app-footer__status" />
        VISUAL CONTROLS ONLY <span aria-hidden="true">·</span> AUDIO ENGINE NOT CONNECTED
      </footer>
    </main>
  );
}
