# Pioneer DDJ-REV1 — MIDI discovery

**Status:** Physical USB-MIDI connection confirmed on the user's HP EliteBook 850 G2 after changing USB ports. The development MIDI Inspector receives incoming messages. Three physical button captures have been repeated and recorded below: left-deck PLAY/PAUSE and CUE, plus right-deck PLAY/PAUSE. Remaining controls still need to be captured and identified; no control mapping is implemented or implied.

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

**Connection smoke test (13 November 2026):** The DDJ-REV1 is detected by the local browser MIDI inspector and incoming messages appear after the controller is connected through a working USB port (the port previously used by the mouse). This confirms live USB-MIDI communication. The individual physical controls and their exact byte sequences have not yet been isolated and documented. Populate the table below only from deliberate captures made with one control/action at a time.

### Capture discipline

- Select the DDJ-REV1 input and leave it selected for the session.
- Start with one physical control only. Do not touch another control during the capture.
- For buttons, record press and release separately; repeat the same action three times to confirm stable bytes.
- For knobs and faders, record minimum, midpoint and maximum, then a slow sweep. Note whether values increase or decrease.
- For jogwheels, isolate touch, clockwise movement and counter-clockwise movement; do not combine touch and rotation in the first test.
- Record the physical control name, action, exact byte sequence(s), message type, channel and whether the result repeated consistently.
- The inspector shows the newest messages first and retains at most 40. To reset the visible capture before the next control, select the empty input option and then reselect the DDJ-REV1 input.
- Do not infer a control meaning from a byte sequence alone. Confirm it by repeating the same physical action and comparing press/release or movement values.

| Physical control/action | Port name | Raw bytes (hex) | Message type | Channel | Repeatable / notes |
|---|---|---|---|---|---|
| Left deck PLAY/PAUSE — press | DDJ-REV1 input (exact displayed label not recorded) | `90 0B 7F` | Note On, note number 11, velocity 127 | 1 | Observed in five repeated press/release cycles |
| Left deck CUE — press | DDJ-REV1 input (exact displayed label not recorded) | `90 0C 7F` | Note On, note number 12, velocity 127 | 1 | Observed in five repeated press/release cycles |
| Left deck CUE — release | DDJ-REV1 input (exact displayed label not recorded) | `90 0C 00` | Note On with velocity 0 (release semantics) | 1 | Observed in five repeated press/release cycles |
| Right deck PLAY/PAUSE — press | DDJ-REV1 input (exact displayed label not recorded) | `91 0B 7F` | Note On, note number 11, velocity 127 | 2 | Observed in five repeated press/release cycles |
| Right deck PLAY/PAUSE — release | DDJ-REV1 input (exact displayed label not recorded) | `91 0B 00` | Note On with velocity 0 (release semantics) | 2 | Observed in five repeated press/release cycles |
| Left deck PLAY/PAUSE — release | DDJ-REV1 input (exact displayed label not recorded) | `90 0B 00` | Note On with velocity 0 (release semantics) | 1 | Observed in five repeated press/release cycles |

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
