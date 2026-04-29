---
phase: 070-map-overlay-sidebar
plan: "01"
subsystem: ui
tags: [lit, css, overlay, position-absolute, shadow-dom]

# Dependency graph
requires:
  - phase: 069-filter-panel-overlay
    provides: "bee-filter-panel position: absolute overlay pattern inside .content"
provides:
  - "bee-sidebar rendered as position: absolute right-edge overlay; map always full-width"
  - "'Selected specimens' label in sidebar header"
  - "Drop shadow on sidebar panel consistent with filter panel"
affects: [070-map-overlay-sidebar]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Overlay panel pattern: :host { position: absolute; z-index: 1 } on component; right/top/bottom positioning in bee-atlas CSS"

key-files:
  created: []
  modified:
    - frontend/src/bee-sidebar.ts
    - frontend/src/bee-atlas.ts

key-decisions:
  - "bee-sidebar :host position: absolute follows identical pattern to bee-filter-panel; bee-atlas CSS supplies directional offsets"
  - "top: calc(0.5em + 2.5rem + 2.5rem + 0.5em) clears both header bar and filter button with gap above and between"
  - "overflow-y: auto retained on :host so overlay panel scrolls independently of map"
  - "Portrait @media (max-aspect-ratio: 1) bee-sidebar rule left unchanged — flex sibling layout preserved on portrait screens"

patterns-established:
  - "Overlay panel: component sets position: absolute; z-index: 1 on :host; bee-atlas CSS provides right/top/bottom positioning values"

requirements-completed: []

# Metrics
duration: 8min
completed: 2026-04-21
---

# Phase 70 Plan 01: Map Overlay Sidebar Summary

**bee-sidebar converted to position: absolute right-edge overlay with 'Selected specimens' header, map stays full-width on desktop**

## Performance

- **Duration:** ~8 min
- **Started:** 2026-04-21T18:05:00Z
- **Completed:** 2026-04-21T18:13:09Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments
- bee-sidebar now self-declares as `position: absolute; z-index: 1` on `:host`, matching the bee-filter-panel overlay pattern
- bee-atlas CSS `bee-sidebar` rule replaced: flex-shrink/border-left/overflow-y/scrollbar-gutter removed; right/top/width/bottom overlay offsets added
- Sidebar `top` value `calc(0.5em + 2.5rem + 2.5rem + 0.5em)` clears the header bar (2.5rem) + filter button (2.5rem) with gaps
- `background: var(--surface)` ensures panel is opaque over the map; `box-shadow: 0 2px 8px rgba(0,0,0,0.15)` provides drop shadow
- "Selected specimens" label added to sidebar header, left of the close button, via new `.sidebar-title` CSS rule
- Portrait media query `bee-sidebar` rule in bee-atlas.ts unchanged — flex-column sibling layout preserved on portrait screens

## Task Commits

Each task was committed atomically:

1. **Task 1: Update bee-sidebar.ts — overlay host styles and header label** - `99e8728` (feat)
2. **Task 2: Update bee-atlas.ts — reposition sidebar CSS to overlay; preserve portrait rule** - `0b758f3` (feat)

## Files Created/Modified
- `frontend/src/bee-sidebar.ts` - :host overlay styles (position: absolute, z-index, background, box-shadow, overflow-y); .sidebar-header justify-content: space-between; new .sidebar-title CSS; "Selected specimens" span in render header
- `frontend/src/bee-atlas.ts` - bee-sidebar CSS rule: flex-shrink/border-left/scrollbar-gutter removed, overlay offsets (right/top/width/bottom) added; portrait media query rule untouched

## Decisions Made
- `overflow-y: auto` retained on `:host` (not a child element) so the overlay panel itself scrolls vertically within its `bottom: 0.5em` constraint — correct for D-02 fill-to-bottom behavior
- Followed identical overlay pattern to `bee-filter-panel` (`:host { position: absolute; z-index: 1 }` + directional offsets in bee-atlas CSS) for consistency

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

Pre-existing test failure in `src/tests/bee-filter-toolbar.test.ts` (1 test): checks that `bee-filter-panel.ts` contains a `bee-filter-controls` sub-component reference. This failure existed before any changes in this plan (confirmed by running tests on clean worktree). Out of scope per deviation rules — not caused by this plan's changes.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- Phase 70 plan 01 complete; sidebar overlay UI pattern established
- Browser verification still needed: click a map point, confirm sidebar opens as right-edge overlay without shifting map; portrait layout falls back correctly
- Pre-existing test failure (`bee-filter-toolbar.test.ts` / `bee-filter-controls` sub-component check) should be resolved in a separate cleanup phase

---
*Phase: 070-map-overlay-sidebar*
*Completed: 2026-04-21*
