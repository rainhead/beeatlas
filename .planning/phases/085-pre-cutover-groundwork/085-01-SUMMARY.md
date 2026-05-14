---
phase: 085-pre-cutover-groundwork
plan: "01"
subsystem: database
tags: [dbt, duckdb, staging, inat, data-quality]

requires: []
provides:
  - stg_inat__observations staging view with WHERE id IS NOT NULL filter
  - dbt not_null and unique tests on stg_inat__observations.id both PASS (TEST-01 resolved)
affects:
  - 085-02 (TEST-02 ecdysis_id fix — the remaining awkward-fit)
  - 085-04 (full dbt build — needs both tests passing for exit 0)

tech-stack:
  added: []
  patterns:
    - "Staging-layer NULL filter: exclude dlt soft-delete tombstones in the staging view, preserve in raw schema for dlt bookkeeping"

key-files:
  created: []
  modified:
    - data/dbt/models/staging/stg_inat__observations.sql
    - data/dbt/models/staging/schema.yml

key-decisions:
  - "Filter tombstone at staging layer (WHERE id IS NOT NULL) not at pipeline ingest — preserves dlt merge bookkeeping in raw layer (TEST-01 D-01)"
  - "Verified against main repo database (data/beeatlas.duckdb) since worktree DuckDB is a stub (274 KB vs 114 MB)"

patterns-established:
  - "Load-bearing filter comment block: multi-line comment above config() explaining WHY the filter exists, what the upstream artifact is, and why filtering here is safe"

requirements-completed:
  - TEST-01

duration: 5min
completed: 2026-05-13
---

# Phase 085 Plan 01: Pre-Cutover Groundwork (TEST-01 iNat null-id tombstone) Summary

**WHERE id IS NOT NULL added to stg_inat__observations staging view, dropping dlt tombstone row from 10,846 to 10,845 rows; dbt not_null and unique tests both PASS (TEST-01 resolved)**

## Performance

- **Duration:** ~5 min
- **Started:** 2026-05-13T01:11:00Z
- **Completed:** 2026-05-13T01:14:00Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments

- Added `WHERE id IS NOT NULL` filter to `stg_inat__observations.sql` with an explanatory comment block documenting the dlt tombstone, why it must be preserved in the raw layer, and why NULL filtering at staging is safe
- Updated `schema.yml` to remove the OBSERVED FAIL / awkward-fit annotation; both not_null and unique tests now carry VERIFIED comments with the post-filter row count (10,845)
- TEST-01 resolved: `dbt test --select stg_inat__observations` exits 0 with PASS=2, FAIL=0, ERROR=0

## Lines Changed

**data/dbt/models/staging/stg_inat__observations.sql** — before:
```sql
SELECT *
FROM {{ source('inaturalist_data', 'observations') }}
```

After (simplified):
```sql
-- WHERE filter is load-bearing: the dlt soft-delete tombstone row (id=NULL,
-- is_deleted=True, all domain fields NULL) must be excluded here. ...
SELECT *
FROM {{ source('inaturalist_data', 'observations') }}
WHERE id IS NOT NULL
```

**data/dbt/models/staging/schema.yml** — before (stg_inat__observations id column):
```yaml
description: >
  iNaturalist observation ID. TEST-01 outcome (awkward-fit): not_null FAILS
  with 1 null id; unique PASSES (10,846 rows, all distinct)...
data_tests:
  - not_null    # OBSERVED FAIL (1 null id) — awkward-fit finding, kept as a tripwire
  - unique      # PASSED: 10,846 distinct / 10,846 rows
```

After:
```yaml
description: >
  iNaturalist observation ID. The dlt soft-delete tombstone row (id=NULL) is
  filtered upstream in stg_inat__observations.sql; this view contains 10,845
  rows post-filter. Both not_null and unique now pass cleanly.
data_tests:
  - not_null    # VERIFIED: 10,845 rows post-filter (tombstone excluded in staging view)
  - unique      # VERIFIED unique: 10,845 distinct / 10,845 rows
```

## Row Count Before/After

| Model | Before filter | After filter |
|-------|--------------|-------------|
| stg_inat__observations | 10,846 | 10,845 |
| occurrences.parquet (downstream) | 47,883 | 47,883 (unchanged) |

The tombstone row (id=NULL) never equi-joined to any downstream model
(`int_ecdysis_base` LEFT JOIN uses `inat.id = links.host_observation_id`; NULL = anything
is always false). The raw `inaturalist_data.observations` table remains untouched.

## Task Commits

Each task was committed atomically:

1. **Task 1: Add WHERE id IS NOT NULL to stg_inat__observations.sql** - `3c838e7` (feat)
2. **Task 2: Update staging/schema.yml to reflect TEST-01 resolution** - `eb0f130` (feat)

## Files Created/Modified

- `data/dbt/models/staging/stg_inat__observations.sql` — Added WHERE clause and explanatory comment block
- `data/dbt/models/staging/schema.yml` — Replaced OBSERVED FAIL annotation with VERIFIED annotations, updated description and row counts

## Decisions Made

- Filter at staging layer (not pipeline ingest) per TEST-01 D-01 — preserves dlt merge bookkeeping row in raw schema
- Verified against main repo database (worktree DuckDB stub is 274 KB, lacks inaturalist_data schema); copied edited files to main repo temporarily for `dbt run` and `dbt test` verification, then restored

## Deviations from Plan

None — plan executed exactly as written. The verification approach (running against the main repo database) was a pragmatic adaptation since the worktree DuckDB doesn't have source data loaded, but this is expected infrastructure behavior, not a plan deviation.

## Issues Encountered

The worktree's `data/beeatlas.duckdb` is a stub (274 KB, no source schemas). Ran `dbt run` and `dbt test` by temporarily copying the edited files to the main repo's model directory, executing dbt there (which uses the full 114 MB database), then restoring the originals. Tests PASS=2 confirmed.

## Next Phase Readiness

- TEST-01 is closed; one awkward-fit remains (TEST-02: ecdysis_id relationship ERROR)
- Plan 085-02 resolves TEST-02
- Plan 085-04 full `dbt build` should show the iNat not_null test as PASS once this plan merges

---
*Phase: 085-pre-cutover-groundwork*
*Completed: 2026-05-13*
