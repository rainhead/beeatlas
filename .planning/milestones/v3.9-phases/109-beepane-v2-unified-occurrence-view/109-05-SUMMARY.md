---
phase: 109-beepane-v2-unified-occurrence-view
plan: "05"
subsystem: ui
tags: [lit, css, bee-pane, bee-atlas, layout, flexbox]

# Dependency graph
requires:
  - phase: 109-beepane-v2-unified-occurrence-view
    plan: "04"
    provides: "PANE-V2 list/table states, filter integration, PANE-V2 test suite"
provides:
  - "Viewport-contained list pane with internal scrollbar (max-height + overflow)"
  - "Pane stays open when filter changed from within the open list pane"
  - "Close and expand buttons in sidebar-header flex row with no overlap"
affects: [109-beepane-v2-unified-occurrence-view]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Flex column with overflow:hidden on :host + flex:1/min-height:0 scroll area for height-constrained pane content"
    - "Guard pane-state collapse only when not already in target state (filter-changed idempotency)"
    - "Inline action buttons as flex siblings in header row instead of absolute-positioned overlays"

key-files:
  created: []
  modified:
    - src/bee-atlas.ts
    - src/bee-pane.ts

key-decisions:
  - "calc(100% - 1em) for max-height accounts for 0.5em top offset plus 0.5em bottom breathing room"
  - "Guard condition is _paneState !== 'list' (not _paneState === 'collapsed') to also collapse from table state"
  - "pane-close placed as leftmost flex child in sidebar-header; justify-content:space-between distributes [X | Filters | expand] naturally"

patterns-established:
  - "Flex scroll area pattern: :host{overflow:hidden} + .scroll-area{flex:1;min-height:0;overflow-y:auto}"

requirements-completed: [PANE-V2-01, PANE-V2-02, PANE-V2-03]

# Metrics
duration: 8min
completed: 2026-05-20
---

# Phase 109 Plan 05: Bee Pane Layout Gap-Closure Summary

**Three surgical CSS/logic fixes: viewport overflow containment, filter-change pane auto-collapse guard, and close/expand button de-overlap via sidebar-header flex row**

## Performance

- **Duration:** ~8 min
- **Started:** 2026-05-20T12:57:00Z
- **Completed:** 2026-05-20T13:00:10Z
- **Tasks:** 3
- **Files modified:** 2

## Accomplishments

- List pane is now height-constrained to the viewport with an internal scrollbar for the occurrence list, not the page
- Selecting a taxon from the inline autocomplete no longer collapses the pane
- The header row shows [X | Filters | expand] as three flex siblings with no overlap

## Task Commits

1. **Task 1: Fix viewport overflow** - `48311a8` (fix)
2. **Task 2: Fix pane auto-close on filter-changed** - `9e372ae` (fix)
3. **Task 3: Fix overlapping close/expand buttons** - `7ec7bca` (fix)

## Files Created/Modified

- `src/bee-atlas.ts` - Added `max-height: calc(100% - 1em)` to `.content.pane-list bee-pane`; guarded `_paneState = 'collapsed'` in `_onFilterChanged`
- `src/bee-pane.ts` - Added `overflow: hidden` to `:host`; added `.list-scroll` flex scroll area; moved pane-close into sidebar-header as first child; removed absolute positioning from `.pane-close`

## Decisions Made

- `max-height: calc(100% - 1em)` chosen to account for the 0.5em top offset of `bee-pane` from `calc(0.5em + 2.5rem)` plus 0.5em breathing room at the bottom, matching the existing `bottom: 0.5em` on the list state rule.
- Guard `if (this._paneState !== 'list')` rather than `if (this._paneState === 'collapsed')` so a filter change from table state still collapses correctly.
- `pane-close` placed as leftmost flex child (before title and expand-btn) so the header reads left-to-right as [close | label | expand] — a conventional pattern that avoids any z-index layering.

## Deviations from Plan

None — plan executed exactly as written.

## Issues Encountered

None — all three bugs had clear root causes and simple fixes. tsc and 478 tests passed on every change.

## Known Stubs

None.

## Threat Flags

None — no new network endpoints, auth paths, file access patterns, or schema changes introduced.

## Next Phase Readiness

- All three UAT-identified layout bugs are closed; the pane is usable in practice.
- Phase 109 is now complete; no open layout blockers remain.
- A manual smoke-check (app launch, filter interaction, button visual inspection) is recommended before closing the milestone.

---

## Self-Check

- `src/bee-atlas.ts` modified: FOUND
- `src/bee-pane.ts` modified: FOUND
- Commit 48311a8: FOUND
- Commit 9e372ae: FOUND
- Commit 7ec7bca: FOUND
- `max-height: calc(100% - 1em)` in bee-atlas.ts: FOUND (line 103)
- `overflow: hidden` in :host bee-pane.ts: FOUND (line 118)
- `.list-scroll` CSS rule: FOUND (line 410)
- `_paneState !== 'list'` guard: FOUND (line 811)
- `position: absolute` removed from .pane-close: CONFIRMED (grep returns empty)
- `render()` list state returns `_renderListContent()` directly: FOUND (line 1145)
- pane-close inside sidebar-header: FOUND (line 1067)
- 478 tests passing: CONFIRMED
- tsc --noEmit exits 0: CONFIRMED

## Self-Check: PASSED

*Phase: 109-beepane-v2-unified-occurrence-view*
*Completed: 2026-05-20*
