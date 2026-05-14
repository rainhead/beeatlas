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
- ✅ **v2.5 Elevation Data** — Phases 55–58 (shipped 2026-04-16)
- ✅ **v2.6 SQLite WASM Migration** — Phases 59–61 (shipped 2026-04-17)
- ✅ **v2.7 Unified Occurrence Model** — Phases 62–65 (shipped 2026-04-17)
- ✅ **v2.8 Liveness: Provisional Specimen Records** — Phases 66–67 (shipped 2026-04-20)
- ✅ **v2.9 UI Flow Redesign** — Phases 68–70 (shipped 2026-04-21)
- ✅ **v3.0 Mapbox GL JS Migration** — Phases 71–73 (shipped 2026-04-27)
- ✅ **v3.1 Eleventy Build Wrapper** — Phases 74–75 (shipped 2026-04-30)
- ✅ **v3.2 Species Tab** — Phases 76–82 (shipped 2026-05-05)
- ✅ **v3.3 dbt Spike** — Phases 83–84 (shipped 2026-05-13). Verdict: GO-WITH-CONDITIONS. See [.planning/milestones/v3.3-ROADMAP.md](milestones/v3.3-ROADMAP.md).
- 🔄 **v3.4 dbt Full Rewrite** — Phases 85–88 (in planning). Cut over from `export.py` + ad-hoc Python to `dbt build` as the canonical pipeline.

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

<details>
<summary>✅ v2.5 Elevation Data (Phases 55–58) — SHIPPED 2026-04-16</summary>

- [x] Phase 55: DEM Acquisition Module (1/1 plans) — completed 2026-04-15
- [x] Phase 56: Export Integration (2/2 plans) — completed 2026-04-15
- [x] Phase 57: Sidebar Display (2/2 plans) — completed 2026-04-16
- [x] Phase 58: Elevation Filter (2/2 plans) — completed 2026-04-16

See `.planning/milestones/v2.5-ROADMAP.md` for full phase details.

</details>

<details>
<summary>✅ v2.6 SQLite WASM Migration (Phases 59–61) — SHIPPED 2026-04-17</summary>

- [x] Phase 59: Benchmark Baseline (1/1 plans) — completed 2026-04-16
- [x] Phase 60: wa-sqlite Integration (3/3 plans) — completed 2026-04-17
- [x] Phase 61: DuckDB Removal (1/1 plans) — completed 2026-04-17

See `.planning/milestones/v2.6-ROADMAP.md` for full phase details.

</details>

<details>
<summary>✅ v2.7 Unified Occurrence Model (Phases 62–65) — SHIPPED 2026-04-17</summary>

- [x] Phase 62: Pipeline Join (2/2 plans) — completed 2026-04-17
- [x] Phase 63: SQLite Data Layer (2/2 plans) — completed 2026-04-17
- [x] Phase 64: OccurrenceSource (2/2 plans) — completed 2026-04-17
- [x] Phase 65: UI Unification (2/2 plans) — completed 2026-04-17

See `.planning/milestones/v2.7-ROADMAP.md` for full phase details.

</details>

## ✅ v2.8 Liveness: Provisional Specimen Records (Phases 66–67) — SHIPPED 2026-04-20

- [x] Phase 66: Provisional Rows in Pipeline (5/5 plans) — completed 2026-04-20
- [x] Phase 67: Provisional Row Display in Sidebar (2/2 plans) — completed 2026-04-20

## ✅ v2.9 UI Flow Redesign (Phases 68–70) — SHIPPED 2026-04-21

**Milestone Goal:** Reorganize the UI around the flow: overview → narrow → dive. Map always visible. Filter as collapsible panel that hints at what's filterable. Table as a drawer over the map, not a replacement for it.

- [x] Phase 68: Filter Panel Redesign — floating map overlay control (magnifying glass + count) that expands into what/who/where/when panel
- [x] Phase 69: Table Drawer — table slides up over map rather than replacing it; spatial context preserved
- [x] Phase 70: Map Overlay Sidebar — detail panel overlays map instead of shifting it

