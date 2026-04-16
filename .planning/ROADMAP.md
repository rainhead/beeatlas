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
- ✅ **v1.9 Component Architecture & Test Suite** — Phases 33–38 (shipped 2026-04-04)
- ✅ **v2.0 Tabular Data View** — Phases 39–41 (shipped 2026-04-09)
- ✅ **v2.1 Determination Feeds** — Phases 42–44 (shipped 2026-04-11)
- ✅ **v2.2 Feed Discoverability & Pipeline** — Phases 45–47 (shipped 2026-04-12)
- ✅ **v2.3 Specimen iNat Observation Links** — Phases 48–51 (shipped 2026-04-13)
- ✅ **v2.4 Header Navigation & Toolbar** — Phases 52–54 (shipped 2026-04-14)
- 🚧 **v2.5 Elevation Data** — Phases 55–58 (in progress)

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
- [x] Phase 27: Seed DuckDB + Tests (1/1 plans) — completed 2026-03-29
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

<details>
<summary>✅ v1.9 Component Architecture & Test Suite (Phases 33–38) — SHIPPED 2026-04-04</summary>

- [x] Phase 33: Test Infrastructure (1/1 plans) — completed 2026-04-04
- [x] Phase 34: Global State Elimination (2/2 plans) — completed 2026-04-04
- [x] Phase 35: URL State Module (1/1 plans) — completed 2026-04-04
- [x] Phase 36: bee-atlas Root Component (2/2 plans) — completed 2026-04-04
- [x] Phase 37: Sidebar Decomposition (3/3 plans) — completed 2026-04-04
- [x] Phase 38: Unit Tests (2/2 plans) — completed 2026-04-04

See `.planning/milestones/v1.9-ROADMAP.md` for full phase details.

</details>

<details>
<summary>✅ v2.0 Tabular Data View (Phases 39–41) — SHIPPED 2026-04-09</summary>

- [x] Phase 39: View Mode Toggle (3/3 plans) — completed 2026-04-08
- [x] Phase 40: bee-table Component (2/2 plans) — completed 2026-04-08
- [x] Phase 41: CSV Export (1/1 plans) — completed 2026-04-09

**Milestone Goal:** Add a table-centric alternative to the map view so users can sort, browse, and export the filtered specimen/sample dataset.

### Phase 39: View Mode Toggle
**Goal**: Users can switch between map view and table view, with the choice bookmarkable in the URL
**Depends on**: Phase 38
**Requirements**: VIEW-01, VIEW-02, VIEW-03
**Success Criteria** (what must be TRUE):
  1. User can click a toggle control in the main UI to switch from map view to table view and back
  2. In table view, the map is not visible and the table area occupies the full content space
  3. Navigating to a URL with `view=table` param opens directly in table view
  4. Copying a table-view URL and pasting it in a new tab restores the table view
**Plans**: 3 plans
Plans:
- [x] 39-01-PLAN.md — Extend url-state.ts with viewMode field and round-trip serialization
- [x] 39-02-PLAN.md — Add view mode toggle row to bee-sidebar (view-changed event)
- [x] 39-03-PLAN.md — Wire _viewMode state into bee-atlas (conditional render, URL push, popstate restore)
**UI hint**: yes

### Phase 40: bee-table Component
**Goal**: Users can browse, sort, and paginate the filtered dataset as a table
**Depends on**: Phase 39
**Requirements**: TABLE-01, TABLE-02, TABLE-03, TABLE-04, TABLE-05, TABLE-06, TABLE-07
**Success Criteria** (what must be TRUE):
  1. Table shows specimen rows (species, collector, year, month, county, ecoregion, field number) when layer mode is "specimens", and sample rows (observer, date, specimen count, county, ecoregion) when layer mode is "samples"
  2. Applying a filter updates the table to show only rows matching the active filter — the same set visible as dots on the map
  3. A row count indicator reads "showing 1–100 of N specimens" (or samples), accurately reflecting the filtered total
  4. Previous/next page controls navigate through the result set, with current page shown; each page shows up to 100 rows
  5. Clicking a column header sorts the table by that column; clicking again reverses sort direction
**Plans**: 2 plans
Plans:
- [x] 40-01-PLAN.md — Data layer: extend UiState with sort params, add queryTablePage function and column constants
- [x] 40-02-PLAN.md — Presenter + wiring: create bee-table component, integrate into bee-atlas with state management
**UI hint**: yes

### Phase 41: CSV Export
**Goal**: Users can download the full filtered result set as a CSV file with a descriptive filename
**Depends on**: Phase 40
**Requirements**: CSV-01, CSV-02
**Success Criteria** (what must be TRUE):
  1. Clicking "Download CSV" triggers a browser file download of the complete filtered result set (not just the current page)
  2. The downloaded filename reflects the active filter state (e.g. `specimens-bombus-2023.csv` or `samples-all.csv`)
