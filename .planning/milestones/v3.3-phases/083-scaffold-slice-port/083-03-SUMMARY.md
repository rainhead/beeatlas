---
phase: 083
plan: 03
subsystem: data/dbt/models/intermediate
tags: [dbt, intermediate, port, spike, duckdb]
requires: [083-02]
provides: [intermediate layer — 9 models covering export.py:41-197 mid-CTEs]
affects: [083-04]
tech_stack:
  added: []
  patterns:
    - dbt intermediate layer (views + one table override)
    - FULL OUTER JOIN for ecdysis × samples join
    - UNION ALL dual-arm pattern for provisional WABA rows
key_files:
  created:
    - data/dbt/models/intermediate/int_id_modified.sql
    - data/dbt/models/intermediate/int_waba_link.sql
    - data/dbt/models/intermediate/int_ecdysis_catalog_suffixes.sql
    - data/dbt/models/intermediate/int_matched_waba_ids.sql
    - data/dbt/models/intermediate/int_provisional_waba_ids.sql
    - data/dbt/models/intermediate/int_ecdysis_base.sql
    - data/dbt/models/intermediate/int_samples_base.sql
    - data/dbt/models/intermediate/int_specimen_obs_base.sql
    - data/dbt/models/intermediate/int_combined.sql
decisions:
  - "int_combined materialized as TABLE (inline config + dbt_project.yml override) — prevents re-evaluating UNION ALL on every spatial join in marts/occurrences"
  - "lat-NULL filter from export.py:84,123 omitted from int_ecdysis_base and int_ecdysis_catalog_suffixes — already applied by stg_ecdysis__occurrences (not a deviation; removes redundancy)"
  - "Worktree beeatlas.duckdb (empty) replaced with symlink to main repo's populated database — worktree copy was 274KB vs 108MB in main repo; symlink resolves via profiles.yml relative path"
metrics:
  duration: 7 minutes
  completed: 2026-05-12
  tasks_completed: 3
  files_created: 9
---

# Phase 83 Plan 03: Intermediate Models Summary

**One-liner:** 9 intermediate dbt models mirroring export.py:41-197 mid-CTEs as views (8) + one TABLE (int_combined), building 20/20 with 47,840 rows in int_combined.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | 5 small derivation models | 0559b0d | int_id_modified, int_waba_link, int_ecdysis_catalog_suffixes, int_matched_waba_ids, int_provisional_waba_ids |
| 2 | Three base-projection models | ccd71dd | int_ecdysis_base, int_samples_base, int_specimen_obs_base |
| 3 | int_combined (UNION ALL, materialized=table) | 033a271 | int_combined |

## What Was Built

### 5 Small Derivation Models (Task 1)

- **int_id_modified**: `MAX(modified) AS max_id_modified GROUP BY coreid` from `stg_ecdysis__identifications`. Mirrors export.py:41-44.
- **int_waba_link**: `catalog_suffix → MIN(waba.id)` via `field_id=18116` OFVs. Mirrors export.py:46-55.
- **int_ecdysis_catalog_suffixes**: `DISTINCT CAST(regexp_extract(catalog_number, '[0-9]+$', 0) AS BIGINT)` from `stg_ecdysis__occurrences`. Mirrors export.py:120-124.
- **int_matched_waba_ids**: Join of `int_waba_link` × `int_ecdysis_catalog_suffixes`. Mirrors export.py:125-129.
- **int_provisional_waba_ids**: WABA observation IDs not in matched set. Mirrors export.py:130-134.

### Three Base-Projection Models (Task 2)

- **int_ecdysis_base**: 20-column projection joining ecdysis occurrences, occurrence_links, iNat host, id_modified, waba_link. Mirrors export.py:57-85.
- **int_samples_base**: 9-column projection with `field_id=8338` (specimen count) and `field_id=9963` (sample_id) OFV joins. Mirrors export.py:86-103.
- **int_specimen_obs_base**: 10-column projection from WABA observations + taxon_lineage. Mirrors export.py:104-119.

### int_combined (Task 3)

