# Washington Bee Atlas

## Current Milestone: v4.0 Washington Checklist Records

**Goal:** Add the Bartholomew et al. 2024 annotated checklist as a new curated occurrence data source — pipeline ingestion, separate map layer, expanded species coverage (all 565 checklist species), and iNat taxonomy via Darwin Core Archive to eliminate API rate-limit risk.

**Target features:**
- Checklist pipeline: parse + clean CSV (committed to repo), spatial-join for county/ecoregion, produce `checklist.parquet`
- Map: separate "Checklist records" toggle-able layer, visually distinct from WABA specimens and iNat samples
- Species pages: checklist records on occurrence maps; taxon pages for all 565 checklist species including those with no WABA records
- iNat taxonomy via DwC-A: replace live `/v2/taxa` enrichers with monthly archive download; eliminates rate-limit risk at scale
- Extensibility: `source` field in pipeline/data model for future data sources (other Bee Atlas programs, GBIF)

## Milestone: v3.9 Sidebar & Table Unification — COMPLETE (2026-05-20)

**Shipped:** Unified `bee-pane` component (1004 lines) merging filter panel + occurrence sidebar + table into three states (collapsed/list/table). `bee-filter-panel.ts` and `bee-sidebar.ts` deleted. Selection+filter use unified `queryListPage` WHERE intersection. Table renders as split-screen (40% map / 60% table). URL pane state (`?pane=list`/`?pane=table`) with legacy `?view=table` alias. MAP-01 satisfied via overlay architecture.

## Milestone: v3.8 Conceptual Tidying — COMPLETE (2026-05-19)

**Shipped:** `src/occurrence.ts` — six pure-function exports centralizing all occurrence ID construction, parsing, and type predicates; 6 caller files migrated; 24 Vitest unit tests. `data/domain.py` — Python `slugify` extracted; dead `BEE_FAMILIES` constant removed; byte-equivalence tests. `data/dbt/macros/inat_field_ids.sql` — five named macros replacing anonymous OFV integer literals across 4 intermediate models; duplicated Plantae CASE centralized. SEM-01 — `places_export.py` specimen predicate fixed to `ecdysis_id IS NOT NULL` matching `isSpecimenBacked`; documented cross-layer and covered by pytest.

## Milestone: v3.7 Places — COMPLETE (2026-05-18)

**Shipped:** Hand-curated `content/places.toml` TOML data model for collecting locations; pipeline spatial join with `place_slug` in `occurrences.parquet` (dbt 31-column contract); per-place SVG occurrence maps; static `/places.html` index and per-place pages at `/places/{slug}.html`; Places boundary mode in Mapbox (4th toggle), click-to-filter, removable place chip, `place=` URL round-trip. Phase 100.1 closed B-01 (place-maps S3 upload) and W-01 (selectedPlace clear on mode switch).

## Milestone: v3.6 Simpler Species Index — COMPLETE (2026-05-16)

**Shipped:** Per-taxon page architecture — 527 species pages, 42 genus pages, 103 subgenus pages, 19 tribe pages. Multi-color SVG occurrence maps for all taxon levels. Searchable family→genus index at `/species/`. Hierarchical `Genus/specificEpithet` slug format throughout. 8 monolith files deleted. BLOCKER-01 (SVG maps never reached S3) closed inline.

## What This Is

An interactive web map displaying Ecdysis specimen records and iNaturalist collection events for volunteer collectors participating in the Washington Bee Atlas. The site is a static frontend (TypeScript, Mapbox GL JS, Lit, wa-sqlite, hyparquet) that fetches Parquet and GeoJSON data from CloudFront at runtime — no data files bundled with the build. Users can filter occurrences by taxon, date, region, and draw selection rectangles on the map to browse records by area. A dbt pipeline writes to a local DuckDB store (`data/beeatlas.duckdb`); `data/export.py` produces parquet and GeoJSON exports with spatial joins. Infrastructure is CDK on AWS (S3 + CloudFront), deployed automatically via GitHub Actions OIDC. Pipeline runs nightly via cron on maderas server.

## Core Value

Tighten learning cycles for volunteer collectors (close the gap between collection and identification appearing on the map) and convey liveness and togetherness among participants. Near-term: surface existing data in ways that are difficult to achieve without the site. Long-term: become the gathering place for the Washington Bee Atlas project — integrating data from Ecdysis and iNaturalist with community coordination that Canvas, iNat, Ecdysis, and Facebook each fail to provide.

## Requirements

### Validated