<details>
<summary>✅ v3.0 Mapbox GL JS Migration (Phases 71–73) — SHIPPED 2026-04-27</summary>

- [x] Phase 71: Base Map and Occurrence Layer (3/3 plans) — completed 2026-04-27
- [x] Phase 72: Boundaries and Interaction (2/2 plans) — completed 2026-04-27
- [x] Phase 73: OL Removal and Verification (2/2 plans) — completed 2026-04-27

See `.planning/milestones/v3.0-ROADMAP.md` for full phase details.

</details>

<details>
<summary>✅ v3.1 Eleventy Build Wrapper (Phases 74–75) — SHIPPED 2026-04-30</summary>

- [x] Phase 74: Eleventy Outer Build Integration (3/3 plans) — completed 2026-04-30
- [x] Phase 75: Authoring Scaffold and Verification (2/2 plans) — completed 2026-04-30

See `.planning/milestones/v3.1-ROADMAP.md` for full phase details.

</details>

<details>
<summary>✅ v3.2 Species Tab (Phases 76–82) — SHIPPED 2026-05-05</summary>

- [x] Phase 76: Data Foundation (6/6 plans) — completed 2026-05-02
- [x] Phase 77: Lineage Coverage Expansion (3/3 plans) — INSERTED 2026-05-03; completed 2026-05-03
- [x] Phase 78: Pipeline Outputs (4/4 plans) — completed 2026-05-04
- [x] Phase 79: Photo Manifest (3/3 plans) — completed 2026-05-04
- [x] Phase 80: Page Scaffolding (4/4 plans) — completed 2026-05-04
- [x] Phase 81: Filter UX & Nav (6/6 plans) — completed 2026-05-05
- [x] Phase 82: Hardening (8/8 plans) — completed 2026-05-05

See `.planning/milestones/v3.2-ROADMAP.md` for full phase details.

</details>

<details>
<summary>✅ v3.3 dbt Spike (Phases 83–84) — SHIPPED 2026-05-13</summary>

**Milestone Goal:** Learn whether `dbt-duckdb` is the right shape for the BeeAtlas data layer by porting one representative slice end-to-end on a branch. Produce a go / no-go / go-with-conditions writeup that informs a *separate, future* rewrite milestone.

**Verdict:** GO-WITH-CONDITIONS — 5-prerequisite checklist for v3.4+ in `.planning/research/dbt-spike-findings.md`.

- [x] Phase 83: Scaffold & Slice Port (4/4 plans) — completed 2026-05-12
- [x] Phase 84: Tests, Diff & Findings (3/3 plans) — completed 2026-05-13

See `.planning/milestones/v3.3-ROADMAP.md` for full phase details.

</details>

<details>
<summary>🔄 v3.4 dbt Full Rewrite (Phases 85–88) — IN PLANNING</summary>

**Milestone Goal:** Cut over the BeeAtlas data pipeline from `data/export.py` + ad-hoc Python transforms to `data/dbt/` as the canonical producer of `occurrences.parquet`, `counties.geojson`, `ecoregions.geojson`, `species.json`, and species count artifacts. After v3.4, `dbt build` is the only way these outputs are produced.

- [ ] Phase 85: Pre-Cutover Groundwork — resolve awkward-fit tests, replace FORMAT CSV macro, drop 3 unused columns
- [ ] Phase 86: Port Remaining Transforms — port species_export, occurrence-links, taxon-lineage, and resolve_taxon_ids to dbt
- [ ] Phase 87: Incremental Materialization Experiment — test and document `materialized='incremental'` on dbt-duckdb with external materializations
- [ ] Phase 88: Production Cutover — switch run.py to dbt, retire _apply_migrations and validate-schema.mjs, adapt nightly.sh, smoke-test frontend

</details>

## Phase Details

