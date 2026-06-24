---
phase: 164-sidebar-list-ignores-src-source-filter
plan: "01"
subsystem: frontend-filter
tags: [filter, url-state, sql, source-filter, lit]
dependency_graph:
  requires: []
  provides: [FilterState.hiddenSources, buildFilterSQL-source-predicate, _onSourceFilterChanged-rewired]
  affects: [src/filter.ts, src/url-state.ts, src/bee-atlas.ts]
tech_stack:
  added: []
  patterns: [Phase-156-bounds-template, source-IN-allowlist-predicate, Pitfall-3-emptyFilter-update]
key_files:
  created: []
  modified:
    - src/filter.ts
    - src/url-state.ts
    - src/bee-atlas.ts
    - src/tests/filter.test.ts
    - src/tests/url-state.test.ts
    - src/tests/bee-atlas.test.ts
    - src/tests/bee-atlas-legacy-taxon.test.ts
    - src/tests/filter-join-execution.test.ts
decisions:
  - "Promote hiddenSources into FilterState (D-02) using Phase-156 bounds template"
  - "source IN (visible) predicate with 1=0 for all-off (D-05)"
  - "Leave bee-map._visibleBySource untouched — structurally required (D-04)"
  - "Move srcRaw parse before hasFilter in parseParams; extend hasFilter for src="
metrics:
  duration_seconds: 340
  completed: "2026-06-24T18:11:18Z"
  tasks_completed: 2
  files_changed: 8
---

# Phase 164 Plan 01: Sidebar List Source Filter — Summary

**One-liner:** Promote `hiddenSources` into `FilterState` so all four SQL views (list, count, CSV, table) honor the `src=` source filter via a single `o.source IN (visible)` predicate in `buildFilterSQL`, mirroring the Phase-156 bounds migration.

## What Was Built

**Root cause fixed:** `_onSourceFilterChanged` only wrote `_hiddenSources` and called `_replaceUrlState` — it never re-ran the SQL queries, and `buildFilterSQL` had no source predicate. The sidebar list, filter-result count, CSV export, and table view all remained source-blind.

**Fix architecture:**

1. `FilterState.hiddenSources: Set<SourceKey>` — new field (empty Set = no filter). All `FilterState` construction sites updated to include the field (including test helpers).

2. `buildFilterSQL` — new source predicate after the bounds clause: `o.source IN (visibleSources)` when some sources are hidden; `1 = 0` when all 4 are hidden (D-05). Values come from a hardcoded `VALID_SOURCES` local, never user input (T-164-SQL mitigated).

3. `isFilterActive` — extended with `|| f.hiddenSources.size > 0` so a source-only filter counts as active (style-cache bypass, chip visibility, `intendedFilterActive`).

4. `parseParams` in `url-state.ts` — moved `srcRaw`/`hiddenSources` parse block before `hasFilter`; extended `hasFilter` to include `(hiddenSources !== undefined && hiddenSources.size > 0)`; added `hiddenSources` to `result.filter` object. The existing `result.ui.hiddenSources` channel and `buildParams` write side are unchanged (D-02 URL round-trip preserved).

5. `bee-atlas.ts` rewired:
   - `_filterState` init: added `hiddenSources: new Set()`
   - Standalone `@state() private _hiddenSources` field: deleted
   - Both `<bee-map>` and `<bee-pane>` render bindings: changed to `.hiddenSources=${this._filterState.hiddenSources}`
   - `firstUpdated`: added `hiddenSources` to `_filterState` restore block; fixed initial `replaceState` to pass `hiddenSources`
   - `_onPopState`: added `hiddenSources` to `_filterState` restore; removed standalone assignment
   - `_buildCurrentParams`: changed to pass `this._filterState.hiddenSources`
   - `_onFilterChanged`: added `hiddenSources: this._filterState.hiddenSources` preservation (Pitfall 1)
   - `_onSourceFilterChanged`: rewired to spread `_filterState`, call `_runFilterQuery` + `_runListQuery` + `_runTableQuery` + `_replaceUrlState`

6. Tests: new `isFilterActive — hiddenSources` and `buildFilterSQL — source filter (D-01/D-05)` describe blocks; MAP-03 extended with `result.filter?.hiddenSources` assertions; MAP-02/MAP-03 source assertions updated for new write pattern; `emptyFilter()` helpers in 4 test files updated.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing critical functionality] Updated emptyFilter() in filter-join-execution.test.ts and bee-atlas-legacy-taxon.test.ts**
- **Found during:** Task 2, full test run
- **Issue:** `FilterState` interface now requires `hiddenSources`; these two test files had their own `emptyFilter()` / `DEFAULT_FILTER` helpers missing the field, causing `f.hiddenSources.size` to throw at runtime.
- **Fix:** Added `hiddenSources: new Set()` to both helpers (Pitfall 3 per RESEARCH).
- **Files modified:** `src/tests/filter-join-execution.test.ts`, `src/tests/bee-atlas-legacy-taxon.test.ts`
- **Commit:** e17ec742

### Pre-existing Out-of-Scope Failures

`src/tests/build-output.test.ts` — fails with `warn: unknown species: "Agapostemon texanus" not in species.json` during `npm run build`. Confirmed pre-existing by stash test against the base commit. Not caused by this plan. Deferred.

## Known Stubs

None — all four SQL consumers are wired to `buildFilterSQL` which now emits the source predicate. No placeholder data or mock wiring.

## Threat Flags

None — the only new security surface (T-164-SQL) is the `o.source IN (...)` predicate in `buildFilterSQL`. Mitigated: values are the visible complement of `VALID_SOURCES` (hardcoded local array), not user input. The `o.`-alias invariant is satisfied. Covered by the new `buildFilterSQL — source filter` test block.

## Self-Check: PASSED

Files exist:
- `src/filter.ts` — FOUND (hiddenSources field, isFilterActive, buildFilterSQL source predicate)
- `src/url-state.ts` — FOUND (hiddenSources in result.filter, hasFilter extended)
- `src/bee-atlas.ts` — FOUND (_filterState.hiddenSources single source of truth)
- `src/tests/filter.test.ts` — FOUND (new describe blocks)
- `src/tests/url-state.test.ts` — FOUND (MAP-03 extended)
- `src/tests/bee-atlas.test.ts` — FOUND (MAP-02/MAP-03 updated)

Commits exist:
- `9174620a` — Task 1 (filter.ts + url-state.ts + filter.test.ts + url-state.test.ts)
- `e17ec742` — Task 2 (bee-atlas.ts + bee-atlas.test.ts + legacy-taxon.test.ts + filter-join-execution.test.ts)

D-04 honored: `git diff --name-only src/bee-map.ts src/bee-pane.ts` = empty (no changes).
