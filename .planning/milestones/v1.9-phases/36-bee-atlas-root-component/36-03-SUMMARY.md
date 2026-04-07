---
phase: 36-bee-atlas-root-component
plan: 03
subsystem: ui
tags: [typescript, lit, openlayers, click-handler, ux]

# Dependency graph
requires:
  - phase: 36-bee-atlas-root-component
    plan: 02
    provides: "bee-map.ts as pure presenter with click event handlers"
provides:
  - "bee-map.ts click handler uses OL 'click' event with dragging guard (no 250ms singleclick delay)"
  - "buildTaxaOptions() filters bare-genus scientificNames that duplicate '(genus)' entries"
affects: [37-sidebar-decomposition, 38-unit-tests]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Use OL 'click' event with event.dragging guard instead of 'singleclick' for immediate response"
    - "Filter species list to exclude single-word names already in genera Set"

key-files:
  created: []
  modified:
    - frontend/src/bee-map.ts

key-decisions:
  - "OL 'click' + dragging guard is equivalent to 'singleclick' behavior for normal clicks but without the 250ms double-click disambiguation wait"
  - "Bare-genus filter: !v.includes(' ') && genera.has(v) precisely identifies genus-only scientificName values that duplicate '(genus)' entries"

patterns-established: []

requirements-completed: [ARCH-01]

# Metrics
duration: 10min
completed: 2026-04-06
---

# Phase 36 Plan 03: UAT Gap Closure (click delay + taxon filter duplicates) Summary

**Eliminated 250ms OL singleclick delay and removed bare-genus duplicate entries from taxon filter dropdown**

## Performance

- **Duration:** ~10 min
- **Started:** 2026-04-06T19:45:00Z
- **Completed:** 2026-04-06T19:55:00Z
- **Tasks:** 2
- **Files modified:** 1

## Accomplishments

- Changed `map.on('singleclick', ...)` to `map.on('click', ...)` with `if (event.dragging) return` guard in `bee-map.ts firstUpdated()` — sample dot clicks are now near-instant instead of delayed 250ms
- Added `.filter(v => !(genera.has(v) && !v.includes(' ')))` to the species list in `buildTaxaOptions()` — genus-only scientificName values (e.g. "Bombus") are suppressed since they are already represented by "Bombus (genus)" entries
- TypeScript compiles clean; all 61 Vitest tests pass

## Task Commits

1. **Task 1: Switch singleclick to click with dragging guard** - `6548554` (fix)
2. **Task 2: Fix bare-genus labels in taxon filter options** - `6548554` (fix, same commit)

## Files Created/Modified

- `frontend/src/bee-map.ts` — Click handler event name changed to 'click' + dragging guard added; species filter clause added to buildTaxaOptions

## Decisions Made

- Tasks 1 and 2 committed together (single file, two-line changes, logically related UX fixes)
- `event.dragging` guard chosen over `event.pointerType` check — dragging is the canonical OL idiom to prevent accidental activation during map pans

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None — TypeScript compiled clean on first attempt and all 61 tests passed.

## User Setup Required

None - no external service configuration required.

## Known Stubs

None.

## Threat Flags

None — UX-only fix. No new network endpoints, auth paths, data flows, or schema changes.

## Next Phase Readiness

- UAT gaps 1 and 2 closed; bee-map.ts click behavior and taxon filter are correct
- Plan 04 (UAT gap 3) can proceed independently
- Phase 37 (Sidebar Decomposition) and Phase 38 (Unit Tests) unaffected

---
*Phase: 36-bee-atlas-root-component*
*Completed: 2026-04-06*
