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

### v1.8 DuckDB WASM Frontend (In Progress)

**Milestone Goal:** Replace hyparquet + JS FilterState with DuckDB WASM as the frontend data layer; all parquet reads and filter queries executed via SQL in-browser.

- [x] **Phase 30: DuckDB WASM Setup** — Initialize DuckDB WASM singleton; load ecdysis.parquet, samples.parquet, counties.geojson, and ecoregions.geojson into in-memory DuckDB tables (completed 2026-03-31)
- [x] **Phase 31: Feature Creation from DuckDB** — Replace ParquetSource/SampleParquetSource (hyparquet) with DuckDB query → OL Feature creation; remove hyparquet dependency (completed 2026-03-31)
- [x] **Phase 32: SQL Filter Layer** — Replace FilterState + matchesFilter() with SQL predicate builder; DuckDB query returns Set&lt;featureId&gt; used by OL style callbacks (completed 2026-03-31)

### Phase 30: DuckDB WASM Setup
**Goal**: DuckDB WASM initializes on page load with all data loaded; ecdysis.parquet, samples.parquet, counties.geojson, and ecoregions.geojson are available as queryable DuckDB tables before the map renders
**Depends on**: Phase 29
**Requirements**: DUCK-01, DUCK-02, DUCK-03, DUCK-04
**Success Criteria** (what must be TRUE):
  1. `SELECT COUNT(*) FROM ecdysis` returns > 45000 rows in browser console
  2. `SELECT COUNT(*) FROM samples` returns > 9000 rows
  3. `SELECT COUNT(*) FROM counties` and `SELECT COUNT(*) FROM ecoregions` return non-zero row counts
  4. Map loading overlay appears during DuckDB init and disappears when all tables are ready; error overlay appears on fetch failure
  5. DuckDB WASM bundle loads without COOP/COEP errors in Chrome/Firefox devtools (or headers are correctly set)
**Plans**: 1 plan
Plans:
- [x] 30-01-PLAN.md — DuckDB WASM singleton, parquet scan, GeoJSON load, spatial extension (DUCK-01, DUCK-02, DUCK-03, DUCK-04)

### Phase 31: Feature Creation from DuckDB
**Goal**: OL map features (specimens and samples) are created from DuckDB query results; hyparquet is removed and ParquetSource/SampleParquetSource are replaced
**Depends on**: Phase 30
**Requirements**: FEAT-01, FEAT-02, FEAT-03
**Success Criteria** (what must be TRUE):
  1. `parquet.ts` no longer imports from `hyparquet`; `hyparquet` removed from `package.json`
  2. Ecdysis specimen features appear on map with correct clustering behavior identical to pre-migration
  3. iNat sample features appear on map with correct dot rendering and click behavior identical to pre-migration
  4. `npm run build` exits 0 with no TypeScript errors
  5. Sidebar click on specimen/sample shows correct details (species, collector, date, iNat link)
**Plans**: 1 plan
Plans:
- [x] 31-01-PLAN.md — Replace ParquetSource/SampleParquetSource with DuckDB SELECT → OL Feature creation; remove hyparquet (FEAT-01, FEAT-02, FEAT-03)

### Phase 32: SQL Filter Layer
**Goal**: All filter types (taxon, year, month, county, ecoregion) execute as SQL WHERE clauses against DuckDB; OL style callbacks use a Set of visible feature IDs in place of matchesFilter(); all existing filter behaviors preserved
**Depends on**: Phase 31
**Requirements**: FILT-01, FILT-02, FILT-03, FILT-04, FILT-05, FILT-06, FILT-07
**Success Criteria** (what must be TRUE):
  1. `filter.ts` no longer contains `matchesFilter()` function; OL style callbacks call `visibleIds.has(featureId)` pattern
  2. Taxon filter (family/genus/species), year range, month, county, and ecoregion filters each produce SQL WHERE clauses visible in devtools console logs
  3. URL round-trip: paste URL with all filter params → correct filter state restored and map shows same visible features
  4. "Clear filters" resets all SQL predicates and all features become visible
  5. Boundary polygon highlight (blue fill for selected county/ecoregion) still works
  6. Taxon, county, and ecoregion autocomplete dropdowns still populate correctly
**Plans**: 2 plans
Plans:
- [x] 32-01-PLAN.md — SQL predicate builder, visibleIds query, style callback rewire (FILT-01, FILT-02, FILT-03, FILT-04, FILT-05, FILT-06)
- [x] 32-02-PLAN.md — bee-map.ts async filter handler, URL round-trip, browser smoke test (FILT-06, FILT-07)

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
| 32. SQL Filter Layer | v1.8 | 2/2 | Complete    | 2026-04-01 |
