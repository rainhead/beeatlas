# Requirements: Washington Bee Atlas

**Defined:** 2026-03-27
**Core Value:** Collectors can see where bees have been collected and where target host plants grow, enabling informed planning of future collecting events.

## v1.6 Requirements

### Pipeline Migration

- [ ] **PIPE-08**: dlt pipeline files live in data/ alongside a consolidated pyproject.toml and uv.lock; old pipeline modules (ecdysis/, inat/, links/, scripts/) are removed
- [ ] **PIPE-09**: .dlt/config.toml configures all pipeline parameters: iNat project_id, Ecdysis dataset_id, html_cache_dir, db_path
- [ ] **PIPE-10**: All 5 dlt pipelines (inat, ecdysis, geographies, projects, anti-entropy) run locally and write to data/beeatlas.duckdb

### Parquet Export

- [ ] **EXP-01**: Export script produces ecdysis.parquet with current frontend schema plus inat_observation_id (joined from ecdysis_data.occurrence_links); county and ecoregion_l3 added via DuckDB spatial extension ST_Within join against geographies tables
- [ ] **EXP-02**: Nearest-polygon fallback (ST_Distance ORDER BY … LIMIT 1) handles specimens outside polygon boundaries after ST_Within join
- [ ] **EXP-03**: Export script produces samples.parquet with current frontend schema; county and ecoregion_l3 from spatial join; specimen_count sourced from observation field value with field_id=8338
- [ ] **EXP-04**: All exports pass validate-schema.mjs (updated: inat_observation_id added to ecdysis.parquet check; links.parquet validation removed)

### GeoJSON Generation

- [ ] **GEO-01**: Export generates frontend/src/assets/counties.geojson from geographies.us_counties filtered to WA (state_fips = '53'); replaces the committed static file
- [ ] **GEO-02**: Export generates frontend/src/assets/ecoregions.geojson from geographies.ecoregions filtered to polygons intersecting WA; replaces the committed static file

### Orchestration

- [ ] **ORCH-01**: Local runner replaces build-data.sh; sequences geographies → ecdysis → inat → projects → export (parquet + geojson) in the correct order
- [ ] **ORCH-02**: Individual pipeline steps are runnable in isolation for development and debugging

### Frontend

- [ ] **FRONT-01**: Frontend reads inat_observation_id directly from already-loaded ecdysis features; separate links.parquet loading and merge code is removed

### Tech Debt Audit

- [ ] **DEBT-01**: All known tech debt items reviewed against the new architecture; resolved items marked closed, transformed items documented with updated descriptions, surviving items carried forward

## Future Requirements

### Production Infrastructure

- **INFRA-06**: DuckDB persistence strategy for CI/production (S3 or equivalent)
- **INFRA-07**: CI pipeline updated to use dlt runner instead of build-data.sh
- **INFRA-08**: S3 caching strategy for beeatlas.duckdb between CI runs

### Frontend DuckDB WASM

- **WASM-01**: Frontend replaced with DuckDB WASM reading parquet files directly
- **WASM-02**: Client-side SQL joins, filters, and sorts replace JavaScript FilterState

## Out of Scope

| Feature | Reason |
|---------|--------|
| Production CI integration | Deferred — local-first migration goal; infra decisions after pipeline is stable |
| DuckDB WASM frontend | Future milestone; current hyparquet frontend stays for v1.6 |
| Anti-entropy scheduling | No production scheduler yet; manual invocation sufficient locally |
| Schema changes for DuckDB WASM optimization | Premature — wait until WASM frontend is being built |
| links.parquet as separate export | Folded into ecdysis.parquet; no separate file needed |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| PIPE-08 | Phase 20 | Pending |
| PIPE-09 | Phase 20 | Pending |
| PIPE-10 | Phase 20 | Pending |
| EXP-01 | Phase 21 | Pending |
| EXP-02 | Phase 21 | Pending |
| EXP-03 | Phase 21 | Pending |
| EXP-04 | Phase 21 | Pending |
| GEO-01 | Phase 21 | Pending |
| GEO-02 | Phase 21 | Pending |
| ORCH-01 | Phase 22 | Pending |
| ORCH-02 | Phase 22 | Pending |
| FRONT-01 | Phase 23 | Pending |
| DEBT-01 | Phase 24 | Pending |

**Coverage:**
- v1.6 requirements: 13 total
- Mapped to phases: 13
- Unmapped: 0 ✓

---
*Requirements defined: 2026-03-27*
*Last updated: 2026-03-27 — traceability mapped after roadmap creation*
