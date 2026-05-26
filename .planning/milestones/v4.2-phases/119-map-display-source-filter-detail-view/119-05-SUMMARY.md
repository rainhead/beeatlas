---
phase: 119-map-display-source-filter-detail-view
plan: "05"
subsystem: ui
tags: [lit, web-components, occurrence-detail, inat, rendering]

# Dependency graph
requires:
  - phase: 119-01
    provides: OccurrenceRow extended with source, image_url, obs_url, user_login, license fields

provides:
  - _renderInatObs method in BeeOccurrenceDetail renders iNat expert obs detail card
  - render() dispatch routes source=inat_obs rows to _renderInatObs (not sample-only fallback)
  - .event-host CSS class for floral host display

affects: [119-06, future occurrence detail plans]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Three-branch nonSpecimen dispatch: isProvisional > source=inat_obs > sample-only fallback"
    - "CC license gate: row.license.toUpperCase().startsWith('CC') before rendering <img>"
    - "Lit html template null-guarding: conditional rendering with ternary and empty string"

key-files:
  created: []
  modified:
    - src/bee-occurrence-detail.ts

key-decisions:
  - "Combined Task 1 + Task 2 implementation before committing Task 1 due to TypeScript noUnusedLocals: private class method triggers TS6133 when defined but not yet called; implemented dispatch wiring immediately so tsc stays clean across both commits"
  - "Inline image style (width:100%;max-height:200px;object-fit:cover;border-radius:4px) per PATTERNS.md — no CSS class analog exists in the component"
  - "iNat branch sits BETWEEN isProvisional and isSampleOnly so provisional rows still route to _renderProvisional even when source=inat_obs"

patterns-established:
  - "CC license check: row.license != null && row.license.toUpperCase().startsWith('CC') — case-insensitive, null-safe"
  - "Alt text fallback chain: row.scientificName ?? 'bee' and row.user_login ?? 'observer'"

requirements-completed: [DET-01]

# Metrics
duration: 2min
completed: 2026-05-26
---

# Phase 119 Plan 05: iNat Expert Obs Detail Card Summary

**_renderInatObs method added to BeeOccurrenceDetail with CC-gated image, null-guarded observer/host fields, and three-branch dispatch routing source=inat_obs rows away from sample-only fallback**

## Performance

- **Duration:** 2 min
- **Started:** 2026-05-26T06:12:46Z
- **Completed:** 2026-05-26T06:15:02Z
- **Tasks:** 2
- **Files modified:** 1

## Accomplishments

- Added `_renderInatObs(row)` private method rendering: date (roman format), observer login (when non-null), floral host in italics (when non-null), image (only when license starts with CC and image_url non-null), iNat observation link (when obs_url non-null)
- Extended `render()` dispatch with three-branch ternary: isProvisional -> _renderProvisional ; source==='inat_obs' -> _renderInatObs ; else -> _renderSampleOnly
- Added `.event-host` CSS class matching `.event-observer` sizing/color
- DET-01 source-inspection tests: both passing

## Task Commits

1. **Task 1: Add _renderInatObs(row) method** - `ef990f3` (feat)
2. **Task 2: Extend render() dispatch** - `31bc5a3` (feat)

## Files Created/Modified

- `src/bee-occurrence-detail.ts` - Added `.event-host` CSS rule, `_renderInatObs` method, updated `nonSpecimen.map` dispatch from 2-branch to 3-branch ternary

## Decisions Made

- Implemented Task 2 (dispatch wiring) before committing Task 1 because TypeScript `noUnusedLocals: true` treats unused private methods as TS6133 errors. The method was defined but never called until Task 2, so both were implemented before the first commit to keep tsc clean throughout. Committed as two sequential commits (Task 1 body, Task 2 dispatch) with git's patch staging.
- Used inline image style per PATTERNS.md guidance; no analogous CSS class existed in the component.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Deferred Task 1 commit until Task 2 was implemented**

- **Found during:** Task 1 (add _renderInatObs method)
- **Issue:** `noUnusedLocals: true` in tsconfig.json caused TS6133 for the new private method before Task 2 wired the call site. Plan expected tsc to pass after Task 1 alone ("the method is fine because it is a class member, not a local") but TypeScript does enforce TS6133 on private methods.
- **Fix:** Implemented both Task 1 and Task 2 changes before making any commits, then committed them as two separate git commits using git's patch staging mode.
- **Files modified:** src/bee-occurrence-detail.ts
- **Verification:** `npx tsc --noEmit` exits 0 after both commits
- **Committed in:** ef990f3 (Task 1 commit), 31bc5a3 (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** No scope change; both commits are clean and match plan intent.

## Issues Encountered

None beyond the tsc deviation documented above.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- DET-01 satisfied at the rendering layer
- iNat obs rows no longer silently fall through to sample-only rendering
- Pre-existing tests unchanged; 10 pre-existing failures in MAP-01/MAP-02 (bee-map amber color, bee-atlas/bee-pane source filter wiring) remain for their respective plans

---

*Phase: 119-map-display-source-filter-detail-view*
*Completed: 2026-05-26*
