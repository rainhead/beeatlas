# Roadmap: Washington Bee Atlas

## Milestones

- ✅ **v1.0 MVP** — Phases 1–6 (shipped 2026-02-22)
- ✅ **v1.1 URL Sharing** — Phase 7 (shipped 2026-03-10)
- 🚧 **v1.2 iNat Pipeline** — Phases 8–10 (in progress)

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

### 🚧 v1.2 iNat Pipeline (In Progress)

**Milestone Goal:** Fetch Washington Bee Atlas collection events from iNaturalist and produce `samples.parquet` with S3 caching — pipeline only, no map presentation.

- [x] **Phase 8: Discovery and Prerequisite Gate** — Live API inspection to confirm field paths; IAM permissions updated for S3 cache (completed 2026-03-10)
- [x] **Phase 9: Pipeline Implementation** — `download.py` querying iNat API, full extraction and S3 cache logic wired as npm scripts (completed 2026-03-10)
- [ ] **Phase 10: Build Integration and Verification** — `build-data.sh` extended; `samples.parquet` lands in frontend assets; CI green on merge

## Phase Details

### Phase 8: Discovery and Prerequisite Gate
**Goal**: The blocking unknowns are resolved and the project is safe to implement — IAM permissions grant the pipeline S3 access, `SPECIMEN_COUNT_FIELD_NAME` is confirmed from a live API call, and `ofvs` behavior under pyinaturalist v1 is verified.
**Depends on**: Nothing (first phase of v1.2)
**Requirements**: INFRA-04
**Success Criteria** (what must be TRUE):
  1. OIDC IAM role policy grants `s3:GetObject` and `s3:PutObject` on the S3 cache prefix; CI workflow step provides AWS credentials to the pipeline
  2. A live `curl` call against iNaturalist API project 166376 has been made and the specimen count observation field name/ID is recorded as a named constant in the codebase
  3. Whether pyinaturalist v1 `get_observations()` includes `ofvs` by default (or requires `fields='all'`) is confirmed and documented
**Plans**: 2 plans
Plans:
- [ ] 08-01-PLAN.md — Commit field ID constants and extraction helper to data/inat/observations.py
- [ ] 08-02-PLAN.md — Add S3 cache bucket to CDK stack, grant deployer role scoped access, add AWS credentials to CI build job

### Phase 9: Pipeline Implementation
**Goal**: A working `data/inat/download.py` script fetches all Washington Bee Atlas observations from iNaturalist, extracts the required fields (including nullable specimen count), restores and writes the S3 cache, and all operations are exposed as top-level npm scripts.
**Depends on**: Phase 8
**Requirements**: INAT-01, INAT-02, CACHE-01, CACHE-02, CACHE-03, INFRA-05
**Success Criteria** (what must be TRUE):
  1. Running `npm run fetch-inat` locally produces `data/samples.parquet` with columns observation_id (int64), observer (string), date (string), lat (float64), lon (float64), specimen_count (Int64 nullable) and at least one row
  2. Running `npm run cache-restore` downloads `samples.parquet` and `last_fetch.txt` from S3 before fetching; on cache miss the script falls back to a full fetch without error
  3. Running `npm run cache-upload` uploads `samples.parquet` and `last_fetch.txt` to the S3 cache prefix after a successful fetch
  4. Running `npm run fetch-inat` a second time fetches only observations updated since the `last_fetch.txt` timestamp and merges the delta into the restored Parquet rather than re-fetching everything
  5. Progress logging reports observation count, page count, and null rate in `specimen_count` to stdout during the fetch
**Plans**: 2 plans
Plans:
- [ ] 09-01-PLAN.md — samples.parquet stub, cache shell scripts, npm script wiring (INFRA-05, CACHE-01, CACHE-03)
- [ ] 09-02-PLAN.md — data/inat/download.py full pipeline + build-data.sh integration (INAT-01, INAT-02, CACHE-02)

### Phase 10: Build Integration and Verification
**Goal**: The iNat pipeline is wired into `build-data.sh`; a complete local build runs the download and produces `data/samples.parquet`; the S3 cache round-trip completes during CI; CI passes on merge to main.
**Depends on**: Phase 9
**Requirements**: INAT-03
**Success Criteria** (what must be TRUE):
  1. `npm run build` runs the iNat pipeline and produces `data/samples.parquet` with the correct schema and at least one row
  2. The S3 cache round-trip (restore → fetch → upload) completes without error during a CI run
  3. CI passes on a push to main — the GitHub Actions workflow completes without error and deploys successfully
**Plans**: 1 plan
Plans:
- [ ] 10-01-PLAN.md — Update deploy.yml: wire S3 cache scripts and fix credential ordering; verify CI green

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
| 8. Discovery and Prerequisite Gate | 2/2 | Complete   | 2026-03-10 | - |
| 9. Pipeline Implementation | 2/2 | Complete    | 2026-03-10 | - |
| 10. Build Integration and Verification | v1.2 | 0/TBD | Not started | - |
