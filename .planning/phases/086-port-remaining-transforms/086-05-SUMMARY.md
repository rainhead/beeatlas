---
phase: "086"
plan: "05"
subsystem: data-pipeline
tags: [dbt, duckdb, python, species-mart, PORT-01, json-sidecar, parquet, slugify]

dependency_graph:
  requires:
    - phase: "086-01"
      provides: species-diff-harness
    - phase: "086-04"
      provides: "18-col sandbox/species.parquet from dbt mart"
  provides:
    - "species_export.py rewritten as dbt-mart consumer + JSON emitter"
    - "sandbox/species.parquet (19 cols, slug appended via feeds._slugify)"
    - "sandbox/species.json (byte-comparable to public/data/species.json)"
    - "sandbox/seasonality.json (byte-comparable to public/data/seasonality.json)"
  affects: ["086-PHASE-ROLL-UP", "088-cutover"]

tech_stack:
  added: []
  patterns:
    - dbt-mart-consumer-python-post-step (reads 18-col dbt parquet, appends slug, emits JSON sidecars)
    - independent-read-write-env-vars (DBT_SANDBOX_DIR for reads, EXPORT_DIR for writes — orthogonal)
    - sandbox-occurrences-for-seasonality (reads DBT_SANDBOX_DIR/occurrences.parquet not ASSETS_DIR for diff purity)

key_files:
  created: []
  modified:
    - data/species_export.py

key_decisions:
  - "DBT_SANDBOX_DIR is independent of EXPORT_DIR: reads from dbt output, writes to ASSETS_DIR — production uses different paths, diff harness coincidentally uses the same path for both"
  - "seasonality.json reads from DBT_SANDBOX_DIR/occurrences.parquet (not ASSETS_DIR) to keep diff comparison clean — avoids polluting sandbox comparison with public/data reads"
  - "Defensive _ZERO_HIST backfill kept despite dbt CASE expression handling NULL month_histogram — belt-and-suspenders in case any row slips through"
  - "200+ line multi-CTE SQL removed from species_export.py body — all SQL aggregation now lives in dbt DAG"

requirements-completed:
  - PORT-01
  - VALIDATE-01

metrics:
  duration: "~20min"
  completed: "2026-05-13"
  tasks_completed: 1
  files_changed: 1
---

# Phase 086 Plan 05: PORT-01 JSON Sidecar Post-Step Summary

**species_export.py rewritten as thin dbt-mart consumer: reads 18-col sandbox/species.parquet, appends slug via feeds._slugify, emits 19-col species.parquet + byte-comparable species.json + seasonality.json; all 5 species diff tests PASS**

## Performance

- **Duration:** ~20 min
- **Started:** 2026-05-13T03:30:00Z
- **Completed:** 2026-05-13T03:50:00Z
- **Tasks:** 1
- **Files modified:** 1

## Accomplishments

- Removed the 200+ line multi-CTE SQL query from `species_export.py` (previously hitting `ecdysis_data.occurrences`, `checklist_data.species`, `inaturalist_data.*` directly)
- Added `DBT_SANDBOX_DIR` module-level constant (read path, defaults to `data/dbt/target/sandbox`), independent of `ASSETS_DIR` (write path, unchanged)
- Reads 18-col mart from `DBT_SANDBOX_DIR/species.parquet`, appends `slug` via `feeds._slugify`, writes 19-col `ASSETS_DIR/species.parquet` via pyarrow (same schema and SNAPPY codec)
- Seasonality accumulation reads from `DBT_SANDBOX_DIR/occurrences.parquet` (the dbt mart, not `ASSETS_DIR`) — Pitfall 4 compliance
- All 5 species diff tests PASS: `test_species_parquet_row_count_matches`, `test_species_parquet_schema_matches`, `test_species_canonical_name_key_set_matches`, `test_species_json_matches`, `test_seasonality_json_matches`
- PORT-01 fully closed: dbt DAG owns all SQL aggregation; Python post-step adds slug and emits JSON sidecars

## Line Count Delta

- **Before:** 333 lines (200+ lines of SQL CTE inside the function body)
- **After:** 256 lines (77 line reduction — SQL replaced by parquet read + slug loop)

## Task Commits

1. **Task 1: Rewrite species_export.export_species_parquet to consume dbt sandbox mart** — `7553dd1` (feat)

## Files Created/Modified

- `data/species_export.py` — Body of `export_species_parquet` rewritten; `DBT_SANDBOX_DIR` constant added; seasonality reads from sandbox occurrences; all existing helpers (`_jsonify_rows`, `_ZERO_HIST`, pyarrow schema, ASSETS_DIR, main()) preserved unchanged

## Decisions Made

