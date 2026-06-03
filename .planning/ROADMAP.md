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
- ✅ **v3.4 dbt Full Rewrite** — Phases 85–88 (shipped 2026-05-14). dbt is the sole producer of pipeline outputs; legacy Python transforms and validate-schema.mjs retired. See [.planning/milestones/v3.4-ROADMAP.md](milestones/v3.4-ROADMAP.md).
- ✅ **v3.5 Selection Rectangle** — Phases 89–91 (shipped 2026-05-15)
- ✅ **v3.6 Simpler Species Index** — Phases 92–96 (shipped 2026-05-16)
- ✅ **v3.7 Places** — Phases 97–100.1 (shipped 2026-05-18)
- ✅ **v3.8 Conceptual Tidying** — Phases 101–104 (shipped 2026-05-19)
- ✅ **v3.9 Sidebar & Table Unification** — Phases 105–109 (shipped 2026-05-20)
- ✅ **v4.0 Washington Checklist Records** — Phases 110–113 (shipped 2026-05-25)
- ✅ **v4.1 Validation & Code Quality** — Phases 114–116 (shipped 2026-05-25)
- ✅ **v4.2 iNaturalist Expert Observations** — Phases 117–120 (shipped 2026-05-26)
- ✅ **v4.3 Loading Performance** — Phases 121–122 (shipped 2026-05-28)
- ✅ **v4.4 Pipeline Data Quality** — Phase 123 (shipped 2026-05-29)
- ✅ **v4.5 iNat Taxonomy & Species Completeness** — Phases 124–128 (shipped 2026-06-01). taxon_id surfaced through the dbt marts + genus-rank backfill (kingdom=Animalia); re-scoped TID-02. See [.planning/milestones/v4.5-ROADMAP.md](milestones/v4.5-ROADMAP.md).
- [ ] **v4.6 Taxonomy Hierarchy & Normalization** — Phases 129–133 (in progress 2026-06-01). Replacing denormalized rank columns with taxon_id hierarchy; descendant-by-any-rank filtering; browse tree; subfamily pages.

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

See `.planning/milestones/v2.0-ROADMAP.md` for full phase details.

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
<summary>✅ v3.4 dbt Full Rewrite (Phases 85–88) — SHIPPED 2026-05-14</summary>

**Milestone Goal:** Cut over the BeeAtlas data pipeline from `data/export.py` + ad-hoc Python transforms to `data/dbt/` as the canonical producer of `occurrences.parquet`, `counties.geojson`, `ecoregions.geojson`, `species.json`, and species count artifacts. After v3.4, `dbt build` is the only way these outputs are produced.

**Outcome:** All 15 requirements satisfied; `_apply_migrations()` and `scripts/validate-schema.mjs` retired (invariants moved to dbt source contracts and tests); incremental materialization experimented and rejected (087-FINDINGS — keep full rebuilds); end-to-end frontend smoke approved against dbt-produced parquet with no frontend code changes beyond the documented 3-column drop in `src/sqlite.ts`.

- [x] Phase 85: Pre-Cutover Groundwork (4/4 plans) — completed 2026-05-13
- [x] Phase 86: Port Remaining Transforms (5/5 plans) — completed 2026-05-13
- [x] Phase 87: Incremental Materialization Experiment (2/2 plans) — completed 2026-05-13
- [x] Phase 88: Production Cutover (3/3 plans) — completed 2026-05-14

See `.planning/milestones/v3.4-ROADMAP.md` for full phase details.

</details>

<details>
<summary>✅ v3.5 Selection Rectangle (Phases 89–91) — SHIPPED 2026-05-15</summary>

- [x] Phase 89: Rectangle Drawing (1/1 plans) — completed 2026-05-15
- [x] Phase 90: Occurrence Query & Sidebar (1/1 plans) — completed 2026-05-15
- [x] Phase 91: URL State (2/2 plans) — completed 2026-05-15

See `.planning/milestones/v3.5-ROADMAP.md` for full phase details.

</details>

<details>
<summary>✅ v3.6 Simpler Species Index (Phases 92–96) — SHIPPED 2026-05-16</summary>

- [x] Phase 92: Slug Migration & Pipeline Prep (3/3 plans) — completed 2026-05-15
- [x] Phase 93: Multi-Color SVG Map Generation (2/2 plans) — completed 2026-05-16
- [x] Phase 94: Species & Genus Pages (3/3 plans) — completed 2026-05-16
- [x] Phase 95: Subgenus & Tribe Pages (2/2 plans) — completed 2026-05-16
- [x] Phase 96: Index Page Replacement (3/3 plans) — completed 2026-05-16

See `.planning/milestones/v3.6-ROADMAP.md` for full phase details.

</details>

<details>
<summary>✅ v3.7 Places (Phases 97–100.1) — SHIPPED 2026-05-18</summary>