UNION ALL of:
- **ARM 1** (47,811 rows): `int_ecdysis_base` FULL OUTER JOIN `int_samples_base` + LEFT JOIN `int_specimen_obs_base`. `is_provisional = FALSE`. Mirrors export.py:137-159.
- **ARM 2** (29 rows): Provisional WABA via `field_id=1718` OFV; `host_observation_id` extracted via `regexp_extract(ofv1718.value, '([0-9]+)$', 1)`. `is_provisional = TRUE`. Mirrors export.py:163-197. WHERE `sob.longitude/latitude IS NOT NULL` preserved.

Total `int_combined` row count: **47,840**.

Materialized as `BASE TABLE` in `dbt_sandbox` (verified via `information_schema.tables`).

## Verification Results

```
bash data/dbt/run.sh build --select "staging+ intermediate+"
Done. PASS=20 WARN=0 ERROR=0 SKIP=0 NO-OP=0 TOTAL=20

SELECT COUNT(*) FROM dbt_sandbox.int_combined → 47840
table_type from information_schema.tables → BASE TABLE

bash data/dbt/run.sh ls --resource-type model --select intermediate → 9 models
```

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Worktree beeatlas.duckdb was an empty 274KB file**
- **Found during:** Task 1 (first dbt build attempt)
- **Issue:** The worktree's `data/beeatlas.duckdb` was an empty placeholder (274KB) with only `dbt_sandbox` and `main` schemas — no source data (`ecdysis_data`, `inaturalist_data`, etc.). All staging views failed with "schema does not exist".
- **Fix:** Replaced the empty file with a symlink to the main repo's populated database at `/Users/rainhead/dev/beeatlas/data/beeatlas.duckdb` (108MB with all source schemas). The profiles.yml `path: ../beeatlas.duckdb` resolves through the symlink correctly.
- **Files modified:** `data/beeatlas.duckdb` (symlink, gitignored)
- **Commit:** N/A — gitignored file; no commit needed

### Simplifications (Not Deviations)

**1. Lat-NULL filter omitted from int_ecdysis_base and int_ecdysis_catalog_suffixes**
- The `WHERE decimal_latitude IS NOT NULL AND decimal_latitude != ''` filter from export.py:84,123 is already applied by `stg_ecdysis__occurrences`. Omitting it in the intermediate layer removes redundant filtering without changing semantics.
- Documented in comments in both model files.

## Threat Surface Scan

No new network endpoints, auth paths, or trust boundary changes introduced. All models are local DuckDB SQL using `ref()` with no external access.

**T-83-07 mitigation confirmed:** `int_combined` verified as `BASE TABLE` (not VIEW) in `information_schema.tables`. Pitfall 5 alarm signal (`dbt build >30s`) not triggered — build completed in ~0.2s for `int_combined`.

**T-83-08 mitigation status:** Column names exactly match export.py projections. Plan 04's `occurrences` mart will surface any column-name drift via DuckDB binding errors.

## Known Stubs

None. All models produce live data from the source DuckDB schemas.

## Self-Check: PASSED

- [x] `data/dbt/models/intermediate/int_id_modified.sql` — exists
- [x] `data/dbt/models/intermediate/int_waba_link.sql` — exists
- [x] `data/dbt/models/intermediate/int_ecdysis_catalog_suffixes.sql` — exists
- [x] `data/dbt/models/intermediate/int_matched_waba_ids.sql` — exists
- [x] `data/dbt/models/intermediate/int_provisional_waba_ids.sql` — exists
- [x] `data/dbt/models/intermediate/int_ecdysis_base.sql` — exists
- [x] `data/dbt/models/intermediate/int_samples_base.sql` — exists
- [x] `data/dbt/models/intermediate/int_specimen_obs_base.sql` — exists
- [x] `data/dbt/models/intermediate/int_combined.sql` — exists
- [x] Commit 0559b0d — Task 1 (5 small models)
- [x] Commit ccd71dd — Task 2 (3 base-projection models)
- [x] Commit 033a271 — Task 3 (int_combined)
- [x] `int_combined` table_type = BASE TABLE
- [x] `int_combined` row count = 47,840 > 0
- [x] `dbt build` 20/20 PASS
