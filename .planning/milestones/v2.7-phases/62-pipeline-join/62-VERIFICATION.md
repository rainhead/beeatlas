---
phase: 62-pipeline-join
verified: 2026-04-17T17:00:00Z
status: passed
score: 9/9
overrides_applied: 0
---

# Phase 62: Pipeline Join — Verification Report

**Phase Goal:** The pipeline produces a single `occurrences.parquet` that correctly unifies all specimen and sample records through a full outer join
**Verified:** 2026-04-17T17:00:00Z
**Status:** passed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Running `data/run.py` produces `occurrences.parquet`; `ecdysis.parquet` and `samples.parquet` no longer produced | VERIFIED | `run.py` calls `export.main()` which calls only `export_occurrences_parquet`; no references to old export functions remain in `export.py` or `run.py` |
| 2 | Specimen-only rows have null sample-side columns; sample-only rows have null specimen-side columns | VERIFIED | `test_occurrences_specimen_only_nulls` and `test_occurrences_sample_only_nulls` both PASSED in pytest run |
| 3 | All rows carry canonical `lat`/`lon` (COALESCE) and `date` in VARCHAR ISO format | VERIFIED | `test_occurrences_coalesce_coords` and `test_occurrences_date_format` both PASSED; COALESCE in SQL confirmed at lines 107-109 of `data/export.py` |
| 4 | `validate-schema.mjs` enforces `occurrences.parquet` schema; CI passes with new file | VERIFIED | `EXPECTED` dict has single `occurrences.parquet` key with 25 columns; no `ecdysis.parquet` or `samples.parquet` references remain; local file detection updated to `occurrences.parquet` |
| 5 | Test file contains occurrences-focused tests that validate unified export | VERIFIED | 6 occurrences test functions present (`test_occurrences_parquet_schema`, `test_occurrences_parquet_has_rows`, `test_occurrences_coalesce_coords`, `test_occurrences_date_format`, `test_occurrences_specimen_only_nulls`, `test_occurrences_sample_only_nulls`) |
| 6 | Old ecdysis/samples test functions are removed | VERIFIED | No `test_ecdysis_parquet_schema`, `test_samples_parquet_schema`, `EXPECTED_ECDYSIS_COLS`, or `EXPECTED_SAMPLES_COLS` in `data/tests/test_export.py` |
| 7 | validate-schema.mjs gates on `occurrences.parquet`, not `ecdysis.parquet` or `samples.parquet` | VERIFIED | `EXPECTED` dict contains only `'occurrences.parquet':` key; grep confirms no old filenames remain |
| 8 | Pipeline produces occurrences.parquet from full outer join | VERIFIED | `FULL OUTER JOIN samples_base s ON e.host_observation_id = s.observation_id` confirmed in `data/export.py` line 117 |
| 9 | Old export functions deleted; main() calls only export_occurrences_parquet | VERIFIED | No `def export_ecdysis_parquet(` or `def export_samples_parquet(` in `data/export.py`; `main()` calls `export_occurrences_parquet(con)` only |

**Score:** 9/9 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `data/tests/test_export.py` | Tests for export_occurrences_parquet covering schema, rows, coords, date format | VERIFIED | Contains `EXPECTED_OCCURRENCES_COLS`, all 6 occurrences test functions, geojson tests preserved |
| `scripts/validate-schema.mjs` | CI schema gate for occurrences.parquet | VERIFIED | Single `occurrences.parquet` EXPECTED entry with 25 columns; `existsSync` checks `occurrences.parquet` |
| `data/export.py` | export_occurrences_parquet function with full outer join, COALESCE coords, spatial joins | VERIFIED | 14-CTE SQL chain; FULL OUTER JOIN confirmed; COALESCE on lon/lat/date confirmed; ROW_NUMBER spatial key confirmed |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `data/tests/test_export.py` | `data/export.py` | `import export as export_mod; calls export_mod.export_occurrences_parquet` | WIRED | Line 11: `import export as export_mod`; line 36: `export_mod.export_occurrences_parquet(fixture_con)` confirmed |
| `data/export.py` | `frontend/public/data/occurrences.parquet` | `COPY ... TO ... (FORMAT PARQUET)` | WIRED | Line 173: `) TO '{out}' (FORMAT PARQUET)` where `out = str(ASSETS_DIR / "occurrences.parquet")` |
| `data/export.py` | `data/tests/test_export.py` | `export_occurrences_parquet` | WIRED | Function defined in export.py, called in test_export.py |

### Data-Flow Trace (Level 4)

Not applicable — this phase produces a data pipeline (parquet exporter), not a UI component rendering dynamic data. The pipeline itself is the data producer.

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| All 8 export tests pass | `cd data && uv run pytest tests/test_export.py -v` | 8 passed in 0.19s | PASS |
| No old function references in export.py | `grep 'export_ecdysis_parquet\|export_samples_parquet' data/export.py` | No matches | PASS |
| No old parquet references in validate-schema.mjs | `grep 'ecdysis.parquet\|samples.parquet' scripts/validate-schema.mjs` | No matches | PASS |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|-------------|--------|----------|
| OCC-01 | 62-01, 62-02 | `export.py` produces `occurrences.parquet` from full outer join; specimen-side columns null for sample-only rows; `validate-schema.mjs` updated | SATISFIED | `export_occurrences_parquet` with FULL OUTER JOIN confirmed; validate-schema.mjs updated; all tests pass |
| OCC-03 | 62-01, 62-02 | COALESCE unifies coordinate columns into canonical `lat`/`lon`; `date` column standardized to VARCHAR ISO format | SATISFIED | `COALESCE(e.ecdysis_lon, s.sample_lon) AS lon` and `COALESCE(e.ecdysis_lat, s.sample_lat) AS lat` confirmed; `test_occurrences_date_format` asserts VARCHAR type and passes |

### Anti-Patterns Found

None detected. No TODO/FIXME/placeholder comments, no empty implementations, no hardcoded empty data in paths that affect rendering or output.

### Human Verification Required

None. All must-haves are verifiable programmatically and all checks passed.

### Gaps Summary

No gaps. All 9 truths verified, both requirements satisfied, all artifacts substantive and wired, behavioral spot-checks passed.

---

_Verified: 2026-04-17T17:00:00Z_
_Verifier: Claude (gsd-verifier)_
