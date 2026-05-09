# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this repo is

`melagabra` pairs a research paper with its interactive companion:

- `paper` — manuscript on the algebraic structure of the 72 Carnatic Melakarta parent scales (Klein four-group action, Hamming-distance-2 graph, Gray-code Hamiltonian, Z-related Forte classes, vivadi nibble predicate). It is the authoritative spec for the math.
- `src/` — single-page interactive companion ("Melagabra"). Static deployment, no build step, no backend.

The paper defines the math; the site must stay consistent with it. When the math and the code disagree, the paper wins — update the code.

## File layout

```
src/
  index.html                 shell, plate scaffolding, Google Fonts + Tailwind/Phosphor CDN
  app.js                     state Proxy, hash router, view dispatcher, all plate
                             renderers, instrument surfaces, audio + MIDI gate
  data.js                    master per-mela record, edges, distance matrix, Gray-path,
                             Forte stratification, nibble grid, boot-time selfTest()
  styles.css                 Palmleaf Observatory palette, plate transitions,
                             stipple-ink draw keyframe, vermillion pulse, perform inversion
  audio/engine.js            Web Audio engine — tambura drone, voice synth,
                             vivadi §7.4 probe, Gray-walk auto-stepper
  hardware/sysex.js          Pure encoder/decoder for the Web ↔ Lightpad protocol
  hardware/roli.js           RoliBlock WebMIDI client (MPE allocator, button SysEx)
  hardware/melagabra.littlefoot   Hardware program for the Lightpad Block
  hardware/roli-tests.mjs    Pure-Node unit tests for sysex.js + RoliBlock state machine
  exports/scl-midi-json.js   Scala (.scl), Type-1 SMF (.mid), JSON exporters
  guitar.html                Standalone fretboard visualizer — dark theme, 24-fret,
                             customizable tuning, scale chooser (72 Melakartas + known scales),
                             harmonic-function colored orbs, 3-row nibble bit display
```

## Running

No build step.  Serve `src/` with any static server:

```bash
node /tmp/static-server.js src 8765   # or python3 -m http.server -d src 8765
open http://localhost:8765
```

## Encoding convention (load-bearing)

Everything in `src/` and the paper assumes the **mirrored-endianness 12-bit layout** (paper §2.3). Do not "fix" it to a more obvious LSB-at-root scheme — the Klein-four group only closes as XOR under this convention.

Bit assignment (`PITCH_TO_BIT` in `data.js`, semitone → bit index):

```
S=0→11   R1=1→10   R2/G1=2→9   R3/G2=3→8   G3=4→7
M1=5→5   M2=6→6    P=7→4
D1=8→0   D2/N1=9→1 D3/N2=10→2  N3=11→3
```

Lower R-G tetrachord uses descending bit indices; upper D-N uses ascending; this is the "mirror." Sa and Pa are bits 11 and 4.

**Subtle, easy to get wrong:** the six admissible nibble shapes index in *opposite* orders for the two tetrachords:

```
ADMISSIBLE_NIBBLES_RG = [0xC, 0xA, 0x9, 0x6, 0x5, 0x3]   // (R₁G₁), (R₁G₂), (R₁G₃), (R₂G₂), (R₂G₃), (R₃G₃)
ADMISSIBLE_NIBBLES_DN = [0x3, 0x5, 0x9, 0x6, 0xA, 0xC]   // 4-bit reversal of the row above
```

The DN array is the bit-reversal of the RG array, because the two tetrachords scan opposite directions across the chromatic semitones. The earlier version of `src/index.html` used the same array for both regions and produced wrong bits for D-N indices 1, 2, 5, 6 — including mela 29 (Western major scale). Verify against the paper's Table 1 (mela 8 → 0xD35; 15 → 0xCB9; 21 → 0xB39; 29 → 0xABA; 51 → 0xCD9; 57 → 0xB59; 65 → 0xADA).

## Klein-four masks

Three XOR masks define the Klein-4 group action (paper §3):

```
K1 = 0x060   madhyama swap        (toggles bits 5, 6)
K2 = 0x7EF   antipodal complement (fixes Sa & Pa, flips the other 10 bits)
K3 = 0x78F   K1 ⊕ K2
```

Orbit identity: for `n ∈ {1..18}`, the orbit is `{n, 37−n, 36+n, 73−n}`. After applying a mask to a mela's bits, look up the result in `BITS_TO_MELA` to get the new mela number.

## Vivadi predicate