- ✓ Interactive map renders Ecdysis specimen points using OpenLayers — existing (pre-v1.0)
- ✓ Client-side Parquet reading via hyparquet (no server needed at runtime) — existing (pre-v1.0)
- ✓ PIPE-01: Ecdysis download script runs end-to-end with `--datasetid` parameter — v1.0
- ✓ PIPE-02: Occurrences processor produces valid 45,754-row Parquet without debug artifacts — v1.0
- ✓ PIPE-03: Parquet includes all required columns (scientificName, family, genus, specificEpithet, year, month, recordedBy, fieldNumber) — v1.0
- ✓ INFRA-01: S3 bucket and CloudFront distribution defined in CDK using OAC — v1.0
- ✓ INFRA-02: OIDC IAM role scoped to `repo:rainhead/beeatlas` — no stored AWS keys — v1.0
- ✓ INFRA-03: GitHub Actions builds on all pushes, deploys to S3 + CloudFront invalidation on push to main — v1.0
- ✓ MAP-01: Specimen points render as recency-colored clusters at low zoom — v1.0
- ✓ MAP-02: Clicking a cluster shows sample details sidebar (species, collector, date, host plant) — v1.0
- ✓ FILTER-01: Taxon filtering at species/genus/family level via autocomplete datalist — v1.0
- ✓ FILTER-02: Year range and month-of-year filtering (independently combinable) — v1.0 (month offset fixed in Phase 5)
- ✓ NAV-01: URL sharing — map view (center/zoom) and active filter state encoded in query string; shareable URLs restore exact view — v1.1
- ✓ INAT-01: Pipeline queries iNaturalist API for Washington Bee Atlas collection observations — v1.2
- ✓ INAT-02: Pipeline extracts observer, date, coordinates, and specimen count observation field from each iNat observation — v1.2
- ✓ INAT-03: Pipeline produces samples.parquet (observation_id, observer, date, lat, lon, specimen_count nullable) — v1.2
- ✓ CACHE-01: Pipeline restores samples.parquet + last_fetch.txt from S3 cache prefix at build start; falls back to full fetch on cache miss — v1.2
- ✓ CACHE-02: Pipeline fetches only observations updated since last_fetch.txt timestamp; merges delta into restored parquet — v1.2
- ✓ CACHE-03: Pipeline uploads updated samples.parquet + last_fetch.txt back to S3 cache prefix after successful fetch — v1.2
- ✓ INFRA-04: OIDC IAM role grants s3:GetObject and s3:PutObject on the S3 cache prefix; CI workflow provides AWS credentials to the pipeline step — v1.2
- ✓ INFRA-05: Cache restore, iNat fetch, and cache upload operations are exposed as top-level package.json scripts — v1.2
- ✓ LINK-01: Pipeline reads all occurrenceIDs from ecdysis.parquet and fetches each Ecdysis individual record page at ≤20 req/sec, caching raw HTML to disk — v1.3
- ✓ LINK-02: Pipeline skips HTTP fetch for occurrenceIDs already in links.parquet (first-level skip) or in local HTML cache (second-level skip) — v1.3
- ✓ LINK-03: Pipeline extracts iNat observation ID from `#association-div a[target="_blank"]` href; records null if absent — v1.3
- ✓ LINK-04: Pipeline produces links.parquet with occurrenceID (string) and inat_observation_id (Int64, nullable) — v1.3
- ✓ LCACHE-01: Restore links.parquet from S3 at build start (graceful miss); sync HTML cache from S3 (only missing files) — v1.3
- ✓ LCACHE-02: Upload links.parquet to S3 and sync HTML cache to S3 (only new files) after successful run — v1.3
- ✓ LCACHE-03: npm scripts expose cache-restore-links, fetch-links, cache-upload-links — v1.3
- ✓ PIPE-04: build-data.sh includes cache restore → fetch → cache upload in sequence — v1.3
- ✓ PIPE-05: Specimens in ecdysis.parquet each have county and ecoregion_l3 values after the pipeline runs (spatial join + nearest-polygon fallback) — v1.5
- ✓ PIPE-06: Collection events in samples.parquet each have county and ecoregion_l3 values after the pipeline runs — v1.5
- ✓ PIPE-07: WA county and EPA L3 ecoregion GeoJSON bundled with build; CI schema validation enforces county and ecoregion_l3 columns — v1.5
- ✓ MAP-09: User can toggle boundary overlay between off / county / ecoregion states — v1.5
- ✓ MAP-10: User can click a visible boundary polygon to add that region to the active filter — v1.5
- ✓ FILTER-03: County multi-select autocomplete with removable chips; OR semantics within type — v1.5
- ✓ FILTER-04: Ecoregion multi-select autocomplete with removable chips; type labels disambiguate when both active — v1.5
- ✓ FILTER-05: Region filter state (bm=/counties=/ecor=) encoded in URL and restored on paste — v1.5
- ✓ FILTER-06: "Clear filters" resets county and ecoregion selections in addition to taxon and date — v1.5
- ✓ FRONT-01: Frontend reads inat_observation_id directly from already-loaded ecdysis features; separate links.parquet loading and merge code removed — v1.6
- ✓ DEBT-01: All 7 known tech debt items audited against dlt architecture; 5 closed, 1 updated, 1 carried forward; 3 new items surfaced — v1.6
- ✓ PIPE-08: dlt pipeline files live in data/ with consolidated pyproject.toml and uv.lock; old pipeline modules removed — v1.6
- ✓ PIPE-09: .dlt/config.toml configures all pipeline parameters (iNat project_id, Ecdysis dataset_id, html_cache_dir, db_path) — v1.6
- ✓ PIPE-10: All 5 dlt pipelines run locally and write to data/beeatlas.duckdb (superseded by PIPE-11 for production; local dev still works) — v1.6
- ✓ EXP-01: export.py produces ecdysis.parquet with inat_observation_id joined from occurrence_links; county/ecoregion_l3 via DuckDB ST_Within spatial join — v1.6
- ✓ EXP-02: Nearest-polygon fallback (ST_Distance ORDER BY LIMIT 1) handles specimens outside polygon boundaries — v1.6
- ✓ EXP-03: export.py produces samples.parquet with spatial join; specimen_count sourced from observation field_id=8338 — v1.6
- ✓ EXP-04: validate-schema.mjs updated (inat_observation_id in ecdysis.parquet; links.parquet check removed) — v1.6
- ✓ GEO-01: Export generates counties.geojson from geographies.us_counties (WA state_fips='53') — v1.6
- ✓ GEO-02: Export generates ecoregions.geojson from geographies.ecoregions (polygons intersecting WA) — v1.6
- ✓ ORCH-01: data/run.py runner sequences geographies → ecdysis → inat → projects → export; replaces build-data.sh — v1.6
- ✓ ORCH-02: Individual pipeline steps runnable in isolation for development — v1.6
- ✓ LAMBDA-03: CDK DockerImageFunction deployed — Python container, 15-min timeout, reserved concurrency 1, env vars, prefix-scoped S3 grants — v1.7
- ✓ LAMBDA-04: EventBridge Scheduler rules — NightlyInatSchedule + WeeklyFullSchedule — v1.7
- ✓ LAMBDA-05: Lambda Function URL (NONE auth) deployed — v1.7
- ✓ PIPE-11–14: Lambda handler with S3 DuckDB download, pipeline dispatch, S3 export, backup, CloudFront invalidation — v1.7 (CDK/Lambda deployed but maderas cron is execution path)
- ✓ TEST-01–03: pytest suite (13 tests) — programmatic DuckDB fixture, export.py schema tests, transform unit tests — v1.7
- ✓ TEST-01: `npm test` in `frontend/` runs Vitest with happy-dom; exits non-zero on failure — v1.9
- ✓ STATE-01: Importing `filter.ts` creates no module-level filterState/visibleIds singletons — v1.9
- ✓ STATE-02: Importing `bee-map.ts` triggers no OL source/layer construction or side effects — v1.9
- ✓ STATE-03: All mutable state moved to component instances; `region-layer.ts` no longer eager-loads GeoJSON — v1.9
- ✓ URL-01: `url-state.ts` exports typed `buildParams`/`parseParams` with zero component or DOM imports — v1.9
- ✓ URL-02: `bee-atlas` owns URL init and history; `_restored*` properties removed from `<bee-map>` — v1.9
- ✓ ARCH-01: `<bee-atlas>` custom element is the document root; `bee-map` and `bee-sidebar` are children — v1.9
- ✓ ARCH-02: `<bee-map>` accepts state via 9 `@property` inputs and emits 11 CustomEvents; reads no shared state — v1.9
- ✓ ARCH-03: `bee-atlas` coordinates all state; `bee-map` and `bee-sidebar` have no cross-references — v1.9
- ✓ DECOMP-01: `<bee-filter-controls>` renders all filter inputs; emits `filter-changed` with full filter state — v1.9
- ✓ DECOMP-02: `<bee-specimen-detail>` renders cluster detail from a specimens property; no sidebar or map awareness — v1.9
- ✓ DECOMP-03: `<bee-sample-detail>` renders sample detail from a sample event property; no sidebar or map awareness — v1.9
- ✓ DECOMP-04: `bee-sidebar` is a thin layout shell composing sub-components; no embedded filter or detail markup — v1.9
- ✓ TEST-02: url-state.ts round-trip and validation tests (20 tests) — frontend buildParams/parseParams covered for all fields individually, combined, and edge cases — v1.9
- ✓ TEST-03: filter.ts unit tests (13 tests) — buildFilterSQL covered for all fields, combined clauses, empty filter, and SQL quote escaping — v1.9
- ✓ TEST-04: bee-specimen-detail Lit component render test — sample fixture mounts into shadow DOM; empty samples produce zero .sample divs — v1.9
- ✓ FETCH-01–03: Frontend runtime fetch from CloudFront /data/; no bundled data files in dist/; loading/error overlay — v1.7
- ✓ CI-01–02: CI frontend-only build; fetch-data.yml deleted; no AWS credentials in build job — v1.7
- ✓ DUCK-01: DuckDB WASM singleton loads ecdysis.parquet + samples.parquet into in-memory tables via PARQUET scan — v1.8
- ✓ DUCK-02: counties.geojson + ecoregions.geojson loaded via fetch+registerFileBuffer+read_json (spatial extension deferred; pre-joined columns used instead) — v1.8
- ✓ DUCK-03: Loading/error overlay behavior unchanged; DuckDB init gates OL feature creation via tablesReady promise — v1.8
- ✓ DUCK-04: EH bundle avoids SharedArrayBuffer/COOP-COEP requirement; no CloudFront header changes needed — v1.8
- ✓ FEAT-01: OL ecdysis features created from DuckDB SELECT; ClusterSource behavior unchanged — v1.8
- ✓ FEAT-02: OL iNat sample features created from DuckDB SELECT; sample layer and click behavior unchanged — v1.8
- ✓ FEAT-03: hyparquet removed from package.json; parquet.ts loading code replaced — v1.8
- ✓ FILT-01–05: Taxon / year / month / county / ecoregion filters expressed as SQL WHERE clauses in DuckDB — v1.8
- ✓ FILT-06: Filter query returns Set&lt;featureId&gt;; OL style callbacks use Set.has() in place of matchesFilter() — v1.8
- ✓ FILT-07: URL round-trip, clear filters, boundary highlight, and autocomplete all preserved — v1.8
- ✓ SEL-01: User can shift-drag on the map to draw a rectangular selection area (BoxZoom disabled; custom shift-drag listener) — v3.5
- ✓ SEL-02: A rectangle outline tracks the drag in real-time as visual feedback — v3.5
- ✓ SEL-03: On drag release, occurrences whose lat/lon fall within the rectangle bounds AND pass current active filters are identified — v3.5
- ✓ SEL-04: Sidebar opens showing the matched occurrences (same `bee-occurrence-detail` presentation as a cluster click) — v3.5
- ✓ SEL-05: If zero filter-passing occurrences fall within the bounds, the sidebar is not opened — v3.5
- ✓ SEL-06: Rectangle bounds are encoded in the URL as a `sel=west,south,east,north` param (4 decimal places); restored on page load to re-run the query and open the sidebar — v3.5
- ✓ SEL-07: When the sidebar is dismissed (empty-click), the `sel=` param is cleared from the URL — v3.5

