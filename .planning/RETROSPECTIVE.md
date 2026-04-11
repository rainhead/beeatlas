# Project Retrospective

*A living document updated after each milestone. Lessons feed forward into future planning.*

## Milestone: v2.1 — Determination Feeds

**Shipped:** 2026-04-11
**Phases:** 3 (Phases 42–44) | **Plans:** 3 | **Timeline:** 2 days (2026-04-10 → 2026-04-11)

### What Was Built
- `data/feeds.py`: Atom feed generator for recent determinations — DuckDB read-only query, 90-day window, blank-field exclusion, `ET.tostring+write_text` (avoids BOM)
- Four variant feed families (collector, genus, county, ecoregion) via `write_variant_feed` + `write_all_variants`; `_slugify` for path-traversal-safe filenames; always writes even empty feeds; `write_index_json` produces `feeds/index.json`
- `nightly.sh` refactored to delegate to `run.py` (replaces inline Python heredoc); `aws s3 sync` uploads entire `feeds/` directory to S3
- `<link rel="alternate" type="application/atom+xml">` autodiscovery tag in `frontend/index.html`
- Pre-existing `test_export.py` fixture failures fixed: missing iNat observation columns + stale `occurrenceID` expectation removed

### What Worked
- Single shared module pattern (phases 42 and 43 both extend `data/feeds.py`) eliminated import gaps — no separate modules to wire together
- The 90-day filter + blank-field exclusion design made the main feed immediately useful without requiring a full data fetch; 14 tests covered all behaviors cleanly
- Spatial joins for county/ecoregion variant enumeration reused existing `geographies` tables — no new data needed
- `nightly.sh` heredoc → `run.py` refactor was clean and added missing pipeline steps (geographies, anti-entropy) for free

### What Was Inefficient
- `gsd-tools milestone complete` CLI failed again to extract accomplishments from SUMMARY.md frontmatter (returned "One-liner:" placeholders) — MILESTONES.md required manual correction for the second milestone in a row

### Patterns Established
- **`ET.tostring(encoding='unicode') + write_text`**: avoids BOM that `ET.write(..., encoding='utf-8')` emits; use this pattern for all Atom/XML generation
- **Always-write variant feeds**: even feeds with 0 entries should be written as valid empty Atom (not skipped); feed readers handle empty feeds; missing files are confusing
- **Enumerate from geographies tables, not 90-day window**: county/ecoregion variant enumeration uses the full geographies table, not what appeared in recent data — ensures consistent file set across pipeline runs

### Key Lessons
1. **`milestone complete` accomplishment extraction is broken** — two milestones in a row the CLI returned "One-liner:" placeholders. Always manually write MILESTONES.md accomplishments after running the CLI.
2. **Refactoring shell heredocs to `run.py` delegation is always worth it** — `nightly.sh` had drifted from `run.py`; consolidating added missing steps and made the pipeline single-source-of-truth.
3. **Test fixture columns must track production schema** — the `inaturalist_data.observations` fixture was missing 3 columns that `export.py` LEFT JOINs; schema drift in fixtures is silent until the join is exercised.

### Cost Observations
- Model mix: ~100% sonnet
- Sessions: 2 days
- Notable: Smallest milestone by LOC (+2,682/−157); clean sequencing (core → variants → wiring) with no rework

---

## Milestone: v2.0 — Tabular Data View

**Shipped:** 2026-04-08
**Phases:** 3 (Phases 39–41) | **Plans:** 6 | **Timeline:** 3 days (2026-04-06 → 2026-04-08)

### What Was Built
- `UiState.viewMode` ('map'|'table') in `url-state.ts` with default-omit URL pattern; `bee-sidebar` view toggle row; `bee-atlas` conditional render switching between `<bee-map>` and `<bee-table>`
- `<bee-table>` LitElement: DuckDB-backed pagination via `queryTablePage` (100 rows/page), layer-mode column sets (`SPECIMEN_COLUMN_DEFS` / `SAMPLE_COLUMN_DEFS`), row count indicator, filter integration, sticky header
- `queryTablePage` and `queryAllFiltered` in `filter.ts` — shared `buildFilterSQL` clause builder; allowlist-based SQL injection protection for column names
- CSV export: `buildCsvFilename` (priority-based slugified naming: taxon > collector > year > county/ecoregion), `Download CSV` button in pagination bar, browser blob download in `bee-atlas._onDownloadCsv`
- Post-audit fix: `_runTableQuery` added to DuckDB-ready `firstUpdated` callback so direct-URL `?view=table` populates the table without requiring a round-trip through map view
- SQL injection fix for ecdysis ID validation (Phase 39 code review): `.filter(id => /^\d+$/.test(id))` applied before URL-controlled IDs are interpolated into SQL
- 111 tests total (up from 63); 48 new tests across url-state, filter, and bee-table

