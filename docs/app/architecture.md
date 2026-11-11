# Application architecture

## Runtime entry point

The browser entry point is [src/main.tsx](../../src/main.tsx). It mounts the React app in Strict Mode and registers the application service worker in production.

[src/App.tsx](../../src/App.tsx) composes the workspace:

- It owns the active portrait view (Deck A, Deck B or Mixer).
- It creates one app-owned MixerAudioGraph.
- It creates separate Deck A and Deck B transport hooks, each with options for its own mixer channel path.
- It renders one Turntable per deck, the shared WorkspaceMenu and the MixerPanel.
- It passes track-loader registration callbacks to the decks so the shared track crate can load into the intended deck.

## Source layout

| Path | Responsibility |
|---|---|
| src/App.tsx | Workspace composition, view selection, shared graph ownership and deck wiring |
| src/components/Turntable.tsx | Turntable presentation, local track loader, on-screen controls and per-deck interaction wiring |
| src/components/Turntable.css | Turntable artwork composition and responsive physical-style control styling |
| src/components/workspace/WorkspaceMenu.tsx | TOOLS overlay, Battle Ammo starter crate, target deck selection and shared track-loader host |
| src/components/mixer/MixerPanel.tsx | Mixer controls and signal-meter presentation; calls the graph API rather than manipulating audio nodes |
| src/components/devkit/ | Development-only diagnostic widgets |
| src/state/deckMachine.ts | Pure, typed, guarded deck state transitions and selectors |
| src/state/deckStore.ts | Per-deck Zustand adapter; translates accepted state transitions into audio side effects |
| src/audio/AudioEngine.ts | Track decoding, playback, scratch/reverse audio, playback timing and record/needle sound layers |
| src/audio/useDeckTransport.ts | React hook exposing one independent AudioEngine as a DeckTransport |
| src/audio/useVinylMotion.ts | Pointer-driven record rotation and scratch-position calculation |
| src/audio/useTonearm.ts | Tonearm pointer interaction and cue/drop event generation |
| src/audio/tonearmGeometry.ts | Tonearm geometry and playable-groove mapping |
| src/audio/MixerAudioGraph.ts | App-owned shared AudioContext, per-deck channel paths, crossfader, master route and analysers |
| src/audio/metadata.ts | Local audio metadata and artwork extraction |
| src/pwa/ | Service-worker registration and generated app-shell worker source |

## Input and state flow

On-screen interactions are translated into typed deck events. The pure deck state machine validates each event and returns an accepted or rejected transition. The per-deck store records the transition and runs the corresponding audio side effects through the deck's transport adapter.

The Turntable component owns presentation state that does not belong in the deck state machine, such as the selected visual RPM label, target-light state and pitch-fader presentation. High-frequency record pointer motion is handled by the vinyl-motion interaction layer rather than by storing every pointer sample in the global app component.

The mixer UI sends normalized values to the shared MixerAudioGraph API. It does not obtain or connect AudioNodes directly.

## Audio ownership and track data

Each deck owns an independent AudioEngine instance, decoded track buffers, playback position and transport lifecycle. Both engines use the same lazy, app-owned AudioContext supplied by MixerAudioGraph and connect into distinct Deck A / Deck B channel paths. The graph owns the master output, crossfader/channel gains and analyser taps. A deck engine must not close the shared context when it is disposed.

Local files are selected in the browser and passed to the corresponding deck loader. The engine decodes the file into browser-managed audio buffers. The app does not send user-selected track files to a backend. Bundled starter-crate MP3s are static application assets.

See [Audio and deck model](audio-and-deck-model.md) and [Shared mixer audio routing](../reference/audio-routing.md) for more detail.

## Asset locations

| Path | Contents |
|---|---|
| public/turntable/ | Turntable artwork and sprites used by the deck presentation |
| public/sounds/ | App-owned needle-drop and record-surface sound effects |
| public/sounds/battle_amo/ | Bundled Battle Ammo starter-crate MP3s |
| public/icons/ | PWA install icons |
| public/manifest.webmanifest | Web app manifest |
| docs/manual_examples/ | Preserved visual/manual references used during product design |
| docs/reference/ | Source-backed technical baselines and recurring implementation decisions |

Turntable image provenance and license details are recorded in [public/turntable/README.md](../../public/turntable/README.md). Do not move reference assets or import external assets without checking provenance and license.

## Architectural constraints

- Keep each deck's state machine, store and transport independent.
- Keep Web Audio nodes, buffers and timing inside the audio layer.
- Keep the shared mixer graph app-owned; disposing one deck must not close the shared AudioContext.
- Keep user-selected audio local to the browser session; do not add uploads or remote track storage without a separate product decision.
- Keep UI presentation separate from transport/audio side effects.