## Previous Milestones

- v1.6 dlt Pipeline Migration — COMPLETE (2026-03-28)
- v1.7 Production Pipeline Infrastructure — COMPLETE (2026-03-30)
- v1.8 DuckDB WASM Frontend — COMPLETE (2026-04-01)
- v1.9 Component Architecture & Test Suite — COMPLETE (2026-04-04)
- v2.0 Tabular Data View — COMPLETE (2026-04-09)
- v2.1 Determination Feeds — COMPLETE (2026-04-11)
- v2.2 Feed Discoverability & Pipeline — COMPLETE (2026-04-12)
- v2.3 Specimen iNat Observation Links — COMPLETE (2026-04-13)
- v2.4 Header Navigation & Toolbar — COMPLETE (2026-04-14)
- v2.5 Elevation Data — COMPLETE (2026-04-16)
- v2.6 SQLite WASM Migration — COMPLETE (2026-04-17)
- v2.7 Unified Occurrence Model — COMPLETE (2026-04-17)
- v2.8 Liveness: Provisional Specimen Records — COMPLETE (2026-04-20)
- v2.9 UI Flow Redesign — COMPLETE (2026-04-21)
- v3.0 Mapbox GL JS Migration — COMPLETE (2026-04-27)
- v3.1 Eleventy Build Wrapper — COMPLETE (2026-04-30)
- v3.2 Species Tab — COMPLETE (2026-05-05)
- v3.3 dbt Spike — COMPLETE (2026-05-13)
- v3.4 dbt Full Rewrite — COMPLETE (2026-05-14)
- v3.5 Selection Rectangle — COMPLETE (2026-05-15)
- v3.6 Simpler Species Index — COMPLETE (2026-05-16)

### Validated (v3.6)

- ✓ URL-01: Each species has a dedicated page at `/species/{Genus}/{specificEpithet}/` — v3.6
- ✓ URL-02: Each genus has a dedicated page at `/species/{Genus}/` — v3.6
- ✓ URL-03: Each subgenus has a dedicated page at `/species/{Genus}/{Subgenus}/` — v3.6
- ✓ URL-04: Each tribe has a dedicated page at `/species/tribe/{TribeName}/` — v3.6
- ✓ URL-05: `/species/` all-cards layout replaced by family→genus index — v3.6
- ✓ IDX-01–04: Searchable index groups by family then genus; links navigate to genus and species pages — v3.6
- ✓ GEN-01–03: Genus pages list species with counts, multi-color SVG map, links to species pages — v3.6
- ✓ SUBG-01–03: Subgenus pages with species list, multi-color SVG map, links — v3.6
- ✓ TRIBE-01–03: Tribe pages with genus list, multi-color SVG map, links — v3.6
- ✓ SPE-01–04: Per-species pages with photo (or fallback), SVG map, seasonality — v3.6
- ✓ PIPE-01: Eleventy generates all taxon pages from species.json — v3.6
- ✓ PIPE-02: species_maps.py generates multi-color SVG maps for genus/subgenus/tribe — v3.6
- ✓ PIPE-03: Hierarchical slug format in species_export.py; species-photos.toml migrated — v3.6
- ✓ PLC-01–04: Coordinator can define places via `content/places.toml` with slug, land_owner, WGS84 geometry, permit records; validation pipeline enforces format and non-overlap — v3.7
- ✓ PPIPE-01–05: Pipeline loads places.toml into DuckDB, joins `place_slug` into `occurrences.parquet` (31-column dbt contract), exports `places.geojson` + `places.json`, commits both to git — v3.7
- ✓ PMAP-01–04: Boundary mode toggle extended to Places; click polygon to filter; removable place chip; `place=` URL round-trip and deep-link — v3.7
- ✓ PPAGE-01–02: `/places.html` index and per-place pages at `/places/{slug}.html` with name, owner, count, SVG map, deep-link — v3.7
- ✓ PPAGE-03: Per-place SVG occurrence maps generated at pipeline time; uploaded to S3/CDN via nightly.sh — v3.7

