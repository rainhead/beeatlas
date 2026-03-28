---
gsd_state_version: 1.0
milestone: v1.6
milestone_name: dlt Pipeline Migration
status: verifying
stopped_at: Completed 25-cdk-infrastructure 25-01-PLAN.md
last_updated: "2026-03-28T15:43:34.181Z"
last_activity: 2026-03-28
progress:
  total_phases: 9
  completed_phases: 9
  total_plans: 13
  completed_plans: 13
  percent: 0
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-03-27)

**Core value:** Collectors can see where bees have been collected and where target host plants grow, enabling informed planning of future collecting events.
**Current focus:** Phase 25 — cdk-infrastructure

## Current Position

Phase: 25 (cdk-infrastructure) — EXECUTING
Plan: 1 of 1
Status: Phase complete — ready for verification
Last activity: 2026-03-28

Progress: [__________] 0% (0/5 phases)

## Performance Metrics

**Velocity:**

- Total plans completed: 0 (this milestone)
- Average duration: —
- Total execution time: —

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| - | - | - | - |

*Updated after each plan completion*
| Phase 21-parquet-and-geojson-export P01 | 3min | 1 tasks | 7 files |
| Phase 22-orchestration P01 | 5min | 2 tasks | 3 files |
| Phase 23-frontend-simplification P01 | 1min | 2 tasks | 2 files |
| Phase 24-tech-debt-audit P01 | 1min | 1 tasks | 2 files |
| Phase 25-cdk-infrastructure P01 | 4 | 3 tasks | 3 files |

## Accumulated Context

### Decisions

- **v1.5 coastal nulls**: ~408 WA specimens fall outside ecoregion polygon boundaries; nearest-polygon fallback required after 'within' sjoin for null rows
- **v1.5 CRS risk**: EPA L3 ecoregion shapefile uses non-EPSG spherical Lambert AEA CRS — must call .to_crs('EPSG:4326') before sjoin
- **v1.4 BigInt coercion**: hyparquet returns INT64 Parquet columns as JavaScript BigInt; must coerce with Number() at read time
- **v1.6 scope**: Production CI integration (INFRA-06/07/08) and DuckDB WASM frontend deferred — local-first migration goal for this milestone
- [Phase 21-parquet-and-geojson-export]: export.py uses DuckDB COPY TO PARQUET with ST_Within + ST_Distance fallback; parquet files remain gitignored (build artifacts); GeoJSON files committed as geographic source boundaries
- [Phase 22-orchestration]: data/run.py replaces build-data.sh — Python orchestrator calls pipeline functions in-process, no subprocess
- [Phase 23-frontend-simplification]: Read inat_observation_id from ecdysis feature properties; deleted loadLinksMap without fallback since Phase 21 guarantees the column
- [Phase 24-tech-debt-audit]: Closed 5 legacy debt items resolved by dlt migration; updated EPA CRS item; added 3 new items (no dlt tests, CI not wired, DuckDB persistence unresolved)
- **v1.7 container image required**: geopandas (GDAL/GEOS) + duckdb + dlt exceed 250 MB Lambda zip limit; DockerImageFunction is the only viable packaging approach
- **v1.7 EFS removalPolicy RETAIN is non-negotiable**: destroying the CDK stack must not delete the EFS filesystem or the DuckDB data stored on it
- **v1.7 DuckDB temp on /tmp not EFS**: temp_directory must point to /tmp/duckdb_swap; NFS stale handle errors occur if temp files land on EFS
- **v1.7 PIPE-10 superseded**: PIPE-10 (local pipeline runs) is superseded by PIPE-11 (Lambda execution); not assigned to any v1.7 phase
- **v1.7 seed prerequisite**: Ecdysis links pipeline takes ~38 min cold; exceeds Lambda 15-min limit; DuckDB must be seeded locally and uploaded before EventBridge schedule is enabled — manual step in Phase 26
- **v1.7 CloudFront CORS cache**: Origin header must be in CloudFront cache key and S3 CORS must expose Range/Content-Range headers; both must be configured together in Phase 28 to avoid CORS failures for browser hyparquet fetch
- [Phase 25-cdk-infrastructure]: TimeZone must be imported from aws-cdk-lib core (not aws-scheduler) in CDK 2.238.0
- [Phase 25-cdk-infrastructure]: Lambda URL auth NONE — volunteer project, manual invocation only, no sensitive data in endpoint

### Pending Todos

| # | Title | Area | File |
|---|-------|------|------|
| - | (none) | - | - |

### Blockers/Concerns

None.

## Session Continuity

Last session: 2026-03-28T15:43:34.178Z
Stopped at: Completed 25-cdk-infrastructure 25-01-PLAN.md
Resume file: None
