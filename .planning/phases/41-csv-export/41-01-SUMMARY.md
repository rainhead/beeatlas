---
phase: 41-csv-export
plan: "01"
subsystem: frontend
tags: [csv-export, filter, bee-table, bee-atlas, duckdb]
dependency_graph:
  requires: []
  provides: [csv-export-button, queryAllFiltered, buildCsvFilename]
  affects: [frontend/src/filter.ts, frontend/src/bee-table.ts, frontend/src/bee-atlas.ts]
tech_stack:
  added: []
  patterns: [event-up-property-down, browser-download-blob, tdd-red-green]
key_files:
  created: []
  modified:
    - frontend/src/filter.ts
    - frontend/src/bee-table.ts
    - frontend/src/bee-atlas.ts
    - frontend/src/tests/filter.test.ts
decisions:
  - "slugify uses .values().next().value instead of spread index to satisfy TypeScript strict Set element typing"
  - "buildCsvFilename priority: taxon > collector > year > county/ecoregion, at most 2 segments"
  - "queryAllFiltered uses full hardcoded column list (not SELECT *) to guarantee column order in CSV headers"
metrics:
  duration: "~15 minutes"
  completed: "2026-04-08"
  tasks_completed: 2
  files_modified: 4
---

# Phase 41 Plan 01: CSV Export Summary

**One-liner:** CSV export with `buildCsvFilename` (priority-based slugified filename) and `queryAllFiltered` (no-LIMIT DuckDB query), triggered by Download CSV button in bee-table pagination bar via event-up pattern.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Add queryAllFiltered and buildCsvFilename to filter.ts with tests | 8210f3a | frontend/src/filter.ts, frontend/src/tests/filter.test.ts |
| 2 | Add Download CSV button to bee-table and wire handler in bee-atlas | 9aeda36 | frontend/src/bee-table.ts, frontend/src/bee-atlas.ts, frontend/src/filter.ts |

## What Was Built

### `filter.ts` additions

**`slugify(s: string): string`** (internal helper)
Normalizes filename segments: lowercase, spaces→hyphens, strip non-alphanumeric, collapse hyphens, trim edges, slice to 20 chars. Satisfies T-41-03 (tamper mitigation for filenames).

**`buildCsvFilename(f: FilterState, layerMode): string`**
- Returns `{layerMode}-all.csv` when no filter active.
- Builds up to 2 segments in priority order: taxon > collector > year > county/ecoregion.
- Year: single value if `yearFrom === yearTo` or only one bound; range `{from}-{to}` otherwise.
- All segments slugified and truncated to 20 chars per D-09.

**`queryAllFiltered(f: FilterState, layerMode): Promise<Record<string, unknown>[]>`**
- Follows the `queryTablePage` pattern (`await tablesReady`, `getDuckDB`, `connect`, `try/finally close`).
- Specimens: full 16-column list from `validate-schema.mjs`.
- Samples: 9-column list with `strftime(date, '%Y-%m-%d') as date` formatting.
- No LIMIT clause — returns all rows.

### `bee-table.ts` additions

- `_onDownloadCsv()` private method dispatching `download-csv` CustomEvent (`bubbles: true, composed: true`).
- "Download CSV" button with class `download-csv-btn` placed after `.pagination-center` on right side of pagination bar, inheriting `.pagination button` styles.

### `bee-atlas.ts` additions

- Added `queryAllFiltered` and `buildCsvFilename` to existing `filter.ts` import.
- Added `@download-csv=${this._onDownloadCsv}` on `<bee-table>` element.
- `_onDownloadCsv()` async handler: queries all filtered rows, builds CSV with RFC 4180 quoting (escapes commas, double-quotes, newlines), creates Blob URL, triggers download via dynamically created `<a>` element, revokes URL.

## Test Coverage

13 new unit tests added to `filter.test.ts` under `describe('buildCsvFilename')`:
- Empty filter → `specimens-all.csv`, `samples-all.csv`
- Taxon only, taxon + same year, taxon + year range, taxon + county
- County only, collector only, year-from only
- Taxon with spaces (slugified), segment truncation to 20 chars
- Samples mode passthrough

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] TypeScript error: Set spread indexing returns `string | undefined`**
- **Found during:** Task 2 TypeScript compile check
- **Issue:** `[...f.selectedCounties][0]` has type `string | undefined` in strict TypeScript, which `slugify(s: string)` does not accept.
- **Fix:** Replaced with `f.selectedCounties.values().next().value as string` — safe because guarded by `.size > 0`.
- **Files modified:** `frontend/src/filter.ts`
- **Commit:** 9aeda36

**2. [Rule 1 - Bug] Test expectation for 20-char truncation was wrong**
- **Found during:** Task 1 GREEN phase
- **Issue:** Test expected `'specimens-averyverylongtaxon.csv'` but slugify of `'Averyverylongtaxonnamethatexceeds'` → `'averyverylongtaxonna'` (20 chars exactly).
- **Fix:** Corrected test expectation to `'specimens-averyverylongtaxonna.csv'`.
- **Files modified:** `frontend/src/tests/filter.test.ts`
- **Commit:** 8210f3a

## Pre-existing Failures (Out of Scope)

One pre-existing test failure unrelated to this plan:
- `bee-sidebar.test.ts > DECOMP-01: BeeFilterControls has @property declarations for required inputs` — fails on `boundaryMode` property check. This was failing before this plan and is not caused by any changes here. Deferred per scope boundary.

## Threat Coverage

All T-41-xx threats from plan addressed:
- T-41-01 (SQL injection): `buildFilterSQL` escaping unchanged; column list hardcoded.
- T-41-02 (info disclosure): CSV exposes same data as existing table UI. Accepted.
- T-41-03 (filename tampering): `slugify` strips all chars except `[a-z0-9-]`, caps at 20 chars. Mitigated.
- T-41-04 (DoS from large CSV): Data bounded by in-browser DuckDB parquet size. Accepted.

## Self-Check: PASSED

- `frontend/src/filter.ts` — exists and contains `queryAllFiltered` and `buildCsvFilename`
- `frontend/src/bee-table.ts` — exists and contains `download-csv` button
- `frontend/src/bee-atlas.ts` — exists and contains `_onDownloadCsv`
- `frontend/src/tests/filter.test.ts` — exists and contains new `buildCsvFilename` tests
- Commits 8210f3a and 9aeda36 exist in git log
- TypeScript compiles cleanly (`npx tsc --noEmit`)
- 111 tests pass (1 pre-existing unrelated failure)
