# Digital DJ Setup

A mobile-first digital DJ workspace inspired by classic Technics turntables and DMC battle layouts. The app brings together two independent turntable decks, local track loading and a focused two-channel mixer.

## Project status

The two-deck workspace, its initial audio engine, shared mixer graph, two-channel mixer and installable PWA shell are implemented. Remaining product work and real-device acceptance are tracked in GitHub Issues and delivered in small, focused pull requests. See the [app documentation](docs/README.md) for the current capabilities and architecture.

## Technology

- React 19
- TypeScript 6 (strict mode)
- Vite 8
- Zustand 5 (vanilla per-deck state stores)
- Vitest and ESLint
- Browser-native Web Audio, Pointer Events, Web App Manifest and Service Worker APIs

There is no backend or remote track-storage service. User-selected audio remains local to the browser session. The app uses its own React/CSS presentation and does not require a UI component framework.

## Requirements and setup

- Node.js 22.13 or newer
- npm 10.9 or newer

Use the pinned development version with a Node version manager:

- **nvm use**
- **npm ci**
- **npm run dev**

## Quality checks

Run **npm run lint**, **npm run typecheck**, **npm run test** and **npm run build** before requesting review. CI uses **npm ci** and the committed package-lock.json so installs use the same dependency tree.

## Design references

- [2 MKII — The Wheels Of Steel](https://codepen.io/dmsr/pen/EKJmEm): Technics-inspired deck presentation and dual-deck layout.
- [Realtime scratching DJ turntable](https://codepen.io/pimskie/pen/bGjMdxV): touch/pointer scratching and playback response.

These are inspiration and behaviour references, not permission to copy code or assets. Check licensing and provenance before reusing any third-party material.

## Technical references

Start with the [technical reference index](docs/reference/README.md) before researching or changing recurring turntable behaviour. It links to the turntable baseline, shared mixer audio routing and PWA shell guide.

## Architecture principles

- Build mobile-first; portrait is the primary focused-deck experience and landscape is the two-deck battle layout.
- Keep the visual turntable component separate from audio-engine code.
- Give Deck A and Deck B independent deck state machines, stores, transports, AudioEngine instances and channel paths.
- The app owns one lazy shared AudioContext through MixerAudioGraph; a deck must not close that shared context when it is disposed.
- Keep Web Audio nodes, buffers and high-frequency pointer/animation work outside the central React app state.
- The simplified two-deck mixer is implemented and tracked in [Issue #17](https://github.com/japiohopman/digital-dj-setup/issues/17) for real-device acceptance and future refinements. It is not a full hardware-console emulator.
- The installable PWA shell is tracked in [Issue #19](https://github.com/japiohopman/digital-dj-setup/issues/19); it caches application resources, never user-selected audio.
- Prefer browser-native APIs and a small dependency footprint; add a dependency only when a dedicated issue justifies it.

## Issue and pull request workflow

1. Select one GitHub Issue and confirm its acceptance criteria.
2. Create one short-lived feature branch from main.
3. Keep the implementation limited to that issue.
4. Open one pull request that references the issue with **Closes #N**.
5. Run all quality checks and include screenshots for visual changes.
6. Merge when the issue's acceptance criteria are met, CI is green and review has no unresolved blockers; merge authority has been delegated for this repository.

See [AGENTS.md](AGENTS.md), [CHATGPT.md](CHATGPT.md) and the [agent workflow](docs/development/agent-workflow.md) for collaboration guidance.

## Installable app

The project includes an installable standalone PWA shell and a manual GitHub Pages deployment workflow for mobile testing. See the [PWA install, Pages and offline guide](docs/reference/pwa-shell.md) for the public test URL, Android/iPhone installation steps, cache boundaries and device acceptance checks.
