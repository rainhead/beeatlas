# Roadmap: Washington Bee Atlas

## Milestones

- ✅ **v1.0 MVP** — Phases 1–6 (shipped 2026-02-22)
- ✅ **v1.1 URL Sharing** — Phase 7 (shipped 2026-03-10)
- ✅ **v1.2 iNat Pipeline** — Phases 8–10 (shipped 2026-03-11)
- ✅ **v1.3 Specimen-Sample Linkage** — Phases 11–12 (shipped 2026-03-12)
- ✅ **v1.4 Sample Layer** — Phases 13–15 (shipped 2026-03-13)
- ✅ **v1.5 Geographic Regions** — Phases 16–19 (shipped 2026-03-27)
- 🚧 **v1.6 dlt Pipeline Migration** — Phases 20–24 (in progress)
- 🔜 **v1.7 Production Pipeline Infrastructure** — Phases 25–29 (planned)

## Phases

<details>
<summary>✅ v1.0 MVP (Phases 1–6) — SHIPPED 2026-02-22</summary>

- [x] Phase 1: Pipeline (1/1 plans) — completed 2026-02-18
- [x] Phase 2: Infrastructure (2/2 plans) — completed 2026-02-18
- [x] Phase 3: Core Map (3/3 plans) — completed 2026-02-21
- [x] Phase 4: Filtering (5/5 plans) — completed 2026-02-22
- [x] Phase 5: Fix Month Offset Bug (1/1 plan) — completed 2026-02-22
- [x] Phase 6: Complete INFRA-03 Deployment (1/1 plan) — completed 2026-02-22

See `.planning/milestones/v1.0-ROADMAP.md` for full phase details.

</details>

<details>
<summary>✅ v1.1 URL Sharing (Phase 7) — SHIPPED 2026-03-10</summary>

- [x] Phase 7: URL Sharing (5/5 plans) — completed 2026-03-09

See `.planning/milestones/v1.1-ROADMAP.md` for full phase details.

</details>

<details>
<summary>✅ v1.2 iNat Pipeline (Phases 8–10) — SHIPPED 2026-03-11</summary>

- [x] Phase 8: Discovery and Prerequisite Gate (2/2 plans) — completed 2026-03-10
- [x] Phase 9: Pipeline Implementation (2/2 plans) — completed 2026-03-10
- [x] Phase 10: Build Integration and Verification (1/1 plan) — completed 2026-03-11

See `.planning/milestones/v1.2-ROADMAP.md` for full phase details.

</details>

<details>
<summary>✅ v1.3 Specimen-Sample Linkage (Phases 11–12) — SHIPPED 2026-03-12</summary>

- [x] Phase 11: Links Pipeline (2/2 plans) — completed 2026-03-12
- [x] Phase 12: S3 Cache and Build Integration (2/2 plans) — completed 2026-03-12

See `.planning/milestones/v1.3-ROADMAP.md` for full phase details.

</details>

<details>
<summary>✅ v1.4 Sample Layer (Phases 13–15) — SHIPPED 2026-03-13</summary>

- [x] Phase 13: Parquet Sources and Asset Pipeline (2/2 plans) — completed 2026-03-13
- [x] Phase 14: Layer Toggle and Map Display (2/2 plans) — completed 2026-03-13
- [x] Phase 15: Click Interaction and iNat Links (1/1 plan) — completed 2026-03-13

See `.planning/milestones/v1.4-ROADMAP.md` for full phase details.

</details>

<details>
<summary>✅ v1.5 Geographic Regions (Phases 16–19) — SHIPPED 2026-03-27</summary>

- [x] Phase 16: Pipeline Spatial Join (7/7 plans) — completed 2026-03-14
- [x] Phase 17: Frontend Data Layer (2/2 plans) — completed 2026-03-14
- [x] Phase 18: Map Integration (4/4 plans) — completed 2026-03-14
- [x] Phase 19: Sidebar UI (2/2 plans) — completed 2026-03-18

See `.planning/milestones/v1.5-ROADMAP.md` for full phase details.

</details>

### v1.6 dlt Pipeline Migration (In Progress)

**Milestone Goal:** Replace the custom data pipeline with dlt-based pipelines backed by an authoritative DuckDB store, with a Parquet + GeoJSON export layer feeding the existing frontend.

- [x] **Phase 20: Pipeline Migration** — Port dlt prototype into data/, remove old modules, wire config (completed 2026-03-27)
- [ ] **Phase 21: Parquet and GeoJSON Export** — Export script producing all frontend-compatible outputs with spatial join
- [x] **Phase 22: Orchestration** — Local runner replacing build-data.sh with step isolation (completed 2026-03-27)
- [x] **Phase 23: Frontend Simplification** — Read inat_observation_id from ecdysis features; remove links.parquet loading (completed 2026-03-27)
- [x] **Phase 24: Tech Debt Audit** — Review all known debt items against new architecture (completed 2026-03-27)

