---
phase: 109-beepane-v2-unified-occurrence-view
plan: "02"
subsystem: bee-atlas/bee-header
tags: [list-query, state-refactor, header-cleanup, occurrence-view]
dependency_graph:
  requires:
    - 109-01 (queryListPage function in filter.ts)
  provides:
    - bee-atlas.ts owns _runListQuery with _listRows/_listPage/_listRowCount/_listLoading state
    - bee-header.ts stripped of viewMode/view-changed/table-icon
    - bee-atlas.ts has no bee-sidebar.ts imports (static or dynamic)
  affects:
    - src/bee-pane.ts (will receive listRows/listPage/listRowCount/listLoading/selectionCount in Plan 03)
tech_stack:
  added: []
  patterns:
    - Generation counter (_listQueryGeneration) for stale-query guard
    - WHERE intersection semantics passed through from queryListPage
key_files:
  created: []
  modified:
    - src/bee-atlas.ts
    - src/bee-header.ts
    - src/tests/bee-atlas.test.ts
    - src/tests/bee-header.test.ts
decisions:
  - _openSidebarForFilter simplified to sync method (no longer needs async since await was removed)
  - _onSelectionDrawn no longer checks rows.length===0; pane opens immediately and list query handles empty results
  - bee-header table/map icon buttons both removed (not just table); _onViewChanged removed from bee-atlas
metrics:
  duration: "17 minutes"
  completed_date: "2026-05-20"
  tasks_completed: 2
  tasks_total: 2
  files_changed: 4
---

# Phase 109 Plan 02: Refactor bee-atlas List Query State; Strip bee-header Table Icon Summary

Replaced _selectedOccurrences with _listRows/_listPage/_listRowCount/_listLoading state driven by queryListPage; removed all 7 dynamic bee-sidebar imports; stripped viewMode/view-switching from bee-header; updated CSS to height:60% for split-screen table layout.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Remove table icon from bee-header.ts | c34c6d5 | src/bee-header.ts |
| 2 | Refactor bee-atlas.ts — list query state, CSS, event wiring | c34c6d5 | src/bee-atlas.ts, src/tests/bee-atlas.test.ts, src/tests/bee-header.test.ts |

## What Was Built

### bee-atlas.ts refactor

New state fields added after `_tableLoading`:
- `_listRows: OccurrenceRow[]` — current page of list results
- `_listRowCount: number` — total matching rows for pagination
- `_listPage: number` — current list page
- `_listLoading: boolean` — async query in flight
- `_selectionCount: number | null` — null when no selection active
- `_listQueryGeneration: number` (non-reactive) — stale-query guard counter

New method `_runListQuery()`: builds selEcdysisIds/selInatIds from `_selectedOccIds` via `parseOccId()`, calls `queryListPage()` with filter+page+sortBy+ids+bounds, applies generation guard, updates all list state fields. Sets `_selectionCount` when any selection dimension is active.

New event handlers:
- `_onListPageChanged(e)`: updates `_listPage`, calls `_runListQuery()`
- `_onClearSelection()`: clears all selection state, resets page, calls `_runListQuery()`, updates URL

Updated `_onPaneExpandList()`: now also sets `_listPage = 1` and calls `_runListQuery()`.

Removed from bee-atlas.ts:
- `_selectedOccurrences` field (27 references eliminated)
- `_restoreSelectionOccurrences()` method
- `_restoreClusterSelection()` method  
- `_restoreBoundsSelection()` method
- `_onViewChanged()` method
- All 7 `import('./bee-sidebar.ts')` dynamic imports
- `occIdFromRow` import (no longer needed)
- `OCCURRENCE_COLUMNS` import (no longer needed)
- `queryOccurrencesByBounds` import (no longer needed)
- `.viewMode` and `@view-changed` bindings from bee-header

Updated render(): bee-pane now receives `.listRows`, `.listRowCount`, `.listPage`, `.listLoading`, `.selectionCount`, `@list-page-changed`, `@pane-clear-selection`.

