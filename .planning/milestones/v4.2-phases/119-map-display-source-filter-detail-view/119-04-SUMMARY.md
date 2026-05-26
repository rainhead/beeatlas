---
phase: 119-map-display-source-filter-detail-view
plan: "04"
subsystem: ui
tags: [lit, web-components, bee-pane, source-filter, custom-events]

requires:
  - phase: 119-02
    provides: MAP-02 tests in bee-pane.test.ts (source-filter-changed, _renderSources, hiddenSources property checks)

provides:
  - bee-pane.ts Sources filter row with three checkboxes (ecdysis / waba_sample / inat_obs)
  - source-filter-changed CustomEvent dispatch (bubbles + composed) with hiddenSources Set detail
  - hiddenSources @property + _hiddenSources @state mirror via updated() sync
  - All-sources-hidden empty state copy in occurrence list

affects:
  - 119-06 (bee-atlas must handle source-filter-changed event and pass hiddenSources back to bee-pane and bee-map)

tech-stack:
  added: []
  patterns:
    - "@property + @state mirror pattern for URL-restored filter state in bee-pane"
    - "Toggling checkbox mutates local @state + dispatches CustomEvent — bee-atlas owns canonical state"

key-files:
  created: []
  modified:
    - src/bee-pane.ts

key-decisions:
  - "All three tasks committed as one feat commit because Task 1's _hiddenSources @state is unused until Tasks 2+3; splitting would fail noUnusedLocals tsc check"

patterns-established:
  - "_onSourceToggle mutates _hiddenSources via new Set() copy then dispatches — same pattern as existing _onChecklistChange"

requirements-completed: [MAP-02]

duration: 4min
completed: "2026-05-26"
---

# Phase 119 Plan 04: Sources Filter Row in bee-pane Summary

**Source visibility checkboxes in bee-pane filter panel dispatching `source-filter-changed` with per-source hiddenSources Set; all-sources-hidden empty state copy wired**

## Performance

- **Duration:** ~4 min
- **Started:** 2026-05-26T06:10:00Z
- **Completed:** 2026-05-26T06:14:28Z
- **Tasks:** 3
- **Files modified:** 1

## Accomplishments

- Added `hiddenSources` @property and `_hiddenSources` @state mirror with `updated()` sync (one-way property→state for URL restore)
- Added `_renderSources()` method rendering three labelled checkboxes (Ecdysis specimens / WABA samples / iNat expert obs) in a `.filter-row` using existing CSS classes
- Added `_onSourceToggle()` dispatching `source-filter-changed` CustomEvent (bubbles+composed) with `detail.hiddenSources` Set
- Wired `${this._renderSources()}` into `_renderListContent()` immediately after `${this._renderShow()}`
- Added all-sources-hidden empty state: "No sources selected. Enable at least one source above." checked before existing listRows guard

## Task Commits

All three tasks committed atomically (interdependency prevented splitting; see Decisions):

1. **Tasks 1-3: hiddenSources property + _renderSources + empty state** - `6abd704` (feat)

**Plan metadata:** (docs commit follows)

## Files Created/Modified

- `src/bee-pane.ts` - Added hiddenSources @property, _hiddenSources @state, _onSourceToggle(), _renderSources(), empty-state branch, wired into _renderListContent()

## Decisions Made

- Committed all three tasks together rather than splitting: `noUnusedLocals: true` in tsconfig would have caused tsc to fail after Task 1 alone (the `_hiddenSources` state is declared in Task 1 but only used in Tasks 2+3). Splitting would have required a tsc-silencing workaround. The three tasks are semantically one feature addition.

## Deviations from Plan

None - plan executed exactly as written. All acceptance criteria met, 6 MAP-02 bee-pane tests green, tsc clean.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- bee-pane.ts UI half of MAP-02 complete
- Plan 119-06 (bee-atlas wiring) must handle `source-filter-changed`, own `_hiddenSources` state, pass it to bee-pane and bee-map, and round-trip through URL state
- bee-map (Plan 119-03) must apply Mapbox filter using `hiddenSources` property already exposed
- DET-01 (Plan 119-05) remains red until bee-occurrence-detail adds `_renderInatObs` branch

---
*Phase: 119-map-display-source-filter-detail-view*
*Completed: 2026-05-26*