### Validated (v3.8)

- ✓ TS-01: `src/occurrence.ts` exports `occIdFromRow` and `parseOccId`; all TypeScript call sites migrated; no inline `ecdysis:N`/`inat:N` construction outside occurrence.ts — v3.8
- ✓ TS-02: Named predicates `isSpecimenBacked`, `isSampleOnly`, `isProvisional` replace all inline discriminant conditions across 6 caller files — v3.8
- ✓ TS-03: 24 Vitest unit tests cover all six exports of `src/occurrence.ts`; `tsc --noEmit` exits 0 — v3.8
- ✓ PY-01: `data/domain.py` exports `slugify`; `feeds.py` and `species_export.py` both import from domain; `_slugify` removed; byte-equivalence test suite passes — v3.8
- ✓ PY-02: Dead `BEE_FAMILIES` constant removed from `species_export.py`; `int_species_universe.sql` comment claims sole-gate responsibility — v3.8
- ✓ DBT-01: `data/dbt/macros/inat_field_ids.sql` with 4 named OFV field-ID macros; anonymous literals replaced in all intermediate models; `dbt build` PASS=46 — v3.8
- ✓ DBT-02: Duplicated `is_plant_taxon` CASE extracted into shared macro; `dbt build` passes — v3.8
- ✓ SEM-01: `places_export.py` specimen predicate aligned to `ecdysis_id IS NOT NULL` (matching `isSpecimenBacked`); canonical definition in `isSpecimenBacked` JSDoc; pytest fixture confirms — v3.8

### Validated (v3.9)

- ✓ PANE-01..06: Unified `bee-pane` component with collapsed/list/table states; persistent toggle button always visible; expand-to-table (desktop only); mobile open/close — v3.9
- ✓ TABLE-01: Table retains all existing functionality (pagination, CSV export, filter integration) as pane sub-state — v3.9
- ✓ TABLE-02: Full-screen `viewMode='table'` removed; table accessible only via pane expand button — v3.9
- ✓ URL-01: `?pane=list` / `?pane=table` URL round-trip; collapsed omitted from URL — v3.9
- ✓ URL-02: Legacy `?view=table` preserved via Option A precedence chain — v3.9
- ✓ MAP-01: Mapbox canvas resizes correctly via overlay architecture (bee-pane is position:absolute; bee-map dimensions never change) — v3.9

### Validated (v4.0)

- ✓ **CHECK-01**: Pipeline ingests checklist CSV, parses genus/specificEpithet, spatial-joins county and ecoregion_l3, produces `checklist.parquet` — Phase 111
- ✓ **CHECK-02**: Checklist records appear as a separate toggle-able "Checklist records" layer on the map, visually distinct from WABA specimens — Phase 112
- ✓ **EXT-01**: `source` field in pipeline/data model distinguishes checklist from Ecdysis and iNat records — Phase 111

### Active (v4.0)

- [ ] **CHECK-03**: All 565 checklist species appear in the species index and have taxon pages, including species with no WABA records
- [ ] **CHECK-04**: Checklist occurrence records appear on species/taxon page SVG occurrence maps
- [ ] **TAX-01**: iNat taxonomy replaced by offline Darwin Core Archive lookup; live `/v2/taxa` enrichers removed
- [ ] **TAX-02**: Unified taxon lineage table supersedes existing `taxon_lineage` and `taxon_lineage_extended` tables

### Future

- [ ] **TAB-01**: Determinations (identifications) for my specimens listed by recency — requires iNat determination data in pipeline
- [ ] **TAB-02**: Specimens collected last season on land owned by a named organization — requires land ownership data source
- [ ] **TAB-03**: Common floral hosts by month and region — cross-table aggregation query on ecdysis data

### Out of Scope

| Feature | Reason |
|---------|--------|
| Tribe-level filtering | Tribe not present in Ecdysis DarwinCore export |
| Server-side API or backend | Static hosting constraint — all data client-side |
| User accounts / saved filters | URL sharing covers the use case |
| Multi-source data (GBIF, OSU Museum) | Experimental; Ecdysis is the specimen source of truth |
| Real-time data refresh | Static Parquet updated per pipeline run is correct |
| Heat map / analytics | Map is the analytical surface; charts are scope creep |
| iNaturalist host plant display layer | v1.2 uses iNat data for collection event samples, not a visual plant layer |
| Location search / pan-to-place | Deferred to v2 (NAV-02) |
| OR project (id=18521) | Out of scope; stub exists in projects.py |
| Permit display on place pages | Removed from v3.7 per Phase 99 D-01; static hosting + legal sensitivity; revisit v3.8+ |
| All-WA public lands layer | Thousands of polygons beyond curated collecting sites; out of scope |
| Community-editable place metadata | Static hosting + legal sensitivity; maintainer-curated TOML is governance model |

## Context

