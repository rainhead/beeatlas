---
phase: 112
plan: 01
subsystem: frontend-tests
tags: [tdd, red-gates, wave-0, map, checklist]
requirements-completed:
  - MAP-01
  - MAP-02
  - MAP-03
  - MAP-04
dependency-graph:
  requires: []
  provides:
    - MAP-02 RED gate (src/tests/bee-map.test.ts — 8 failing source-text assertions)
    - MAP-01 RED gate (src/tests/bee-pane.test.ts extended — 6 failing assertions)
    - MAP-03 RED gate (src/tests/bee-atlas.test.ts extended — 4 failing assertions)
    - MAP-04 RED gate (src/tests/url-state.test.ts extended — 3 failing assertions)
  affects:
    - Plans 02 and 03 will turn these gates GREEN
tech-stack:
  added: []
  patterns:
    - readFileSync source-text assertion pattern for architectural invariants
    - @ts-expect-error gate pattern for pre-implementation URL state tests
key-files:
  created:
    - src/tests/bee-map.test.ts
  modified:
    - src/tests/bee-pane.test.ts
    - src/tests/bee-atlas.test.ts
    - src/tests/url-state.test.ts
decisions:
  - The beforeId ordering test required an explicit `expect(checklistIdx).toBeGreaterThan(-1)` assertion to ensure RED failure when checklist-county-fill is absent (PATTERNS.md version silently passed due to indexOf(-1) = 0 behavior)
  - MAP-04 tests 2, 4, 6 pass against current url-state.ts because they assert "absence" behavior which already holds; only 3 of 6 MAP-04 tests fail RED rather than the 4 expected per plan
metrics:
  duration_minutes: 14
  completed_date: "2026-05-24"
  tasks_completed: 3
  tasks_total: 3
  files_created: 1
  files_modified: 3
---

# Phase 112 Plan 01: Wave 0 RED Gates — Checklist Map Layer Test Suite Summary

**One-liner:** 21 failing source-text and round-trip assertions establishing RED gates for MAP-01 through MAP-04 before any production checklist code is written.

## What Was Built

Created `src/tests/bee-map.test.ts` (new file) and extended three existing test files to establish Nyquist Wave 0 RED gates for Phase 112's checklist map layer feature. No production source files were modified.

### New file: src/tests/bee-map.test.ts

8 source-text assertions for MAP-02 (checklist county fill layer):

1. `addLayer` for `'checklist-county-fill'` layer ID
2. `showChecklist` property declaration
3. `checklistTaxon` property declaration
4. `beforeId` ordering: `checklist-county-fill` appears before `ghost-points` in source
5. `parquetReadObjects` usage for checklist fetch
6. `_checklistGeneration` counter field
7. `resolveDataUrl('checklist')` call
8. `setLayoutProperty` toggling the checklist layer

All 8 fail RED against current `src/bee-map.ts`.

### Extended: src/tests/bee-pane.test.ts

6 new assertions in `describe('MAP-01: checklist toggle in filter panel')`:

1. `_showChecklist` @state field
2. `_renderShow(` method definition
3. `'Checklist records'` label text
4. `new CustomEvent('checklist-layer-changed'` dispatch
5. `aria-label="Show checklist county records on map"` on checkbox
6. `this._renderShow()` called inside `_renderListContent`

All 6 fail RED. Pre-existing 41 tests pass.

### Extended: src/tests/bee-atlas.test.ts

4 new assertions in `describe('MAP-03: checklist taxon filter binding')`:

1. `_checklistVisible` @state field
2. `_onChecklistLayerChanged(` method
3. `.checklistTaxon=${this._filterState.taxonName}` binding on `<bee-map>`
4. `@checklist-layer-changed=${this._onChecklistLayerChanged}` on `<bee-pane>`

All 4 fail RED. Pre-existing 112 tests pass.

### Extended: src/tests/url-state.test.ts

6 new tests in `describe('MAP-04: checklist layer URL param (cl=1)')`:

1. `checklistVisible: true` → `params.get('cl') === '1'` (FAILS RED)
2. `defaultUi` (no checklistVisible) → `params.has('cl') === false` (passes — absence is correct state)
3. `parseParams('cl=1')` → `result.ui?.checklistVisible === true` (FAILS RED)
4. `parseParams('bm=counties')` → `checklistVisible ?? false === false` (passes — absence is correct state)
5. Combined `cl=1 + bm=counties` round-trip (FAILS RED)
6. `parseParams('cl=0')` → `checklistVisible ?? false === false` (passes — absence is correct state)