- [x] Phase 97: Place Data Model (2/2 plans) — completed 2026-05-18
- [x] Phase 98: Pipeline Integration (3/3 plans) — completed 2026-05-18
- [x] Phase 99: Place Static Pages (2/2 plans) — completed 2026-05-18
- [x] Phase 100: Map & Filter Integration (3/3 plans) — completed 2026-05-18
- [x] Phase 100.1: Close v3.7 Gaps (INSERTED, 1/1 plan) — completed 2026-05-18

See `.planning/milestones/v3.7-ROADMAP.md` for full phase details.

</details>

<!-- Phase 97-100.1 details archived to .planning/milestones/v3.7-ROADMAP.md -->

<details>
<summary>✅ v3.8 Conceptual Tidying (Phases 101–104) — SHIPPED 2026-05-19</summary>

- [x] Phase 101: TypeScript Occurrence Domain Module (2/2 plans) — completed 2026-05-19
- [x] Phase 102: Python Slug Module & Dead Constant (1/1 plans) — completed 2026-05-19
- [x] Phase 103: dbt iNat Field ID Constants & Plantae Macro (1/1 plans) — completed 2026-05-19
- [x] Phase 104: Semantic Reconciliation (1/1 plans) — completed 2026-05-19

See `.planning/milestones/v3.8-ROADMAP.md` for full phase details.

</details>

<!-- Phase 101-104 details archived to .planning/milestones/v3.8-ROADMAP.md -->

<details>
<summary>✅ v3.9 Sidebar & Table Unification (Phases 105–109) — SHIPPED 2026-05-20</summary>

- [x] Phase 105: URL State Migration (1/1 plans) — completed 2026-05-19
- [x] Phase 106: bee-atlas State Machine (1/1 plans) — completed 2026-05-19
- [x] Phase 107: Create bee-pane Component (2/2 plans) — completed 2026-05-19
- [x] Phase 108: bee-atlas Cutover & Map Resize (2/2 plans) — completed 2026-05-20
- [x] Phase 109: BeePane v2 — Unified Occurrence View (6/6 plans) — completed 2026-05-20

See `.planning/milestones/v3.9-ROADMAP.md` for full phase details.

</details>

<!-- Phase 105-109 details archived to .planning/milestones/v3.9-ROADMAP.md -->

<details>
<summary>✅ v4.0 Washington Checklist Records (Phases 110–113) — SHIPPED 2026-05-25</summary>

- [x] Phase 110: Offline Taxonomy (3/3 plans) — completed 2026-05-24
- [x] Phase 111: Checklist Pipeline (2/2 plans) — completed 2026-05-24
- [x] Phase 112: Checklist Map Layer (3/3 plans) — completed 2026-05-25
- [x] Phase 113: Species Page Expansion (5/5 plans) — completed 2026-05-25

See `.planning/milestones/v4.0-ROADMAP.md` for full phase details.

</details>

<!-- Phase 110-113 details archived to .planning/milestones/v4.0-ROADMAP.md -->

<details>
<summary>✅ v4.1 Validation & Code Quality (Phases 114–116) — SHIPPED 2026-05-25</summary>

- [x] Phase 114: v3.5 Nyquist Validation (4/4 plans) — completed 2026-05-25
- [x] Phase 115: v3.7 and v4.0 Nyquist Validation (5/5 plans) — completed 2026-05-25
- [x] Phase 116: Code Quality Fixes (3/3 plans) — completed 2026-05-25

See `.planning/milestones/v4.1-ROADMAP.md` for full phase details.

</details>

<!-- Phase 114-116 details archived to .planning/milestones/v4.1-ROADMAP.md -->

<details>
<summary>✅ v4.2 iNaturalist Expert Observations (Phases 117–120) — SHIPPED 2026-05-26</summary>

- [x] Phase 117: iNat Obs Pipeline (2/2 plans) — completed 2026-05-26
- [x] Phase 118: Occurrence Model Extension (3/3 plans) — completed 2026-05-26
- [x] Phase 119: Map Display, Source Filter & Detail View (7/7 plans) — completed 2026-05-26
- [x] Phase 120: Species Page Source Counts & Photo List (2/2 plans) — completed 2026-05-26

See `.planning/milestones/v4.2-ROADMAP.md` for full phase details.

</details>

<!-- Phase 117-120 details archived to .planning/milestones/v4.2-ROADMAP.md -->

<details>
<summary>✅ v4.3 Loading Performance (Phases 121–122) — SHIPPED 2026-05-28</summary>

- [x] Phase 121: Prebuilt SQLite Load (3/3 plans) — completed 2026-05-27
- [x] Phase 122: Worker GeoJSON Aggregation (2/2 plans) — completed 2026-05-28

See `.planning/milestones/v4.3-ROADMAP.md` for full phase details.

</details>