Shipped v1.0 on 2026-02-22 (~6,172 lines across 47 files, 4 days). Shipped v1.1 on 2026-03-10 — URL sharing (+324 lines). Shipped v1.2 on 2026-03-11 — iNat pipeline (+5,069/−1,005 lines, 2 days). Shipped v1.3 on 2026-03-12 — links pipeline (+1,405/−31 lines, single day). Shipped v1.4 on 2026-03-13 — sample layer UI (iNat dots, toggle, sidebar detail, iNat links). Shipped v1.5 on 2026-03-27 — geographic region filters (+9,599/−88 lines across 68 files, 4 days). Shipped v1.6 on 2026-03-28 — dlt Pipeline Migration (+3,694/−3,066 lines across 67 files, 1 day). Shipped v1.7 on 2026-03-30 — Production Pipeline Infrastructure (+6,116/−325 lines, 65 files, 10 days): CDK Lambda deployed (abandoned for OOM/timeout); maderas nightly cron (`data/nightly.sh`) is the execution path; data files exported to S3; frontend fetches all data at runtime from CloudFront; CI simplified to frontend-only build; 13 pytest tests cover export schemas and transform logic. Shipped v1.8 on 2026-04-01 — DuckDB WASM Frontend (+4,120/−6,399 lines across 66 files, 1 day): hyparquet replaced by DuckDB WASM EH-bundle; all parquet reads and filter queries now SQL in-browser; `matchesFilter()` replaced by `visibleIds` Set; 3 phases, 5 plans, 10 tasks. Shipped v1.9 on 2026-04-04 — Component Architecture & Test Suite (+8,138/−1,560 lines across 47 files, 2 days): `<bee-atlas>` coordinator component owns all app state; `bee-map` and `bee-sidebar` refactored to pure presenter components; `bee-sidebar` decomposed into `bee-filter-controls`, `bee-specimen-detail`, `bee-sample-detail` sub-components; Vitest test suite with 61 tests across 4 files (url-state round-trips, filter SQL, Lit render tests); 6 phases, 11 plans. Shipped v3.6 on 2026-05-16 — Simpler Species Index (+5,418/−23,155 lines across 154 files, 2 days): 527 species pages, 42 genus pages, 103 subgenus pages, 19 tribe pages generated via Eleventy pagination; multi-color SVG occurrence maps at all taxon levels; monolithic `/species/` all-cards layout (8 files) replaced with searchable family→genus index; hierarchical `Genus/specificEpithet` slug format; BLOCKER-01 closed (species-maps/ S3 upload); 5 phases, 13 plans. Shipped v3.7 on 2026-05-18 — Places (+12,314/−2,566 lines across 103 files, 2 days): hand-curated `content/places.toml` TOML schema with WGS84 polygon geometry and validation pipeline (slug format, CRS, non-overlap); pipeline spatial join adds `place_slug` to `occurrences.parquet` (dbt 31-column contract); `places.geojson` + `places.json` committed to git; per-place SVG occurrence maps; `/places.html` index + per-place pages at `/places/{slug}.html`; Places boundary mode in Mapbox (4th toggle), click-to-filter, removable chip, `place=` URL round-trip; B-01 + W-01 closed in Phase 100.1; 5 phases (including INSERTED 100.1), 11 plans. Shipped v3.8 on 2026-05-19 — Conceptual Tidying (+5,601/−153 across 48 files, 1 day): `src/occurrence.ts` (6 pure-function exports, 6 caller files migrated, 24 Vitest tests); `data/domain.py` (Python slugify extracted, BEE_FAMILIES removed, byte-equivalence tests); `data/dbt/macros/inat_field_ids.sql` (5 named macros, dbt build PASS=46); SEM-01 semantic reconciliation (places_export.py specimen predicate fixed, isSpecimenBacked canonical across 3 stack layers); 4 phases, 5 plans. Shipped v3.9 on 2026-05-20 — Sidebar & Table Unification (+10,639/−1,326 across 54+ files, 2 days): `bee-pane` unified component (1004 lines) merging `bee-filter-panel` + `bee-sidebar` into three-state chrome (collapsed/list/table); `bee-atlas` state machine refactored (three flags → single `_paneState`); `queryListPage` WHERE intersection for unified occurrence query; table as split-screen (40% map/60% table); `bee-filter-panel.ts` and `bee-sidebar.ts` deleted; URL pane state with legacy alias; MAP-01 via overlay architecture; 5 phases, 12 plans, 61 commits.

**Tech stack:**
- Frontend: TypeScript, Vite, Mapbox GL JS, Lit (LitElement), wa-sqlite, hyparquet, temporal-polyfill
- Pipeline: Python 3.14+, uv, dbt-duckdb, duckdb, requests, beautifulsoup4, geopandas
- Infrastructure: AWS CDK v2 (TypeScript), S3 + CloudFront OAC, OIDC IAM role
- CI/CD: GitHub Actions (build on all pushes, deploy on push to main)

**Live site:** https://d1o1go591lqnqi.cloudfront.net

**Known tech debt:**
- `speicmenLayer` typo in `bee-map.ts` (consistent, functions correctly). Trivially fixable but deferred.
- EPA L3 ecoregion CRS risk: `geographies_pipeline.py` calls `.to_crs('EPSG:4326')` before yielding rows — handled for the current ingestion path. Any future shapefile ingestion added to the pipeline must repeat this step or risk silently wrong spatial joins.
- dlt pipeline write-path tests deferred (TEST-03 scope): dlt resource tests skipped in v1.7; only pure-function unit tests and export integration tests covered.
- Lambda execution path retired (quick task 260514-fcq, 2026-05-14): PipelineFunction + EventBridge schedulers + Function URL removed from BeeAtlasStack; maderas nightly cron is authoritative.
- v3.5 Nyquist gaps: Phase 90 VALIDATION.md exists with `nyquist_compliant=false`; Phase 91 has no VALIDATION.md. Run `/gsd-validate-phase 90` and `/gsd-validate-phase 91` next milestone.
- v3.5 SUMMARY.md frontmatter: `requirements-completed` not listed in 89-01, 90-01, 91-01 SUMMARY files (SEL-01 through SEL-05 satisfied but unlisted).
- v3.7 Nyquist gaps: phases 97, 98, 100 have missing/incomplete VALIDATION.md files; Phase 98 Wave 0 RED tests were not written. Run `/gsd-validate-phase 97`, `/gsd-validate-phase 98`, `/gsd-validate-phase 100` next milestone.
- v3.7 Phase 98 VERIFICATION.md missing: procedural gap only — all code verified via SUMMARY files and code inspection.
- v3.7 W-02: `places_validation.py` does not enforce PLC-02 required permit fields at runtime (issuing_authority, type) — a malformed permit record loads silently.
- v3.7 W-03: `run.py` module docstring is stale — omits places-load, places-export, places-maps, topology-postprocess pipeline steps.

## Constraints