### Phase 66: Provisional Rows in Pipeline
**Goal**: The export pipeline surfaces WABA observations that have no Ecdysis match as provisional occurrence rows, complete with iNat taxon, observer, and host sample context
**Depends on**: Phase 65
**Requirements**: PROV-01, PROV-02, PROV-03, PROV-04, PROV-05
**Success Criteria** (what must be TRUE):
  1. Running `export.py` against a DuckDB with WABA observations produces `occurrences.parquet` rows where `ecdysis_id` is null and `is_provisional` is true for unmatched WABA observations
  2. Provisional rows carry `scientificName`, `genus`, `family` from the iNat community taxon, `observer` from the iNat user login, and `specimen_observation_id` equal to the WABA observation ID
  3. Provisional rows whose WABA observation has OFV field_id 1718 carry a populated `host_observation_id`; where that host observation is a known sample, `specimen_count` and `sample_id` are also populated
  4. WABA observations that do have an Ecdysis catalog-number match are absent from the provisional rows (matched rows remain as specimen rows only)
  5. `validate-schema.mjs` passes with the new `is_provisional` column; 2 pytest integration tests confirm the above inclusion/exclusion behavior
**Plans**: 5 plans
Plans:
- [x] 066-01-PLAN.md — Add taxon.ancestors to waba_pipeline.py DEFAULT_FIELDS and run pipeline
- [x] 066-02-PLAN.md — Extend conftest.py fixtures and add integration test stubs (Wave 0)
- [x] 066-03-PLAN.md — Restructure export.py joined CTE into UNION ALL with provisional rows and new columns
- [x] 066-04-PLAN.md — Update validate-schema.mjs EXPECTED list and verify schema gate passes
- [x] 066-05-PLAN.md — Fix taxon_lineage table mismatch (gap closure)

### Phase 67: Provisional Row Display in Sidebar
**Goal**: Users see meaningful labels and links for sample-only and provisional rows in the occurrence detail sidebar
**Depends on**: Phase 66
**Requirements**: SID-01, SID-02
**Success Criteria** (what must be TRUE):
  1. Clicking a sample-only occurrence (ecdysis_id null, is_provisional falsy) shows "N specimens collected, identification pending" in the sidebar — no blank species name
  2. Clicking a provisional occurrence (is_provisional true) shows a provisional identification label with the iNat community taxon name and a link to the WABA observation via `specimen_observation_id`
  3. A Vitest render test mounts `bee-occurrence-detail` with a provisional row fixture and asserts the provisional label and observation link are present
  4. Existing specimen and sample-only render tests continue to pass
**Plans**: 2 plans
Plans:
- [x] 067-01-PLAN.md — Schema + data layer: add specimen_inat_quality_grade to export.py and validate-schema.mjs; rename observer to host_inat_login in filter.ts; add is_provisional, specimen_inat_taxon_name, specimen_inat_quality_grade to OccurrenceRow and OCCURRENCE_COLUMNS
- [x] 067-02-PLAN.md — Rendering + tests: _renderProvisional method and updated _renderSampleOnly in bee-occurrence-detail.ts; two new Vitest render tests in bee-sidebar.test.ts
**UI hint**: yes

### Phase 68: Filter Panel Redesign
**Goal**: Replace the always-visible filter toolbar with a floating map overlay control (magnifying glass + count) that expands into a structured what/who/where/when filter panel
**Depends on**: Phase 67
**Requirements**: (UI flow redesign — no formal REQ IDs assigned)
**Success Criteria** (what must be TRUE):
  1. The filter toolbar row is gone; the map fills the full content area
  2. A floating button overlays the map at top: 0.5em, to the left of the Regions button — shows magnifying-glass icon + specimen count
  3. When any filter is active, the button turns green (active coloring)
  4. Clicking the button opens a panel; clicking again closes it
  5. The panel has four icon-headed sections: What (taxon), Who (collector), Where (county/ecoregion/elevation), When (year/month)
  6. Filter changes propagate to bee-atlas and update the map identically to before
  7. localStorage recents (beeatlas.recentFilters) are no longer written
  8. CSV download is only accessible from table view
