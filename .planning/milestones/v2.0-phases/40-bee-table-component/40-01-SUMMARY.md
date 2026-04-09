---
phase: 40-bee-table-component
plan: "01"
subsystem: frontend/data-layer
tags: [url-state, filter, duckdb, pagination, sql-injection-protection]
dependency_graph:
  requires: []
  provides: [UiState.sortColumn, UiState.sortDir, queryTablePage, SPECIMEN_COLUMNS, SAMPLE_COLUMNS, SpecimenRow, SampleRow]
  affects: [frontend/src/url-state.ts, frontend/src/filter.ts, frontend/src/bee-atlas.ts]
tech_stack:
  added: []
  patterns: [TDD red-green, allowlist-based SQL injection protection, DuckDB connection finally-close]
key_files:
  created: []
  modified:
    - frontend/src/url-state.ts
    - frontend/src/filter.ts
    - frontend/src/bee-atlas.ts
    - frontend/src/tests/url-state.test.ts
    - frontend/src/tests/filter.test.ts
decisions:
  - "sortColumn defaults to 'year' and sortDir defaults to 'desc' (D-07 — absence of URL params implies year/desc)"
  - "PAGE_SIZE constant set to 100 rows per page"
  - "bee-atlas.ts buildParams calls use hardcoded sortColumn/sortDir defaults pending Plan 02 reactive state"
metrics:
  duration: "~10 minutes"
  completed: "2026-04-08"
  tasks_completed: 2
  tasks_total: 2
  files_changed: 5
  tests_added: 19
  tests_total: 96
---

# Phase 40 Plan 01: Bee-Table Data Layer Summary

**One-liner:** Sort URL params (sortColumn/sortDir) added to UiState with DuckDB pagination via queryTablePage using allowlist-based SQL injection protection.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Extend UiState with sortColumn/sortDir and URL serialization | 375bf0b | url-state.ts, url-state.test.ts, bee-atlas.ts |
| 2 | Add queryTablePage, row types, and column constants to filter.ts | 3571ba1 | filter.ts, filter.test.ts |

## What Was Built

### Task 1: UiState sortColumn/sortDir

Extended `UiState` interface with two new required fields:
- `sortColumn: string` — UI column key (e.g. `'year'`, `'species'`)
- `sortDir: 'asc' | 'desc'` — sort direction

Serialization follows D-07 (omit-when-default):
- `buildParams` only emits `sort=` when sortColumn !== 'year'
- `buildParams` only emits `dir=` when sortDir !== 'desc'
- `parseParams` restores both with correct defaults on missing params
- Safety fallback: any `dir` value other than `'asc'` parses as `'desc'`

Updated `bee-atlas.ts` both `buildParams` call sites to pass `sortColumn: 'year', sortDir: 'desc'` (temporary defaults until Plan 02 adds reactive `_sortColumn`/`_sortDir` state).

### Task 2: queryTablePage + types + constants

Added to `filter.ts`:
- `SpecimenRow` interface (7 fields matching ecdysis table columns)
- `SampleRow` interface (5 fields matching samples table columns)
- `SPECIMEN_COLUMNS` — maps UI keys to SQL column names (allowlist)
- `SAMPLE_COLUMNS` — maps UI keys to SQL column names (allowlist)
- `queryTablePage(f, layerMode, sortCol, sortDir, page)` — paginates DuckDB with WHERE from `buildFilterSQL`, ORDER BY validated column, LIMIT 100 OFFSET

Security mitigations implemented per threat model:
- **T-40-01**: `columns[sortCol]` lookup — unknown keys return `undefined`, falls back to default column (`'year'` for specimens, `'date'` for samples)
- **T-40-02**: `sortDir === 'asc' ? 'ASC' : 'DESC'` ternary — only two literal SQL values possible

## Tests Added

**url-state.test.ts** (8 new tests in `sort param round-trip` describe block):
- Default sort omits params
- Non-default sortColumn emits `sort=` param
- Non-default sortDir emits `dir=` param
- Both non-default emits both params
- parseParams returns defaults when no params
- parseParams parses `sort=species&dir=asc` correctly
- Invalid dir value falls back to `'desc'`
- Full round-trip preserves non-default state

**filter.test.ts** (11 new tests):
- SPECIMEN_COLUMNS mappings (4 assertions)
- SAMPLE_COLUMNS mappings (1 assertion covering all 5 keys)
- queryTablePage specimens SQL contains correct columns
- queryTablePage SQL contains ORDER BY and LIMIT 100 OFFSET
- queryTablePage samples SQL contains correct columns
- queryTablePage returns `{ rows, total }` with correct values
- Invalid sort column falls back without SQL injection
- conn.close called in finally block even on error

## Deviations from Plan

None — plan executed exactly as written.

## Known Stubs

None — all exports are fully implemented. `bee-atlas.ts` uses hardcoded `sortColumn: 'year', sortDir: 'desc'` defaults which is intentional per the plan action (Plan 02 will wire reactive state).

## Threat Flags

None — all new surface (queryTablePage SQL interpolation) is covered by the plan's threat model with mitigations implemented.

## Self-Check

### Files exist:
- frontend/src/url-state.ts — FOUND (contains `sortColumn: string`)
- frontend/src/filter.ts — FOUND (contains `queryTablePage`, `SPECIMEN_COLUMNS`, `SAMPLE_COLUMNS`)
- frontend/src/tests/url-state.test.ts — FOUND (contains `sort param round-trip` describe block)
- frontend/src/tests/filter.test.ts — FOUND (contains `queryTablePage` tests)

### Commits exist:
- 375bf0b — feat(40-01): extend UiState with sortColumn/sortDir
- 3571ba1 — feat(40-01): add queryTablePage, row types, and column constants

### Test result: 96 tests passing (was 85 before this plan)

## Self-Check: PASSED
