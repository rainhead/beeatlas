# Milestones

## v1.8 DuckDB WASM Frontend (Shipped: 2026-04-01)

**Phases completed:** 3 phases, 5 plans, 10 tasks

**Key accomplishments:**

- @duckdb/duckdb-wasm EH-bundle singleton loads ecdysis/samples via HTTP parquet scan and counties/ecoregions via fetch+buffer+read_json into four queryable in-browser DuckDB tables, verified with all row counts correct and no COOP/COEP errors
- EcdysisSource and SampleSource VectorSource subclasses querying DuckDB tables directly, replacing hyparquet; tablesReady promise guards against race conditions
- SQL-based filter architecture: buildFilterSQL() + queryVisibleIds() replace per-feature JS matchesFilter(); style callbacks switched to Set.has() visibility checks
- bee-map.ts fully rewired to async DuckDB SQL queries: all matchesFilter() call sites replaced with visibleEcdysisIds Set.has() checks; filter handler, URL restore, polygon click, clear filters, and boundary mode all await queryVisibleIds before repaint
- Fixed two UAT-failing gaps: county/ecoregion dropdowns now populate on page load, and sidebar counts correctly update when region filters are applied

---

## v1.7 Production Pipeline Infrastructure (Shipped: 2026-03-30)

**Phases completed:** 5 phases, 5 plans, 13 tasks

**Key accomplishments:**

- CDK DockerImageFunction with S3-backed stub handler, two EventBridge Scheduler rules, and Lambda Function URL added to BeeAtlasStack; cdk synth passes with all required CloudFormation resources
- pytest suite for data/ with 13 passing tests: _extract_inat_id() pure function extracted from ecdysis_pipeline, session-scoped fixture DuckDB with embedded WA/Chelan/North Cascades WKT, export integration tests asserting correct Parquet schema and valid GeoJSON
- CI build job stripped of all AWS/pipeline steps; validate-schema.mjs fetches parquet schema via CloudFront Range requests when no local files present

---

## v1.6 dlt Pipeline Migration (Shipped: 2026-03-28)

**Phases completed:** 9 phases, 13 plans, 17 tasks

**Key accomplishments:**

- occurrenceID UUID join key added to ParquetSource; new SampleParquetSource class exports iNat sample features with BigInt-safe INT64 coercion
- Added sampleDotStyle (teal/blue/slate OL Circle style) and SAMPLE_RECENCY_COLORS to style.ts, plus graceful links.parquet copy to build-data.sh
- sampleLayer wired to OL map with exclusive visibility toggle, layerMode @state, lm= URL param encode/restore, and mode-gated singleclick handler in bee-map.ts
- Lit web component sidebar extended with Specimens/Samples toggle, mode-conditional filter controls, and a clickable recent sample events list dispatching EPSG:3857 pan/zoom events
- Sample dot singleclick shows observation detail (observer, date, count, iNat link) via _selectedSampleEvent; specimen detail rows show iNat link or 'iNat: —' sourced from links.parquet loaded eagerly at startup
- One-liner:
- validate-schema.mjs updated with inat_observation_id in ecdysis.parquet and links.parquet removed; region-layer.ts wired to counties.geojson/ecoregions.geojson; stale assets deleted
- Eliminated the links.parquet secondary fetch by reading inat_observation_id directly off ecdysis features, removing loadLinksMap, _linksMap, and the linksDump asset import
- Closed 5 of 7 legacy tech debt items confirmed resolved by the dlt migration (Phases 20-23); updated 1 item; carried forward 1 typo; added 3 new debt items from the migration
- CDK DockerImageFunction with S3-backed stub handler, two EventBridge Scheduler rules, and Lambda Function URL added to BeeAtlasStack; cdk synth passes with all required CloudFormation resources

---

## v1.5 Geographic Regions (Shipped: 2026-03-27)

**Phases completed:** 7 phases, 20 plans, 33 tasks

**Key accomplishments:**