- **Static hosting**: No server runtime — all data must be in static Parquet files bundled with or fetched by the frontend
- **Python version**: 3.14+ (per `data/pyproject.toml`)
- **Node.js**: Version pinned in `package.json`
- **AWS**: Infrastructure via CDK in `infra/`; deploy via OIDC role (not long-lived access keys)

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Parquet as frontend data format | Enables browser-side filtering without a server; hyparquet reads client-side | ✓ Good — hyparquet read 45,754 rows cleanly; sub-second load |
| CDK for AWS infrastructure | User preference; keeps infra as code alongside the project | ✓ Good — BeeAtlasStack + GlobalStack deployed; OAC pattern stable in CDK v2.156+ |
| OIDC for GitHub Actions AWS auth | No long-lived secrets; matches reference project pattern | ✓ Good — StringLike trust policy (`repo:rainhead/beeatlas:*`) confirmed; no thumbprints needed |
| iNaturalist data in separate samples.parquet | Keep data sources separate; iNat and Ecdysis have different latencies and schemas | ✓ Good — v1.2 shipped; samples.parquet produced with correct schema and S3 caching |
| FilterState as singleton (not Lit reactive) | OL style callbacks have fixed signatures; can't receive extra params | ✓ Good — singleton mutation + `clusterSource.changed()` repaint pattern works cleanly |
| Style cache key = `count:tier` | Avoids per-render Style object allocation | ✓ Good — cache bypassed only when filter active; correct for all cases |
| Month DarwinCore 1-indexing | DarwinCore months are 1=January; the original +1 offset was a bug | ✓ Good — removed in Phase 5; all 12 months now reachable |
| `id-token: write` permission at job level | Workflow-level permission with multiple jobs causes credential load error | ✓ Good — deploy job-level permission works correctly |
| `S3BucketOrigin.withOriginAccessControl()` (OAC not OAI) | OAI is deprecated in CDK; OAC is the recommended pattern | ✓ Good — confirmed stable, no `websiteIndexDocument` on bucket needed |
| Deploy job rebuilds frontend independently | Avoids artifact upload/download complexity | ✓ Good — self-contained deploy job; acceptable double-build tradeoff |
| Query string (not hash) for URL state | Shareable, bookmarkable, works with browser history API natively | ✓ Good — x/y/z/taxon/yr0/yr1/months/o params encode full view state |
| replaceState on every moveend + debounced pushState (500ms) | Avoids history explosion while preserving back-button nav at settled positions | ✓ Good — back navigation works correctly between settled views |
| `_isRestoringFromHistory` guard + `map.once('moveend')` reset | Prevents popstate→moveend feedback loop; async reset required because OL fires moveend after DOM repaint | ✓ Good — required gap closure to fix (initially reset synchronously) |
| `_selectedOccIds: string[]` comma-separated in `o=` | Multi-occurrence cluster clicks encode all IDs; restore shows full cluster in sidebar | ✓ Good — three bugs required gap closure (preserve on load, all IDs, restore array) |
| Lit `updated()` pattern for URL-pushed restore props | BeeMap pushes restore props as `@property`; BeeSidebar mirrors to `@state` via `updated()` | ✓ Good — clean separation between map-driven restore and sidebar-driven state |
| Match iNat ofvs by field_id not name | Field renamed 'Number of bees collected' → 'numberOfSpecimens' circa 2024; name matching drops ~40% of historical data | ✓ Good — field_id=8338 is stable; confirmed from live API |
| Parse raw API dicts not pyinaturalist model objects | Model attribute access inconsistent for ofvs; raw dict access is explicit and debuggable | ✓ Good — required discovery in Phase 9 (initial model approach failed) |
| Use iNat v2 REST API directly (not pyinaturalist) | dlt prototype uses v2 with explicit DEFAULT_FIELDS and geojson.coordinates for correct lat/lon; original v1 decision was about pyinaturalist's v2 wrapper which had different issues | ✓ Updated — Phase 20 migration; direct REST usage avoids v2 wrapper issues |
| Incremental fetch fallback on any exception | Any parse or merge error should trigger full re-fetch rather than producing corrupt parquet | ✓ Good — robust for corrupted cache states |
| Job-level env: S3_BUCKET_NAME in CI | Cleaner than per-step env; avoids repetition across three cache/build steps | ✓ Good — applied to both build and deploy jobs |
| Mirror cache-restore/build/cache-upload in both CI jobs | Keeps deploy job consistent with build job; both produce fresh samples.parquet | ✓ Good — credential ordering bug fixed in deploy job (credentials must precede build) |
| Use integer `ecdysis_id` (not UUID `occurrenceID`) as `occid` URL parameter | Ecdysis individual record pages use integer DB id, not UUID; UUID in URL 404s or returns page without association section | ✓ Good — identified prototype bug; corrected in Phase 11 |
| Add `occurrenceID` to `ecdysis.parquet` rather than maintaining separate `ecdysis_wa.parquet` | Simpler to extend existing pipeline output than maintain a second file | ✓ Good — single source of truth; Phase 11 reads from `ecdysis.parquet` |
| Two-level cache skip (links.parquet then disk HTML) | Avoids re-fetching pages already linked or already cached; links are permanent | ✓ Good — both levels implemented and tested; rate limit applies only to HTTP requests, not cache hits |
| Initialize `last_fetch_time = time.monotonic()` not `0.0` | Ensures first HTTP request also respects rate limit | ✓ Good — caught by TDD test; ensures ≤20 req/sec from first request |
| S3 sync for HTML cache, S3 cp for links.parquet | HTML cache is a directory of many small files (sync efficient); links.parquet is a single file (cp simpler) | ✓ Good — mirrors iNat pipeline pattern |
| Restore with graceful miss (`\|\| echo`), upload with fail-fast (`set -euo pipefail`) | First CI run has no cache to restore; upload failure means corrupt state | ✓ Good — correct asymmetry; matches v1.2 cache pattern |
| `county`/`ecoregion_l3` as string columns (no BigInt coercion) | Parquet string columns come through as JS strings directly — no Number() cast needed unlike INT64 year/month | ✓ Good — Phase 17 confirmed; simpler than numeric coercion |
| AND-across-types / OR-within-type region filter semantics | Matches expectation: "show me specimens in King County AND Cascades ecoregion" but "show me specimens in King OR Pierce County" | ✓ Good — implemented in matchesFilter() via Set.has() guards |
| `geojson.d.ts` module declaration for `*.geojson` imports | vite/client types don't declare .geojson modules; typed as FeatureCollection covers all future imports without casts | ✓ Good — Phase 17 deviation; cleaner than as-unknown-as workaround |
| EPA L3 ecoregion GeoJSON property name is `NA_L3NAME` | `US_L3NAME` appeared in early planning notes but `NA_L3NAME` is the correct column name in the actual file | ✓ Good — Phase 17 verifier checked live file |
| GeoJSON boundary files committed to git (not generated at CI time) | Avoids shapefile download in CI; simplest resolution with no workflow changes needed | ✓ Good — 56 KB + 357 KB well within git budget; CI-safe |
| Vite geojson plugin: readFileSync + export default; map:null | .geojson imports need custom Vite plugin; map:null suppresses sourcemap warnings | ✓ Good — Phase 18; pattern reusable for future static asset types |
| bm= URL param omitted when off (absence = off) | Clean URLs; counties= and ecor= also omitted when empty | ✓ Good — minimal URL noise; symmetric with layer mode pattern |
| Single-select replaces entire selection on plain click; toggle-off on re-click | Most intuitive: plain click = "show me this region"; shift-click for multi | ✓ Good — Phase 18-04; matches standard list selection UX |
| countyOptions/ecoregionOptions as module-level constants with Set deduplication | Ecoregions reduce to 11 unique names from 80 features; computed once at load | ✓ Good — Phase 19; simpler than deriving from feature properties at render time |
| Boundary toggle reuses existing .layer-toggle/.toggle-btn CSS | No new CSS classes needed; sidebar toggle and map toggle share same visual language | ✓ Good — Phase 19 decision; consistent UI with zero CSS additions |
| Lambda execution path abandoned for maderas cron | Lambda hit geographies OOM, 15-min timeout, read-only filesystem, missing home dir, iNat auth issues; maderas has none of these constraints | ✓ Good — nightly.sh runs in ~2.5 min; CDK artifacts remain for future repurposing |
| asyncBufferFromUrl requires `{ url }` object form | hyparquet API requires object argument, not bare string | ✓ Good — Phase 29 discovery; documented in SUMMARY |
| VITE_DATA_BASE_URL defaults to prod CloudFront | Dev environment fetches from live data; avoids local data file dependency | ✓ Good — clean dev experience with real data |
| CachePolicy with Origin allowList for /data/* | CACHING_OPTIMIZED doesn't vary by Origin; per-origin CORS caching requires explicit allowList policy | ✓ Good — required for Range request CORS to work across origins |
| monkeypatch.setattr over env var for ASSETS_DIR in tests | Module-level global set at import time; env var override unreliable after first import | ✓ Good — Phase 27 pattern; applies to any module-level config read at import |
| EH bundle (not threads bundle) for DuckDB WASM | EH bundle avoids SharedArrayBuffer/COOP-COEP requirement; no CloudFront header changes needed | ✓ Good — MANUAL_BUNDLES with Vite `?url` imports; confirmed in Phase 30 |
| GeoJSON into DuckDB via fetch+registerFileBuffer+read_json, not spatial extension | DuckDB WASM spatial extension cannot read registered URL files; browser fetch → buffer → read_json works | ✓ Good — spatial extension approach abandoned early; pre-joined parquet columns make spatial queries unnecessary |
| tablesReady Promise gates OL feature creation | Race condition if OL queries DuckDB before tables loaded; tablesReady replaces ad-hoc hyparquet loading guard | ✓ Good — clean initialization contract between duckdb.ts and bee-map.ts |
| buildFilterSQL() returns plain SQL string (not parameterized) | DuckDB WASM `query()` does not support parameterized queries with ? placeholders in WASM builds | ✓ Good — SQL string interpolation with string escaping; acceptable for client-side trusted input |
| visibleIds Set replaces per-feature matchesFilter() in OL style callbacks | Set.has() is O(1) vs iterating filter conditions per-feature on every repaint | ✓ Good — style callbacks now read module-level `visibleEcdysisIds`/`visibleSampleIds` |
| VectorSource.loadFeatures() eager call at module scope for county/ecoregion | OL lazy-fetches VectorSource only when attached to visible layer; eager call ensures `once('change')` fires on page load for datalist population | ✓ Good — Phase 32-03 gap fix; required because regionLayer starts `visible: false` |
| _setBoundaryMode skipFilterReset parameter to preserve filter state when called from _applyFilter | _applyFilter sets filterState then calls _setBoundaryMode which cleared it; skipFilterReset=true skips the internal clear+query | ✓ Good — Phase 32-03 gap fix; sidebar counts now correctly reflect filtered totals |
| Vitest configured inline in `vite.config.ts` (not separate `vitest.config.ts`) | Minimal config warrants in-place extension; avoids a second config file for a test block that fits in 4 lines | ✓ Good — Phase 33; no conflicts with existing vite config |
| Explicit `import { test, expect } from 'vitest'` in test files | Avoids type conflicts with `"types": ["vite/client"]`; global Vitest types not safe to enable project-wide | ✓ Good — Phase 33; consistent pattern across all test files |
| `bee-atlas` coordinator does not import OpenLayers | Keeps OL contained in `bee-map`; coordinator is framework-agnostic and testable without OL canvas setup | ✓ Good — Phase 36; ARCH-03 source analysis tests enforce this invariant |
| `bee-map.updated()` as synchronization boundary between coordinator state and OL canvas | `updated()` fires after every Lit property change; `changedProperties.has()` drives targeted OL operations without over-triggering | ✓ Good — Phase 36; replaces ad-hoc property watchers |
| `readFileSync` source analysis in Vitest for architectural invariants | Avoids DuckDB WASM/OL canvas/happy-dom incompatibility while reliably verifying import graph contracts | ✓ Good — Phase 36; ARCH-03 tests run fast and are not flaky |
| Monotonic generation counter in `_runFilterQuery` discards stale DuckDB async results | Async filter queries can race when chips removed quickly; last-write-wins causes flash of unfiltered state | ✓ Good — Phase 37-03 gap fix; flicker eliminated |
| BoxZoom disabled at map init; capture-phase mousedown for shift-drag interception | Mapbox BoxZoomHandler handles shift-drag natively — must disable before installing custom handler; capture phase ensures gesture reaches handler before map's own listeners | ✓ Good — Phase 89; Mapbox official pattern |
| Rectangle overlay in `getCanvasContainer()`, removed on mouseup | `.selection-box` div appended to canvas container, not map container — stays pixel-locked to canvas during resize; removed synchronously in `_rectFinish()` via `.remove()` | ✓ Good — Phase 89; instant removal, no flicker |
| `_clickConsumed` flag suppresses map-click-empty on sub-threshold shift-drags | Without the flag, a shift-click-release (no drag) fires `_onRectMouseDown` then the map's click handler; sidebar would flash open then close | ✓ Good — Phase 89; required for clean sub-threshold behavior |
| `queryOccurrencesByBounds` interpolates numeric bounds as SQL literals | `buildFilterSQL` already uses string interpolation for trusted client-side input; bounds are parsed floats — safe for SQL literal interpolation; matches existing `_restoreClusterSelection` pattern | ✓ Good — Phase 90; confirmed safe in threat model |
| `_selectionBounds` cleared synchronously before first `await` in `_onSelectionDrawn` | Prevents stale results from prior selection being visible while new async query runs; sidebar closes immediately on redraw | ✓ Good — Phase 90; Pitfall 3 guard |
| `sel=` param mutually exclusive with `o=` in `buildParams` | Both encode a "what's selected" state; `_selectionBounds && _sidebarOpen` takes precedence in 3-way ternary; cluster/ids fall through | ✓ Good — Phase 91; clean URL — no mixed selection state |
| `_selectionDrawnGeneration` counter reused for bounds restore race guard | Avoids a separate counter; any new rectangle draw cancels in-flight restore (same generation semantics) | ✓ Good — Phase 91; minimal surface area |
| `west < east` NOT required in `parseParams` validation | Antimeridian-crossing bounds (west > east) are geographically valid; validation only enforces `south < north` (degenerate north/south would always be empty) | ✓ Good — Phase 91; explicit decision after spec review |
| Hierarchical `Genus/specificEpithet` slug (not flat `genus-epithet`) | Case-preserving, path-component-friendly, supports hyphens in epithets; old-slug detection uses `NOT LIKE '%/%'` not `LIKE '%-%'` to avoid false positives | ✓ Good — Phase 92; all 527 species slugs match hierarchical pattern |
| D-01/D-02 alphabetical `canonical_name` sort as color index | Binds Python SVG hue assignment to JS swatch rendering; templates must use the same sort — violating the contract produces color mismatches | ✓ Good — Phase 93; determinism test passes |
| `occurrences.parquet` dbt mart (not `ecdysis_data.occurrences`) for group SVG maps | Includes both Ecdysis and iNat-only occurrence arms; matches what the main map renders | ✓ Good — Phase 93; fix applied during human verification |
| `hslToHex` local function in `_data/species.js` (not named export) | Eleventy data cascade requires default export; named exports break the cascade | ✓ Good — Phase 94; Assumption A2 resolved |
| `eleventyComputed` YAML form for per-page dynamic `<title>` | YAML template string with pagination alias resolves correctly; no JS function fallback needed | ✓ Good — Phase 94; confirmed in dry-run |
| Lean `taxon-page.ts` Vite entry (4 imports only) | Avoids pulling in heavier species chunk machinery; taxon pages don't need OccurrenceSource or filter controls | ✓ Good — Phase 94; distinct chunk in build output |
| `subgenusList[].totalOccurrences` includes unresolved records | Known inaccuracy — some subgenus pages show "N records · 0 species"; fixing requires more complex SQL not worth Phase 95 scope | ⚠️ Revisit — Phase 95; documented WARNING-02 |
| `species-index.ts` type-to-filter uses `data-search` dataset attribute walk | No import of bee-atlas or occurrence machinery; pure DOM string matching; idiomatic for server-rendered Eleventy + minimal JS enhancement | ✓ Good — Phase 96; monolith deleted cleanly |
| `land_owner` field name (not `owner`) in places.toml | Avoids ambiguity between organizational and legal ownership | ✓ Good — Phase 97; all references consistent |
| `LOAD spatial` only in places_validation.py (not `INSTALL spatial`) | Extension already installed in pipeline DuckDB env; INSTALL is one-time setup inappropriate for nightly modules | ✓ Good — Phase 97; pattern mirrors pipeline modules |
| Two export artifacts: `places.geojson` (slim: slug + geometry) and `places.json` (rich: metadata + counts, no geometry) | Mapbox needs geometry; Eleventy needs metadata; a single file can't serve both without either bundling geometry into pages or omitting metadata from Mapbox | ✓ Good — Phase 98; clear responsibility split |
| `promoteId: 'slug'` for places GeoJSON source in Mapbox (not `generateId: true`) | Stable feature IDs across source reloads; click events carry the slug directly for `place-selected` dispatch | ✓ Good — Phase 100; eliminates extra slug lookup |
| `placeImplied` logic in `parseParams` derives `bm=places` when `place=` present and no explicit `bm=` | Deep-links from place pages omit `bm=` but should land in Places mode; the implication avoids requiring two URL params for what reads as one user intent | ✓ Good — Phase 100; explicit decision after spec review |
| `leavingPlaces` conditional in `_onBoundaryModeChanged` skips filter query when not leaving places | Avoids redundant SQL query + URL push when switching between non-places modes where no filter was active | ✓ Good — Phase 100.1; selection state intentionally preserved |
| D-01 (Phase 99): Permit display removed from place pages | Static hosting + legal sensitivity of permit data; maintainer-curated TOML with git history is the governance model | ✓ Good — Phase 99; simplifies pages and avoids permit-staleness UX |
| `occIdFromRow` returns `string \| null` not `string` | Matches bee-table.ts `rowOccId` contract; avoids silent `inat:0` bug when both ecdysis_id and observation_id are null | ✓ Good — Phase 101; TDD caught null-return edge case |
| `isSampleOnly` excludes provisional rows (`ecdysis_id == null && !is_provisional`) | `!isSpecimenBacked` is the correct non-specimen partition for rendering; `isSampleOnly` is narrower | ✓ Good — Phase 101; bee-occurrence-detail.ts uses `!isSpecimenBacked` then dispatches on `isProvisional` |
| `isSpecimenBacked` is the canonical "confirmed specimen" predicate across all three layers | `!is_provisional` was an incorrect synonym; `ecdysis_id IS NOT NULL` is the authoritative check | ✓ Good — Phase 104 (SEM-01); places_export.py fixed; JSDoc documents cross-layer invariant |
| dbt OFV field IDs as named macros (not inline literals) | Anonymous `8338`/`9963`/`18116`/`1718` in JOIN conditions — easy to misread or reorder | ✓ Good — Phase 103; dbt build passes with PASS=46, behavioral parity confirmed |
| `UiState.paneState: 'collapsed' \| 'list' \| 'table'` replaces `viewMode: 'map' \| 'table'` | Three-state pane model requires encoding pane open/closed AND sub-state in one field; old binary was underspecified | ✓ Good — Phase 105; `?pane=list`/`?pane=table` URL round-trip; legacy `?view=table` preserved |
| MAP-01 satisfied by overlay architecture — no explicit `map.resize()` call | `bee-pane` is `position:absolute`; `bee-map` element dimensions never change across pane transitions; existing ResizeObserver in bee-map.ts line 807 handles viewport-change resizes | ✓ Good — Phase 108; approach confirmed correct in UAT; PANE-01 wiring block (12 tests) locks invariant |
| Checklist county-fill responds to year filter (not taxon-only as originally planned) | UAT confirmed year filter narrows checklist fill — user verified this is the desired behavior; plan spec said "taxon filter only" but implementation includes year and that proved correct | ✓ Good — Phase 112 UAT; overrides plan STATE.md locked decision |
| `queryListPage` uses WHERE intersection for selection + filter (not priority sort) | Priority sort would show selection first then fall through to full list — creates confusing UX where "clear" changes total count; intersection is what users expect ("show me these 3 in the context of my filter") | ✓ Good — Phase 109; `_runListQuery` called on filter change + selection change + clear |
| `_onFilterChanged` calls `_runListQuery()` when `_paneState === 'list'` | Without this guard, changing a filter while the pane is open leaves the occurrence list stale (showing pre-filter results) | ✓ Good — Phase 109-06 gap closure; gap only visible when pane is already open during filter change |
| Table-mode collapse goes to `'collapsed'` not `'list'` | Preserves D-08 from v2.9: user who expands to table and collapses should land on the clean map, not the list view they didn't explicitly open | ✓ Good — Phase 106; matches pre-v3.9 "table close → clean map" expectation |

## Evolution

This document evolves at phase transitions and milestone boundaries.

**After each phase transition** (via `/gsd:transition`):
1. Requirements invalidated? → Move to Out of Scope with reason
2. Requirements validated? → Move to Validated with phase reference
3. New requirements emerged? → Add to Active
4. Decisions to log? → Add to Key Decisions
5. "What This Is" still accurate? → Update if drifted

**After each milestone** (via `/gsd:complete-milestone`):
1. Full review of all sections
2. Core Value check — still the right priority?
3. Audit Out of Scope — reasons still valid?
4. Update Context with current state

---
*Last updated: 2026-05-24 — after Phase 112 (checklist-map-layer)*
