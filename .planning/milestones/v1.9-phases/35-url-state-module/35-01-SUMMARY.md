---
phase: 35-url-state-module
plan: 01
subsystem: ui
tags: [typescript, url-state, refactor, bee-map]

# Dependency graph
requires:
  - phase: 32-sql-filter-layer
    provides: "DuckDB WASM filter layer and filterState global singleton in filter.ts"
provides:
  - "Pure url-state.ts module with ViewState, SelectionState, UiState, AppState types"
  - "buildParams() and parseParams() exported from url-state.ts"
  - "bee-map.ts delegates URL serialization/deserialization entirely to url-state.ts"
affects: [36-url-ownership, bee-atlas-component]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Pure TypeScript URL state module — no Lit/OL/DOM imports; accepts sub-type arguments"
    - "parseParams returns Partial<AppState> with optional chaining at call sites for defaults"

key-files:
  created:
    - frontend/src/url-state.ts
  modified:
    - frontend/src/bee-map.ts

key-decisions:
  - "parseParams returns Partial<AppState> (not ParsedParams with defaults applied) — defaults stay in bee-map.ts per D-05"
  - "buildParams takes four separate sub-type arguments (view, filter, selection, ui) rather than assembled AppState — matches existing call sites"
  - "UI sub-object omitted from parseParams return when all values are defaults (specimens/off) — clean URLs"

patterns-established:
  - "url-state.ts pattern: pure TS module, import type only from filter.ts, no component/DOM deps"
  - "Caller applies defaults after parseParams: parsed.view?.lon ?? DEFAULT_LON"

requirements-completed: [URL-01]

# Metrics
duration: 15min
completed: 2026-04-04
---

# Phase 35 Plan 01: URL State Module Summary

**Pure `url-state.ts` module extracts URL serialization from `bee-map.ts`, exporting typed `buildParams`/`parseParams` functions with zero component dependencies**

## Performance

- **Duration:** ~15 min
- **Started:** 2026-04-04T00:00:00Z
- **Completed:** 2026-04-04T00:15:00Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments
- Created `frontend/src/url-state.ts` as a pure TypeScript module with no Lit, OL, or DOM API imports
- Exported `ViewState`, `SelectionState`, `UiState`, `AppState` interfaces and `buildParams`/`parseParams` functions
- Refactored `bee-map.ts` to remove `ParsedParams`, `buildSearchParams`, and `parseUrlParams` entirely
- All URL call sites updated to use new module functions; build is clean with no TypeScript errors

## Task Commits

Each task was committed atomically:

1. **Task 1: Create url-state.ts pure module** - `113f12b` (feat)
2. **Task 2: Refactor bee-map.ts to use url-state.ts** - `ae0e19e` (refactor)

**Plan metadata:** (docs commit below)

## Files Created/Modified
- `frontend/src/url-state.ts` — New pure TS module: ViewState, SelectionState, UiState, AppState, buildParams, parseParams
- `frontend/src/bee-map.ts` — Removed inline ParsedParams/buildSearchParams/parseUrlParams; imports from url-state.ts

## Decisions Made
- `parseParams` returns `Partial<AppState>` with sub-objects only present when their params exist in the URL — callers apply defaults via `??` at the usage site. This keeps defaults (DEFAULT_LON/LAT/ZOOM) in bee-map.ts per plan directive D-05.
- `buildParams` takes four separate sub-type arguments rather than a single assembled AppState — matches call sites naturally without constructing intermediate objects.
- The `ui` sub-object is omitted from `parseParams` return when all UI values are at defaults (layerMode='specimens', boundaryMode='off') — consistent with the URL encoding convention of omitting default values.

## Deviations from Plan

The worktree's bee-map.ts differed from the plan's line number references — it reflected Phase 34 changes where `filterState` became a module-level global (exported from filter.ts) rather than a class property. All edits were adapted accordingly. The refactor logic was identical; only the access patterns changed (`filterState.x` vs `this.filterState.x`).

None of these were correctness deviations — the plan's intent was fully realized.

## Issues Encountered
None.

## Known Stubs
None — all URL serialization and deserialization is fully wired.

## Threat Flags
None — pure internal refactor with no new network endpoints, auth paths, or trust boundary changes.

## Next Phase Readiness
- `url-state.ts` module ready for Phase 36 (URL ownership transfer to `<bee-atlas>` component)
- `_restored*` properties remain in bee-map.ts as intended — Phase 36 will eliminate them
- Build is clean; no blockers

---
*Phase: 35-url-state-module*
*Completed: 2026-04-04*
