---
phase: 39-view-mode-toggle
plan: "02"
subsystem: frontend/bee-sidebar
tags: [view-mode-toggle, lit-component, event-up, property-down, VIEW-01]
dependency_graph:
  requires: []
  provides: [viewMode @property in bee-sidebar, view-changed CustomEvent]
  affects: [frontend/src/bee-sidebar.ts, frontend/src/tests/bee-sidebar.test.ts]
tech_stack:
  added: []
  patterns: [Lit property-down/event-up, segmented toggle button reuse]
key_files:
  created: []
  modified:
    - frontend/src/bee-sidebar.ts
    - frontend/src/tests/bee-sidebar.test.ts
decisions:
  - Reused .layer-toggle and .toggle-btn CSS classes for view toggle (no new CSS rules)
  - viewMode received as @property not @state — bee-sidebar is a pure presenter
metrics:
  duration_minutes: 4
  completed_date: "2026-04-08"
  tasks_completed: 2
  files_modified: 2
---

# Phase 39 Plan 02: bee-sidebar View Toggle Summary

**One-liner:** Added `viewMode` @property, `_renderViewToggle()` segmented toggle, and `view-changed` CustomEvent dispatch to bee-sidebar using existing CSS classes — no new styles.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Add viewMode property, toggle row, and view-changed event | e8d7299 | frontend/src/bee-sidebar.ts |
| 2 | Extend bee-sidebar.test.ts with viewMode structural tests | 2f5214b | frontend/src/tests/bee-sidebar.test.ts |

## What Was Built

`bee-sidebar.ts` now:
- Declares `@property({ attribute: false }) viewMode: 'map' | 'table' = 'map'` (pure presenter — receives from bee-atlas)
- Renders a two-button segmented toggle row ("Map" / "Table") below the Specimens/Samples layer toggle
- Emits `view-changed` CustomEvent with detail `'map' | 'table'` when inactive button is clicked; no-op when already active
- Reuses existing `.layer-toggle` / `.toggle-btn` / `.toggle-btn.active` CSS classes — no new CSS rules

`bee-sidebar.test.ts` now has 4 VIEW-01 structural tests:
- `view-changed` string presence in source
- `viewMode` property declaration presence in source
- `@state _viewMode` absence guard (presenter pattern)
- `BeeSidebar.elementProperties.has('viewMode')` runtime check

## Verification Results

```
Test Files  4 passed (4)
     Tests  67 passed (67)
```

Grep checks:
- `grep -n "view-changed" bee-sidebar.ts` — 1 line found (line 246)
- `grep -n "viewMode" bee-sidebar.ts` — 5 lines found
- `grep -n "@state.*_viewMode" bee-sidebar.ts` — 0 lines (correct)

## Deviations from Plan

None — plan executed exactly as written. The `git reset --soft` during worktree setup staged planning file deletions; these were restored before the Task 1 commit to keep the commit clean.

## Known Stubs

None — view toggle renders live HTML and dispatches real events. No placeholder data.

## Threat Flags

None — no new network endpoints, auth paths, or trust boundary crossings introduced. The `view-changed` event detail is a string literal set by the component itself, not from user-supplied input (T-39-02-01 accepted as per threat model).

## Self-Check: PASSED

- FOUND: frontend/src/bee-sidebar.ts
- FOUND: frontend/src/tests/bee-sidebar.test.ts
- FOUND: .planning/phases/39-view-mode-toggle/39-02-SUMMARY.md
- FOUND commit: e8d7299
- FOUND commit: 2f5214b
