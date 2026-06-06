---
phase: 141-built-asset-fixtures-red-test-fixes-silent-skip-elimination
plan: "01"
subsystem: data-tests
tags: [fixtures, conftest, pytest, duckdb, d05-guard, silent-skip]
dependency_graph:
  requires: []
  provides:
    - data/tests/fixtures/species_fixture.csv
    - data/tests/fixtures/higher_taxa_fixture.csv
    - data/tests/fixtures/occurrences_fixture.csv
    - data/tests/conftest.py::pytest_runtest_makereport
  affects:
    - Plans 03/04 (consume fixture CSVs via sandbox_parquet / synonymy_sandbox builders)
    - All fast-tier tests (D-05 guard now fires on asset-driven skips)
tech_stack:
  added: []
  patterns:
    - DuckDB comment-skip heuristic (multi-column CSVs skip # lines via auto_detect)
    - pytest hookwrapper (outcome = yield + report.outcome mutation, NOT force_exception)
key_files:
  created:
    - data/tests/fixtures/species_fixture.csv
    - data/tests/fixtures/higher_taxa_fixture.csv
    - data/tests/fixtures/occurrences_fixture.csv
  modified:
    - data/tests/conftest.py
decisions:
  - "occurrences_fixture.csv uses 2 columns (canonical_name + _source) rather than 1 because DuckDB 1.5.2 auto_detect does not skip # comment lines in single-column CSVs; Plan-03 builder uses CREATE TABLE + INSERT + COPY anyway (not read_csv on this file)"
  - "D-05 guard uses report.outcome = 'failed' mutation (not outcome.force_exception) — force_exception causes INTERNALERROR in pytest 9.0.3 by propagating the exception up the hook chain unhandled"
metrics:
  duration: "~8 minutes"
  completed: "2026-06-06"
  tasks: 2
  files: 4
requirements_met:
  - TFIXTURE-03
  - TFIX-04
---

# Phase 141 Plan 01: Fixture CSVs and D-05 Silent-Skip Guard Summary

Three distilled CSV fixtures for the Plan-03 parquet builders plus a conftest hookwrapper guard that converts asset-driven fast-tier skips into failures.

## What Was Built

### Task 1: Three Distilled Fixture CSVs (commit 88f2be4)

**data/tests/fixtures/species_fixture.csv** — 21-column, 2-row species fixture.

- Row 1: Agapostemon subtilior (Halictidae/Halictinae, taxon_id=1581467)
- Row 2: Bombus mixtus (Apidae/Apinae, taxon_id=52775)
- Covers slug assertions, inat_obs_count column presence, _check_slug_collisions (unique genus+epithet pairs per family), subfamily presence
- Hash provenance comments skipped by DuckDB auto_detect (multi-column heuristic)

**data/tests/fixtures/higher_taxa_fixture.csv** — 12-column fixture with 4 rows:

- 2 rank=subfamily rows (Halictinae, Apinae) — subfamily NAME in name column, subfamily column NULL (matches real parquet shape)
- 2 rank=genus rows (Agapostemon, Bombus)
- The == 12 subfamilies assertion (test_higher_taxa_json_written_and_12_subfamilies) is deferred to @integration in Plan 03 (real-dataset property, not code behavior)

**data/tests/fixtures/occurrences_fixture.csv** — 2-column (canonical_name, _source), 1 data row.

- canonical_name = 'agapostemon subtilior'; zero rows for agapostemon texanus
- Second column required for DuckDB auto_detect to skip hash comment lines (single-column CSVs do not trigger the comment-skip heuristic in DuckDB 1.5.2)
- Plan-03 synonymy_sandbox builder uses CREATE TABLE + INSERT + COPY approach (does not call read_csv on this file)

All three files carry "Distilled from" in hash-prefixed provenance comment lines (D-10).

### Task 2: D-05 Silent-Skip Guard (commit a8ea8ef)

Added to data/tests/conftest.py (after export_dir fixture):

- `_ASSET_SKIP_SIGNATURES` tuple with all three known asset-skip reason substrings
- `pytest_runtest_makereport` hookwrapper: generator form with `@pytest.hookimpl(hookwrapper=True)` and `outcome = yield` (Pitfall 5: plain function silently ignored)
- Converts matching skips to FAILED via `report.outcome = "failed"` + `report.longrepr` mutation
- Early-returns for: non-skipped outcomes, wasxfail attribute (xfail), @integration-marked items

**Active-fire verified:** synthetic test whose skip reason contains the dbt-build string exits non-zero (guard fires correctly). Non-matching skip ("network unavailable") exits 0 (no false positive). dev-host test_species_export.py (10 tests, assets present) all pass — guard inert.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] occurrences_fixture.csv requires 2 columns for DuckDB comment-skip heuristic**

- **Found during:** Task 1 verification
- **Issue:** DuckDB 1.5.2 `read_csv(auto_detect=True)` does not skip `#` comment lines in single-column CSVs. The auto-detect heuristic uses `skip=N` (row count) derived from structural analysis, which only triggers when multiple columns allow the parser to identify which rows are non-data. A single-column CSV with hash-comment lines causes the first comment line to be treated as the column header.
- **Fix:** Added `_source` as a second column (value: `ecdysis`). The Plan-03 builder uses `CREATE TABLE + INSERT + COPY` (not `read_csv`) on this file anyway, so the extra column is inert in production use. `SELECT canonical_name` in verify returns `['agapostemon subtilior']` correctly.
- **Files modified:** data/tests/fixtures/occurrences_fixture.csv
- **Commit:** 88f2be4

**2. [Rule 1 - Bug] outcome.force_exception causes INTERNALERROR in pytest 9.0.3**

- **Found during:** Task 2 active-fire test
- **Issue:** `outcome.force_exception(pytest.fail.Exception(...))` causes pluggy to propagate the exception up the hookwrapper chain unhandled, producing an INTERNALERROR in pytest's runtestloop rather than a clean FAILED report. While the test process does exit non-zero (the guard "fires"), the INTERNALERROR is not a valid test failure — it crashes the runner machinery.
- **Fix:** Replaced `outcome.force_exception(...)` with direct `report.outcome = "failed"` + `report.longrepr = "..."` mutation. This is the correct approach for converting skips to failures in `pytest_runtest_makereport` hookwrappers — it mutates the report object which is then consumed by the reporter normally.
- **Files modified:** data/tests/conftest.py
- **Commit:** a8ea8ef

## Threat Flags

None — no new trust boundaries, network endpoints, or untrusted-input parsing introduced. These are static test-infrastructure files only.

## Known Stubs

None — all fixture data is wired and intentional. The occurrences_fixture.csv `_source` column is a structural placeholder, not a stub; the Plan-03 builder does not use it.

## Self-Check: PASSED

- data/tests/fixtures/species_fixture.csv: FOUND (git ls-files confirms)
- data/tests/fixtures/higher_taxa_fixture.csv: FOUND
- data/tests/fixtures/occurrences_fixture.csv: FOUND
- data/tests/conftest.py: MODIFIED with pytest_runtest_makereport hookwrapper
- Commit 88f2be4: verified (git log --oneline)
- Commit a8ea8ef: verified (git log --oneline)
- DuckDB read_csv verify: FIXTURES_OK
- D-05 active-fire: PASSED (fire=non-zero, inert=zero, dev-host=green)
