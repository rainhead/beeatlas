---
phase: 58-elevation-filter
plan: "02"
subsystem: frontend-ui
tags: [filter, elevation, ui, lit, typescript]
dependency_graph:
  requires: [FilterState.elevMin, FilterState.elevMax, elev_min-url-param, elev_max-url-param]
  provides: [elevation-filter-inputs-ui, filter-changed-elevation-dispatch, elevation-external-sync]
  affects: [frontend/src/bee-filter-controls.ts, frontend/src/bee-sidebar.ts]
tech_stack:
  added: []
  patterns: [Lit-state-sync, parseInt-null-fallback, CustomEvent-spread-merge]
key_files:
  created: []
  modified:
    - frontend/src/bee-filter-controls.ts
    - frontend/src/bee-sidebar.ts
decisions:
  - "Elevation inputs placed as sibling div outside .search-section to keep dropdown z-index scoping clean"
  - "filterStatesEqual extended with elevMin/elevMax so updated() guard correctly ignores own emissions"
  - "FilterChangedEvent in bee-sidebar.ts extended with elevMin/elevMax (Rule 3 fix — was blocking tsc)"
metrics:
  duration_minutes: 15
  completed_date: "2026-04-16T15:00:00Z"
  tasks_completed: 1
  files_modified: 2
---

# Phase 58 Plan 02: Elevation Filter UI Summary

**One-liner:** Two elevation number inputs added to bee-filter-controls with state sync, event dispatch merging elevMin/elevMax into filter-changed, and CSS matching UI-SPEC — completing the elevation filter UI layer.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Add elevation state, handlers, sync, emit, render, and CSS | 7a570e6 | bee-filter-controls.ts, bee-sidebar.ts |

## What Was Built

Extended `bee-filter-controls.ts` with full elevation UI support:

1. **`@state` fields** — `_elevMin: number | null` and `_elevMax: number | null` added after `_open`.

2. **`filterStatesEqual`** — Two new comparisons `a.elevMin === b.elevMin && a.elevMax === b.elevMax` appended so the `updated()` equality guard does not treat elevation-only changes as needing token re-sync.

3. **`updated()` sync** — Inside the `filterState` guard, elevation fields are synced from external `filterState` when they differ from component state (enables URL load, clear-filters reset).

4. **`_emitTokens`** — Detail spread now includes `elevMin: this._elevMin, elevMax: this._elevMax` so token-driven filter changes carry elevation through.

5. **`_onElevMinInput` / `_onElevMaxInput`** — New event handlers parse input with `parseInt(..., 10)`, fall back to `null` on `isNaN` (T-58-03 mitigation), then call `_emitWithElev`.

6. **`_emitWithElev`** — Dedicated dispatch helper for elevation-only changes, merges current tokens with current elevation state.

7. **Render** — `<div class="elev-inputs">` with two `<input type="number" class="elev-input">` elements placed as a sibling after `.search-section`. Placeholders are "↑ min m" and "max m". Both have `aria-label` attributes.

8. **CSS** — `.elev-inputs` flex row with 4px gap, `.elev-input` 72×36px styled to match token field aesthetics, spinner suppression for WebKit and Firefox, focus ring using `--accent`.

9. **`FilterChangedEvent`** (bee-sidebar.ts) — Extended with `elevMin: number | null` and `elevMax: number | null` fields (Rule 3 fix — required to unblock tsc).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] FilterChangedEvent interface missing elevMin/elevMax**
- **Found during:** Task 1 verification (tsc --noEmit)
- **Issue:** `FilterChangedEvent` in `bee-sidebar.ts` did not include `elevMin`/`elevMax`, causing TS2353 errors when spreading elevation into the CustomEvent detail
- **Fix:** Added `elevMin: number | null` and `elevMax: number | null` to `FilterChangedEvent`
- **Files modified:** `frontend/src/bee-sidebar.ts`
- **Committed with:** Task 1 commit (7a570e6)

## Known Stubs

None. Both elevation inputs are fully wired: input → handler → dispatch → bee-atlas → FilterState → buildFilterSQL → DuckDB query.

## Threat Surface Scan

No new network endpoints, auth paths, or trust boundaries. T-58-03 (user input tampering) mitigated as planned via `parseInt(value, 10)` with `isNaN` guard yielding `null`.

## Checkpoint

Task 2 is a `checkpoint:human-verify` — visual verification of elevation inputs in the running app. Awaiting human approval.

## Self-Check: PASSED

Files exist:
- `frontend/src/bee-filter-controls.ts` — FOUND (contains `_elevMin`, `_elevMax`, `elev-input`, `_onElevMinInput`, `_onElevMaxInput`, `_emitWithElev`, `.elev-inputs` CSS)
- `frontend/src/bee-sidebar.ts` — FOUND (contains `elevMin: number | null` in FilterChangedEvent)

Commits exist:
- 7a570e6 — FOUND
