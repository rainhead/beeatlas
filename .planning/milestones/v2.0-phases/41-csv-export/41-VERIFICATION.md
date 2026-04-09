---
phase: 41-csv-export
verified: 2026-04-08T20:32:30Z
status: human_needed
score: 3/3 must-haves verified
overrides_applied: 0
human_verification:
  - test: "Open the app in table view. Click the 'Download CSV' button. Verify a file downloads."
    expected: "Browser prompts to save or auto-downloads a .csv file containing all columns from the parquet dataset (not just the table display columns), with all rows matching the current filter and no pagination cap."
    why_human: "Browser file download via Blob URL + anchor click cannot be verified without a running browser. DuckDB WASM execution with real parquet data also cannot be exercised in a headless test."
  - test: "Apply a filter (e.g. genus 'Bombus' with yearFrom=2023, yearTo=2023), then click Download CSV."
    expected: "Downloaded filename is 'specimens-bombus-2023.csv'. Apply another filter with county only (e.g. 'King') and verify filename is 'specimens-king.csv'. With no filter active, verify filename is 'specimens-all.csv' or 'samples-all.csv' depending on layer mode."
    why_human: "Filename correctness as presented by the browser's save dialog / auto-download name requires a real browser and UI interaction to confirm."
---

# Phase 41: CSV Export Verification Report

**Phase Goal:** Users can download the full filtered result set as a CSV file with a descriptive filename
**Verified:** 2026-04-08T20:32:30Z
**Status:** human_needed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Clicking "Download CSV" triggers a browser file download of the complete filtered result set (not just the current page) | ✓ VERIFIED (code) | `_onDownloadCsv` in `bee-atlas.ts` L654–686 calls `queryAllFiltered` (no LIMIT), builds a CSV Blob, creates an `<a>` element with `.download`, and clicks it. `bee-table.ts` L149–154 dispatches the `download-csv` CustomEvent that triggers the handler. |
| 2 | The downloaded filename reflects the active filter state (e.g. `specimens-bombus-2023.csv` or `samples-all.csv`) | ✓ VERIFIED (code + tests) | `buildCsvFilename` in `filter.ts` L77–119 constructs priority-ordered slugified segments. 13 unit tests in `filter.test.ts` cover all documented filename cases and pass (111/112 tests pass; 1 failure is a pre-existing unrelated test). |
| 3 | CSV contains all parquet columns, not just the table display columns | ✓ VERIFIED | `queryAllFiltered` in `filter.ts` L121–145 selects all 16 ecdysis columns and all 9 sample columns by name (hardcoded full list, no LIMIT), matching the column list from `scripts/validate-schema.mjs`. |

**Score:** 3/3 truths verified (programmatic code verification)

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `frontend/src/filter.ts` | `queryAllFiltered` and `buildCsvFilename` functions | ✓ VERIFIED | Both functions present at L77 and L121. Exported. Substantive implementations. |
| `frontend/src/bee-table.ts` | Download CSV button in pagination bar | ✓ VERIFIED | Button at L230–234 with class `download-csv-btn`, `@click=${this._onDownloadCsv}`, text "Download CSV". `_onDownloadCsv` dispatches CustomEvent at L149–154. |
| `frontend/src/bee-atlas.ts` | `_onDownloadCsv` handler wired to bee-table | ✓ VERIFIED | Handler at L654–686. `@download-csv=${this._onDownloadCsv}` in `render()` at L165. Imports `queryAllFiltered` and `buildCsvFilename` at L3. |
| `frontend/src/tests/filter.test.ts` | Unit tests for `buildCsvFilename` | ✓ VERIFIED | 13 tests in `describe('buildCsvFilename')` block L141–200. All pass. |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `bee-table.ts` | `bee-atlas.ts` | `download-csv` CustomEvent | ✓ WIRED | `bee-table.ts` L150 dispatches `'download-csv'`; `bee-atlas.ts` L165 binds `@download-csv=${this._onDownloadCsv}` on `<bee-table>` element |
| `bee-atlas.ts` | `filter.ts` | `queryAllFiltered` and `buildCsvFilename` calls | ✓ WIRED | Both imported at L3; `queryAllFiltered` called at L656; `buildCsvFilename` called at L674 |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|---------------|--------|-------------------|--------|
| `bee-atlas.ts _onDownloadCsv` | `rows` | `queryAllFiltered(this._filterState, this._layerMode)` | DuckDB WASM query on real parquet — no LIMIT, uses `buildFilterSQL` WHERE clause | ✓ FLOWING (by code inspection; requires browser to execute) |
| `buildCsvFilename` | return value | `this._filterState` (reactive `@state()`) | Real filter state owned by `bee-atlas`, updated by sidebar events | ✓ FLOWING |