<!-- Phase 121-122 details archived to .planning/milestones/v4.3-ROADMAP.md -->

<details open>
<summary>v4.6 Taxonomy Hierarchy & Normalization (Phases 129–133) — IN PROGRESS</summary>

- [ ] Phase 129: Hierarchy Foundation (3 plans)
- [ ] Phase 130: Map Filter Cutover (3 plans)
- [ ] Phase 131: Occurrence Normalization (4 plans)
- [ ] Phase 132: Page Rebuild & Subfamily Pages (TBD plans)
- [ ] Phase 133: Browse Tree (TBD plans)

See Phase Details below for success criteria.

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

<!-- Phase 85-88 details archived to .planning/milestones/v3.4-ROADMAP.md -->

<!-- Phase 89-91 details archived to .planning/milestones/v3.5-ROADMAP.md -->

<!-- Phase 92-96 details archived to .planning/milestones/v3.6-ROADMAP.md -->

<!-- Phase 101-104 details archived to .planning/milestones/v3.8-ROADMAP.md -->

<!-- Phase 105-109 details archived to .planning/milestones/v3.9-ROADMAP.md -->

### Phase 110: Offline Taxonomy

**Goal**: iNat lineage enrichment runs from a local taxa.csv.gz archive rather than live API calls; rate-limit risk eliminated
**Depends on**: Nothing (first phase of v4.0)
**Requirements**: TAX-01, TAX-02, TAX-03, TAX-04
**Success Criteria** (what must be TRUE):

  1. Running the pipeline downloads taxa.csv.gz to data/raw/ and skips re-download when ETag/Last-Modified is unchanged
  2. `taxon_lineage_extended` is produced by a DuckDB ancestry walk on taxa.csv.gz with identical schema (family, subfamily, tribe, genus, subgenus per taxon_id) — no live /v2/taxa calls
  3. `dbt build` and `npm test` pass after all live enricher functions are deleted
  4. taxa.csv.gz is synced to/from S3 by nightly.sh so it persists across pipeline runs without re-downloading from iNat Open Data on every nightly

**Plans**: 3 plans
Plans:
**Wave 1**

- [x] 110-01-PLAN.md — Create taxa_pipeline.py (downloader + DuckDB ancestry walk) with Wave 0 RED tests, then GREEN [TAX-01, TAX-02]

**Wave 2** *(blocked on Wave 1 completion)*

- [x] 110-02-PLAN.md — Cutover: delete live enrichers, rewire run.py STEPS, rewrite stg_waba__taxon_lineage (D-01) + sources.yml (D-02), delete dead tests; dbt build + npm test green [TAX-03]
- [x] 110-03-PLAN.md — Extend nightly.sh with S3 pull/push for taxa.csv.gz + taxa_cache.json sidecar [TAX-04]

### Phase 111: Checklist Pipeline

**Goal**: The Bartholomew et al. 2024 annotated checklist CSV is ingested as a first-class data source producing a verified checklist.parquet available via CloudFront
**Depends on**: Phase 110
**Requirements**: CHECK-01, CHECK-02, CHECK-03, CHECK-04, EXT-01
**Success Criteria** (what must be TRUE):

  1. Running dbt build produces checklist.parquet with all required columns: canonical_name, scientificName, genus, specific_epithet, family, lat (nullable), lon (nullable), year (nullable), month (nullable), county, ecoregion_l3, source='checklist'
  2. Pytest assertions pass: row count >= 2000, no null canonical_name, no null specific_epithet, TRIM(family) = family for all rows
  3. checklist.parquet is uploaded to S3/CloudFront as part of the nightly pipeline export and accessible at the /data/ path
  4. The source='checklist' constant distinguishes checklist rows; pipeline architecture comment documents the convention for future sources

**Plans**: 2 plans
Plans:
**Wave 1**

- [x] 111-01-PLAN.md — Wave 0 pytest assertions + checklist.sql mart + schema.yml contract + run.py copy [CHECK-01, CHECK-02, CHECK-04, EXT-01]

**Wave 2** *(blocked on Wave 1 completion)*

- [x] 111-02-PLAN.md — nightly.sh _upload_hashed + manifest.json checklist key [CHECK-03]

### Phase 112: Checklist Map Layer

**Goal**: Users can toggle a clustered-point checklist layer on the map; the layer responds to taxon, year, and month filters and persists in the URL
**Depends on**: Phase 111
**Requirements**: MAP-01, MAP-02, MAP-03, MAP-04
**Success Criteria** (what must be TRUE):

  1. A "Checklist records" toggle appears alongside the Specimens and Samples toggles in the filter panel
  2. When enabled, checklist records render as clustered points in a visually distinct style; records without coordinates are excluded from the layer
  3. Applying taxon, year, or month filters while the checklist layer is visible narrows the visible points to matching checklist records
  4. The cl=1 URL param encodes checklist layer visibility and is restored correctly on page load

