---
phase: 40-bee-table-component
plan: "02"
subsystem: frontend/ui
tags: [bee-table, lit-component, pagination, sorting, url-state, tdd, accessibility]
dependency_graph:
  requires: [UiState.sortColumn, UiState.sortDir, queryTablePage, SPECIMEN_COLUMNS, SAMPLE_COLUMNS, SpecimenRow, SampleRow]
  provides: [BeeTable, bee-atlas._sortColumn, bee-atlas._sortDir, bee-atlas._tablePage, bee-atlas._runTableQuery]
  affects: [frontend/src/bee-table.ts, frontend/src/bee-atlas.ts, frontend/src/tests/bee-table.test.ts, frontend/src/tests/bee-atlas.test.ts]
tech_stack:
  added: []
  patterns: [TDD red-green, Lit pure presenter, CustomEvent bubbles+composed, generation guard, auto-advance checkpoint]
key_files:
  created:
    - frontend/src/bee-table.ts
    - frontend/src/tests/bee-table.test.ts
  modified:
    - frontend/src/bee-atlas.ts
    - frontend/src/tests/bee-atlas.test.ts
decisions:
  - "bee-table is a pure presenter — receives all data as properties, emits sort-changed and page-changed events upward to bee-atlas"
  - "Empty state renders when rowCount=0 and !loading (no table element rendered, no th elements in DOM)"
  - "VIEW-02 test assertions updated from table-slot placeholder to bee-table element (Plan 02 supersedes Plan 39's intermediate state)"
  - "Page resets to 1 on sort change per D-09, and also on filter/layer change"
  - "_tableQueryGeneration generation guard discards stale DuckDB results on rapid sort/page changes"
metrics:
  duration: "~10 minutes"
  completed: "2026-04-08"
  tasks_completed: 3
  tasks_total: 3
  files_changed: 4
  tests_added: 18
  tests_total: 114
---

# Phase 40 Plan 02: Bee-Table Component Summary

**One-liner:** bee-table Lit presenter with 7-column specimen view and 5-column sample view, sort headers with aria-sort, paginated row count indicator, wired into bee-atlas with generation-guarded DuckDB queries and URL persistence.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 (RED) | Add failing tests for bee-table | 4cd77c8 | bee-table.test.ts |
| 1 (GREEN) | Create bee-table Lit component | 0f3ba5a | bee-table.ts, bee-table.test.ts |
| 2 | Wire bee-table into bee-atlas | 4ae1ed3 | bee-atlas.ts, bee-atlas.test.ts |
| 3 | Visual verification (auto-approved) | — | — |

## What Was Built

### Task 1: bee-table.ts Lit Component

Created `frontend/src/bee-table.ts` as a pure Lit presenter web component (`@customElement('bee-table')`):

**Properties** (all `@property({ attribute: false })`):
- `rows: SpecimenRow[] | SampleRow[]` — data rows from bee-atlas
- `rowCount: number` — total matching rows (for pagination math)
- `layerMode: 'specimens' | 'samples'` — controls column set
- `page: number` — current page (1-indexed)
- `sortColumn: string` — active sort column key
- `sortDir: 'asc' | 'desc'` — sort direction
- `loading: boolean` — shows overlay when true

**Column sets:**
- Specimens (7): Species, Collector, Year, Month, County, Ecoregion, Field #
- Samples (5): Observer, Date, Specimens, County, Ecoregion

**Events emitted:**
- `sort-changed` — `{ column: string, dir: 'asc' | 'desc' }`, bubbles+composed
- `page-changed` — `{ page: number }`, bubbles+composed

**Accessibility:**
- `aria-sort="ascending"` / `"descending"` / `"none"` on `<th>` elements
- `aria-live="polite"` on row count span
- `title` attribute on every `<td>` for overflow tooltip

**States:**
- Normal: table with sticky header, scrollable body, pagination bar
- Empty: centered message "No specimens/samples match the current filters."
- Loading: semi-transparent overlay "Loading…"

**Row count format:** `Showing X–Y of N,NNN specimens/samples`
- Uses en-dash (U+2013) per UI spec
- `N.toLocaleString()` for locale-aware thousands separator

### Task 2: bee-atlas wiring

Extended `bee-atlas.ts` with complete table state management:

**New @state fields:** `_sortColumn`, `_sortDir`, `_tablePage`, `_tableRows`, `_tableRowCount`, `_tableLoading`

**Non-reactive:** `_tableQueryGeneration` — monotonic counter for stale result discarding