**Plans**: 3 plans
Plans:
- [x] 068-01-PLAN.md — Create bee-filter-panel.ts (floating overlay, trigger button, four section headers, bee-filter-controls embedded)
- [x] 068-02-PLAN.md — Remove localStorage recents from bee-filter-controls.ts (D-09)
- [x] 068-03-PLAN.md — Wire bee-atlas.ts: swap toolbar for panel, update tests

### Phase 69: Table Drawer
**Goal**: Table slides up over map rather than replacing it; spatial context preserved
**Depends on**: Phase 68
**Requirements**: (UI flow redesign — no formal REQ IDs assigned)
**Success Criteria** (what must be TRUE):
  1. In table mode, the map remains visible as a ~18% strip above the drawer; bee-map is never removed from the DOM
  2. The table drawer covers ~82% of the content area height, positioned absolute at bottom: 0
  3. In table mode, the filter panel and sidebar are not rendered
  4. Switching to table mode closes any open sidebar (_sidebarOpen → false)
  5. Clicking a table row pans the map strip to center on that occurrence's lat/lon
  6. Rows without lat/lon are silently skipped (no error or sidebar open)
**Plans**: 2 plans
Plans:
- [x] 069-01-PLAN.md — Add _onRowClick handler and row-pan event dispatch to bee-table.ts
- [x] 069-02-PLAN.md — Restructure bee-atlas.ts: drawer layout, mode gating, _onRowPan handler

### Phase 70: Map Overlay Sidebar
**Goal**: Detail panel overlays map instead of shifting it; map always full-width
**Depends on**: Phase 69
**Requirements**: (UI flow redesign — no formal REQ IDs assigned)
**Success Criteria** (what must be TRUE):
  1. Opening the sidebar does not change the map's width — it always occupies the full .content area
  2. The sidebar panel appears as a right-edge overlay anchored below the filter button with a drop shadow
  3. The sidebar header reads "Selected specimens" alongside the existing close button
  4. On portrait screens the sidebar reverts to the below-map flex layout (width: 100%, border-top)
**Plans**: 1 plan
Plans:
- [x] 070-01-PLAN.md — Update bee-sidebar.ts (overlay host styles, header label) and bee-atlas.ts (sidebar CSS to overlay positioning)

<!-- Phase 71-73 details archived to .planning/milestones/v3.0-ROADMAP.md -->

<!-- Phase 76-82 details archived to .planning/milestones/v3.2-ROADMAP.md -->

<!-- Phase 83-84 details archived to .planning/milestones/v3.3-ROADMAP.md -->

### Phase 85: Pre-Cutover Groundwork
**Goal**: The dbt test suite exits 0 cleanly and the new 30-column schema contract is in place before any production code is touched
**Depends on**: Phase 84
**Requirements**: TEST-01, TEST-02, CLEAN-01, CLEAN-02
**Success Criteria** (what must be TRUE):
  1. `dbt build` exits 0 with 0 ERROR and 0 FAIL (the two awkward-fit tests — iNat not_null and ecdysis_id relationships — are resolved via staging filter or singular test replacement)
  2. `data/dbt/macros/emit_feature_collection.sql` no longer uses `FORMAT CSV, DELIMITER '', QUOTE '', HEADER false`; the replacement (GDAL driver or Python post-hook) produces GeoJSON files that pass `test_dbt_diff.py`
  3. The `marts/occurrences` dbt contract declares exactly 30 columns (not 33); `specimen_inat_login`, `specimen_inat_family`, `specimen_inat_genus` are absent from the SELECT and schema.yml
  4. `src/sqlite.ts` column declarations for the 3 dropped columns are removed; `npm test` passes
  5. `test_dbt_diff.py` schema assertion is updated to assert 30 columns and still passes
**Plans**: 4 plans
Plans:
- [x] 085-01-PLAN.md — TEST-01: add WHERE id IS NOT NULL filter to stg_inat__observations + update staging/schema.yml
- [x] 085-02-PLAN.md — TEST-02: replace broken relationships test with singular SQL test joining ecdysis_id to stg_ecdysis__occurrences.id
- [x] 085-03-PLAN.md — CLEAN-01: document FORMAT CSV rationale in emit_feature_collection macro (locked decision D-03 — replacement deferred)
- [x] 085-04-PLAN.md — CLEAN-02: drop 3 columns from marts contract + SQL + sqlite.ts + diff harness docstring (30-col contract)

