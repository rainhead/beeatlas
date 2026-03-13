# Roadmap: Washington Bee Atlas

## Milestones

- ✅ **v1.0 MVP** — Phases 1–6 (shipped 2026-02-22)
- ✅ **v1.1 URL Sharing** — Phase 7 (shipped 2026-03-10)
- ✅ **v1.2 iNat Pipeline** — Phases 8–10 (shipped 2026-03-11)
- ✅ **v1.3 Specimen-Sample Linkage** — Phases 11–12 (shipped 2026-03-12)
- 🚧 **v1.4 Sample Layer** — Phases 13–15 (in progress)

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

### 🚧 v1.4 Sample Layer (In Progress)

**Milestone Goal:** Surface iNat collection events on the map and wire up the specimen→iNat observation link in the sidebar.

- [x] **Phase 13: Parquet Sources and Asset Pipeline** — SampleParquetSource, occurrenceID on specimen features, sampleDotStyle, links.parquet asset copy (completed 2026-03-13)
- [ ] **Phase 14: Layer Toggle and Map Display** — Sample dots visible on map, exclusive toggle, sidebar clears on switch, URL lm= param
- [ ] **Phase 15: Click Interaction and iNat Links** — Sample dot click detail sidebar, links.parquet lookup for specimen iNat link

## Phase Details

### Phase 13: Parquet Sources and Asset Pipeline
**Goal**: The data layer infrastructure needed by the sample feature is in place — new Parquet sources compile, specimen features carry the join key, sample dot style exists, and links.parquet is bundled with the build
**Depends on**: Phase 12
**Requirements**: MAP-03 (partial — source only), LINK-05 (prerequisite — join key available)
**Success Criteria** (what must be TRUE):
  1. `SampleParquetSource` class exists in `parquet.ts` and reads rows from `samples.parquet` without errors (verified in browser console)
  2. Each specimen OL feature carries an `occurrenceID` property (UUID string) accessible after `ParquetSource` loads
  3. `sampleDotStyle` is defined in `style.ts` and visually distinct from the specimen cluster style
  4. `frontend/src/assets/links.parquet` is present after running `npm run build` (i.e., `build-data.sh` copies it)
**Plans**: 2 plans
Plans:
- [ ] 13-01-PLAN.md — parquet.ts: occurrenceID on ParquetSource + SampleParquetSource class
- [ ] 13-02-PLAN.md — style.ts: sampleDotStyle + build-data.sh: graceful links.parquet copy

### Phase 14: Layer Toggle and Map Display
**Goal**: Users can see iNat collection events as sample dots on the map and switch exclusively between specimen clusters and sample dots, with the sidebar and URL reflecting the active layer
**Depends on**: Phase 13
**Requirements**: MAP-03, MAP-04
**Success Criteria** (what must be TRUE):
  1. Sample dot markers appear on the map when sample mode is active — one dot per iNat collection event at the correct coordinates
  2. Toggling to sample mode hides specimen clusters; toggling back hides sample dots — only one layer is visible at a time
  3. Switching layers clears the sidebar (no stale specimen or sample detail remains visible)
  4. The `lm=` URL parameter encodes the active layer mode; pasting a sample-mode URL restores sample dots as the active layer
  5. Specimen taxon/date filter controls are hidden or disabled when sample mode is active
**Plans**: 2 plans
Plans:
- [ ] 14-01-PLAN.md — bee-map.ts: sampleLayer wiring, layerMode state, lm= URL param, singleclick routing
- [ ] 14-02-PLAN.md — bee-sidebar.ts: toggle UI, conditional filters, recent events list + human verify

### Phase 15: Click Interaction and iNat Links
**Goal**: Clicking a sample dot shows its iNat observation detail in the sidebar, and the specimen sidebar shows a clickable iNat link when a matching entry exists in links.parquet
**Depends on**: Phase 14
**Requirements**: MAP-05, LINK-05
**Success Criteria** (what must be TRUE):
  1. Clicking a sample dot opens the sidebar showing observer name, date, specimen count (or "not recorded" when null), and a link to the iNaturalist observation page
  2. The iNat observation link in the sample sidebar opens the correct iNat URL in a new tab
  3. Clicking a specimen in specimen mode shows a clickable iNat observation link in the sidebar when `links.parquet` has a matching `occurrenceID`
  4. Specimen sidebar shows no iNat link (no broken link, no error) when `links.parquet` has no match for the specimen's `occurrenceID`
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
| 13. Parquet Sources and Asset Pipeline | 2/2 | Complete    | 2026-03-13 | - |
| 14. Layer Toggle and Map Display | v1.4 | 0/TBD | Not started | - |
| 15. Click Interaction and iNat Links | v1.4 | 0/TBD | Not started | - |
