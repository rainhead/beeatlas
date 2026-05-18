---
phase: 97-place-data-model
plan: "02"
subsystem: pipeline
tags: [duckdb, spatial, pytest, validation, toml, pipeline]

requires:
  - phase: 97-place-data-model/097-01
    provides: places_validation.py with validate_places and validate_places_step

provides:
  - places-validation step wired into run.py STEPS before dbt-build
  - pytest test suite covering all 6 boundary cases (1 pass + 5 failure modes)

affects: [run.py, data/tests, pipeline-order]

tech-stack:
  added: []
  patterns:
    - "pipeline step wiring: zero-arg function imported and inserted into STEPS list before dbt-build"
    - "validation test pattern: write_toml helper + tmp_path fixture + pytest.raises(ValueError, match=...) for each failure mode"

key-files:
  created:
    - data/tests/test_places_validation.py
  modified:
    - data/run.py

key-decisions:
  - "Import placed after all other pipeline imports (topology_postprocess) to follow existing grouping convention"
  - "Pre-existing test failures (test_dbt_diff x2, test_feeds.test_run_py_integration) are out of scope — unrelated to places validation"

patterns-established:
  - "places validation test helper write_toml(tmp_path, places) serializes TOML inline without external library"

requirements-completed: [PLC-01, PLC-02, PLC-03, PLC-04]

duration: 8min
completed: 2026-05-17
---

# Phase 97 Plan 02: Place Data Model (Wire + Test) Summary

**validate_places_step wired into run.py STEPS before dbt-build; 6 pytest tests confirm pass/fail boundary for all PLC-03/04 validation rules**

## Performance

- **Duration:** ~8 min
- **Started:** 2026-05-17T00:20:00Z
- **Completed:** 2026-05-17T00:28:00Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments

- Wired `validate_places_step` import and STEPS entry into `data/run.py` immediately before `dbt-build`, plus updated docstring pipeline order comment
- Created `data/tests/test_places_validation.py` with 6 tests: 1 valid-pass case and 5 failure modes covering all PLC-03/04 violation classes
- All 6 new tests pass; 133 existing tests continue to pass (3 pre-existing failures are unrelated and documented below)

## Task Commits

1. **Task 1: Wire validate_places_step into run.py STEPS** - `238a8fe` (feat)
2. **Task 2: Write pytest tests for places validation** - `fd3686a` (feat)

## Files Created/Modified

- `data/run.py` — added import + STEPS entry for places-validation before dbt-build; updated docstring pipeline order comment
- `data/tests/test_places_validation.py` — 6 boundary tests using tmp_path + write_toml helper

## Decisions Made

- Import appended after `from topology_postprocess import main as clean_region_topology` to keep existing import groupings intact without introducing a new block
- `write_toml` helper serializes TOML inline using string formatting (no external library) consistent with plan specification

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

Pre-existing test failures (out of scope, not caused by this plan):

- `tests/test_dbt_diff.py::test_species_json_matches` — requires a real dbt build artifact; fails in unit test context
- `tests/test_dbt_diff.py::test_seasonality_json_matches` — same cause
- `tests/test_feeds.py::test_run_py_integration` — looks for step name `'export'` but current STEPS uses `'species-export'`; pre-existing naming mismatch from a previous phase refactor

These 3 failures were already present before this plan's changes. Logged for future resolution.

## Known Stubs

None.

## Threat Flags

None — no new network endpoints, auth paths, file access patterns, or schema changes introduced.

## Self-Check: PASSED

- `data/run.py` exists and contains import + STEPS entry: confirmed
- `data/tests/test_places_validation.py` exists with 6 tests: confirmed
- Commit `238a8fe` exists: confirmed
- Commit `fd3686a` exists: confirmed
- 6/6 tests pass: confirmed

## Next Phase Readiness

- places-validation runs automatically on every nightly pipeline run before dbt-build
- Any invalid geometry, duplicate slug, bad slug chars, out-of-bounds coords, or polygon overlap in content/places.toml will halt the pipeline with a descriptive ValueError
- Ready for downstream phases that consume places data from the pipeline

---
*Phase: 97-place-data-model*
*Completed: 2026-05-17*
