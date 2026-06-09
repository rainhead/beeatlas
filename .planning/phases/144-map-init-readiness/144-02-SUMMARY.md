---
phase: 144-map-init-readiness
plan: "02"
subsystem: ui
tags: [lit, mapbox, filter, pure-presenter, map-init, race-condition]

# Dependency graph
requires:
  - phase: 144-01
    provides: intendedFilterActive getter + _filterResolving boolean on bee-atlas
provides:
  - intendedFilterActive @property on bee-map (input-only, pure presenter invariant)
  - occurrence source render = f(filteredGeoJSON, intendedFilterActive) gated on mapReady
  - unfiltered-flash path removed structurally (not timed-around)
affects: [bee-map.ts, bee-atlas.ts, bee-map.test.ts, bee-atlas.test.ts]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "pure-function source-data: _applyVisibleIds branches on intendedFilterActive with filteredGeoJSON ?? empty"
    - "structural anti-flash: 'filter intended but data not yet ready' renders empty by construction"
    - "input-only presenter property: intendedFilterActive flows into bee-map but is never internally assigned"

key-files:
  created: []
  modified:
    - src/bee-map.ts
    - src/bee-atlas.ts
    - src/tests/bee-map.test.ts
    - src/tests/bee-atlas.test.ts

key-decisions:
  - "_applyVisibleIds branches on intendedFilterActive (not filteredGeoJSON !== null): the filter-active/not decision now lives on the input signal, not the presence of filtered data"
  - "_onPopState pre-seed replaced with null-resets (not removal): null + intendedFilterActive=true → bee-map renders filteredGeoJSON ?? empty = empty; prevents stale filtered data from flashing before new query resolves"
  - "Initial apply-after-load gates on visibleIds !== null || intendedFilterActive: ensures hide-all property arriving before map 'load' is applied once sources are created"
  - "bee-map.test.ts uses static source analysis (consistent with existing test harness pattern): mapbox-gl mocking is complex enough that source-grep tests provide adequate structural coverage"

patterns-established:
  - "Pattern: render-decision as pure function of inputs — the component that renders decides based on its inputs, not on timing of upstream state transitions"
  - "Pattern: structural race prevention via input gate — intendedFilterActive=true causes empty render by construction; the flash becomes impossible, not just improbable"

requirements-completed: [SC-3, SC-4, SC-5]

# Metrics
duration: 8min
completed: "2026-06-09"
---

# Phase 144 Plan 02: Map-Init Readiness (intendedFilterActive render gate) Summary

**Moved the occurrence-layer render decision into bee-map as a pure function of (filteredGeoJSON, intendedFilterActive), making the unfiltered-flash structurally impossible rather than timed-around**

## Performance

- **Duration:** 8 min
- **Started:** 2026-06-09T16:03:16Z
- **Completed:** 2026-06-09T16:11:00Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments

- Added `intendedFilterActive @property` to `<bee-map>` as an input-only presenter property
- Rewrote `_applyVisibleIds` to branch on `intendedFilterActive` (replacing `filteredGeoJSON !== null`): `intendedFilterActive=true` → `filteredGeoJSON ?? empty`, `false` → full set
- Updated `updated()` to trigger `_applyVisibleIds()` when `intendedFilterActive` changes
- Updated load-handler initial apply to gate on `visibleIds !== null || intendedFilterActive` so hide-all arrives correctly when map loads after a filter property was set
- Added `.intendedFilterActive=${this.intendedFilterActive}` to `<bee-atlas>` render() `<bee-map>` binding
- Removed firstUpdated empty-collection pre-seed (`_visibleIds = new Set()` + `_filteredGeoJSON = { features: [] }`) — hide-all now carried by `intendedFilterActive=true` flowing to bee-map
- Replaced `_onPopState` empty-collection pre-seed with null-resets — null + `intendedFilterActive=true` → bee-map renders `null ?? empty = empty`; stale filtered data cleared before new query resolves
- Added 6 new tests to `bee-map.test.ts` (render decision + mapReady gating) and 5 new tests to `bee-atlas.test.ts` (wiring + pre-seed removal)

## Task Commits

Each task was committed atomically using TDD (RED → GREEN):

