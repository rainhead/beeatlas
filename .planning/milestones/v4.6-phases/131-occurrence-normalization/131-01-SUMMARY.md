---
phase: 131-occurrence-normalization
plan: "01"
subsystem: test
tags: [tdd, red-tests, geo_blob, occurrence-normalization, wave-0]
dependency_graph:
  requires: []
  provides:
    - RED tests for 7-field geo_blob layout + { geojson } return (build-geojson.test.ts)
    - RED tests for LEFT JOIN taxa + display_name + slimmer OCCURRENCE_COLUMNS (filter.test.ts)
    - RED fixtures using display_name and slimmed DataSummary (bee-table.test.ts)
  affects:
    - src/tests/build-geojson.test.ts
    - src/tests/filter.test.ts
    - src/tests/bee-table.test.ts
tech_stack:
  added: []
  patterns:
    - Wave 0 RED-test pattern (tests encode target behavior before implementation)
    - toRow() fixture helper with explicit positional layout comment
key_files:
  created: []
  modified:
    - src/tests/build-geojson.test.ts
    - src/tests/filter.test.ts
    - src/tests/bee-table.test.ts
decisions:
  - Renamed test descriptions to avoid positive references to dropped column names (satisfies grep-c=0 acceptance criterion)
  - Added explicit species-column render test to bee-table.test.ts to make it RED (the existing tests did not assert species cell content)
metrics:
  duration: "~8 minutes"
  completed: "2026-06-03"
  tasks_completed: 3
  tasks_total: 3
  files_changed: 3
requirements_completed: [NORM-01, NORM-02, NORM-03]
---

# Phase 131 Plan 01: Wave 0 RED Tests Summary

**One-liner:** Three test files rewritten to encode the 7-field geo_blob layout, LEFT JOIN taxa display_name query, and slimmed DataSummary — all RED against current source, awaiting Plans 02/03 to turn them GREEN.

## What Was Done

### Task 1: build-geojson.test.ts
- Rewrote `RowOverride` interface and `toRow()` helper from 10-field to 7-field positional layout
- `source` moves from index 9 to index 6; two dedicated tests pin this position explicitly
- Added return-shape assertion: `Object.keys(result)` must equal `['geojson']` (no `summary`, no `taxaOptions`)
- Removed all summary/taxaOptions assertions from existing tests
- Kept occId formation, lat/lon null-skip, and recencyTier tests (updated to 7-field fixtures)
- **RED failures (3):** return shape, source-at-6 for ecdysis, source-at-6 for inat_obs

### Task 2: filter.test.ts
- Replaced `toContain('scientificName')` OCCURRENCE_COLUMNS test with assertion that the 4 dropped columns are ABSENT
- Added `queryTablePage` test asserting SQL contains `LEFT JOIN taxa` and `display_name`
- Removed `scientificName` from the SQL-column-presence test (keep retained columns only)
- Replaced `scientificName: 'Bombus'` with `display_name: 'Bombus vosnesenskii'` in mock result row fixtures
- **RED failures (2):** OCCURRENCE_COLUMNS still contains dropped columns; SQL missing JOIN + display_name

### Task 3: bee-table.test.ts
- Updated OCCURRENCE_COLUMNS mock: removed 4 dropped columns, added `display_name`
- Updated DataSummary mock in `features.ts` mock: removed `speciesCount`, `genusCount`, `familyCount`
- Changed TABLE-07 and TABLE-09 `baseRow` fixtures: `scientificName` → `display_name`
- Added Species-column render test asserting the species cell text comes from `display_name` (this is what makes the file RED — no existing test asserted the species cell content by value)
- **RED failure (1):** Species cell renders "No Determination" instead of "Bombus vosnesenskii" (bee-table.ts still uses `dataField: 'scientificName'`)

## Verification

```
Tests  6 failed | 85 passed (91)
Test Files  3 failed (3)
```

All 6 failures are correct assertion errors (wrong data), not syntax/import errors. The test infrastructure loads and imports cleanly.

## Deviations from Plan

**1. [Rule 2 - Missing] bee-table.test.ts required an additional test**

- **Found during:** Task 3
- **Issue:** None of the existing TABLE-07/TABLE-09 tests asserted the species cell content by value, so changing the fixture key from `scientificName` to `display_name` alone didn't make the file RED (the old tests passed regardless).
- **Fix:** Added `'Species column renders from display_name field (target behavior)'` test in TABLE-07 that asserts `speciesCell.textContent === 'Bombus vosnesenskii'`. This is the RED gate.
- **Files modified:** `src/tests/bee-table.test.ts`
- **Commit:** 1f07adb

## Threat Flags

None — this plan modifies only Vitest test files; no runtime surface introduced.

## Self-Check: PASSED

- [x] `src/tests/build-geojson.test.ts` exists and is RED (3 failures)
- [x] `src/tests/filter.test.ts` exists and is RED (2 failures)
- [x] `src/tests/bee-table.test.ts` exists and is RED (1 failure)
- [x] Commits: 88475e0, 383edd7, 1f07adb
- [x] `grep -c "scientificName\|taxaOptions\|speciesCount\|genusCount\|familyCount" src/tests/build-geojson.test.ts` = 0
- [x] `grep -c "scientificName\|speciesCount\|genusCount\|familyCount" src/tests/bee-table.test.ts` = 0
- [x] `grep -q "LEFT JOIN taxa" src/tests/filter.test.ts` succeeds
- [x] `grep -q "display_name" src/tests/filter.test.ts` succeeds
- [x] `grep -q "display_name" src/tests/bee-table.test.ts` succeeds
