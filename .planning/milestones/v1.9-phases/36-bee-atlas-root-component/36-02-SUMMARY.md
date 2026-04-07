---
phase: 36-bee-atlas-root-component
plan: 02
subsystem: ui
tags: [typescript, lit, custom-element, coordinator-pattern, vitest, style-factory, refactor]

# Dependency graph
requires:
  - phase: 36-bee-atlas-root-component
    plan: 01
    provides: "bee-atlas coordinator skeleton, makeClusterStyleFn/makeSampleDotStyleFn factories, vitest infrastructure"
  - phase: 34-global-state-elimination
    provides: "Instance-property OL sources/layers, filter.ts with zero mutable module-level state"
  - phase: 35-url-state-module
    provides: "Pure url-state.ts with buildParams/parseParams"
provides:
  - "bee-map.ts as pure presenter: @property inputs, CustomEvent outputs, no shared state"
  - "filter.ts stripped of all module-level mutable state (filterState singleton, visibleEcdysisIds, visibleSampleIds, setVisibleIds removed)"
  - "style.ts stripped of old clusterStyle/sampleDotStyle functions and filter.ts import"
  - "region-layer.ts makeRegionStyleFn accepts getFilterState getter — no direct filterState import"
  - "Integration tests for ARCH-01, ARCH-02, ARCH-03 in frontend/src/tests/bee-atlas.test.ts"
  - "Complete coordinator pattern verified working in browser (all 13 manual steps passed)"
affects: [37-sidebar-decomposition, 38-unit-tests]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Lit presenter pattern: bee-map exposes only @property inputs and CustomEvent outputs; all app-level state owned by bee-atlas coordinator"
    - "Style factory closures: makeClusterStyleFn/makeSampleDotStyleFn/makeRegionStyleFn all use getter parameters; no module-level singletons"
    - "Source analysis tests: readFileSync in vitest to assert architectural invariants (no cross-imports) without mounting components"

key-files:
  created:
    - frontend/src/tests/bee-atlas.test.ts
  modified:
    - frontend/src/bee-map.ts
    - frontend/src/bee-atlas.ts
    - frontend/src/style.ts
    - frontend/src/filter.ts
    - frontend/src/region-layer.ts

key-decisions:
  - "bee-map updated() drives OL repaints (clusterSource.changed() + map.render()) when visibleEcdysisIds/visibleSampleIds properties change — Lit lifecycle is the synchronization boundary between coordinator state and OL canvas"
  - "filtered-summary-computed event emitted from bee-map.updated() when visibleEcdysisIds changes — keeps computation co-located with the specimenSource that holds the features"
  - "Source analysis tests (readFileSync) used for architectural invariant checks instead of full component mount — avoids DuckDB WASM / OL canvas happy-dom incompatibility"
  - "ARCH-03 tests broadened to also check no _restored* props in bee-map and no filterState module-level state in filter.ts — stronger invariant coverage"

patterns-established:
  - "Event emission helper: private _emit<T>(name, detail?) dispatches bubbles:true composed:true CustomEvent — all bee-map outputs use this single helper"
  - "updated() as OL repaint trigger: changedProperties.has checks drive layer visibility, source changes, view animation, and filter summary computation"

requirements-completed: [ARCH-01, ARCH-02, ARCH-03]

# Metrics
duration: 40min
completed: 2026-04-04
---

# Phase 36 Plan 02: bee-map Pure Presenter Summary

**bee-map.ts refactored to pure presenter with 9 @property inputs and 11 CustomEvent outputs; filter.ts/style.ts/region-layer.ts module-level singleton coupling fully removed; coordinator pattern verified in browser**

## Performance

- **Duration:** ~40 min
- **Started:** 2026-04-04T11:35:00Z
- **Completed:** 2026-04-04T12:15:00Z
- **Tasks:** 3 (2 auto + 1 human-verify checkpoint)
- **Files modified:** 6

## Accomplishments

- Refactored `bee-map.ts` from a self-contained component owning all app state into a pure presenter: replaced all `@state` properties with `@property({ attribute: false })` inputs (layerMode, boundaryMode, visibleEcdysisIds, visibleSampleIds, countyOptions, ecoregionOptions, viewState, panTo, filterState), removed `<bee-sidebar>` from render, removed all URL/filter/history management, and replaced all state mutations with composed CustomEvent emissions via `_emit()`
- Removed 722 lines from `bee-map.ts` while adding 220 lines of cleaner property-driven code; moved OL sources/layers to instance properties using factory style functions (`makeClusterStyleFn`, `makeSampleDotStyleFn`, `makeRegionStyleFn` with getter closures)
- Stripped `filter.ts` of all module-level mutable state (filterState singleton, visibleEcdysisIds, visibleSampleIds, setVisibleIds exports); removed old `clusterStyle`/`sampleDotStyle` functions and `filter.ts` import from `style.ts`; updated `makeRegionStyleFn` in `region-layer.ts` to accept a `getFilterState` getter instead of importing the singleton
- Created `frontend/src/tests/bee-atlas.test.ts` (108 lines) with tests for ARCH-01 (custom element registration), ARCH-02 (bee-map @property interface), and ARCH-03 (coordinator pattern isolation including source analysis invariants); all tests pass
- Human-verified full coordinator pattern in browser: map load, specimen/sample click, sidebar interaction, boundary mode toggle, county/taxon filter, URL copy-paste state restore, browser back/forward navigation, responsive layout

