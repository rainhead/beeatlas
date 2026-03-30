# Project Retrospective

*A living document updated after each milestone. Lessons feed forward into future planning.*

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

### Top Lessons (Verified Across Milestones)

1. Human verification at a checkpoint plan is more reliable than automated checks for browser-interactive features
2. Gap closure plans are cheaper to write and execute than getting everything right the first time — ship, verify, fix
3. Discovery/research phases for external APIs and infrastructure are worth the upfront cost — they prevent blocked implementation phases and post-execution fix commits
4. Prototype validation in research prevents inheriting bugs — reading existing code critically is part of research, not just gathering facts
5. CRS validation is a must-do for any external shapefile — silent wrong results from coordinate mismatch are worse than an obvious error
6. Validate infrastructure execution constraints (memory, timeout, filesystem) with real workloads before committing to an architecture
