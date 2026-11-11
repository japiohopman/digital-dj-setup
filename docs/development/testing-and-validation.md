# Testing and validation

## Local quality commands

Use the pinned project toolchain. The repository currently requires Node.js 22.13 or newer and npm 10.9 or newer.

Run these commands before requesting review:

| Command | Purpose |
|---|---|
| **npm ci** | Install the dependency tree from package-lock.json |
| **npm run lint** | Run ESLint across TypeScript and TSX files |
| **npm run typecheck** | Run TypeScript without emitting output |
| **npm run test** | Run the Vitest test suite |
| **npm run build** | Typecheck and create the production Vite build |

Use the same commands in a clean checkout when investigating a CI-only failure.

## Test structure

Tests are colocated with the source under src/:

- App and workspace interaction: App.test.tsx, components/workspace/WorkspaceMenu.test.tsx.
- Turntable interaction: components/Turntable.test.tsx.
- Deck state transitions and side effects: state/deckMachine.test.ts and state/deckStore.test.ts.
- Audio engine and shared graph: audio/AudioEngine.test.ts and audio/MixerAudioGraph.test.ts.
- Gesture and geometry calculations: audio/useVinylMotion.test.ts, audio/useTonearm.test.ts and audio/tonearmGeometry.test.ts.
- Metadata extraction: audio/metadata.test.ts.
- PWA worker registration and source: pwa/registerServiceWorker.test.ts and pwa/serviceWorkerSource.test.ts.

Vitest uses jsdom for browser-facing unit tests. Tests mock browser audio interfaces where needed; a passing unit suite does not prove that a physical phone, audio device or controller behaves correctly.

## Continuous integration

The GitHub Actions CI workflow runs on pull requests and pushes to main. It installs from package-lock.json and runs lint, typecheck, tests and the production build.

The workflow also checks:

- The standalone web manifest, install icons and generated service worker.
- The regular production build and the GitHub Pages project-path build.
- That the app shell and bundled application sounds exist and that user-selected audio is not added to the service-worker cache.
- Production preview startup.
- Screenshots on pull requests for dual-deck portrait, mixer portrait, mobile landscape, short mobile landscape and desktop viewports.

Pull-request screenshots are uploaded as a CI artifact for visual review. They are automated browser captures, not a replacement for a real-device usability test.

## Real-device acceptance

Record real-device checks in the relevant GitHub Issue or pull request. Include:

- Device model and operating-system version.
- Browser and browser version, or installed PWA mode.
- Viewport and orientation.
- Audio output path and connected accessories where relevant.
- The exact controls and behaviours tested, plus any unresolved limitations.

For mobile acceptance, test both portrait and landscape. For audio changes, listen to both decks and verify that mixer levels, crossfader, tonearm, scratching and transport remain independent. For PWA changes, follow the [PWA device checklist](../reference/pwa-shell.md).

A green CI run proves the automated checks passed. It does not prove sound quality, touch feel, physical hardware compatibility or an installed PWA's behaviour on every device.
