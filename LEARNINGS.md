# LEARNINGS.md

Engineering decisions, patterns, and lessons learned while building Melagabra.

## Structure

This file is the top-level index. Each topic lives in `learnings.d/` as a focused
markdown file. Add a new topic when a decision or pattern has proved itself across
multiple sessions or is non-obvious enough to save future agents (and future us)
from rediscovering it.

## Topics

| File | What it covers |
|---|---|
| [`guitar-fretboard.md`](learnings.d/guitar-fretboard.md) | Building the standalone guitar fretboard visualizer — dark theme, modal patterns, localStorage persistence, and harmonic-function color families |
| [`color-design.md`](learnings.d/color-design.md) | Reducing cognitive load in music-visualization color palettes — grouping by harmonic function, warm→stable / cool→unstable mapping |
| [`modal-patterns.md`](learnings.d/modal-patterns.md) | Reusable modal overlay pattern used across the project (tuning chooser, scale chooser) |
| [`hex-encoding.md`](learnings.d/hex-encoding.md) | Working with the mirrored-endianness 12-bit encoding — common pitfalls and verification strategies |

## When to add a new topic

1. You made a non-obvious fix that took >10 minutes to debug
2. You established a reusable pattern used in ≥2 places
3. A design decision has paper-level consequences (e.g., color family mapping)
4. A constraint is load-bearing and easy to violate (e.g., bit ordering)

Cross-reference from `CLAUDE.md` when the learning affects how agents should write code.