**Plans**: 3 plans
Plans:
**Wave 1**

- [x] 112-01-PLAN.md — Wave 0 RED gates: new bee-map.test.ts + extensions to bee-pane.test.ts, bee-atlas.test.ts, url-state.test.ts [MAP-01, MAP-02, MAP-03, MAP-04]

**Wave 2** *(blocked on Wave 1)*

- [x] 112-02-PLAN.md — url-state UiState/cl=1 round-trip + manifest checklist key + local-manifest generator [MAP-04]

**Wave 3** *(blocked on Wave 2)*

- [x] 112-03-PLAN.md — bee-pane toggle + bee-atlas state/URL restore + bee-map county-fill layer with taxon-filtered parquet fetch; human-verify checkpoint [MAP-01, MAP-02, MAP-03, MAP-04]

**UI hint**: yes

### Phase 113: Species Page Expansion

**Goal**: All 565 checklist species have taxon pages and checklist data appears on occurrence maps and page attribution sections
**Depends on**: Phase 112
**Requirements**: SPEC-01, SPEC-02, SPEC-03, SPEC-04, SPEC-05
**Success Criteria** (what must be TRUE):

  1. All 565 checklist species appear in the species index and have dedicated pages at /species/{Genus}/{specificEpithet}/, including species with zero WABA occurrence records
  2. Checklist-only species appear on their genus and subgenus pages alongside WABA-recorded species
  3. Each species page with checklist records shows a county-presence SVG map (or augmented occurrence SVG) with checklist counties visually distinct from WABA occurrence points
  4. Species pages with checklist records display attribution: "N checklist records · Bartholomew et al. 2024"
  5. The seasonality histogram draws from all available sources; it is suppressed only when the species has zero records from any source

**Plans**: 5 plans
Plans:

**Wave 0**

- [x] 113-01-PLAN.md — Wave 0 RED tests (JS + Python) for checklist_count, onChecklist, county fills, build-output assertions [SPEC-01..SPEC-05]

**Wave 1** *(blocked on Wave 0)*

- [x] 113-02-PLAN.md — dbt checklist_month_agg CTE + merged month_histogram + checklist_count column + species_export.py SPECIES_COLUMNS/PyArrow schema [SPEC-04, SPEC-05]

**Wave 2** *(blocked on Wave 1; 03 and 04 run in parallel)*

- [x] 113-03-PLAN.md — species_maps.py: county-name-keyed loader, _write_species_svg extension, checklist.parquet read, query filter expansion [SPEC-03]
- [x] 113-04-PLAN.md — _data/species.js genusList/subgenusList checklist-only inclusion + seasonality-viz onChecklist property [SPEC-01, SPEC-02, SPEC-05]

**Wave 3** *(blocked on Wave 2)*

- [x] 113-05-PLAN.md — Nunjucks templates: species.njk badge, species-detail.njk SVG/attribution/atlas-link/onChecklist wiring, genus.njk/subgenus.njk checklist record counts; human-verify checkpoint [SPEC-01..SPEC-05]

**UI hint**: yes

<!-- Phase 114-116 details archived to .planning/milestones/v4.1-ROADMAP.md -->

<!-- Phase 117-120 details archived to .planning/milestones/v4.2-ROADMAP.md -->

<!-- Phase 121 details archived to .planning/milestones/v4.3-ROADMAP.md -->

### Phase 130: Map Filter Cutover

**Goal**: The frontend stops filtering occurrences on denormalized taxon string columns and switches to `taxon_id` + hierarchy descendant queries against the `taxa` table; the taxon autocomplete gains subfamily/tribe/subgenus/complex (+subtribe); URL round-trip, clear-filters, region/boundary, and selection-rectangle interactions are preserved; detail cards resolve taxon names from the cache by `taxon_id`. Additive phase — denormalized string columns remain present and ignored (dropped in Phase 131).
**Depends on**: Phase 129
**Requirements**: MFILT-01, MFILT-02, MFILT-03
**Success Criteria** (what must be TRUE):

  1. Filtering by any taxon at family/subfamily/tribe/genus/subgenus/complex/species rank returns all descendant occurrences via `taxon_id` + `lineage_path` descendant queries (not string-column matching)
  2. The autocomplete includes subfamily/tribe/subgenus/complex (+subtribe), excludes bycatch, labels per D-03, orders broader-first per D-05; selecting an entry resolves to an integer `taxon_id`; `taxon=` URL param encodes the integer id with legacy `taxon=<name>&taxonRank=<rank>` back-compat
  3. Detail cards resolve names from the taxon cache by `taxon_id`; `taxon_id IS NULL` shows "No determination", never blank/undefined; clear-filters, region/boundary, and selection-rectangle round-trip unchanged

**Plans**: 3 plans
Plans:
**Wave 1**

