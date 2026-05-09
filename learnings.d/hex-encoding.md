# Hex Encoding — Mirrored Endianness

Working with the paper's 12-bit mirrored-endianness convention.

## The convention (paper §2.3)

```
S=0→11   R1=1→10   R2/G1=2→9   R3/G2=3→8   G3=4→7
M1=5→5   M2=6→6    P=7→4
D1=8→0   D2/N1=9→1 D3/N2=10→2  N3=11→3
```

Key insight: `num.toString(2).padStart(12, '0')` produces `binStr` where:
- `binStr[0]` = MSB = bit 11 (Sa)
- `binStr[11]` = LSB = bit 0 (D1)

## Common pitfall: index inversion

A bug that cost a commit: treating the **physical bit number** as the **string index**.

```js
// WRONG — reads binStr[11] when you want binStr[0]
let bit = binStr[bitIdx];  // bitIdx = 11 → reads LSB instead of MSB

// CORRECT
let strIdx = 11 - bitIdx;
let bit = binStr[strIdx];  // bitIdx = 11 → strIdx = 0 → reads MSB
```

## Nibble extraction

For the 3-row bit display (top = bits 11-8, middle = 7-4, bottom = 3-0):

```js
function getNibbleValue(binStr, bitIndices) {
    let val = 0;
    bitIndices.forEach((bitIdx, pos) => {
        let strIdx = 11 - bitIdx;
        if (binStr[strIdx] === '1') val |= (1 << (3 - pos));
    });
    return val;  // 0–15
}

let topNib = getNibbleValue(binStr, [11, 10, 9, 8]);
let midNib = getNibbleValue(binStr, [7, 6, 5, 4]);
let botNib = getNibbleValue(binStr, [3, 2, 1, 0]);
```

## Interval array → hex

```js
function intervalsToHex(intervals) {
    let num = 0;
    intervals.forEach(iv => num |= 1 << (11 - iv));
    return num.toString(16).toUpperCase().padStart(3, '0');
}
```

Example: Major scale `[0, 2, 4, 5, 7, 9, 11]` → `0xAB9`.

## Verification checklist

After any change to bit manipulation code, verify against the paper's Table 1:

| Mela | Hex | Binary |
|---|---|---|
| 8 | D35 | 1101 0011 0101 |
| 15 | CB9 | 1100 1011 1001 |
| 21 | B39 | 1011 0011 1001 |
| 29 | ABA | 1010 1011 1010 |
| 51 | CD9 | 1100 1101 1001 |
| 57 | B59 | 1011 0101 1001 |
| 65 | ADA | 1010 1101 1010 |

Run `data.js#selfTest()` in the main app to catch encoding errors before they propagate.

## Direction toggle (LTR vs RTL)

The `LTR/RTL` toggle in guitar.html only affects **label assignment**, not physical
bit order. Physical bits are always fixed to the nibble rows. Interval labels adapt:

```js
let intervalAssigned = (dir === 'LTR') ? bitIdx : (11 - bitIdx);
```

This means `LTR` shows `R` at bit 11 (leftmost), `RTL` shows `R` at bit 0 (rightmost),
but the hex digits always correctly represent the physical nibbles.