## Task Commits

1. **Task 1: Refactor bee-map to pure presenter + clean up style.ts, filter.ts, region-layer.ts** - `ee16699` (feat)
2. **Task 2: Create integration tests for ARCH-01, ARCH-02, ARCH-03** - `5608668` (feat)
3. **Task 3: Verify full coordinator pattern in browser** - human checkpoint (no commit — verification only)

## Files Created/Modified

- `frontend/src/bee-map.ts` — Converted from self-contained app component to pure presenter; @property inputs, CustomEvent outputs, updated() for OL synchronization, factory style functions, instance-property sources/layers
- `frontend/src/bee-atlas.ts` — Added `.filterState=${this._filterState}` binding and `@filtered-summary-computed` handler
- `frontend/src/style.ts` — Removed old `clusterStyle`/`sampleDotStyle` functions and `import { visibleEcdysisIds, visibleSampleIds } from './filter.ts'`
- `frontend/src/filter.ts` — Removed `filterState` singleton, `visibleEcdysisIds`, `visibleSampleIds`, `setVisibleIds`; kept `FilterState` interface, `isFilterActive`, `buildFilterSQL`, `queryVisibleIds`
- `frontend/src/region-layer.ts` — `makeRegionStyleFn` signature extended to accept `getFilterState: () => FilterState` getter; changed direct filterState singleton import to `import type { FilterState }`
- `frontend/src/tests/bee-atlas.test.ts` — New: integration tests for ARCH-01 (bee-atlas registration), ARCH-02 (bee-map properties), ARCH-03 (sibling isolation + structural invariants)

## Decisions Made

- `bee-map.updated()` is the synchronization boundary between coordinator-owned state and OL canvas repaints — `changedProperties.has()` checks drive `clusterSource.changed()`, layer visibility, view animation, and filtered-summary computation
- `filtered-summary-computed` event emitted from `updated()` co-locates summary computation with `specimenSource` (which holds the OL Features) rather than pushing feature iteration into bee-atlas
- Source analysis tests via `readFileSync` chosen over full component mounting — avoids DuckDB WASM and OL canvas incompatibility with happy-dom; provides reliable static analysis of import graph invariants
- ARCH-03 tests broadened beyond the plan spec to also check no `_restored*` props remain in bee-map and no module-level state remains in filter.ts — stronger structural coverage

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] ARCH-03 tests extended with filter.ts and _restored* invariant checks**
- **Found during:** Task 2 (test creation)
- **Issue:** Plan specified only import-graph checks for ARCH-03; additional structural invariants (no filter singleton state, no _restored* properties) were equally important architectural contracts that had been explicitly listed in the plan's "done" criteria but not captured in the test spec
- **Fix:** Added two extra test assertions to ARCH-03 test suite checking filter.ts has no `filterState` export and bee-map has no `_restored` properties
- **Files modified:** `frontend/src/tests/bee-atlas.test.ts`
- **Verification:** `npx vitest --run` — all tests pass
- **Committed in:** `5608668` (Task 2 commit)

---

**Total deviations:** 1 auto-added (1 missing critical test coverage — Rule 2)
**Impact on plan:** Strengthened test coverage. No scope change to implementation.

## Issues Encountered

None — TypeScript compiled without errors on first attempt, Vite build succeeded, all vitest tests passed, and browser verification confirmed all 13 manual steps.

## User Setup Required

None - no external service configuration required.

## Known Stubs

None — all coordinator wiring is complete. bee-atlas passes real state down to bee-map via properties and receives real data back via events. No placeholder values or hardcoded empty data flows to the UI.

## Threat Flags

None — pure structural refactor. No new network endpoints, auth paths, file access patterns, or schema changes. URL param parsing continues to use url-state.ts from Phase 35.

## Next Phase Readiness

- Coordinator pattern is complete and browser-verified: bee-atlas owns all app state, bee-map is a pure presenter, bee-sidebar is a sibling rendered by bee-atlas
- All three ARCH requirements (ARCH-01, ARCH-02, ARCH-03) have passing automated tests
- Phase 36 is complete; Phase 37 (Sidebar Decomposition) can begin — bee-sidebar is already a sibling component, making DECOMP-01/02/03/04 decomposition straightforward
- Phase 38 (Unit Tests) can build on the established vitest infrastructure and test patterns from this plan

---
*Phase: 36-bee-atlas-root-component*
*Completed: 2026-04-04*
