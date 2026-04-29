---
phase: 069-table-drawer
plan: "02"
subsystem: frontend
tags: [layout, drawer, bee-atlas, bee-table, bee-map]
dependency_graph:
  requires: []
  provides: [drawer-layout, row-pan-handler]
  affects: [frontend/src/bee-atlas.ts]
tech_stack:
  added: []
  patterns: [absolute-overlay-drawer, unconditional-map-render, viewmode-gating]
key_files:
  created: []
  modified:
    - frontend/src/bee-atlas.ts
decisions:
  - "bee-table rendered as position:absolute overlay (bottom:0, height:82%, z-index:2) — not a flex sibling"
  - "_onRowPan does not call _pushUrlState: row-click pan is transient (D-05)"
  - "bee-filter-panel and bee-sidebar fully removed from DOM in table mode (not hidden) via nothing sentinel"
metrics:
  duration_seconds: 88
  completed_date: "2026-04-21"
  tasks_completed: 2
  tasks_total: 2
---

# Phase 069 Plan 02: Drawer Layout and Row-Pan Handler Summary

bee-atlas restructured so bee-map is always in the DOM, bee-table slides up as absolute overlay in table mode, filter panel and sidebar are removed in table mode, and clicking a table row pans the map via _onRowPan.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Update static styles — bee-table as absolute overlay | 692dd9f | frontend/src/bee-atlas.ts |
| 2 | Restructure render() and add _onRowPan handler | 0f2bb53 | frontend/src/bee-atlas.ts |

## What Was Built

**Task 1 — CSS changes:**
- `bee-table` CSS rule replaced: `flex-grow:1; min-width:0; position:relative` → `position:absolute; bottom:0; left:0; right:0; height:82%; z-index:2`
- Portrait media query `@media (max-aspect-ratio: 1)`: combined `bee-map, bee-table` selector reduced to `bee-map` alone (bee-table is absolutely positioned and does not participate in flex layout)

**Task 2 — render() restructure + handler:**
- Added `nothing` to `lit` import
- `bee-map` is now always rendered unconditionally inside `.content` (no viewMode ternary guard)
- `bee-table` conditionally rendered as overlay via `${this._viewMode === 'table' ? html\`<bee-table ... @row-pan=${this._onRowPan}>\` : nothing}`
- `bee-filter-panel` and `bee-sidebar` wrapped in `${this._viewMode === 'map' ? html\`...\` : nothing}` — both removed from DOM in table mode
- `_onViewChanged`: added `this._sidebarOpen = false` inside `if (this._viewMode === 'table')` block (D-08)
- New `_onRowPan(e: CustomEvent<{ lat: number; lon: number }>)` handler sets `this._viewState = { lat, lon, zoom: this._currentView.zoom }` — reuses existing _viewState → bee-map.viewState → OL setCenter/setZoom path; does NOT call `_pushUrlState` (D-05: transient pan not persisted)

## Deviations from Plan

None — plan executed exactly as written.

## Verification

All acceptance criteria met:
- `bee-atlas.ts` contains `bee-table {` CSS rule with `position: absolute`, `bottom: 0`, `height: 82%`, `z-index: 2`
- No `bee-map, bee-table` combined selector (portrait media query uses `bee-map` alone)
- `render()` does not guard `<bee-map>` with viewMode ternary
- `render()` contains `this._viewMode === 'table' ? html\`<bee-table` conditional
- `render()` contains `@row-pan=${this._onRowPan}` on bee-table
- `render()` contains `this._viewMode === 'map' ? html\`` wrapping bee-filter-panel and bee-sidebar
- `_onViewChanged` contains `this._sidebarOpen = false` inside table mode block
- `_onRowPan` method present with correct `_viewState` assignment
- `_onRowPan` does NOT call `_pushUrlState`
- All 159 tests pass

## Self-Check: PASSED

- frontend/src/bee-atlas.ts: modified (confirmed)
- Commits 692dd9f and 0f2bb53 verified in git log
