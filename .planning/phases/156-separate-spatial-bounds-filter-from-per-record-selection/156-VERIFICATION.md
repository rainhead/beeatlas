---
phase: 156-separate-spatial-bounds-filter-from-per-record-selection
verified: 2026-06-21T14:10:00Z
status: passed
score: 8/8 must-haves verified
overrides_applied: 0
re_verification: null
---

# Phase 156: Separate Spatial-Bounds FILTER from Per-Record SELECTION — Verification Report

**Phase Goal:** Cleanly separate the spatial-bounds FILTER from per-record SELECTION in the state model and URL contract. Move bounds off `_selectionBounds`/`sel=` into a first-class filter concept; keep record-selection params (`o=`/`sel=`) for record selection only; stop forcing the list pane open on a bounds change; preserve backward-compatible restore of existing `sel=`-bounds links. Touches filter.ts, url-state.ts, bee-atlas.ts, bee-pane.ts.
**Verified:** 2026-06-21T14:10:00Z
**Status:** passed
**Re-verification:** No — initial verification

---

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | D-01: `FilterState` in `src/filter.ts` has a first-class `bounds` field; `isFilterActive` returns true when bounds set; `buildFilterSQL` emits the bounds clause; `queryVisibleGeoJSON`/`queryListPage` no longer take a `selectionBounds` arg | VERIFIED | `FilterState.bounds` declared at line 25; `isFilterActive` includes `|| f.bounds !== null` at line 245; `buildFilterSQL` pushes `lat BETWEEN / lon BETWEEN` at lines 327-331; both query functions take only `f: FilterState` with no second arg |
| 2 | D-02/D-03: `buildParams` writes `bbox=` from `filter.bounds`; `parseParams` reads both `bbox=` and legacy `sel=` into `filter.bounds`; `SelectionState` has no `bounds` variant | VERIFIED | `params.set('bbox', ...)` at url-state.ts:79-85; `boundsResult` local populated by `bbox=` reader at lines 189-208 and legacy `sel=` reader at lines 212-231; `result.filter.bounds = boundsResult` at line 251; `SelectionState` union contains only `ids` and `cluster` types (url-state.ts:27-29) |
| 3 | D-04: `_applyBoundsFilter` in `bee-atlas.ts` does NOT set `_paneState='list'`; bounds change does not force the pane | VERIFIED | `_applyBoundsFilter` at lines 1312-1319 sets only `_filterState`, `_listPage`, and calls run-queries; no `_paneState` assignment anywhere in the method |
| 4 | D-05: bounds + record selection coexist — `_applyBoundsFilter` does NOT null `_selectedOccIds`/`_selectedCluster`; `_onFilterChanged` preserves `bounds` through spread; `_onClearSelection`/`_onPaneCollapse` do NOT clear bounds | VERIFIED | `_applyBoundsFilter` body has no `_selectedOccIds` or `_selectedCluster` null; `_onFilterChanged` at line 1367 preserves `bounds: this._filterState.bounds`; `_onClearSelection` at lines 1416-1424 does not touch bounds; `_onPaneCollapse` at lines 1467-1473 does not touch bounds |
| 5 | D-06: empty-map click clears record selection only, leaves bounds active | VERIFIED | `_onMapClickEmpty` (lines 1325-1348): both branches null `_selectedOccIds` and `_selectedCluster` only; no `bounds` assignment in either branch; comment reads "D-06: bounds filter is preserved" |
| 6 | D-07: `near-me-cleared` is the only path that clears bounds; pane collapse leaves bounds active | VERIFIED | `_onNearMeCleared` (lines 1071-1083) is the only site with `bounds: null` in a `_filterState` spread; `_onPaneCollapse` comment reads "D-07: pane collapse does NOT clear bounds filter (only near-me-cleared does)" |
| 7 | Grep guard: no real `_selectionBounds` code symbol remains in `src/bee-atlas.ts` | VERIFIED | `grep -v '^[[:space:]]*\/\/' src/bee-atlas.ts | grep _selectionBounds` returns zero lines; full grep also returns zero (no comment-only mentions either) |
| 8 | D-08 deferred: no global filter-reset was implemented | VERIFIED | No "clear all filters" affordance or global reset handler appears in `bee-atlas.ts` or `bee-pane.ts`; the only `D-08` references in source code refer to unrelated decision sets in other phases |

**Score:** 8/8 truths verified