3 of 6 fail RED. Pre-existing 54 tests pass.

## Test Counts

| File | New Tests | RED | Notes |
|------|-----------|-----|-------|
| src/tests/bee-map.test.ts | 8 | 8 | New file |
| src/tests/bee-pane.test.ts | 6 | 6 | MAP-01 describe appended |
| src/tests/bee-atlas.test.ts | 4 | 4 | MAP-03 describe appended |
| src/tests/url-state.test.ts | 6 | 3 | 3 pass: absence tests already correct |
| **Total** | **24** | **21** | |

## Commits

| Task | Description | Commit |
|------|-------------|--------|
| Task 1 | Create src/tests/bee-map.test.ts (MAP-02, 8 RED tests) | e099939 |
| Task 2 | Extend bee-pane.test.ts (MAP-01, 6 RED) and bee-atlas.test.ts (MAP-03, 4 RED) | 70ef590 |
| Task 3 | Extend url-state.test.ts (MAP-04, 3 RED + 3 passing) | 78c597c |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed beforeId ordering test to actually fail RED**

- **Found during:** Task 1 verification
- **Issue:** PATTERNS.md's beforeId test calls `src.indexOf("'checklist-county-fill'")` (returns -1 when absent), then `src.indexOf("'ghost-points'", -1)` which treats -1 as 0 and finds ghost-points at its actual position. `expect(567).toBeGreaterThan(-1)` is true, causing the test to PASS instead of fail RED.
- **Fix:** Added explicit `expect(checklistIdx).toBeGreaterThan(-1)` assertion before the ordering check, ensuring the test fails RED when `checklist-county-fill` is absent.
- **Files modified:** src/tests/bee-map.test.ts
- **Commit:** e099939

**2. MAP-04 RED count: 3 of 6 (not 4 as plan expected)**

- **Found during:** Task 3 verification
- **Nature:** Tests 2, 4, 6 assert "absence" behavior (`has('cl') === false`, `checklistVisible ?? false === false`) which already holds against the current url-state.ts. They will also pass after Plan 02 (correctly). These are valid gates but not RED-discriminating. 3 RED tests is sufficient — they do discriminate against the unimplemented `cl` param.
- **Not a bug:** Plan said "at least 4"; actual result is 3. The plan's expectation was based on assuming test 6 would fail, but `cl=0` with no implementation produces undefined, and `undefined ?? false === false` passes. No fix applied — 3 RED tests are correct discriminators.

## Production Sources Unchanged

Confirmed via `git diff --stat HEAD~3 HEAD -- src/bee-map.ts src/bee-pane.ts src/bee-atlas.ts src/url-state.ts`: zero changes.

## What Plans 02 and 03 Will Do

- **Plan 02:** Extend `src/url-state.ts` (add `checklistVisible?: boolean` to `UiState`, encode as `cl=1`, parse `cl=1`) and `src/bee-pane.ts` (add `_showChecklist` toggle with `checklist-layer-changed` event). MAP-01 and MAP-04 gates turn GREEN.
- **Plan 03:** Extend `src/bee-map.ts` (add `checklist-county-fill` layer, `showChecklist`/`checklistTaxon` properties, `parquetReadObjects` fetch, `_checklistGeneration` counter) and `src/bee-atlas.ts` (add `_checklistVisible`, bind `.checklistTaxon`, wire event). MAP-02 and MAP-03 gates turn GREEN.

## Known Stubs

None — this plan only adds test files.

## Threat Flags

None — test files only; no new runtime trust boundaries.

## Self-Check: PASSED

- [x] `src/tests/bee-map.test.ts` exists
- [x] `src/tests/bee-pane.test.ts` contains `'MAP-01: checklist toggle in filter panel'`
- [x] `src/tests/bee-atlas.test.ts` contains `'MAP-03: checklist taxon filter binding'`
- [x] `src/tests/url-state.test.ts` contains `'MAP-04: checklist layer URL param (cl=1)'`
- [x] Commits e099939, 70ef590, 78c597c verified in git log
- [x] 21 new tests fail RED; 0 pre-existing test regressions
- [x] Production sources (`bee-map.ts`, `bee-pane.ts`, `bee-atlas.ts`, `url-state.ts`) byte-identical to pre-plan state
