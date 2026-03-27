# Roadmap: Washington Bee Atlas

## Milestones

- ✅ **v1.0 MVP** — Phases 1–6 (shipped 2026-02-22)
- ✅ **v1.1 URL Sharing** — Phase 7 (shipped 2026-03-10)
- ✅ **v1.2 iNat Pipeline** — Phases 8–10 (shipped 2026-03-11)
- ✅ **v1.3 Specimen-Sample Linkage** — Phases 11–12 (shipped 2026-03-12)
- ✅ **v1.4 Sample Layer** — Phases 13–15 (shipped 2026-03-13)
- ✅ **v1.5 Geographic Regions** — Phases 16–19 (shipped 2026-03-27)
- 🚧 **v1.6 dlt Pipeline Migration** — Phases 20–24 (in progress)

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

- [ ] **Phase 20: Pipeline Migration** — Port dlt prototype into data/, remove old modules, wire config
- [ ] **Phase 21: Parquet and GeoJSON Export** — Export script producing all frontend-compatible outputs with spatial join
- [ ] **Phase 22: Orchestration** — Local runner replacing build-data.sh with step isolation
- [ ] **Phase 23: Frontend Simplification** — Read inat_observation_id from ecdysis features; remove links.parquet loading
- [ ] **Phase 24: Tech Debt Audit** — Review all known debt items against new architecture

## Phase Details

### Phase 20: Pipeline Migration
**Goal**: All five dlt pipelines are runnable from data/ against a local DuckDB, with old pipeline modules gone and config centralised in .dlt/config.toml
**Depends on**: Phase 19
**Requirements**: PIPE-08, PIPE-09, PIPE-10
**Success Criteria** (what must be TRUE):
  1. Running each of the five dlt pipelines (inat, ecdysis, geographies, projects, anti-entropy) writes rows to data/beeatlas.duckdb without error
  2. data/ contains a single consolidated pyproject.toml and uv.lock; the old ecdysis/, inat/, links/, and scripts/ module directories are absent
  3. .dlt/config.toml is the sole place to change iNat project_id, Ecdysis dataset_id, html_cache_dir, and db_path — no hardcoded values remain in pipeline files
**Plans:** 2 plans
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
**Plans**: TBD

### Phase 22: Orchestration
**Goal**: A local runner script sequences all pipeline and export steps in the correct order; each step is also runnable in isolation
**Depends on**: Phase 21
**Requirements**: ORCH-01, ORCH-02
**Success Criteria** (what must be TRUE):
  1. Running the local runner end-to-end executes: geographies → ecdysis → inat → projects → export (parquet + geojson) in that order and completes without error
  2. build-data.sh is removed (or superseded) and no longer referenced in package.json or CI
  3. Each individual pipeline step and the export step can be invoked independently for development and debugging without running the full sequence
**Plans**: TBD

### Phase 23: Frontend Simplification
**Goal**: Frontend reads inat_observation_id directly from already-loaded ecdysis features; separate links.parquet load and merge code is gone
**Depends on**: Phase 21
**Requirements**: FRONT-01
**Success Criteria** (what must be TRUE):
  1. Clicking a specimen that has an iNat link still shows the correct iNaturalist URL in the sidebar
  2. No network request for links.parquet is made on page load (verifiable in browser DevTools Network tab)
  3. The code paths that loaded links.parquet and merged inat_observation_id onto features are deleted
**Plans**: TBD
**UI hint**: yes

### Phase 24: Tech Debt Audit
**Goal**: Every known tech debt item has been reviewed against the new architecture and given a disposition: closed, updated, or carried forward with a revised description
**Depends on**: Phase 20, Phase 21, Phase 22, Phase 23
**Requirements**: DEBT-01
**Success Criteria** (what must be TRUE):
  1. Each item from the PROJECT.md Known Tech Debt section has an explicit disposition (closed / updated description / carried forward)
  2. Items resolved by the dlt migration are marked closed with a brief rationale
  3. Surviving items are documented with updated descriptions reflecting the new architecture
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
| 11. Links Pipeline | v1.3 | 2/2 | Complete | 2026-03-12 |
| 12. S3 Cache and Build Integration | v1.3 | 2/2 | Complete | 2026-03-12 |
| 13. Parquet Sources and Asset Pipeline | v1.4 | 2/2 | Complete | 2026-03-13 |
| 14. Layer Toggle and Map Display | v1.4 | 2/2 | Complete | 2026-03-13 |
| 15. Click Interaction and iNat Links | v1.4 | 1/1 | Complete | 2026-03-13 |
| 16. Pipeline Spatial Join | v1.5 | 7/7 | Complete | 2026-03-14 |
| 17. Frontend Data Layer | v1.5 | 2/2 | Complete | 2026-03-14 |
| 18. Map Integration | v1.5 | 4/4 | Complete | 2026-03-14 |
| 19. Sidebar UI | v1.5 | 2/2 | Complete | 2026-03-18 |
| 20. Pipeline Migration | v1.6 | 0/2 | Not started | - |
| 21. Parquet and GeoJSON Export | v1.6 | 0/? | Not started | - |
| 22. Orchestration | v1.6 | 0/? | Not started | - |
| 23. Frontend Simplification | v1.6 | 0/? | Not started | - |
| 24. Tech Debt Audit | v1.6 | 0/? | Not started | - |