- `DBT_SANDBOX_DIR` defaults to `Path(__file__).parent / 'dbt' / 'target' / 'sandbox'` — matches where dbt writes external mart outputs; independent of `EXPORT_DIR`/`ASSETS_DIR` (the write path). In production these diverge; in the diff harness verify command (`EXPORT_DIR=data/dbt/target/sandbox`) they happen to point to the same directory.
- Seasonality reads from `DBT_SANDBOX_DIR/occurrences.parquet` not `ASSETS_DIR/occurrences.parquet` — in production, `ASSETS_DIR = public/data/` which would mix baseline and sandbox data in the diff comparison (Pitfall 4).
- `FileNotFoundError` raised with instructional message if either `DBT_SANDBOX_DIR/species.parquet` or `DBT_SANDBOX_DIR/occurrences.parquet` is missing — mirrors existing Pitfall 8 pattern.
- Defensive `_ZERO_HIST` backfill kept in Python even though dbt's `int_species_universe` CASE expression handles NULL `month_histogram` — belt-and-suspenders for any future dbt schema change.

## Deviations from Plan

None — plan executed exactly as written. The rewrite matched the specification in the plan's `<action>` block precisely.

## Issues Encountered

The worktree's `data/beeatlas.duckdb` does not contain the source schemas (`ecdysis_data`, `checklist_data`, `inaturalist_waba_data`, etc.) — it is an empty database. Running `bash data/dbt/run.sh build` in the worktree fails because the dbt profile resolves to the worktree's empty duckdb. Resolution: dbt build was run from the main repo's dbt directory (which has the full database), producing `sandbox/species.parquet` and `sandbox/occurrences.parquet` in the main repo's sandbox. Those files were then copied to the worktree's sandbox for the verify command and tests. Similarly, `public/data/` baseline files (gitignored) were copied from the main repo to the worktree for diff test baselines.

This is a worktree execution constraint: the data pipeline requires `beeatlas.duckdb` populated from production sources, which cannot be reproduced in a worktree without running the full ingestion pipeline.

## Phase 086 Roll-Up (PORT-01 complete)

All 5 requirements from the phase are now closed:

| Req ID | Description | Status |
|--------|-------------|--------|
| PORT-01 | Port species_export.py to dbt mart + Python post-step | **CLOSED** — Plan 086-04 (dbt mart) + Plan 086-05 (JSON post-step) |
| PORT-02 | Occurrence-links source declaration + ingestion boundary doc | Closed in Plan 086-03 |
| PORT-03 | Taxon-lineage source declarations + LIN-05 dbt test | Closed in Plan 086-02 |
| PORT-04 | resolve_taxon_ids.py ingestion boundary decision | Closed in Plan 086-03 |
| VALIDATE-01 | diff harness green throughout | Closed in Plan 086-01 (stubs) + this plan (5 PASS) |

## diff Harness Final State (all 16 tests)

| Test | Status |
|------|--------|
| test_occurrences_row_count_matches | PASS |
| test_occurrences_schema_matches | FAIL (pre-existing: 3-col deferred cleanup from Phase 085) |
| test_occurrences_ecdysis_key_set_matches | PASS |
| test_occurrences_ecdysis_id_join_full | PASS |
| test_occurrences_host_observation_id_join_full | PASS |
| test_occurrences_county_spatial_diff | PASS |
| test_occurrences_ecoregion_spatial_diff | PASS |
| test_counties_geojson_feature_count_matches | PASS |
| test_ecoregions_geojson_feature_count_matches | PASS |
| test_geojson_property_names_match[counties.geojson-NAME] | PASS |
| test_geojson_property_names_match[ecoregions.geojson-NA_L3NAME] | PASS |
| **test_species_parquet_row_count_matches** | **PASS** (was SKIP) |
| **test_species_parquet_schema_matches** | **PASS** (was FAIL missing slug col) |
| **test_species_canonical_name_key_set_matches** | **PASS** (was SKIP) |
| **test_species_json_matches** | **PASS** (was SKIP) |
| **test_seasonality_json_matches** | **PASS** (was SKIP) |

## Phase 88 Cutover Scope Impact

Per the plan objective, Phase 88 cutover scope is now precisely:
- Replace `export.py` invocation in `run.py STEPS` with `dbt build` call
- Retire `export.py` and `_apply_migrations`
- Retire `validate-schema.mjs` (replaced by dbt contract enforcement)
- `species_export.py` stays as the thin Python post-step (no retirement needed)

## Known Stubs

None.

## Threat Flags

None — local file pipeline, no network surface changes.

## Self-Check: PASSED

- [x] `data/species_export.py` exists and compiles: `python3 -m py_compile` exits 0
- [x] `data/species_export.py` contains `DBT_SANDBOX_DIR`
- [x] `data/species_export.py` contains `from feeds import _slugify`
- [x] No `FROM ecdysis_data.occurrences`, `FROM checklist_data.species`, or `FROM inaturalist_data` in species_export.py body
- [x] `data/dbt/target/sandbox/species.parquet` has 19 columns (slug appended) — confirmed by `DESCRIBE`
- [x] `data/dbt/target/sandbox/species.json` exists
- [x] `data/dbt/target/sandbox/seasonality.json` exists
- [x] All 5 species diff tests PASS
- [x] Commit `7553dd1` exists
