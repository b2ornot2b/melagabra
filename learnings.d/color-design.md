# Color Design for Music Visualization

Lessons from redesigning the fretboard harmonic-function colors.

## The problem: 8 arbitrary hues

The initial palette used 8 distinct saturated colors with no relationship between
similar musical functions:

| Interval | Color | Hue |
|---|---|---|
| Root | Red | 0° |
| 5th | Orange | 25° |
| 3rd/b3rd | Yellow | 50° |
| 7th/b7th | Purple | 270° |
| 2nd/6th | Cyan | 185° |
| 4th | Blue | 220° |
| b5 | Pink | 330° |
| b2/b6 | Lime | 80° |

This forced the user to memorize a lookup table. Warm vs. cool had no correlation
with stable vs. unstable.

## The solution: 4 chromatically-connected families

| Family | Hue | Intervals | Logic |
|---|---|---|---|
| **Structural** | Brass (42°) | Root, 5th | Warm, grounded, "pillar" tones |
| **Chord Quality** | Vermillion (6°–14°) | Maj3, Min3, Maj7, Min7 | Define major/minor quality; major brighter, minor deeper |
| **Extensions** | Teal (172°–190°) | 2nd, 4th, 6th | Cool, floating; 4th grayed-out for ambiguity |
| **Altered** | Mauve/Plum (270°–280°) | b2, b5, b6 | Muted, exotic; b5 deepest for maximum tension |

**Warm = stable, Cool = unstable** — the hue wheel mirrors the harmonic spectrum.

## Implementation details

### Glossy radial gradients

```css
.color-root {
    background: radial-gradient(circle at 30% 30%, hsl(42,92%,62%), hsl(38,85%,38%));
    text-shadow: 0 1px 2px rgba(0,0,0,0.8);
}
```

- `circle at 30% 30%` creates a highlight at upper-left, simulating a light source
- `text-shadow` ensures readability on both dark wood and light backgrounds
- Each variant has slightly different lightness/saturation to show hierarchy

### HSL over hex

Using HSL instead of hex allows systematic variation within families:
- **Major variants**: higher lightness (+4–6%), same hue
- **Minor variants**: lower lightness (−4–6%), slightly lower saturation
- **Structural 5th**: dimmer than root (shows secondary role)

### Text colors for bit display

The same families are reused for active-bit text in the 3-row binary display:

```css
.txt-root   { color: hsl(42,90%,62%); text-shadow: 0 0 6px hsla(42,90%,55%,0.4); }
.txt-maj3   { color: hsl(14,88%,66%); text-shadow: 0 0 6px hsla(14,85%,60%,0.4); }
.txt-2      { color: hsl(172,70%,60%); text-shadow: 0 0 6px hsla(172,65%,55%,0.4); }
```

This creates a second read of the same harmonic information (orb on fretboard + text
in bit vector) reinforcing the mental model.

## Cross-modal perception

The warm→stable / cool→unstable mapping leverages cross-modal perception research:
- Warm colors (red, orange, yellow) are perceived as "active," "near," "grounded"
- Cool colors (blue, cyan, purple) are perceived as "passive," "far," "floating"
- This maps naturally onto consonance (structural = near/grounded) vs. dissonance
  (altered = far/floating)

## Validation

Test with a known scale (e.g., C Major = `0xAB9`) and verify:
- Root (C) = brass
- 3rd (E) = bright vermillion
- 5th (G) = dim brass
- 7th (B) = bright vermillion
- 2nd (D), 6th (A) = teal
- 4th (F) = slate-teal (grayed, ambiguous)

No two adjacent scale degrees should share the same family unless they are structural
(root/5th) or quality (3rd/7th) — this reinforces the chord-tone vs. non-chord-tone
distinction at a glance.
