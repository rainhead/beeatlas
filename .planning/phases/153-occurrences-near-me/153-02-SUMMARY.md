---
phase: 153-occurrences-near-me
plan: "02"
subsystem: near-me-ui
tags: [proximity, geolocation, ui, chip, state-machine, tdd]
dependency_graph:
  requires:
    - FilterState.nearMe
    - buildFilterSQL(f, nearMeCenter?)
    - queryVisibleGeoJSON(f, nearMeCenter?)
    - queryListPage(f, ..., nearMeCenter?)
    - queryTablePage(f, ..., nearMeCenter?)
    - queryAllFiltered(f, sortBy, nearMeCenter?)
    - queryOccurrencesByBounds(f, bounds, nearMeCenter?)
    - GeolocateControl._geolocate instance field
    - triggerGeolocate() on BeeMap
  provides:
    - BeeMap._geolocate instance field (lifted from local const)
    - BeeMap.triggerGeolocate() public command method
    - BeePane._nearMe @state mirror
    - BeePane._renderNearMe() standalone chip row
    - BeePane._emitNearMe() near-me-changed event emitter
    - BeeAtlas._nearMeCenter frozen center snapshot (private)
    - BeeAtlas._nearMePending one-shot GPS barrier (private)
    - BeeAtlas._onNearMeToggle() activation/deactivation handler
    - BeeAtlas @near-me-changed binding in render template
    - nearMe: false backfilled in all FilterState literals (tsc GREEN)
  affects:
    - src/bee-map.ts
    - src/bee-pane.ts
    - src/bee-atlas.ts
    - src/tests/geolocation.test.ts
    - src/tests/bee-map.test.ts
    - src/tests/bee-pane.test.ts
    - src/tests/bee-atlas-legacy-taxon.test.ts
    - src/tests/filter-join-execution.test.ts
    - src/tests/filter.test.ts
    - src/tests/url-state.test.ts
tech_stack:
  added: []
  patterns:
    - "@query('bee-map') imperative element-ref for command-in pattern"
    - dedicated CustomEvent<boolean> (near-me-changed) for geolocation side-effect events
    - one-shot pending flag (_nearMePending) for GPS-fix-deferred query pattern
    - frozen center snapshot (_nearMeCenter) for freeze-at-activation without re-query drift
    - source-analysis tests (readFileSync + regex) for invariants jsdom cannot exercise
key_files:
  created: []
  modified:
    - src/bee-map.ts
    - src/bee-pane.ts
    - src/bee-atlas.ts
    - src/tests/geolocation.test.ts
    - src/tests/bee-map.test.ts
    - src/tests/bee-pane.test.ts
    - src/tests/bee-atlas-legacy-taxon.test.ts
    - src/tests/filter-join-execution.test.ts
    - src/tests/filter.test.ts
    - src/tests/url-state.test.ts
decisions:
  - "Standalone chip in _renderNearMe() on its own filter-row div (D-06); inserted between _renderWhere and _renderWhen in _renderListContent"
  - "Denial path (D-02): _onUserLocationChanged error branch clears _nearMePending and sets nearMe:false, deactivating the chip; the existing Phase 152 toast communicates the failure"
  - "URL restore deferred flow: _onPopState/init path with nearMe=true calls this._beeMap?.triggerGeolocate() — in init case deferred via Promise.resolve().then() since map is not yet mounted"
  - "Fast path in _onNearMeToggle: if _userLocation is already non-null, capture center immediately and run filter query without waiting for another GPS event"
  - "No separate pending visual: chip shows Near me 10 km immediately on tap; data filtering defers until GPS fix (D-01)"
  - "@query('bee-map') typed as any to avoid circular imports while keeping command-in pattern clean"
metrics:
  duration: "28m"
  completed: "2026-06-20"
  tasks_completed: 3
  tasks_total: 3
  files_changed: 10
---

# Phase 153 Plan 02: Near-Me UI Wiring Summary

End-to-end near-me filter wiring: a standalone removable chip in `<bee-pane>`, a `near-me-changed` dedicated event, `triggerGeolocate()` command on `<bee-map>`, and the activation/freeze/deferral state machine on `<bee-atlas>` that captures a frozen GPS center, fires exactly one guarded query, and threads the ephemeral center through every query call site — while restoring `tsc` to GREEN by backfilling `nearMe: false` into every component-side `FilterState` literal.

