---
phase: 146-debounce-url-updates-when-zooming-and-panning-the-map
plan: 01
subsystem: ui
tags: [history-api, url-state, mapbox, lit, vitest]

# Dependency graph
requires:
  - phase: 144-map-init-race-fix
    provides: _filterResolving guard and _isRestoringFromHistory guard in bee-atlas.ts
provides:
  - Session-coalesced viewport history in <bee-atlas>: one pushState per exploration session,
    replaceState for subsequent moves, session reset on non-viewport writes and popstate
affects: [url-state, bee-atlas, history]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Session-active flag (_viewportSessionActive) on the coordinator element gates pushState vs replaceState"
    - "Non-viewport URL writes reset the session flag inside _replaceUrlState() — single-site coverage of all ~16 callers"
    - "Viewport history path writes replaceState directly (bypassing _replaceUrlState()) to avoid self-cancelling the session flag"

key-files:
  created: []
  modified:
    - src/bee-atlas.ts
    - src/tests/bee-atlas.test.ts

key-decisions:
  - "Simplified to immediate pushState (no 500ms debounce) — the session flag, not a timer, bounds entry count (Claude's Discretion)"
  - "Removed _mapMoveDebounce entirely — all four references cleaned up consistently"
  - "Tests bypass DOM mounting (no document.createElement) to avoid firstUpdated lifecycle polluting spy counts — instantiate BeeAtlas directly via new"

patterns-established:
  - "Session-active flag for URL history coalescing: first move pushes, subsequent moves in session replace; non-viewport writes reset flag"

requirements-completed: []

# Metrics
duration: 6min
completed: 2026-06-09
---

# Phase 146 Plan 01: Session-Coalesced Viewport History Summary

**Session-coalesced viewport→history writes in `<bee-atlas>`: entire pan/zoom exploration produces one pushState; any filter/selection/UI action resets the session flag so the next exploration starts a fresh entry**

## Performance

- **Duration:** ~6 min
- **Started:** 2026-06-09T18:33:00Z
- **Completed:** 2026-06-09T18:39:17Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments

- Added `_viewportSessionActive` boolean field on `<bee-atlas>` (D-02)
- Replaced `_pushUrlStateDebounced()` with `_writeViewportHistory()`: pushState on session start, replaceState on subsequent settled moves, `_filterResolving` guard preserved (D-02/D-04/D-05)
- `_replaceUrlState()` resets `_viewportSessionActive = false` so every non-viewport write (filter/selection/boundary/pane/source — ~16 call sites) ends the current exploration session without per-call-site code (D-03)
- `_onPopState` resets `_viewportSessionActive = false` so the next user pan/zoom after back/forward starts a fresh entry (D-07); `_isRestoringFromHistory` guard in `_onViewMoved` preserved (D-06)
- Removed `_mapMoveDebounce` timer entirely (simplified to immediate push; flag bounds entry count)
- 7 new behavioral + source-text tests covering D-01 through D-07

## Task Commits

1. **Task 1: Session-coalesce viewport history writes in `<bee-atlas>`** - `c170086` (feat)
2. **Task 2: Tests proving session-coalescing and preserved guards** - `dc0fc81` (test)

**Plan metadata:** committed below (docs)

## Files Created/Modified

- `src/bee-atlas.ts` — Added `_viewportSessionActive` field; replaced `_pushUrlStateDebounced` with `_writeViewportHistory`; added session-reset to `_replaceUrlState` and `_onPopState`; removed `_mapMoveDebounce`
- `src/tests/bee-atlas.test.ts` — Added `describe('146: session-coalesced viewport history')` with 7 tests for cases 1–4

## Decisions Made

- Simplified to immediate pushState (no 500ms debounce timer) — Claude's Discretion said either was acceptable; the FLAG, not a timer, bounds history entry count. Cleaner code and simpler tests.
- Removed `_mapMoveDebounce` entirely (field declaration, `disconnectedCallback` cleanup, `_onPopState` clear, `_pushUrlStateDebounced` internal use) — all four references cleaned up consistently.
- Tests instantiate `BeeAtlas` directly via `new mod.BeeAtlas()` rather than `document.createElement('bee-atlas')` to avoid Lit lifecycle side effects polluting spy call counts.

## Deviations from Plan

None — plan executed exactly as written. Claude's Discretion choice (remove debounce timer, immediate push) was within the explicitly authorized range.

## Issues Encountered

- Initial test attempt mounted `<bee-atlas>` in DOM via `document.createElement`, causing Lit `firstUpdated` to call `_replaceUrlState()` asynchronously, polluting spy counts. Fixed by instantiating directly via `new BeeAtlas()` without DOM attachment.

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness

- Phase 146 plan complete. The back-button now accumulates one entry per exploration session rather than one per settled gesture. The URL still always reflects the current viewport.
- No regressions to `_filterResolving` (D-05) or `_isRestoringFromHistory` (D-06) guards; `src/bee-map.ts` and `src/url-state.ts` untouched.

---
*Phase: 146-debounce-url-updates-when-zooming-and-panning-the-map*
*Completed: 2026-06-09*
