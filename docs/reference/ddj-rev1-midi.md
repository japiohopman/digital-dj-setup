# Pioneer DDJ-REV1 — MIDI discovery

**Status:** Phase 0 discovery in progress. No control mapping is implemented or implied by this document.

## Target and scope

The target is the Pioneer DJ DDJ-REV1 connected over USB to a desktop browser. The first phase proves Web MIDI access and records the messages emitted by the physical controller. It does not route messages to deck transport, scratching, mixer controls or audio outputs.

The existing touch, pointer/mouse and keyboard workspace remains fully usable when no controller is connected, when the browser does not support Web MIDI, or when permission is denied.

## Browser and permission boundary

- Initial test target: desktop Chrome or Edge over HTTPS; localhost is suitable during development.
- Web MIDI access must follow an explicit user action. Never request it automatically on page load.
- Request standard MIDI access with `sysex: false`. SysEx is not required for this discovery phase.
- Unsupported APIs, denied permission, missing ports, port rename, disconnect and reconnect must be recoverable states.
- Do not promise support for iOS Safari or every installed PWA environment.
- MIDI diagnostics are development-only and must not block app startup or normal DJ use.

## Capture procedure

This procedure is actionable once the development-only MIDI Inspector has been installed with the Phase 0 implementation. It is not a pre-implementation setup checklist.

1. Connect and power the physical DDJ-REV1.
2. Open the development build in desktop Chrome or Edge over HTTPS/localhost.
3. Open **TOOLS → DevKit → MIDI Inspector** and explicitly request MIDI access.
4. Select the input port identified as the DDJ-REV1. Do not infer identity from a guessed port-name substring alone; expose the available names so the operator can choose.
5. Move one physical control at a time. Record the raw bytes, MIDI message type, channel, timestamp and the exact physical control/action.
6. Repeat each action to establish whether the message is stable. Record separate values for press, release, touch, rotation or movement as applicable.
7. Disconnect and reconnect the USB cable and verify that the inspector recovers without leaving stale input state.

Do not map a message to an app action until the physical capture is repeatable and the message's meaning is documented.

## Observed MIDI inventory

No physical MIDI messages have been verified yet. Populate this table only from captures made with the user's controller.

| Physical control/action | Port name | Raw bytes (hex) | Message type | Channel | Repeatable / notes |
|---|---|---|---|---|---|
| _Awaiting physical capture_ | — | — | — | — | — |

## Architecture boundary

- Keep browser MIDI access and port lifecycle under `src/hardware/midi/`.
- Request access only from the explicit inspector action.
- Keep the inspector under the existing development-only DevKit in the shared TOOLS workspace menu.
- Display a bounded recent-message view; do not retain an unbounded event history.
- Keep raw MIDI inspection separate from typed app input adapters. Phase 0 must not dispatch transport, platter, scratch, tonearm or mixer actions.
- The MIDI layer must not create or own an `AudioContext`, `AudioNode`, `AudioBuffer`, transport state or a second deck state machine.
- On disconnect or teardown, remove listeners, release held-input bookkeeping and clear stale port references.

## Implementation versus later phases

**Phase 0 (this task):** Web MIDI capability/permission states, input/output enumeration, explicit port selection, raw input inspection, connection-change handling, focused mocked-interface tests, and a source-backed physical-device capture inventory.

**Later, separate tasks:** transport mapping; mixer mapping through the existing `MixerAudioGraph`; jogwheel/touch/scratch mapping through the existing deck interaction and state-machine path; performance pads and FX where appropriate; and any audio-device or headphone-routing investigation.

**Not part of this phase:** guessed MIDI bytes, SysEx, WebHID, Electron/Tauri, a local bridge, a new audio engine, hardware audio routing, or changes to existing touch/mouse/keyboard behaviour.

## Sources

- [Pioneer DJ DDJ-REV1 product page](https://www.pioneerdj.com/en/product/dj-controllers/ddj-rev1/)
- [Pioneer DJ DDJ-REV1 User Manual](https://www.pioneer-dj.de/wp-content/uploads/2024/02/Pioneer-DJ-DDJ-REV1-User-Manual.pdf)
- [MDN: Web MIDI API](https://developer.mozilla.org/en-US/docs/Web/API/Web_MIDI_API)
- [MDN: Navigator.requestMIDIAccess()](https://developer.mozilla.org/en-US/docs/Web/API/Navigator/requestMIDIAccess)
- [Mixxx DDJ-REV1 mapping proposal](https://github.com/mixxxdj/mixxx/pull/16722) — community research only; verify status, licence and provenance before relying on implementation details.
