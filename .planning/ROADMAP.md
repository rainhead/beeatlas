# Roadmap: Washington Bee Atlas

## Milestones

- ✅ **v1.0 MVP** — Phases 1–6 (shipped 2026-02-22)
- ✅ **v1.1 URL Sharing** — Phase 7 (shipped 2026-03-10)
- ✅ **v1.2 iNat Pipeline** — Phases 8–10 (shipped 2026-03-11)
- ✅ **v1.3 Specimen-Sample Linkage** — Phases 11–12 (shipped 2026-03-12)
- ✅ **v1.4 Sample Layer** — Phases 13–15 (shipped 2026-03-13)
- 🚧 **v1.5 Geographic Regions** — Phases 16–19 (in progress)

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

See Phase Details section for full criteria.

</details>

### 🚧 v1.5 Geographic Regions (In Progress)

**Milestone Goal:** Collectors can filter specimens and samples by WA county or EPA Level III ecoregion, using a sidebar multi-select autocomplete or by clicking a visible boundary polygon on the map.

- [ ] **Phase 16: Pipeline Spatial Join** — Specimens and samples get county and ecoregion_l3 columns at build time; GeoJSON boundary files bundled with the frontend
- [ ] **Phase 17: Frontend Data Layer** — FilterState extended for region Sets; region-layer.ts module with GeoJSON-backed VectorLayer created; Parquet region columns read into OL feature properties
- [ ] **Phase 18: Map Integration** — Region boundary overlay toggle wired into map; polygon click adds region to active filter; region filter state encoded in URL
- [ ] **Phase 19: Sidebar UI** — County and ecoregion multi-select chips in sidebar; boundary toggle control; clear-all resets region filters

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
- [x] 13-01-PLAN.md — parquet.ts: occurrenceID on ParquetSource + SampleParquetSource class
- [x] 13-02-PLAN.md — style.ts: sampleDotStyle + build-data.sh: graceful links.parquet copy

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
- [x] 14-01-PLAN.md — bee-map.ts: sampleLayer wiring, layerMode state, lm= URL param, singleclick routing
- [x] 14-02-PLAN.md — bee-sidebar.ts: toggle UI, conditional filters, recent events list + human verify

### Phase 15: Click Interaction and iNat Links
**Goal**: Clicking a sample dot shows its iNat observation detail in the sidebar, and the specimen sidebar shows a clickable iNat link when a matching entry exists in links.parquet
**Depends on**: Phase 14
**Requirements**: MAP-05, LINK-05
**Success Criteria** (what must be TRUE):
  1. Clicking a sample dot opens the sidebar showing observer name, date, specimen count (or "not recorded" when null), and a link to the iNaturalist observation page
  2. The iNat observation link in the sample sidebar opens the correct iNat URL in a new tab
  3. Clicking a specimen in specimen mode shows a clickable iNat observation link in the sidebar when `links.parquet` has a matching `occurrenceID`
  4. Specimen sidebar shows no iNat link (no broken link, no error) when `links.parquet` has no match for the specimen's `occurrenceID`
**Plans**: 1 plan
Plans:
- [x] 15-01-PLAN.md — parquet.ts: loadLinksMap + bee-map.ts: links startup wiring + bee-sidebar.ts: sample dot detail and specimen iNat links

### Phase 16: Pipeline Spatial Join
**Goal**: Every specimen and sample record has county and ecoregion_l3 values after the pipeline runs; WA county and ecoregion GeoJSON boundary files are simplified, bundled with the frontend build, and validated by CI schema checks
**Depends on**: Phase 15
**Requirements**: PIPE-05, PIPE-06, PIPE-07
**Success Criteria** (what must be TRUE):
  1. Running the Ecdysis pipeline produces `ecdysis.parquet` where every row has a non-null `county` string and non-null `ecoregion_l3` string (nearest-polygon fallback eliminates all nulls for points within the WA bounding box)
  2. Running the iNat pipeline produces `samples.parquet` where every row has a non-null `county` string and non-null `ecoregion_l3` string using the same spatial join logic
  3. `frontend/src/assets/wa_counties.geojson` and `frontend/src/assets/epa_l3_ecoregions_wa.geojson` are present after `npm run build`, with each file under 400 KB (simplified at 0.006 degrees)
  4. `scripts/validate-schema.mjs` includes `county` and `ecoregion_l3` in the expected column list for both Parquet files and fails CI if either column is absent