### What Worked
- Audit-before-complete workflow caught two real issues: the direct-URL table bug and the undocumented TABLE-05 removal. Both fixed before tagging.
- Phase 41 was genuinely small (1 plan, ~15 min) — CSV export composed cleanly on top of the Phase 40 data layer; no rework needed
- `buildCsvFilename` priority logic (taxon > collector > year > county/ecoregion) was well-specified in context doc; implemented correctly on first attempt with 13 tests

### What Was Inefficient
- Sort-by-column (TABLE-05) was implemented in Phase 40 data layer then silently removed in a subsequent UI refactor — the SUMMARY.md claimed it was shipped but the code didn't have it. The discrepancy was caught by the integration checker during audit, not during the phase. Feature removal should update the phase summary and requirements immediately.
- The gsd-tools `milestone complete` CLI failed to extract accomplishments from SUMMARY.md files (returned "One-liner:" placeholders for 5 of 6 entries) — required manual correction of MILESTONES.md.

### Patterns Established
- **Post-milestone audit catches integration gaps**: the `gsd-audit-milestone` → integration checker pipeline found the direct-URL startup bug that phase verification missed (each phase passed its own verification; the gap was cross-phase)
- **`_runTableQuery` in DuckDB-ready path**: any component that starts hidden (not rendered on page load) cannot rely on `data-loaded` from other components; must trigger its own query in the DuckDB init path

### Key Lessons
1. **Feature removals must update SUMMARY.md and REQUIREMENTS.md at removal time** — not at audit time. A SUMMARY that claims a feature was shipped when it was subsequently removed creates false confidence.
2. **The integration checker is worth running even on small milestones** — the direct-URL table bug was a one-line fix but would have been a confusing user-visible defect for anyone bookmarking a table URL.
3. **Plan the "what if viewMode=table on first load" case explicitly** — components that start hidden in one app mode need an explicit initialization trigger; the `data-loaded` event pattern only works for the default mode.

### Cost Observations
- Model mix: ~100% sonnet
- Sessions: 3 days
- Notable: 3-phase milestone with clean phase sequencing (URL state → component → export); each phase built directly on the previous with no rework

---

## Milestone: v1.9 — Component Architecture & Test Suite

**Shipped:** 2026-04-04
**Phases:** 6 (Phases 33–38) | **Plans:** 13 | **Timeline:** 4 days (2026-03-31 → 2026-04-04)

### What Was Built
- `frontend/src/url-state.ts`: pure module extracting URL serialization from `bee-map.ts`; typed `buildParams`/`parseParams` with zero component or DOM imports
- `frontend/src/bee-atlas.ts`: `<bee-atlas>` coordinator LitElement owning all app state (filter, selection, URL, layer mode, boundary mode); `bee-map` and `bee-sidebar` receive state via properties and emit events up
- `bee-map.ts` refactored to pure presenter: 9 `@property` inputs, 11 `CustomEvent` outputs; no shared state reads; `updated()` as OL synchronization boundary
- `bee-sidebar.ts` decomposed into 4 Lit sub-components: `bee-filter-controls`, `bee-specimen-detail`, `bee-sample-detail`, `bee-sidebar` (thin layout shell)
- Monotonic generation counter in `_runFilterQuery` discards stale DuckDB async results — fixes chip-removal filter flash race condition
- Vitest test suite: 63 tests across 4 files — `url-state.test.ts` (20), `filter.test.ts` (13), `bee-sidebar.test.ts` (28 including Lit render tests), `bee-atlas.test.ts` (2 source analysis tests for ARCH-03)
- `readFileSync` source analysis tests enforce ARCH-03 import graph invariant: `bee-atlas.ts` does not import OpenLayers; siblings have no cross-references

### What Worked
- Coordinator pattern (bee-atlas owns state → presenters receive props → emit events up) was the right architectural move — each component is now independently testable
- `readFileSync` source analysis in Vitest for architectural invariants: avoids DuckDB WASM/OL/happy-dom incompatibility while reliably enforcing import graph contracts; tests run fast and are not flaky
- Phase sequencing (33: test infra → 34: state elimination → 35: URL module → 36: coordinator → 37: decomposition → 38: unit tests) matched the dependency graph exactly — no phase was blocked waiting for another
- Gap closure plan (37-03) was the right vehicle for the generation counter race fix — kept the main decomposition plans clean and added complexity only when the race was confirmed
- Nyquist validation retroactively applied after milestone completion — phases 35, 36, 37, 38 all now compliant

