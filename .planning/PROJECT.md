# Washington Bee Atlas

## Current Milestone: v3.1 Plants Tab (Phases 74–75)

**Goal:** A Plants tab showing plant species present in Washington with per-species × H3/ecoregion × month sampling coverage — how many plant observations exist and how many times bee visitors have been sampled.

## What This Is

An interactive web map for volunteer collectors participating in the Washington Bee Atlas. Displays Ecdysis specimen records and iNaturalist collection events as a unified occurrence layer — a single `occurrences.parquet` (full outer join; column nullability conveys source coverage). The static frontend (TypeScript, OpenLayers, Lit, wa-sqlite + hyparquet) fetches Parquet and GeoJSON from CloudFront at runtime; wa-sqlite MemoryVFS powers all filter queries and table pagination in-browser. Four dlt pipelines + a DuckDB-native geographies pipeline write to `data/beeatlas.duckdb`; `data/export.py` produces occurrences.parquet, counties.geojson, and ecoregions.geojson; `data/feeds.py` generates Atom feeds of recent determinations. Infrastructure is CDK on AWS (S3 + CloudFront), deployed via GitHub Actions OIDC. Pipeline execution runs as `data/nightly.sh` on maderas (nightly cron); CI runs frontend build only.

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
- ✓ VIEW-01–03: View mode toggle (map/table), URL-encoded, map hidden in table mode — v2.0
- ✓ TABLE-01–07: bee-table LitElement with DuckDB-backed pagination, layer-mode column sets, row count, filter integration — v2.0
- ✓ CSV-01–02: Full filtered result set CSV download with priority-based slugified filename — v2.0
- ✓ FEED-01–08: Atom feeds for all determinations + per-collector/genus/county/ecoregion variants; _slugify path safety; index.json — v2.1
- ✓ PIPE-01–03: feeds.py called by run.py after export; S3 sync in nightly.sh; index.json listing all variants — v2.1
- ✓ DISC-01: `<link rel="alternate" type="application/atom+xml">` autodiscovery in index.html — v2.1
- ✓ DISC-02: Sidebar surfaces available feeds from `index.json`; collector can see and open personal determination feed without leaving the map — v2.2
- ✓ MAP-11: Basemap upgraded to Stadia Maps `outdoors` (terrain, roads, trails, zoom 20); Esri Ocean layers removed — v2.2
- ✓ GEO-03: `geographies_pipeline.py` rewrites all 5 shapefiles via DuckDB `ST_Read`/`ST_Transform`; geopandas/shapely/dlt removed; native `geom GEOMETRY` columns replace `geometry_wkt VARCHAR` throughout — v2.2
- ✓ REN-01–04: `host_observation_id` replaces `inat_observation_id` throughout pipeline, export, schema gate, and all frontend files and test fixtures — v2.3
- ✓ PIPE-01–02: WABA dlt pipeline (`waba_pipeline.py`) with `field:WABA=` filter, isolated `inaturalist_waba_data` schema, incremental `updated_at` cursor; wired into `run.py` — v2.3
- ✓ EXP-01–02: `ecdysis.parquet` gains `specimen_observation_id` (nullable BIGINT) via `waba_link` CTE joining WABA OFV catalog numbers to ecdysis `catalog_number` numeric suffixes; schema gate enforced in CI — v2.3
- ✓ FRONT-01: `specimen_observation_id` rendered as conditional camera emoji link (📷) in sidebar detail view; absent when null — v2.3
- ✓ ELEV-01: `dem_pipeline.py` with `ensure_dem` (download/cache USGS 3DEP 10m WA DEM) and `sample_elevation` (rasterio sampling); 5 unit tests, no network required — v2.5 (Phase 55)
- ✓ ELEV-02: `export.py` samples elevation at each specimen's lat/lon; `elevation_m` (INT16, nullable) added to `ecdysis.parquet`; nodata sentinel from `dataset.nodata` — v2.5 (Phase 56)
- ✓ ELEV-03: `export.py` samples elevation at each sample's lat/lon; `elevation_m` (INT16, nullable) added to `samples.parquet` — v2.5 (Phase 56)
- ✓ ELEV-04: `validate-schema.mjs` enforces `elevation_m` column presence in both parquet files; ships in same commit as `export.py` — v2.5 (Phase 56)
- ✓ ELEV-05: `bee-specimen-detail` shows elevation as "1219 m" (integer, no decimal) when non-null; row omitted entirely when null — v2.5 (Phase 57)
- ✓ ELEV-06: `bee-sample-detail` shows elevation in the same format and null-omit behavior — v2.5 (Phase 57)
- ✓ ELEV-07: Elevation range filter (min/max number inputs) in `bee-filter-controls`; `elev_min`/`elev_max` URL params; round-trip preserved — v2.5 (Phase 58)
- ✓ ELEV-08: `buildFilterSQL` applies D-06 conditional null semantics — null rows excluded only when both bounds set; single-bound passes nulls through — v2.5 (Phase 58)
- ✓ ELEV-09: Elevation min/max inputs reset when all filter tokens are removed (no explicit Clear button) — v2.5 (Phase 58)
- ✓ OCC-01: `export.py` produces `occurrences.parquet` from full outer join of ecdysis specimens and iNat samples; specimen-side columns null for sample-only rows; sample-side columns null for specimen-only rows; `validate-schema.mjs` updated — v2.7 (Phase 62)
- ✓ OCC-03: COALESCE unifies coordinate columns into canonical `lat`/`lon`; `date` column standardized to VARCHAR ISO format in export SQL — v2.7 (Phase 62)
- ✓ OCC-05: `sqlite.ts` loads `occurrences.parquet` into a single `occurrences` SQLite table; `ecdysis` and `samples` tables removed — v2.7 (Phase 63)
- ✓ OCC-06: `buildFilterSQL` returns a single WHERE clause for the `occurrences` table; all query functions updated; all 167 existing filter tests pass — v2.7 (Phase 63)
- ✓ OCC-07: `OccurrenceSource` replaces `EcdysisSource` and `SampleSource`; OL feature IDs follow `ecdysis:<int>` / `inat:<int>` convention — v2.7 (Phase 64)
- ✓ OCC-08: `OccurrenceRow` replaces `SpecimenRow`/`SampleRow`; `queryVisibleIds` returns `Set<string>`; `layerMode` removed from `UiState`; `makeSampleDotStyleFn` deleted — v2.7 (Phase 65)
- ✓ OCC-09: `bee-occurrence-detail` unified detail component with specimen group rendering and sample-only entries; `bee-specimen-detail` and `bee-sample-detail` deleted — v2.7 (Phase 65)
- ✓ OCC-10: All UI components (`bee-atlas`, `bee-map`, `bee-header`, `bee-table`, `bee-sidebar`) wired to `OccurrenceRow`; `layerMode` branching eliminated throughout — v2.7 (Phase 65)
- ✓ PROV-01: `waba_pipeline.py` DEFAULT_FIELDS includes OFV field_id 1718; value persisted in `inaturalist_waba_data.observations__ofvs` — v2.8 (Phase 66)
- ✓ PROV-02: `export.py` adds WABA provisional rows (`ecdysis_id = null`, `is_provisional = true`) via UNION ALL arm for unmatched WABA observations — v2.8 (Phase 66)
- ✓ PROV-03: Provisional rows carry `specimen_inat_taxon_name`, `specimen_inat_genus`, `specimen_inat_family` from `taxon_lineage`; `specimen_inat_login` = iNat user login; `specimen_observation_id` = WABA obs ID — v2.8 (Phase 66)
- ✓ PROV-04: Provisional rows with OFV 1718 carry `host_observation_id` (regexp_extract from URL); where host is a known sample, `specimen_count` and `sample_id` are populated — v2.8 (Phase 66)
- ✓ PROV-05: `occurrences.parquet` gains `is_provisional BOOLEAN`; `validate-schema.mjs` EXPECTED list updated to 30 columns; 2 pytest integration tests cover inclusion/exclusion behavior — v2.8 (Phase 66)
- ✓ SID-01: `bee-occurrence-detail` renders sample-only rows with "N specimens collected, identification pending"; uses `host_inat_login` for observer display — v2.8 (Phase 67)
- ✓ SID-02: `bee-occurrence-detail` renders WABA provisional rows with `.inat-id-label` ("iNat ID:"), italic taxon name, quality badge (aria-labeled), and "View WABA observation" link to `specimen_observation_id`; 2 Vitest render tests pass — v2.8 (Phase 67)
- ✓ Mapbox GL JS v3 migration: `bee-map` rewritten on Mapbox GL JS v3.22.0; clustered GeoJSON source with recency `clusterProperties`; ghost source for filtered-out features; filter-based selection ring; full click chain via `addInteraction` (cluster→leaves, point, region, empty); county/ecoregion options loaded from SQLite (decoupled from map source events); `ol`/`ol-mapbox-style`/`rbush` removed; 172 Vitest tests pass — v3.0 (Phases 71–73)

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

