# Pioneer DDJ-REV1 — MIDI discovery

**Status:** Physical USB-MIDI connection confirmed on the user's HP EliteBook 850 G2 after changing USB ports. The development MIDI Inspector receives incoming messages. Four physical button captures (PLAY/PAUSE and CUE on both decks), both channel faders, the crossfader, both GAIN (TRIM) knobs, left-deck EQ HI/MID/LOW, right-deck EQ LOW and both tempo sliders have been captured. Right-deck EQ HI/MID remain unverified physical controls. Left jogwheel touch press/release has now been captured; the same capture also contained platter-rotation events, so a stationary touch-only repeat and isolated rotation tests remain useful. Remaining controls still need to be captured and identified; no app control mapping is implemented or implied.

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

**Connection smoke test (13 November 2026):** The DDJ-REV1 is detected by the local browser MIDI inspector and incoming messages appear after the controller is connected through a working USB port (the port previously used by the mouse). This confirms live USB-MIDI communication. The four transport buttons, both channel faders, crossfader, both GAIN (TRIM) knobs, left EQ HI/MID/LOW, right EQ LOW and both tempo sliders and left jogwheel touch have now been isolated in physical captures. The left jogwheel capture also included rotation data while touch was active. The bounded 40-message inspector buffer does not preserve complete end-to-end value curves for continuous controls.

### Capture discipline

