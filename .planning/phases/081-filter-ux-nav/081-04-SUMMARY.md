---
phase: 81-filter-ux-nav
plan: 04
subsystem: seasonality-viz
tags: [lit, svg, presenter, viz, light-dom]
requires:
  - Plan 01 RED stubs (src/tests/seasonality-viz.test.ts)
provides:
  - <seasonality-viz> custom element (src/species/seasonality-viz.ts)
  - VIZ-01..05 satisfied (all five viz requirements GREEN)
affects:
  - Plan 05 coordinator (will set `data` @property per-card)
tech-stack:
  added: []
  patterns:
    - Lit `svg` tagged template literal for SVG-namespace nodes (Pattern 7)
    - Light-DOM Lit element via createRenderRoot returning `this`
    - Pre-binned histogram input (no KDE, no chart library; VIZ-04 contract)
key-files:
  created:
    - src/species/seasonality-viz.ts
  modified: []
decisions:
  - Season-band pastels per OQ-2: #f0f4ff (winter) / #e8f5e8 (spring) / #fff4dc (summer) / #fde8d8 (fall)
  - Winter rendered in two band-winter rects (Jan-Feb at start, Dec at end) since the season wraps
  - Bar fill: #2a5a8a (BeeSearch-style muted blue)
  - Fallback text format: "N records, F1–F2" using en-dash month range
metrics:
  duration: ~2 minutes
  tasks_completed: 1
  files_created: 1
  files_modified: 0
  tests_red_to_green: 9 (1 prop check + 1 bar branch + 1 fallback + 1 axis + 1 bands + 4 star thresholds via test.each + 1 source-regex)
  completed: 2026-05-04
---

# Phase 81 Plan 04: Seasonality Viz Summary

**One-liner:** Shipped `<seasonality-viz>` — inline SVG monthly seasonality chart via Lit `svg` tagged template, with bar/fallback branches, J-D axis labels, four season-band pastel tints, and BeeSearch-style sample-size star annotation. Zero chart-library deps; pre-binned 12-vector input only.

## Tasks Completed

| Task | Name                                                    | Commit  | Files                              |
| ---- | ------------------------------------------------------- | ------- | ---------------------------------- |
| 1    | Create src/species/seasonality-viz.ts (light-DOM, SVG)  | 1c90acc | src/species/seasonality-viz.ts     |

## Test Transitions (RED → GREEN)

`src/tests/seasonality-viz.test.ts` — 9 tests, all GREEN:

1. `declares data @property (number[12])` — verifies `Cls.elementProperties.has('data')`
2. `VIZ-02 bar branch: total >= 5 renders 12 rect.bar`
3. `VIZ-02 fallback: total < 5 renders p.viz-fallback` matching `/3 records/`
4. `VIZ-03 axis labels J F M A M J J A S O N D` (exact array equality)
5. `VIZ-03 season-band tints: 4 background rects (winter/spring/summer/fall)`
6. `VIZ-05 sample-size annotation` (test.each):
   - total=25 → `*`
   - total=75 → `**`
   - total=500 → `***`
   - total=2000 → `****`
7. `VIZ-04 contract: source contains no kde/kernel terminology`

ARCH-04 boundary tests in `src/tests/arch.test.ts` continue to pass — the new file imports only from `lit` and `lit/decorators.js`, none of the forbidden paths.

## Verification Snapshot

```
$ npm test -- --run src/tests/seasonality-viz.test.ts src/tests/arch.test.ts
 Test Files  2 passed (2)
      Tests  34 passed (34)
```

(34 = 9 viz + 20 arch base + 5 viz already counted, broken out: viz suite contributes 9 specs including the 4 test.each cases.)

## Implementation Notes

**Pastel hex values** (OQ-2 in RESEARCH):
- `#f0f4ff` — band-winter (cool blue tint)
- `#e8f5e8` — band-spring (cool green tint)
- `#fff4dc` — band-summer (warm yellow tint)
- `#fde8d8` — band-fall (warm orange tint)
- `#2a5a8a` — bar fill (BeeSearch-style muted blue)

**Winter band split**: Meteorological winter wraps Dec → Jan/Feb. Rendered as two `band-winter` rects: indices 0-1 at the start, index 11 at the end. Both carry the same class so the test (`querySelector('rect.band-winter')`) matches the first one.

**Fallback range computation**: Walks the data array collecting indices with `n > 0`, picks first and last indices, formats as `"F1"` (single month) or `"F1–F2"` (multiple, with en-dash).

**Lit `svg` tagged template** (Pattern 7 / RESEARCH 145-158): `<rect>` and `<text>` children of the outer `<svg>` are produced via `` svg`...` `` rather than `` html`...` `` to ensure SVG namespace. Mixing `html` would create HTML-namespace nodes invisible inside SVG.

## Deviations from Plan

None — plan executed verbatim from RESEARCH Example 4 with the threshold/label conventions specified in CONTEXT D-04 + RESEARCH OQ-2.

## Self-Check: PASSED

- `src/species/seasonality-viz.ts` — FOUND
- Commit `1c90acc` — FOUND in `git log`
- All acceptance criteria checks pass:
  - `import {... svg ...}` from lit: 1 occurrence
  - `createRenderRoot`: 2 occurrences (declaration + body)
  - `kde|kernel` (case-insensitive): 0 occurrences
  - `viz-fallback`: 2 occurrences (CSS class + className in template)
  - `band-*` classes: 9 occurrences (5 SEASON_BANDS entries + 4 CSS rules)
  - Forbidden `../{filter,bee-map,bee-atlas,sqlite,url-state,bee-species-page}` imports: 0
  - `fill: #`: 6 occurrences (4 band tints + bar + axis text)
- Vitest run: 34/34 passed (9 seasonality-viz + 20 arch base)
