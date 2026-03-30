---
gsd_state_version: 1.0
milestone: v1.7
milestone_name: Production Pipeline Infrastructure
status: verifying
stopped_at: Completed 29-01-PLAN.md
last_updated: "2026-03-30T05:25:32.764Z"
last_activity: 2026-03-30
progress:
  total_phases: 5
  completed_phases: 5
  total_plans: 5
  completed_plans: 5
  percent: 40
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-03-27)

**Core value:** Collectors can see where bees have been collected and where target host plants grow, enabling informed planning of future collecting events.
**Current focus:** Phase 29 — ci-simplification

## Current Position

Phase: 29 (ci-simplification) — EXECUTING
Plan: 1 of 1
Status: Phase complete — ready for verification
Last activity: 2026-03-30

Progress: [████░░░░░░] 40% (2/5 phases)

## Pivot: Lambda → maderas cron

Lambda was attempted (phases 25–26) but hit fatal blockers: geographies OOM, 15-min timeout, read-only filesystem, missing home directory, iNat auth. Pipeline now runs as `data/nightly.sh` on maderas via cron at 3am daily. CDK/Lambda infrastructure remains deployed in AWS but is not the execution path.

**What's working:**

- `nightly.sh` runs end-to-end on maderas (~2.5 min): pipelines → export → S3 upload → DuckDB backup → CloudFront invalidation
- Cron: `0 3 * * * /home/peter/dev/beeatlas/data/nightly.sh >> /home/peter/beeatlas-pipeline.log 2>&1`
- CI: `cache_restore.sh` reads parquet from `s3://BUCKET/data/` (updated 2026-03-28)
- CI schema validation passing

**What remains:**

- Phase 27: pytest coverage for export.py and pipeline modules
- Phase 28: Frontend runtime fetch (parquet still bundled via assets/)
- Phase 29: CI simplification (fetch-data.yml still exists; cache-restore + validate-schema steps still run)

## Performance Metrics

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| Phase 21-parquet-and-geojson-export P01 | 3min | 1 tasks | 7 files |
| Phase 22-orchestration P01 | 5min | 2 tasks | 3 files |
| Phase 23-frontend-simplification P01 | 1min | 2 tasks | 2 files |
| Phase 24-tech-debt-audit P01 | 1min | 1 tasks | 2 files |
| Phase 25-cdk-infrastructure P01 | 4min | 3 tasks | 3 files |
| Phase 26-lambda-handler-dockerfile P01 | 3min | 2 tasks | 10 files |
| Phase 27-pipeline-tests P01 | 25 | 3 tasks | 6 files |
| Phase 28-frontend-runtime-fetch P01 | 30min | 2 tasks | 10 files |
| Phase 29-ci-simplification P01 | 15min | 2 tasks | 4 files |

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
- **v1.7 Lambda abandoned**: geographies OOM, 15-min timeout, read-only filesystem, missing home directory, iNat auth all blocked Lambda; maderas cron is the execution path
- **v1.7 maderas cron**: `data/nightly.sh` runs all pipelines + export + S3 upload + CloudFront invalidation; cron at 0 3 * * *; logs to ~/beeatlas-pipeline.log on maderas
- **v1.7 CloudFront CORS cache**: Origin header must be in CloudFront cache key and S3 CORS must expose Range/Content-Range headers; both must be configured together in Phase 28 to avoid CORS failures for browser fetch
- [Phase 25-cdk-infrastructure]: TimeZone must be imported from aws-cdk-lib core (not aws-scheduler) in CDK 2.238.0
- [Phase 25-cdk-infrastructure]: Lambda URL auth NONE — volunteer project, manual invocation only, no sensitive data in endpoint
- [Phase 26-lambda-handler-dockerfile]: All pipeline module paths (DB_PATH, EXPORT_DIR, GEOGRAPHY_CACHE_DIR) read from env vars with local fallback — enables maderas and local dev simultaneously
- [Phase 26-lambda-handler-dockerfile]: Dockerfile uses uv multi-stage build (ghcr.io/astral-sh/uv + public.ecr.aws/lambda/python:3.14) — pyogrio binary wheel bundles libgdal, no system GDAL install needed (unused now but Dockerfile remains)
- [Phase 27-pipeline-tests]: Fixture DuckDB uses embedded WKT constants (not committed binary) — fetched from production DB, embedded as string literals in conftest.py (D-01)
- [Phase 27-pipeline-tests]: monkeypatch.setattr over env var for ASSETS_DIR — module-level global set at import time, env var override is unreliable after first import
- [Phase 27-pipeline-tests]: North Cascades WKT: 3 polygons named 'North Cascades'; only 7941-char polygon contains test coordinates — must use explicit length check, not LIMIT 1 on length > 1000
- [Phase 28-frontend-runtime-fetch]: VITE_DATA_BASE_URL defaults to https://beeatlas.net/data — dev fetches from prod CloudFront directly
- [Phase 28-frontend-runtime-fetch]: CachePolicy with Origin allowList (not CACHING_OPTIMIZED) required for per-origin CORS caching in /data/* behavior
- [Phase 28-frontend-runtime-fetch]: _countyOptions/_ecoregionOptions as @state() populated on OL source change event — countySource.getFeatures() returns [] at module init with async url+format
- [Phase 29-ci-simplification]: asyncBufferFromUrl requires object { url } arg — hyparquet API
- [Phase 29-ci-simplification]: CI build job: contents-read only, no id-token write; validate-schema uses CloudFront public endpoint

### Pending Todos

| # | Title | Area | File |
|---|-------|------|------|
| - | (none) | - | - |

### Blockers/Concerns

None.

## Session Continuity

Last session: 2026-03-30T05:25:32.761Z
Stopped at: Completed 29-01-PLAN.md
Resume file: None
