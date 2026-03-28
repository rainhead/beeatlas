# Requirements: Washington Bee Atlas

**Defined:** 2026-03-27
**Core Value:** Collectors can see where bees have been collected and where target host plants grow, enabling informed planning of future collecting events.

## v1.7 Requirements

### Lambda Infrastructure
- [ ] **LAMBDA-01**: CDK adds VPC (private subnets, NAT Gateway for Ecdysis/iNat internet egress, S3 Gateway Endpoint for free S3 writes) to BeeAtlasStack
- [ ] **LAMBDA-02**: CDK adds EFS FileSystem (`removalPolicy: RETAIN`) with access point mounted at `/mnt/data` in Lambda; destroying the stack must not delete the filesystem
- [ ] **LAMBDA-03**: CDK adds `DockerImageFunction` (Python 3.14 base image, EFS mount, 15-min timeout, reserved concurrency 1, env vars `DLT_DATA_DIR=/tmp/dlt` and `temp_directory=/tmp/duckdb_swap`)
- [ ] **LAMBDA-04**: CDK adds EventBridge Scheduler rules: iNat pipeline nightly, full pipeline (all 5) weekly
- [ ] **LAMBDA-05**: CDK adds Lambda Function URL for manual invocation

### Pipeline Execution
- [ ] **PIPE-11**: Lambda handler invokes `data/run.py`; dlt pipelines write to EFS DuckDB at `/mnt/data/beeatlas.duckdb`; reserved concurrency prevents concurrent runs
- [ ] **PIPE-12**: Lambda handler runs `export.py` after successful pipeline run; uploads `ecdysis.parquet`, `samples.parquet`, `counties.geojson`, `ecoregions.geojson` to S3 `/data/` prefix
- [ ] **PIPE-13**: Lambda handler backs up `beeatlas.duckdb` from EFS to S3 after successful export
- [ ] **PIPE-14**: Lambda handler triggers CloudFront invalidation on `/data/*` after S3 upload

### Frontend Runtime Fetching
- [ ] **FETCH-01**: Frontend fetches `ecdysis.parquet`, `samples.parquet`, `counties.geojson`, `ecoregions.geojson` from CloudFront `/data/` path at runtime; bundled asset imports removed from build
- [ ] **FETCH-02**: CloudFront `/data/*` cache behavior configured with correct CORS headers (Origin in cache key) and S3 data prefix as origin; supports hyparquet Range requests
- [ ] **FETCH-03**: Frontend shows loading state while data files are being fetched

### Tests
- [ ] **TEST-01**: `data/fixtures/beeatlas-test.duckdb` committed; contains minimal rows covering ecdysis, inat observations, and geographies tables
- [ ] **TEST-02**: pytest covers `export.py` using seed DuckDB: verifies correct Parquet schema (all required columns) and valid GeoJSON output
- [ ] **TEST-03**: pytest covers at least one dlt pipeline module (inat or ecdysis) against seed DuckDB: verifies rows written correctly

### CI Simplification
- [ ] **CI-01**: `deploy.yml` removes `build:data` step; CI runs frontend build only; no Python pipeline code executes in CI
- [ ] **CI-02**: `fetch-data.yml` workflow deleted

## v1.6 Requirements (Complete)

### Pipeline Migration

- [x] **PIPE-08**: dlt pipeline files live in data/ alongside a consolidated pyproject.toml and uv.lock; old pipeline modules (ecdysis/, inat/, links/, scripts/) are removed
- [x] **PIPE-09**: .dlt/config.toml configures all pipeline parameters: iNat project_id, Ecdysis dataset_id, html_cache_dir, db_path
- [~] **PIPE-10**: All 5 dlt pipelines run locally and write to data/beeatlas.duckdb — superseded by PIPE-11 (Lambda execution); local run remains possible for development

### Parquet Export