1. **Task 1 RED: failing tests for intendedFilterActive render decision** - `e3afbab` (test)
2. **Task 1 GREEN: add intendedFilterActive @property; render = f(filteredGeoJSON, intendedFilterActive)** - `c3e8ab2` (feat)
3. **Task 2 RED: failing tests for bee-atlas intendedFilterActive wiring** - `cae584d` (test)
4. **Task 2 GREEN: wire intendedFilterActive to bee-map; remove empty-collection hide-all** - `e1e6fb2` (feat)

## Files Created/Modified

- `src/bee-map.ts` — added `intendedFilterActive @property`; updated `updated()` guard; rewrote `_applyVisibleIds` with `intendedFilterActive` branch and `filteredGeoJSON ?? empty`; updated load-handler initial apply gate
- `src/bee-atlas.ts` — added `.intendedFilterActive=${this.intendedFilterActive}` to `<bee-map>` binding; removed empty-collection pre-seeds in `firstUpdated` and `_onPopState`; replaced with null-resets and explanatory comments
- `src/tests/bee-map.test.ts` — added 6 tests: `intendedFilterActive` @property declaration, input-only invariant, `updated()` reaction, `filteredGeoJSON ?? empty` usage, `_applyVisibleIds` branches on `intendedFilterActive` (not `filteredGeoJSON !== null`), load-handler gating on `intendedFilterActive`
- `src/tests/bee-atlas.test.ts` — added 5 tests: render binding presence, firstUpdated pre-seed removal, `_onPopState` pre-seed removal, `_runFilterQuery` still assigns results, show-all/stale null-reset paths unchanged

## Decisions Made

- **`_applyVisibleIds` branches on `intendedFilterActive`:** The filter-active/not decision now lives on the input signal flowing in from `bee-atlas`, not on the presence of `filteredGeoJSON` data. This is the key structural change: "filter intended but data not yet ready" renders empty by construction.
- **`_onPopState` uses null-resets not empty-collection pre-seeds:** Null + `intendedFilterActive=true` causes `bee-map` to render `null ?? empty = empty`. This is behaviorally identical to the old pre-seed but semantically cleaner — the hide-all signal comes from `intendedFilterActive`, not from the shape of the data.
- **`bee-map.test.ts` uses static source analysis:** Following the established test harness pattern in that file. Mounting `<bee-map>` requires full mapbox-gl mock setup (used in `bee-atlas.test.ts`); static source analysis provides equivalent structural coverage for the render-decision invariants.
- **`intendedFilterActive` is input-only on `bee-map`:** Enforced by the acceptance criteria grep and the test. The pure-presenter invariant requires that `bee-map` never internally mutate its filter intent signal.

## Deviations from Plan

None — plan executed exactly as written. TDD RED/GREEN cycle proceeded cleanly. The `_onPopState` empty-collection pre-seed was replaced with null-resets (semantically equivalent for hide-all, more semantically honest) rather than simply removed — this is consistent with the plan's intent and prevents stale filtered data from flashing before a new query resolves.

## Issues Encountered

- `bee-map.test.ts` test locators needed adjustment: the regex for extracting the `_applyVisibleIds` method body was initially matching the method call `_applyVisibleIds()` rather than the definition; fixed by using `src.indexOf('private _applyVisibleIds()')`.
- `bee-atlas.test.ts` test locators needed adjustment: `firstUpdated` is a `public` method (not `async`), and `_onPopState` is an arrow function field (`_onPopState = () => {`), not a `private` method declaration.
- Both issues were caught during RED phase before implementation — they only affected test regex patterns, not the implementation.

## Known Stubs

None — no stubs introduced. This is a pure structural refactor.

## Threat Flags

None — T-144-OWN (tampering via presenter boundary drift) is mitigated: `this.intendedFilterActive =` does not appear in `bee-map.ts` method bodies (input-only invariant verified by test and acceptance criteria grep). No new network endpoints, auth paths, file access patterns, or schema changes.

## Self-Check

Files exist:
- `src/bee-map.ts` — modified (verified)
- `src/bee-atlas.ts` — modified (verified)
- `src/tests/bee-map.test.ts` — modified (verified)
- `src/tests/bee-atlas.test.ts` — modified (verified)

Commits exist:
- `e3afbab` — test(144-02) RED Task 1
- `c3e8ab2` — feat(144-02) GREEN Task 1
- `cae584d` — test(144-02) RED Task 2
- `e1e6fb2` — feat(144-02) GREEN Task 2

## Self-Check: PASSED

---
*Phase: 144-map-init-readiness*
*Completed: 2026-06-09*