### What Was Inefficient
- Phase 33 and 34 directories were cleaned up before archiving — no VERIFICATION.md available for audit; downstream integration checks had to substitute. Phase directory cleanup should happen after milestone archiving, not before.
- The chip-removal flicker fix (generation counter) required a gap closure plan because the async race wasn't anticipated in the Phase 37 plan — the pattern (`lastFilterGeneration` counter) is a standard async-task-cancellation technique that could have been preemptively included.
- MILESTONES.md reported "4 phases, 7 plans, 13 tasks" but v1.9 was actually 6 phases and 13 plans — the milestone complete tool counted only phases with surviving directories, not the full 33-38 range.

### Patterns Established
- **Coordinator + pure presenter pattern**: one coordinator LitElement owns all app state; sibling presenters have zero cross-imports; enforced via `readFileSync` import-graph test
- **`updated(changedProperties)` as OL sync boundary**: fire targeted OL operations only when relevant properties changed; replaces ad-hoc watchers and avoids over-triggering
- **Monotonic generation counter for async-results races**: increment counter before async call; check on return; discard if counter has advanced — standard pattern for any async query that can be superseded
- **`readFileSync` source analysis tests in Vitest**: check architectural invariants without needing DOM or DuckDB; runs in <1ms; survives refactors that rename symbols

### Key Lessons
1. **Archive phase directories after milestone completion, not before** — VERIFICATION.md files are the audit evidence. Cleaning up directories before the milestone audit creates documentary gaps that require extra inference work.
2. **Async task cancellation is a standard pattern, not an edge case** — any component that fires async queries on user input (filter changes, chip removal) will race. Plan for a generation counter or AbortController from the start.
3. **Source analysis tests are the right tool for import graph contracts** — AST-based or string-search tests on the actual files are more reliable than "trust the developer" documentation for architectural invariants like sibling isolation.

### Cost Observations
- Model mix: ~100% sonnet
- Sessions: 4 days
- Notable: 6-phase milestone with 63 tests delivered in 4 days; coordinator pattern established a clean foundation for future component additions

---

## Milestone: v1.8 — DuckDB WASM Frontend

**Shipped:** 2026-04-01
**Phases:** 3 (Phases 30–32) | **Plans:** 5 | **Timeline:** 1 day (2026-03-31 → 2026-04-01)

### What Was Built
- `frontend/src/duckdb.ts`: DuckDB WASM EH-bundle singleton with `getDuckDB()` / `loadAllTables()`; ecdysis + samples via HTTP parquet scan; counties + ecoregions via fetch+registerFileBuffer+read_json; `tablesReady` promise gates feature creation
- `EcdysisSource` + `SampleSource` VectorSource subclasses: query DuckDB `SELECT` on load; replace hyparquet `ParquetSource`/`SampleParquetSource`; `hyparquet` removed from package.json
- `frontend/src/filter.ts`: `buildFilterSQL()` composes SQL WHERE clause from FilterState; `queryVisibleIds()` returns `{ecdysis: Set<string>|null, samples: Set<string>|null}`; `setVisibleIds()` updates module-level singletons
- `frontend/src/style.ts`: OL style callbacks switched from `matchesFilter(f)` to `visibleEcdysisIds?.has(id) ?? true`; `matchesFilter()` removed
- `frontend/src/bee-map.ts`: all filter call sites rewired to await `queryVisibleIds`; URL restore, polygon click, boundary mode, and clear-filters all call `_runFilterQuery()`; loading overlay held until filter applied
- Gap fixes (32-03): `countySource.loadFeatures()` + `ecoregionSource.loadFeatures()` at module scope in `region-layer.ts` for eager fetch; `_setBoundaryMode(mode, skipFilterReset=false)` to preserve county/ecoregion selections when called from `_applyFilter`

### What Worked
- Phase sequencing (30: init, 31: feature creation, 32: filter layer) was clean — each phase produced working, verifiable output before the next started
- DuckDB WASM EH bundle choice (vs threads) avoided CloudFront header changes — correct architectural choice made in research before writing a line of code
- Pre-joined county/ecoregion_l3 columns in parquet meant no spatial SQL needed — the v1.5 pipeline investment paid off here
- 3-phase milestone in 1 day — the DuckDB WASM direction was well-researched and the data model was already right

