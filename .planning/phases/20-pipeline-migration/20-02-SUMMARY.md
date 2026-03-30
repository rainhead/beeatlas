---
plan: 20-02
phase: 20-pipeline-migration
status: complete
completed: 2026-03-27
self_check: PASSED
---

# Plan 20-02 Summary: Pipeline Verification

## What Was Built

All five dlt pipelines verified running end-to-end from `data/` against live data sources and writing to `data/beeatlas.duckdb`.

## Verification Results

| Pipeline | Table | Rows |
|----------|-------|------|
| inaturalist_pipeline.py | inaturalist_data.observations | 9,684 |
| ecdysis_pipeline.py | ecdysis_data.occurrences | 46,090 |
| geographies_pipeline.py | geographies.ecoregions | 2,548 |
| projects_pipeline.py | inaturalist_data.projects | 42 |
| anti_entropy_pipeline.py | (operates on existing observations) | — |

All five pipelines completed without error. Row counts are non-zero for all main tables.

## Deviations

- `data/beeatlas.duckdb` was copied from `~/dlt-inat-test/beeatlas.duckdb` (1.5G) to preserve existing data rather than re-fetching from scratch. Saved several hours of Ecdysis/iNat fetches.
- All pipeline files required a fix to use `DB_PATH = str(Path(__file__).parent / "beeatlas.duckdb")` instead of the hardcoded relative `"beeatlas.duckdb"` string. dlt was resolving the relative path against `initial_cwd` (cached from the prototype's `~/dlt-inat-test/` location) rather than the current working directory. Fix committed in `c650d8d`.

## Key Files

- `data/beeatlas.duckdb` — populated DuckDB database (gitignored)
- `data/inaturalist_pipeline.py`, `data/ecdysis_pipeline.py`, `data/geographies_pipeline.py`, `data/projects_pipeline.py`, `data/anti_entropy_pipeline.py` — all verified working

## Self-Check: PASSED

PIPE-10 satisfied: all five pipelines run locally and write to `data/beeatlas.duckdb` without error.
