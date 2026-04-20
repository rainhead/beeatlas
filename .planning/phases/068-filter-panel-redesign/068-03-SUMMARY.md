---
phase: 068-filter-panel-redesign
plan: "03"
subsystem: ui
tags: [lit, web-components, filter, bee-filter-panel, bee-atlas]

requires:
  - phase: 068-01
    provides: bee-filter-panel.ts floating overlay component
  - phase: 068-02
    provides: bee-filter-controls.ts with localStorage recents removed

provides:
  - bee-atlas.ts wired to bee-filter-panel (floating overlay) instead of bee-filter-toolbar
  - bee-filter-toolbar import and template usage fully removed from bee-atlas
  - Updated test coverage for bee-filter-panel replacing toolbar tests

affects: [068-filter-panel-redesign, future filter changes]

tech-stack:
  added: []
  patterns:
    - "Floating filter panel inside .content (position: relative) with bee-filter-panel at position: absolute, cleared to the left of the Regions button via right: calc(0.5em + 6rem)"
    - "Pure presenter invariant maintained: bee-filter-panel placed as sibling to bee-map inside bee-atlas, not as a child of bee-map shadow DOM"

key-files:
  created: []
  modified:
    - frontend/src/bee-atlas.ts
    - frontend/src/tests/bee-filter-toolbar.test.ts

key-decisions:
  - "D-10 placement: bee-filter-panel placed inside .content div alongside bee-map, not as DOM child of bee-map, preserving pure presenter invariant"
  - "CSV download wired only on bee-table; bee-filter-panel does not receive @csv-download binding"
  - "bee-filter-panel right offset set to calc(0.5em + 6rem) to clear the Regions button"

patterns-established:
  - "Floating overlay controls live inside .content (position: relative) as siblings to the map, not inside the map component"

requirements-completed: []

duration: 15min
completed: 2026-04-20
---

# Phase 068 Plan 03: Wire bee-filter-panel into bee-atlas Summary

**bee-atlas.ts wired to floating bee-filter-panel overlay, bee-filter-toolbar removed from layout and imports, tests updated to cover the new panel component**

## Performance

- **Duration:** ~15 min
- **Tasks:** 3 (Task 1: swap toolbar for panel, Task 2: human-verify checkpoint, Task 3: update tests)
- **Files modified:** 2

## Accomplishments

- Replaced `<bee-filter-toolbar>` row (always-visible white bar above map) with `<bee-filter-panel>` floating overlay inside `.content`
- Removed `import './bee-filter-toolbar.ts'` and all `<bee-filter-toolbar>` template usage from `bee-atlas.ts`
- Added `bee-filter-panel { right: calc(0.5em + 6rem); }` CSS rule in `bee-atlas.ts` to position panel left of Regions button
- CSV download remains wired only on `bee-table`; `bee-filter-panel` does not receive `@csv-download`
- Updated `bee-filter-toolbar.test.ts` to cover `bee-filter-panel` property interface, source structure, localStorage removal verification, and bee-atlas integration
- All 159 tests pass

## Task Commits

1. **Task 1: Update bee-atlas.ts — swap toolbar for panel** - `389f755` (feat)
2. **Task 2: Checkpoint: human-verify** - auto-approved
3. **Task 3: Update test file — replace toolbar tests with panel tests** - `e72d357` (test)

## Files Created/Modified

- `frontend/src/bee-atlas.ts` — Replaced `bee-filter-toolbar` import/template with `bee-filter-panel`; added right-offset CSS rule; `@filter-changed` wired on panel; CSV remains on bee-table only
- `frontend/src/tests/bee-filter-toolbar.test.ts` — Replaced toolbar-specific tests with panel property, source structure, localStorage removal, and bee-atlas integration tests

## Decisions Made

- D-10 re-interpretation: "inside bee-map" in the design decision means visually overlaid on the map area, achieved by placing `<bee-filter-panel>` inside `.content` (which has `position: relative`) as a sibling to `<bee-map>`. Placing it as a DOM child of bee-map's shadow root would violate the pure presenter invariant.
- `right: calc(0.5em + 6rem)` chosen as a reliable clearance for the Regions button (~90px wide + 0.5em gap).

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Filter panel redesign (phase 068) is complete across all three plans
- bee-filter-panel floats over the map, bee-filter-toolbar is gone, tests cover the new structure
- No blockers for subsequent work

## Self-Check

- [x] `frontend/src/bee-atlas.ts` contains `import './bee-filter-panel.ts'`
- [x] `frontend/src/bee-atlas.ts` does NOT contain `import './bee-filter-toolbar.ts'`
- [x] `frontend/src/bee-atlas.ts` contains `bee-filter-panel` CSS rule with `right:` value
- [x] `frontend/src/tests/bee-filter-toolbar.test.ts` contains `BeeFilterPanel`
- [x] All 159 tests pass
- [x] Task 1 commit `389f755` exists
- [x] Task 3 commit `e72d357` exists

## Self-Check: PASSED

---
*Phase: 068-filter-panel-redesign*
*Completed: 2026-04-20*
