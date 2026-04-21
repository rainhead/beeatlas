---
phase: 069-table-drawer
plan: "01"
subsystem: frontend
tags: [bee-table, row-pan, event-dispatch, tdd]
dependency_graph:
  requires: []
  provides: [row-pan CustomEvent from bee-table]
  affects: [frontend/src/bee-atlas.ts]
tech_stack:
  added: []
  patterns: [Lit CustomEvent dispatch, TDD red-green]
key_files:
  created: []
  modified:
    - frontend/src/bee-table.ts
    - frontend/src/tests/bee-table.test.ts
decisions:
  - Number() coercion in _onRowClick handles SQLite string-typed lat/lon safely; NULL guard prevents NaN dispatch
metrics:
  duration: "~2 minutes"
  completed: "2026-04-20"
  tasks_completed: 1
  tasks_total: 1
---

# Phase 069 Plan 01: Row-Pan Event Dispatch Summary

**One-liner:** bee-table emits `row-pan` CustomEvent with `{ lat, lon }` on tr click, silently skipping rows without coordinates.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| RED | Add failing tests for row-pan event | 504acc7 | frontend/src/tests/bee-table.test.ts |
| GREEN | Add _onRowClick handler and wire to tr | 1b6fe82 | frontend/src/bee-table.ts |

## Implementation

Added `_onRowClick(row: OccurrenceRow)` private method to `BeeTable` after `_onSortClick`. The method:
- Coerces `row.lat` and `row.lon` via `Number()` to handle SQLite string-typed values
- Guards `if (lat === null || lon === null) return` — no dispatch, no error
- Dispatches `new CustomEvent('row-pan', { detail: { lat, lon }, bubbles: true, composed: true })`

Wired to `<tr>` elements in the tbody map with `@click=${() => this._onRowClick(row as OccurrenceRow)} style="cursor: pointer"`.

## TDD Gate Compliance

- RED: `test(069-01)` commit 504acc7 — 2 new tests fail (timeout + style assertion)
- GREEN: `feat(069-01)` commit 1b6fe82 — all 163 tests pass
- REFACTOR: not needed

## Deviations from Plan

None — plan executed exactly as written.

## Known Stubs

None — `row-pan` event bubbles to `bee-atlas` where the pan handler will be wired (plan 069-02).

## Threat Flags

None — T-069-01 (lat/lon coercion) accepted per plan threat register; Number() coercion is safe for read-only display data.

## Self-Check: PASSED

- frontend/src/bee-table.ts: FOUND
- frontend/src/tests/bee-table.test.ts: FOUND
- .planning/phases/069-table-drawer/069-01-SUMMARY.md: FOUND
- Commit 504acc7 (RED): FOUND
- Commit 1b6fe82 (GREEN): FOUND
