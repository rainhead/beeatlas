---
phase: 54-sidebar-cleanup
plan: "02"
subsystem: frontend
tags: [sidebar, cleanup, lit, uat-gap-closure]
dependency_graph:
  requires: [54-01]
  provides: [sidebar-empty-click-close, no-back-button]
  affects: [bee-atlas, bee-specimen-detail, bee-sample-detail]
tech_stack:
  added: []
  patterns: [state-assignment, css-removal]
key_files:
  created: []
  modified:
    - frontend/src/bee-atlas.ts
    - frontend/src/bee-specimen-detail.ts
    - frontend/src/bee-sample-detail.ts
decisions:
  - Left _onClose method in both detail components since close CustomEvent may still be consumed by bee-sidebar parent
metrics:
  duration: "~5 minutes"
  completed: 2026-04-13
  tasks_completed: 2
  files_modified: 3
---

# Phase 54 Plan 02: Sidebar Gap Closure Summary

**One-liner:** Added `_sidebarOpen = false` to `_onMapClickEmpty` else branch and stripped redundant Back buttons from both detail panels, closing both UAT gaps.

## What Was Built

### Task 1: Fix `_onMapClickEmpty` to close sidebar on empty click

In `bee-atlas.ts`, the `_onMapClickEmpty` else branch (which fires when the user clicks empty map space with boundary mode off) already cleared selection state but never set `_sidebarOpen = false`. Added the assignment immediately before `_pushUrlState()`:

```typescript
} else {
  // Clear selection
  this._selectedSamples = null;
  this._selectedOccIds = null;
  this._selectedSampleEvent = null;
  this._sidebarOpen = false;   // ← added
  this._pushUrlState();
}
```

This closes UAT test 5 (empty map click closes sidebar).

### Task 2: Remove Back button from detail panels

**bee-specimen-detail.ts:**
- Removed `.back-btn` CSS rule (9 lines)
- Removed `<button class="back-btn" ...>&#8592; Back</button>` from `render()`
- `_onClose()` method retained (dispatches `close` CustomEvent for parent use)

**bee-sample-detail.ts:**
- Removed `.back-btn` CSS rule (9 lines)
- Removed `.sample-dot-detail-header` CSS rule (3 lines, now unused)
- Removed `<div class="sample-dot-detail-header"><button class="back-btn" ...></div>` wrapper from `render()`
- `_onClose()` method retained

This closes UAT test 7 (no redundant Back button alongside sidebar's × close button).

## Deviations from Plan

### Worktree State Issue (auto-resolved)

- **Found during:** Setup
- **Issue:** The worktree (`agent-a48d3e97`) was created before the 54-01 merge and contained pre-54-01 staged changes in the index that conflicted with HEAD. The working tree files were pre-54-01 (838-line bee-atlas.ts without `_sidebarOpen`).
- **Fix:** Reset index and working tree to HEAD via `git reset HEAD` and `git checkout HEAD` for all affected files, establishing a clean baseline with 54-01 changes properly in place.
- **Impact:** No code changes required; worktree cleanup only.

## UAT Gap Closure

| Test | Description | Before | After |
|------|-------------|--------|-------|
| 5    | Empty map click closes sidebar | FAIL (stayed open) | PASS |
| 7    | No redundant Back button | FAIL (Back button present) | PASS |

## Pre-existing Issues (not caused by this plan)

- `bee-table.test.ts` TABLE-01 and TABLE-08 (3 failures): pre-existing, unrelated to sidebar
- TypeScript build errors in `bee-header.test.ts` and `bee-sidebar.test.ts`: pre-existing

## Known Stubs

None.

## Self-Check

- [x] `_sidebarOpen = false` present in else branch of `_onMapClickEmpty` in `bee-atlas.ts`
- [x] No `.back-btn` string in `bee-specimen-detail.ts`
- [x] No `.back-btn` string in `bee-sample-detail.ts`
- [x] Task 1 committed: 95bd99d
- [x] Task 2 committed: 7909c87
- [x] No new test failures introduced (3 pre-existing failures remain)

## Self-Check: PASSED
