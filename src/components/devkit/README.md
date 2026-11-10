# Development Kit

This folder contains developer-only diagnostics. It is imported from `App.tsx` only when `import.meta.env.DEV` is true.

## Access

- Open the shared **TOOLS** popover using the button above the mixer.
- The popover contains the track loaders and, in development builds, the developer diagnostics.
- **Alt+D** toggles the popover where the browser allows the app to receive that shortcut.
- **Alt+Shift+D** is the fallback in Chromium browser windows, where Alt+D is normally reserved for the address bar.
- Press **Escape** to close the popover.

## Adding a widget

1. Add the widget component and its styles in this folder (put individual tools under `widgets/`).
2. Add its `id` and display label to the typed `DEV_WIDGETS` registry in `DevKit.tsx`.
3. Add a boolean enabled-state render branch for the new widget.
4. Keep the tool read-only with respect to product state: diagnostics may receive props/callbacks for measurements, but must not mutate deck transport, tonearm, motor or audio state.
5. Add tests for default-hidden state, toggle behaviour and any widget-specific measurements.

The **Arm angle meter** receives only the active deck label and its live arm angle. Its groove-start/end captures are diagnostic measurements local to the widget. Hiding it preserves those measurements until the widget is unmounted.

The **Deck state trace** receives a read-only snapshot of the active deck state and the most recent accepted/rejected transitions. It cannot dispatch events or change product state.

Do not place developer UI or widget styling inside `Turntable.tsx` or `Turntable.css`.
