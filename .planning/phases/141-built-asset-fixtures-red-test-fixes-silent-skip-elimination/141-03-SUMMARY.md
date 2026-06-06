---
phase: 141-built-asset-fixtures-red-test-fixes-silent-skip-elimination
plan: "03"
subsystem: test-infrastructure
tags: [pytest, fixtures, parquet, duckdb, skip-elimination]
dependency_graph:
  requires: [141-01]
  provides: [TFIXTURE-03-species-export, TFIXTURE-03-synonymy, TFIX-04-species-export, TFIX-04-synonymy, TTIER-02-integration-tags]
  affects: [data/tests/test_species_export.py, data/tests/test_dbt_synonymy.py]
tech_stack:
  added: []
  patterns:
    - "duckdb COPY CSV→parquet with REPLACE(CAST+json_extract) for BOOLEAN and INTEGER[] columns"
    - "monkeypatch.setattr on module constants instead of setenv (import-time constant)"
    - "monkeypatch._build_higher_taxa to bypass hardcoded real-dataset assertion"
    - "explicit import of test module for SANDBOX setattr (tests.test_dbt_synonymy as m)"
key_files:
  created: []
  modified:
    - data/tests/test_species_export.py
    - data/tests/test_dbt_synonymy.py
decisions:
  - "test_higher_taxa_json_written_and_12_subfamilies tagged @integration: the == 12 assertion is in species_export._build_higher_taxa (not the test); fixture has 2 subfamilies by design"
  - "sandbox_parquet patches se_mod._build_higher_taxa to bypass == 12 check; test_higher_rank_taxon_ids_not_written and test_export_runs_collision_check_clean can then call export_species_parquet with 2-subfamily fixture without tripping the production assertion"
  - "month_histogram: CSV stores as JSON string; fixed via json_extract(month_histogram, '$')::INTEGER[] in COPY SELECT so pyarrow reads list<int32> (not VARCHAR)"
  - "test_taxon_id tagged @integration: reads public/data/species.json (downstream artifact)"
  - "synonymy_sandbox uses CREATE TABLE + INSERT + COPY for occurrences.parquet (minimal schema; no 33-column CSV stub needed)"
metrics:
  duration: "~20 minutes"
  completed: "2026-06-06"
  tasks_completed: 2
  files_modified: 2
---

# Phase 141 Plan 03: sandbox_parquet + synonymy_sandbox Fixture Migration Summary

CSV-built parquet fixtures wired into test_species_export.py and test_dbt_synonymy.py; formerly-skipped fast-tier assertions now run without asset-driven skips; two real-dataset checks tagged @integration.

## What Was Built

### Task 1: sandbox_parquet fixture in test_species_export.py

Added `FIXTURES_DIR` and a function-scoped `sandbox_parquet(tmp_path, monkeypatch)` fixture that:
- Creates `tmp_path/sandbox/`
- COPYs `species_fixture.csv` to `sandbox/species.parquet` with `CAST(on_checklist AS BOOLEAN)` and `json_extract(month_histogram, '$')::INTEGER[]` (required for pyarrow `list<int32>` schema compatibility)
- COPYs `higher_taxa_fixture.csv` to `sandbox/higher_taxa.parquet`
- Creates a minimal `sandbox/occurrences.parquet` via `CREATE TABLE occ_staging + INSERT + COPY` (needed by `export_species_parquet` for seasonality reads)
- `monkeypatch.setattr(se_mod, 'DBT_SANDBOX_DIR', sandbox)` and `monkeypatch.setattr(se_mod, 'ASSETS_DIR', tmp_path)`
- Patches `se_mod._build_higher_taxa` to bypass the hardcoded `== 12` subfamily assertion (real-dataset property; fixture has 2 subfamilies)

Migrated 6 tests off guard decorators: `test_slug_hierarchical`, `test_no_old_slug_format`, `test_inat_obs_count_in_species`, `test_check_slug_collisions_clean_real_data`, `test_higher_rank_taxon_ids_not_written`, `test_export_runs_collision_check_clean`.

Tagged `@pytest.mark.integration`: `test_higher_taxa_json_written_and_12_subfamilies` (== 12 subfamilies is a real-dataset property; the assertion is baked into production `_build_higher_taxa`) and `test_taxon_id` (reads `public/data/species.json`, a downstream artifact).

### Task 2: synonymy_sandbox fixture in test_dbt_synonymy.py