### What Was Inefficient
- Two UAT failures required a gap closure plan (32-03): county/ecoregion dropdowns empty on load and sidebar counts not updating. Both root causes were OL VectorSource lazy-loading and `_setBoundaryMode` clearing filterState — both were foreseeable at planning time if the OL VectorSource lazy-fetch behavior had been checked.
- The checkpoint plan 32-02 (human browser test) ran a full UAT that found 2 major issues. Earlier automated testing of the dropdown population path might have caught gap 1 before UAT.

### Patterns Established
- **OL VectorSource with `url` option is lazy** — `loadFeatures()` must be called explicitly if the source is attached to an invisible layer and needed for UI population before the layer becomes visible
- **DuckDB WASM spatial extension cannot read registered URL files** — load GeoJSON via `fetch()` → `registerFileBuffer()` → `read_json()` instead
- **`buildFilterSQL()` returns plain SQL string** — DuckDB WASM `query()` does not support parameterized queries; string interpolation with input validation is the correct approach for client-side trusted filter state
- **tablesReady Promise as initialization contract** — any module that queries DuckDB must await `tablesReady` before issuing queries; this is the clean boundary between init and use

### Key Lessons
1. **Check OL source lifecycle before wiring `once('change')` handlers** — if the source's layer starts invisible, the source never fetches and the handler never fires. Either call `loadFeatures()` eagerly or check layer visibility in the handler.
2. **Trace filter state mutation before writing `_applyFilter`** — any method called inside `_applyFilter` that also mutates filterState will produce silent wrong results. Map the full mutation chain before planning.
3. **DuckDB WASM bundle choice is architectural, not a detail** — EH vs threads vs MVP bundles have different constraint profiles (COOP/COEP, SharedArrayBuffer, size). Decide in research, not mid-implementation.

### Cost Observations
- Model mix: ~100% sonnet
- Sessions: 1 day
- Notable: Fastest DuckDB integration possible — research from memory (DuckDB direction already in project memory) meant no external research phase needed

---

## Milestone: v1.7 — Production Pipeline Infrastructure

**Shipped:** 2026-03-30
**Phases:** 5 (Phases 25–29) | **Plans:** 5 | **Timeline:** 10 days (2026-03-20 → 2026-03-30)

### What Was Built
- CDK Lambda stub: `DockerImageFunction` (Python 3.14), `EventBridgeScheduler` (nightly iNat + weekly full), Lambda Function URL; S3 round-trip verified live
- Production Lambda handler + Dockerfile: uv multi-stage build, env-var pipeline dispatch, DuckDB /tmp round-trip, S3 export, CloudFront invalidation
- `data/nightly.sh` cron on maderas: full pipeline → export → S3 upload → DuckDB backup → CloudFront invalidation (~2.5 min); Lambda execution path abandoned
- pytest suite: 13 tests, programmatic DuckDB fixture (embedded WKT constants), export.py integration tests, `_transform()` and `_extract_inat_id()` pure function unit tests
- Frontend runtime fetch: CloudFront `/data/*` cache behavior (CORS, Origin in cache key, Range headers); bundled Parquet/GeoJSON removed; loading/error overlay
- CI simplified: `fetch-data.yml` deleted; `deploy.yml` is checkout → install → validate-schema (CloudFront Range) → build; no AWS credentials in build job

### What Worked
- Lambda CDK deployment went smoothly — stub approach (verify S3 round-trip before real handler) de-risked infra before touching pipeline code
- Using embedded WKT string constants (not a committed binary `.duckdb`) for test fixtures was clean — avoids binary-in-git, programmatic fixture is self-documenting
- Pivot decision was fast: Lambda blockers (OOM, timeout, read-only fs) were concrete and immediate; maderas cron was a drop-in replacement; no sunk cost paralysis
- Phase sequencing (25: infra, 26: handler, 27: tests, 28: frontend, 29: CI) was the right order — each phase built on verified prior work

### What Was Inefficient
- Lambda was attempted and abandoned (Phases 25–26): geographies OOM, 15-min timeout, read-only filesystem, missing home directory, iNat auth all blocked Lambda. Two phases of work produced CDK infrastructure that isn't the execution path. These phases validated the infra design but the execution pivot was costly.
- asyncBufferFromUrl `{ url }` vs bare string bug in Phase 29 was a hyparquet API detail that should have been caught in research — cost one debug cycle

