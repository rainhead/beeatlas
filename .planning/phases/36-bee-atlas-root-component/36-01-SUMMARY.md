---
phase: 36-bee-atlas-root-component
plan: 01
subsystem: ui
tags: [typescript, lit, custom-element, coordinator-pattern, vitest, style-factory]

# Dependency graph
requires:
  - phase: 35-url-state-module
    provides: "Pure url-state.ts module with buildParams/parseParams"
  - phase: 32-sql-filter-layer
    provides: "queryVisibleIds, FilterState, setVisibleIds from filter.ts"
provides:
  - "bee-atlas.ts — root coordinator LitElement owning all app-level state"
  - "makeClusterStyleFn and makeSampleDotStyleFn factory functions in style.ts"
  - "vitest + happy-dom test infrastructure installed"
  - "index.html updated to load bee-atlas.ts and render <bee-atlas>"
affects: [36-02-bee-map-presenter, future-test-plans]

# Tech tracking
tech-stack:
  added: [vitest, happy-dom]
  patterns:
    - "Lit coordinator pattern: bee-atlas owns all @state, renders children with .prop bindings and @event handlers"
    - "Style factory closures: makeClusterStyleFn/makeSampleDotStyleFn accept getter parameters for bee-atlas state"
    - "vitest passWithNoTests: true — test suite passes before any test files exist"

key-files:
  created:
    - frontend/src/bee-atlas.ts
  modified:
    - frontend/src/style.ts
    - frontend/index.html
    - frontend/package.json
    - frontend/vite.config.ts

key-decisions:
  - "bee-atlas does NOT import OpenLayers — all OL code stays in bee-map; bee-atlas imports only filter.ts, url-state.ts, duckdb.ts, and bee-sidebar.ts types"
  - "Old clusterStyle/sampleDotStyle functions kept in style.ts for backward compatibility during Plan 01 transition; Plan 02 will remove them"
  - "vitest passWithNoTests: true added to vite.config.ts test block — avoids false failure before test files are written"
  - "_dataLoaded @state removed — redundant with _loading; _onDataLoaded simply sets _loading = false"
  - "bee-atlas emits DuckDB init errors directly to _error/@state rather than going through bee-map data-error event"

patterns-established:
  - "Coordinator pattern: root component owns state, passes down via properties, receives events — bee-map and bee-sidebar have no direct reference to each other"
  - "Style factory pattern matches makeRegionStyleFn in region-layer.ts — getters passed as closures"

requirements-completed: [ARCH-01, ARCH-03]

# Metrics
duration: 4min
completed: 2026-04-04
---

# Phase 36 Plan 01: bee-atlas Root Component Summary

**`<bee-atlas>` coordinator LitElement created with full app-level state ownership, factory-based style.ts, vitest infrastructure, and updated HTML entry point**

## Performance

- **Duration:** ~4 min
- **Started:** 2026-04-04T00:00:00Z
- **Completed:** 2026-04-04T00:04:00Z
- **Tasks:** 2
- **Files modified:** 5

## Accomplishments
- Created `frontend/src/bee-atlas.ts` (491 lines) as `@customElement('bee-atlas')` coordinator with 19 `@state` properties, `firstUpdated()` with DuckDB init and URL parsing, all event handlers, `_pushUrlState()`, `_onPopState`, and `render()` composing `<bee-map>` and `<bee-sidebar>`
- Added `makeClusterStyleFn` and `makeSampleDotStyleFn` factory functions to `style.ts` — accept getter parameters instead of module-level globals, matching `makeRegionStyleFn` pattern
- Installed `vitest` + `happy-dom`, added `test` script to `package.json`, added test block to `vite.config.ts` with `passWithNoTests: true`
- Updated `index.html` to load `bee-atlas.ts` and render `<bee-atlas>` instead of `<bee-map>`

## Task Commits

1. **Task 1: Install vitest + happy-dom, add style factory functions** - `79247d3` (feat)
2. **Task 2: Create bee-atlas.ts coordinator and update index.html** - `dfc3fa1` (feat)

## Files Created/Modified
- `frontend/src/bee-atlas.ts` — New root coordinator: all app state, DuckDB init, URL management, event coordination
- `frontend/src/style.ts` — Added `makeClusterStyleFn` and `makeSampleDotStyleFn` factory functions; old functions retained
- `frontend/index.html` — Script src changed to `bee-atlas.ts`; `<bee-map>` changed to `<bee-atlas>`
- `frontend/package.json` — Added `test` script; vitest + happy-dom in devDependencies
- `frontend/vite.config.ts` — Added `test: { environment: 'happy-dom', passWithNoTests: true }`

## Decisions Made
- `bee-atlas` does not import OpenLayers — all OL code stays in `bee-map`; bee-atlas is framework-agnostic coordinator
- Old `clusterStyle`/`sampleDotStyle` kept for backward compatibility during Plan 01 transition; Plan 02 will remove them when bee-map switches to factories
- `vitest passWithNoTests: true` prevents false failure before any test files are written
- Removed `_dataLoaded` @state as redundant — `_loading = false` in `_onDataLoaded` is sufficient
- `_isRestoringFromHistory` reset in `_onViewMoved` handler after bee-map reports the view has settled (rather than in `map.once('moveend')` — bee-map will emit the event through the coordinator boundary)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Removed unused `_dataLoaded` @state and `AppState` import**
- **Found during:** Task 2 (TypeScript compile check)
- **Issue:** `tsc --noEmit` reported `TS6133: '_dataLoaded' is declared but its value is never read` and `'AppState' is declared but its value is never read`
- **Fix:** Removed the `_dataLoaded` @state property (and its setter in `_onDataLoaded`) and removed the `type AppState` import from url-state.ts
- **Files modified:** `frontend/src/bee-atlas.ts`
- **Verification:** `tsc --noEmit` exits 0
- **Committed in:** `dfc3fa1` (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (1 unused variable — Rule 1)
**Impact on plan:** Trivial cleanup. No scope change.

## Issues Encountered
None.

## Known Stubs
None — bee-atlas.ts contains no placeholder data. All state is initialized to proper empty defaults (null, empty Set, empty array). The component is incomplete in the sense that bee-map still owns its old structure (Plan 02 will refactor it), but this is intentional per plan design — not a stub.

## Threat Flags
None — pure structural refactor; no new network endpoints, auth paths, or trust boundary changes. URL param parsing reuses url-state.ts from Phase 35 (already validated).

## Next Phase Readiness
- `bee-atlas.ts` is ready as the coordinator skeleton; Plan 02 will refactor `bee-map.ts` to be a pure presenter by adding `@property` declarations and emitting events upward
- `makeClusterStyleFn`/`makeSampleDotStyleFn` ready for Plan 02 to wire into bee-map layers
- TypeScript compiles clean; Vite build succeeds; vitest passes with no test files
- The app does NOT work in the browser yet — bee-map still renders its own sidebar and owns its own state; that is the expected transitional state per plan design

---
*Phase: 36-bee-atlas-root-component*
*Completed: 2026-04-04*
