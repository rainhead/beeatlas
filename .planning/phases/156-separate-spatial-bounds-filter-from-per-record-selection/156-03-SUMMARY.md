---
phase: "156"
plan: "03"
subsystem: filter
tags: [filter, bounds, refactor, bee-atlas, bee-pane, D-01, D-04, D-05, D-06, D-07]
dependency_graph:
  requires:
    - FilterState.bounds field (Plan 01)
    - SelectionState narrowed to ids/cluster (Plan 02)
    - bbox= URL param / legacy sel= back-compat (Plan 02)
  provides:
    - _filterState.bounds ownership in bee-atlas.ts (no _selectionBounds field)
    - _applyBoundsFilter method (renamed from _applyBoundsSelection)
    - D-04: bounds change does not force-open pane
    - D-05: bounds and record selection coexist (no mutual exclusivity)
    - D-06: empty-map click clears record selection only
    - D-07: near-me-cleared is the only bounds-clear path
    - boundsFilterActive/boundsFilterLabel bee-pane props (renamed)
    - legacy sel= and new bbox= both restore into _filterState.bounds
  affects:
    - src/bee-atlas.ts
    - src/bee-pane.ts
    - src/tests/bee-atlas.test.ts
    - src/tests/bee-pane.test.ts
tech_stack:
  added: []
  patterns:
    - Bounds as first-class FilterState field — _filterState.bounds, not _selectionBounds
    - Single bounds-clear path: near-me-cleared event only (D-07)
    - Filter/selection coexistence: applying one never nulls the other (D-05)
key_files:
  created: []
  modified:
    - src/bee-atlas.ts
    - src/bee-pane.ts
    - src/bee-map.ts
    - src/tests/bee-atlas.test.ts
    - src/tests/bee-pane.test.ts
    - src/tests/bee-atlas-legacy-taxon.test.ts
    - src/tests/filter-join-execution.test.ts
key-decisions:
  - "D-04: _applyBoundsFilter does NOT set _paneState='list' — bounds is just another filter"
  - "D-05: bounds and record selection coexist; no handler nulls bounds when selection changes"
  - "D-06: _onMapClickEmpty clears only record selection; bounds filter survives"
  - "D-07: _onNearMeCleared is the sole bounds-clear path; it does NOT touch _paneState"
  - "D-01: _filterState = { ...this._filterState, bounds } is the spread mutation pattern"
  - "intendedFilterActive relies entirely on isFilterActive(f) which now covers bounds"
requirements-completed: [D-01, D-04, D-05, D-06, D-07]
duration: "25 minutes"
completed: "2026-06-21"
---

# Phase 156 Plan 03: Consumer Transition — bounds to _filterState, rename bee-pane props Summary

**Moved bounding-box state from `_selectionBounds` into `_filterState.bounds` in `<bee-atlas>`, applied all four behavior decisions (D-04/D-05/D-06/D-07), renamed `boundsFilterActive`/`boundsFilterLabel` in bee-pane, and migrated the affected test blocks — zero `_selectionBounds` remain, 815 tests green.**

## Performance

- **Duration:** ~25 min
- **Started:** 2026-06-21T13:30:00Z
- **Completed:** 2026-06-21T13:54:10Z
- **Tasks:** 3 (Tasks 1+2 committed together, plus deviation fix; Task 3 committed separately)
- **Files modified:** 7

## Accomplishments

- Removed `@state() private _selectionBounds` field and all 20 usage sites from `bee-atlas.ts`
- Renamed `_applyBoundsSelection` → `_applyBoundsFilter`; writes `_filterState = { ...this._filterState, bounds }` instead of `_selectionBounds = bounds`; no pane force-open (D-04); no record-selection nulling (D-05)
- `_onNearMeCleared` is now the sole bounds-clear path (D-07): spreads `bounds: null` and does NOT touch `_paneState`
- `_onMapClickEmpty` clears only record selection (D-06); `_onFilterChanged` preserves `bounds: this._filterState.bounds`; no other handler clears bounds
- `bee-pane.ts` props renamed (`selectionBoundsActive` → `boundsFilterActive`, `selectionBoundsLabel` → `boundsFilterLabel`); `near-me-cleared` dispatch unchanged
- Test suite migrated: SEL-06/SEL-07 rewritten with D-04/D-05/D-06/D-07 structural asserts; near-me behavioral tests updated to `_filterState.bounds`; 815 tests pass

## Task Commits

1. **Tasks 1+2 + deviation fixes: Move bounds into _filterState; resolve all _selectionBounds sites** - `4b31bcd6` (feat)
2. **Task 3: Rename bee-pane props; migrate tests** - `adfba2a4` (feat)

## Files Created/Modified

- `src/bee-atlas.ts` — `_filterState.bounds` ownership; `_applyBoundsFilter` rename; all D-04/D-05/D-06/D-07 handler changes; firstUpdated + popstate restore wiring; `_boundsFilterLabel` getter; bee-pane template bindings renamed
- `src/bee-pane.ts` — `boundsFilterActive`/`boundsFilterLabel` props (renamed); 4 template references updated; `near-me-cleared` dispatch unchanged
- `src/tests/bee-atlas.test.ts` — SEL-06/SEL-07 block rewritten; near-me behavioral and URL equivalence tests migrated; source assertions updated
- `src/tests/bee-pane.test.ts` — NEAR-01 prop-name assertions updated to renamed props
- `src/tests/bee-atlas-legacy-taxon.test.ts` — deviation fix: `bounds: null` added to `DEFAULT_FILTER`
- `src/bee-map.ts` — deviation fix: `bounds: null` added to `FilterState` literal
- `src/tests/filter-join-execution.test.ts` — deviation fix: `bounds: null` in `emptyFilter()`; `queryVisibleGeoJSON` calls updated to single-arg form