- occurrenceID UUID join key added to ParquetSource; new SampleParquetSource class exports iNat sample features with BigInt-safe INT64 coercion
- Added sampleDotStyle (teal/blue/slate OL Circle style) and SAMPLE_RECENCY_COLORS to style.ts, plus graceful links.parquet copy to build-data.sh
- sampleLayer wired to OL map with exclusive visibility toggle, layerMode @state, lm= URL param encode/restore, and mode-gated singleclick handler in bee-map.ts
- Lit web component sidebar extended with Specimens/Samples toggle, mode-conditional filter controls, and a clickable recent sample events list dispatching EPSG:3857 pan/zoom events
- Sample dot singleclick shows observation detail (observer, date, count, iNat link) via _selectedSampleEvent; specimen detail rows show iNat link or 'iNat: —' sourced from links.parquet loaded eagerly at startup
- pytest test scaffold with 9 failing tests defining contracts for geopandas spatial join (add_region_columns), nearest-polygon fallback, iNat pipeline integration, and GeoJSON generation (build_county_geojson, build_ecoregion_geojson)
- `data/spatial.py` with `add_region_columns()` — two-step geopandas sjoin (within + sjoin_nearest fallback) adding county and ecoregion_l3 columns to any coordinate DataFrame
- One-liner:
- CI schema validation extended to require county and ecoregion_l3 columns in both ecdysis.parquet and samples.parquet
- Both ecdysis and iNat pipelines now write county and ecoregion_l3 columns to their parquet outputs via add_region_columns() from spatial.py
- WA county (56 KB) and EPA L3 ecoregion (357 KB) GeoJSON files generated via build_geojson.py and committed to git for CI-safe frontend bundling
- fetch-data workflow fixed and run end-to-end, uploading fresh ecdysis.parquet and samples.parquet with county and ecoregion_l3 columns to S3 — deploy CI schema validation now passes
- county and ecoregion_l3 Parquet columns exposed as OL feature properties, with FilterState extended with region Sets and AND/OR filter guards in matchesFilter()
- OL VectorLayer backed by GeoJSON county and ecoregion sources, transparent-fill styled for interior hit-detection, invisible until Phase 18 wires toggle
- boundaryMode @state() wired into bee-map.ts with full URL round-trip for bm=/counties=/ecor= params and regionLayer mounted in OL map layers array
- Floating Off/Counties/Ecoregions toggle, polygon click region filter with sample dot ghosting, and sidebar filter text wired into bee-map.ts/bee-sidebar.ts
- Regenerated ecdysis.parquet (46090 specimens) and samples.parquet (9586 observations) with county and ecoregion_l3 string columns via spatial join pipelines, fixing the polygon click filter that was ghosting all features
- Dynamic blue polygon highlight with single-select (replace) and shift-click multi-select on county/ecoregion boundaries
- One-liner:
- Manual verification checkpoint for FILTER-03/04/06 auto-approved in auto_advance mode — boundary toggle, county/ecoregion chip autocomplete, Clear filters, and URL round-trip accepted as shipped.

---

## v1.3 Specimen-Sample Linkage (Shipped: 2026-03-12)

**Phases completed:** 2 phases, 4 plans, 0 tasks

**Key accomplishments:**

- (none recorded)

---

## v1.2 iNat Pipeline (Shipped: 2026-03-11)

**Phases completed:** 3 phases (Phases 8–10), 5 plans
**Timeline:** 2026-03-10 → 2026-03-11 (2 days)
**Git range:** `feat(08-01)` → `docs(quick-1)`
**LOC:** +5,069/−1,005 lines across 56 files; 244 Python + 51 shell (inat pipeline)

**Key accomplishments:**

1. Confirmed iNat field IDs from live API (SPECIMEN_COUNT_FIELD_ID=8338, SAMPLE_ID_FIELD_ID=9963); documented OFVS in default response — no `fields='all'` needed
2. Wired `id-token: write` + `configure-aws-credentials@v4` into CI build job; confirmed existing IAM role covers `cache/` prefix without new grants
3. S3 cache scripts (`cache_restore.sh` with graceful miss, `cache_upload.sh` with hard fail) + `package.json` npm scripts (cache-restore, fetch-inat, cache-upload)
4. Full `data/inat/download.py` pipeline: pyinaturalist fetch, incremental mode with `merge_delta`, 15 unit tests, wired into `build-data.sh`
5. CI `deploy.yml` fixed (credential ordering bug); S3 cache round-trip verified green end-to-end

**Delivered:** iNat pipeline produces `samples.parquet` (observation_id, observer, date, lat, lon, specimen_count nullable) with S3 caching and full CI integration.

---

## v1.1 URL Sharing (Shipped: 2026-03-10)

**Phases completed:** 1 phase (Phase 7), 5 plans
**Timeline:** ~1 day

**Key accomplishments:**

1. URL query string encoding of map center/zoom and full filter state (taxon, year range, months, selected occurrences)
2. `replaceState` on every `moveend` + debounced `pushState` (500ms) — history explosion avoided while back-button nav works at settled positions
3. `_isRestoringFromHistory` guard + `map.once('moveend')` async reset — prevents popstate→moveend feedback loop
4. Multi-occurrence cluster `o=` encoding — all cluster IDs preserved; sidebar restore correctly shows full cluster
5. URL sharing is fully round-trip: paste URL → exact map view and filter state restored

---

## v1.0 MVP (Shipped: 2026-02-22)

**Phases completed:** 6 phases (Phases 1–6), 13 plans
**Timeline:** 2026-02-18 → 2026-02-22 (4 days)
**Git range:** `feat(pipeline)` → `docs(06-01)`
**LOC:** ~6,172 insertions across 47 files
**Live site:** https://d1o1go591lqnqi.cloudfront.net

**Key accomplishments:**

1. Fixed Ecdysis pipeline end-to-end — `download.py` and `occurrences.py` produce 45,754-row Parquet with all 11 required columns, null coordinates excluded
2. Deployed S3/CloudFront with CDK and OIDC-based GitHub Actions — no stored AWS credentials, auto-deploys on push to main
3. Implemented specimen clustering with recency-aware visual tiers (3 colors) and count-based radius
4. Click-to-detail sidebar showing species, collector, date, and host plant (fieldNumber) for any specimen or cluster
5. Taxon filtering (family/genus/species autocomplete) and year/month date filtering with ghost/match visual feedback
6. Fixed DarwinCore month offset bug — all 12 months correctly reachable in filter checkboxes and sidebar display

**Delivered:** A fully usable static bee atlas — specimen map with clustering, click-detail, taxon/date filters, and automated cloud deployment — live for Washington Bee Atlas volunteer collectors.

### Known Gaps

- **NAV-01**: URL encoding of map view (center, zoom) and filter state not implemented. Phase 7 planned but deferred to v1.1. No `URLSearchParams` or `history.pushState` code exists in the frontend.

---
