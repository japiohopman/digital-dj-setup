# Technical references

Use this folder as the compact source-of-truth index for recurring hardware facts, geometry and simulation decisions.

## Read first

- [Turntable and tonearm baseline](turntable-baseline.md) — arm rotation, pivot geometry, LP angle mapping, motor/brake facts, groove standards and implementation-only timings.

## Audio architecture

- [Shared mixer audio routing](audio-routing.md) — shared Web Audio context ownership, independent deck channels, analyser taps and Phase 0/1 boundaries.

## Working rules

- Check this index before starting a new search about turntable mechanics or re-deriving existing geometry.
- Distinguish **hardware facts** from **app calibration** and **simulation choices**. Never present one as another.
- The current implementation lives in source code and tests. When a behaviour-defining constant changes, update its code, tests and this reference in the same pull request.
- Add new research as a short source-backed fact here; keep issue descriptions focused on scope, acceptance criteria and a link to the relevant reference.
- Search the web again only when a source is missing, disputed, version-sensitive or the product question has changed.