### v1.7 Production Pipeline Infrastructure (Planned)

**Milestone Goal:** Move pipeline execution to Lambda with S3-backed DuckDB (downloaded to /tmp on invocation); export all data files to S3; frontend fetches Parquets and GeoJSON at runtime.

- [x] **Phase 25: CDK Infrastructure** — Lambda stub, EventBridge schedule, Lambda URL deployed to AWS; stub verifies S3 round-trip (completed 2026-03-28)
- [ ] **Phase 26: Lambda Handler + Dockerfile** — Real pipeline execution in Lambda; S3 data export, backup, and CloudFront invalidation
- [ ] **Phase 27: Seed DuckDB + Tests** — Fixture DuckDB committed; pytest covers export.py and at least one pipeline module
- [ ] **Phase 28: Frontend Runtime Fetch** — Bundled Parquet/GeoJSON imports removed; frontend fetches from CloudFront /data/ at runtime
- [ ] **Phase 29: CI Simplification** — build:data removed from CI; fetch-data.yml deleted; frontend-only build

## Phase Details

### Phase 20: Pipeline Migration
**Goal**: All five dlt pipelines are runnable from data/ against a local DuckDB, with old pipeline modules gone and config centralised in .dlt/config.toml
**Depends on**: Phase 19
**Requirements**: PIPE-08, PIPE-09, PIPE-10
**Success Criteria** (what must be TRUE):
  1. Running each of the five dlt pipelines (inat, ecdysis, geographies, projects, anti-entropy) writes rows to data/beeatlas.duckdb without error
  2. data/ contains a single consolidated pyproject.toml and uv.lock; the old ecdysis/, inat/, links/, and scripts/ module directories are absent
  3. .dlt/config.toml is the sole place to change iNat project_id, Ecdysis dataset_id, html_cache_dir, and db_path — no hardcoded values remain in pipeline files
**Plans:** 2/2 plans complete
Plans:
- [x] 20-01-PLAN.md — Port pipeline files, config, deps, cleanup, and docs (PIPE-08, PIPE-09)
- [ ] 20-02-PLAN.md — Run all five pipelines to verify DuckDB writes (PIPE-10)

### Phase 21: Parquet and GeoJSON Export
**Goal**: A single export script produces ecdysis.parquet, samples.parquet, counties.geojson, and ecoregions.geojson from DuckDB, passing schema validation
**Depends on**: Phase 20
**Requirements**: EXP-01, EXP-02, EXP-03, EXP-04, GEO-01, GEO-02
**Success Criteria** (what must be TRUE):
  1. ecdysis.parquet contains inat_observation_id (joined from ecdysis_data.occurrence_links) alongside all existing frontend columns
  2. Every specimen and sample row has non-null county and ecoregion_l3 values — specimens outside polygon boundaries are assigned values via nearest-polygon fallback
  3. samples.parquet specimen_count is sourced from observation field value with field_id=8338 (not field name)
  4. Running validate-schema.mjs passes: inat_observation_id present in ecdysis.parquet check; links.parquet validation absent
  5. counties.geojson and ecoregions.geojson in frontend/src/assets/ are generated from DuckDB geographies tables (not the previously committed static files)
**Plans:** 1/2 plans executed
Plans:
- [x] 21-01-PLAN.md — Create data/export.py with spatial joins, parquet export, GeoJSON generation (EXP-01, EXP-02, EXP-03, GEO-01, GEO-02)
- [ ] 21-02-PLAN.md — Update validate-schema.mjs, region-layer.ts imports, delete stale files (EXP-04, GEO-01, GEO-02)

### Phase 22: Orchestration
**Goal**: A local runner script sequences all pipeline and export steps in the correct order; each step is also runnable in isolation
**Depends on**: Phase 21
**Requirements**: ORCH-01, ORCH-02
**Success Criteria** (what must be TRUE):
  1. Running the local runner end-to-end executes: geographies → ecdysis → inat → projects → export (parquet + geojson) in that order and completes without error
  2. build-data.sh is removed (or superseded) and no longer referenced in package.json or CI
  3. Each individual pipeline step and the export step can be invoked independently for development and debugging without running the full sequence
**Plans:** 1/1 plans complete
Plans:
- [x] 22-01-PLAN.md — Create data/run.py runner, delete build-data.sh, update package.json (ORCH-01, ORCH-02)

