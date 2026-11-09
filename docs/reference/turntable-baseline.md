# Turntable and tonearm baseline

**Status:** living engineering reference  
**Last checked:** 2026-11-09  
**Applies to:** current Technics SL-1200MK2-inspired implementation  
**Runtime source of truth:** `src/audio/tonearmGeometry.ts`, `src/audio/useTonearm.ts`, `src/audio/useVinylMotion.ts`, `src/components/Turntable.css`, `src/styles.css`, and their tests.

> Do not mix up the physical SL-1200MK2 specifications with this application's visual calibration. The degree values below describe the current screen-space arm rotation in our app, not factory-specified tonearm angles or universal vinyl groove radii.

## 1. Current app geometry

### Deck orientation

- Portrait: deck uses its normal unrotated orientation.
- Landscape / battle layout: each deck is rotated **-90° (90° counter-clockwise)** with CSS `rotate(-90deg)`.
- Pointer coordinates are converted back to deck-local coordinates before tonearm bearing is calculated. Keep this conversion and pivot calculation in sync.

Source: `src/styles.css` (landscape `.dual-deck__turntable`) and `src/audio/tonearmGeometry.ts` (`calculateArmPointerBearingFromPointer`).

### Tonearm pivot

The arm assembly rotates as one unit around the calibrated gimbal pivot:

- CSS transform origin: **54% × 27%** of the arm-holder box.
- Holder geometry in `Turntable.css`: right **2.75%**, top **0**, width **28.55%**, height **99.75%**, with top margin **-4% of deck width**.
- `getTonearmPivot()` reproduces that CSS geometry in deck-local pixels. Battle mode swaps the local width/height basis before calculating the same pivot.
- The arm sprite is `/turntable/landscape/tt_arm.png`; do not move the pivot to the deck centre or rotate the arm as a flat translation.

These are measured/layout calibration values for our artwork and CSS, not Technics service-manual measurements.

### Current LP angle model

Angles are degrees relative to the parked arm position:

| Angle | Current application meaning |
|---:|---|
| **0°** | Parked in the arm rest |
| **13.30°** | Outer physical record edge in the app hit model |
| **13.30°–16.50°** | Accepted LP outer lead-in / initial needle-drop band |
| **15°** | Start of the linear programme timecode sweep |
| **15°–35°** | Programme playback sweep, linearly mapped from 0% to 100% |
| **35°–38°** | Run-out region; cue position clamps to track end |
| **38°** | Last playable/run-out boundary; after natural playback end the arm settles here |
| **>38°–49°** | Centre-label / off-record region; 49° is the current interaction limit |

Important boundary behaviour in code and tests:

- The record hit-area is inclusive from **13.30° through 38°**.
- A deliberate landing at **38°** is still classified as record/run-out. The label begins only **above 38°**.
- Angles from **13.30° to 15°** cue to track start. Angles from **15° to 35°** map linearly. Angles from **35° to 38°** cue to track end.
- `angleToPlaybackProgress()` returns `null` outside the record hit-area.
- The current seven-inch constant is **24°**, but it is only a future reference constant. It is **not** wired into a separate 7-inch geometry/configuration yet.

Canonical constants and boundary tests: `src/audio/tonearmGeometry.ts` and `src/audio/tonearmGeometry.test.ts`.

### Important wording

The current screen-space arm angle is **not**:
- the cartridge's 22° offset angle from the Technics service specification;
- the stylus's absolute polar angle around the record centre;
- a universal lead-in/run-out radius;
- a record-standard value.

To change LP or 7-inch calibration, measure/derive the actual pivot-to-stylus geometry and test it against the selected record dimensions. Update constants, tests and this document together.

## 2. Hardware facts — Technics SL-1200MK2

The following are model-specific facts from the operating instructions and service documentation:

| Fact | Documented value / behaviour | Source |
|---|---|---|
| Drive | Quartz direct-drive, manual turntable | Service manual, specifications |
| Nominal speeds | 33⅓ and 45 rpm | Service manual, specifications |
| Platter start-up | **0.7 s** to 33⅓ rpm from standstill (specification condition) | Service manual, specifications, printed p. 4 |
| Electronic brake | At 33 rpm the brake is adjusted to stop within **90°–120° after pressing Stop** | Service manual supplement, brake adjustment, printed p. 8 |
| Tonearm effective length | **230 mm** | Service manual, tonearm specifications, printed p. 3 |
| Overhang | **15 mm** | Service manual, tonearm specifications, printed p. 3 |
| Offset angle | **22°** | Service manual, tonearm specifications, printed p. 3 |
| End of side | User manually moves the arm to the arm rest, secures the arm clamp, then presses Start/Stop | Operating instructions, printed p. 6 |
| Cueing | With the cueing lever lowered, the tonearm descends slowly onto the record | Operating instructions, printed p. 6 |
| Power-off sequence | Press Start/Stop and allow the electronic brake to stop the platter before switching power off. The electronic brake does not work if power is switched off before Stop is pressed. | Operating instructions, printed p. 6 |