### Phase 86: Port Remaining Transforms
**Goal**: Every Python transform in the data pipeline (species_export.py, occurrence-links derivation, taxon-lineage enrichment, resolve_taxon_ids.py) is expressed as dbt models with declared ref()/source() dependencies, and the diff harness stays green throughout
**Depends on**: Phase 85
**Requirements**: PORT-01, PORT-02, PORT-03, PORT-04, VALIDATE-01
**Success Criteria** (what must be TRUE):
  1. `data/dbt/` contains mart models for `species.json` and species count artifacts (county_count, ecoregion_count, recency tiers); outputs are byte-comparable to current `public/data/species.json` as asserted by the diff harness
  2. Occurrence-links derivation (specimen_observation_id join + projection) is a dbt model consuming a `source()` declaration; Python scraping remains but the join/projection logic is removed from Python
  3. Taxon-lineage enrichment is expressed as dbt models; LIN-05 lineage coverage (≥0.95 ratio) is enforced via a dbt test that passes
  4. A documented porting decision exists for `resolve_taxon_ids.py`: either a dbt model exists and the Python file is deleted, or an ingestion-boundary document explains why it stays in Python
  5. `test_dbt_diff.py` continues to pass against `public/data/` outputs throughout this phase (VALIDATE-01 constraint: dbt models produce identical outputs to the current Python pipeline)
**Plans**: 5 plans
Plans:
- [ ] 086-01-PLAN.md — VALIDATE-01: extend test_dbt_diff.py with 5 SKIP-guarded species artifact diff tests (Wave 0)
- [ ] 086-02-PLAN.md — PORT-03: add canonical_to_taxon_id + taxon_lineage_extended + checklist_data sources, 3 staging views, LIN-05 singular test
- [ ] 086-03-PLAN.md — PORT-02 + PORT-04: ingestion-boundary.md decision record (load_links + resolve_taxon_ids stay in Python; consumed via source())
- [ ] 086-04-PLAN.md — PORT-01 (parquet half): int_species_occurrences_agg + int_species_geo_agg + int_species_universe + marts/species (18-col contract)
- [ ] 086-05-PLAN.md — PORT-01 (JSON half): rewrite species_export.py to read dbt mart, add slug via feeds._slugify, emit species.json + seasonality.json byte-comparable

### Phase 87: Incremental Materialization Experiment
**Goal**: The question of whether `materialized='incremental'` works with dbt-duckdb external materializations is answered with observed evidence, documented to inform the nightly.sh cutover decision
**Depends on**: Phase 86
**Requirements**: TEST-03
**Success Criteria** (what must be TRUE):
  1. At least one model in the dbt project is configured with `materialized='incremental'` and `dbt build` is run twice; the second run's behavior (full rebuild vs. incremental diff) is observed and recorded
  2. A written finding documents: does incremental work with external materializations? does it measurably speed up nightly builds? what is the wall-clock comparison?
  3. A clear recommendation is recorded for Phase 88: either "nightly.sh should use incremental" with the selector command, or "full rebuilds are the right approach because [reason]"
**Plans**: TBD

