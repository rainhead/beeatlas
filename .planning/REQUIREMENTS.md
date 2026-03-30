# Requirements: Washington Bee Atlas

**Defined:** 2026-03-27
**Core Value:** Collectors can see where bees have been collected and where target host plants grow, enabling informed planning of future collecting events.

## v1.7 Requirements

### Lambda Infrastructure
- [x] **LAMBDA-03**: CDK adds `DockerImageFunction` (Python 3.14 base image, no VPC, 15-min timeout, reserved concurrency 1, env vars `DLT_DATA_DIR=/tmp/dlt` and `temp_directory=/tmp/duckdb_swap`); Lambda role has scoped S3 read/write on `/data/*` and `/db/*` prefixes of siteBucket
- [x] **LAMBDA-04**: CDK adds EventBridge Scheduler rules: iNat pipeline nightly, full pipeline (all 5) weekly
- [x] **LAMBDA-05**: CDK adds Lambda Function URL for manual invocation

### Pipeline Execution
- [x] **PIPE-11**: Lambda handler downloads `beeatlas.duckdb` from `s3://BUCKET/db/beeatlas.duckdb` to `/tmp/` on invocation; invokes `data/run.py`; dlt pipelines write to `/tmp/beeatlas.duckdb`; reserved concurrency prevents concurrent runs
- [x] **PIPE-12**: Lambda handler runs `export.py` after successful pipeline run; uploads `ecdysis.parquet`, `samples.parquet`, `counties.geojson`, `ecoregions.geojson` to S3 `/data/` prefix
- [x] **PIPE-13**: Lambda handler uploads updated `beeatlas.duckdb` from `/tmp/` back to `s3://BUCKET/db/beeatlas.duckdb` after successful export
- [x] **PIPE-14**: Lambda handler triggers CloudFront invalidation on `/data/*` after S3 upload

### Frontend Runtime Fetching
- [x] **FETCH-01**: Frontend fetches `ecdysis.parquet`, `samples.parquet`, `counties.geojson`, `ecoregions.geojson` from CloudFront `/data/` path at runtime; bundled asset imports removed from build
- [x] **FETCH-02**: CloudFront `/data/*` cache behavior configured with correct CORS headers (Origin in cache key) and S3 data prefix as origin; supports hyparquet Range requests
- [x] **FETCH-03**: Frontend shows loading state while data files are being fetched

### Tests
- [x] **TEST-01**: `conftest.py` creates a programmatic DuckDB fixture with ecdysis, inat observations, and geographies tables; no committed binary file
- [x] **TEST-02**: pytest covers `export.py` using fixture DuckDB: verifies correct Parquet schema (all required columns) and valid GeoJSON output
- [x] **TEST-03**: pytest covers `_transform()` and `_extract_inat_id()` as pure function unit tests; dlt write-path tests are deferred

### CI Simplification
- [x] **CI-01**: `deploy.yml` removes `build:data` step; CI runs frontend build only; no Python pipeline code executes in CI
- [x] **CI-02**: `fetch-data.yml` workflow deleted

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
| LAMBDA-01 | — | Removed — VPC/NAT replaced by S3-backed DuckDB pattern (no VPC needed) |
| LAMBDA-02 | — | Removed — EFS replaced by S3-backed DuckDB pattern |
| LAMBDA-03 | Phase 25 | Complete |
| LAMBDA-04 | Phase 25 | Complete |
| LAMBDA-05 | Phase 25 | Complete |
| PIPE-11 | Phase 26 | Complete |
| PIPE-12 | Phase 26 | Complete |
| PIPE-13 | Phase 26 | Complete |
| PIPE-14 | Phase 26 | Complete |
| TEST-01 | Phase 27 | Complete |
| TEST-02 | Phase 27 | Complete |
| TEST-03 | Phase 27 | Complete |
| FETCH-01 | Phase 28 | Complete |
| FETCH-02 | Phase 28 | Complete |
| FETCH-03 | Phase 28 | Complete |
| CI-01 | Phase 29 | Complete |
| CI-02 | Phase 29 | Complete |
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
- v1.7 requirements: 15 active (LAMBDA-01 and LAMBDA-02 removed)
- Mapped to phases: 15/15
- Unmapped: 0

---
*Requirements defined: 2026-03-27*
*Last updated: 2026-03-27 — EFS/VPC architecture replaced by S3-backed DuckDB; LAMBDA-01 and LAMBDA-02 removed; LAMBDA-03 and PIPE-11/13 updated*
