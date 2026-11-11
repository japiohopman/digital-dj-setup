# Digital DJ Setup documentation

This folder documents the app as it exists in the current source code, the architecture behind it, and the workflow used to change it safely.

## App documentation

- [Product overview](app/overview.md) — purpose, current capabilities, product boundaries and planned direction.
- [User workflows](app/user-workflows.md) — choosing a deck, loading tracks, operating the turntable and using the mixer.
- [Responsive layouts](app/responsive-layouts.md) — portrait, landscape and installed PWA behaviour.
- [Application architecture](app/architecture.md) — source layout, components, data flow and asset locations.
- [Audio and deck model](app/audio-and-deck-model.md) — deck state, transport, stylus gating, scratching and shared mixer routing.

## Development documentation

- [Agent index](agent-index.md) — the recommended entry point for coding agents and contributors.
- [Agent workflow](development/agent-workflow.md) — issue selection, branches, pull requests and review.
- [Testing and validation](development/testing-and-validation.md) — local commands, CI, visual checks and real-device acceptance.

## Technical references

- [Technical reference index](reference/README.md) — source-backed recurring hardware facts, geometry and simulation decisions.
- [Turntable and tonearm baseline](reference/turntable-baseline.md) — arm geometry, groove mapping and mechanical reference.
- [Shared mixer audio routing](reference/audio-routing.md) — shared AudioContext ownership, deck channel paths, analysers and mixer behaviour.
- [PWA shell guide](reference/pwa-shell.md) — installation, GitHub Pages testing and offline boundaries.

## Documentation rule

The current source code and tests are authoritative for implemented behaviour. These documents explain that behaviour; they do not override the implementation. Where a feature is planned, awaiting real-device acceptance or still under investigation, it is labelled as such. Keep those distinctions explicit when updating this documentation.
