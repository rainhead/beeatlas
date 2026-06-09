---
phase: 144-map-init-readiness
plan: "01"
subsystem: ui
tags: [lit, mapbox, url-state, filter, async, taxon]

# Dependency graph
requires:
  - phase: quick-260608-tnc
    provides: ready.ts with taxaReady/mapReady deferred barriers + markTaxaReady()
provides:
  - _filterResolving boolean field as dedicated pending-legacy-resolve flag
  - intendedFilterActive getter (isFilterActive || _filterResolving) — single gate
  - await-taxaReady linear resolution path replacing store-and-poll dance
  - _awaitLegacyTaxonResolution method (called from firstUpdated + _onPopState)
affects: [144-02-PLAN, bee-atlas.ts, bee-atlas-legacy-taxon.test.ts]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "await-barrier: legacy-taxon URL resolution awaits taxaReady (one-shot promise) rather than polling/ordering on _loadSummaryFromSQLite"
    - "single-gate: intendedFilterActive getter is the ONE source of hide-all + URL-suppression truth"

key-files:
  created: []
  modified:
    - src/bee-atlas.ts
    - src/tests/bee-atlas-legacy-taxon.test.ts

key-decisions:
  - "_filterResolving is a plain boolean field (not @state) — it does not need to drive re-render; the @state fields it gates already trigger updates"
  - "_replaceUrlState/_pushUrlStateDebounced gate on _filterResolving specifically (not the broad intendedFilterActive) so ordinary active filters still write their URL on first load"
  - "_resolveLegacyTaxon on match path now calls _resolveTaxonDisplayName + _replaceUrlState itself (unsuppressed because _filterResolving=false before those calls)"
  - "_pendingLegacyTaxon field removed entirely — the await flow passes {name, rank} as a closure variable; no stored gate needed"
  - "ready.ts mock in tests uses a controllable deferred so the await-path can be tested synchronously"

patterns-established:
  - "Pattern: one-shot readiness barriers (taxaReady) replace poll/ordering dependencies for async resource coordination"
  - "Pattern: intendedFilterActive getter as the single hide-all gate — both firstUpdated and URL methods read one source of truth"

requirements-completed: [SC-1, SC-2, SC-4, SC-5]

# Metrics
duration: 7min
completed: "2026-06-09"
---

# Phase 144 Plan 01: Map-Init Readiness (await-taxaReady + intendedFilterActive gate) Summary

**Eliminated the legacy-taxon store-and-poll dance: resolution now awaits taxaReady in a single linear flow; _filterResolving + intendedFilterActive getter consolidate hide-all and URL-suppression into one gate**

## Performance

- **Duration:** 7 min
- **Started:** 2026-06-09T15:52:37Z
- **Completed:** 2026-06-09T15:59:44Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments

- Added `_filterResolving` boolean field and `intendedFilterActive` getter (`isFilterActive(_filterState) || _filterResolving`) as the single gate for hide-all and URL-write suppression
- Replaced the `_pendingLegacyTaxon` store-and-recheck cycle with a one-shot `await taxaReady` path in `_awaitLegacyTaxonResolution` — called from `firstUpdated` and `_onPopState`
- Removed `_pendingLegacyTaxon` field entirely; removed the `if (cache.size === 0) re-store` branch from `_resolveLegacyTaxon`; removed legacy-resolution responsibility from `_loadSummaryFromSQLite` Step 3
- All 11 legacy-taxon regression tests green; `tsc --noEmit` clean; 193 bee-atlas/url-state/ready tests pass

## Task Commits

Each task was committed atomically using TDD (RED → GREEN):

1. **Task 1 RED: failing tests for _filterResolving + intendedFilterActive** - `fee0e0e` (test)
2. **Task 1 GREEN: introduce _filterResolving + intendedFilterActive gate** - `eb25e47` (feat)
3. **Task 2 RED: failing tests for await-taxaReady path** - `a40c27e` (test)
4. **Task 2 GREEN: convert legacy resolution to await-taxaReady path** - `7c70403` (feat)

