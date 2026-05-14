# Phase 83 — Discussion Log

Human-reference log of the discuss-phase conversation. Not consumed by downstream agents.

**Date**: 2026-05-12
**Mode**: default (no flags)

## Areas selected

User selected all four offered gray areas:
1. Slice scope & GeoJSON outputs
2. Source DuckDB strategy
3. Model granularity & layering
4. Layout, deps, spatial loading

## Area 1 — Slice scope & GeoJSON outputs

**Question:** counties.geojson and ecoregions.geojson are JSON FeatureCollections — dbt-duckdb's natural materializations are tables/views/parquet. How should the spike handle these?

**Options:**
- Model + post-hook serializer
- Scope to occurrences only
- External materialization + writer script

**Selected:** Model + post-hook serializer.

**Notes:** GeoJSON outputs stay in the dbt DAG; post-hook handles serialization. Exact mechanism (macro vs op vs explicit post-hook) deferred to plan phase.

## Area 2 — Source DuckDB strategy

**Question:** How should the dbt project connect to "a copy of beeatlas.duckdb"?

**Options:**
- Attach read-only
- Per-run copy script
- One-time committed copy elsewhere

**Selected:** Other — "The copy is a download from s3. No need to make additional local copies."

**Follow-up question:** dbt-duckdb typically needs write access for intermediates. How to handle against data/beeatlas.duckdb?

**Options:**
- Allow dbt to write into beeatlas.duckdb
- All models external (parquet) materialization
- Separate attached output DB

**Selected:** Allow dbt to write into beeatlas.duckdb (dedicated `dbt_sandbox` schema; S3 re-download wipes it).

## Area 3 — Model granularity & layering

**Question:** export.py has ~10 named CTEs. How granular should the DAG be?

**Options:**
- Staging → intermediate → marts (deep)
- Two-layer (staging + marts)
- Single mega-model

**Selected:** Deep three-layer split. Rationale: maximizes test/contract/partial-run/lineage surface for Phase 84.

## Area 4 — Layout, deps, spatial extension, sources (batched)

| Question | Options | Selected |
|---|---|---|
| Deps location | data/pyproject.toml dev / separate uv project | data/pyproject.toml dev |
| profiles.yml location | in-repo / ~/.dbt/ | in-repo at data/dbt/profiles.yml |
| Spatial load | profiles.yml extensions / on-run-start hook | profiles.yml `extensions: [spatial]` |
| source() targets | attached duckdb schemas / on-disk parquet | attached duckdb schemas |

## Deferred / flagged for findings

- `samples.parquet` is named in REQUIREMENTS.md/ROADMAP.md but `export.py` doesn't currently emit it (samples fold into `occurrences.parquet` via FULL OUTER JOIN). Flagged for FIND-01 / FIND-02 in Phase 84; possibly a separate mart in v3.4+.
- Cleanup macro for dropping `dbt_sandbox` schema — planner's discretion.

## Claude's discretion / not asked

- Exact dbt-duckdb version pin (left to researcher/planner).
- Concrete schema name `dbt_sandbox` proposed; planner may refine.
- Model file naming convention (`stg_<source>__<table>`, `int_<concept>`, mart names) — proposed in CONTEXT.md; planner can adjust.
- Whether to use a shared GeoJSON-writer macro vs per-model post-hooks.