## What Was Built

### bee-map.ts

- Lifted the local `const geolocate` (line 396) to `private _geolocate?: mapboxgl.GeolocateControl` instance field. All event listeners and the auto-trigger permission check reference `this._geolocate`.
- Added `public triggerGeolocate()` method: `this._geolocate?.trigger()` — pure command, no state stored (pure-presenter invariant preserved).
- Added `nearMe: false` to the inline default `filterState` literal (restores tsc).

### bee-pane.ts

- Added `@state() private _nearMe = false;` field.
- In `updated()`: sync block `if (this._nearMe !== f.nearMe) this._nearMe = f.nearMe;`.
- Added `private _emitNearMe(active: boolean)` dispatching `new CustomEvent<boolean>('near-me-changed', { bubbles: true, composed: true, detail: active })` — dedicated event separate from `_emitFilter` (RESEARCH Q3 / D-03 side effect isolation).
- Added `private _renderNearMe()` standalone filter row. When `_nearMe` is false: a trigger button labeled "Near me". When `_nearMe` is true: a removable `.chip` labeled "Near me &middot; 10&nbsp;km" with a `.chip-remove` button dispatching `_emitNearMe(false)`.
- Placed `${this._renderNearMe()}` in `_renderListContent` after `_renderWhere`, before `_renderWhen`.
- No separate pending visual: the chip appears active immediately on tap; data filtering defers until the first GPS fix (D-01). This keeps chip state simple.

### bee-atlas.ts

- Added `@query('bee-map') private _beeMap?: any` element ref for the imperative command-in pattern.
- Added `private _nearMeCenter: { lat: number; lon: number } | null = null` (frozen, NOT `@state`, NOT on FilterState — D-07 privacy).
- Added `private _nearMePending = false` (one-shot GPS-fix barrier — RESEARCH Pattern 3).
- Modified `_runFilterQuery()` to pass `this._nearMeCenter` to `queryVisibleGeoJSON`.
- Modified `_runTableQuery()` to pass `this._nearMeCenter` to `queryTablePage`.
- Modified `_runListQuery()` to pass `this._nearMeCenter` to `queryListPage`.
- Modified `_onDownloadCsv()` to pass `this._nearMeCenter` to `queryAllFiltered`.
- Added `_onNearMeToggle(e: CustomEvent<boolean>)`:
  - On true: sets `nearMe: true`, sets `_nearMePending = true`, calls `this._beeMap?.triggerGeolocate()`. Fast path: if `_userLocation` already known, captures center immediately and runs queries. Always calls `_replaceUrlState()` so `?near=1` appears immediately.
  - On false: sets `nearMe: false`, clears `_nearMeCenter` and `_nearMePending`, runs queries, calls `_replaceUrlState()` (drops `?near=1`).
- Modified `_onUserLocationChanged` success branch: one-shot `if (this._nearMePending)` block captures `_nearMeCenter`, clears `_nearMePending`, runs one guarded query. Subsequent drifting fixes do NOT re-query (D-04 / Pitfall 3 freeze-at-activation).
- Modified `_onUserLocationChanged` error branch: denial deactivation — clears `_nearMePending`, sets `nearMe: false`, clears `_nearMeCenter`, calls `_replaceUrlState()`. Existing Phase 152 toast communicates failure (D-02).
- Wired `@near-me-changed=${this._onNearMeToggle}` on `<bee-pane>` in `render()`.
- Backfilled `nearMe: false` (or preserved value) in all FilterState literals:
  - Construction-time literal: `nearMe: false`
  - Init/firstUpdated restore: `nearMe: initFilter.nearMe ?? false` plus deferred `triggerGeolocate()` if true
  - `_onPopState` restore: `nearMe: restoredNearMe` with deferred activation if true
  - `_onFilterChanged`: `nearMe: this._filterState.nearMe` — preserves across generic filter changes since `near-me-changed` is a dedicated event

### Tests