### Active (future)

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

## Context

Shipped v1.0 on 2026-02-22 (~6,172 lines across 47 files, 4 days). Shipped v1.1 on 2026-03-10 — URL sharing (+324 lines). Shipped v1.2 on 2026-03-11 — iNat pipeline (+5,069/−1,005 lines, 2 days). Shipped v1.3 on 2026-03-12 — links pipeline (+1,405/−31 lines, single day). Shipped v1.4 on 2026-03-13 — sample layer UI (iNat dots, toggle, sidebar detail, iNat links). Shipped v1.5 on 2026-03-27 — geographic region filters (+9,599/−88 lines across 68 files, 4 days). Shipped v1.6 on 2026-03-28 — dlt Pipeline Migration (+3,694/−3,066 lines across 67 files, 1 day). Shipped v1.7 on 2026-03-30 — Production Pipeline Infrastructure (+6,116/−325 lines, 65 files, 10 days): CDK Lambda deployed (abandoned for OOM/timeout); maderas nightly cron (`data/nightly.sh`) is the execution path; data files exported to S3; frontend fetches all data at runtime from CloudFront; CI simplified to frontend-only build; 13 pytest tests cover export schemas and transform logic. Shipped v1.8 on 2026-04-01 — DuckDB WASM Frontend (+4,120/−6,399 lines across 66 files, 1 day): hyparquet replaced by DuckDB WASM EH-bundle; all parquet reads and filter queries now SQL in-browser; `matchesFilter()` replaced by `visibleIds` Set; 3 phases, 5 plans, 10 tasks. Shipped v1.9 on 2026-04-04 — Component Architecture & Test Suite (+8,138/−1,560 lines across 47 files, 2 days): `<bee-atlas>` coordinator component owns all app state; `bee-map` and `bee-sidebar` refactored to pure presenter components; `bee-sidebar` decomposed into `bee-filter-controls`, `bee-specimen-detail`, `bee-sample-detail` sub-components; Vitest test suite with 61 tests across 4 files (url-state round-trips, filter SQL, Lit render tests); 6 phases, 11 plans. Shipped v2.0 on 2026-04-09 — Tabular Data View. Shipped v2.1 on 2026-04-11 — Determination Feeds. Shipped v2.2 on 2026-04-12 — Feed Discoverability & Pipeline (68 files, 8,920 insertions/3,305 deletions, 2 days): sidebar feed discovery from `index.json`; Stadia Maps `outdoors` basemap (zoom 20, terrain/roads/trails); geographies pipeline rewritten with DuckDB `ST_Read`/`ST_Transform` eliminating geopandas OOM; native `geom GEOMETRY` columns throughout; 3 phases, 5 plans. Shipped v2.3 on 2026-04-13 — Specimen iNat Observation Links (2 days): renamed `inat_observation_id` → `host_observation_id` across 12 files; new WABA dlt pipeline fetches 1,374 iNat observations via `field:WABA=` filter into isolated `inaturalist_waba_data` schema; `ecdysis.parquet` gains `specimen_observation_id` (nullable BIGINT) with 1,347 production matches; camera emoji link (📷) in sidebar for specimens with WABA observation; 4 phases, 4 plans, 135 tests passing. Shipped v2.4 on 2026-04-14 — Header Navigation & Toolbar: fixed header component, filter toolbar, sidebar cleanup; 3 phases, 5 plans. Shipped v2.5 on 2026-04-16 — Elevation Data (+8,556/−1,438 lines, 82 files, 2 days): DEM acquisition module built then dropped (Ecdysis already has `minimum_elevation_in_meters` at ~96% coverage); `elevation_m` (INT16, nullable) added to both parquets; elevation display in sidebar detail; elevation range filter with D-06 conditional null semantics; 4 phases, 7 plans, 19 new tests (165 total). Shipped v2.6 on 2026-04-17 — SQLite WASM Migration (2 days): DuckDB WASM replaced by wa-sqlite (MemoryVFS) + hyparquet; 8× faster instantiate, 1.8× faster tablesReady, 613× faster first-query; `@duckdb/duckdb-wasm` + `apache-arrow` removed; `duckdb.ts` deleted; 3 phases, 5 plans, 165 tests passing. Shipped v2.7 on 2026-04-17 — Unified Occurrence Model (1 day, 62 files, 9,338 insertions/1,831 deletions): `export.py` produces single `occurrences.parquet` via full outer join; `sqlite.ts` loads single `occurrences` table; `OccurrenceSource` replaces `EcdysisSource` + `SampleSource`; `bee-occurrence-detail` replaces dual detail components; `layerMode` eliminated throughout; 4 phases, 8 plans. Shipped v2.8 on 2026-04-20 — Liveness: Provisional Specimen Records (2 phases, 7 plans): `waba_pipeline.py` adds OFV field 1718; `export.py` UNION ALL arm produces provisional rows (`is_provisional=true`, `ecdysis_id` null) for unmatched WABA observations with iNat taxon/observer/host_observation_id; `bee-occurrence-detail` renders provisional and sample-only rows; 2 pytest integration tests + 2 Vitest render tests. Shipped v2.9 on 2026-04-21 — UI Flow Redesign (3 phases, 6 plans): floating filter button (magnifying glass + count) replaces always-visible toolbar; what/who/where/when sections; table drawer slides over map (~82%) instead of replacing it; sidebar overlays map as right-edge panel with drop shadow; map always visible; localStorage recents removed. Shipped v3.0 on 2026-04-27 — Mapbox GL JS Migration (3 days, 47 files, +6,301/−3,565 LOC, 3 phases, 7 plans): `bee-map` rewritten on Mapbox GL JS v3.22.0 with WebGL clustered rendering for 250K+ points; ghost source for filtered-out features; filter-based selection ring (avoids `promoteId` conflict with cluster IDs); full click chain via Mapbox `addInteraction` + `_clickConsumed` flag pattern; boundary layers with `feature-state` highlighting via `generateId`; county/ecoregion options loaded from SQLite DISTINCT (decoupled from map source events); `ol`/`ol-mapbox-style`/`rbush`/`@types/rbush` removed; main JS chunk 2,018 KB (mapbox-gl ~1,700 KB + app ~318 KB); 172 Vitest tests pass; human UAT found and fixed `isStyleLoaded()` false-during-clustering bug across four guards.

