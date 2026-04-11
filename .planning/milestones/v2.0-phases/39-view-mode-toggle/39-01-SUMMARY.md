---
phase: 39-view-mode-toggle
plan: 01
subsystem: ui
tags: [url-state, typescript, vitest, view-mode]

# Dependency graph
requires: []
provides:
  - "UiState.viewMode field ('map' | 'table') in url-state.ts"
  - "buildParams emits view=table when viewMode is table; omits param when map"
  - "parseParams reads view param with ternary whitelist; defaults to map"
  - "parseParams condition updated to populate result.ui for table-only URLs"
  - "4 new viewMode round-trip tests in url-state.test.ts"
affects: [39-02-toggle-component, 39-03-table-view]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "URL param default-omit: emit param only when non-default; absence means default"
    - "Ternary whitelist for URL param parsing: only exact match produces non-default; all other values silently become default"

key-files:
  created: []
  modified:
    - frontend/src/url-state.ts
    - frontend/src/tests/url-state.test.ts
    - frontend/src/bee-atlas.ts

key-decisions:
  - "viewMode defaults to 'map'; view param is omitted from URL when map (same pattern as lm/bm)"
  - "parseParams condition for result.ui includes || viewMode !== 'map' so table-only URLs (view=table, no lm/bm) correctly populate result.ui"
  - "bee-atlas.ts buildParams call sites pass viewMode: 'map' hardcoded (Plan 02 will introduce _viewMode state and wire the toggle)"

patterns-established:
  - "URL param default-omit: emit param only for non-default values; parseParams defaults when param absent"
  - "Ternary whitelist for untrusted URL params: viewRaw === 'table' ? 'table' : 'map' — rejects arbitrary strings silently"

requirements-completed: [VIEW-03]

# Metrics
duration: 15min
completed: 2026-04-07
---

# Phase 39 Plan 01: URL State viewMode Extension Summary

**UiState.viewMode ('map'|'table') added to url-state.ts with buildParams default-omit serialization, parseParams ternary-whitelist parsing, and 4 new round-trip tests (67 total passing)**

## Performance

- **Duration:** ~15 min
- **Started:** 2026-04-07T19:11Z
- **Completed:** 2026-04-07T19:15Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments
- `UiState` interface extended with `viewMode: 'map' | 'table'` — TypeScript enforces correct usage at all call sites
- `buildParams` emits `view=table` when viewMode is table; omits param entirely when map (default-omit pattern consistent with lm/bm)
- `parseParams` reads `view` param with ternary whitelist; condition expanded to `|| viewMode !== 'map'` so table-only URLs populate `result.ui`
- 4 new viewMode tests added (round-trip, default-omit, invalid param, table-only URL); 67/67 tests green

## Task Commits

Each task was committed atomically:

1. **Task 1: Extend UiState and url serialization for viewMode** - `f4c4b56` (feat)
2. **Task 2: Extend url-state.test.ts with viewMode round-trip tests** - `542576c` (feat)

## Files Created/Modified
- `frontend/src/url-state.ts` - Added viewMode to UiState; buildParams emits view=table; parseParams parses view param
- `frontend/src/tests/url-state.test.ts` - Updated defaultUi and existing inline ui objects; added 4 new viewMode tests
- `frontend/src/bee-atlas.ts` - Fixed two buildParams call sites to include viewMode: 'map' (TypeScript compliance)

## Decisions Made
- `viewMode` defaults to `'map'`; `view` param omitted from URL when map — consistent with existing lm/bm default-omit pattern
- `parseParams` condition expanded to `|| viewMode !== 'map'` to handle table-only URLs where no lm/bm params are present
- `bee-atlas.ts` call sites pass `viewMode: 'map'` as hardcoded default — Plan 02 will introduce `_viewMode` state and wire the toggle

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed TypeScript compilation errors in bee-atlas.ts and existing test objects**
- **Found during:** Task 2 (test extension — TypeScript check revealed errors)
- **Issue:** Adding `viewMode` as required to `UiState` caused type errors at two `buildParams` call sites in `bee-atlas.ts` (lines 216 and 263) and at two inline `ui` object literals in `url-state.test.ts` (layerMode=samples test, boundaryMode=counties test)
- **Fix:** Added `viewMode: 'map'` to bee-atlas.ts call sites; added `viewMode: 'map' as const` to the two existing test inline objects
- **Files modified:** `frontend/src/bee-atlas.ts`, `frontend/src/tests/url-state.test.ts`
- **Verification:** `npx tsc --noEmit` passes; 67/67 tests green
- **Committed in:** `542576c` (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (Rule 1 - TypeScript type errors from required field addition)
**Impact on plan:** Required fix — adding a required field to an interface mandates updating all existing call sites. No scope creep.

## Issues Encountered
- Vitest was initially run from the main project directory (`/Users/rainhead/dev/beeatlas/frontend`) instead of the worktree directory, showing 63 tests (not picking up the worktree's modified test file). Running from the correct worktree path showed 67 tests as expected.

## Threat Surface Scan
No new network endpoints, auth paths, file access patterns, or schema changes. The `view` param in `parseParams` follows existing ternary-whitelist pattern (T-39-01-01 mitigated as planned — only `'table'` produces non-default; all other values silently become `'map'`).

## Next Phase Readiness
- `UiState.viewMode` is now part of the TypeScript contract — Plan 02 (toggle component) can add `_viewMode` state to `bee-atlas.ts` and pass it through
- URL round-trip is verified: navigating to `?view=table` will restore table mode once Plan 02 wires up the state
- `bee-atlas.ts` call sites currently hardcode `viewMode: 'map'` — Plan 02 replaces these with `this._viewMode`

---
*Phase: 39-view-mode-toggle*
*Completed: 2026-04-07*