**Plans**: 1 plan
Plans:
- [x] 41-01-PLAN.md — Add CSV export: queryAllFiltered, buildCsvFilename, Download CSV button, bee-atlas handler
**UI hint**: yes

</details>

<details>
<summary>✅ v2.1 Determination Feeds (Phases 42–44) — SHIPPED 2026-04-11</summary>

- [x] Phase 42: Feed Generator Core (1/1 plans) — completed 2026-04-09
- [x] Phase 43: Feed Variants (1/1 plans) — completed 2026-04-10
- [x] Phase 44: Pipeline Wiring and Discovery (1/1 plans) — completed 2026-04-11

See `.planning/milestones/v2.1-ROADMAP.md` for full phase details.

</details>

<details>
<summary>✅ v2.2 Feed Discoverability & Pipeline (Phases 45–47) — SHIPPED 2026-04-12</summary>

- [x] Phase 45: Sidebar Feed Discovery (2/2 plans) — completed 2026-04-12
- [x] Phase 46: Basemap Tile Provider Upgrade (1/1 plan) — completed 2026-04-12
- [x] Phase 47: DuckDB Spatial Geographies Pipeline Rewrite (2/2 plans) — completed 2026-04-12

See `.planning/milestones/v2.2-ROADMAP.md` for full phase details.

</details>

<details>
<summary>✅ v2.3 Specimen iNat Observation Links (Phases 48–51) — SHIPPED 2026-04-13</summary>

- [x] Phase 48: Column Rename (1/1 plans) — completed 2026-04-13
- [x] Phase 49: WABA Pipeline (1/1 plans) — completed 2026-04-13
- [x] Phase 50: Export Join & Schema Gate (1/1 plans) — completed 2026-04-13
- [x] Phase 51: Frontend Link Rendering (1/1 plans) — completed 2026-04-13

See `.planning/milestones/v2.3-ROADMAP.md` for full phase details.

</details>

<details>
<summary>✅ v2.4 Header Navigation & Toolbar (Phases 52–54) — SHIPPED 2026-04-14</summary>

- [x] Phase 52: Header Component (2/2 plans) — completed 2026-04-13
- [x] Phase 53: Filter Toolbar (1/1 plans) — completed 2026-04-13
- [x] Phase 54: Sidebar Cleanup (2/2 plans) — completed 2026-04-14

See `.planning/milestones/v2.4-ROADMAP.md` for full phase details.

</details>

### v2.5 Elevation Data (In Progress)

**Milestone Goal:** Annotate specimens and samples with inferred elevation (meters) from the USGS 3DEP DEM, surface in sidebar detail and filter toolbar.

- [x] **Phase 55: DEM Acquisition Module** — dem_pipeline.py with download + sampling functions, unit tests, pip deps (completed 2026-04-15)
- [x] **Phase 56: Export Integration** — wire elevation sampling into export.py for both tables, schema gate update (completed 2026-04-15)
- [ ] **Phase 57: Sidebar Display** — elevation in bee-specimen-detail and bee-sample-detail
- [ ] **Phase 58: Elevation Filter** — filter toolbar inputs, buildFilterSQL, url-state, clear filters

## Phase Details

### Phase 52: Header Component
**Goal**: Users can switch data layers and views from a persistent header bar at the top of the page
**Depends on**: Phase 51
**Requirements**: HDR-01, HDR-02, HDR-03, HDR-04
**Success Criteria** (what must be TRUE):
  1. User can click Specimens or Samples tab in the header to switch the active data layer; the active tab is visually distinct from the inactive one
  2. Species and Plants appear as greyed-out disabled tabs in the header, signaling future roadmap items without being clickable
  3. User can click icon buttons on the right side of the header to toggle between Map and Table views
  4. On narrow viewports, the nav tabs collapse to a hamburger menu that expands to show all tab options
  5. The `lm=` and `view=` URL params continue to round-trip correctly through the new header controls
**Plans**: 2 plans
Plans:
- [x] 52-01-PLAN.md — Create bee-header Lit component with nav tabs, view icons, hamburger menu, and unit tests
- [x] 52-02-PLAN.md — Wire bee-header into bee-atlas, clean up index.html, visual verification
**UI hint**: yes