### Phase 23: Frontend Simplification
**Goal**: Frontend reads inat_observation_id directly from already-loaded ecdysis features; separate links.parquet load and merge code is gone
**Depends on**: Phase 21
**Requirements**: FRONT-01
**Success Criteria** (what must be TRUE):
  1. Clicking a specimen that has an iNat link still shows the correct iNaturalist URL in the sidebar
  2. No network request for links.parquet is made on page load (verifiable in browser DevTools Network tab)
  3. The code paths that loaded links.parquet and merged inat_observation_id onto features are deleted
**Plans:** 1/1 plans complete
Plans:
- [x] 23-01-PLAN.md — Delete links.parquet loading, rewire buildSamples to read inat_observation_id from features (FRONT-01)

### Phase 24: Tech Debt Audit
**Goal**: Every known tech debt item has been reviewed against the new architecture and given a disposition: closed, updated, or carried forward with a revised description
**Depends on**: Phase 20, Phase 21, Phase 22, Phase 23
**Requirements**: DEBT-01
**Success Criteria** (what must be TRUE):
  1. Each item from the PROJECT.md Known Tech Debt section has an explicit disposition (closed / updated description / carried forward)
  2. Items resolved by the dlt migration are marked closed with a brief rationale
  3. Surviving items are documented with updated descriptions reflecting the new architecture
**Plans:** 1/1 plans complete
Plans:
- [x] 24-01-PLAN.md — Audit all tech debt items, update PROJECT.md (DEBT-01)

### Phase 25: CDK Infrastructure
**Goal**: Lambda stub, EventBridge schedule, and Lambda URL are deployed to AWS; stub verifies S3 read/write from /tmp works end-to-end
**Depends on**: Phase 24
**Requirements**: LAMBDA-03, LAMBDA-04, LAMBDA-05
**Success Criteria** (what must be TRUE):
  1. `cdk deploy` completes without error; CloudFormation outputs include the Lambda URL endpoint
  2. Invoking the Lambda URL returns a 200 response and CloudWatch logs show the stub handler completed a successful S3 round-trip (download from `s3://BUCKET/db/`, write to `/tmp/`, upload back)
  3. EventBridge Scheduler shows two rules: one nightly schedule (iNat pipeline) and one weekly schedule (full pipeline); both target the Lambda function
  4. Lambda has `reservedConcurrentExecutions: 1`; env vars `DLT_DATA_DIR=/tmp/dlt` and `temp_directory=/tmp/duckdb_swap` are present in the function configuration
**Plans**: 1 plan
Plans:
- [x] 25-01-PLAN.md — Dockerfile, stub handler, Lambda + Scheduler + URL constructs (LAMBDA-03, LAMBDA-04, LAMBDA-05)

### Phase 26: Lambda Handler + Dockerfile
**Goal**: Real pipeline execution runs end-to-end inside Lambda; invoking the Lambda URL triggers the dlt pipelines, exports data files to S3, backs up DuckDB, and invalidates CloudFront
**Depends on**: Phase 25
**Requirements**: PIPE-11, PIPE-12, PIPE-13, PIPE-14
**Success Criteria** (what must be TRUE):
  1. Invoking the Lambda URL (with a seeded S3 DuckDB at `s3://BUCKET/db/beeatlas.duckdb`) completes within 15 minutes and CloudWatch logs show all five pipelines finishing without error
  2. After invocation, `aws s3 ls s3://BUCKET/data/` shows ecdysis.parquet, samples.parquet, counties.geojson, and ecoregions.geojson with recent modification timestamps
  3. After invocation, `aws s3 ls s3://BUCKET/db/` shows beeatlas.duckdb with a recent modification timestamp
  4. A CloudFront invalidation for `/data/*` appears in the distribution's invalidation history after each successful invocation
**Plans**: 1 plan

### Phase 27: Seed DuckDB + Tests
**Goal**: A minimal fixture DuckDB is committed to git; pytest covers export.py schema correctness and at least one dlt pipeline module
**Depends on**: Phase 26
**Requirements**: TEST-01, TEST-02, TEST-03
**Success Criteria** (what must be TRUE):
  1. `data/fixtures/beeatlas-test.duckdb` exists in git and contains rows in the ecdysis, inat_observations, and geographies tables
  2. `uv run pytest data/tests/test_export.py` passes: all required Parquet columns present in output; GeoJSON output is valid and non-empty
  3. `uv run pytest` passes at least one test covering a dlt pipeline module (inat or ecdysis) that verifies rows are written to the fixture DuckDB correctly
  4. All pytest tests pass without live AWS credentials or network access
**Plans**: 1 plan

