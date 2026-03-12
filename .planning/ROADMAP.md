# Roadmap: Washington Bee Atlas

## Milestones

- ✅ **v1.0 MVP** — Phases 1–6 (shipped 2026-02-22)
- ✅ **v1.1 URL Sharing** — Phase 7 (shipped 2026-03-10)
- ✅ **v1.2 iNat Pipeline** — Phases 8–10 (shipped 2026-03-11)
- 🚧 **v1.3 Specimen-Sample Linkage** — Phases 11–12 (in progress)

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

### 🚧 v1.3 Specimen-Sample Linkage (In Progress)

**Milestone Goal:** Produce links.parquet mapping Ecdysis occurrenceIDs to iNaturalist observation IDs, with permanent per-record caching, S3-backed persistence, and full build pipeline integration.

- [ ] **Phase 11: Links Pipeline** — Fetch Ecdysis specimen pages, extract iNat observation IDs, produce links.parquet with two-level cache skipping
- [ ] **Phase 12: S3 Cache and Build Integration** — S3 restore/upload for links.parquet and HTML cache, npm scripts, build-data.sh wiring

## Phase Details

### Phase 11: Links Pipeline
**Goal**: The pipeline can fetch Ecdysis specimen pages and produce a complete links.parquet mapping every occurrenceID to its iNat observation ID (or null)
**Depends on**: Phase 10 (ecdysis_wa.parquet exists as input)
**Requirements**: LINK-01, LINK-02, LINK-03, LINK-04
**Success Criteria** (what must be TRUE):
  1. Running the fetch script reads all occurrenceIDs from ecdysis_wa.parquet and fetches each Ecdysis HTML page at no more than 20 req/sec
  2. occurrenceIDs already in links.parquet are skipped without any HTTP request (first-level skip)
  3. occurrenceIDs with HTML already cached on disk are parsed without re-fetching (second-level skip)
  4. links.parquet contains exactly two columns — occurrenceID (string) and inat_observation_id (Int64, nullable) — covering all occurrenceIDs
  5. inat_observation_id is extracted from `#association-div a[target="_blank"]` href when present; null when absent
**Plans**: TBD

### Phase 12: S3 Cache and Build Integration
**Goal**: The links pipeline is wired into S3 caching and the build-data.sh pipeline, so CI runs are incremental and the build always produces a fresh links.parquet
**Depends on**: Phase 11
**Requirements**: LCACHE-01, LCACHE-02, LCACHE-03, PIPE-04
**Success Criteria** (what must be TRUE):
  1. At build start, links.parquet is restored from S3 (graceful miss on first run); HTML cache directory is synced from S3 (only missing files downloaded)
  2. After a successful fetch run, links.parquet is uploaded to S3 and the HTML cache is synced to S3 (only new files uploaded)
  3. `npm run cache-restore-links`, `npm run fetch-links`, and `npm run cache-upload-links` each execute the correct underlying script
  4. build-data.sh executes cache-restore-links → fetch-links → cache-upload-links in sequence as part of the standard build
**Plans**: TBD

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
| 11. Links Pipeline | v1.3 | 0/? | Not started | - |
| 12. S3 Cache and Build Integration | v1.3 | 0/? | Not started | - |
