# App overview

## Purpose

Digital DJ Setup is a mobile-first, two-deck DJ workspace. It presents two independent, Technics SL-1200MK2-inspired turntables in a focused DMC / battle-style setup, with a compact two-channel mixer.

The app is designed around the feel of operating a physical record deck: load a track, start the platter, move the tonearm, place the needle and manipulate the record. The two decks can be used independently and routed together through the app mixer.

## Current product model

- **Two decks:** Deck A and Deck B. Each has its own turntable presentation, deck state machine, transport and audio-engine instance.
- **One mixer:** one channel for each deck, a crossfader and real signal meters.
- **Local-first audio:** users can load audio files from their device. The app does not upload those selected files to a server.
- **Mobile-first workspace:** portrait uses a focused single-deck view with a separate mixer view; landscape presents the two-deck battle layout.
- **Progressive Web App shell:** the app includes an installable standalone shell and a service worker for application-owned resources. Offline availability is limited to resources cached by the app shell.

## Implemented capabilities

### Decks and playback

- Two independent deck instances with separate transport state and audio buffers.
- Load a local audio file into either deck using the track loader, or drag an audio file onto the record.
- A built-in **Battle Ammo** starter crate currently contains two bundled MP3 tracks. The user chooses Deck A or Deck B before loading; a loaded track is left stopped at the start.
- Turntable power and Start / Stop controls, 33 and 45 RPM selection, a target light and a pitch control labelled ±8.
- Interactive tonearm placement, lifting and parking, with needle-drop feedback and programme-audio gating based on the deck state.
- Vinyl pointer interaction for scratching and reverse movement, tied to the deck's transport position and playback-rate calculation.
- Track metadata and artwork where the selected audio file contains supported metadata.
- App-owned needle-drop and record-surface sounds.

### Mixer

- Independent Deck A and Deck B channel-level controls.
- A continuous A/B crossfader with an equal-power response.
- A CUT-IN control that adjusts the app's symmetric crossfader cut-lag behaviour.
- Deck A, Deck B and master meters that read signal levels from the Web Audio graph.

The crossfader response, CUT-IN range and interaction are app implementation choices. They are not claims that the app reproduces every electrical or mechanical specification of a physical mixer. See [Shared mixer audio routing](../reference/audio-routing.md).

### Workspace and developer tools

- The shared TOOLS menu opens the full-screen Track crates overlay.
- The overlay contains the Battle Ammo starter crate, a target-deck selector and the existing local-file loaders for both decks.
- Developer diagnostics are included only in development builds. They are not product controls and do not change deck state.

### Installable shell

The web app manifest and service worker support a standalone PWA launch on compatible platforms. The service worker caches application assets and the bundled starter-crate tracks; user-selected audio files are not uploaded or added to the app-shell cache. See the [PWA shell guide](../reference/pwa-shell.md). Real-device installation and offline acceptance must be recorded separately from a passing build.

## Product boundaries

Digital DJ Setup is a focused two-deck DJ workspace, not a general-purpose DAW or a full hardware-console emulator.

The current product does not provide user accounts, cloud track storage, streaming services, a multi-track timeline, recording lanes, extra mixer channels, microphone inputs, effects routing or a dedicated physical headphone-cue bus.

Optional external-controller support is a future enhancement, not a requirement for using the current app. The on-screen deck and mixer controls remain the core product experience.

## Current versus planned

| Area | Status |
|---|---|
| Dual-deck workspace and local track loading | Implemented |
| Interactive tonearm and vinyl scratch/reverse interaction | Implemented; ongoing refinements are tracked in GitHub Issues |
| Two-channel mixer, channel faders, crossfader and meters | Implemented; real-device acceptance and future refinements remain tracked separately |
| Installable PWA shell | Implemented; deployment setup and real-device acceptance are tracked separately |
| Continuous platter/slipmat behaviour refinements | Planned / in progress in Issue #26 |
| Optional Pioneer DDJ-REV1 controller support | Planned; not implemented yet (Issue #30) |
| Physical master/headphone output and cue routing | Not implemented; requires separate audio-device design and acceptance |

When the implementation changes, update this table and the relevant workflow or architecture page in the same documentation change.
