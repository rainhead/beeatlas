# Roadmap: Washington Bee Atlas

## Milestones

- ✅ **v1.0 MVP** — Phases 1–6 (shipped 2026-02-22)
- ✅ **v1.1 URL Sharing** — Phase 7 (shipped 2026-03-10)
- ✅ **v1.2 iNat Pipeline** — Phases 8–10 (shipped 2026-03-11)
- ✅ **v1.3 Specimen-Sample Linkage** — Phases 11–12 (shipped 2026-03-12)
- ✅ **v1.4 Sample Layer** — Phases 13–15 (shipped 2026-03-13)
- ✅ **v1.5 Geographic Regions** — Phases 16–19 (shipped 2026-03-27)
- ✅ **v1.6 dlt Pipeline Migration** — Phases 20–24 (shipped 2026-03-28)
- ✅ **v1.7 Production Pipeline Infrastructure** — Phases 25–29 (shipped 2026-03-30)
- ✅ **v1.8 DuckDB WASM Frontend** — Phases 30–32 (shipped 2026-04-01)
- 🔄 **v1.9 Frontend Architecture Refactor** — Phases 33–38 (in progress)

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

<details>
<summary>✅ v1.7 Production Pipeline Infrastructure (Phases 25–29) — SHIPPED 2026-03-30</summary>

- [x] Phase 25: CDK Infrastructure (1/1 plans) — completed 2026-03-28
- [x] Phase 26: Lambda Handler + Dockerfile (1/1 plans) — completed 2026-03-28
- [x] Phase 27: Pipeline Tests (1/1 plans) — completed 2026-03-29
- [x] Phase 28: Frontend Runtime Fetch (1/1 plans) — completed 2026-03-29
- [x] Phase 29: CI Simplification (1/1 plans) — completed 2026-03-30

> **Pivot note:** Lambda was abandoned mid-milestone (geographies OOM, 15-min timeout, read-only filesystem). Pipeline runs as `data/nightly.sh` cron on maderas. CDK/Lambda artifacts remain in AWS but are not the execution path.

See `.planning/milestones/v1.7-ROADMAP.md` for full phase details.

</details>

<details>
<summary>✅ v1.8 DuckDB WASM Frontend (Phases 30–32) — SHIPPED 2026-04-01</summary>

- [x] Phase 30: DuckDB WASM Setup (1/1 plans) — completed 2026-03-31
- [x] Phase 31: Feature Creation from DuckDB (1/1 plans) — completed 2026-03-31
- [x] Phase 32: SQL Filter Layer (3/3 plans) — completed 2026-04-01

See `.planning/milestones/v1.8-ROADMAP.md` for full phase details.

</details>

### v1.9 Frontend Architecture Refactor (Phases 33–38)

- [x] **Phase 33: Test Infrastructure** - Install and configure Vitest + happy-dom; wire `npm test` (1/1 plans — completed 2026-04-04)
- [x] **Phase 34: Global State Elimination** - Remove module-level mutable singletons from filter.ts, bee-map.ts, and region-layer.ts (2 plans) (completed 2026-04-04)
  Plans:
  - [x] 34-01-PLAN.md — Eliminate mutable singletons from filter.ts; convert style.ts to factory pattern
  - [x] 34-02-PLAN.md — Move OL objects and region-layer singletons into BeeMap class properties
- [ ] **Phase 35: URL State Module** - Extract serialize/deserialize into pure url-state.ts; wire bee-atlas as URL owner
- [ ] **Phase 36: bee-atlas Root Component** - Extract `<bee-atlas>` owning non-map state; rewire bee-map to property/event interface
- [ ] **Phase 37: Sidebar Decomposition** - Decompose bee-sidebar into bee-filter-controls, bee-specimen-detail, bee-sample-detail sub-components
- [ ] **Phase 38: Unit Tests** - Write round-trip, SQL builder, and component render tests

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
| 27. Seed DuckDB + Tests | v1.7 | 1/1 | Complete    | 2026-03-29 |
| 28. Frontend Runtime Fetch | v1.7 | 1/1 | Complete    | 2026-03-29 |
| 29. CI Simplification | v1.7 | 1/1 | Complete    | 2026-03-30 |
| 30. DuckDB WASM Setup | v1.8 | 1/1 | Complete    | 2026-03-31 |
| 31. Feature Creation from DuckDB | v1.8 | 1/1 | Complete    | 2026-03-31 |
| 32. SQL Filter Layer | v1.8 | 3/3 | Complete    | 2026-04-01 |
| 33. Test Infrastructure | v1.9 | 1/1 | Complete    | 2026-04-04 |
| 34. Global State Elimination | v1.9 | 2/2 | Complete   | 2026-04-04 |
| 35. URL State Module | v1.9 | 0/? | Not started | - |
| 36. bee-atlas Root Component | v1.9 | 0/? | Not started | - |
| 37. Sidebar Decomposition | v1.9 | 0/? | Not started | - |
| 38. Unit Tests | v1.9 | 0/? | Not started | - |
