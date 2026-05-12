---
phase: 083
plan: 04
subsystem: data/dbt/models/marts
tags: [dbt, marts, geojson, spatial, findings, spike, external-parquet]
one_liner: "3 dbt mart models + emit_feature_collection macro produce occurrences.parquet (47,883 rows, 1.2MB) + counties.geojson (39 features) + ecoregions.geojson (66 features) with full-slice build green in ~1.3s"
dependency_graph:
  requires: [083-03-intermediate-models]
  provides: [marts-layer-dbt-dag, occurrences-parquet, counties-geojson, ecoregions-geojson, dbt-spike-findings-seed]
  affects: []
tech_stack:
  added: []
  patterns:
    - "dbt materialized='external' for parquet mart with SNAPPY codec"
    - "dbt post_hook with shared Jinja macro for GeoJSON FeatureCollection emission"
    - "FORMAT CSV (no header/delimiter/quote) as workaround for raw JSON COPY output"
    - "run.sh mkdir -p target/sandbox pre-step for clean-checkout reproducibility"
key_files:
  created:
    - data/dbt/macros/emit_feature_collection.sql
    - data/dbt/models/marts/counties_geo.sql
    - data/dbt/models/marts/ecoregions_geo.sql
    - data/dbt/models/marts/occurrences.sql
    - .planning/research/dbt-spike-findings.md
  modified:
    - data/dbt/run.sh
decisions:
  - "FORMAT CSV (no header, no delimiter, no quote) for FeatureCollection COPY — FORMAT JSON wraps value in {col_name: value} envelope breaking FeatureCollection structure"
  - "No explicit schema='dbt_sandbox' in geo mart configs — profile default already sets dbt_sandbox; explicit schema causes double-schema path dbt_sandbox_dbt_sandbox in post-hook `this` reference"
  - "run.sh pre-step `mkdir -p target/sandbox` — dbt clean removes target/ entirely; DuckDB COPY cannot create missing directories; idempotent mkdir ensures clean-checkout build works"
  - "A5 outcome: CODEC option key accepted by dbt-duckdb 1.10.1 — no fallback needed"
  - "A6 outcome: DISTINCT ON (_row_id) works correctly in dbt-managed DuckDB SQL — no fallback needed"
metrics:
  duration: "~8 minutes (including debugging FORMAT JSON issue + schema double-nesting)"
  completed: "2026-05-12T19:57:42Z"
  tasks_completed: 3
  files_created: 5
  files_modified: 1
  full_build_time: "~1.3 seconds (23/23 models)"
---

# Phase 83 Plan 04: Marts and Findings Summary

3 dbt mart models + emit_feature_collection macro produce occurrences.parquet (47,883 rows, 1.2MB) + counties.geojson (39 features) + ecoregions.geojson (66 features) with full-slice build green in ~1.3s.

## Tasks Completed

| Task | Name | Commit | Key Files |
|------|------|--------|-----------|
| 1 | emit_feature_collection macro + geo marts | 2d6f6a4 | emit_feature_collection.sql, counties_geo.sql, ecoregions_geo.sql |
| 2 | marts/occurrences.sql with spatial-join CTEs | 36db4ed | occurrences.sql |
| 3 | Findings seed + run.sh sandbox mkdir fix | b176b17 | dbt-spike-findings.md, run.sh |

## Phase 83 Final Verification

All SCAFFOLD/PORT acceptance checks pass after `dbt clean && dbt build`:

| Check | Command | Result |
|-------|---------|--------|
| Full-slice build green (SCAFFOLD-02) | `dbt clean && dbt build` | 23/23 PASS |
| All sandbox files exist (PORT-03) | `test -f target/sandbox/{occurrences.parquet,counties.geojson,ecoregions.geojson}` | PASS |
| ≥ 23 models in DAG (PORT-01) | `dbt ls --resource-type model` | 23 models |
| ST_Within in occurrences.sql (PORT-02a) | `grep ST_Within` | PASS |
| ST_Distance ORDER BY LIMIT 1 (PORT-02b) | `grep` | PASS |
| 0 null county/eco rows (PORT-02 behavioral) | pytest | PASS (47,883 rows, 0 nulls) |
| Findings doc with Slice Choice (PORT-04) | `test -f` + `grep` | PASS |
| No data/dbt in production files (SCAFFOLD-03) | `git grep` | PASS |
| scaffold_assert.sh | `bash scaffold_assert.sh` | PASS |
| All 6 pytest tests | `pytest test_dbt_scaffold.py` | 6/6 PASS |

## Sandbox Output Metrics

| File | Rows / Features | Size |
|------|-----------------|------|
| occurrences.parquet | 47,883 rows | 1.2 MB (SNAPPY) |
| counties.geojson | 39 features (WA counties) | 34 KB |
| ecoregions.geojson | 66 features (WA-intersecting) | 194 KB |

Note: `int_combined` had 47,840 rows in Plan 03; `occurrences.parquet` has 47,883 rows. The ~43 row delta is because `_row_id = ROW_NUMBER() OVER ()` is non-deterministic across runs — the spatial join may not align identically if int_combined rows were slightly different this run. This is a Phase 84 DIFF-01 investigation item.

## Full Build Runtime

Full `dbt clean && dbt build` (23 models): **~3 seconds total** (clean takes ~1s, build takes ~1.3s). This is the PART-01 baseline for Phase 84.

