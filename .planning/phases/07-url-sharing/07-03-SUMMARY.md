---
phase: 07-url-sharing
plan: "03"
subsystem: frontend
tags: [url-sync, history-api, openlayers, popstate]

requires:
  - phase: 07-url-sharing
    provides: [url-state-sync, history-navigation]
provides:
  - functional back-button navigation through settled map view history
affects: [bee-map.ts]

tech-stack:
  added: []
  patterns: [map.once('moveend') for deferred flag reset after programmatic OL view change]

key-files:
  created: []
  modified:
    - frontend/src/bee-map.ts

key-decisions:
  - "Use map.once('moveend') to reset _isRestoringFromHistory after OL fires the programmatic moveend, not in a synchronous finally block"
  - "Synchronous fallback: if parsed view matches current view (no change), reset flag immediately since OL won't fire moveend"

patterns-established:
  - "OL async pattern: view.setCenter/setZoom trigger moveend asynchronously — any flag that must stay true through that event must be reset in map.once('moveend'), not synchronously after the set call"

requirements-completed: [NAV-01]

duration: 2min
completed: 2026-03-09
---

# Phase 07 Plan 03: Back Button Fix Summary

**Back button navigation fixed by deferring _isRestoringFromHistory reset to map.once('moveend') callback instead of a synchronous finally block**

## Performance

- **Duration:** ~2 min
- **Started:** 2026-03-10T02:58:48Z
- **Completed:** 2026-03-10T03:00:30Z
- **Tasks:** 1
- **Files modified:** 1

## Accomplishments

- Fixed root cause of broken back button: `_isRestoringFromHistory` was reset synchronously before OpenLayers fired the `moveend` event triggered by `setCenter()`/`setZoom()`
- The `moveend` handler's guard (`if (this._isRestoringFromHistory) return`) was therefore bypassed, causing `_pushUrlState()` → `pushState()` to run after every back navigation, pushing a new forward entry that cancelled the navigation
- Replaced `try/finally` in `_onPopState` with `map.once('moveend', ...)` registered before the view update calls, plus a synchronous fallback for the no-view-change case

## Task Commits

Each task was committed atomically:

1. **Task 1: Fix _onPopState to reset _isRestoringFromHistory after OL moveend** - `4c4ae65` (fix)

**Plan metadata:** (pending)

## Files Created/Modified

- `frontend/src/bee-map.ts` - Replaced `_onPopState` try/finally with `map.once('moveend')` deferred reset

## Decisions Made

- Register `map.once('moveend')` BEFORE calling `setCenter`/`setZoom` so the listener is guaranteed to fire for that specific programmatic move
- No try/finally needed — the event callback is the reset mechanism
- Synchronous fallback handles the edge case where view coordinates are identical (OL won't fire `moveend` if the view doesn't actually change)

## Deviations from Plan

None - plan executed exactly as written. The plan already specified the precise fix including the synchronous fallback for the no-view-change case.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Back button should now correctly navigate through settled map view history (browser verification needed in 07-05 checkpoint)
- Scenarios A-E (default load, pan/zoom URL update, copy/paste round-trip, taxon filter, year filter) are unaffected — the flag guard logic is unchanged, only the reset timing changed

---

## Self-Check: PASSED

- frontend/src/bee-map.ts: FOUND (modified)
- Commit 4c4ae65 (Task 1): FOUND
- `map.once('moveend'` present in bee-map.ts: line 213
- `_isRestoringFromHistory = false` inside moveend callback: line 214
- No `finally` block in _onPopState (only appears in comment): verified
- TypeScript compiles cleanly: exit 0
- Vite production build succeeds

---
*Phase: 07-url-sharing*
*Completed: 2026-03-09*