### Behavioral Spot-Checks

Step 7b: SKIPPED — requires DuckDB WASM running in browser. The download handler cannot be exercised headlessly; all behavioral verification routed to human verification items above.

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|----------|
| CSV-01 | 41-01-PLAN.md | User can download the full filtered result set via "Download CSV" button (no pagination limit) | ✓ SATISFIED | `queryAllFiltered` issues `SELECT ... FROM ... WHERE ... ORDER BY` with no LIMIT. Blob download triggered via `<a>.click()`. |
| CSV-02 | 41-01-PLAN.md | Downloaded filename reflects active filter state | ✓ SATISFIED | `buildCsvFilename` implements priority-ordered slugified segments; tested by 13 unit tests. |

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `bee-atlas.ts` | 657 | `if (rows.length === 0) return;` — silently aborts download with no user feedback | ℹ️ Info | Edge case: user clicks Download CSV with empty filter result; nothing happens, no message shown. Not a blocker — matches plan spec ("if rows.length === 0 return"). |

No TODOs, FIXMEs, placeholder returns, or stub implementations found in phase-41 modified files.

### Human Verification Required

#### 1. Full download executes (CSV-01)

**Test:** Open the app in table view. Optionally apply a filter. Click the "Download CSV" button in the pagination bar.
**Expected:** Browser downloads a CSV file containing all rows matching the active filter (not just the current page of 100), with all parquet columns as headers (e.g. `ecdysis_id, occurrenceID, longitude, latitude, date, year, month, scientificName, recordedBy, fieldNumber, genus, family, floralHost, county, ecoregion_l3, inat_observation_id` for specimens). Values with commas or double-quotes should be properly RFC-4180 quoted.
**Why human:** Browser file download via Blob URL + `<a>.click()` and DuckDB WASM query on real parquet data cannot be verified without a running browser environment.

#### 2. Filename reflects filter state (CSV-02)

**Test:** (a) With no filter, click Download CSV in specimens mode. (b) Apply genus=Bombus + yearFrom=2023, yearTo=2023, click Download CSV. (c) Switch to samples mode with no filter, click Download CSV.
**Expected:** (a) `specimens-all.csv`. (b) `specimens-bombus-2023.csv`. (c) `samples-all.csv`.
**Why human:** The browser's download dialog / auto-download filename must be observed directly.

### Gaps Summary

No gaps found. All three observable truths are verified at the code level:

- `queryAllFiltered` is substantive, exports all parquet columns, uses no LIMIT, and follows the established `queryTablePage` pattern.
- `buildCsvFilename` is substantive, covers all documented priority/segment cases, is tested by 13 passing unit tests.
- The event chain `bee-table → download-csv → bee-atlas._onDownloadCsv → queryAllFiltered + buildCsvFilename → Blob download` is fully wired.
- TypeScript compiles cleanly (`npx tsc --noEmit` exits 0).
- 111/112 tests pass. The 1 failure (`bee-sidebar.test.ts DECOMP-01 boundaryMode property`) is pre-existing and documented in the SUMMARY as out-of-scope.

Status is `human_needed` because the browser download behavior (Blob URL click, DuckDB WASM execution, filename as shown in OS save dialog) cannot be verified without a live browser session.

---

_Verified: 2026-04-08T20:32:30Z_
_Verifier: Claude (gsd-verifier)_
