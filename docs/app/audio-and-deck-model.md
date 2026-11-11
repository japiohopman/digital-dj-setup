# Audio and deck model

## Separate deck state dimensions

A deck is not represented by a single playing/stopped boolean. The state machine keeps separate values for:

- **Power:** the turntable's main power state.
- **Motor:** the Start / Stop switch and motor phase (stopped, spinning up, running or coasting).
- **Track:** whether a track is empty, loading, ready or in error.
- **Transport:** whether programme playback is idle, paused, playing, scratching or ended.
- **Tonearm position/contact:** parked, lifted, needle-down or off-record. A separate arm-interaction flag reports whether the arm is idle or currently being dragged.
- **Needle validity:** whether the stylus is in a playable groove and whether the current record has already received its first valid drop.

The pure state machine lives in [src/state/deckMachine.ts](../../src/state/deckMachine.ts). It defines typed events and guarded transitions. Invalid events are rejected rather than allowing the deck to enter contradictory states.

## Per-deck ownership

Each Turntable creates an isolated Zustand vanilla store with [src/state/deckStore.ts](../../src/state/deckStore.ts). The store is the single source of truth for that deck's power, motor, track, transport and tonearm transitions.

The store is also the adapter for side effects. When a transition is accepted, it calls the corresponding methods on the deck's DeckTransport. UI components dispatch typed events; they should not call transport playback or scratch commands directly.

High-frequency pointer coordinates, current gesture ownership and animation-frame calculations remain in interaction hooks instead of being written to the deck state machine for every pointer sample.

## AudioEngine and DeckTransport

[src/audio/AudioEngine.ts](../../src/audio/AudioEngine.ts) owns the decoded audio buffers and Web Audio source/gain nodes for one deck. Its responsibilities include:

- Loading and decoding a selected local audio file.
- Programme playback and pause/seek behaviour.
- Playback-rate changes and reverse/scratch source handling.
- Spin-up and coast-down playback-rate transitions.
- Stylus-contact programme-audio gating.
- Needle-drop one-shot sounds and record/off-record/run-out sound loops.
- Track playback position, duration, metadata and error snapshots.

[src/audio/useDeckTransport.ts](../../src/audio/useDeckTransport.ts) creates one engine per deck and exposes its controls and observable state through the DeckTransport interface in [src/audio/types.ts](../../src/audio/types.ts).

## Shared mixer graph

[src/audio/MixerAudioGraph.ts](../../src/audio/MixerAudioGraph.ts) is owned by the app, not by an individual deck. It lazily creates one shared AudioContext and provides a distinct input/channel path to each deck engine.

The current signal topology is:

- Programme audio passes through source/de-click gain and stylus-contact gain before entering the deck channel.
- Needle-drop cues and record-surface sound loops enter the same deck channel input as the programme audio.
- Each deck path then passes through its channel level and crossfader gains, followed by a post-fader analyser.
- Both deck paths feed the shared master gain and master analyser before the browser audio destination.

This means channel level and crossfader controls affect all audible layers belonging to that deck. Stylus contact gates programme audio; it is not a replacement for channel level or motor state.

The crossfader's equal-power sine/cosine curve, centre response and CUT-IN simulation range are app choices. Consult [Shared mixer audio routing](../reference/audio-routing.md) before changing them.

## Gesture and tonearm layers

- [src/audio/useVinylMotion.ts](../../src/audio/useVinylMotion.ts) interprets pointer movement on the record as rotation, scratch direction, scratch speed and playback position. It dispatches high-level deck events and keeps high-frequency gesture calculations out of React's central app state.
- [src/audio/useTonearm.ts](../../src/audio/useTonearm.ts) handles picking up and moving the tonearm, cue positioning, drops, lift and park interactions.
- [src/audio/tonearmGeometry.ts](../../src/audio/tonearmGeometry.ts) holds the geometry and mapping between tonearm angle and playable record groove.

The visual record, motor/platter animation, tonearm and audio playhead must remain coordinated without collapsing their separate responsibilities. When changing recurring turntable mechanics, read [Turntable baseline](../reference/turntable-baseline.md) and follow the source-reference update rule.

## Regression boundaries

Any change to transport, scratching, tonearm or mixer behaviour must preserve:

- Deck A and Deck B remain independent.
- Loading a track does not implicitly start programme playback.
- Stylus contact, motor state and mixer gain remain separate controls.
- Scratch/reverse interaction continues to use the existing deck transport and audio engine.
- A channel at minimum or a crossfader at an endpoint affects its signal path, not the other deck's motor or tonearm state.
- Disposing one deck does not close the app-owned shared AudioContext.