### Patterns Established
- **Lambda stub before real handler**: deploy a no-op stub that validates infra assumptions (S3 round-trip, env vars, timeout) before writing real handler code
- **monkeypatch.setattr over env var for module-level globals**: if a module reads a global at import time, env var override is unreliable — monkeypatch the attribute directly in pytest
- **hyparquet asyncBufferFromUrl**: requires `{ url }` object form, not bare string — document at call site
- **CloudFront CORS + Range**: CachePolicy must include Origin in allowList (not CACHING_OPTIMIZED) AND S3 CORS must expose Content-Range/ETag headers — both required together

### Key Lessons
1. **Validate Lambda constraints before committing to the execution path** — OOM, filesystem, timeout, and network auth all need confirming with real workloads before architecture lock-in. A "Lambda viability check" plan at the start would have caught these faster.
2. **Embedded WKT string constants are better than committed DuckDB binaries** — programmatic fixtures using string literals are self-documenting, diffable, and don't grow the repo with binary data.
3. **CloudFront CORS + Range is a two-part configuration** — CachePolicy and S3 CORS must both be configured together or Range requests will fail silently for cross-origin fetches.

### Cost Observations
- Model mix: ~100% sonnet
- Sessions: 10 days
- Notable: Lambda pivot mid-milestone was the right call despite the sunk cost; maderas cron runs 6x faster than Lambda would have

---

## Milestone: v1.5 — Geographic Regions

**Shipped:** 2026-03-27
**Phases:** 4 (Phases 16–19) | **Plans:** 20 | **Timeline:** 4 days (2026-03-14 → 2026-03-18)

### What Was Built
- `data/spatial.py`: `add_region_columns()` — two-step geopandas sjoin (within + sjoin_nearest fallback); handles three coordinate column conventions; EPSG:32610 for deduplication; applied to both ecdysis and iNat pipelines
- `data/scripts/build_geojson.py`: GeoJSON boundary generator with download-if-missing, WA filter, 0.006° simplification; produces `wa_counties.geojson` (56 KB) and `epa_l3_ecoregions_wa.geojson` (357 KB)
- `scripts/validate-schema.mjs`: county and ecoregion_l3 added to CI schema contract for both parquets
- `frontend/src/region-layer.ts`: OL VectorLayer backed by GeoJSON county and ecoregion sources; transparent fill for interior hit detection
- `frontend/src/filter.ts`: FilterState extended with `selectedCounties` and `selectedEcoregions` Sets; AND-across-types / OR-within-type semantics in `matchesFilter()`
- `frontend/src/bee-map.ts`: `boundaryMode` @state with 3-state toggle; polygon singleclick with specimen/sample click priority; bm=/counties=/ecor= URL round-trip; single-select (replace) and shift-click multi-select with blue highlight; sample dot ghosting outside selected regions
- `frontend/src/bee-sidebar.ts`: boundary toggle (Off/Counties/Ecoregions); county and ecoregion datalist autocomplete with removable chips; Clear filters extended to reset region Sets

### What Worked
- TDD-first approach for spatial join (Phase 16-01 test scaffold before implementation) gave concrete contracts — add_region_columns(), build_county_geojson(), build_ecoregion_geojson() all had test-defined signatures before being written
- Committing GeoJSON boundary files to git (not generating at CI time) was the right call — eliminated workflow complexity and S3 download risk in CI
- CRS validation in research phase caught the EPA shapefile non-EPSG CRS issue before it could produce silently wrong results — the `.to_crs('EPSG:4326')` fix was pre-emptive
- Gap closure plans (18-03: regenerate parquets with region columns; 18-04: polygon highlight) kept the core plans clean and added complexity only when confirmed needed
- Module-level county/ecoregion options with Set deduplication (Phase 19) was a clean sidebar implementation — 80 ecoregion features → 11 unique names computed once

### What Was Inefficient
- Phase 18 required two gap closure plans: parquet regeneration (18-03) was necessary because the live S3 parquets predated the spatial join, and polygon highlight (18-04) was easier to scope after seeing the base filter working. Both were predictable at planning time — the "gap closure" framing worked but earlier scoping would have been cleaner.
- The ROADMAP.md showed Phase 18 as "🚧 in progress" past completion — state tracking between plans lagged the actual execution state.

