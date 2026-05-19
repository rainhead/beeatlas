---
phase: 108-bee-atlas-cutover-map-resize
plan: "01"
subsystem: frontend
tags: [bee-atlas, bee-pane, cutover, pane-state, lit, typescript]
requirements-completed: [MAP-01]

dependency-graph:
  requires:
    - 107-01: bee-pane skeleton with paneState + CSS positioning
    - 107-02: bee-pane filter UI, occurrence detail, bee-table embed
  provides:
    - bee-atlas renders single bee-pane overlay (collapsed/list/table)
    - four pane navigation event handlers in bee-atlas
    - dead code removal: _onClose, _onToggleFilter, _tableFilterOpen
  affects:
    - src/bee-atlas.ts (primary cutover)
    - src/tests/bee-atlas.test.ts (7 tests updated, 12 PANE-01 tests added)
    - src/tests/bee-filter-toolbar.test.ts (2 FILTER-PANEL integration tests updated)

tech-stack:
  added: []
  patterns:
    - bee-pane as position:absolute overlay — bee-map element size invariant across pane transitions (MAP-01 satisfied by existing ResizeObserver in bee-map.ts)
    - pane-table CSS class controls only bee-pane full-coverage in table state

key-files:
  modified:
    - src/bee-atlas.ts
    - src/tests/bee-atlas.test.ts
    - src/tests/bee-filter-toolbar.test.ts

decisions:
  - "MAP-01 satisfied by overlay architecture: bee-pane is position:absolute, so bee-map element dimensions never change across pane transitions; no explicit map.resize() call needed in bee-atlas"
  - "_onPaneCollapse replicates _onClose semantics verbatim (clears all four selection fields + collapsed)"
  - "_onViewChanged kept intact: bee-header still emits view-changed events; pane handlers are the bee-pane bridge, _onViewChanged is the bee-header bridge"
  - "nothing import removed from lit imports since no conditional blocks in render remain"

metrics:
  duration: "4 minutes"
  completed: "2026-05-19T23:52:08Z"
  tasks-completed: 3
  tasks-total: 3
  files-modified: 3
  commits: 3
---

# Phase 108 Plan 01: bee-atlas Cutover to bee-pane Summary

**One-liner:** bee-atlas cuts over to single bee-pane overlay replacing bee-filter-panel + bee-sidebar + bee-table siblings, with four pane navigation handlers and MAP-01 satisfied by overlay architecture.

## What Was Built

Wired Phase 107's `bee-pane` component into `bee-atlas` as the sole UI surface replacing three legacy sibling elements. The overlay architecture (bee-pane is `position:absolute`) means bee-map's element dimensions never change across pane state transitions, so the existing `ResizeObserver` in bee-map.ts line 807 satisfies MAP-01 without any explicit `map.resize()` call from bee-atlas.

### Task 1: bee-atlas imports, CSS, and render (aef5964)

- Replaced `import './bee-filter-panel.ts'` with `import './bee-pane.ts'`
- Removed `private _tableFilterOpen = false` field
- Removed CSS rules for: `bee-table`, `.content.table-mode`, `.content.table-mode bee-map`, `bee-sidebar`, `bee-filter-panel`, `.content.table-mode bee-filter-panel`, mobile `bee-sidebar` block, mobile `.content.sidebar-open bee-map` block
- Added CSS rules: `bee-pane { top: 0.5em; right: 0.5em; bottom: 0.5em; }`, `.content.pane-table bee-pane { inset: 0; }`, mobile `bee-pane { right: 0; left: 0; }`
- Updated `.content` class list from `['table-mode'/'sidebar-open']` to `['pane-table']`
- Replaced `<bee-table>`, `<bee-filter-panel>`, `<bee-sidebar>` with single `<bee-pane>` with all 17 property bindings and 9 event listeners
- Removed `_onToggleFilter` method (bee-filter-panel.setOpen consumer gone)
- Removed `_tableFilterOpen = false` from `_onViewChanged`
- Removed `nothing` from lit imports (no longer used)

### Task 2: Pane event handlers and dead code removal (b6d0875)

Added four private methods adjacent to `_onFilterChanged`:

- `_onPaneExpandList()`: sets `_paneState = 'list'` + `_replaceUrlState()`
- `_onPaneCollapse()`: clears all four selection fields, sets `_paneState = 'collapsed'` + `_replaceUrlState()`
- `_onPaneExpandTable()`: sets `_paneState = 'table'`, dynamic imports bee-table.ts, sets `_tableLoading = true`, calls `_runTableQuery()` + `_replaceUrlState()`
- `_onPaneShrinkList()`: sets `_paneState = 'list'` + `_replaceUrlState()`

Removed `_onClose()` method (semantics moved to `_onPaneCollapse`).

### Task 3: Test updates + PANE-01 wiring block (a87757e)

Updated existing tests to match post-cutover source:

- `bee-filter-toolbar.test.ts` FILTER-PANEL integration: 2 tests rewritten to assert `bee-pane` import/render
- `bee-atlas.test.ts` SIDE-01: `_onClose` → `_onPaneCollapse`
- `bee-atlas.test.ts` VIEW-02: assert `<bee-pane>` render and `bee-pane { }` CSS rule
- `bee-atlas.test.ts` SM-01: `_onClose` → `_onPaneCollapse`
- `bee-atlas.test.ts` SEL-07: `_onClose` → `_onPaneCollapse`

Added new `PANE-01` describe block (12 tests) locking in the bee-pane wiring contract: import, render element, four pane events, `_onPaneCollapse` body, `_onPaneExpandTable` body, dead-code removal, class names, MAP-01 no-resize invariant.

## Commits

| Hash | Message |
|------|---------|
| aef5964 | feat(108-01): replace bee-filter-panel+bee-sidebar+bee-table with bee-pane in bee-atlas render |
| b6d0875 | feat(108-01): add four pane event handlers and remove dead code from bee-atlas |
| a87757e | test(108-01): update bee-atlas and bee-filter-toolbar tests for bee-pane cutover; add PANE-01 wiring block |

## Deviations from Plan

None — plan executed exactly as written.

The `nothing` import removal from `lit` (step 6 of Task 1 action) was identified in the plan as a conditional check; it was unused after removing the conditional `bee-table` and `bee-sidebar` blocks, so it was removed to avoid a TypeScript `noUnusedLocals` error.

## Threat Flags

None — no new network endpoints, auth paths, file access patterns, or schema changes introduced. All four pane navigation events carry no detail payload (T-108-01 accept); filter-changed bubbles through unchanged _onFilterChanged (T-108-02 accept).

## Self-Check: PASSED

- `src/bee-atlas.ts` exists: FOUND
- `src/tests/bee-atlas.test.ts` exists: FOUND
- `src/tests/bee-filter-toolbar.test.ts` exists: FOUND
- Commit aef5964 exists: FOUND
- Commit b6d0875 exists: FOUND
- Commit a87757e exists: FOUND
- `npm test -- --run` exits 0 (445 passing, 29 skipped — pre-existing build-output/data-species failures excluded)
- `npx tsc --noEmit` exits 0