- Select the DDJ-REV1 input and leave it selected for the session.
- Start with one physical control only. Do not touch another control during the capture.
- For buttons, record press and release separately; repeat the same action three times to confirm stable bytes.
- For knobs and faders, record minimum, midpoint and maximum, then a slow sweep. Note whether values increase or decrease.
- For jogwheels, isolate top-surface touch, platter rotation and wheel-side rotation. Capture touch press/release separately, then perform clockwise and counter-clockwise rotations; do not combine these during the isolated rotation tests.
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
| Right deck CUE — press | DDJ-REV1 input (exact displayed label not recorded) | `91 0C 7F` | Note On, note number 12, velocity 127 | 2 | Observed in five repeated press/release cycles |
| Right deck CUE — release | DDJ-REV1 input (exact displayed label not recorded) | `91 0C 00` | Note On with velocity 0 (release semantics) | 2 | Observed in five repeated press/release cycles |
| Left deck PLAY/PAUSE — release | DDJ-REV1 input (exact displayed label not recorded) | `90 0B 00` | Note On with velocity 0 (release semantics) | 1 | Observed in five repeated press/release cycles |
| Left deck channel fader — slide | DDJ-REV1 input (exact displayed label not recorded) | `B0 13 xx` + `B0 33 xx` | Control Change; CC 19 MSB + CC 51 LSB (14-bit pair) | 1 | Physical capture emitted both CCs. Captured CC 19 MSB values ranged `78`–`7F`; CC 51 LSB values included `00`–`7F`. The 40-message view truncated the full sweep. Pioneer identifies this pair as CH FADER; bottom=min, top=max. |
| Right deck channel fader — slide | DDJ-REV1 input (exact displayed label not recorded) | `B1 13 xx` + `B1 33 xx` | Control Change; CC 19 MSB + CC 51 LSB (14-bit pair) | 2 | Physical capture emitted both CCs. Captured CC 19 MSB values ranged `78`–`7F`; CC 51 LSB values included `00`–`7F`. The 40-message view truncated the full sweep. Matches the left fader with channel 2. Pioneer identifies this pair as CH FADER; bottom=min, top=max. |
| Crossfader — slide left ↔ right | DDJ-REV1 input (exact displayed label not recorded) | `B6 1F xx` + `B6 3F xx` | Control Change; CC 31 MSB + CC 63 LSB (14-bit pair) | 7 | Physical capture emitted both CCs. The supplied 40-message window includes CC 31 values `00`–`07` and CC 63 values `00`–`7F`; it does not preserve a complete sweep. Pioneer identifies this as MIXER → CROSSFADER; left=min, right=max. |
| Left deck tempo/pitch slider — move min ↔ plus | DDJ-REV1 input (exact displayed label not recorded) | `B0 00 xx` + `B0 20 xx` | Control Change; CC 0 MSB + CC 32 LSB (14-bit pair) | 1 | Physically observed on the left deck. User reports moving the slider from minimum toward plus and back. The supplied excerpt shows CC 0 (MSB) fixed at `00` and CC 32 (LSB) changing from `00` through `0F`; it does not demonstrate the full end-to-end range or clearly preserve the return sweep. Pioneer identifies CC 0/32 as TEMPO on deck channels 1/2/3/4, with `00 00`=minimum and `7F 7F`=maximum. |
| Right deck tempo/pitch slider — move min ↔ plus | DDJ-REV1 input (exact displayed label not recorded) | `B1 00 xx` + `B1 20 xx` | Control Change; CC 0 MSB + CC 32 LSB (14-bit pair) | 2 | Physically observed on the right deck. The supplied 40-message window shows CC 0 (MSB) fixed at `00` and CC 32 (LSB) values `00`–`13`. This confirms the channel-2 TEMPO pair, but the excerpt does not establish complete min-to-max travel or a complete return sweep. Pioneer identifies CC 0/32 as TEMPO on deck channels 1/2/3/4, with `00 00`=minimum and `7F 7F`=maximum. |
| Left jogwheel — top-surface touch | DDJ-REV1 input (exact displayed label not recorded) | `90 36 7F` (touch on) / `90 36 00` (touch off) | Note On, note 54 (F#3), velocity 127 / 0 | 1 | Physically observed in the left jogwheel capture. The press and release values match Pioneer’s official JOG (Platter) touch definition. The excerpt is one observed on/off pair; repeatability is not yet established. |
| Left jogwheel platter — rotation while Vinyl On | DDJ-REV1 input (exact displayed label not recorded) | `B0 22 41` / `B0 22 3F` | Control Change; CC 34 | 1 | Additional rotation deltas were present while the touch note was active. Pioneer identifies CC 34 as JOG (Platter) rotation with Vinyl On; clockwise increases from `41` and counterclockwise decreases from `3F`. The supplied excerpt alternates `41`/`3F`, so direction and a clean isolated rotation test remain unverified. |
| Left jogwheel wheel-side — rotation | DDJ-REV1 input (exact displayed label not recorded) | `B0 21 3F` | Control Change; CC 33 | 1 | One event appears immediately before the touch-on event. Pioneer identifies CC 33 as JOG (Wheel Side) rotation, with delta count relative to the previous operation. This single event is not enough to establish direction or repeatability. |
| Left deck GAIN (TRIM) — rotate counterclockwise ↔ clockwise | DDJ-REV1 input (exact displayed label not recorded) | `B0 04 xx` + `B0 24 xx` | Control Change; CC 4 MSB + CC 36 LSB (14-bit pair) | 1 | Physical capture emitted both CCs. The 40-message window includes CC 4 values `00`–`07` and CC 36 values `00`–`7D`; the complete sweep/endpoints are not preserved. Pioneer identifies this as GAIN (TRIM), fully counterclockwise=min and fully clockwise=max. |
| Right deck GAIN (TRIM) — rotate counterclockwise ↔ clockwise | DDJ-REV1 input (exact displayed label not recorded) | `B1 04 xx` + `B1 24 xx` | Control Change; CC 4 MSB + CC 36 LSB (14-bit pair) | 2 | Physical capture emitted both CCs. The 40-message window includes CC 4 values `00`–`07` and CC 36 values `00`–`7A`; the complete sweep/endpoints are not preserved. Matches the left control on channel 2. Pioneer identifies this as GAIN (TRIM), fully counterclockwise=min and fully clockwise=max. |
| Left deck EQ HI — rotate counterclockwise ↔ clockwise | DDJ-REV1 input (exact displayed label not recorded) | `B0 07 xx` + `B0 27 xx` | Control Change; CC 7 MSB + CC 39 LSB (14-bit pair) | 1 | Physically observed on the left deck. Supplied 40-message window shows CC 7 values `00`–`07` and CC 39 values `00`–`7D`; full sweep/endpoints are not preserved. Pioneer identifies this as EQ HI, fully counterclockwise=min and fully clockwise=max. |
| Left deck EQ MID — rotate counterclockwise ↔ clockwise | DDJ-REV1 input (exact displayed label not recorded) | `B0 0B xx` + `B0 2B xx` | Control Change; CC 11 MSB + CC 43 LSB (14-bit pair) | 1 | Physically observed on the left deck. Supplied 40-message window shows CC 11 values `00`–`07` and CC 43 values `00`–`72`; full sweep/endpoints are not preserved. Pioneer identifies this as EQ MID, fully counterclockwise=min and fully clockwise=max. |
| Left deck EQ LOW — rotate counterclockwise ↔ clockwise | DDJ-REV1 input (exact displayed label not recorded) | `B0 0F xx` + `B0 2F xx` | Control Change; CC 15 MSB + CC 47 LSB (14-bit pair) | 1 | Physically observed on the left deck. Supplied 40-message window shows CC 15 values `00`–`07` and CC 47 values `00`–`7A`; full sweep/endpoints are not preserved. Pioneer identifies this as EQ LOW, fully counterclockwise=min and fully clockwise=max. |
| Right deck EQ LOW — rotate counterclockwise ↔ clockwise | DDJ-REV1 input (exact displayed label not recorded) | `B1 0F xx` + `B1 2F xx` | Control Change; CC 15 MSB + CC 47 LSB (14-bit pair) | 2 | Physically observed on the right deck. Supplied 40-message window shows CC 15 values `00`–`07` and CC 47 values `00`–`7B`; full sweep/endpoints are not preserved. Matches the left-deck EQ LOW pair on channel 2. Pioneer identifies this as EQ LOW, fully counterclockwise=min and fully clockwise=max. |
| Right deck EQ MID — expected, not separately captured | DDJ-REV1 input (expected from official spec) | `B1 0B xx` + `B1 2B xx` | Control Change; CC 11 MSB + CC 43 LSB (14-bit pair) | 2 | Manufacturer specification assigns EQ MID to deck channels 1/2/3/4. This channel-2 pair is therefore the documented expectation; physical right-deck verification remains open. |
| Right deck EQ HI — expected, not separately captured | DDJ-REV1 input (expected from official spec) | `B1 07 xx` + `B1 27 xx` | Control Change; CC 7 MSB + CC 39 LSB (14-bit pair) | 2 | Manufacturer specification assigns EQ HI to channels 1/2/3/4. This channel-2 pair is therefore the documented expectation; physical right-deck verification remains open. |

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
- [Pioneer DJ DDJ-REV1 MIDI Message List](https://www.pioneerdj.com/-/media/pioneerdj/software-info/controller/ddj-rev1/ddj-rev1_midi_message_list_e1.pdf) — identifies channel fader CC 19 (MSB) / CC 51 (LSB), with bottom=min and top=max.
- The same official MIDI Message List identifies JOG (Platter) touch as Note 54 (`9n 36 hh`) on deck channels 1/2/3/4; velocity `7F`=ON and `00`=OFF. It identifies JOG (Platter) rotation in Vinyl On mode as CC 34 (`Bn 22 hh`), with clockwise increasing from `41` and counterclockwise decreasing from `3F`, and JOG (Wheel Side) rotation as CC 33 (`Bn 21 hh`) with relative delta-count values.
- The same official MIDI Message List identifies TEMPO as CC 0 (MSB) / CC 32 (LSB) on deck channels 1/2/3/4; minimum is `00 00` and maximum is `7F 7F`.
- The same official MIDI Message List identifies GAIN (TRIM) as CC 4 (MSB) / CC 36 (LSB) on deck channels 1/2/3/4; fully counterclockwise=min and fully clockwise=max.
- The same official MIDI Message List identifies EQ HI as CC 7 (MSB) / CC 39 (LSB), also on deck channels 1/2/3/4; fully counterclockwise=min and fully clockwise=max.
- The same official MIDI Message List identifies EQ MID as CC 11 (MSB) / CC 43 (LSB), also on deck channels 1/2/3/4; fully counterclockwise=min and fully clockwise=max.
- The same official MIDI Message List identifies EQ LOW as CC 15 (MSB) / CC 47 (LSB), also on deck channels 1/2/3/4; fully counterclockwise=min and fully clockwise=max.
- [MDN: Web MIDI API](https://developer.mozilla.org/en-US/docs/Web/API/Web_MIDI_API)
- [MDN: Navigator.requestMIDIAccess()](https://developer.mozilla.org/en-US/docs/Web/API/Navigator/requestMIDIAccess)
- [Mixxx DDJ-REV1 mapping proposal](https://github.com/mixxxdj/mixxx/pull/16722) — community research only; verify status, licence and provenance before relying on implementation details.
