# Guitar Fretboard Visualizer

Lessons from building `docs/guitar.html`, the standalone dark-theme fretboard.

## Dark theme as intentional divergence

The fretboard uses `#0f172a` slate + `#2c1a11` wood texture rather than the Palmleaf
Observatory palette. **This is not laziness** — the fretboard is a practice tool meant
for extended staring, and the dark UI reduces eye fatigue. The harmonic-function color
families (brass, vermillion, teal, mauve) are shared with the main app but rendered as
glossy radial-gradient orbs against dark wood instead of flat glyphs against vellum.

## Modal pattern (reusable)

Both the tuning chooser and scale chooser use the same modal structure:

```html
<div class="modal-overlay hidden">   <!-- fade-in via .open class -->
  <div class="modal-panel">          <!-- scale-in animation -->
```

- Overlay: `fixed inset-0 z-50 bg-black/60 backdrop-blur-sm`
- Panel: `max-w-lg` (tuning) or `max-w-3xl` (scale chooser), `transform: scale(0.95)` → `scale(1)` on `.open`
- Close on ✕ button, Escape key, or click outside
- Focus trap not implemented (simple project, single-user)

## localStorage persistence for user preferences

```js
const KEY = "melagabra_guitar_tuning";
function saveTuning(name, roots) {
    localStorage.setItem(KEY, JSON.stringify({ name, roots }));
}
function loadTuning() {
    try {
        let stored = JSON.parse(localStorage.getItem(KEY));
        if (Array.isArray(stored.roots) && stored.roots.length === 6) {
            return stored;
        }
    } catch (e) {}
    return DEFAULT_TUNING;
}
```

- Always validate parsed data before trusting it
- Always catch `JSON.parse` and `localStorage` exceptions (private mode, quota)
- Store the tuning **name** alongside the roots so the UI label is accurate

## Custom tuning UI: string ordering

The custom tuning section shows 6 dropdowns with **string 1 (highest pitch) on the right**.
This matches the fretboard orientation where string 1 is the top row. The `STRING_ROOTS`
array is indexed `0 = highest` (string 1) to `5 = lowest` (string 6), so the visual
layout directly maps to the data model without transformation.

## Scale chooser: generating 72 Melakartas on the fly

Rather than hardcoding all 72 melakartas, we generate them from the paper's
combinatorial construction (§2.1):

```js
for (let c = 1; c <= 12; c++) {      // 12 chakras
    for (let p = 1; p <= 6; p++) {   // 6 positions per chakra
        let m = c <= 6 ? 5 : 6;      // M1 or M2
        let rg = purvanga[(c-1) % 6]; // R-G tetrachord pair
        let dn = uttaranga[p-1];      // D-N tetrachord pair
        let intervals = [0, rg[0], rg[1], m, 7, dn[0], dn[1]];
        // ...compute hex, western equivalent, vivadi status
    }
}
```

Western equivalents are resolved by interval matching against `SCALE_DICT` (generated
at boot). This avoids maintaining a separate hardcoded mapping.

## Vivadi status computation from nibbles

The extremal-nibble predicate (paper §7.3) maps directly to nibble values:

```js
let rgNib = RG_NIBBLES[(c - 1) % 6];  // 0xC, 0xA, 0x9, 0x6, 0x5, 0x3
let dnNib = DN_NIBBLES[p - 1];         // 0x3, 0x5, 0x9, 0x6, 0xA, 0xC

if (rgNib === 0x3 || rgNib === 0xC || dnNib === 0x3 || dnNib === 0xC)
    vivadi = "extremal";
else if (rgNib === 0x6 || dnNib === 0x6)
    vivadi = "exception";
else
    vivadi = "avivadi";
```

This matches Theorem 7.4 (40 extremally vivadi) and Proposition 7.5 (14 exceptions).

## Search filtering with empty-section suppression

Real-time search across 72 melakartas + known scales uses `dataset` attributes for
fast client-side filtering. Chakra sections and category headers auto-hide when all
children are filtered out:

```js
document.querySelectorAll('.mela-cell').forEach(cell => {
    let match = !q || cell.dataset.name.includes(q) || cell.dataset.hex.includes(q);
    cell.classList.toggle('hidden', !match);
});
document.querySelectorAll('.chakra-header').forEach(hdr => {
    let visible = hdr.nextElementSibling.querySelector('.mela-cell:not(.hidden)');
    hdr.style.display = visible ? '' : 'none';
});
```
