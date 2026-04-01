# Washington Bee Atlas

## What This Is

An interactive web map displaying Ecdysis specimen records and iNaturalist collection events for volunteer collectors participating in the Washington Bee Atlas. The site is a static frontend (TypeScript, OpenLayers, Lit, hyparquet) that fetches Parquet and GeoJSON data from CloudFront at runtime — no data files bundled with the build. Five dlt pipelines write to a local DuckDB store (`data/beeatlas.duckdb`); a single export script (`data/export.py`) produces ecdysis.parquet, samples.parquet, counties.geojson, and ecoregions.geojson with spatial joins. Infrastructure is CDK on AWS (S3 + CloudFront), deployed automatically via GitHub Actions OIDC. Pipeline execution is Lambda-based (v1.7 complete); CI runs frontend build only.

## Core Value

Collectors can see where bees have been collected and where target host plants grow, enabling informed planning of future collecting events.

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
- ✓ FETCH-01–03: Frontend runtime fetch from CloudFront /data/; no bundled data files in dist/; loading/error overlay — v1.7
- ✓ CI-01–02: CI frontend-only build; fetch-data.yml deleted; no AWS credentials in build job — v1.7

## Previous Milestones

- v1.6 dlt Pipeline Migration — COMPLETE (2026-03-28)
- v1.7 Production Pipeline Infrastructure — COMPLETE (2026-03-30)
- v1.8 DuckDB WASM Frontend — COMPLETE (2026-04-01)

### Active (v1.8)

- ✓ **DUCK-01**: DuckDB WASM singleton loads ecdysis.parquet + samples.parquet into in-memory tables via PARQUET scan — Phase 30
- ✓ **DUCK-02**: counties.geojson + ecoregions.geojson loaded into DuckDB tables (fetch+registerFileBuffer+read_json; spatial extension deferred to Phase 31/32) — Phase 30
- ✓ **DUCK-03**: Loading/error overlay behavior unchanged; DuckDB init fires non-fatally in parallel with hyparquet — Phase 30
- ✓ **DUCK-04**: EH bundle avoids SharedArrayBuffer/COOP-COEP requirement — Phase 30
- ✓ **FEAT-01**: OL ecdysis features created from DuckDB query; ClusterSource behavior unchanged — Phase 31
- ✓ **FEAT-02**: OL iNat sample features created from DuckDB query; sample layer behavior unchanged — Phase 31
- ✓ **FEAT-03**: hyparquet removed from package.json — Phase 31
- ✓ **FILT-01–05**: Taxon / year / month / county / ecoregion filters expressed as SQL WHERE clauses in DuckDB — Phase 32
- ✓ **FILT-06**: Filter query returns Set&lt;featureId&gt;; OL style callbacks use Set.has() in place of matchesFilter() — Phase 32
- ✓ **FILT-07**: URL round-trip, clear filters, boundary highlight, and autocomplete all preserved — Phase 32

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

Shipped v1.0 on 2026-02-22 (~6,172 lines across 47 files, 4 days). Shipped v1.1 on 2026-03-10 — URL sharing (+324 lines). Shipped v1.2 on 2026-03-11 — iNat pipeline (+5,069/−1,005 lines, 2 days). Shipped v1.3 on 2026-03-12 — links pipeline (+1,405/−31 lines, single day). Shipped v1.4 on 2026-03-13 — sample layer UI (iNat dots, toggle, sidebar detail, iNat links). Shipped v1.5 on 2026-03-27 — geographic region filters (+9,599/−88 lines across 68 files, 4 days). Shipped v1.6 on 2026-03-28 — dlt Pipeline Migration (+3,694/−3,066 lines across 67 files, 1 day). Shipped v1.7 on 2026-03-30 — Production Pipeline Infrastructure (+6,116/−325 lines, 65 files, 10 days): CDK Lambda deployed (abandoned for OOM/timeout); maderas nightly cron (`data/nightly.sh`) is the execution path; data files exported to S3; frontend fetches all data at runtime from CloudFront; CI simplified to frontend-only build; 13 pytest tests cover export schemas and transform logic.

**Tech stack:**
- Frontend: TypeScript, Vite, OpenLayers, Lit (LitElement), @duckdb/duckdb-wasm, temporal-polyfill
- Pipeline: Python 3.14+, uv, dlt[duckdb], duckdb, requests, beautifulsoup4, geopandas
- Infrastructure: AWS CDK v2 (TypeScript), S3 + CloudFront OAC, OIDC IAM role
- CI/CD: GitHub Actions (build on all pushes, deploy on push to main)

**Live site:** https://d1o1go591lqnqi.cloudfront.net

**Known tech debt:**
- `speicmenLayer` typo in `bee-map.ts` (consistent, functions correctly). Trivially fixable but deferred.
- EPA L3 ecoregion CRS risk: `geographies_pipeline.py` calls `.to_crs('EPSG:4326')` before yielding rows — handled for the current ingestion path. Any future shapefile ingestion added to the pipeline must repeat this step or risk silently wrong spatial joins.
- dlt pipeline write-path tests deferred (TEST-03 scope): dlt resource tests skipped in v1.7; only pure-function unit tests and export integration tests covered.
- Lambda infrastructure deployed but not the execution path: CDK/Lambda artifacts live in AWS; maderas cron is authoritative. Lambda will need cleanup or repurposing if execution path changes.

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
*Last updated: 2026-04-01 after Phase 32 complete (SQL Filter Layer)*
