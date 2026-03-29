# Roadmap: Washington Bee Atlas

## Milestones

- ✅ **v1.0 MVP** — Phases 1–6 (shipped 2026-02-22)
- ✅ **v1.1 URL Sharing** — Phase 7 (shipped 2026-03-10)
- ✅ **v1.2 iNat Pipeline** — Phases 8–10 (shipped 2026-03-11)
- ✅ **v1.3 Specimen-Sample Linkage** — Phases 11–12 (shipped 2026-03-12)
- ✅ **v1.4 Sample Layer** — Phases 13–15 (shipped 2026-03-13)
- ✅ **v1.5 Geographic Regions** — Phases 16–19 (shipped 2026-03-27)
- ✅ **v1.6 dlt Pipeline Migration** — Phases 20–24 (shipped 2026-03-28)
- 🚧 **v1.7 Production Pipeline Infrastructure** — Phases 25–29 (in progress)

  > **Pivot note (2026-03-28):** Lambda was abandoned mid-milestone after hitting geographies OOM, 15-min timeout, read-only filesystem, missing home directory, and iNat auth issues. Pipeline now runs as a nightly cron on maderas (`data/nightly.sh`). Phases 25–26 CDK/Lambda artifacts remain in AWS but are not the execution path. Phases 27–29 goals are unchanged.

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

<details>
<summary>✅ v1.6 dlt Pipeline Migration (Phases 20–24) — SHIPPED 2026-03-28</summary>

- [x] Phase 20: Pipeline Migration (2/2 plans) — completed 2026-03-27
- [x] Phase 21: Parquet and GeoJSON Export (2/2 plans) — completed 2026-03-27
- [x] Phase 22: Orchestration (1/1 plan) — completed 2026-03-27
- [x] Phase 23: Frontend Simplification (1/1 plan) — completed 2026-03-27
- [x] Phase 24: Tech Debt Audit (1/1 plan) — completed 2026-03-27

See `.planning/milestones/v1.6-ROADMAP.md` for full phase details.

</details>

### v1.7 Production Pipeline Infrastructure (In Progress)

**Milestone Goal:** Move pipeline execution off CI to a scheduled nightly cron; export all data files to S3; frontend fetches Parquets and GeoJSON at runtime. *(Lambda was attempted then abandoned — maderas `nightly.sh` cron is the execution path.)*

- [x] **Phase 25: CDK Infrastructure** — Lambda stub, EventBridge schedule, Lambda URL deployed to AWS; stub verifies S3 round-trip (completed 2026-03-28)
- [x] **Phase 26: Lambda Handler + Dockerfile** — Real pipeline execution in Lambda; S3 data export, backup, and CloudFront invalidation (completed 2026-03-28)
- [ ] **Phase 27: Seed DuckDB + Tests** — Fixture DuckDB committed; pytest covers export.py and at least one pipeline module
- [ ] **Phase 28: Frontend Runtime Fetch** — Bundled Parquet/GeoJSON imports removed; frontend fetches from CloudFront /data/ at runtime
- [ ] **Phase 29: CI Simplification** — build:data removed from CI; fetch-data.yml deleted; frontend-only build

## Phase Details

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
Plans:
- [x] 26-01-PLAN.md — Real handler, env-var pipeline modules, production Dockerfile, CDK updates (PIPE-11, PIPE-12, PIPE-13, PIPE-14)

### Phase 27: Pipeline Tests
**Goal**: pytest covers export.py schema correctness and at least one dlt pipeline module using a minimal fixture DuckDB
**Depends on**: Phase 26
**Requirements**: TEST-01, TEST-02, TEST-03
**Success Criteria** (what must be TRUE):
  1. `data/fixtures/beeatlas-test.duckdb` exists in git and contains rows in the ecdysis, inat_observations, and geographies tables
  2. `uv run pytest data/tests/test_export.py` passes: all required Parquet columns present in output; GeoJSON output is valid and non-empty
  3. `uv run pytest` passes at least one test covering a dlt pipeline module (inat or ecdysis) that verifies rows are written to the fixture DuckDB correctly
  4. All pytest tests pass without live AWS credentials or network access
**Plans**: 1 plan
Plans:
- [ ] 27-01-PLAN.md — Test infrastructure, transform tests, export tests (TEST-01, TEST-02, TEST-03)

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
| 20. Pipeline Migration | v1.6 | 2/2 | Complete    | 2026-03-27 |
| 21. Parquet and GeoJSON Export | v1.6 | 2/2 | Complete   | 2026-03-27 |
| 22. Orchestration | v1.6 | 1/1 | Complete    | 2026-03-27 |
| 23. Frontend Simplification | v1.6 | 1/1 | Complete    | 2026-03-27 |
| 24. Tech Debt Audit | v1.6 | 1/1 | Complete    | 2026-03-27 |
| 25. CDK Infrastructure | v1.7 | 1/1 | Complete    | 2026-03-28 |
| 26. Lambda Handler + Dockerfile | v1.7 | 1/1 | Complete   | 2026-03-28 |
| 27. Seed DuckDB + Tests | v1.7 | 0/1 | Not started | - |
| 28. Frontend Runtime Fetch | v1.7 | 0/? | Not started | - |
| 29. CI Simplification | v1.7 | 0/? | Not started | - |