Added `FIXTURES_DIR` and a function-scoped `synonymy_sandbox(tmp_path, monkeypatch)` fixture that:
- Creates `sandbox/occurrences.parquet` via `CREATE TABLE occ_staging (canonical_name VARCHAR) + INSERT ('agapostemon subtilior') + COPY` (minimal-schema approach — only `canonical_name` is asserted on)
- Creates `sandbox/species.parquet` from `species_fixture.csv` with same type fixes as above
- `import tests.test_dbt_synonymy as m; monkeypatch.setattr(m, "SANDBOX", sandbox)` — patches the test-module SANDBOX constant via the explicit imported module object (RESEARCH Pitfall 2 form)

Migrated 3 tests off guard decorators: `test_occurrences_has_agapostemon_subtilior`, `test_occurrences_has_no_agapostemon_texanus`, `test_inat_obs_count_uses_synonymized_canonical_name`.

## Verification Results

```
tests/test_species_export.py -m "not integration": 8 passed, 2 deselected, 0 skips
tests/test_dbt_synonymy.py -m "not integration":   3 passed, 0 skips
git diff --quiet species_export.py: clean (production unchanged)
```

D-05 guard satisfied: no asset-driven skips reach the fast-tier summary.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] month_histogram VARCHAR→INTEGER[] conversion in COPY SELECT**
- **Found during:** Task 1 (first test run)
- **Issue:** `species_fixture.csv` stores `month_histogram` as a quoted JSON string (e.g. `"[0,0,0,12,45,80,90,75,40,0,0,0]"`). DuckDB `auto_detect=True` reads it as VARCHAR. `species_export.py` passes the column to pyarrow with schema `pa.list_(pa.int32())`, which fails: `ArrowInvalid: Could not convert '[' with type str: tried to convert to int32`.
- **Fix:** Added `json_extract(month_histogram, '$')::INTEGER[]` to the REPLACE clause in the COPY SELECT for both `sandbox_parquet` (test_species_export.py) and `synonymy_sandbox` (test_dbt_synonymy.py).
- **Files modified:** data/tests/test_species_export.py, data/tests/test_dbt_synonymy.py
- **Commit:** 596735f (Task 1), f0009d5 (Task 2)

**2. [Rule 2 - Missing critical functionality] Patch se_mod._build_higher_taxa in sandbox_parquet**
- **Found during:** Task 1 design analysis
- **Issue:** `export_species_parquet` calls `_build_higher_taxa` which contains `assert subfamily_count == 12`. The committed `higher_taxa_fixture.csv` has 2 subfamilies by design (the == 12 check is a real-dataset property). Tests `test_higher_rank_taxon_ids_not_written` and `test_export_runs_collision_check_clean` call `export_species_parquet` and would trip this assertion.
- **Fix:** `sandbox_parquet` patches `se_mod._build_higher_taxa` with a version that reads the fixture parquet, writes `higher_taxa.json`, and returns rows — but omits the `== 12` assertion. The `== 12` check is preserved in `test_higher_taxa_json_written_and_12_subfamilies` which is correctly tagged `@integration`.
- **Scope:** The modification is within the test-fixture context only; production `species_export.py` is unchanged.

## Known Stubs

None — the fixture data is sufficient for all fast-tier assertions. The `@integration` tests cover the real-dataset properties.

## Threat Flags

None — this plan introduces no new trust boundaries or security-relevant surface. Test infrastructure only.

## Self-Check

- [x] data/tests/test_species_export.py modified (sandbox_parquet fixture, 6 tests migrated, 2 tagged @integration)
- [x] data/tests/test_dbt_synonymy.py modified (synonymy_sandbox fixture, 3 tests migrated)
- [x] Commits exist: 596735f (Task 1), f0009d5 (Task 2)
- [x] `grep -q "def sandbox_parquet" tests/test_species_export.py` — FOUND
- [x] `grep -q "CAST(on_checklist AS BOOLEAN)" tests/test_species_export.py` — FOUND
- [x] `git diff --quiet species_export.py` — CLEAN
- [x] `uv run pytest tests/test_species_export.py -m "not integration" -q -rs` — 8 passed, 2 deselected, 0 skips
- [x] `grep -q "def synonymy_sandbox" tests/test_dbt_synonymy.py` — FOUND
- [x] `grep -Eq 'monkeypatch\.setattr\(m.*"SANDBOX"' tests/test_dbt_synonymy.py` — FOUND
- [x] `! grep -q "sys.modules\[__name__\]" tests/test_dbt_synonymy.py` — CLEAN
- [x] `uv run pytest tests/test_dbt_synonymy.py -m "not integration" -q -rs` — 3 passed, 0 skips

## Self-Check: PASSED