### Product behaviour implications

- The SL-1200MK2 is a **manual** turntable. Do not implement automatic tonearm return as if it were an MK2 hardware feature.
- Separate these events: **track ends**, **tonearm reaches/holds run-out**, **user presses Start/Stop**, **electronic brake stops platter**, and **user switches power off**.
- Do not turn the **90°–120°** brake specification into a fixed duration. It is an angular stopping range under the service adjustment condition.
- The **0.7 s** start-up figure is a hardware specification; it is not the timing currently used by the app simulation (see section 4).

## 3. Vinyl groove reference — IEC 60098:2020

IEC 60098:2020 defines compatibility characteristics for analogue records and reproducing equipment. The public sample for clauses 6.4–6.9 includes:

| Groove feature | Standard value |
|---|---|
| Lead-in pitch | **1.2 ± 0.4 mm** |
| Lead-in groove width | **60 ± 10 μm** |
| Recorded surface start | At least **one turn of plain groove** |
| Lead-out pitch | **6.4 ± 3.2 mm**, at least one turn |
| Finishing-groove diameter | **106.4 ± 0.8 mm** for types 3033, 2545, 2533 and 3045 |
| Finishing-groove diameter | **97.4 ± 1.0 mm** for types 1733 and 1745 |

The standard also gives maximum outer diameters of the recorded surface by its record types: 292.6 mm (3033/3045), 241.8 mm (2545/2533), and 168.3 mm (1733/1745).

**Caution:** these are standard-defined dimensions for named record types. They do not mean every vintage pressing, DJ tool, locked-groove record or special cut has identical groove radii. A groove pitch is a radial distance per revolution, not a tonearm angle.

Do not assume one universal run-out angle or run-out duration. A physical groove's radial position must be combined with the turntable's pivot/stylus geometry before deriving the screen-space arm angle.

## 4. Current app simulation values (not hardware specifications)

These are implementation choices found in the current code:

| Behaviour | Current simulation |
|---|---|
| Motor spin-up animation | **450 ms**, speed factor from 20% to 100% |
| Motor coast animation | **1,200 ms**, linear speed factor down to zero |
| Tonearm visual transition | **280 ms** CSS easing |
| Platter speed | 33⅓ or 45 rpm, multiplied by the pitch factor |
| Tonearm at natural track end | Settles at the configured **38°** run-out angle |
| During reverse platter scratching | Tonearm remains physically stationary; it does not sweep backwards with the reversed playhead |

The spin-up/coast durations are not supported by the Technics service specification. Keep them labelled as simulation until we measure the real unit and agree on a behaviour model.

### Scratch timecode

The scratch implementation anchors the transport position to the live playhead when the gesture starts, then derives time from visible platter-angle delta:

`newPosition = startPosition + angularDelta / (2π × effectiveRotationsPerSecond)`

Effective rotations per second are derived from selected rpm and pitch. This keeps the visual platter gesture and scratch timecode on one calculation path. See `src/audio/useVinylMotion.ts`.

## 5. Source register

1. **Technics SL-1200MK2 operating instructions**, Panasonic-hosted PDF, printed p. 6 — operating sequence, cueing, end-of-side procedure and electronic-brake warning.  
   https://help.na.panasonic.com/wp-content/uploads/2023/02/SL1200MK2_SFNU122M06_ENG.pdf

2. **Technics SL-1200MK2/1210MK2 service manual**, specifications, printed pp. 3–4 — tonearm dimensions, offset angle, nominal speed and 0.7 s start-up specification.  
   https://www.liveline.be/wa_files/TECHNICS_20SL1200MKII-LIVELINE.pdf

3. **Technics SL-1200MK2/1210MK2 service manual supplement**, English brake adjustment table, printed p. 8 — 90°–120° stop-angle adjustment at 33 rpm. Same service manual PDF as source 2.

4. **IEC 60098:2020 — Analogue audio disk records and reproducing equipment**, clauses 6.4–6.9, printed pp. 12–13. Public preview/sample; the full standard may require licensed access.  
   https://standards.theiteh.com/catalog/standards/sist/c91e4c30-2cba-4431-9a3e-a95714d2dff7/sist-en-iec-60098-2020

## 6. Known gaps

- The current LP angles are software calibration, not yet a physical radius-to-arm-angle model validated against an actual SL-1200MK2 and representative records.
- The seven-inch value (**24°**) is not an implemented seven-inch profile.
- Real coast-down timing and platter inertia under power loss have not been measured on the target unit. Do not infer them from the electronic-brake spec.
- Locked-groove behaviour varies by record; do not make every run-out a fixed loop without a product decision.
- The current code's lead-in JSDoc once stated 14.70°–16.50° while the actual constants and tests use 13.30°–16.50°. The source comment is corrected in this documentation change; constants and tests remain the executable reference.