### Phase 88: Production Cutover
**Goal**: `dbt build` is the sole producer of all pipeline outputs; legacy Python transform code, `_apply_migrations()`, and `validate-schema.mjs` are retired; nightly.sh runs dbt and interprets exit codes correctly; the frontend loads dbt-produced occurrences.parquet without code changes
**Depends on**: Phase 87
**Requirements**: CUTOVER-01, CUTOVER-02, CUTOVER-03, CUTOVER-04, VALIDATE-02
**Success Criteria** (what must be TRUE):
  1. `data/run.py` invokes `bash data/dbt/run.sh build` (or equivalent); `data/export.py` and `data/species_export.py` are no longer called in the transform path; `data/run.py` exits non-zero on dbt failure with a meaningful error message
  2. `_apply_migrations()` is deleted from `data/run.py`; a written mapping documents each migration invariant and its dbt replacement (contract column, generic test, or singular test)
  3. `scripts/validate-schema.mjs` is deleted; the `validate-schema` npm script is removed from `package.json`; the GitHub Actions workflow no longer references it; `npm run build` succeeds
  4. `data/nightly.sh` invokes `dbt build` (with `--exclude` for any remaining documented awkward-fits) and exits non-zero only on true failures, not on documented/excluded test anomalies
  5. End-to-end smoke check after cutover: `npm run dev`, map renders, filters work, table populates, species page works — all with `occurrences.parquet` produced entirely by dbt (30-column schema, no frontend code changes)
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
| 57. Sidebar Display | v2.5 | 2/2 | Complete   | 2026-04-16 |
| 58. Elevation Filter | v2.5 | 2/2 | Complete    | 2026-04-16 |
| 59. Benchmark Baseline | v2.6 | 1/1 | Complete | 2026-04-16 |
| 60. wa-sqlite Integration | v2.6 | 3/3 | Complete | 2026-04-17 |
| 61. DuckDB Removal | v2.6 | 1/1 | Complete | 2026-04-17 |
| 62. Pipeline Join | v2.7 | 2/2 | Complete    | 2026-04-17 |
| 63. SQLite Data Layer | v2.7 | 2/2 | Complete    | 2026-04-17 |
| 64. OccurrenceSource | v2.7 | 2/2 | Complete    | 2026-04-17 |
| 65. UI Unification | v2.7 | 2/2 | Complete    | 2026-04-17 |
| 66. Provisional Rows in Pipeline | v2.8 | 5/5 | Complete | 2026-04-20 |
| 67. Provisional Row Display in Sidebar | v2.8 | 2/2 | Complete | 2026-04-20 |
| 68. Filter Panel Redesign | v2.9 | 3/3 | Complete | 2026-04-20 |
| 69. Table Drawer | v2.9 | 2/2 | Complete | 2026-04-20 |
| 70. Map Overlay Sidebar | v2.9 | 1/1 | Complete | 2026-04-21 |
| 71. Base Map and Occurrence Layer | v3.0 | 3/3 | Complete | 2026-04-27 |
| 72. Boundaries and Interaction | v3.0 | 2/2 | Complete | 2026-04-27 |
| 73. OL Removal and Verification | v3.0 | 2/2 | Complete | 2026-04-27 |
| 74. Eleventy Outer Build Integration | v3.1 | 3/3 | Complete | 2026-04-30 |
| 75. Authoring Scaffold and Verification | v3.1 | 2/2 | Complete | 2026-04-30 |
| 76. Data Foundation | v3.2 | 6/6 | Complete | 2026-05-02 |
| 77. Lineage Coverage Expansion | v3.2 | 3/3 | Complete | 2026-05-03 |
| 78. Pipeline Outputs | v3.2 | 4/4 | Complete | 2026-05-04 |
| 79. Photo Manifest | v3.2 | 3/3 | Complete | 2026-05-04 |
| 80. Page Scaffolding | v3.2 | 4/4 | Complete | 2026-05-04 |
| 81. Filter UX & Nav | v3.2 | 6/6 | Complete | 2026-05-05 |
| 82. Hardening | v3.2 | 8/8 | Complete | 2026-05-05 |
| 83. Scaffold & Slice Port | v3.3 | 4/4 | Complete | 2026-05-12 |
| 84. Tests, Diff & Findings | v3.3 | 3/3 | Complete | 2026-05-13 |
| 85. Pre-Cutover Groundwork | v3.4 | 0/4 | Not started | - |
| 86. Port Remaining Transforms | v3.4 | 0/5 | Not started | - |
| 87. Incremental Materialization Experiment | v3.4 | 0/TBD | Not started | - |
| 88. Production Cutover | v3.4 | 0/TBD | Not started | - |
