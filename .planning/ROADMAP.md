# Roadmap: Washington Bee Atlas

## Milestones

- ✅ **v1.0 MVP** — Phases 1–6 (shipped 2026-02-22)
- ✅ **v1.1 URL Sharing** — Phase 7 (complete 2026-03-09)

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

### ✅ v1.1 URL Sharing (Complete — 2026-03-09)

- [x] **Phase 7: URL Sharing** — All 7 scenarios verified (A-G pass); NAV-01 fully satisfied

#### Phase 7: URL Sharing
**Goal**: A collector can share a link that restores the exact map view and active filters another collector sees
**Depends on**: Phase 5 (filters must be correct before encoding them in URLs)
**Requirements**: NAV-01
**Success Criteria** (what must be TRUE):
  1. Panning, zooming, or changing filters updates the URL without a page reload
  2. Opening a shared URL restores the map center, zoom level, and active filter values exactly
  3. A fresh page load with no URL parameters shows the default view (Washington state at full extent)
**Plans**: 5 plans

Plans:
- [x] 07-01-PLAN.md — Implement URL sync in bee-map.ts and promote BeeSidebar filter fields to @property
- [x] 07-02-PLAN.md — Human verify URL sharing end-to-end (5/7 pass; F and G need gap-closure)
- [x] 07-03-PLAN.md — Gap closure F: fix back button (_onPopState uses map.once('moveend') to reset flag)
- [x] 07-04-PLAN.md — Gap closure G: fix o= param (preserve on load, encode all cluster IDs, restore multi-occurrence)
- [x] 07-05-PLAN.md — Human verify all 7 scenarios pass; NAV-01 complete

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
