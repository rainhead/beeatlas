---
phase: 91
plan: 01
subsystem: url-state
tags:
  - url-state
  - typescript
  - tdd
dependency_graph:
  requires: []
  provides:
    - SelectionState bounds variant in src/url-state.ts
  affects:
    - src/bee-atlas.ts (Plan 02 wiring depends on this)
tech_stack:
  added: []
  patterns:
    - TDD RED/GREEN cycle (test then implement)
    - Inline parse block matching existing oRaw style (no helper function)
key_files:
  modified:
    - src/url-state.ts
    - src/tests/url-state.test.ts
decisions:
  - SelectionState union extended with bounds variant; sel= param is mutually exclusive with o= per D-01
  - Validation rejects south >= north (degenerate/inverted), non-finite values, out-of-range lon/lat
  - west < east NOT required (antimeridian-crossing bounds are valid per plan discretion note)
  - Parse block placed after oRaw block — order is not load-bearing since sel= and o= are mutually exclusive
metrics:
  duration: 118s
  completed: "2026-05-15"
  tasks_completed: 2
  files_modified: 2
requirements-completed: []
---

# Phase 91 Plan 01: URL State Bounds Variant Summary

**One-liner:** Extends the `SelectionState` union with a `bounds` variant and wires `buildParams`/`parseParams` to serialize/deserialize `sel=west,south,east,north` with 4 decimal places and full validation.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Add failing tests for SelectionState bounds round-trip (RED) | 373836e | src/tests/url-state.test.ts |
| 2 | Implement bounds variant in SelectionState, buildParams, parseParams (GREEN) | 9e9417f | src/url-state.ts |

## Implementation Details

### Edit Site 1: SelectionState union (src/url-state.ts line 24–27)

Added third variant to the existing `ids | cluster` union:
```typescript
| { type: 'bounds'; west: number; south: number; east: number; north: number }
```

### Edit Site 2: buildParams selection branch (src/url-state.ts lines 59–69)

Added `bounds` branch after `cluster`. Emits `sel=west,south,east,north` (toFixed(4) per value). Does NOT emit `o=` alongside (D-01 mutual exclusion).

### Edit Site 3: parseParams sel= block (src/url-state.ts lines 183–202)

New inline block after `oRaw` handling. Reads `p.get('sel') ?? ''`, splits on `,`, requires exactly 4 parts, validates:
- All four values pass `isFinite(...)`
- west, east ∈ [-180, 180]
- south, north ∈ [-90, 90]
- south < north (rejects degenerate and inverted bounds)
- west < east NOT required (antimeridian crossing)

### Test Count Added

10 new tests in `describe('bounds selection (SEL-06)')`:
1. bounds round-trip (encode + decode)
2. positive longitudes (toFixed precision)
3. no o= emitted for bounds
4. no sel= for ids selection
5. no sel= for cluster selection
6. malformed sel (not four values)
7. out-of-range west
8. out-of-range north
9. south >= north (inverted bounds)
10. non-finite value (NaN)
11. combined bounds + filter round-trip (SEL-06 criterion 4)

(The describe block has 11 tests total, counting the combined test.)

## Verification Results

- `npx vitest run src/tests/url-state.test.ts`: 47 passed (0 failures)
- `npx tsc --noEmit -p tsconfig.json`: exits 0 (no type errors)
- `grep -n "type: 'bounds'" src/url-state.ts`: 2 hits (union declaration + result.selection assignment)
- `grep -c "params.set('sel'" src/url-state.ts`: 1
- `grep -c "p.get('sel')" src/url-state.ts`: 1
- No edits outside `src/url-state.ts` and `src/tests/url-state.test.ts`

## TDD Gate Compliance

RED gate: test(91-01) commit 373836e — 4 failing tests confirmed before implementation.
GREEN gate: feat(91-01) commit 9e9417f — all 47 tests passing.

## Deviations from Plan

None — plan executed exactly as written. All 3 edit sites applied as specified; test block mirrors cluster pattern as directed.

## Known Stubs

None.

## Threat Flags

No new network endpoints, auth paths, or trust boundaries introduced. This is a pure serialization/deserialization utility extension.

## Self-Check: PASSED

- `src/url-state.ts` exists and contains all 3 edit sites: FOUND
- `src/tests/url-state.test.ts` contains `describe('bounds selection`: FOUND
- Commit 373836e exists: FOUND
- Commit 9e9417f exists: FOUND
- All 47 tests pass: CONFIRMED
- tsc --noEmit exits 0: CONFIRMED