### Patterns Established
- **EPA L3 ecoregion CRS**: always call `.to_crs('EPSG:4326')` before sjoin; non-EPSG spherical Lambert AEA is silent wrong-results risk
- **Nearest-polygon fallback**: ~0.9% of WA specimens fall outside ecoregion boundaries; sjoin_nearest on EPSG:32610 is the fix; apply after 'within' sjoin
- **OL polygon hit detection**: transparent `Fill(rgba 0,0,0,0)` required for interior clicks; OL only hit-detects rendered pixels
- **Polygon click priority**: check specimen/sample hits BEFORE polygon click handler; polygon-first swallows specimen clicks when boundary overlay is active
- **vite.config.ts geojson plugin**: `readFileSync + export default; map: null` — pattern reusable for any static JSON asset type

### Key Lessons
1. **CRS validation before any spatial join** — any shapefile from an external source should have its CRS inspected and converted to EPSG:4326 before joining. Silent wrong results from Lambert AEA coordinates treated as lat/lon are hard to diagnose.
2. **Commit boundary files to git, not to CI** — for static geographic reference data that changes infrequently, committing to git is simpler than S3 download steps in CI. The 413 KB total is well within git budget.
3. **Transparent fill is not optional for polygon click** — OL hit detection is pixel-based. A polygon with no fill is invisible to clicks in its interior; must use rgba(0,0,0,0) fill.

### Cost Observations
- Model mix: ~100% sonnet
- Sessions: 4 days
- Notable: 7-plan Phase 16 was the most complex single phase in the project; TDD scaffold in plan 1 kept the subsequent implementation plans well-targeted

---

## Milestone: v1.3 — Specimen-Sample Linkage

**Shipped:** 2026-03-12
**Phases:** 2 (Phases 11–12) | **Plans:** 4 | **Timeline:** Single day

### What Was Built
- `data/ecdysis/occurrences.py`: `occurrenceID` added to `ecdysis.parquet` column selection (pd.StringDtype)
- `data/links/fetch.py`: full links pipeline — `fetch_page`, `extract_observation_id`, `run_pipeline`; two-level skip (links.parquet then disk HTML); ≤20 req/sec rate limit; BeautifulSoup CSS selector `#association-div a[target="_blank"]`; 11 unit tests
- `scripts/cache_restore_links.sh` + `scripts/cache_upload_links.sh`: S3 persistence mirroring the v1.2 iNat cache script pattern
- `package.json` scripts: `cache-restore-links`, `cache-upload-links` (fetch-links was added by Phase 11); `build-data.sh` extended with cache restore → fetch → cache upload block

### What Worked
- TDD stub approach (Phase 11 creates failing tests, Phase 12 makes them pass) gave a clear implementation target and caught the `last_fetch_time` initialization bug before any real HTTP requests
- Reusing the existing `cache_restore.sh` / `cache_upload.sh` pattern made Phase 12 trivial — same structure, same S3 path conventions, same `|| echo` / `set -euo pipefail` asymmetry
- The research phase correctly identified the prototype bug (UUID `occurrenceID` used as `occid` URL param instead of integer `ecdysis_id`) before any code was written — saved a silent wrong-data bug
- Two waves across two plans kept concerns cleanly separated: foundation + tests (11-01) vs. implementation (11-02)
- `cd "$REPO_ROOT"` before npm commands in build-data.sh was anticipated in the plan (integration checker flagged it as a noteworthy pre-emptive fix)

### What Was Inefficient
- No VERIFICATION.md produced (verifier disabled in config) — integration checker filled the gap but this required manual audit work at milestone completion
- Phase 11 VALIDATION.md scaffolded but `nyquist_compliant` never updated to true — Nyquist validation was left in draft state throughout
- Phase 12 had no research phase (planned without it) and no VALIDATION.md — acceptable for a purely mechanical wiring phase, but consistency would be cleaner

### Patterns Established
- Use integer DB id (`ecdysis_id`) not UUID string (`occurrenceID`) for Ecdysis individual record page URLs — UUID is the DarwinCore identifier, integer is the database key used in URLs
- TDD: create failing test stubs in one plan, implement in the next — even for short milestones this gives a clean pass/fail test gate
- `last_fetch_time = time.monotonic()` (not `0.0`) to enforce rate limit on the first HTTP request, not just subsequent ones

### Key Lessons
1. **Prototype bugs are silent until tested** — the existing `fetch_inat_links.py` prototype was structurally correct but used the wrong ID type as the URL parameter. Research that reads and validates existing code prevents inheriting bugs.
2. **Reusing established patterns is fast** — the S3 cache scripts for v1.3 took ~3 minutes because the v1.2 pattern was well-established. Pattern documentation in PROJECT.md pays forward.
3. **TDD stubs in Phase N, implementation in Phase N+1** — clear contract definition before implementation reduces ambiguity and makes the executor's job mechanical.