### Phase 28: Frontend Runtime Fetch
**Goal**: Frontend fetches all data files from CloudFront /data/ at runtime; no Parquet or GeoJSON files are bundled with the build; loading state visible during fetch
**Depends on**: Phase 26
**Requirements**: FETCH-01, FETCH-02, FETCH-03
**Success Criteria** (what must be TRUE):
  1. The production build (`npm run build`) completes without errors and the dist/ output contains no .parquet or .geojson files
  2. Loading the live site shows a visible loading indicator; the map renders correctly after fetch completes (verifiable in browser DevTools Network tab showing /data/*.parquet and /data/*.geojson requests returning 200)
  3. A browser fetch of `https://CLOUDFRONT_DOMAIN/data/ecdysis.parquet` from a different origin (e.g., localhost:5173) returns the file without CORS errors; Range request headers work correctly
  4. If a data file fetch fails, the frontend shows an error message rather than a blank or broken map
**Plans**: 1 plan
**UI hint**: yes

### Phase 29: CI Simplification
**Goal**: CI runs frontend build only; no pipeline code executes in CI; fetch-data.yml is deleted
**Depends on**: Phase 28
**Requirements**: CI-01, CI-02
**Success Criteria** (what must be TRUE):
  1. A push to main triggers `deploy.yml`; the workflow completes without running any Python pipeline step or referencing `build:data`, `S3_BUCKET_NAME`, or cache restore scripts
  2. The file `.github/workflows/fetch-data.yml` does not exist in the repository
  3. CI wall-clock time for a frontend-only deploy is measurably shorter than the previous pipeline-inclusive build
**Plans**: 1 plan

## Progress

| Phase | Milestone | Plans Complete | Status | Completed |
|-------|-----------|----------------|--------|-----------|
| 1. Pipeline | v1.0 | 1/1 | Complete | 2026-02-18 |
| 2. Infrastructure | v1.0 | 2/2 | Complete | 2026-02-18 |
| 3. Core Map | v1.0 | 3/3 | Complete | 2026-02-21 |
| 4. Filtering | v1.0 | 5/5 | Complete | 2026-02-22 |
| 5. Fix Month Offset Bug | v1.0 | 1/1 | Complete | 2026-02-22 |
| 6. Complete INFRA-03 Deployment | v1.0 | 1/1 | Complete | 2026-02-22 |
| 7. URL Sharing | v1.1 | 5/5 | Complete | 2026-03-09 |
| 8. Discovery and Prerequisite Gate | v1.2 | 2/2 | Complete | 2026-03-10 |
| 9. Pipeline Implementation | v1.2 | 2/2 | Complete | 2026-03-10 |
| 10. Build Integration and Verification | v1.2 | 1/1 | Complete | 2026-03-11 |
| 11. Links Pipeline | v1.3 | 2/2 | Complete | 2026-03-12 |
| 12. S3 Cache and Build Integration | v1.3 | 2/2 | Complete | 2026-03-12 |
| 13. Parquet Sources and Asset Pipeline | v1.4 | 2/2 | Complete | 2026-03-13 |
| 14. Layer Toggle and Map Display | v1.4 | 2/2 | Complete | 2026-03-13 |
| 15. Click Interaction and iNat Links | v1.4 | 1/1 | Complete | 2026-03-13 |
| 16. Pipeline Spatial Join | v1.5 | 7/7 | Complete | 2026-03-14 |
| 17. Frontend Data Layer | v1.5 | 2/2 | Complete | 2026-03-14 |
| 18. Map Integration | v1.5 | 4/4 | Complete | 2026-03-14 |
| 19. Sidebar UI | v1.5 | 2/2 | Complete | 2026-03-18 |
| 20. Pipeline Migration | v1.6 | 1/2 | Complete    | 2026-03-27 |
| 21. Parquet and GeoJSON Export | v1.6 | 1/2 | In Progress|  |
| 22. Orchestration | v1.6 | 1/1 | Complete    | 2026-03-27 |
| 23. Frontend Simplification | v1.6 | 1/1 | Complete    | 2026-03-27 |
| 24. Tech Debt Audit | v1.6 | 1/1 | Complete    | 2026-03-27 |
| 25. CDK Infrastructure | v1.7 | 1/1 | Complete   | 2026-03-28 |
| 26. Lambda Handler + Dockerfile | v1.7 | 0/? | Not started | - |
| 27. Seed DuckDB + Tests | v1.7 | 0/? | Not started | - |
| 28. Frontend Runtime Fetch | v1.7 | 0/? | Not started | - |
| 29. CI Simplification | v1.7 | 0/? | Not started | - |