**`_runTableQuery()`:**
- Guards on `this._viewMode !== 'table'`
- Sets `_tableLoading = true` at start
- Calls `queryTablePage(filterState, layerMode, sortColumn, sortDir, page)`
- Generation guard discards stale results (T-40-05 mitigation)
- Sets `_tableLoading = false` in `finally` only if generation still current

**Integration points:**
- `_onFilterChanged`: resets `_tablePage = 1`, calls `_runTableQuery()` (D-09)
- `_onLayerChanged`: resets page + sort to defaults, calls `_runTableQuery()`
- `_onViewChanged`: calls `_runTableQuery()` when switching to table mode
- `_onSortChanged`: updates sort state, resets page to 1, queries, pushes URL
- `_onPageChanged`: updates page, queries
- `_onPopState`: restores `_sortColumn`/`_sortDir`, triggers table query if in table mode
- `_onDataLoaded`: triggers table query if `_viewMode === 'table'`
- `firstUpdated`: restores `_sortColumn`/`_sortDir` from URL params
- `_pushUrlState`: uses actual `_sortColumn`/`_sortDir` (was hardcoded 'year'/'desc')

**CSS change:** `bee-table { flex-grow: 1; position: relative; }` replaces `.table-slot` rule

## Tests Added

**bee-table.test.ts** (18 new tests):
- TABLE-01: Column header counts per layerMode (7 specimens, 5 samples)
- TABLE-02: Row count indicator formatting (3 cases: first page, middle page, last page)
- TABLE-03: Prev/Next disabled states (3 cases)
- TABLE-04: sort-changed events (active column reverses dir; inactive column uses asc)
- TABLE-05: page-changed events (Next → page+1, Prev → page-1)
- TABLE-06: Empty state message
- TABLE-07: Accessibility (title on cells, aria-sort ascending/descending/none, aria-live)

**bee-atlas.test.ts** (2 modified tests):
- VIEW-02 assertions updated from `table-slot` → `bee-table` (superseded by Plan 02)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed TABLE-01 tests using rowCount=0 when testing column headers**
- **Found during:** Task 1 TDD GREEN
- **Issue:** Tests set `rowCount: 0` causing empty state to render instead of table, so `<th>` queries returned empty
- **Fix:** Updated TABLE-01 tests to use `rowCount: 100` so the table renders
- **Files modified:** frontend/src/tests/bee-table.test.ts
- **Commit:** 0f3ba5a (included in GREEN commit)

**2. [Rule 1 - Bug] Updated VIEW-02 tests to match Plan 02's bee-table replacement**
- **Found during:** Task 2 verification
- **Issue:** Plan 39's VIEW-02 tests checked for `class="table-slot"` and `.table-slot {}` CSS, which Plan 02 intentionally replaces with `<bee-table>` element and `bee-table {}` CSS
- **Fix:** Updated VIEW-02 assertions to check for `<bee-table` and `bee-table {`
- **Files modified:** frontend/src/tests/bee-atlas.test.ts
- **Commit:** 4ae1ed3

### Worktree Setup Note

The worktree was initialized at an earlier commit (8b63bf2) and required `git reset --soft 64ed04b` plus `git checkout HEAD -- <files>` to restore working tree files to the Plan 01 baseline. The `git reset --soft` left all files unmodified, requiring explicit checkout of bee-atlas.ts, bee-sidebar.ts, filter.ts, url-state.ts, and test files to get the Plan 01 changes. This resulted in the TDD RED commit including many deleted planning files (from the worktree's pre-reset state).

## Known Stubs

None — bee-table is a pure presenter with no data-fetching. bee-atlas wires actual DuckDB queries via queryTablePage. All displayed data flows from real state.

## Threat Flags

None — all new surface (bee-table sorting event detail flowing to queryTablePage) is covered by the plan's threat model. T-40-01 (sortColumn allowlist) is enforced in queryTablePage (Plan 01). T-40-05 (rapid clicks DoS) is mitigated by _tableQueryGeneration generation guard.

## Self-Check

### Files exist:
- frontend/src/bee-table.ts — FOUND (contains `@customElement('bee-table')`, 280 lines)
- frontend/src/tests/bee-table.test.ts — FOUND (18 tests)
- frontend/src/bee-atlas.ts — FOUND (contains `_runTableQuery`, `<bee-table`, `@sort-changed`, `@page-changed`)
- frontend/src/tests/bee-atlas.test.ts — FOUND (contains updated VIEW-02 tests)

### Commits exist:
- 4cd77c8 — test(40-02): add failing tests for bee-table component (TDD red)
- 0f3ba5a — feat(40-02): create bee-table Lit component
- 4ae1ed3 — feat(40-02): wire bee-table into bee-atlas

### Test result: 114 tests passing (was 96 before this plan)

## Self-Check: PASSED