`vivadiFlags(bits)` implements the "extremal-tetrachord-nibble" refinement (paper §7): a mela is *extremally vivadi* iff its R-G nibble (`(bits>>7) & 0xF`) or its D-N nibble (`bits & 0xF`) equals `0x3` or `0xC`. This produces exactly the classical 40-mela set (Theorem 7.4). The 14-mela exception set X (Prop 7.5) — `{10, 16, 20, 21, 22, 23, 28, 46, 52, 56, 57, 58, 59, 64}` — is naïvely vivadi but not extremally vivadi (nibble = 0x6).

## Self-test (CLAUDE.md tripwire)

`data.js#selfTest()` runs at page boot and asserts:

- The Gray path has 72 unique melas and every consecutive pair is at d=2
- Exactly one madhyama crossing exists in the Gray path (Prop 5.2)
- The Hamming graph is 9-regular with the (4,4,1) regional partition (Theorem 4.1)
- 324 edges total
- 40 melas are extremally vivadi; the 14-exception set X matches the paper
- All 18 Klein orbits close as `{n, 37−n, 36+n, 73−n}`
- Mela {40, 48, 49} all have ICV (4,3,4,4,4,2); 40 ∈ 7-Z38, {48,49} ∈ 7-Z18 (Theorem 6.2)
- The 36 d=10 pairs are exactly the antipodal pairs (Theorem 4.4)

If the self-test fails, the page surfaces a vermillion banner: *"Self-test failed — math may disagree with the paper."* This is the automated tripwire. If you change `getMelaBits`, the prime-form algorithm, or the orbit structure, run the test before checking in.

## State model & URL routing

A single `State` object behind a Proxy with named-event pub/sub (in `app.js`).  Hash-routed: `#/<view>&key=value&…`.  Examples:

```
#/atlas                                 default landing (Plate 0)
#/orbits&orbit=15                       Klein quilt focused on orbit 15 = {15, 22, 51, 58}
#/hamming&mela=29&layout=bunched        Hamming graph, orbit-bunched layout, mela 29 active
#/graycode&step=35                      the dramatic madhyama crossing
#/zrelation&pair=40,48                  Z-triangle highlighting one Z-pair
#/vivadi&filter=exception               Vivadi lab filtered to the 14-exception set
#/perform&instrument=yantra             Console (Plate ∞), yantra-wheel surface
```

Two-way binding: `hashchange` → `parseHash()` → `setState`; ephemeral keys (hover, scrub, audio refs) stay out of the URL.

## Audio model

The audio engine (`audio/engine.js`) is loaded **lazily**: the first user gesture that needs sound triggers a "Tap to begin" overlay, which on click instantiates the `AudioContext` and the Karplus-Strong-style tambura voices. iOS gesture requirement is honoured this way.

Bus topology:

```
master → DynamicsCompressor → destination
  ├── droneBus  (3× tambura voices, slow re-pluck with jīvāḷi pitch jitter)
  ├── voiceBus  (16-voice polyphonic synth pool, gamaka LFO 4.6 Hz, depth 0–80¢)
  └── probeBus  (vivadi §7.4 +7¢ detuned drone harmonic, beats at ~1.2 Hz)
```

The §7.4 probe is gated:  triggered iff active mela is extremally vivadi *and* not in the 14-exception set.  This makes the perceptual hypothesis testable by ear — the "borderline" exception melas should sound smoother despite the naïve predicate flagging them.

## Plate (view) inventory

```
Plate 0 — The Atlas      lobby, 18-orbit constellation reveal, Z-triangle pulse
Plate I — The Encoding   bit-vector + XOR calculator + 6 admissible nibbles
Plate II — Klein Quilt   18 × 4 grid; K₁ K₂ K₃ buttons act on active mela
Plate III — Distance     force-directed Hamming-2 graph + bunched-layout toggle
                         + 36 antipode overlay + (324, 936, 936, 324, 36) histogram
Plate IV — Gray Walk     circular Hamiltonian, woven-Bezier edges, M-crossing
                         dramatized, scrubber, idle pulse
Plate V — Z-Triangle     {40, 48, 49} cards + ICV histograms (pixel-locked y-axis)
                         + A/B blind test (localStorage scoring)
Plate VI — Vivadi Lab    6×6 nibble grid + filter tabs + drone-beating audio probe
Plate VII — Cross-curr.  Forte-class stratification + 7-35 septagon + mela 15↔57 callout
Plate VIII — Empirical   12×6 chakra heatmap (kaṭapayādi grid) — App. C counts only
Plate IX — Colophon      references, methods, citation
Plate ∞ — The Console    Perform mode; instrument picker (Yantra / Fretboard /
                         Piano roll / Vīṇa neck); K₁ K₂ K₃ pads; d=2 morph pads;
                         Gray-walk auto-stepper; .scl / .mid / .json exports
```