## Files Created/Modified

- `src/bee-atlas.ts` — added `_filterResolving` field, `intendedFilterActive` getter, `_awaitLegacyTaxonResolution` method; updated firstUpdated/\_onPopState/\_replaceUrlState/\_pushUrlStateDebounced/\_resolveLegacyTaxon; removed `_pendingLegacyTaxon` field; updated `_loadSummaryFromSQLite` Step 3
- `src/tests/bee-atlas-legacy-taxon.test.ts` — updated all 5 existing tests to use `_filterResolving` instead of `_pendingLegacyTaxon`; added 4 new `intendedFilterActive` tests; added mock for `ready.ts` with controllable `taxaReady` barrier; added 2 await-path tests (per plan spec)

## Decisions Made

- **_filterResolving as plain boolean (not @state):** The field doesn't need to drive its own render cycle — the `@state` fields it gates (`_visibleIds`, `_filteredGeoJSON`, `_filterState`) already trigger updates. Keeping it plain avoids spurious re-renders.
- **URL suppression gates on `_filterResolving` not `intendedFilterActive`:** The broad `intendedFilterActive` would also suppress URL writes for ordinary active filters. The suppression is specifically for the pending-legacy case, so the narrower `_filterResolving` gate is correct.
- **`_resolveLegacyTaxon` on match path writes canonical URL itself:** After setting `taxonId` and clearing `_filterResolving`, calling `_resolveTaxonDisplayName` + `_replaceUrlState` is safe and self-contained — no caller coordination needed.
- **`_pendingLegacyTaxon` field fully removed:** The `{name, rank}` pair lives as a closure variable in the `_awaitLegacyTaxonResolution` async IIFE. No stored field needed.
- **ready.ts mock with controllable deferred:** Allows the await-path test to control when `taxaReady` resolves without timing dependencies, making the test deterministic.

## Deviations from Plan

None - plan executed exactly as written. The TDD RED/GREEN cycle proceeded cleanly. The `_awaitLegacyTaxonResolution` private method was named as implied by the plan's action description; the plan used `void (async () => { await taxaReady; ... })()` idiom which I used in the implementation to satisfy the `grep -n "await taxaReady"` acceptance criterion.

## Issues Encountered

- Initial test file had a `vi.resetModules()` in `beforeEach` that caused `CustomElementRegistry.define` double-registration errors (modules share one registry per test file). Removed — the imports are stable within a test file.
- One test for `intendedFilterActive` lifecycle had an incorrect expectation (`toBe(false)` when `taxonId=307633` makes `isFilterActive` return true). Corrected the assertion to match the actual semantics.
- `npm test` shows 2 pre-existing failures (`build-output.test.ts`, `data-species.test.ts`) due to missing `public/data/species.json` pipeline data in the worktree environment. These are not caused by this plan's changes; 24/26 test files pass (558 tests, 30 skipped).

## Known Stubs

None — no stubs introduced. This is a pure refactor of existing resolution logic.

## Threat Flags

None — no new network endpoints, auth paths, file access patterns, or schema changes introduced. T-144-LU preserved: the legacy name is used only in an in-memory `_taxonCache` equality comparison, never interpolated into SQL.

## Next Phase Readiness

- `intendedFilterActive` getter is ready for Plan 02 to use for the render decision in `<bee-map>` (`render = f(filteredGeoJSON, intendedFilterActive)`)
- `mapReady` barrier from `ready.ts` is available for Plan 02 to await before rendering
- No blockers

## Self-Check

Files exist:
- `src/bee-atlas.ts` — modified (verified)
- `src/tests/bee-atlas-legacy-taxon.test.ts` — modified (verified)

Commits exist:
- `fee0e0e` — test(144-01) RED Task 1
- `eb25e47` — feat(144-01) GREEN Task 1
- `a40c27e` — test(144-01) RED Task 2
- `7c70403` — feat(144-01) GREEN Task 2

## Self-Check: PASSED

---
*Phase: 144-map-init-readiness*
*Completed: 2026-06-09*