- [x] **EXP-01**: Export script produces ecdysis.parquet with current frontend schema plus inat_observation_id (joined from ecdysis_data.occurrence_links); county and ecoregion_l3 added via DuckDB spatial extension ST_Within join against geographies tables
- [x] **EXP-02**: Nearest-polygon fallback (ST_Distance ORDER BY … LIMIT 1) handles specimens outside polygon boundaries after ST_Within join
- [x] **EXP-03**: Export script produces samples.parquet with current frontend schema; county and ecoregion_l3 from spatial join; specimen_count sourced from observation field value with field_id=8338
- [x] **EXP-04**: All exports pass validate-schema.mjs (updated: inat_observation_id added to ecdysis.parquet check; links.parquet validation removed)

### GeoJSON Generation

- [x] **GEO-01**: Export generates counties.geojson from geographies.us_counties filtered to WA (state_fips = '53')
- [x] **GEO-02**: Export generates ecoregions.geojson from geographies.ecoregions filtered to polygons intersecting WA

### Orchestration

- [x] **ORCH-01**: Local runner replaces build-data.sh; sequences geographies → ecdysis → inat → projects → export (parquet + geojson) in the correct order
- [x] **ORCH-02**: Individual pipeline steps are runnable in isolation for development and debugging

### Frontend

- [x] **FRONT-01**: Frontend reads inat_observation_id directly from already-loaded ecdysis features; separate links.parquet loading and merge code is removed

### Tech Debt Audit

- [x] **DEBT-01**: All known tech debt items reviewed against the new architecture; resolved items marked closed, transformed items documented with updated descriptions, surviving items carried forward

## Future Requirements

### Frontend DuckDB WASM

- **WASM-01**: Frontend replaced with DuckDB WASM reading parquet files directly
- **WASM-02**: Client-side SQL joins, filters, and sorts replace JavaScript FilterState

## Out of Scope

| Feature | Reason |
|---------|--------|
| DuckDB WASM frontend | Future milestone; current hyparquet frontend stays for v1.7 |
| Anti-entropy scheduling | No production scheduler yet; manual Lambda invocation sufficient |
| Schema changes for DuckDB WASM optimization | Premature — wait until WASM frontend is being built |
| links.parquet as separate export | Folded into ecdysis.parquet; no separate file needed |
| Lambda concurrency / throttling controls | Beyond reserved concurrency = 1; out of scope for v1.7 |
| Multi-region deployment | Single CloudFront distribution; no geo-routing needed |
| Lambda monitoring / alerting | CloudWatch metrics available; dashboards/alerts deferred |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| LAMBDA-01 | TBD | Pending |
| LAMBDA-02 | TBD | Pending |
| LAMBDA-03 | TBD | Pending |
| LAMBDA-04 | TBD | Pending |
| LAMBDA-05 | TBD | Pending |
| PIPE-11 | TBD | Pending |
| PIPE-12 | TBD | Pending |
| PIPE-13 | TBD | Pending |
| PIPE-14 | TBD | Pending |
| FETCH-01 | TBD | Pending |
| FETCH-02 | TBD | Pending |
| FETCH-03 | TBD | Pending |
| TEST-01 | TBD | Pending |
| TEST-02 | TBD | Pending |
| TEST-03 | TBD | Pending |
| CI-01 | TBD | Pending |
| CI-02 | TBD | Pending |
| PIPE-08 | Phase 20 | Complete |
| PIPE-09 | Phase 20 | Complete |
| PIPE-10 | Phase 20 | Superseded by PIPE-11 |
| EXP-01 | Phase 21 | Complete |
| EXP-02 | Phase 21 | Complete |
| EXP-03 | Phase 21 | Complete |
| EXP-04 | Phase 21 | Complete |
| GEO-01 | Phase 21 | Complete |
| GEO-02 | Phase 21 | Complete |
| ORCH-01 | Phase 22 | Complete |
| ORCH-02 | Phase 22 | Complete |
| FRONT-01 | Phase 23 | Complete |
| DEBT-01 | Phase 24 | Complete |

**Coverage:**
- v1.7 requirements: 17 total
- Mapped to phases: 0 (TBD — roadmap pending)
- Unmapped: 17

---
*Requirements defined: 2026-03-27*
*Last updated: 2026-03-27 — v1.7 milestone requirements defined*