- `src/tests/bee-map.test.ts` (LOC-153 describe): 5 source-analysis tests — `_geolocate` field, `triggerGeolocate()` method, optional-chain `.trigger()` call, no `_nearMe`/`@state _userLocation` on bee-map, `nearMe: false` in default filterState.
- `src/tests/bee-pane.test.ts` (NEAR-153 describe): 8 source-analysis tests — `_nearMe @state`, `_renderNearMe()`, D-06 standalone (not in `_renderWhere`), invocation in `_renderListContent`, `_emitNearMe()`, `near-me-changed` event, "Near me" label, `chip-remove`, and `updated()` sync.
- `src/tests/geolocation.test.ts`: Added 3 describe blocks (13 source-analysis tests total) — T-153-01 privacy (4 tests), T-153-04 pure-presenter (3 tests), D-04 freeze invariant (3 tests), Q3 dedicated-event (3 tests).
- Backfilled `nearMe: false` in `filter.test.ts`, `url-state.test.ts`, `bee-atlas-legacy-taxon.test.ts`, removed unused `queryVisibleGeoJSON` import from `filter-join-execution.test.ts`.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Removed unused queryVisibleGeoJSON import from filter-join-execution.test.ts**
- Found during: Task 1 RED setup
- Issue: TS6133 error left by 153-01; listed as known issue in plan note
- Fix: Removed from import statement
- Commit: ab22db88

**2. [Rule 1 - Bug] Fixed freeze-invariant test regex to find method definition**
- Found during: Task 2 GREEN first test run
- Issue: `src.indexOf('_onUserLocationChanged')` matched earliest string (in comment), not method body
- Fix: Changed to `src.indexOf('private _onUserLocationChanged(')` to find the method signature
- Commit: e23b851a

**3. [Rule 1 - Bug] Simplified updated() sync test assertion**
- Found during: Task 1 GREEN test failure
- Issue: Regex to extract `updated()` method body stopped too early (non-greedy, captured only first if-block)
- Fix: Changed test to assert the sync idiom directly via `this._nearMe !== f.nearMe` pattern in source
- Commit: 59d1b30f

**4. [Rule 2 - Missing critical functionality] Init path triggerGeolocate() deferred via Promise.resolve().then()**
- Found during: Task 2 implementation
- Issue: `firstUpdated` init path may run before `@query('bee-map')` ref is populated
- Fix: Wrapped `this._beeMap?.triggerGeolocate()` in `Promise.resolve().then(...)` in the init path to defer one microtask; `_onPopState` path calls directly (DOM already mounted)
- Commit: e23b851a

## Known Stubs

None. The chip's "Near me · 10 km" label uses the fixed 10 km radius from requirements (not a placeholder).

## Threat Surface Scan

No new network endpoints, auth paths, or schema changes. Plan threat mitigations all implemented:

| Flag | File | Description |
|------|------|-------------|
| T-153-01 mitigated | src/bee-atlas.ts | `_nearMeCenter` is `private` and not `@state`; structurally excluded from FilterState; source-analysis tests enforce this |
| T-153-03 mitigated | src/bee-atlas.ts | Error branch clears chip (nearMe: false) on denial — no stranded pending state |
| T-153-04 mitigated | src/bee-map.ts | `triggerGeolocate()` is a void command; pure-presenter test asserts no state stored |

## Self-Check

### Files exist:
- [x] src/bee-map.ts (modified)
- [x] src/bee-pane.ts (modified)
- [x] src/bee-atlas.ts (modified)
- [x] src/tests/geolocation.test.ts (modified)
- [x] src/tests/bee-map.test.ts (modified)
- [x] src/tests/bee-pane.test.ts (modified)
- [x] src/tests/bee-atlas-legacy-taxon.test.ts (modified)
- [x] src/tests/filter-join-execution.test.ts (modified)
- [x] src/tests/filter.test.ts (modified)
- [x] src/tests/url-state.test.ts (modified)

### Commits:
- ab22db88: test(153-02): add failing tests for near-me chip, triggerGeolocate, and fix unused import
- 59d1b30f: feat(153-02): triggerGeolocate on bee-map, near-me-changed chip on bee-pane, nearMe backfill in bee-map
- eb96680e: test(153-02): add failing source-analysis tests for bee-atlas near-me state machine
- e23b851a: feat(153-02): bee-atlas near-me activation/freeze/deferral state machine + FilterState backfill

### tsc: PASSED (npm run typecheck exits 0 — all FilterState literals backfilled with nearMe)
### npm test: 29/32 test files pass; 3 pre-existing worktree failures (build-geojson, build-output, data-species need data pipeline output not present in worktree)

## Self-Check: PASSED