### Phase 53: Filter Toolbar
**Goal**: Users see all filter controls and the CSV download button in a persistent toolbar below the header, not inside the sidebar
**Depends on**: Phase 52
**Requirements**: FILT-08, FILT-09
**Success Criteria** (what must be TRUE):
  1. Taxon, year, month, county, and ecoregion filter controls are visible in a toolbar below the header when the app loads — no sidebar interaction required to reach them
  2. CSV download button appears in the filter toolbar and triggers a download of the current filtered result set
  3. Filter state (chips, URL params) continues to work identically to before — changing a filter in the toolbar updates the map and table
  4. The sidebar no longer contains filter controls or the CSV download button
**Plans**: 1 plan
Plans:
- [x] 54-01-PLAN.md — Sidebar detail-only panel: hide by default, open on click, close button, strip non-detail content
**UI hint**: yes

### Phase 54: Sidebar Cleanup
**Goal**: The sidebar is hidden until the user clicks a map feature, and can be dismissed back to hidden
**Depends on**: Phase 53
**Requirements**: SIDE-01, SIDE-02
**Success Criteria** (what must be TRUE):
  1. When the app loads with no map feature selected, the sidebar is not visible — the map or table occupies the full content area
  2. Clicking a specimen cluster or sample dot on the map opens the sidebar showing the relevant detail panel
  3. User can dismiss the open sidebar (via a close button or equivalent) and it returns to hidden; the map/table returns to full width
  4. The sidebar no longer contains the layer toggle, view toggle, filter controls, or feed subscription links
**Plans**: 2 plans
Plans:
- [x] 54-01-PLAN.md — Sidebar detail-only panel: hide by default, open on click, close button, strip non-detail content
- [x] 54-02-PLAN.md — Gap closure: fix empty-click sidebar dismiss and remove redundant Back buttons from detail panels
**UI hint**: yes

### Phase 55: DEM Acquisition Module
**Goal**: A tested Python module can download the USGS 3DEP DEM for Washington and sample elevation at arbitrary coordinates
**Depends on**: Phase 54
**Requirements**: ELEV-01
**Success Criteria** (what must be TRUE):
  1. Running `ensure_dem(path)` downloads the WA bounding-box GeoTIFF on first call and skips download on subsequent calls when the file exists
  2. `sample_elevation(lons, lats, dem_path)` returns integer meters for in-bounds coordinates and None for out-of-bounds or nodata coordinates
  3. The nodata sentinel value is read from `dataset.nodata` (not hardcoded) and converted to None before returning
  4. Unit tests pass using a synthetic 2x2 GeoTIFF fixture without downloading real DEM data; `seamless-3dep` and `rasterio` are listed in `pyproject.toml`
**Plans:** 1/1 plans complete
Plans:
- [x] 55-01-PLAN.md — Add dependencies, create dem_pipeline.py with ensure_dem and sample_elevation, unit tests with synthetic fixture

### Phase 56: Export Integration
**Goal**: Both parquet export files contain a nullable `elevation_m` INT16 column populated from the DEM, and CI enforces its presence
**Depends on**: Phase 55
**Requirements**: ELEV-02, ELEV-03, ELEV-04
**Success Criteria** (what must be TRUE):
  1. After running the export pipeline, `ecdysis.parquet` contains an `elevation_m` INT16 nullable column with valid integer meter values for specimens within WA and NULL for out-of-bounds/nodata points
  2. After running the export pipeline, `samples.parquet` contains the same `elevation_m` column with the same null semantics
  3. `validate-schema.mjs` fails the CI build if `elevation_m` is absent from either parquet file; the schema gate change ships in the same commit as the export change
  4. No row in either parquet file has `elevation_m < -500` (nodata sentinel not leaking as a real value)
**Plans:** 2/2 plans complete
Plans:
- [x] 56-01-PLAN.md — Wire elevation sampling into export.py, update schema gate, add pyarrow dep
- [x] 56-02-PLAN.md — Add elevation integration tests to test_export.py

### Phase 57: Sidebar Display
**Goal**: Users can see a specimen's or sample's elevation in the sidebar detail panel when elevation data is available
**Depends on**: Phase 56
**Requirements**: ELEV-05, ELEV-06
**Success Criteria** (what must be TRUE):
  1. In `bee-specimen-detail`, an "Elevation" row showing "1219 m" (integer, no decimal) appears when `elevation_m` is non-null
  2. In `bee-specimen-detail`, the elevation row is entirely absent (not shown as blank or "—") when `elevation_m` is null
  3. In `bee-sample-detail`, elevation displays with the identical format and null-omit behavior as the specimen detail panel
**UI hint**: yes
**Plans:** 1/2 plans executed
Plans:
- [x] 57-01-PLAN.md — Thread elevation_m through data layer (interfaces, DuckDB queries, event propagation)
- [ ] 57-02-PLAN.md — Render elevation in detail components with conditional null-omission and tests