### Cost Observations
- Model mix: 100% sonnet
- Sessions: 1 day (2026-03-12 — plan + execute + complete)
- Notable: Fastest milestone yet — TDD stubs + established patterns kept implementation predictable

---

## Milestone: v1.2 — iNat Pipeline

**Shipped:** 2026-03-11
**Phases:** 3 (Phases 8–10) | **Plans:** 5 | **Timeline:** 2 days

### What Was Built
- `data/inat/observations.py`: field ID constants (SPECIMEN_COUNT_FIELD_ID=8338) confirmed from live API; `extract_specimen_count()` with nullable return
- `data/inat/download.py`: full pyinaturalist pipeline — incremental fetch with `merge_delta`, fallback to full on error, progress logging, 15 unit tests
- `scripts/cache_restore.sh` and `scripts/cache_upload.sh`: S3 cache round-trip with graceful miss handling and hard-fail on upload error
- CI `deploy.yml` updated: `S3_BUCKET_NAME` env at job level, cache-restore/build/cache-upload steps in both build and deploy jobs; credential ordering bug fixed

### What Worked
- Discovery phase (Phase 8) paid off: confirming field_id vs name matching before writing download.py prevented a ~40% data loss bug that would have been subtle to diagnose
- Phase 8's "live API inspection" approach gave concrete constants rather than guesses; OFVS_IN_DEFAULT_RESPONSE confirmed to be True without trial-and-error in Phase 9
- Existing IAM role already covered the S3 cache prefix — no new CDK changes needed (Phase 8 investigation saved wasted Phase 9 work)
- Unit tests for `obs_to_row`, `build_dataframe`, `merge_delta`, and export completeness caught the raw-dict-vs-model-object issue early

### What Was Inefficient
- The pyinaturalist model attribute access approach in the initial download.py plan failed at runtime (raw API dicts needed instead) — a PITFALLS.md entry existed for this but wasn't acted on in initial plan
- Three iNat-related `fix()` commits after Phase 9 completion: `location` is a list not string, raw dicts not model objects, `order_by` conflicts with paginator — these should have been discovered in Phase 8 API inspection
- `observations.ndjson` full-JSON cache was added as a post-milestone quick task — if it had been scoped into v1.2 it could have been done in one plan instead of a retroactive patch

### Patterns Established
- Match iNat observation fields by `field_id` (integer), not `name` string — names can be renamed by project admins; field IDs are stable
- Parse raw API response dicts when pyinaturalist model access is unreliable — `obs['ofvs']` not `obs.ofvs` for observation field values
- S3 cache scripts: use `|| echo "cache miss"` pattern with `set -euo pipefail` to allow graceful miss without aborting the build
- `samples.parquet` stub (zero rows, correct schema) must be committed and force-tracked before any feature branch that references it — prevents CI failure on cold start

### Key Lessons
1. **Discovery phase for external APIs is essential** — field IDs, response shapes, and API version behaviors cannot be reliably inferred from docs alone. A dedicated "confirm from live API" phase step pays for itself immediately.
2. **PITFALLS.md entries need to be in the plan, not just the research doc** — the raw-dict vs model-object pitfall was documented but not surfaced in the Phase 9 plan; it caused post-execution fix commits.
3. **Incremental fetch fallback should catch all exceptions, not just specific ones** — any corrupt cache state or network hiccup should trigger full re-fetch; defensive fallback makes the pipeline robust to unknown failure modes.

### Cost Observations
- Model mix: 100% sonnet
- Sessions: 2 days (2026-03-10 planning + execution, 2026-03-11 CI verification + quick task)
- Notable: Phase 8 discovery paid for itself — zero blocked phases, no IAM changes needed, field ID confirmed upfront

---

## Milestone: v1.1 — URL Sharing

**Shipped:** 2026-03-10
**Phases:** 1 (Phase 7) | **Plans:** 5 | **Sessions:** 2

### What Was Built
- URL state synchronization for map view (center/zoom) and all active filters (taxon, year range, months) encoded as query string params
- Shareable URLs: copying the browser URL and opening in a new tab restores the exact same map position and filter state
- Browser back/forward navigation between settled map views (500ms debounce before pushState)
- Multi-occurrence cluster URL encoding: `o=ecdysis:id1,ecdysis:id2` preserves full cluster selection across tabs

