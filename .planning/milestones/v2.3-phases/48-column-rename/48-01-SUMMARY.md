---
phase: 48-column-rename
plan: 01
subsystem: data-pipeline, frontend
tags: [rename, column, parquet, duckdb, typescript]
dependency_graph:
  requires: []
  provides: [host_observation_id column in all sources]
  affects: [data/ecdysis_pipeline.py, data/export.py, frontend/src/bee-sidebar.ts, frontend/src/features.ts, frontend/src/bee-map.ts, frontend/src/bee-atlas.ts, frontend/src/filter.ts, frontend/src/bee-specimen-detail.ts, scripts/validate-schema.mjs]
tech_stack:
  added: []
  patterns: [DuckDB ALTER TABLE, parquet column rename via SQL SELECT AS]
key_files:
  created: []
  modified:
    - data/ecdysis_pipeline.py
    - data/export.py
    - data/tests/conftest.py
    - data/tests/test_export.py
    - frontend/src/bee-atlas.ts
    - frontend/src/bee-map.ts
    - frontend/src/bee-sidebar.ts
    - frontend/src/bee-specimen-detail.ts
    - frontend/src/features.ts
    - frontend/src/filter.ts
    - frontend/src/tests/bee-sidebar.test.ts
    - scripts/validate-schema.mjs
decisions:
  - "Used DuckDB ALTER TABLE to rename physical column in beeatlas.duckdb; local parquet regenerated via SQL SELECT AS rename since full pipeline export fails locally due to pre-existing geographies geom column issue"
metrics:
  duration: ~20min
  completed: 2026-04-12
  tasks_completed: 2
  files_modified: 12
---

# Phase 48 Plan 01: Column Rename inat_observation_id -> host_observation_id Summary

Atomically renamed `inat_observation_id` to `host_observation_id` (and camelCase `inatObservationId` to `hostObservationId`) across all 12 source files, the DuckDB physical table, and the local parquet export, to disambiguate the host plant observation column from the upcoming specimen observation column (Phase 50).

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Rename in all source files + ALTER TABLE | 8505e1f | 12 files |
| 2 | Regenerate local parquet (S3 upload: auth gate) | — | frontend/public/data/ecdysis.parquet (local only) |

## What Was Built

**Task 1 — Source file renames:**
- Python (snake_case): `ecdysis_pipeline.py`, `export.py`, `tests/conftest.py`, `tests/test_export.py`
- TypeScript SQL strings (snake_case): `features.ts`, `bee-atlas.ts`, `filter.ts`
- TypeScript TS properties (camelCase): `bee-atlas.ts`, `bee-map.ts`, `bee-sidebar.ts`, `bee-specimen-detail.ts`, `tests/bee-sidebar.test.ts`
- Schema gate: `scripts/validate-schema.mjs`
- DuckDB physical column: `ALTER TABLE ecdysis_data.occurrence_links RENAME COLUMN inat_observation_id TO host_observation_id`

**Task 2 — Parquet regeneration:**
- Local `ecdysis.parquet` updated via SQL SELECT AS rename (DuckDB read + rewrite with renamed column)
- `node scripts/validate-schema.mjs` passes against local parquet
- S3 upload blocked by expired AWS credentials (see Auth Gates section)

## Verification Results

```
grep -r "inat_observation_id" data/ scripts/ frontend/src/  => 0 matches
grep -r "inatObservationId" frontend/src/                   => 0 matches
cd data && uv run pytest                                     => 27 passed
cd frontend && npm test                                      => 131 passed, 1 pre-existing failure
node scripts/validate-schema.mjs                             => ok ecdysis.parquet, ok samples.parquet
```

## Deviations from Plan

### Auto-fixed Issues

None — all edits matched the plan spec exactly.

### Pre-existing Test Failure (out of scope)

**1. [Pre-existing] BeeFilterControls `boundaryMode` property test**
- **Found during:** Task 1 verification
- **Issue:** `BeeFilterControls has @property declarations for required inputs` fails on `props.has('boundaryMode')` — this was failing before our changes (confirmed by `git stash` + rerun)
- **Fix:** None applied — out of scope
- **Files modified:** None

### Parquet Export Approach Deviation

**2. [Rule 3 - Blocking] Local run.py export fails due to geographies geom column mismatch**
- **Found during:** Task 2
- **Issue:** `run.py` export fails with `Binder Error: Referenced column "geom" not found` — local dlt-loaded geographies data uses `geometry_wkt` not `geom`, a pre-existing environment limitation
- **Fix:** Used DuckDB SQL `SELECT inat_observation_id AS host_observation_id ...` to rewrite the local parquet directly, preserving all data with the renamed column
- **Files modified:** `frontend/public/data/ecdysis.parquet` (gitignored, not committed)
- **Commit:** N/A (gitignored)

## Auth Gates

**S3 Upload — Task 2:**
- **What was automated:** Local parquet regenerated with `host_observation_id`, schema gate passes locally
- **Blocked by:** Expired AWS credentials (`Your session has expired. Please reauthenticate using 'aws login'`)
- **What must be done manually:**
  1. Reauthenticate: `aws sso login --profile beeatlas` (or applicable auth method)
  2. Upload: `aws --profile beeatlas s3 cp frontend/public/data/ecdysis.parquet s3://beeatlasstack-sitebucket397a1860-h5dtjzkld3yv/data/ecdysis.parquet`
  3. Invalidate CloudFront: `aws --profile beeatlas cloudfront create-invalidation --distribution-id E3SAI2PQ8FN0E7 --paths "/data/ecdysis.parquet"`
  4. Verify: `node scripts/validate-schema.mjs` should pass against CloudFront (will confirm `host_observation_id` is live)
- **Alternative:** The nightly pipeline on maderas will regenerate and upload automatically once the code is pushed — if pushing before S3 is updated, CI schema gate will use CloudFront which still has the old name. Trigger nightly manually on maderas instead.

## Known Stubs

None.

## Threat Flags

None — pure rename, no new network endpoints or trust boundaries introduced.

## Self-Check: PASSED

- Source files modified: confirmed (12 files, commit 8505e1f)
- Commit exists: `git log --oneline | grep 8505e1f` returns match
- Zero grep matches for old names in source files: confirmed
- pytest: 27 passed
- npm test: 131 passed (1 pre-existing unrelated failure)
- validate-schema.mjs: passes locally
