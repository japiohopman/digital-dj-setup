# User workflows

This page describes workflows that are present in the current app. It does not describe future library, account or controller behaviour.

## Choose a workspace view

In portrait orientation, use the navigation at the top of the app:

1. **DECK A** opens the first turntable.
2. **DECK B** opens the second turntable.
3. **MIXER** opens the dedicated mixer view.

The selected view is shown; the inactive deck is hidden in portrait so the available space stays focused. The TOOLS entry remains available above the workspace.

In landscape orientation, the app changes to the two-deck battle composition. See [Responsive layouts](responsive-layouts.md).

## Load a bundled Battle Ammo track

1. Open **TOOLS**.
2. In **Track crates**, select the Battle Ammo starter crate.
3. Under **LOAD TO DECK**, choose Deck A or Deck B.
4. Select **LOAD TO A** or **LOAD TO B** on the track row.
5. Wait for the load confirmation.

The currently bundled starter crate contains **Scratch Making Me Itch** and **Super Duck Breaks**. A successful load leaves the track stopped at the start. It does not automatically begin playback.

## Load music from the device

1. Open **TOOLS**.
2. Find **YOUR OWN MUSIC / Load from device**.
3. Use the loader belonging to Deck A or Deck B and choose an audio file.

The same deck loader is available from the turntable's track controls. An audio file can also be dragged onto the record surface on desktop browsers that support file drag-and-drop.

Track files selected by the user are read locally by the browser. They are not uploaded to a server. Cancelling the file picker does not select a new track. Loading a track does not automatically start playback.

## Operate a deck

When no record is loaded, the visible slipmat is also a manual surface: hold it and drag around its centre to stop, pull or push the platter/slipmat visually. On release, it eases back to the motor's current speed. This empty-platter interaction is silent and does not start programme playback, scratch audio or needle-contact sounds.

## Operate a deck

The current turntable surface exposes these controls:

- **Power:** toggles the deck's power state.
- **Start / Stop:** starts or stops the platter motor. Spin-up and coast-down are represented as separate motor phases.
- **33 / 45:** selects the platter speed while the deck is powered.
- **Target light:** toggles the turntable target light while powered.
- **Pitch:** adjusts the displayed pitch control across its ±8 range and affects the effective playback rate used by the vinyl-motion interaction.
- **Tonearm:** pick up, drag, cue, drop or park the arm using the interactive tonearm and cartridge targets.
- **Record:** drag the record surface to manipulate playback. The app calculates scratch direction, speed and track position from the gesture; reverse movement is part of the same interaction model. When the record surface has keyboard focus, ArrowLeft and ArrowRight seek backward or forward in two-second increments.

Programme audio is gated by the deck's track/record/transport and stylus-contact state. A record-surface sound effect is modelled separately from the programme audio path. The tonearm and motor are not interchangeable controls: lifting the stylus does not mean the platter motor has stopped.

## Use the mixer

Choose **MIXER** in portrait, or use the centre mixer in landscape.

- Move the **Deck A** and **Deck B LEVEL** faders independently.
- Move the **CROSS FADER** between A and B to blend the two channels.
- Adjust **CUT-IN** to change the app's symmetric cut-lag zone at the ends of the crossfader travel.
- Watch the **A**, **MASTER** and **B** meters. They display measured signal levels from the audio graph, not a decorative animation.

The mixer controls change the signal path; they do not replace the underlying deck motor, tonearm or transport state. The current implementation and app-specific gain choices are documented in [Shared mixer audio routing](../reference/audio-routing.md).

## Open and close TOOLS

- Select the **TOOLS** toggle above the mixer.
- Press **Escape** to close the overlay.
- **Alt+D** toggles the overlay in browsers that deliver that shortcut to the page. Some browsers, including Chromium configurations, may reserve Alt+D for browser navigation; use the visible TOOLS button in those cases.

The overlay hosts both deck track loaders, the bundled crate and development-only widgets when running a development build. The widgets are not available in the production app.