## Aesthetic — "Palmleaf Observatory"

Light-default vellum (#F4ECD8), iron-gall ink (#1B1A17), vermillion accent (#8B2E1F) reserved for vivadi pulses, K₂ antipodal cues, and the Z-triangle.  Indigo (#3A5A6C) for cold pole / R-G regions.  Brass (#C8A24A) for Sa/Pa anchors and rare ornament.  Newsreader display, Spectral body, Tiro Devanagari Sanskrit for kaṭapayādi mnemonics, JetBrains Mono for hex / numerals.

Motion is slow (`cubic-bezier(0.2, 0, 0, 1)`, 600–900 ms transitions in Explore).  Perform mode flips the surface to ink with vellum text and is sub-60 ms input-to-audio.  The site is single-page with hash-routed plates; the Plate index is a thin right gutter that fades in 4 s after the lobby's hero animation.  Reduced-motion preference cuts every animation to 1 ms.

## Guitar Fretboard (`guitar.html`)

A standalone dark-theme fretboard visualizer linked from the main app's plate index ("Gtr"). It shares the 12-bit encoding and harmonic-function color logic with the main app but uses an independent dark UI optimized for focused practice.

### Key features
- **Customizable tuning** — 20+ presets (Standard, Drop D, Open G, NST/Fripp, etc.) + custom per-string tuning, persisted to `localStorage`
- **Scale chooser** — modal with two tabs: 72 Melakartas (12 chakra grid) and Known Scales (grouped by Forte class)
- **Harmonic-function orbs** — 4 chromatically-connected color families on the fretboard: Structural (brass), Chord Quality (vermillion), Extensions (teal), Altered (mauve/plum)
- **3-row nibble bit display** — Scale Intelligence panel shows hex digits + bits organized by nibble, colored by interval function
- **24-fret symmetrical fretboard** — Major 3rds tuning default (F-A-C#-F-A-C#)

### Aesthetic divergence
The fretboard uses a self-contained dark theme (`#0f172a` slate background, `#2c1a11` wood texture) rather than the Palmleaf Observatory palette. This is intentional: the fretboard is a practice tool, not part of the manuscript reading experience. The harmonic-function color families (brass, vermillion, teal, mauve) are shared with the main app but rendered as glossy radial-gradient orbs against dark wood instead of flat glyphs against vellum.

### Encoding consistency
`guitar.html` uses the same mirrored-endianness convention as the main app and the paper. The `intervalsToHex()` helper converts a 7-note interval array to a 3-digit hex string using `1 << (11 - iv)` per active interval — identical to the paper's §2.3 convention. The 3-row nibble display (bits 11‑8 / 7‑4 / 3‑0) directly visualizes the hex nibbles as coherent musical chunks: top nibble = lower tetrachord, middle = madhyama + G3 + Pa, bottom = upper tetrachord.

## ROLI Lightpad Block (Performance instrument №5)

The Console (Plate ∞) supports a fifth instrument: a physical ROLI Lightpad Block over Web MIDI. The Block is a 15×15 LED grid + 5D-touch surface. Connect it via the "Connect" button in the Perform mode's right-margin "ROLI Lightpad" panel; the same first user gesture that wakes the AudioContext also requests `navigator.requestMIDIAccess({ sysex: true })`.

### Wire protocol

All custom messages use SysEx envelope `F0 7D 4D <cmd> <payload…> F7` (manufacturer ID `0x7D` = MMA-reserved non-commercial; sub-ID `0x4D` = ASCII `'M'`). Pure encoder/decoder lives in `src/hardware/sysex.js` with 114 round-trip + boundary tests in `roli-tests.mjs`.

```
cmd  payload                                            direction
─── ──────────────────────────────────────────────────  ──────────
0x01 vec_msb · vec_lsb · flags · seq                    Web → Block   SET_RAGA
       12-bit vec packed as two 6-bit halves; flags bit 0 = isVivadi
0x02 mask_msb · mask_lsb · seq                          Web → Block   SET_ROUGH_MASK
       12-bit pc-mask of extremally-vivadi rough pitch classes (strobed)
0x03 mela_n · forte_id · seq                            Web → Block   SET_MELA_INFO
0x04 (shift+2) · seq                                    Web → Block   SET_OCTAVE
0x05 useStandardCC · seq                                Web → Block   SET_FALLBACK
0x0F counter                                            Web → Block   HEARTBEAT_REQ
0x10 counter                                            Block → Web   HEARTBEAT_ACK
0x11 button_id · seq                                    Block → Web   BUTTON
       0x01 K1 · 0x02 K2 · 0x03 K3 · 0x04 oct+ · 0x05 oct− · 0x06 drone
0x12 fw_major · fw_minor                                Block → Web   HELLO
```

Touch events use **standard MPE**: per-finger MIDI channel (2..16), pitch-bend = X-axis (PB range = 1 semitone, ±50¢ gamaka), CC74 = Y-axis (slide), Channel Pressure = Z-axis. Standard CC fallback (CC 16/17/18 = X/Y/Z, CC 20 = tile id) is available for non-MPE hosts via `block.sendFallbackMode(true)`.

### Block grid mapping

5 octave bands × 3 nibble rows = 15 rows. Bands top-to-bottom = +2 oct .. −2 oct relative to on-screen Sa.

```
Within an octave band:
  row 0 → bits 11..8   (Sa, R₁, R₂/G₁, R₃/G₂)
  row 1 → bits  7..4   (G₃, M₁, M₂, Pa)
  row 2 → bits  3..0   (N₃, D₃/N₂, D₂/N₁, D₁)

Cols 0–11 → 12 PC zones, 3 LED-cols per nibble bit, multitouch-friendly.
Col 12    → K₁ band (madhyama swap, 0x060), full height.
Col 13    → K₂ band (antipodal complement, 0x7EF).
Col 14    → K₃ (rows 0–6) + oct+ (rows 7–9) + oct− (rows 10–12) + drone toggle (rows 13–14).
```

### Touch model

Press in a PC zone plays the pitch class through the audio engine; X-axis bends ±50¢, Y velocity, Z pressure. Press a K-anchor and on release the corresponding `applyXOR(D.K1/K2/K3)` fires. Press oct± to shift `state.octaveShift` by ±1 (clamped −2..+2). Press drone toggles tambura.

### Persistence

The Block holds last-loaded state in flash (Littlefoot `setLocalConfig`):

```
slot 0  raga vector (12 bits)
slot 1  vivadi flags (4 bits) | rough mask (12 bits)
slot 2  octaveShift + 2  (stored as 0..4)
slot 3  magic 0xCB9015 (= "Mayamalavagowla / Mela 15")
```

If slot 3 ≠ magic, defaults to mela 15 (Mayamalavagowla, 0xCB9). Writes are rate-limited to ≤ 5 Hz in the Littlefoot script to avoid flash wear from the Gray-walk auto-stepper.

### Verification

```bash
# Pure-Node sysex unit tests
node src/hardware/roli-tests.mjs              # expect 114 passed, 0 failed

# JSDOM smoke (now includes Roli option + 15×15 preview surface)
/tmp/node_modules/.bin/esbuild src/app.js --bundle --format=iife --outfile=/tmp/app.bundle.js
node /tmp/jsdom-bundle-smoke.mjs              # expect 28/28
```

Real-hardware tests require a Lightpad Block + Roli BLOCKS Studio (or compatible firmware loader) to flash `melagabra.littlefoot`.

## Common pitfalls

- **Don't use `dataset` on SVG elements.**  Older JSDOM (and some browsers) don't expose the HTMLOrSVGElement mixin's `dataset`.  Use `getAttribute("data-built")` / `setAttribute("data-built", "1")` for SVG nodes.  HTML element `dataset` is fine.
- **Don't call `$` and `$$` from the same module.**  esbuild / older parsers can conflate them in some bundling paths.  Use `qsel` and `qall` (already standard in `app.js`).
- **Janya counts:** only melas 1–15 are hardcoded from paper Appendix C.  All others are `null` with provenance `null`.  Never fabricate.

## Verifying changes

```bash
# 1. Self-test in pure Node
node --input-type=module -e "import('./src/data.js').then(d => { const r = d.selfTest(); console.log(r.ok ? 'PASS' : 'FAIL'); if (!r.ok) for (const f of r.failures) console.log(' -', f); });"

# 2. Bundle + JSDOM smoke (validates DOM rendering of all 11 plates)
/tmp/node_modules/.bin/esbuild src/app.js --bundle --format=iife --outfile=/tmp/app.bundle.js
node /tmp/jsdom-bundle-smoke.mjs   # 24-check suite
```