- [x] 130-01-PLAN.md — filter.ts contract: taxonId FilterState/TaxonOption/FilterChangedEvent + descendant buildFilterSQL clause + taxon_id in OCCURRENCE_COLUMNS + test-helper updates [MFILT-01, MFILT-03]

**Wave 2** *(blocked on Wave 1)*

- [x] 130-02-PLAN.md — lazy taxon cache + D-01 ancestry-expansion enumeration + D-03 labels + D-05 ordering (bee-atlas, bee-filter-controls) + integer taxon= URL encode/decode with legacy back-compat (url-state) [MFILT-01, MFILT-02, MFILT-03]

**Wave 3** *(blocked on Wave 2)*

- [x] 130-03-PLAN.md — detail-card name resolution from taxon cache by taxon_id with No-determination fallback; taxonCache prop threaded bee-atlas → bee-pane → bee-occurrence-detail [MFILT-03]


## Progress

| Phase | Milestone | Plans Complete | Status | Completed |
|-------|-----------|----------------|--------|-----------|
| 1. Pipeline | v1.0 | 1/1 | Complete | 2026-02-18 |
| 2. Infrastructure | v1.0 | 2/2 | Complete | 2026-02-18 |
| 3. Core Map | v1.0 | 3/3 | Complete   | 2026-05-25 |
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
| 85. Pre-Cutover Groundwork | v3.4 | 4/4 | Complete | 2026-05-13 |
| 86. Port Remaining Transforms | v3.4 | 5/5 | Complete | 2026-05-13 |
| 87. Incremental Materialization Experiment | v3.4 | 2/2 | Complete | 2026-05-13 |
| 88. Production Cutover | v3.4 | 3/3 | Complete | 2026-05-14 |
| 89. Rectangle Drawing | v3.5 | 1/1 | Complete    | 2026-05-15 |
| 90. Occurrence Query & Sidebar | v3.5 | 1/1 | Complete    | 2026-05-15 |
| 91. URL State | v3.5 | 2/2 | Complete    | 2026-05-15 |
| 92. Slug Migration & Pipeline Prep | v3.6 | 3/3 | Complete    | 2026-05-15 |
| 93. Multi-Color SVG Map Generation | v3.6 | 2/2 | Complete    | 2026-05-16 |
| 94. Species & Genus Pages | v3.6 | 3/3 | Complete    | 2026-05-16 |
| 95. Subgenus & Tribe Pages | v3.6 | 2/2 | Complete    | 2026-05-16 |
| 96. Index Page Replacement | v3.6 | 3/3 | Complete    | 2026-05-16 |
| 97. Place Data Model | v3.7 | 2/2 | Complete   | 2026-05-18 |
| 98. Pipeline Integration | v3.7 | 3/3 | Complete   | 2026-05-18 |
| 99. Place Static Pages | v3.7 | 2/2 | Complete   | 2026-05-18 |
| 100. Map & Filter Integration | v3.7 | 3/3 | Complete | 2026-05-18 |
| 100.1. Close v3.7 Gaps (INSERTED) | v3.7 | 1/1 | Complete | 2026-05-18 |
| 101. TypeScript Occurrence Domain Module | v3.8 | 2/2 | Complete   | 2026-05-19 |
| 102. Python Slug Module & Dead Constant | v3.8 | 1/1 | Complete   | 2026-05-19 |
| 103. dbt iNat Field ID Constants & Plantae Macro | v3.8 | 1/1 | Complete   | 2026-05-19 |
| 104. Semantic Reconciliation | v3.8 | 1/1 | Complete   | 2026-05-19 |
| 105. URL State Migration | v3.9 | 1/1 | Complete | 2026-05-19 |
| 106. bee-atlas State Machine | v3.9 | 1/1 | Complete   | 2026-05-19 |
| 107. Create bee-pane Component | v3.9 | 2/2 | Complete   | 2026-05-19 |
| 108. bee-atlas Cutover & Map Resize | v3.9 | 2/2 | Complete   | 2026-05-20 |
| 109. BeePane v2 — Unified Occurrence View | v3.9 | 6/6 | Complete   | 2026-05-20 |
| 110. Offline Taxonomy | v4.0 | 3/3 | Complete    | 2026-05-24 |
| 111. Checklist Pipeline | v4.0 | 2/2 | Complete    | 2026-05-24 |
| 112. Checklist Map Layer | v4.0 | 3/3 | Complete    | 2026-05-25 |
| 113. Species Page Expansion | v4.0 | 5/5 | Complete   | 2026-05-25 |
| 114. v3.5 Nyquist Validation | v4.1 | 4/4 | Complete   | 2026-05-25 |
| 115. v3.7 and v4.0 Nyquist Validation | v4.1 | 5/5 | Complete   | 2026-05-25 |
| 116. Code Quality Fixes | v4.1 | 3/3 | Complete    | 2026-05-25 |
| 117. iNat Obs Pipeline | v4.2 | 2/2 | Complete | 2026-05-26 |
| 118. Occurrence Model Extension | v4.2 | 3/3 | Complete | 2026-05-26 |
| 119. Map Display, Source Filter & Detail View | v4.2 | 7/7 | Complete | 2026-05-26 |
| 120. Species Page Source Counts & Photo List | v4.2 | 2/2 | Complete | 2026-05-26 |
| 121. Prebuilt SQLite Load | v4.3 | 3/3 | Complete | 2026-05-27 |
| 122. Worker GeoJSON Aggregation | v4.3 | 2/2 | Complete   | 2026-05-28 |
| 123. dbt-Layer Occurrence Synonymy | v4.4 | 2/2 | Complete   | 2026-05-29 |
| 124. Pre-Work & Contract Cleanup | v4.5 | 1/1 | Complete   | 2026-05-30 |
| 125. Species Visibility | v4.5 | 1/1 | Complete   | 2026-05-30 |
| 126. Taxon IDs | v4.5 | 3/3 | Complete    | 2026-05-31 |
| 127. Inactive Taxon Remapping | v4.5 | 2/2 | Complete    | 2026-06-01 |
| 128. Occurrence Finest-Rank Taxon Backfill | v4.5 | 1/1 | Complete | 2026-06-01 |

