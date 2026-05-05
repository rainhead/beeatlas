---
phase: 082-hardening
plan: "07"
subsystem: species-page
tags: [seasonality-viz, fallback, a11y, carry-in, tdd]
dependency_graph:
  requires: []
  provides: [D-08-fallback-fix]
  affects: [src/species/seasonality-viz.ts]
tech_stack:
  added: []
  patterns: [TDD-red-green, vitest-happy-dom]
key_files:
  created: []
  modified:
    - src/species/seasonality-viz.ts
    - src/tests/seasonality-viz.test.ts
decisions:
  - "D-08: collapse the three-branch ternary to two — multi-month yields range, single-month yields empty string (no suffix)"
metrics:
  duration: ~5 min
  completed: 2026-05-04
---

# Phase 82 Plan 07: Seasonality Fallback D-08 Summary

**One-liner:** Drop ambiguous single-letter month suffix from VIZ-02 fallback when only one month has data ('A' could be April or August).

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 (RED) | Add failing D-08 tests | a162135 | src/tests/seasonality-viz.test.ts |
| 1 (GREEN) | Implement D-08 fallback fix | ca9dac0 | src/species/seasonality-viz.ts |

## Implementation Notes

The fix collapses a three-branch ternary into two branches in `seasonality-viz.ts`:

Before:
```ts
const range = monthsWithData.length > 0
  ? (monthsWithData.length === 1
      ? monthsWithData[0]
      : `${monthsWithData[0]}–${monthsWithData[monthsWithData.length - 1]}`)
  : '';
```

After:
```ts
// D-08 (Phase 82): drop the ambiguous single-letter month suffix when
// only one month has data ('A' is April or August). Multi-month ranges
// stay because the dash gives context.
const range = monthsWithData.length > 1
  ? `${monthsWithData[0]}–${monthsWithData[monthsWithData.length - 1]}`
  : '';
```

MONTH_LABELS axis labels on the bar chart are untouched (12 single-letter cells, space-constrained — per D-08 and 081-04-PLAN.md confirmation).

## Test Coverage Added

Four new cases in `VIZ-02 fallback D-08` describe block:
- Single month (3 records): `"3 records"` — no comma, no letter
- Single month (1 record): `"1 record"` — singular, no comma
- Multi-month (Apr+May, 3 records): `"3 records, A–M"` — range preserved
- Zero records: `"0 records"` — unchanged behavior

## Deviations from Plan

None — plan executed exactly as written. TDD RED/GREEN gates followed.

## TDD Gate Compliance

- RED commit: a162135 (test(082-07): add failing tests...)
- GREEN commit: ca9dac0 (feat(082-07): D-08 drop ambiguous...)
- REFACTOR: not needed (change was one-line simplification)

## Verification

- `grep -n "monthsWithData.length > 1" src/species/seasonality-viz.ts` — line 67 matches
- `grep -n "D-08" src/species/seasonality-viz.ts` — line 64 matches
- `grep -nE "monthsWithData\.length === 1" src/species/seasonality-viz.ts` — zero matches
- `grep -n "MONTH_LABELS" src/species/seasonality-viz.ts` — 3 matches (definition + fallback collect + axis render)
- `npm test`: 305 passed, 4 skipped; 2 pre-existing failures unrelated to this plan

## Known Stubs

None.

## Threat Flags

None — no new network surface or auth paths introduced.

## Self-Check: PASSED

- src/species/seasonality-viz.ts: FOUND
- src/tests/seasonality-viz.test.ts: FOUND
- Commit a162135: FOUND
- Commit ca9dac0: FOUND