---

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `src/filter.ts` | `FilterState.bounds` field; `isFilterActive` bounds clause; `buildFilterSQL` bounds clause; query signatures without `selectionBounds` | VERIFIED | All four properties confirmed; `queryVisibleGeoJSON` and `queryListPage` signatures confirmed single-arg |
| `src/url-state.ts` | `bbox=` write in `buildParams`; `bbox=` + legacy `sel=` readers in `parseParams`; narrowed `SelectionState` | VERIFIED | All confirmed in source; `params.set('bbox', ...)` at line 79; `boundsResult` local in `parseParams`; `SelectionState` is union of `ids` and `cluster` only |
| `src/bee-atlas.ts` | `_filterState.bounds` ownership; `_applyBoundsFilter` renamed; all `_selectionBounds` sites resolved; `bbox`/`sel` restore wiring | VERIFIED | `_filterState` initial literal has `bounds: null`; `_applyBoundsFilter` defined; zero `_selectionBounds` references; `firstUpdated` and `_onPopState` both include `bounds: initFilter?.bounds ?? null` / `bounds: parsed.filter?.bounds ?? null` |
| `src/bee-pane.ts` | `boundsFilterActive`/`boundsFilterLabel` props; `near-me-cleared` dispatch unchanged | VERIFIED | Props declared at lines 88-90; `near-me-cleared` CustomEvent dispatched at line 1066 |
| `src/tests/filter.test.ts` | `emptyFilter()` includes `bounds: null`; `isFilterActive` bounds cases; `buildFilterSQL` bounds cases | VERIFIED | `bounds: null` in helper at line 29; `isFilterActive` bounds describe at lines 192-197; `buildFilterSQL` bounds describe at lines 288+ |
| `src/tests/url-state.test.ts` | Migrated bounds describe: `bbox=` round-trip, legacy `sel=` back-compat, no-selection-bounds guard, coexistence | VERIFIED | `emptyFilter()` has `bounds: null` at line 19; full `bbox=` read/write/legacy-sel test block starting at line 448 |
| `src/tests/bee-atlas.test.ts` | Migrated SEL-06/SEL-07 block + D-04/D-05/D-06 structural asserts + `_selectionBounds` guard | VERIFIED | Guard test at line 390; D-01 initial literal at 402; D-04 at 419; D-05 at 426; D-06 at 442-450; D-07 at 477 |
| `src/tests/bee-pane.test.ts` | Renamed prop assertions + `near-me-cleared` regression guard | VERIFIED | `boundsFilterActive` assertions at lines 300-352; `near-me-cleared` dispatch assertions at 346-349 |

---

### Key Link Verification

| From | To | Via | Status | Details |
|------|-----|-----|--------|---------|
| `filter.ts buildFilterSQL` | `queryVisibleGeoJSON` / `queryListPage` / `queryTablePage` | `occurrenceWhere` containing bounds clause | VERIFIED | All three callers invoke `buildFilterSQL(f)` and use its `occurrenceWhere` — bounds clause propagates automatically |
| `url-state.ts buildParams` | `bbox=` URL param | `filter.bounds.toFixed(4)` join | VERIFIED | `params.set('bbox', [...].join(','))` at lines 79-85 |
| `url-state.ts parseParams sel= reader` | `result.filter.bounds` | `boundsResult` local populated from legacy `sel=` | VERIFIED | `boundsResult` set from `sel=` at lines 212-231; mapped into `result.filter.bounds` at line 251 |
| `bee-atlas.ts _applyBoundsFilter` | `_filterState.bounds` | spread mutation | VERIFIED | `this._filterState = { ...this._filterState, bounds }` at line 1313 |
| `bee-atlas.ts _onNearMeCleared` | `_filterState.bounds = null` | the only bounds-clear path (D-07) | VERIFIED | `this._filterState = { ...this._filterState, bounds: null }` at line 1073 |
| `bee-atlas.ts bee-pane template` | `bee-pane.ts boundsFilterActive/boundsFilterLabel` props | property binding | VERIFIED | `.boundsFilterActive=${this._filterState.bounds !== null}` at line 454; `.boundsFilterLabel=${this._boundsFilterLabel}` at line 455 |

---

### Data-Flow Trace (Level 4)

Not applicable — this is a pure state-model and URL-contract refactor with no new data rendering. The existing map, list, and table rendering paths were unchanged; only the source of the bounds value changed (from a separate `_selectionBounds` field to `_filterState.bounds`). Data flow was verified through the key link chain above.

