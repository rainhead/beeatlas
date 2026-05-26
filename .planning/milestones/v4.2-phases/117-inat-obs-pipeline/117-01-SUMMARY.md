---
phase: 117-inat-obs-pipeline
plan: "01"
subsystem: pipeline
tags: [pipeline, csv, inat, tests, wave-0, nyquist]

# Dependency graph
requires:
  - phase: none
    provides: n/a — Wave 0 foundation plan
provides:
  - "data/raw/inat_expert_obs.csv: 45,354-row iNat expert observation CSV committed to git"
  - "data/tests/test_inat_obs_pipeline.py: 4 RED test stubs (PIPE-01..04) that fail with ModuleNotFoundError until Plan 02 lands"
affects:
  - 117-02 (plan that implements inat_obs_pipeline module — turns these tests GREEN)
  - 117-03 (nightly.sh + manifest.json integration)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Wave 0 Nyquist gate pattern: commit source data + RED test stubs before any implementation"
    - "inat_obs_db fixture: isolated DuckDB with monkeypatched DB_PATH/EXPORT_DIR/CSV_PATH + inaturalist_waba_data pre-seeded"
    - "Hard import at module level triggers collection failure for clean RED signal (no importorskip)"

key-files:
  created:
    - data/raw/inat_expert_obs.csv
    - data/tests/test_inat_obs_pipeline.py
  modified: []

key-decisions:
  - "Commit CSV as-is despite missing quality_grade column (real export; pipeline will store NULL via .get())"
  - "Test stubs specify 12-column output schema including quality_grade — pipeline handles absent column gracefully"
  - "Hard import (import inat_obs_pipeline) used instead of importorskip for unambiguous RED signal"

patterns-established:
  - "inat_obs_db fixture: tmp_path + monkeypatch env + importlib.reload + pre-seed WABA schemas + monkeypatch CSV_PATH"
  - "Dedup test: seed inaturalist_waba_data.observations + observations__ofvs with field_id=18116; obs_id 999000001 excluded, 999000002 kept"

requirements-completed:
  - PIPE-01
  - PIPE-02
  - PIPE-03
  - PIPE-04

# Metrics
duration: 12min
completed: 2026-05-26
---

# Phase 117 Plan 01: iNat Obs Pipeline Wave 0 Nyquist Gate Summary

**45,354-row iNaturalist expert observation CSV committed plus 4 RED pytest stubs (PIPE-01..04) that fail with ModuleNotFoundError until Plan 02 delivers inat_obs_pipeline.py**

## Performance

- **Duration:** 12 min
- **Started:** 2026-05-26T00:36:03Z
- **Completed:** 2026-05-26T00:48:53Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments

- Committed real iNat expert observation CSV (45,354 data rows, 14 columns) at `data/raw/inat_expert_obs.csv`
- Created `data/tests/test_inat_obs_pipeline.py` with 4 named test stubs covering all PIPE-01..04 behaviors
- Confirmed RED Nyquist gate: `cd data && uv run pytest tests/test_inat_obs_pipeline.py -x` exits non-zero with `ModuleNotFoundError: No module named 'inat_obs_pipeline'`
- Confirmed rest of test suite (150 tests) still passes when new file is excluded

## Task Commits

Each task was committed atomically:

1. **Task 1: Commit the iNat expert observation CSV export** - `e50c348` (feat)
2. **Task 2: Create RED test stubs for PIPE-01..04** - `9ee099d` (test)

**Plan metadata:** (docs commit follows)

## Files Created/Modified

- `data/raw/inat_expert_obs.csv` - 45,354-row iNat expert observation export; 14 columns; committed to git at canonical path
- `data/tests/test_inat_obs_pipeline.py` - 4 integration test stubs for PIPE-01..04; fails to collect until Plan 02 lands

## CSV Details

**Actual row count:** 45,354 data rows (45,355 lines including header) — within expected range (±10% of 45,354)

**Columns present in CSV (14 total):**
`id`, `observed_on`, `time_observed_at`, `user_id`, `user_login`, `created_at`, `updated_at`, `license`, `image_url`, `latitude`, `longitude`, `scientific_name`, `taxon_id`, `field:associated species with names lookup`

**Columns present but not in expected list (informational — pipeline ignores them):**
`time_observed_at`, `user_id`, `created_at`, `updated_at`, `taxon_id`

**Confirmation that `data/raw/inat_expert_obs.csv` is NOT in .gitignore:**
`git check-ignore -v data/raw/inat_expert_obs.csv` exits 1 (not ignored). The `data/.gitignore` excludes `raw/taxa.csv.gz`, `raw/taxa_cache.json`, and `raw/ecdysis_cache/` but NOT CSV files at `raw/*.csv`.

**Exact pytest failure mode:**
```
ModuleNotFoundError: No module named 'inat_obs_pipeline'
```
Collection fails at line 22: `import inat_obs_pipeline  # ModuleNotFoundError until Plan 02 — RED gate`

## Decisions Made

- **Commit CSV despite missing quality_grade column:** The export was generated without selecting `quality_grade` from iNat. This is a real export; we cannot synthesize data. The pipeline (Plan 02) will use `.get('quality_grade')` which returns None/empty for absent columns, storing NULL in the output. The test stubs specify `quality_grade` in the 12-column schema so Plan 02 is committed to outputting it (even if all values are NULL until a refreshed export includes the column).
- **Hard import for RED signal:** Using `import inat_obs_pipeline` at module top level (not `pytest.importorskip`) ensures pytest cannot collect any test — clean, unambiguous RED that Plan 02 must satisfy.
- **Test fixture pre-seeds WABA raw tables:** The dedup test uses the raw-table fallback query (`inaturalist_waba_data.observations__ofvs` with `field_id=18116`) because `dbt_sandbox.int_waba_link` won't exist in the isolated test DB.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] CSV missing quality_grade column**
- **Found during:** Task 1 (CSV header verification)
- **Issue:** The iNat export does not include `quality_grade` column — it was not selected at export time. The plan's acceptance criteria require it.
- **Fix:** Committed the CSV as-is (cannot synthesize real data). Documented the discrepancy here. Test stubs still specify `quality_grade` in the 12-column output schema so Plan 02 will produce it (as NULL) from `.get('quality_grade')`. The pipeline handles absent columns gracefully per Pitfall 4 in RESEARCH.md.
- **Files modified:** n/a (no code change needed; deviation is in source data)
- **Verification:** CSV committed; test stubs validate the 12-column output schema including quality_grade
- **Committed in:** e50c348 (Task 1 commit, with explicit note in commit message)

---

**Total deviations:** 1 (data quality issue in source CSV — auto-documented, not auto-fixable)
**Impact on plan:** Minor. Pipeline (Plan 02) will produce `quality_grade=NULL` for all rows until the export is refreshed with `quality_grade` selected. PIPE-01 test will still verify 12 columns including quality_grade. No scope change.

## Issues Encountered

None beyond the quality_grade deviation documented above.

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness

- Wave 0 complete: CSV committed, RED test stubs active
- Ready for Plan 02: implement `data/inat_obs_pipeline.py` to turn tests GREEN
- Plan 02 should use `.get('quality_grade')` when reading CSV rows (handles absent column gracefully)
- When the iNat export is refreshed to include `quality_grade`, re-commit the CSV at the same canonical path (D-01: fixed filename, overwrite in place)

---
*Phase: 117-inat-obs-pipeline*
*Completed: 2026-05-26*