## Decisions Made

- D-04: bounds change does NOT force-open the pane (`_paneState = 'list'` removed from `_applyBoundsFilter` and `_onNearMeCleared`)
- D-05: bounds and record selection coexist — `_selectedOccIds`/`_selectedCluster` not nulled when bounds is applied; bounds not cleared when record selection changes
- D-06: `_onMapClickEmpty` clears record selection only; bounds survives an empty-map click
- D-07: `_onNearMeCleared` is the only path that clears `_filterState.bounds`; pane collapse (`_onPaneCollapse`) no longer clears bounds
- `_filterState.bounds` is preserved through `_onFilterChanged` via explicit `bounds: this._filterState.bounds` (FilterChangedEvent carries no bounds field)
- `intendedFilterActive` simplified to `isFilterActive(this._filterState) || this._filterResolving` (no separate bounds check needed since isFilterActive now covers bounds)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] bee-map.ts FilterState literal missing `bounds: null`**
- **Found during:** Tasks 1+2 (tsc after initial changes)
- **Issue:** `bee-map.ts` line 44 declares a `FilterState` literal without the new `bounds` field, causing `error TS2741`. The touchpoint inventory (RESEARCH.md) did not list this file.
- **Fix:** Added `bounds: null` to the literal at line 55
- **Files modified:** `src/bee-map.ts`
- **Verification:** `npx tsc --noEmit` exits 0
- **Committed in:** `4b31bcd6` (Tasks 1+2 commit)

**2. [Rule 2 - Missing Critical] filter-join-execution.test.ts consumers need updating**
- **Found during:** Tasks 1+2 (tsc after initial changes)
- **Issue:** Three problems: (a) `emptyFilter()` missing `bounds: null`; (b) three `queryVisibleGeoJSON(emptyFilter(), box)` calls passing a now-removed 2nd argument; (c) tests needed rewriting to pass bounds inside FilterState
- **Fix:** Added `bounds: null` to `emptyFilter()`; rewrote the three `queryVisibleGeoJSON` calls to use `{ ...emptyFilter(), bounds: box }` as the single argument
- **Files modified:** `src/tests/filter-join-execution.test.ts`
- **Verification:** `npx tsc --noEmit` exits 0; `npm test` passes all filter-join-execution tests
- **Committed in:** `4b31bcd6` (Tasks 1+2 commit)

**3. [Rule 1 - Bug] bee-atlas-legacy-taxon.test.ts DEFAULT_FILTER missing `bounds: null`**
- **Found during:** Task 3 (`npm test` run)
- **Issue:** `DEFAULT_FILTER` without `bounds: null` caused `isFilterActive` to return `true` (since `undefined !== null` is truthy), breaking 6 tests in `bee-atlas-legacy-taxon.test.ts` and `TypeError: Cannot read properties of undefined (reading 'west')` in `_buildCurrentParams`
- **Fix:** Added `bounds: null` to `DEFAULT_FILTER`
- **Files modified:** `src/tests/bee-atlas-legacy-taxon.test.ts`
- **Verification:** All 6 previously-failing tests now pass
- **Committed in:** `adfba2a4` (Task 3 commit)

---

**Total deviations:** 3 auto-fixed (Rule 2 × 2, Rule 1 × 1)
**Impact on plan:** All deviations were consumers of the Plan 01 `FilterState.bounds` interface change that the touchpoint inventory did not enumerate. No scope creep — all changes necessary for a green build.

## Issues Encountered

- `firstUpdated` test boundary detection: used `\n  private ` search which doesn't match `disconnectedCallback`. Fixed by searching for `\n  disconnectedCallback(` instead.
- `intendedFilterActive` comment contained `_selectionBounds` (in the phrase "no separate _selectionBounds check needed"), which caused a source-text assertion failure. Fixed by rewording the comment.
- `firstUpdated` uses `initFilter.bounds ?? null` (no optional chaining — inside `if (initFilter)` guard), while the test expected `initFilter?.bounds ?? null`. Fixed test to use a regex that matches both forms.

## Known Stubs

None — all implementations are wired; no placeholder data flowing to UI.

## Threat Flags

No new security-relevant surface introduced. The threat model from the plan's `<threat_model>` covers all changes:
- T-9998-05: bounds change is a filter change — `_applyBoundsFilter` calls `_runFilterQuery()` which increments the stale-guard generation counter (filter race guard preserved)
- T-9998-06: `isFilterActive(f.bounds !== null)` keeps `intendedFilterActive` true for bounds-only state (style-cache bypass preserved)

## Next Phase Readiness

- Phase 156 is complete: all three plans executed, `_selectionBounds` fully removed, bounds is a first-class filter field.
- D-08 (global "clear all filters" reset that includes bounds) is deferred — no global-reset affordance exists; `FilterState.bounds` makes it trivial when/if added.
- Backlog 155 (surfacing the shift-drag gesture) can now proceed with the clean filter model.

## Self-Check

- FOUND: src/bee-atlas.ts (grep -c _selectionBounds = 0)
- FOUND: src/bee-pane.ts (contains boundsFilterActive, boundsFilterLabel)
- FOUND: src/tests/bee-atlas.test.ts (migrated tests)
- FOUND: src/tests/bee-pane.test.ts (renamed prop assertions)
- FOUND commit 4b31bcd6 (Tasks 1+2 + deviation fixes)
- FOUND commit adfba2a4 (Task 3)
- npm test: 815 passed (above 792 baseline)
- npm run build: succeeded

## Self-Check: PASSED

---
*Phase: 156-separate-spatial-bounds-filter-from-per-record-selection*
*Completed: 2026-06-21*
