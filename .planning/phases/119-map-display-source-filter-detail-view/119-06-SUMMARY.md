---
phase: 119-map-display-source-filter-detail-view
plan: "06"
subsystem: ui
tags: [lit, web-components, url-state, source-filter]

# Dependency graph
requires:
  - phase: 119-02
    provides: "UiState.hiddenSources field, buildParams/parseParams src= round-trip"
  - phase: 119-03
    provides: "bee-map hiddenSources property + _applySourceFilter()"
  - phase: 119-04
    provides: "bee-pane hiddenSources property + source-filter-changed event"
  - phase: 119-05
    provides: "bee-occurrence-detail _renderInatObs branch"
provides:
  - "_hiddenSources @state in bee-atlas (single source of truth per CLAUDE.md invariant)"
  - "URL round-trip for src= param via _buildCurrentParams + firstUpdated + _onPopState"
  - "_onSourceFilterChanged handler wiring bee-pane event to state + URL replace"
  - "bee-pane and bee-map receive .hiddenSources as property from bee-atlas render()"
affects: [119-07, future-source-filter]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "_onSourceFilterChanged mirrors _onChecklistLayerChanged: assign state + _replaceUrlState()"
    - "URL restore uses ?? new Set() nullish coalescing at both firstUpdated and _onPopState"
    - "SourceKey type imported from url-state.ts for strong typing of hiddenSources Set"

key-files:
  created: []
  modified:
    - src/bee-atlas.ts

key-decisions:
  - "Use Set<SourceKey> (not Set<string>) for _hiddenSources to satisfy buildParams type contract"
  - "_onSourceFilterChanged placed near _onChecklistLayerChanged to keep related handlers grouped"

patterns-established:
  - "URL restore symmetry: every @state that round-trips URL must be restored at BOTH firstUpdated AND _onPopState"

requirements-completed: [MAP-02, MAP-03]

# Metrics
duration: 10min
completed: 2026-05-26
---

# Phase 119 Plan 06: Wire _hiddenSources State in bee-atlas Summary

**`bee-atlas` owns `_hiddenSources: Set<SourceKey>` with full URL round-trip via `src=` param, closing MAP-02 (state ownership) and MAP-03 (URL persistence) loops**

## Performance

- **Duration:** ~10 min
- **Started:** 2026-05-26T06:22:00Z
- **Completed:** 2026-05-26T06:23:32Z
- **Tasks:** 2
- **Files modified:** 1

## Accomplishments

- Declared `@state() private _hiddenSources: Set<SourceKey> = new Set()` next to `_checklistVisible` in bee-atlas, satisfying CLAUDE.md state-ownership invariant
- Added `_onSourceFilterChanged` handler that assigns `e.detail.hiddenSources` and calls `_replaceUrlState()`, mirroring the `_onChecklistLayerChanged` pattern
- Wired `.hiddenSources` + `@source-filter-changed` to bee-pane and `.hiddenSources` to bee-map in `render()`, completing the MAP-02 data flow
- Added `hiddenSources: this._hiddenSources` to `_buildCurrentParams` ui literal, `firstUpdated` restore, and `_onPopState` restore, closing the MAP-03 URL round-trip at all three required sites

## Task Commits

1. **Task 1: Declare _hiddenSources state + handler + render() bindings** - `26f072f` (feat)
2. **Task 2: URL round-trip — _buildCurrentParams + firstUpdated + _onPopState** - `9bd4402` (feat)

**Plan metadata:** (docs commit follows)

## Files Created/Modified

- `src/bee-atlas.ts` - Added _hiddenSources @state, _onSourceFilterChanged handler, render() property bindings to bee-pane and bee-map, URL round-trip at all three sites

## Decisions Made

- Used `Set<SourceKey>` (not `Set<string>`) for `_hiddenSources` to satisfy the `buildParams` type contract from `url-state.ts`. This required importing `SourceKey` from `url-state.ts` and updating the handler signature accordingly.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] TypeScript type mismatch: Set<string> not assignable to Set<SourceKey>**
- **Found during:** Task 2 (URL round-trip wiring)
- **Issue:** `_buildCurrentParams` passes `hiddenSources: this._hiddenSources` to `buildParams`, which expects `hiddenSources?: Set<SourceKey>`. Declaring `_hiddenSources` as `Set<string>` caused a type error (`TS2322`).
- **Fix:** Changed declaration to `Set<SourceKey>`, imported `SourceKey` from `url-state.ts`, updated handler parameter type to `Set<SourceKey>`.
- **Files modified:** `src/bee-atlas.ts`
- **Verification:** `npx tsc --noEmit` exits 0
- **Committed in:** `9bd4402` (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (Rule 1 - type bug)
**Impact on plan:** Necessary for correctness; narrower type is strictly safer. No scope creep.

## Issues Encountered

- `build-output.test.ts` and `data-species.test.ts` fail in the worktree due to missing `public/data/species.json` and `public/data/seasonality.json` — these data files are not present in the worktree. Pre-existing condition, unrelated to this plan. All 19 other test files pass (471 tests), including all 4 Phase 119 requirements.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- All 4 Phase 119 requirements have passing automated tests: MAP-01 (bee-map amber color), MAP-02 (source filter in bee-pane + bee-atlas wiring), MAP-03 (URL src= round-trip), DET-01 (iNat obs detail view)
- `_hiddenSources` referenced at 7 distinct sites in bee-atlas.ts (declaration, handler body, render bee-map, render bee-pane listener, render bee-pane property, `_buildCurrentParams`, `firstUpdated`, `_onPopState`)
- Ready for Plan 119-07 human-verify (visual UAT: page load with `?src=ecdysis` should hide Ecdysis points and uncheck the Ecdysis checkbox)

---
*Phase: 119-map-display-source-filter-detail-view*
*Completed: 2026-05-26*