### Phase 58: Elevation Filter
**Goal**: Users can filter the map and table to specimens and samples within an elevation range, with the range bookmarkable in the URL
**Depends on**: Phase 57
**Requirements**: ELEV-07, ELEV-08, ELEV-09
**Success Criteria** (what must be TRUE):
  1. Min and max elevation number inputs appear in the filter toolbar; entering values narrows the map dots and table rows to points within that elevation range
  2. A URL containing `elev_min=500&elev_max=1500` opens with those values pre-filled in the elevation inputs and the filter active
  3. When only one bound is set (min only or max only), the filter does not exclude null-elevation records — null rows are excluded only when both bounds are provided
  4. Clicking "Clear filters" resets the elevation min/max inputs to empty alongside all other filter fields
**UI hint**: yes

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
| 20. Pipeline Migration | v1.6 | 2/2 | Complete | 2026-03-27 |
| 21. Parquet and GeoJSON Export | v1.6 | 2/2 | Complete | 2026-03-27 |
| 22. Orchestration | v1.6 | 1/1 | Complete | 2026-03-27 |
| 23. Frontend Simplification | v1.6 | 1/1 | Complete | 2026-03-27 |
| 24. Tech Debt Audit | v1.6 | 1/1 | Complete | 2026-03-27 |
| 25. CDK Infrastructure | v1.7 | 1/1 | Complete | 2026-03-28 |
| 26. Lambda Handler + Dockerfile | v1.7 | 1/1 | Complete | 2026-03-28 |
| 27. Seed DuckDB + Tests | v1.7 | 1/1 | Complete | 2026-03-29 |
| 28. Frontend Runtime Fetch | v1.7 | 1/1 | Complete | 2026-03-29 |
| 29. CI Simplification | v1.7 | 1/1 | Complete | 2026-03-30 |
| 30. DuckDB WASM Setup | v1.8 | 1/1 | Complete | 2026-03-31 |
| 31. Feature Creation from DuckDB | v1.8 | 1/1 | Complete | 2026-03-31 |
| 32. SQL Filter Layer | v1.8 | 3/3 | Complete | 2026-04-01 |
| 33. Test Infrastructure | v1.9 | 1/1 | Complete | 2026-04-04 |
| 34. Global State Elimination | v1.9 | 2/2 | Complete | 2026-04-04 |
| 35. URL State Module | v1.9 | 1/1 | Complete | 2026-04-04 |
| 36. bee-atlas Root Component | v1.9 | 4/2 | Complete | 2026-04-07 |
| 37. Sidebar Decomposition | v1.9 | 3/3 | Complete | 2026-04-04 |
| 38. Unit Tests | v1.9 | 2/2 | Complete | 2026-04-04 |
| 39. View Mode Toggle | v2.0 | 3/3 | Complete | 2026-04-08 |
| 40. bee-table Component | v2.0 | 2/2 | Complete | 2026-04-08 |
| 41. CSV Export | v2.0 | 1/1 | Complete | 2026-04-09 |
| 42. Feed Generator Core | v2.1 | 1/1 | Complete | 2026-04-09 |
| 43. Feed Variants | v2.1 | 1/1 | Complete | 2026-04-10 |
| 44. Pipeline Wiring and Discovery | v2.1 | 1/1 | Complete | 2026-04-11 |
| 45. Sidebar Feed Discovery | v2.2 | 2/2 | Complete | 2026-04-12 |
| 46. Basemap Tile Provider Upgrade | v2.2 | 1/1 | Complete | 2026-04-12 |
| 47. DuckDB Spatial Geographies Pipeline | v2.2 | 2/2 | Complete | 2026-04-12 |
| 48. Column Rename | v2.3 | 1/1 | Complete | 2026-04-13 |
| 49. WABA Pipeline | v2.3 | 1/1 | Complete | 2026-04-13 |
| 50. Export Join & Schema Gate | v2.3 | 1/1 | Complete | 2026-04-13 |
| 51. Frontend Link Rendering | v2.3 | 1/1 | Complete | 2026-04-13 |
| 52. Header Component | v2.4 | 2/2 | Complete | 2026-04-13 |
| 53. Filter Toolbar | v2.4 | 1/1 | Complete | 2026-04-13 |
| 54. Sidebar Cleanup | v2.4 | 2/2 | Complete | 2026-04-14 |
| 55. DEM Acquisition Module | v2.5 | 1/1 | Complete    | 2026-04-15 |
| 56. Export Integration | v2.5 | 2/2 | Complete   | 2026-04-15 |
| 57. Sidebar Display | v2.5 | 1/2 | In Progress|  |
| 58. Elevation Filter | v2.5 | 0/? | Not started | - |
