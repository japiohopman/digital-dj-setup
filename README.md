# Digital DJ Setup

A mobile-first digital DJ workspace inspired by classic Technics turntables and DMC battle layouts.

## Project status

The project foundation is in place. Product work is tracked in GitHub Issues and delivered in small, focused pull requests.

## Technology

- React 19
- TypeScript 6 (strict mode)
- Vite 8
- Vitest for tests
- ESLint flat config

The project intentionally starts without a UI framework, global state library, PWA plugin, backend or audio dependency. We will add tools only when a specific issue justifies them.

## Requirements

- Node.js 22.13 or newer
- npm 10.9 or newer

Use the pinned development version with a Node version manager:

```bash
nvm use
npm ci
npm run dev
```

## Quality checks

```bash
npm run lint
npm run typecheck
npm run test
npm run build
```

CI uses `npm ci` and the committed `package-lock.json` so installs use the same dependency tree. Vitest is configured. Until the first feature adds test files, the test command intentionally passes with no tests so the initial scaffold can be validated.

## Design references

- [2 MKII — The Wheels Of Steel](https://codepen.io/dmsr/pen/EKJmEm): Technics-inspired deck presentation and dual-deck layout.
- [Realtime scratching DJ turntable](https://codepen.io/pimskie/pen/bGjMdxV): touch/pointer scratching and playback response.

These are inspiration and behaviour references, not permission to copy code or assets. Check licensing and provenance before reusing any third-party material.

## Technical reference

Start with the [technical reference index](docs/reference/README.md) before researching or changing recurring turntable behaviour. The [turntable baseline](docs/reference/turntable-baseline.md) records current arm geometry, rotation angles, groove mapping, manufacturer facts and app-only simulation values. It explicitly separates hardware specifications from software calibration.

## Architecture principles

- Build mobile-first; landscape is a separately considered DJ/battle layout.
- Keep the visual turntable component separate from the audio engine.
- Give each deck an independent transport/audio-engine instance.
- Prefer browser-native APIs and a small dependency footprint.
- Do not implement mixer features until a mixer reference and dedicated issue are agreed.
- The installable PWA shell is tracked in [Issue #19](https://github.com/japiohopman/digital-dj-setup/issues/19); it caches only application resources, never user-selected audio.

## Issue and pull request workflow

1. Select one GitHub Issue and confirm its acceptance criteria.
2. Create one short-lived feature branch from `main`.
3. Keep the implementation limited to that issue.
4. Open one pull request that references the issue with `Closes #N`.
5. Run all quality checks and include screenshots for visual changes.
6. Merge when the issue's acceptance criteria are met, CI is green and review has no unresolved blockers; the user has delegated this merge decision to the assistant.

See [AGENTS.md](AGENTS.md) for coding-agent instructions and [CHATGPT.md](CHATGPT.md) for project collaboration guidance.


## Installable app

The production build includes an installable standalone PWA shell. See [the PWA install and offline guide](docs/reference/pwa-shell.md) for Android/iPhone installation steps, cache boundaries and device acceptance checks.
