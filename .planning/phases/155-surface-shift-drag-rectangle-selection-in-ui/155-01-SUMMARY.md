---
phase: 155-surface-shift-drag-rectangle-selection-in-ui
plan: 01
subsystem: ui
tags: [lit, web-components, css-media-query, hint-text]

# Dependency graph
requires:
  - phase: 156-separate-spatial-bounds-filter-from-per-record-selection-bac
    provides: shift-drag bounds-filter gesture and vocabulary (bounds = filter, bbox= URL param)
provides:
  - hint element <p class="hint hint--desktop-only">Shift-drag on map to set bounds</p> in bee-pane filters section
  - .hint--desktop-only CSS modifier gated by @media (hover: hover) and (pointer: fine)
  - UI-01 source-text tests asserting copy, class, and media query
affects: [any future phase that modifies bee-pane filters section layout or the where input block]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "CSS-only desktop-only gating via @media (hover: hover) and (pointer: fine) modifier class"
    - "Source-text test assertions in bee-sidebar.test.ts for bee-pane.ts template content"

key-files:
  created: []
  modified:
    - src/bee-pane.ts
    - src/tests/bee-sidebar.test.ts

key-decisions:
  - "Always-render the hint in the DOM, hide on touch via CSS display:none + media query override (no JS device detection)"
  - "No new reactive state; hint is a static literal text node with no property binding"
  - "Reuse existing .hint class for color/font-size/margin; add .hint--desktop-only modifier for visibility only"
  - "Keep hint copy as unbroken text node (no <kbd> markup) so literal-substring test passes"

patterns-established:
  - "hint--desktop-only: CSS modifier pattern for desktop-only content via pointer-capability media query"

requirements-completed: [D-01, D-02, D-03, D-04, D-05, D-06]

# Metrics
duration: 8min
completed: 2026-06-21
---

# Phase 155 Plan 01: Surface Shift-Drag Rectangle Selection in UI Summary

**Static hint line "Shift-drag on map to set bounds" added to bee-pane below the where input, gated CSS-only via @media (hover: hover) and (pointer: fine)**

## Performance

- **Duration:** 8 min
- **Started:** 2026-06-21T00:00:00Z
- **Completed:** 2026-06-21T00:08:00Z
- **Tasks:** 1
- **Files modified:** 2

## Accomplishments

- Added `<p class="hint hint--desktop-only">Shift-drag on map to set bounds</p>` as direct sibling of `div.input-wrap` in bee-pane filters section (D-05, D-06)
- Added `.hint--desktop-only { display: none }` base rule + `@media (hover: hover) and (pointer: fine)` override in `static styles` (D-02)
- Three source-text tests (UI-01 describe block) asserting copy, .hint class, and media query all pass GREEN
- No new reactive state, no UA sniffing, no modification to bee-map.ts (D-01, D-04)

## Task Commits

1. **Task 1: Add desktop-only shift-drag bounds hint to bee-pane (element + CSS) and assert via source-text tests** - `00aaf6c9` (feat)

**Plan metadata:** (see final commit below)

## Files Created/Modified

- `src/bee-pane.ts` - Added hint `<p>` element after where input closing div; added `.hint--desktop-only` CSS modifier with pointer-capability media query gating
- `src/tests/bee-sidebar.test.ts` - Added `UI-01: shift-drag bounds hint in bee-pane` describe block with three source-text assertions

## Decisions Made

None - followed plan as specified. All D-01 through D-06 constraints satisfied exactly.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None. The three pre-existing failing tests (build-geojson.test.ts, build-output.test.ts, data-species.test.ts) were already failing before this change and are unrelated environment/build-artifact issues outside this plan's scope.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Phase 155 plan 01 complete. Desktop users now see the verbatim hint below the where input.
- No blockers. The hint is purely additive; no further phases are blocked on this deliverable.
- If a future phase adds touch-mode box-drawing, the .hint--desktop-only modifier pattern can be extended.

---
*Phase: 155-surface-shift-drag-rectangle-selection-in-ui*
*Completed: 2026-06-21*