**Plans**: 5 plans
Plans:
- [ ] 16-01-PLAN.md — test scaffold: data/tests/test_spatial.py with four failing test classes
- [ ] 16-02-PLAN.md — data/spatial.py: add_region_columns() shared join utility (PIPE-05 core)
- [ ] 16-03-PLAN.md — data/scripts/build-geojson.py + scripts/build-data.sh GeoJSON step (PIPE-07)
- [ ] 16-04-PLAN.md — scripts/validate-schema.mjs: county + ecoregion_l3 columns added (PIPE-07)
- [ ] 16-05-PLAN.md — occurrences.py + inat/download.py: pipeline integrations (PIPE-05, PIPE-06)

### Phase 17: Frontend Data Layer
**Goal**: The frontend can read region columns from Parquet, FilterState tracks selected counties and ecoregions, and the region boundary VectorLayer is constructed and styled — verified via browser console before any UI is wired
**Depends on**: Phase 16
**Requirements**: (no standalone v1.5 requirement — prerequisite layer for Phase 18 and 19 requirements)
**Success Criteria** (what must be TRUE):
  1. Each specimen OL feature has a `county` string property and each sample OL feature has `county` and `ecoregion_l3` string properties accessible in the browser console after Parquet loads
  2. `FilterState` has `selectedCounties: Set<string>` and `selectedEcoregions: Set<string>`; `isFilterActive()` returns true when either set is non-empty; `matchesFilter()` applies AND-across-types / OR-within-type logic
  3. `region-layer.ts` exports a single `regionLayer` OL VectorLayer with `countySource` and `ecoregionSource`; clicking inside a polygon interior registers a hit (transparent fill in place)
**Plans**: TBD

### Phase 18: Map Integration
**Goal**: The region boundary overlay is visible on the map, users can toggle it between off / counties / ecoregions, clicking a polygon adds its region to the active filter, and region filter state round-trips through the URL
**Depends on**: Phase 17
**Requirements**: MAP-09, MAP-10, FILTER-05
**Success Criteria** (what must be TRUE):
  1. A boundary toggle cycles through off / counties / ecoregions — only one boundary type is visible at a time; switching is independent of the specimen/sample layer toggle
  2. Clicking a county or ecoregion polygon when its boundary overlay is active adds that region to the active filter; specimen and sample dot clicks take priority over polygon clicks when both could register
  3. After a polygon click, the specimen and sample points on the map reflect the active region filter (points outside the selected regions are hidden or shown according to current filter semantics)
  4. The URL encodes `bm=` (boundary mode), `counties=` (comma-separated names), and `ecor=` (comma-separated names); pasting the URL restores the same boundary mode and region filter
**Plans**: TBD

### Phase 19: Sidebar UI
**Goal**: Collectors can select, view, and clear county and ecoregion filters from the sidebar using a multi-select autocomplete with removable chips and a boundary mode toggle
**Depends on**: Phase 18
**Requirements**: FILTER-03, FILTER-04, FILTER-06
**Success Criteria** (what must be TRUE):
  1. The sidebar shows a county multi-select autocomplete; selecting a county adds a removable chip labeled with the county name and a "county" type label; multiple counties use OR semantics
  2. The sidebar shows an ecoregion multi-select autocomplete; selecting an ecoregion adds a removable chip labeled with the ecoregion name and an "ecoregion" type label; chips from both types are visible simultaneously
  3. Removing a chip from the sidebar deselects that region; the map updates immediately to reflect the narrowed filter
  4. Clicking "Clear filters" removes all county and ecoregion chips in addition to resetting taxon and date filters; map position is unchanged
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
| 16. Pipeline Spatial Join | 1/5 | In Progress|  | - |
| 17. Frontend Data Layer | v1.5 | 0/? | Not started | - |
| 18. Map Integration | v1.5 | 0/? | Not started | - |
| 19. Sidebar UI | v1.5 | 0/? | Not started | - |
