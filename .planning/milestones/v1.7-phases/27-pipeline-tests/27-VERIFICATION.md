---
phase: 27-pipeline-tests
verified: 2026-03-29T04:00:00Z
status: passed
score: 6/6 must-haves verified
re_verification: false
---

# Phase 27: Pipeline Tests Verification Report

**Phase Goal:** pytest covers export.py schema correctness and at least one dlt pipeline module using a minimal fixture DuckDB
**Verified:** 2026-03-29T04:00:00Z
**Status:** passed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | `uv run pytest` in data/ discovers and runs all tests | VERIFIED | 13 tests collected and run; exits 0 in 0.97s |
| 2 | `_extract_inat_id` is a standalone function in ecdysis_pipeline.py | VERIFIED | `def _extract_inat_id(html: str | None) -> int | None:` at line 91; `occurrence_links()` calls `_extract_inat_id(html)` at line 173 |
| 3 | Transform tests pass for happy path, null geojson, empty project_ids, malformed HTML | VERIFIED | 7 passing unit tests in test_transforms.py covering all four cases |
| 4 | Export tests verify correct Parquet columns matching validate-schema.mjs | VERIFIED | `EXPECTED_ECDYSIS_COLS` (15 cols) and `EXPECTED_SAMPLES_COLS` (9 cols) asserted via DESCRIBE on output files; all pass |
| 5 | Export tests verify valid non-empty GeoJSON output | VERIFIED | test_counties_geojson and test_ecoregions_geojson assert FeatureCollection type, len>=1, geometry key, and correct property names (NAME, NA_L3NAME) |
| 6 | All tests pass without network access or AWS credentials | VERIFIED | Suite passes with AWS credentials unset; fixture DB uses embedded WKT constants, no network calls |

**Score:** 6/6 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `data/ecdysis_pipeline.py` | Extracted `_extract_inat_id` pure function | VERIFIED | `def _extract_inat_id` at line 91; called at line 173 from `occurrence_links()` |
| `data/tests/conftest.py` | Session-scoped fixture DuckDB with all schemas | VERIFIED | `fixture_db` and `fixture_con` fixtures; creates geographies, ecdysis_data, inaturalist_data schemas with seed rows |
| `data/tests/test_transforms.py` | Unit tests for `_transform` and `_extract_inat_id` | VERIFIED | 7 tests: 3 for `_transform`, 4 for `_extract_inat_id`; all pass |
| `data/tests/test_export.py` | Integration tests for all four export functions | VERIFIED | 6 tests covering all four export functions; all pass |
| `data/pyproject.toml` | pytest configuration | VERIFIED | `[tool.pytest.ini_options]` with `testpaths = ["tests"]` at lines 21-22 |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `data/tests/conftest.py` | `data/export.py` | `monkeypatch.setattr(export_mod, 'ASSETS_DIR', export_dir)` | WIRED | Pattern found at line 35, 51, 74, 90, 112, 130 of test_export.py |
| `data/tests/test_transforms.py` | `data/inaturalist_pipeline.py` | `from inaturalist_pipeline import _transform` | WIRED | Line 7 of test_transforms.py |
| `data/tests/test_transforms.py` | `data/ecdysis_pipeline.py` | `from ecdysis_pipeline import _extract_inat_id` | WIRED | Line 8 of test_transforms.py |
| `data/tests/test_export.py` | `data/export.py` | `import export as export_mod` | WIRED | Line 11 of test_export.py; all four export functions called |

### Data-Flow Trace (Level 4)

Not applicable — these are test files. The fixture data flows from `conftest.py` seed rows through `fixture_con` into export functions, and the test assertions operate on the output files. The actual data-flow correctness is verified by the passing tests themselves (e.g., `test_ecdysis_parquet_has_rows` confirms non-null county and ecoregion_l3, proving the spatial join in `export.py` executes against the fixture WKT polygons and returns real results).

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Full test suite passes | `uv run pytest -v` from data/ | 13 passed in 0.97s | PASS |
| Tests pass without AWS credentials | `unset AWS_*; uv run pytest -v` | 13 passed in 0.78s | PASS |
| pytest discovers tests | `uv run pytest --collect-only -q` | 13 items collected | PASS |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|-------------|--------|----------|
| TEST-01 | 27-01-PLAN.md | `conftest.py` creates a programmatic DuckDB fixture with ecdysis, inat observations, and geographies tables; no committed binary file | SATISFIED | `data/tests/conftest.py` exists with session-scoped fixture building all three schemas from scratch; no .duckdb file committed (beeatlas.duckdb is gitignored) |
| TEST-02 | 27-01-PLAN.md | pytest covers `export.py` using fixture DuckDB: verifies correct Parquet schema (all required columns) and valid GeoJSON output | SATISFIED | `test_export.py` has 4 parquet column tests (ecdysis + samples schema and rows) and 2 GeoJSON structure tests; all 6 pass |
| TEST-03 | 27-01-PLAN.md | pytest covers `_transform()` and `_extract_inat_id()` as pure function unit tests; dlt write-path tests are deferred | SATISFIED | `test_transforms.py` has 3 tests for `_transform()` and 4 tests for `_extract_inat_id()`; all 7 pass |

No orphaned requirements: TEST-01, TEST-02, TEST-03 are the only Phase 27 requirements in REQUIREMENTS.md, and all three are claimed by 27-01-PLAN.md.

### Anti-Patterns Found

None. Scanned conftest.py, test_transforms.py, test_export.py, and ecdysis_pipeline.py for TODO/FIXME/HACK/PLACEHOLDER comments, empty return stubs, and hardcoded empty data. No issues found.

### Human Verification Required

None. All phase outcomes are fully verifiable programmatically. The test suite itself acts as the behavioral oracle — 13 passing tests confirm schema correctness, row counts, null column checks, GeoJSON structure, and pure function behavior.

### Gaps Summary

No gaps. All six observable truths are verified, all five required artifacts exist and are wired, all three requirement IDs are satisfied, and the full test suite passes in under one second without network access.

---

_Verified: 2026-03-29T04:00:00Z_
_Verifier: Claude (gsd-verifier)_