<!-- Phase 122 details archived to .planning/milestones/v4.3-ROADMAP.md -->

### Phase 123: dbt-Layer Occurrence Synonymy

**Goal**: Occurrence synonymy is applied uniformly across all data sources at dbt build time, not at ingestion; updating `occurrence_synonyms.csv` requires only a dbt rebuild to propagate to all artifacts
**Depends on**: Phase 122
**Requirements**: SYN-01, SYN-02, SYN-03
**Success Criteria** (what must be TRUE):

  1. `apply_synonym()` is no longer called in `checklist_pipeline.py` or `inat_obs_pipeline.py`; raw `canonical_name` columns in `ecdysis_data.occurrences` and `inat_obs_data.observations` store only `normalize_scientific_name()` output, not synonymized names
  2. `occurrence_synonyms.csv` is loaded into DuckDB as a reference table and consumed via LEFT JOIN in dbt staging so synonymy is applied identically to all occurrence sources (ecdysis, inat_obs, waba)
  3. Adding a new entry to `occurrence_synonyms.csv` and running `bash data/dbt/run.sh build` produces updated parquet artifacts with the new mapping — no pipeline re-ingestion required
  4. All existing pytest tests pass; the Agapostemon texanus → subtilior mapping continues to appear correctly in `occurrences.parquet`

**Plans:** 2/2 plans complete
Plans:
**Wave 1**

- [x] 123-01-PLAN.md — Move occurrence_synonyms.csv into data/dbt/seeds/; update OCCURRENCE_SYNONYMS_PATH; remove apply_synonym() callsites from inat_obs_pipeline.py and checklist_pipeline.py [SYN-01]

**Wave 2** *(blocked on Wave 1)*

- [x] 123-02-PLAN.md — Add synonyms LEFT JOIN in int_combined.sql (ARM 1 + ARM 3) and int_species_universe.inat_obs_count_agg; new test_dbt_synonymy.py asserting Agapostemon texanus → subtilior in occurrences.parquet [SYN-02, SYN-03]

<!-- ✅ v4.5 iNat Taxonomy & Species Completeness (Phases 124–128) — SHIPPED 2026-06-01.
     Full phase details archived to .planning/milestones/v4.5-ROADMAP.md -->

## v4.6 Taxonomy Hierarchy & Normalization (Phases 129–133)

### Summary Checklist

- [x] **Phase 129: Hierarchy Foundation** — Build `taxon_hierarchy` + `taxon_closure` tables in `occurrences.db`; benchmark structure; establish `is_anthophila` flag and bycatch coverage; post-build orphan assertion (completed 2026-06-02)
- [x] **Phase 130: Map Filter Cutover** — Frontend switches to `taxon_id` + hierarchy descendant filtering; autocomplete extended to subfamily/tribe/subgenus/complex; URL round-trip preserved; denormalized string columns still present and harmlessly ignored (completed 2026-06-02)
- [x] **Phase 131: Occurrence Normalization** — Drop denormalized rank columns from occurrences mart now that the frontend no longer reads them; rewrite `geo_blob`; rewrite dbt contract; record DB-size and transfer-weight reduction (completed 2026-06-03)
- [x] **Phase 132: Page Rebuild & Subfamily Pages** — Recompute genus/subgenus/tribe page rollups from hierarchy; generate new subfamily pages; slug collision check run (completed 2026-06-03)
- [ ] **Phase 133: Browse Tree** — Expandable `/species` taxonomy tree, bee-only, with per-node specimen/observation counts and type-to-filter search