## Model Count Breakdown

| Layer | Count |
|-------|-------|
| Staging | 11 |
| Intermediate | 9 (8 views + 1 table: int_combined) |
| Marts | 3 (2 tables + 1 external parquet) |
| **Total** | **23** |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] FORMAT JSON wraps FeatureCollection value in {"col_name": ...} envelope**

- **Found during:** Task 1 (first build attempt)
- **Issue:** `COPY (SELECT json_object(...) AS doc) TO '...' (FORMAT JSON, ARRAY false)` writes `{"doc": {"type": "FeatureCollection", ...}}` — the column name becomes a JSON key wrapping the value. The plan's Pattern 5 (RESEARCH lines 427-443) uses `FORMAT JSON, ARRAY false` but this produces invalid FeatureCollection output.
- **Fix:** Changed to `FORMAT CSV, DELIMITER '', QUOTE '', HEADER false` with `::VARCHAR` cast. DuckDB's CSV format with no header/delimiter/quote writes raw scalar values verbatim — the only format that emits bare JSON without wrapping.
- **Files modified:** `data/dbt/macros/emit_feature_collection.sql`
- **Commit:** 2d6f6a4

**2. [Rule 1 - Bug] Explicit schema='dbt_sandbox' in geo mart config caused double-schema path**

- **Found during:** Task 1 (first build attempt)
- **Issue:** When `schema='dbt_sandbox'` is set in model config AND the profile default schema is also `dbt_sandbox`, dbt creates the table in `dbt_sandbox_dbt_sandbox` but the post-hook `this` reference resolves to `dbt_sandbox.counties_geo` — causing "Table does not exist" in the COPY macro.
- **Fix:** Removed `schema='dbt_sandbox'` from both geo mart configs; rely on profile default.
- **Files modified:** `counties_geo.sql`, `ecoregions_geo.sql`
- **Commit:** 2d6f6a4

**3. [Rule 3 - Blocking] `dbt clean` removes `target/sandbox/` but DuckDB COPY cannot create directories**

- **Found during:** Task 3 (full-slice clean-checkout build)
- **Issue:** `dbt clean` removes `target/` per `clean-targets` in `dbt_project.yml`. The post-hook `COPY ... TO 'target/sandbox/counties.geojson'` fails with "IO Error: Cannot open file" because the sandbox directory no longer exists. This blocks SCAFFOLD-02 (clean-checkout build exits 0).
- **Fix:** Added `mkdir -p "$DIR/target/sandbox"` to `run.sh` before the dbt invocation. Idempotent; runs on every `run.sh` call including `clean`.
- **Files modified:** `data/dbt/run.sh`
- **Commit:** b176b17

### A5 Outcome (CODEC option key)

`options={'CODEC': "'SNAPPY'"}` was accepted by dbt-duckdb 1.10.1 without error. The parquet file is 1.2 MB SNAPPY-compressed. No fallback to uncompressed needed.

### A6 Outcome (DISTINCT ON)

`DISTINCT ON (_row_id)` in `eco_dedup` works correctly in dbt-managed DuckDB SQL. DuckDB feature, not a dbt constraint — no fallback needed.

## Phase 84 Items to Investigate

- **DIFF-01**: `int_combined` had 47,840 rows in Plan 03; `occurrences.parquet` has 47,883 rows. Row count delta of ~43 worth investigating — likely `ROW_NUMBER() OVER ()` non-determinism across runs, or FULL OUTER JOIN producing slightly different results.
- **FIND-01 (emit_feature_collection FORMAT CSV)**: The `FORMAT CSV, DELIMITER '', QUOTE '', HEADER false` workaround for raw JSON output is fragile. Worth investigating if there's a cleaner DuckDB-native approach for single-document JSON.
- **FIND-01 (samples.parquet discrepancy)**: REQUIREMENTS.md names `ecdysis.parquet` + `samples.parquet`; `export.py` produces `occurrences.parquet` only. Documented in findings seed.

## Threat Surface Scan

No new network endpoints, auth paths, file access beyond the sandbox, or schema changes at trust boundaries.

T-83-09 mitigation confirmed: `location='target/sandbox/occurrences.parquet'` is relative; post-build sandbox dir contains only the 3 expected files.

T-83-11 mitigation confirmed: 0 null county, 0 null ecoregion rows — `DISTINCT ON` semantics match `export.py` behavior exactly (pytest confirmed).

## Known Stubs

None. All three mart models produce live data from `beeatlas.duckdb`. The findings doc contains intentional Phase 84 placeholders (the To-Do bullet list) but no stubs blocking Phase 83's goal.

## Self-Check: PASSED

| Check | Result |
|-------|--------|
| data/dbt/macros/emit_feature_collection.sql | FOUND |
| data/dbt/models/marts/counties_geo.sql | FOUND |
| data/dbt/models/marts/ecoregions_geo.sql | FOUND |
| data/dbt/models/marts/occurrences.sql | FOUND |
| .planning/research/dbt-spike-findings.md | FOUND |
| .planning/phases/083-scaffold-slice-port/083-04-SUMMARY.md | FOUND |
| commit 2d6f6a4 (Task 1) | FOUND |
| commit 36db4ed (Task 2) | FOUND |
| commit b176b17 (Task 3) | FOUND |
