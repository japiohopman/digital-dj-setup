import { useCallback, useEffect, useState } from 'react';

import { useDeckTransport } from './audio/useDeckTransport';
import { MixerAudioGraph } from './audio/MixerAudioGraph';
import { MixerPanel } from './components/mixer/MixerPanel';
import { Turntable } from './components/Turntable';
import { DevKit } from './components/devkit/DevKit';
import { WorkspaceMenu } from './components/workspace/WorkspaceMenu';
import type { DeckDiagnosticsSnapshot } from './components/devkit/types';
import './components/Turntable.css';

type ActiveDeck = 'a' | 'b';
type ActiveView = ActiveDeck | 'mixer';

export function App() {
  const [activeDeck, setActiveDeck] = useState<ActiveDeck>('a');
  const [isOnline, setIsOnline] = useState(
    () => typeof navigator === 'undefined' || navigator.onLine,
  );
  const [activeView, setActiveView] = useState<ActiveView>(() => {
    if (typeof window === 'undefined') return 'a';
    return new URLSearchParams(window.location.search).get('view') === 'mixer' ? 'mixer' : 'a';
  });
  const [armAngles, setArmAngles] = useState<{ a: number; b: number }>({ a: 0, b: 0 });
  const [deckDiagnostics, setDeckDiagnostics] = useState<{
    a?: DeckDiagnosticsSnapshot;
    b?: DeckDiagnosticsSnapshot;
  }>({});
  const [trackControlsPortalTarget, setTrackControlsPortalTarget] = useState<HTMLDivElement | null>(null);
  /** Stores a deck arm angle only when its measured value actually changes. */
  const updateDeckAAngle = useCallback((angle: number) => {
    setArmAngles((current) => current.a === angle ? current : { ...current, a: angle });
  }, []);
  /** Stores a deck arm angle only when its measured value actually changes. */
  const updateDeckBAngle = useCallback((angle: number) => {
    setArmAngles((current) => current.b === angle ? current : { ...current, b: angle });
  }, []);
  /** Avoids rerendering the whole workspace for an unchanged diagnostic snapshot. */
  const updateDeckADiagnostics = useCallback((snapshot: DeckDiagnosticsSnapshot) => {
    setDeckDiagnostics((current) => {
      const previous = current.a;
      if (previous &&
        previous.power === snapshot.power &&
        previous.motorPhase === snapshot.motorPhase &&
        previous.tonearm === snapshot.tonearm &&
        previous.track === snapshot.track &&
        previous.transport === snapshot.transport &&
        previous.isAudible === snapshot.isAudible &&
        previous.trace === snapshot.trace
      ) return current;
      return { ...current, a: snapshot };
    });
  }, []);
  /** Avoids rerendering the whole workspace for an unchanged diagnostic snapshot. */
  const updateDeckBDiagnostics = useCallback((snapshot: DeckDiagnosticsSnapshot) => {
    setDeckDiagnostics((current) => {
      const previous = current.b;
      if (previous &&
        previous.power === snapshot.power &&
        previous.motorPhase === snapshot.motorPhase &&
        previous.tonearm === snapshot.tonearm &&
        previous.track === snapshot.track &&
        previous.transport === snapshot.transport &&
        previous.isAudible === snapshot.isAudible &&
        previous.trace === snapshot.trace
      ) return current;
      return { ...current, b: snapshot };
    });
  }, []);
  const [mixerAudioGraph] = useState(() => new MixerAudioGraph());
  const [deckAAudioOptions] = useState(() => mixerAudioGraph.createDeckAudioOptions('a'));
  const [deckBAudioOptions] = useState(() => mixerAudioGraph.createDeckAudioOptions('b'));
  const transportA = useDeckTransport(deckAAudioOptions);
  const transportB = useDeckTransport(deckBAudioOptions);

  useEffect(() => () => mixerAudioGraph.dispose(), [mixerAudioGraph]);

  useEffect(() => {
    /** Keeps the small app-shell status current as connectivity changes. */
    const updateNetworkStatus = () => setIsOnline(navigator.onLine);
    window.addEventListener('online', updateNetworkStatus);
    window.addEventListener('offline', updateNetworkStatus);
    return () => {
      window.removeEventListener('online', updateNetworkStatus);
      window.removeEventListener('offline', updateNetworkStatus);
    };
  }, []);

  const isAudioActive = transportA.isPlaying || transportB.isPlaying;

  return (
    <main className="app-shell">
      {!isOnline && (
        <aside
          className="app-offline-status"
          role="status"
          aria-label="Offline: only cached app resources are available"
          title="Offline mode. Only the app shell and resources cached during an online visit are available."
        >
          OFFLINE · CACHED APP ONLY
        </aside>
      )}
      <header className="app-header">
        <div>
          <p className="eyebrow">DIGITAL DJ SETUP</p>
          <h1>Two decks. One battle setup.</h1>
        </div>
        <span className="app-header__mode">DMC / DUAL DECK</span>
      </header>

      <nav className="deck-selector" aria-label="Choose workspace view">
        <button
          className="deck-selector__button"
          type="button"
          aria-pressed={activeView === 'a'}
          aria-controls="deck-a-panel"
          onClick={() => {
            setActiveDeck('a');
            setActiveView('a');
          }}
        >
          <span className="deck-selector__number">01</span>
          DECK A
        </button>
        <button
          className="deck-selector__button"
          type="button"
          aria-pressed={activeView === 'b'}
          aria-controls="deck-b-panel"
          onClick={() => {
            setActiveDeck('b');
            setActiveView('b');
          }}
        >
          <span className="deck-selector__number">02</span>
          DECK B
        </button>
        <button
          className="deck-selector__button deck-selector__button--mixer"
          type="button"
          aria-pressed={activeView === 'mixer'}
          aria-controls="mixer-panel"
          onClick={() => setActiveView('mixer')}
        >
          <span className="deck-selector__number">03</span>
          MIXER
        </button>
      </nav>

      <section
        className={`deck-workspace${activeView === 'mixer' ? ' is-mixer-view' : ''}`}
        aria-label="DJ dual-deck workspace"
      >
        <div className="dual-deck-layout">
          <div
            className={`dual-deck__slot dual-deck__slot--a${activeView === 'a' ? ' is-active' : ''}`}
            id="deck-a-panel"
          >
            <div className="dual-deck__turntable">
              <Turntable
                deckLabel="DECK A"
                modelName="SL-1200 MK2"
                transport={transportA}
                onArmAngleChange={updateDeckAAngle}
                onDevDiagnosticsChange={updateDeckADiagnostics}
                trackControlsPortalTarget={trackControlsPortalTarget}
              />
            </div>
          </div>

          <div className="dual-deck__center-panel">
            <WorkspaceMenu onTrackControlsTargetChange={setTrackControlsPortalTarget}>
              {import.meta.env.DEV && (
                <DevKit
                  activeDeckLabel={activeDeck === 'a' ? 'DECK A' : 'DECK B'}
                  activeArmAngle={armAngles[activeDeck]}
                  activeDeckDiagnostics={deckDiagnostics[activeDeck]}
                />
              )}
            </WorkspaceMenu>
            <MixerPanel audioGraph={mixerAudioGraph} />
          </div>

          <div
            className={`dual-deck__slot dual-deck__slot--b${activeView === 'b' ? ' is-active' : ''}`}
            id="deck-b-panel"
          >
            <div className="dual-deck__turntable">
              <Turntable
                deckLabel="DECK B"
                modelName="SL-1200 MK2"
                transport={transportB}
                onArmAngleChange={updateDeckBAngle}
                onDevDiagnosticsChange={updateDeckBDiagnostics}
                trackControlsPortalTarget={trackControlsPortalTarget}
              />
            </div>
          </div>
        </div>
      </section>

      <footer className="app-footer">
        <span className={`app-footer__status${isAudioActive ? ' is-active' : ''}`} />
        WEB AUDIO ENGINE CONNECTED <span aria-hidden="true">·</span> INDEPENDENT DUAL TRANSPORT
      </footer>
    </main>
  );
}