### Phase Details

### Phase 129: Hierarchy Foundation

**Goal**: A complete, query-ready taxon hierarchy (bees + bycatch) lives inside `occurrences.db`, benchmarked for wa-sqlite descendant-query performance, with every occurrence `taxon_id` provably mapped to a hierarchy entry
**Depends on**: Phase 128
**Requirements**: HIER-01, HIER-02, HIER-03, HIER-04, HIER-05, HIER-06
**Success Criteria** (what must be TRUE):
  1. `occurrences.db` contains `taxon_hierarchy` and `taxon_closure` tables covering every `taxon_id` referenced by the occurrences table (bees and non-bee bycatch); a post-build assertion confirms zero orphan `taxon_id` values
  2. A descendant query for Apidae (the largest bee family, ~4000 species) returns the correct set of `taxon_id` values and completes in under 50 ms in wa-sqlite/Firefox — structure choice (nested sets vs. closure table) documented and justified by this benchmark
  3. Every non-bee bycatch genus present in occurrences has an entry in `taxon_hierarchy` with `is_anthophila = 0`; bycatch taxa never appear in any bee-only surface (verified by query)
  4. A pipeline run after a `taxa.csv.gz` update detects any occurrence `taxon_id` that no longer has a hierarchy entry and fails the nightly gate before export
  5. The foundation phase report records the count of complex-rank occurrences/species and documents the decision on whether dedicated complex pages (PAGE-05) are generated this milestone
**Plans**: 3 plans
Plans:
**Wave 0**
- [x] 129-01-PLAN.md — Wave 0 RED hierarchy test stubs + mini taxa.csv.gz/parquet fixtures [HIER-01..06]

**Wave 1** *(blocked on Wave 0)*
- [x] 129-02-PLAN.md — _build_taxon_hierarchy three-pass load (Anthophila/bycatch/checklist) + orphan-assertion nightly gate + generate_sqlite wiring [HIER-01, HIER-02, HIER-04, HIER-05]

**Wave 2** *(blocked on Wave 1; human-verify checkpoint)*
- [x] 129-03-PLAN.md — Build real occurrences.db, Apidae wa-sqlite/Firefox benchmark + structure decision, complex/bycatch counts + PAGE-05 decision in VERIFICATION.md [HIER-03, HIER-06]

### Phase 130: Map Filter Cutover

**Goal**: The frontend reads `taxon_id` + hierarchy descendant queries for all taxon filtering; the autocomplete includes subfamily, tribe, subgenus, and complex; denormalized string columns are still present in the pipeline output and harmlessly ignored during this additive phase
**Depends on**: Phase 129
**Requirements**: MFILT-01, MFILT-02, MFILT-03
**Success Criteria** (what must be TRUE):
  1. User can select any taxon at family / subfamily / tribe / genus / subgenus / complex / species rank from the autocomplete and see exactly the map points that are descendants of that taxon — including ranks (subfamily, tribe, subgenus) that were previously absent
  2. Filter URL round-trip (`taxon=` param now encodes an integer `taxon_id`), clear-filters, region/boundary filtering, and selection-rectangle interactions all work correctly; old name-format URLs are parsed with a backward-compatible fallback
  3. Occurrence detail cards resolve and display taxon names correctly from the hierarchy cache; no "undefined" or blank taxon name for any identified occurrence
**Plans**: TBD
**UI hint**: yes

### Phase 131: Occurrence Normalization

**Goal**: Denormalized rank string columns are dropped from the occurrences mart and `geo_blob` is rewritten; this is safe now that the frontend (Phase 130) no longer reads the removed columns; a measurable DB-size and transfer-weight reduction is recorded
**Depends on**: Phase 130
**Requirements**: NORM-01, NORM-02, NORM-03
**Success Criteria** (what must be TRUE):
  1. `occurrences.parquet` and `occurrences.db` no longer contain `genus`, `family`, `scientificName`, `specimen_inat_taxon_name`, `specimen_inat_genus`, or `specimen_inat_family` columns; `canonical_name` is retained; the rewritten dbt column contract is enforced at every `dbt build` and `dbt build` exits 0
  2. `occurrences.db` file size and transfer weight are measurably smaller than the pre-change baseline captured before Phase 131; the reduction is recorded in VERIFICATION.md; `tablesReady` timing does not regress from the v4.3 baseline of ~250 ms
  3. Every downstream consumer of the dropped columns (dbt schema.yml, `features.ts` geo_blob positional indexes, `bee-atlas.ts` inline SQL, `bee-map.ts` checklist filter, `filter.test.ts` assertions) is audited and migrated in the same change; a grep audit report confirms no remaining references to the removed column names
