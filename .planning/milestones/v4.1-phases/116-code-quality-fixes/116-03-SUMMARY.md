---
phase: 116-code-quality-fixes
plan: "03"
subsystem: data-pipeline
tags: [test-fix, species-export, artifact-refresh]
dependency_graph:
  requires: []
  provides: [green-data-test-suite]
  affects: [public/data/species.parquet, public/data/species.json, public/data/seasonality.json]
tech_stack:
  added: []
  patterns: [EXPORT_DIR env var for diff-harness verification]
key_files:
  created: []
  modified:
    - data/dbt/target/sandbox/species.json
    - data/dbt/target/sandbox/seasonality.json
    - public/data/species.parquet
    - public/data/species.json
    - public/data/seasonality.json
decisions:
  - Sandbox JSON files must be regenerated alongside public artifacts whenever species_export.py schema changes — both sets must come from the same code version
requirements_completed: [CODE-03]
metrics:
  duration: ~12 minutes
  completed: "2026-05-25T22:22:45Z"
  tasks_completed: 1
  files_changed: 5
---

# Phase 116 Plan 03: Species Artifact Refresh Summary

Regenerated the three gitignored public artifacts (`species.parquet`, `species.json`, `seasonality.json`) and the corresponding sandbox JSONs so all five files are byte/schema-aligned with the current `species_export.py`, resolving the 3 pre-existing `test_dbt_diff.py` failures and restoring `uv run pytest data/` to a clean exit.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Confirm sandbox + regenerate artifacts | (no tracked files — all artifacts gitignored) | public/data/{species.parquet,species.json,seasonality.json}, sandbox/{species.json,seasonality.json} |

## What Was Done

**Root cause:** The sandbox `species.json` and `seasonality.json` were generated in May 13 by an older version of `species_export.py` that did not include `checklist_count`. The current `species_export.py` includes `checklist_count` in `SPECIES_COLUMNS`, so the byte-comparison tests (`test_species_json_matches`, `test_seasonality_json_matches`) failed because the sandbox and public JSONs had different key sets.

The `test_species_parquet_schema_matches` test failed because the dbt sandbox `species.parquet` had a `checklist_count` column (added recently to `int_species_universe`) but the public `species.parquet` had been regenerated from an older version without it.

**Fix:**
1. Verified sandbox prerequisites existed (`occurrences.parquet`, `species.parquet`, `checklist.parquet` — all present).
2. Ran `species_export.py` with `EXPORT_DIR=public/data` to regenerate `public/data/` artifacts with current schema (630 rows, 20 cols).
3. Ran `species_export.py` with `EXPORT_DIR=sandbox` and `DBT_SANDBOX_DIR=sandbox` to regenerate sandbox JSON files to match the current code's output. This also overwrote sandbox `species.parquet` with a 20-col version.
4. Ran `bash data/dbt/run.sh build` to restore sandbox `species.parquet` to the canonical 19-col dbt mart output (without slug), as the schema test expects it.

**Result:** After the four-step sequence, all five files are consistent:
- `sandbox/species.parquet`: 19 cols (dbt output, no slug) — matches test expectation for schema prefix
- `public/data/species.parquet`: 20 cols (species_export.py output, slug appended) — matches test expectation
- `sandbox/species.json` and `public/data/species.json`: byte-identical, both have `checklist_count` + `slug`
- `sandbox/seasonality.json` and `public/data/seasonality.json`: byte-identical

## Verification Results

```
3 previously failing tests: PASSED
  test_species_parquet_schema_matches  PASSED
  test_species_json_matches            PASSED
  test_seasonality_json_matches        PASSED

Full suite: 150 passed in 237.04s
```

Schema assertion: `public/data/species.parquet` last column is `('slug', 'VARCHAR')`, total 20 cols — OK.
Byte assertions: `species.json` and `seasonality.json` byte-identical between sandbox and public — OK.

## Deviations from Plan

**1. [Rule 1 - Bug] Sandbox JSON files also needed regeneration**
- **Found during:** Task 1, Step C (three-test run)
- **Issue:** The plan stated "regenerate the three public artifacts" but the byte-comparison tests (`test_species_json_matches`, `test_seasonality_json_matches`) compare `sandbox/` against `public/data/` — both sides needed updating. The sandbox JSONs were from an older code version that predated the `checklist_count` column.
- **Fix:** Added `EXPORT_DIR=sandbox DBT_SANDBOX_DIR=sandbox` run to regenerate sandbox JSONs, followed by `bash data/dbt/run.sh build` to restore the 19-col sandbox `species.parquet` (which the parquet schema test depends on).
- **Files modified:** `data/dbt/target/sandbox/species.json`, `data/dbt/target/sandbox/seasonality.json`
- **Commit:** N/A (gitignored, not tracked)

## Known Stubs

None.

## Threat Flags

None — no new network endpoints, auth paths, or schema changes at trust boundaries. All changes are to gitignored runtime artifacts.

## Self-Check: PASSED

- `public/data/species.parquet` exists: FOUND
- `public/data/species.json` exists: FOUND
- `public/data/seasonality.json` exists: FOUND
- All 150 data tests pass: CONFIRMED (exit 0)
- Three previously failing tests now PASSED: CONFIRMED