**Tech stack:**
- Frontend: TypeScript, Vite, OpenLayers, Lit (LitElement), wa-sqlite, hyparquet, temporal-polyfill
- Pipeline: Python 3.14+, uv, dlt[duckdb], duckdb (with spatial extension), requests, beautifulsoup4
- Infrastructure: AWS CDK v2 (TypeScript), S3 + CloudFront OAC, OIDC IAM role
- CI/CD: GitHub Actions (build on all pushes, deploy on push to main)

**Live site:** https://d1o1go591lqnqi.cloudfront.net

**Known tech debt:**
- `speicmenLayer` typo in `bee-map.ts` (consistent, functions correctly). Trivially fixable but deferred.
- dlt pipeline write-path tests deferred (TEST-03 scope): dlt resource tests skipped in v1.7; only pure-function unit tests and export integration tests covered.
- Lambda infrastructure deployed but not the execution path: CDK/Lambda artifacts live in AWS; maderas cron is authoritative. Lambda will need cleanup or repurposing if execution path changes.
- `load_geographies` imported in `run.py` but absent from `STEPS` (dead import, IN-01 from v2.2 code review). Low priority — cosmetic only.

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
| Local `FeedEntry` definition in `bee-sidebar.ts` (not imported from `bee-atlas.ts`) | ARCH-03 prohibits `bee-sidebar` importing from `bee-atlas`; local interface mirrors the shape without creating a cross-reference | ✓ Good — v2.2 Phase 45; ARCH-03 compliance preserved |
| Stadia Maps `outdoors` single layer replaces two stacked Esri Ocean layers | Esri Ocean capped at zoom 16; Stadia outdoors supports zoom 20 with terrain, roads, trails — essential for field collectors | ✓ Good — v2.2 Phase 46; tile URL parameterized via env var |
| DuckDB `ST_Read('/vsizip/...')` + `ST_Transform(geom, prj_wkt, 'EPSG:4326', true)` replaces geopandas for geographies pipeline | geopandas loaded full GeoDataFrames into Python heap causing OOM on maderas; DuckDB streams directly without Python heap allocation | ✓ Good — v2.2 Phase 47; all 5 shapefiles stream via ST_Read; 3 projected CRS sources use 4-arg ST_Transform with always_xy=true |
| WABA pipeline uses strictly isolated `pipeline_name="waba"` / `dataset_name="inaturalist_waba_data"` | Prevents cursor collision in `_dlt_pipeline_state` with existing `inaturalist` pipeline | ✓ Good — v2.3 Phase 49; aliased imports in run.py avoid load_observations name collision |
| Join key is numeric suffix of `catalog_number` via `regexp_extract(catalog_number, '[0-9]+$')` | WABA OFV field_id=18116 stores bare integer (e.g. `5594569`), not full `WSDA_5594569` prefix — direct join impossible | ✓ Good — v2.3 Phase 50; CAST to BIGINT matches OFV value type |
| `MIN(waba.id)` dedup per catalog suffix in `waba_link` CTE | Multiple WABA observers can photograph same specimen; any one observation ID is sufficient for the link | ✓ Good — v2.3 Phase 50; prevents row duplication in ecdysis.parquet |
| DEM pipeline built then dropped — `ecdysis_data.occurrences` already has `minimum_elevation_in_meters` | Ecdysis Darwin Core field has ~96% coverage; building a rasterio/seamless-3dep DEM sampler was unnecessary for specimens | ✓ Good — v2.5 Phase 55–56; iNat samples have no elevation source, elevation_m is always null for them |
| Elevation inputs placed outside `.search-section` as sibling div | Dropdown z-index scoping is set on `.search-section`; placing inputs inside would clip the token dropdown | ✓ Good — v2.5 Phase 58; clean z-index separation |
| `filterStatesEqual` extended with elevMin/elevMax before dispatching filter-changed | Without equality check, elevation-only input changes would cause `updated()` loop (component re-receives its own emission) | ✓ Good — v2.5 Phase 58; guard correctly ignores own emissions |
| D-06 conditional null semantics: single-bound passes nulls, both-bounds excludes nulls | Null elevation records should remain visible when only one bound is set — forcing null exclusion with one bound would silently hide ~4% of specimens | ✓ Good — v2.5 Phase 58; SQL: both set → BETWEEN + IS NOT NULL; one set → IS NULL OR >= / <= |
| Inline `performance.now()` + `performance.memory` instrumentation in `duckdb.ts` (removed in Phase 61) | DuckDB WASM init, tablesReady, and first-query latency span async boundaries; module-level `_benchmarkT0` bridges `_init()` to `loadAllTables()`; Chrome-only heap reads use inline cast to avoid a temporary `.d.ts` | ✓ Good — v2.6 Phase 59; baseline: 539 ms instantiate, 1941 ms tablesReady, 613 ms first-query, 18.7 MB heap peak (M1 MacBook Air, Chrome 146) |
| wa-sqlite MemoryVFS sync build (not OPFS or async build) | In-memory SQLite matches DuckDB WASM's in-memory model; sync build avoids Asyncify complexity for most operations | ✓ Good — v2.6 Phase 60; all queries run correctly against in-memory tables |
| Serialize all `sqlite3.exec` calls through a microtask queue | Concurrent `sqlite3.exec` calls caused Asyncify reentrance (step returned SQLITE_OK=0 prematurely); serialization via `Promise` chain in `_init()` eliminates corruption | ✓ Good — v2.6 Phase 60; discovered during browser E2E; fix required for correctness |
| `optimizeDeps.exclude: ['wa-sqlite']` in Vite config | Vite pre-bundled wa-sqlite and rewrote the WASM URL, breaking runtime WASM resolution | ✓ Good — v2.6 Phase 60; standard pattern for packages that load WASM at runtime |
| Convert hyparquet `Date` objects to ISO strings before SQLite INSERT | hyparquet returns JS `Date` objects for DATE columns; wa-sqlite bound them as `null` rather than a date string; ISO string conversion preserves date filtering | ✓ Good — v2.6 Phase 60; discovered in E2E; year/month filters would have been broken |
| Add `"node"` to `tsconfig.json` types after duckdb removal | `apache-arrow` (duckdb transitive dep) carried `/// <reference types="node" />` in its .d.ts files, implicitly providing `@types/node` to test files; removing duckdb broke the implicit reference | ✓ Good — v2.6 Phase 61; makes dependency explicit; caught by `npm run build` failure |
| Full outer join for occurrences.parquet (not inner or left) | Must preserve sample-only records (no Ecdysis match) and specimen-only records (no iNat sample); inner join would silently drop unlinked rows | ✓ Good — v2.7 Phase 62; 25-column schema with clear null semantics per source |
| COALESCE lat/lon from both sources at export time | ecdysis provides `lat`/`lon`; iNat provides `latitude`/`longitude`; canonical columns required by frontend — resolved once in SQL rather than per-query | ✓ Good — v2.7 Phase 62; date column also standardized to VARCHAR ISO |
| `buildFilterSQL` keeps `layerMode` discriminator clauses in WHERE for specimen/sample sub-queries | `queryTablePage` / `queryAllFiltered` still need to surface specimen-only vs sample-only rows with correct column sets; discriminator preserved inside query functions, not in `UiState` | ✓ Good — v2.7 Phase 63; layerMode removed from URL state and coordinator; query-internal only |
| Discriminated union `SelectionState` (`{type: 'ecdysis'} \| {type: 'inat'}`) replaces separate ecdysis/sample click handling in bee-atlas | Single `occurrence-clicked` event path; coordinator routes to correct detail rendering without if/else on layerMode | ✓ Good — v2.7 Phase 64; bee-atlas coordinator simplified; selection restore also unified |
| `bee-occurrence-detail` uses null-omit rendering (row omitted entirely when value null) | Unified detail must gracefully handle specimen-only rows (no observer/specimen_count) and sample-only rows (no scientificName/family/etc.) without showing blank rows | ✓ Good — v2.7 Phase 65; `bee-specimen-detail` and `bee-sample-detail` deleted |
| Mapbox `accessToken` assignment requires explicit cast | `verbatimModuleSyntax` + `nodenext` resolves `mapbox-gl` default import to module namespace type; runtime property exists but TS cannot see it | ✓ Good — v3.0 Phase 71; cast localized to one line in bee-map.ts |
| `features.ts` outputs `[lon, lat]` WGS84 (no EPSG:3857 projection) | Mapbox GL JS expects WGS84 natively; OL's projected coordinate convention no longer applicable | ✓ Good — v3.0 Phase 71 |
| Filter-based selection highlighting (`setFilter` on `selected-ring` layer) instead of `feature-state` | `feature-state` requires `promoteId`, which conflicts with Mapbox cluster auto-IDs; `setFilter` on a dedicated unclustered layer is conflict-free | ✓ Good — v3.0 Phase 71; cluster-blob selection has no ring (UX follow-up filed) |
| County/ecoregion filter options loaded from SQLite DISTINCT in `bee-atlas`, not from map source events | Decoupled from map state; preserves pure-presenter invariant for `bee-map`; coordinator owns option loading | ✓ Good — v3.0 Phase 71 (D-02) |
| Boundary layers render BELOW occurrence layers in Mapbox stack | Dots remain clickable and visually prominent over polygon fills | ✓ Good — v3.0 Phase 72 |
| `_clickConsumed` flag pattern for empty-click fallback | Mapbox `addInteraction` + `preventDefault` may or may not propagate to generic `map.on('click')`; flag pattern is correct in either case | ✓ Good — v3.0 Phase 72; replaces manual `queryRenderedFeatures` hit testing |
| Cluster click emits all leaves (D-01) without auto-zoom | Preserves v2.7 selection semantics — sidebar opens with full leaf list; user can still zoom manually | ✓ Good — v3.0 Phase 72 |
| Source/layer existence checks, NOT `isStyleLoaded()`, in `_applyVisibleIds`/`_applySelection`/`_applyBoundaryMode`/`_applyBoundarySelection` | Mapbox v3 reports `isStyleLoaded()` = false during async clustered GeoJSON processing, blocking URL-restored filters and selection | ✓ Good — v3.0 Phase 73 + Phase 71 human UAT; uniform pattern across four guards |
| `mapbox-gl` v3 main chunk ~1,700 KB, not tree-shakeable | App code excluding mapbox-gl is ~318 KB (lit + wa-sqlite + hyparquet); ROADMAP "<200 KB" target was unrealistic given vendor library size | ⚠️ Revisit — defer-load or alternative renderer if main-thread budget becomes a concern |
| `npm workspaces` uses single root `package-lock.json` (deleted `frontend/package-lock.json`) | Stale per-workspace lockfile shadowed root resolution; clean dep tree requires single source of truth | ✓ Good — v3.0 Phase 73 |

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
*Last updated: 2026-04-28 after v3.0 Mapbox GL JS Migration milestone — Phases 71–73 complete; OL fully removed; bee-map rewritten on Mapbox GL JS v3.22.0; 172 Vitest tests passing; main JS chunk 2,018 KB (mapbox-gl ~1,700 KB + app ~318 KB)*