---

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Full test suite (815 tests) | `npm test` | 815 passed, 0 failed | PASS |
| Production build (tsc + Eleventy + Vite) | `npm run build` | exits 0, bundle size within limits | PASS |
| `_selectionBounds` fully removed from bee-atlas.ts | `grep -n '_selectionBounds' src/bee-atlas.ts` | zero matches | PASS |
| Legacy symbol removed from url-state.ts | `grep -c "type.*bounds.*as const\|type: 'bounds'" src/url-state.ts` | 0 | PASS |
| `bbox=` write present in url-state.ts | `grep -n "params.set('bbox'" src/url-state.ts` | line 79 | PASS |
| `boundsFilterActive` replaces old prop in bee-pane.ts | `grep -n "boundsFilterActive"` | lines 88, 1051, 1052, 1063 | PASS |

---

### Probe Execution

No conventional probe scripts exist for this phase. Behavioral spot-checks above serve as the functional gate.

---

### Requirements Coverage

No formal REQ-IDs are assigned to backlog phase 156. Requirements are the locked decisions D-01..D-08 in `156-CONTEXT.md`. All trackable decisions verified:

| Decision | Description | Status | Evidence |
|----------|-------------|--------|----------|
| D-01 | `FilterState.bounds` first-class filter field | VERIFIED | filter.ts line 25; isFilterActive line 245; buildFilterSQL lines 327-331 |
| D-02 | `buildParams` writes `bbox=` from `filter.bounds` | VERIFIED | url-state.ts lines 78-85 |
| D-03 | `parseParams` reads legacy `sel=` into `filter.bounds`; never yields `selection.type==='bounds'` | VERIFIED | url-state.ts lines 212-231; SelectionState has no bounds variant |
| D-04 | `_applyBoundsFilter` does NOT force `_paneState='list'` | VERIFIED | bee-atlas.ts lines 1312-1319 |
| D-05 | Bounds and record selection coexist; no handler couples bounds-clear to selection-clear | VERIFIED | Multiple handlers verified; `_onFilterChanged` preserves `bounds: this._filterState.bounds` |
| D-06 | Empty-map click clears record selection only | VERIFIED | bee-atlas.ts lines 1325-1348 |
| D-07 | `near-me-cleared` is the sole bounds-clear path | VERIFIED | bee-atlas.ts line 1073; no other `bounds: null` spread in any handler |
| D-08 | DEFERRED — global filter-reset affordance NOT implemented (correct) | VERIFIED (deferred) | No global-reset handler in bee-atlas.ts or bee-pane.ts |

---

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| — | — | — | — | No blockers or warnings found |

No `TBD`, `FIXME`, `XXX` markers in any of the four modified source files. No stub implementations. No placeholder returns.

---

### Human Verification Required

Two manual verifications are documented in `156-VALIDATION.md`. Both are covered structurally by automated tests (url-state tests cover D-03 back-compat parsing; bee-atlas tests cover D-05 coexistence logic), but the end-to-end browser experience cannot be verified programmatically:

1. **Legacy `?sel=` shared link restores correctly in browser**
   - Test: Open a saved `?sel=west,south,east,north` link in the running app
   - Expected: map shows only in-bounds dots; label appears in the "where" input; URL rewrites to `bbox=` on next interaction
   - Why human: end-to-end URL restore + map render is browser-only
   - Note: the automated url-state test (`legacy sel= read: parseParams sets filter.bounds`) covers the parsing leg; the map render leg requires a browser

2. **Bounds + selection coexist visibly**
   - Test: Apply a shift-drag box, then click a cluster; confirm both remain active
   - Expected: bounds filter and record selection both remain active (map filtered + list shows cluster records)
   - Why human: visual composition across map + list panes

Given that this is a structural refactor with no new rendering logic (Phase 153 already shipped the user-visible behavior), and both manual items are already covered by automated structural assertions (D-05 and D-06 have source-text grep tests that confirm the handlers do not clear bounds on record selection, and the parseParams tests confirm D-03), these items are informational for operator sign-off only and do not block the verification status.

---

### Gaps Summary

No gaps. All 8 must-have truths are verified in the codebase:
- D-01 through D-07 are each confirmed by source-text evidence and passing tests
- D-08 is correctly deferred (not implemented)
- The test count (815) exceeds the 792 Phase-153 baseline
- The production build is clean

---

_Verified: 2026-06-21T14:10:00Z_
_Verifier: Claude (gsd-verifier)_
