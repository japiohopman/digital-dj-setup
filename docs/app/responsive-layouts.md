# Responsive layouts

The layout is mobile-first and changes by viewport orientation. It is not simply one desktop layout scaled down.

## Portrait

- The header and DECK A / DECK B / MIXER selector are visible.
- Only the selected deck is shown at a time. The deck selector changes the active deck without unloading its track or resetting its independent state.
- MIXER opens a dedicated mixer view; the two turntables are hidden for that view rather than squeezed into a narrow strip.
- The TOOLS entry is positioned near the top-right of the deck workspace so the track library remains reachable without consuming the turntable surface.
- Safe-area insets are included in the app shell and the PWA standalone layout.
- Narrow screens reduce spacing and typography while keeping deck and mixer controls touch-accessible.

## Landscape

The battle layout is designed around both decks being visible together:

- The header, footer and portrait view selector are hidden to preserve the available workspace height.
- Deck A and Deck B sit on either side of the central mixer and both turntable compositions are rotated 90 degrees counter-clockwise.
- The central mixer occupies a dedicated column between the decks. The TOOLS toggle is positioned above it.
- The turntable artwork is scaled as one composition so the platter, record, tonearm and physical-style controls stay aligned.
- Short landscape viewports use a specific sizing adjustment to keep the enlarged deck compositions within the available height.

This layout is selected by viewport orientation in CSS, not by a desktop/mobile device detector. A desktop browser in landscape uses the same dual-deck composition.

## Installed PWA

In standalone display mode the app uses the full available app viewport, disables document overscroll and retains safe-area handling. The operating system may still reserve status-bar or system areas.

The service worker can make the app shell available after a successful online visit and cache population. It does not make uncached files or user-selected audio available offline by itself. See [PWA shell guide](../reference/pwa-shell.md) for installation steps and the real-device checklist.

## Layout source

- Main view selection and composition: [src/App.tsx](../../src/App.tsx)
- App shell and orientation rules: [src/styles.css](../../src/styles.css)
- Deck artwork and physical-style controls: [src/components/Turntable.css](../../src/components/Turntable.css)
- Mixer presentation: [src/components/mixer/MixerPanel.css](../../src/components/mixer/MixerPanel.css)