Updated `_onDataLoaded()`: calls `_runListQuery()` when `_paneState === 'list'` (handles URL restore).
Updated `_onPopState()`: calls `_runListQuery()` when finalPaneState is 'list'.
Updated `_onSelectionDrawn()`: immediately sets bounds and calls `_runListQuery()` (no more async bounds query).
Updated `_openSidebarForFilter()`: sync method, clears selection state, calls `_runListQuery()`.

### bee-header.ts changes

Removed: `viewMode` @property, `_onViewClick()` method, both map and table icon-btn elements, view-changed CustomEvent dispatch, `.inline-tabs`, `.tab-btn`, `.hamburger-menu`, `.hamburger-items` CSS, `@media (max-width: 640px)` block, `property` decorator import.

Kept: h1 title, species index anchor (icon-btn), places anchor (icon-btn), GitHub link, `.left-group`, `.right-group`, `.icon-btn`, `.github-link` CSS.

### CSS change

Replaced `inset: 0` with `bottom: 0; left: 0; right: 0; top: auto; height: 60%` for `.content.pane-table bee-pane`.

### Test updates (deviation Rule 1/2 — broken tests from intentional refactor)

`src/tests/bee-atlas.test.ts`:
- SEL-03: Removed test checking bee-atlas.ts references queryOccurrencesByBounds
- SEL-04: Removed test checking _selectedOccurrences assignment
- SEL-05: Updated to note queryOccurrencesByBounds replaced by _runListQuery
- SEL-06: Replaced _restoreBoundsSelection tests with _selectionBounds state tests
- SEL-07: Updated _onSelectionDrawn test to check new behavior (sets bounds, calls _runListQuery)
- SEL-07: Fixed _openSidebarForFilter test signature (no longer async)
- SM-01: Replaced _onViewChanged test with _onPaneExpandTable test
- PANE-01: Updated _onPaneCollapse test to not expect _selectedOccurrences

`src/tests/bee-header.test.ts`:
- Updated viewMode test to verify property is ABSENT
- Replaced view-changed dispatch tests with species/places link render tests

## Deviations from Plan

### Auto-fixed: Test updates for intentional refactors

**Rule 1 - Bug:** Multiple tests were checking for behaviors intentionally removed by this plan (the plan said "test update is in Plan 04" for VIEW-02 only, but the failing tests were SEL-03/04/05/06/07, SM-01, PANE-01, and all of bee-header.test.ts). Since the plan's success criterion is "npm test passes", these tests were updated inline.

**Rule 1 - Bug:** bee-header.test.ts tests for viewMode property and view-changed events needed updating since viewMode was removed in Task 1. These tests were updated to verify the opposite (no viewMode, no view-changed).

### Auto-fixed: Wrong file paths (worktree context)

Early edits were made to main repo paths (`/Users/rainhead/dev/beeatlas/src/`) instead of the worktree paths (`/Users/rainhead/dev/beeatlas/.claude/worktrees/agent-ab1c1c19248cd1dbc/src/`). Main repo files were restored to HEAD using `git checkout HEAD -- ...` and the correct worktree files were then written.

## Known Stubs

None. This plan is infrastructure/wiring only. The new `listRows`/`listPage` props are passed to bee-pane but bee-pane doesn't consume them yet (Plan 03 redesigns bee-pane). The props are correctly wired — bee-pane will ignore unknown props until Plan 03 adds the corresponding @property declarations.

## Threat Flags

None. The threat model entries (T-109-02 and T-109-SC) are correctly mitigated:
- T-109-02: `parseOccId()` validates all URL selection IDs before passing numeric arrays to `queryListPage()`
- T-109-SC: No new package installs

## Self-Check: PASSED

- src/bee-atlas.ts: `_selectedOccurrences` absent, `bee-sidebar.ts` absent, `height: 60%` present, `_runListQuery` present
- src/bee-header.ts: `viewMode` absent, `_onViewClick` absent, table icon absent
- Commit c34c6d5: present in git log
- tsc --noEmit: 0 errors
- npm test: 2 failures (PANE-V2-05 expected RED), all others pass