**Plans**: 4 plans
Plans:
**Wave 0**
- [x] 131-01-PLAN.md — RED test scaffolds: build-geojson 7-field rewrite, filter.test JOIN/display_name + slimmer OCCURRENCE_COLUMNS, bee-table fixtures [NORM-01, NORM-02, NORM-03]

**Wave 1** *(blocked on Wave 0)*
- [x] 131-02-PLAN.md — NORM-03 query+display: LEFT JOIN taxa display_name in queryTablePage/queryListPage/queryAllFiltered; drop 4 cols from OccurrenceRow/OCCURRENCE_COLUMNS; bee-table + bee-occurrence-detail on display_name [NORM-03]

**Wave 2** *(blocked on Wave 1)*
- [x] 131-03-PLAN.md — NORM-01/02 data layer: dbt mart+contract 37→33, dead intermediate cols, 7-field geo_blob (sqlite_export.py + features.ts coupled), D-01/D-06 dead-path deletion [NORM-01, NORM-02, NORM-03]

**Wave 3** *(blocked on Wave 2)*
- [x] 131-04-PLAN.md — NORM-02 measurement: before/after occurrences.db size + gzip weight + tablesReady in VERIFICATION.md; grep audit; human-verify phase gate [NORM-02]

### Phase 132: Page Rebuild & Subfamily Pages

**Goal**: All taxon static pages (genus, subgenus, tribe, and new subfamily) compute occurrence totals from the hierarchy; new subfamily pages are live at `/species/subfamily/{Name}/`; no slug collisions exist
**Depends on**: Phase 129
**Requirements**: PAGE-01, PAGE-02, PAGE-03, PAGE-04
**Success Criteria** (what must be TRUE):
  1. Genus, subgenus, and tribe page "N specimens · N community observations" totals match the pre-normalization values (verified by spot-checking at least 5 taxa spanning multiple families); the totals derive from hierarchy-keyed rollups, not string-column grouping
  2. Subfamily pages exist at `/species/subfamily/{SubfamilyName}/` for all bee subfamilies present in the hierarchy; each page shows an SVG occurrence map and specimen/observation counts consistent with the existing genus/tribe page format
  3. A pre-generation collision check confirms no two taxa at different ranks produce the same public URL; any same-named taxa (e.g., genus *Bombus* vs. subgenus *Bombus*) resolve to distinct paths
  4. Checklist-only bee species remain present on all taxon pages with their existing "checklist only" badge; pages keyed on `taxon_id` internally, public slugs stay name-based
**Plans**: 4 plans (3 waves)
- [x] 132-01-PLAN.md — NEW dbt staging view + `higher_taxa` rollup mart + enforced contract + baseline tests (wave 1)
- [x] 132-02-PLAN.md — Python export rewire: `_build_higher_taxa`, retire `higher_rank_taxon_ids`, slug-collision hard-fail gate, nightly/fetch/manifest wiring (wave 2)
- [x] 132-03-PLAN.md — `species_maps.py` subfamily group-map pass (color-by-genus) → 12 subfamily SVGs (wave 2)
- [x] 132-04-PLAN.md — Eleventy: `species.js` rollup rewire + `subfamilyList`; new `subfamily.njk` (nested/flat); rebuilt genus/tribe/subgenus totals + human-verify (wave 3)
**UI hint**: yes

### Phase 133: Browse Tree

**Goal**: `/species` presents an expandable bee-only taxonomy tree with per-node counts and type-to-filter search, replacing the flat family→genus index at the same URL
**Depends on**: Phase 130, Phase 132
**Requirements**: TREE-01, TREE-02, TREE-03, TREE-04
**Success Criteria** (what must be TRUE):
  1. `/species` renders an expandable tree defaulting to family → genus → species; clicking a family node expands it; subfamily, tribe, and subgenus are available as lazy deeper expansions without being forced into the default view
  2. Each tree node shows a specimen count and community-observation count, correctly rolled up over all descendants
  3. Typing in the filter input narrows the tree to matching taxon names and auto-expands the ancestor chain of each match so matches are visible without manual expansion
  4. No wasp, fly, or other non-bee taxon appears anywhere in the tree; every bee tree node links to the corresponding taxon page and/or a descendant-filtered map view
**Plans**: TBD
**UI hint**: yes

## Progress (v4.6)

| Phase | Milestone | Plans Complete | Status | Completed |
|-------|-----------|----------------|--------|-----------|
| 129. Hierarchy Foundation | v4.6 | 3/3 | Complete    | 2026-06-02 |
| 130. Map Filter Cutover | v4.6 | 3/3 | Complete    | 2026-06-02 |
| 131. Occurrence Normalization | v4.6 | 4/4 | Complete    | 2026-06-03 |
| 132. Page Rebuild & Subfamily Pages | v4.6 | 4/4 | Complete    | 2026-06-03 |
| 133. Browse Tree | v4.6 | 0/TBD | Not started | - |