### What Worked
- Gap closure workflow caught all real issues: the initial implementation had 2 gaps (back button, o= param) that human verification found; 3 targeted fix plans resolved them cleanly
- Two-phase approach (implement → human verify → gap close → re-verify) gives high confidence without over-engineering upfront
- Plan checker identified the `_isRestoringFromHistory` async timing subtlety before execution, which helped the executor pick the right `map.once('moveend')` approach first try

### What Was Inefficient
- The `_isRestoringFromHistory` bug required gap closure despite the root cause being identified in research — the initial plan didn't fully internalize the async OL moveend timing and produced synchronous reset code
- Three separate o= bugs (strip on load, single-ID encoding, no re-push after restore) could have been caught by a more thorough initial review of `firstUpdated` and the singleclick handler
- PROJECT.md had stale content (NAV-01 listed as Out of Scope for v1.2, Current Milestone still pointing to iNat) — required manual cleanup at milestone completion

### Patterns Established
- `map.once('moveend', ...)` for deferred flag reset after programmatic OL view changes — synchronous reset is wrong, OL fires moveend asynchronously after DOM repaint
- Lit `updated()` pattern for URL-pushed restore props: BeeMap pushes 6 `@property` restore fields; BeeSidebar mirrors to `@state` via `updated()` — clean separation, no prop drilling through OL event callbacks
- Comma-separated IDs in a single URL param (`o=`) for multi-item selection — simpler than multiple params, easy to split/join

### Key Lessons
1. **OL async event timing is subtle** — `moveend`, `singleclick`, and `change` all fire asynchronously. Any guard flag reset or state push that depends on "after OL does X" must use `map.once(event, cb)`, not synchronous code after the OL method call.
2. **Human verification is a first-class plan** — having a dedicated checkpoint plan (07-02, 07-05) with explicit scenarios made gap tracking clean and gave a clear pass/fail record.
3. **URL param stripping on initial load is an easy-to-miss bug** — when implementing URL restore, verify that the first `replaceState` call preserves all incoming params, not just the ones your code "knows about" at that point in initialization.

### Cost Observations
- Model mix: 100% sonnet (executor, planner, checker, verifier all sonnet)
- Sessions: 2 working days (2026-02-25 planning start, 2026-03-09 execution)
- Notable: Single-phase milestone kept orchestrator context very lean; parallel wave 1 (07-03 + 07-04) saved ~3 min vs sequential

---

## Cross-Milestone Trends

### Process Evolution

| Milestone | Sessions | Phases | Key Change |
|-----------|----------|--------|------------|
| v1.0 | ~4 | 6 | Established baseline GSD workflow for this project |
| v1.1 | 2 | 1 | First use of gap closure cycle (human verify → plan gaps → re-verify) |
| v1.2 | 2 | 3 | First external API pipeline; discovery phase proved essential for external data sources |
| v1.3 | 1 | 2 | First scraping pipeline; TDD stub pattern + reuse of established S3 cache scripts made it the fastest milestone |
| v1.5 | 4 | 4 | First geospatial feature; 7-plan pipeline phase + 3-phase frontend stack; gap closure scoped correctly after core confirmed working |
| v1.6 | 1 | 5 | dlt migration; fastest milestone — established patterns made each phase mechanical |
| v1.7 | 10 | 5 | First infra pivot mid-milestone; Lambda abandoned for maderas cron; frontend fully decoupled from build-time data |
| v1.8 | 1 | 3 | DuckDB WASM replaces hyparquet; SQL filter layer; hyparquet removed; all in 1 day on pre-laid foundation |
| v1.9 | 4 | 6 | Coordinator pattern + pure presenters; sidebar decomposed into 4 sub-components; 63-test Vitest suite; generation counter race fix |

### Top Lessons (Verified Across Milestones)

1. Human verification at a checkpoint plan is more reliable than automated checks for browser-interactive features
2. Gap closure plans are cheaper to write and execute than getting everything right the first time — ship, verify, fix
3. Discovery/research phases for external APIs and infrastructure are worth the upfront cost — they prevent blocked implementation phases and post-execution fix commits
4. Prototype validation in research prevents inheriting bugs — reading existing code critically is part of research, not just gathering facts
5. CRS validation is a must-do for any external shapefile — silent wrong results from coordinate mismatch are worse than an obvious error
6. Validate infrastructure execution constraints (memory, timeout, filesystem) with real workloads before committing to an architecture
