---
phase: 083
plan: 02
subsystem: data/dbt/models/staging
tags: [dbt, staging, port, duckdb, spatial]
one_liner: "11 dbt staging views wrapping 4 raw DuckDB schemas with WA filters and lat-NULL guard"
dependency_graph:
  requires: [083-01-scaffold]
  provides: [staging-layer-dbt-dag]
  affects: [083-03-intermediate-models, 083-04-mart-models]
tech_stack:
  added: []
  patterns:
    - "dbt {{ source() }} over DuckDB attached schemas"
    - "Cross-staging {{ ref() }} for DAG edge visibility"
    - "Thin SELECT * pass-through with load-bearing WHERE at staging boundary"
key_files:
  created:
    - data/dbt/models/staging/stg_geo__us_counties.sql
    - data/dbt/models/staging/stg_geo__us_states.sql
    - data/dbt/models/staging/stg_geo__ecoregions.sql
    - data/dbt/models/staging/stg_ecdysis__occurrences.sql
    - data/dbt/models/staging/stg_ecdysis__identifications.sql
    - data/dbt/models/staging/stg_ecdysis__occurrence_links.sql
    - data/dbt/models/staging/stg_inat__observations.sql
    - data/dbt/models/staging/stg_inat__ofvs.sql
    - data/dbt/models/staging/stg_waba__observations.sql
    - data/dbt/models/staging/stg_waba__ofvs.sql
    - data/dbt/models/staging/stg_waba__taxon_lineage.sql
  modified: []
decisions:
  - "A3 resolved: native geom GEOMETRY columns present on all geographies.* tables (Phase 47 backfill applied) — used geom directly, no ST_GeomFromText fallback"
  - "stg_geo__ecoregions references stg_geo__us_states via ref() not source() — cross-staging ref makes DAG edge visible in lineage"
  - "stg_ecdysis__occurrences uses SELECT * (not explicit column list) — thin pass-through, downstream int_ecdysis_base owns column aliasing/casting"
  - "dbt build verification deferred to post-merge — 083-01 scaffold runs in parallel worktree; integration testing after merge"
metrics:
  duration: "~8 minutes"
  completed_date: "2026-05-12"
  tasks_completed: 3
  tasks_total: 3
  files_created: 11
  files_modified: 0
---

# Phase 083 Plan 02: Staging Models Summary

11 dbt staging views wrapping the 4 raw DuckDB schemas in `beeatlas.duckdb` as `{{ source() }}` SELECTs, with the WA geographic filters and lat-NULL guard from `export.py`'s CTE preamble (lines 23-103).

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | stg_geo__* staging models | 42842e3 | stg_geo__us_counties.sql, stg_geo__us_states.sql, stg_geo__ecoregions.sql |
| 2 | stg_ecdysis__* staging models | 815f643 | stg_ecdysis__occurrences.sql, stg_ecdysis__identifications.sql, stg_ecdysis__occurrence_links.sql |
| 3 | stg_inat__* + stg_waba__* staging models | cb48c9c | stg_inat__observations.sql, stg_inat__ofvs.sql, stg_waba__observations.sql, stg_waba__ofvs.sql, stg_waba__taxon_lineage.sql |

## A3 Resolution: Native `geom` Column

The `data/beeatlas.duckdb` geographies tables all have native `geom GEOMETRY` columns from the Phase 47 backfill (confirmed via `DESCRIBE geographies.us_counties/us_states/ecoregions`). All three `stg_geo__*` models use `geom` directly — no `ST_GeomFromText(geometry_wkt)` fallback needed.

## Load-Bearing Filters

Two staging-layer filters mirror `export.py` verbatim:

1. **`stg_geo__us_counties`**: `WHERE state_fips = '53'` — WA county filter (export.py:31)
2. **`stg_geo__ecoregions`**: `WHERE ST_Intersects(geom, (SELECT geom FROM {{ ref('stg_geo__us_states') }} WHERE abbreviation = 'WA'))` — WA intersection filter (export.py:36-39)
3. **`stg_ecdysis__occurrences`**: `WHERE decimal_latitude IS NOT NULL AND decimal_latitude != ''` — lat-NULL guard (export.py:84)

## Cross-Staging DAG Edge

`stg_geo__ecoregions` references `stg_geo__us_states` via `{{ ref('stg_geo__us_states') }}` rather than repeating the `{{ source(...) }}` call. This makes the staging-to-staging dependency visible in the dbt DAG lineage artifact (PORT-01).

## Build Verification Note

`dbt build --select staging` was **not** executed in this plan — the dbt project scaffold (profiles.yml, dbt_project.yml, run.sh, sources.yml) is authored in Plan 083-01 running in a parallel worktree. Integration testing (`dbt build --select staging` exits 0, 11/11 views created, WA county count = 39) happens after both worktrees merge into the phase branch.

## Deviations from Plan

None — plan executed exactly as written. The parallel-worktree constraint (no dbt build) was documented in the executor context and treated as expected behavior, not a deviation.

## Known Stubs

None — all 11 staging models are complete `{{ source() }}` SELECT wrappers with the required filters. No placeholders.

## Self-Check: PASSED

Files created (verified):
- data/dbt/models/staging/stg_geo__us_counties.sql — FOUND
- data/dbt/models/staging/stg_geo__us_states.sql — FOUND
- data/dbt/models/staging/stg_geo__ecoregions.sql — FOUND
- data/dbt/models/staging/stg_ecdysis__occurrences.sql — FOUND
- data/dbt/models/staging/stg_ecdysis__identifications.sql — FOUND
- data/dbt/models/staging/stg_ecdysis__occurrence_links.sql — FOUND
- data/dbt/models/staging/stg_inat__observations.sql — FOUND
- data/dbt/models/staging/stg_inat__ofvs.sql — FOUND
- data/dbt/models/staging/stg_waba__observations.sql — FOUND
- data/dbt/models/staging/stg_waba__ofvs.sql — FOUND
- data/dbt/models/staging/stg_waba__taxon_lineage.sql — FOUND

Commits verified:
- 42842e3 — feat(083-02): add stg_geo__* staging models (A3: native geom)
- 815f643 — feat(083-02): add stg_ecdysis__* staging models
- cb48c9c — feat(083-02): add stg_inat__* and stg_waba__* staging models
