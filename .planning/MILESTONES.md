# Milestones

## v7.0 Species Trait Annotations (Shipped: 2026-06-30)

**Phases completed:** 2 phases (173 Species Trait Data Layer — shipped ad-hoc; 174 Surface Traits in the Site — 3 plans / 8 tasks). Timeline: 2026-06-29 → 2026-06-30. Merged via PR #39. **Requirements:** TRAIT-DATA-01..03 + TRAIT-UI-01..05 satisfied.

**Key accomplishments:**

- **`species_traits` dbt mart** — one row per species with curated ecological traits (sociality, nesting, diet breadth + host plant, native status, cuckoo host bee) assembled from three license-clean seeds (USGS Bee-Gap 2017 PD, Fowler & Droege specialist list, a genus-level backbone). Every label carries a `*_source` provenance column; seed join keys route through `int_synonyms`. Also fixed a latent synonymy gap in the checklist/ecdysis arms.
- **Traits surfaced site-wide** — a "Traits" definition list on the species detail page (linked cleptoparasite host bees, native `title=` provenance tooltips, friendly domain labels) plus compact sociality + Specialist badges on the species index tree, genus, and subgenus pages — all build-time Nunjucks, zero JS.
- **Path B delivery** — trait fields merged into `species.json` through the existing fetch-at-build pipeline with `species.parquet`'s schema unchanged (22 cols); no committed `public/data/` artifacts, static hosting preserved.
- **Post-merge polish** — surfaced the specialist host plant for the 44% of Fowler specialists that carried only a genus-level host (e.g. *Andrena frigida* → "Specialist (Salix)"); alphabetized genus/subgenus species lists; restructured the species detail hero into a 2×2 grid.

**Known deferred items at close:** the `checklist_count=0` vs `on_checklist=true` detail-page display issue (`.planning/todos/pending/checklist-count-zero-but-on-checklist.md`), plus pre-existing tech debt (16 older UAT gaps + 3 prior todos) acknowledged and deferred — see STATE.md Deferred Items. Operator action pending: one-time `SKIP_INTEGRATION_GATE=1 bash data/nightly.sh` on maderas to refresh the S3 `species.json` baseline.

---

## v6.0 My Work — Progress & Provenance (Shipped: 2026-06-28)

**Phases completed:** 7 phases (167–172, incl. inserted 171.1), 16 plans. Timeline: 2026-06-25 → 2026-06-28. **Requirements:** 17/17 v1 satisfied (audit `tech_debt` — no blockers; `v6.0-MILESTONE-AUDIT.md`).

Stood up the first **"work" surface** — a bookmarkable, no-auth, public per-collector page showing the collection→ID lifecycle as an event stream and accomplishments as coverage/breadth — on a rebuilt occurrence model that replaced the mutually-exclusive `source` enum with orthogonal facets and added collector-identity + lifecycle-date columns to the mart. Cross-phase integration verified clean (5/5 seams, 0 broken wires).

**Key accomplishments:**

1. **Phase 167 — Collector identity column:** unified `collector_inat_login` COALESCE (`host_inat_login` > `specimen_inat_login` > `user_login` — host-first, corrected post-ship so the sample owner wins over a third-party specimen-photo poster) projected through the occurrences mart across all 5 `int_combined` arms; dbt contract 36→37; data-before-code S3 release; `assert_collector_prefers_host` test. The keystone column every per-collector query depends on. (1 plan.)
2. **Phase 168 — Temporal lifecycle dates:** added a single `id_date VARCHAR` column (Ecdysis `date_identified`, dirty-parse: year-only + full ISO verbatim, garbage NULLed) so a specimen history reads as a two-event **Collected→Identified** timeline; contract 37→38. Scope narrowed in discuss (D-02): `posted_date`/iNat `created_at` deliberately dropped (posting is not an event); TEMP-02 satisfied structurally by the existing ARM-3 de-dup. (1 plan.)
3. **Phase 169 — Per-collector static pages:** `collectors_export.py` → 124 bookmarkable `/collectors/{login}/` Eleventy pages (headline stats, species-level pending-vs-identified status split, `?collectors=` map deep-link) + a `/collectors.html` index roster; gated on `collector_inat_login IS NOT NULL` (casual observers excluded). (2 plans.)
4. **Phase 170 — Source → provenance facets rebuild:** replaced the `source` enum with orthogonal `tier` (atlas/other) + `record_type` (specimen/provisional_sample/waba_specimen/inat_expert/checklist) across all three `occ_id`-coupled consumers (`src/occurrence.ts`, `src/filter.ts`, `occurrence_places.sql`) in one atomic commit with a positional-coupling Vitest assertion; tier-driven map filter/symbology/detail-card; `tier=` URL param with legacy `src=` back-compat; `inat_obs`→`inat_expert` rename; contract 38→39. (2 plans.)
5. **Phase 171 — Per-collector event stream:** reverse-chronological Collected→Identified `<table>` feed on the collector page (full re-determination history; rank-aware BeeAtlas + iNaturalist `/taxa/` fallback links; per-collector Atom subscribe feed), `waba_specimen` cataloguing as one continuous row (no fake event), Eleventy-paginated sub-pages for high-volume collectors. Operator UAT approved after 6 revisions. (3 plans.)
6. **Phase 171.1 (INSERTED) — Collector data delivery rebuild:** moved `collectors.json` + `collector_event_pages.json` (29 MB+) off git onto the `species.json` S3 + `manifest.json` + `deploy.yml` fetch pattern; committed tiny synthetic fixtures outside `public/data/` + `existsSync` guard so a clean checkout is `npm test`/`npm run build`-green with zero S3 access. Fixes a Phase 171 committed-artifact defect. (4 plans.)
7. **Phase 172 — Accomplishment view:** county coverage SVG map, taxonomic-breadth species list, ecoregion breadth, and "active since YYYY (N seasons)" badge on the collector page — all aggregated over the Phase 170 `tier='atlas'` facet (uncatalogued specimens count). Map delivery redesigned mid-UAT from 248 per-collector SVGs (~122 MB) to two committed shared base-map partials inlined + highlighted per-collector via a CSS `<style>` block — no per-collector files, no JS. Operator UAT PASS after 2 gap-closure passes. (5 plans.)

**Delivered:** A volunteer collector can now visit a bookmarkable public page and see — with no login — their specimens/samples/species headline, whether their bees got IDed, a chronological collection→ID event feed, and their county/ecoregion/taxonomic coverage, all on an occurrence model whose `source` enum was replaced by orthogonal collector/place/taxon/time/provenance facets.

### Known Gaps / Deferred

- **Operational (not a code gap):** the data leg of 167/168/170 (dbt contract 37→38→39 cols) lands in live S3 via the operator nightly on maderas. The nightly is **unblocked** (Phase 163 Ecdysis-auth was resolved 2026-06-24, before these contract bumps landed), so the data leg is very likely live; worth a one-time confirm that the latest nightly published cleanly and prod renders collector pages. *(Corrected 2026-06-29: the milestone close initially mis-tracked Phase 163 as an open blocker from a stale STATE.md entry — it was already complete.)*
- **Intentional scope narrowing:** TEMP-01's `posted_date`/`created_at` dropped per 168 D-02 (reconciled in `v6.0-REQUIREMENTS.md` outcomes).
- **Nyquist:** all 7 phases `nyquist_compliant: false` (formal Wave-0 scaffold incomplete) — accepted per the project's partial-Nyquist convention; phases shipped with green suites (npm 892 / pytest 281) + operator UATs.
- **Process:** Phase 167 has no standalone VERIFICATION.md (verified inline in SUMMARY + VALIDATION.md). Stale todo `rebuild-source-into-facets.md` (shipped as Phase 170) — close it.
- Known deferred items at close: see STATE.md Deferred Items; the milestone open-artifact audit showed 17 items, all verified non-blocking (UAT files with 0 pending scenarios, deferred non-blocking code-review todos, one old CONTEXT open-question).

---

## v5.2 Place Coverage Expansion (Shipped: 2026-06-24)

**Phases completed:** 3 phases (160–162), 8 plans. Timeline: 2026-06-23 → 2026-06-24.

Made the place model overlap-capable, then added two new curated place sources on top of it. No formal REQUIREMENTS.md (sources promoted from backlog); each phase verified individually + operator UAT.

**Key accomplishments:**

1. **Phase 160 — Overlap-capable place model (many-to-many):** introduced the `occurrence_places` bridge mart (one row per occurrence↔place membership, keyed on a synthetic `occ_id` mirroring `occIdFromRow`), **dropped** the scalar `place_slug` from the occurrences mart (dbt contract 37→36 cols), removed the `ST_Overlaps` rejection guard, and rewrote per-place counts/maps + the frontend filter (`filter.ts`) to an `EXISTS` membership test. A bee occurrence can now belong to multiple overlapping places. (4 plans.)
2. **Phase 161 — 33 WDFW wildlife areas:** committed `data/add_wdfw_wildlife_areas.py` (WDFW ArcGIS REST → DuckDB dissolve-by-area → 33 MultiPolygon `[[places]]` entries, Jackman Creek excluded, zero new deps); the 16 WDFW↔existing overlaps load cleanly as multi-place membership. Simplified to `0.0005°` → `places.geojson` 896 KB. (2 plans.)
3. **Phase 162 — 13 WTA hike corridors:** committed `data/add_hikes_as_places.py` solving the linear-feature problem — OSM/Overpass trail line → ~250 m **corridor buffer** in a metric CRS (UTM 10N, `always_xy=true`) → MULTIPOLYGON. Source is OSM only (WTA ToS forbids scraping); 13 of 14 shipped (`snoqualmie-pass-to-olallie-meadow-trail` deferred — OSM only had the full ~75 km PCT Section J). `places.geojson` 920 KB at tol=0.0002°. (2 plans.)
4. **Reusable place-source curation pattern** established and reused across 161/162: fetch authoritative geometry → DuckDB-spatial transform → `ST_SimplifyPreserveTopology` for browser weight → emit TOML via the shared `toml_block()` writer. Both code-review passes hardened the scripts (TOML escaping + `tomllib` round-trip, the `always_xy` `(inf,inf)` regression guard, OSM geometry-assembly correctness).

**Delivered:** A bee occurrence can now belong to multiple overlapping places, and the place layer gained two new curated sources — 33 WDFW wildlife areas and 13 WTA hike corridors — all surfaced as filterable "Regions" on the map.

### Known Gaps / Deferred

- `snoqualmie-pass-to-olallie-meadow-trail` deferred (OSM lacks a day-hike-scoped geometry); re-add with hand-traced GPX later.
- New backlog: 999.10 (sidebar list ignores `src=` source filter), 999.11 (federal wilderness areas as regions).
- Known deferred items at close: pre-existing non-blocking 144 code-review todo + carried-forward UAT/Nyquist/verification items (see STATE.md Deferred Items); milestone open-artifact audit showed 12 items, all verified non-blocking (passed/approved UAT with 0 pending scenarios, resolved CONTEXT open-questions).

---

## v5.1 Housekeeping (Shipped: 2026-06-23)

**Phases completed:** 5 phases (155–159), 7 plans. Timeline: 2026-06-21 → 2026-06-23.

Post-v5.0 cleanup — five independent items promoted from the backlog. No formal REQUIREMENTS.md (housekeeping milestone); each phase verified individually.

**Key accomplishments:**

1. **Phase 155 — Shift-drag bounds discoverability:** desktop-only hint "Shift-drag on map to set bounds" below the where input (`.hint` reuse, `@media (hover: hover) and (pointer: fine)` gate, hidden on touch). Makes the bounds-**filter** gesture discoverable with zero behavior change.
2. **Phase 156 — Bounds FILTER vs SELECTION separation:** made the state model and URL contract honest — a spatial box is a FILTER (`FilterState.bounds`, serialized `bbox=`); SELECTION (`o=`) is per-record only. Removed the legacy `_selectionBounds`/`sel=`-write/`_applyBoundsSelection` plumbing; bounds + selection now coexist; legacy `?sel=` links still restore. (3 plans, 815 tests green.)
3. **Phase 157 — Regions dropdown stacking fix:** relocated the region control out of `<bee-map>`'s `z-index:0` shadow DOM into a `<bee-atlas>` `.map-toolbar` flex row (regions + collapsed filter button), retaining the load-bearing `bee-map { z-index: 0 }`. STACK-01 regression locks it in. (2 plans, operator UAT PASS, 828 tests.)
4. **Phase 158 — Non-WABA specimen-photo capture (resolved by curation):** collectors who write their WSDA catalog number in the iNat observation *description* instead of the WABA field are now captured by copying it into field `18116`, after which existing `int_waba_link` matches it. Built durable, reusable curation tooling at `data/curation/waba_backfill/`; executed for @swisschick (470 WABA fields written, 0 errors) + @rainhead. No pipeline automation — a curator-run operation by design.
5. **Phase 159 — One-click sidebar taxon filter:** clicking a taxon name in the occurrence list applies the existing filter (exact `taxon_id`, other dimensions preserved) via a composed `filter-changed` event; external records demoted to icon links; keyboard-accessible. (1 plan, UAT 4/4 via automated browser verification, 839 tests green.)

**Verification:** all phases individually UAT-verified (155/157 operator PASS, 159 automated 4/4). No milestone audit (no requirements doc; independent cleanup items).
**Known deferred:** `144-code-review-deferred.md` (WR-04 CSV-export headers + 3 info findings; non-blocking, pre-existing).

---

## v5.0 Offline Field Mode (Shipped: 2026-06-21)

**Phases completed:** 8 phases (147–154), 22 plans. Timeline: 2026-06-10 → 2026-06-21 (~11 days).

**Goal delivered:** An installable PWA, dogfooded behind the unlisted `/app` route, that a collector with no signal can use in the field — map + table + selection running entirely against cached client-side data.

**Key accomplishments (one per phase):**

- **147 — `/app` route + SW topology:** Unlisted Eleventy+Vite `/app` route with a correctly-scoped pass-through service worker (`scope:'/app'`) and a structural no-SW-on-`/` import-topology guarantee; per-path CloudFront `no-cache` behaviors for `sw.js`/`manifest.webmanifest`.
- **148 — App-shell precache:** `vite-plugin-pwa` injectManifest wired through `eleventy.config.js viteOptions.plugins`, building a Workbox SW at `/app/sw.js` that precaches the `/app` shell so it loads fully offline after one online visit.
- **149 — `/data/` runtime caching + cold-start:** `occurrences.db` (~23 MB) + GeoJSON cached `CacheFirst`; full offline cold-start; reconnect re-prime if the DB was evicted; `QuotaExceededError`/`persist()` handling; online/offline indicator.
- **150 — Cache health & freshness UX:** workbox-window update lifecycle with prompt-to-reload (no `skipWaiting`), NetworkFirst `manifest.json`, "Data as of `<date>`" generation-date label, determinate prime progress.
- **151 — PWA manifest & installability:** static `manifest.webmanifest` + from-scratch bee-glyph icon set; Android `beforeinstallprompt` capture surfaced as a quiet Install affordance; iOS A2HS instructions; standalone offline cold-start confirmed.
- **152 — GeolocateControl + location state:** offline-safe Mapbox `GeolocateControl` (blue dot/accuracy ring/recenter) hosted by `<bee-map>`, with `_userLocation` owned by `<bee-atlas>` and an app-level denial banner — preserving the state-owner/pure-presenter invariant.
- **153 — Occurrences near me:** a geolocate button in the where-input resolves GPS into a ~10 km bounding box applied as a shareable spatial **filter**, reusing the shift-drag bounds mechanism end to end.
- **154 — Mapbox basemap performance cache (ToS-compliant):** after a ToS review found web-SDK offline basemap serving is unlicensed, shipped a ship-enabled `StaleWhileRevalidate` `mapbox-basemap` cache (token retained, 200-only, 7-day TTL, telemetry/billing excluded) with the full legal analysis recorded in `docs/adr/0001-mapbox-basemap-cache.md`.

**Also shipped during this window (backlog, not milestone-scoped):** 999.1 (desktop shift-drag bounds hint) and 999.8 (separated the spatial-bounds FILTER from per-record SELECTION — `FilterState.bounds` + `bbox=` URL param).

**Resolved at close:** 153 HUMAN-UAT frontmatter flipped to `passed`; 145 (v4.10) verification resolved — Dependabot confirmed live across all ecosystems via observed PRs #28–35.

---

## v4.10 Housekeeping (Shipped: 2026-06-09)

**Phases completed:** 2 phases, 2 plans, 3 tasks

**Key accomplishments:**

- Dependabot v2 config extended with npm (root) and uv (data/) weekly update entries, each grouping minor+patch into one PR, with major bumps ungrouped; github-actions entry retrofitted with the same grouping.
- Session-coalesced viewport→history writes in `<bee-atlas>`: entire pan/zoom exploration produces one pushState; any filter/selection/UI action resets the session flag so the next exploration starts a fresh entry

---

## v4.9 Map-Init Readiness (Shipped: 2026-06-09)

**Phases completed:** 1 phase (144), 2 plans, 4 tasks
**Timeline:** 2026-06-09 (single day)
**Footprint:** ~+399 / −82 lines across 5 `src/` files (`bee-atlas.ts`, `bee-map.ts`, 3 test files)
**Requirements:** none formal — single-phase milestone scoped by the ROADMAP entry + LOCKED design decisions (planning discussion 2026-06-09)
**Verification:** passed 5/5 (`.planning/milestones/v4.9-phases/144-map-init-readiness/144-VERIFICATION.md`)
**Code review:** 1 critical + 3 warnings fixed at close (commit `01760e5`); 1 warning (WR-04) + 3 info deferred
**Known deferred items at close:** 1 (`144-code-review-deferred.md` — WR-04 CSV-export headers + 3 info; see STATE.md → Deferred Items)

**Key accomplishments:**

- **Phase 144 — Map-Init Readiness:** retired the recurring map-init race class *structurally*, building on the `ready.ts` readiness barriers (`taxaReady`/`mapReady`) shipped in quick task 260608-tnc.
  - **Await-based legacy resolution:** the store-and-poll `_pendingLegacyTaxon` dance (store in `firstUpdated` → re-check in `_loadSummaryFromSQLite` → re-store in `_resolveLegacyTaxon`) collapsed into one linear `await taxaReady` path; a legacy-taxon deep link resolves to its modern taxon without depending on render-cycle timing.
  - **Single intent gate:** a dedicated `_filterResolving` `@state` flag feeds one `intendedFilterActive` getter (`isFilterActive(_filterState) || _filterResolving`); both the hide-all guard and URL-write suppression read that single gate — no second "are we mid-resolve" source of truth.
  - **Render as a pure function of intent:** the occurrence-layer render decision moved into `<bee-map>` as `f(filteredGeoJSON, intendedFilterActive)` gated on the map load lifecycle; `<bee-atlas>` stopped pre-seeding empty collections as the hide-all mechanism, so an unfiltered flash is structurally impossible rather than timed-around. `<bee-map>` stays a pure presenter (input-only `@property`).

**Notable:** code review caught a barrier-stranding regression the new architecture introduced — `markTaxaReady()` sat inside `_loadSummaryFromSQLite`'s `try` after the empty-DB early-return and before the `catch`, so both failure paths skipped it; with a legacy-taxon URL pending, `_filterResolving` would stick `true` and the map would render empty forever. Fixed before close by moving `markTaxaReady()` into `finally` (idempotent) and adding regression tests for both failure paths. `npm test` green (653/653), typecheck clean.

---

## v4.7 Checklist Records as Point Data (Shipped: 2026-06-08)

**Phases completed:** 5 phases (134–138), 17 plans
**Timeline:** 2026-06-04 → 2026-06-08 (paused mid-flight for v4.8, resumed and shipped 2026-06-08)
**Footprint:** ~+5,067 / −643 lines across 49 non-planning files (46 implementation commits)
**Requirements:** 21/21 complete (ING-01..03, RCN-01..07, DUP-01..03, PRO-01..04, UIX-01..04)
**Audit:** passed (`.planning/milestones/v4.7-MILESTONE-AUDIT.md`) — 21/21 requirements, 5/5 phases, 18/18 integration connections, 5/5 E2E flows
**Known deferred items at close:** 0 (the 26 pre-close audit items — 24 quick-task scanner false-positives + 2 already-accepted UATs — were verified complete and normalized; see commit `9eb1afc`)

**Key accomplishments:**

- **Phase 134 — Full-Fidelity Ingest:** committed the 50,646-row Bartholomew et al. 2024 CSV as a git-LFS object and rebuilt `checklist_pipeline.py` to load all columns (lat/lon/date/recordedBy/locality/verbatim_name); coordinate validation excludes NULL / `0,0` / lat-lon-swapped / outside-WA-bbox from the point arm with an excluded-count log; mixed/missing dates (ISO, `m/d/yyyy`, year-range, pre-1900, ~13% null) normalized via `dateparser` into a date + `date_quality` enum (full/year_only/none) (ING-01..03).
- **Phase 135 — Name Reconciliation:** tiered resolver (exact canonical → committed synonym seed → one-time build-time GBIF) with iNat `taxon_id` as the terminal key and a committed audit CSV; authority-strip + whitespace/case normalization; slash-compound determinations resolve to the lowest-common-ancestor via `lineage_path`; `rapidfuzz` low-confidence candidates surfaced to a human-review CSV (never auto-applied); unified onto the single dbt synonym subsystem; within-Anthophila homonym guard; **zero nightly taxonomy network calls** (RCN-01..07).
- **Phase 136 — Deduplication:** `int_checklist_collapsed` collapses the 5,184 exact internal-duplicate groups (lowest-ObjectID survivor + `collapsed_count`); a conservative cross-source flag (exact accepted-name + full-precision shared date + ~1 km `ST_Distance_Sphere` + collector token-set, NULL-on-any-field ineligible) writes an auditable `dedup_candidate_pairs.csv`; nothing is suppressed without a curator-confirmed `dedup_decisions.csv` entry; `check_dedup_gate()` wired into `run.py` STEPS; curator HUMAN-REVIEW gate (0 candidates in current data, approved) (DUP-01..03).
- **Phase 137 — Promotion into Occurrences:** ARM 4 (`source='checklist'`) added to `int_combined` — 19,929 deduplicated coord-bearing records into `occurrences.parquet`; enforced dbt contract bumped 33→34 (`checklist_id INTEGER`; ARMs 1–3 emit `NULL::INTEGER`); the Phase 111 isolation test retired to a positive `source='checklist'` floor with a greppable v4.7-reversal comment; `sqlite_export._GEO_COLS` index 7 ↔ `src/features.ts` `checklist:<N>` occId decode shipped in **one atomic commit** (PRO-01..04).
- **Phase 138 — Frontend Points & Detail Card:** checklist renders as distinct green (`#2c7a2c`) map points keyed on the `source` property, clustering and `taxon_id`-filtering with the other three sources; the county-fill layer + entire `_showChecklist`/`_checklistVisible` chain removed; `checklist` is a real `VALID_SOURCES` member with `src=checklist` URL round-trip; the detail card (`_renderChecklist`) shows accepted name + inline `(det. as {verbatim})`, collector, precision-aware Roman date, locality, collapsed-count, and Bartholomew attribution; contract bumped 34→37 (`verbatim_name`/`locality`/`collapsed_count`) with `checklist_count` re-sourced from the deduped status (Bombus mixtus corrected 4,095→1,413); human-UAT approved (UIX-01..04).

**Notable:** reverses the Phase 111 "checklist out of occurrences" lock (its "lacks GPS coordinates" rationale was factually void). Two credibility-critical failure modes — taxonomic over-matching and dedup false-merge — were gated behind committed audit CSVs and curator sign-off, with false-split preferred over false-merge. Shipped out of roadmap order: paused mid-Phase-135 so v4.8 (Fast, Honest Test Suite) could fix the slow/red `data/` pytest suite that was impeding iteration, then resumed and completed.

---

## v4.8 Fast, Honest Test Suite (Shipped: 2026-06-08)

**Phases completed:** 5 phases (139–143), 11 plans
**Timeline:** ~3 days (2026-06-05 → 2026-06-07)
**Footprint:** ~+1,672 / −408 lines across 32 files in `data/` + `.github/`
**Requirements:** 17/17 complete (TPERF-01..03, TFIXTURE-01..04, TFIX-01..05, TTIER-01..03, TCI-01..02)
**Audit:** none run (close pre-flight clean; requirements 17/17 verified complete)
**Known deferred items at close:** 25 (24 legacy quick-task scanner-cruft dirs + 1 already-accepted blocked Phase 142 HUMAN-UAT; see STATE.md → Deferred Items)

**Key accomplishments:**

- **Phase 139 — Baseline & Two-Tier Scaffold:** registered an `integration` pytest marker with `addopts` default-deselection so `uv run pytest` runs only the fast tier; committed `BASELINE.md` anchoring per-tier runtime estimates, the < 5 min / ~10 min targets, dominant cost contributors, and an honest ~19-failure red inventory (TPERF-01, TTIER-01).
- **Phase 140 — Checklist & Taxonomy Fixture Distillation:** added a connection-injection seam to `data/checklist_pipeline.py`, distilled small committed checklist + taxonomy-ancestry fixtures (covering every `coord_flag`/`date_quality` branch) to replace full-file parsing of `checklist_records_full.csv` and the 39 MB `taxa.csv.gz`, and built the checklist DuckDB once via a module-scoped `checklist_sample_db` fixture (TFIXTURE-01, -02, -04).
- **Phase 141 — Built-Asset Fixtures, Red-Test Fixes & Silent-Skip Elimination:** committed `species_fixture.csv` + built-asset fixtures so target/sandbox-dependent tests execute on a clean checkout; additive DDL stubs fixed the CatalogException crash across all 19 `test_resolve_taxon_ids.py` tests; the 16 `test_dbt_diff` tests were loudly deselected (never silently skipped) and real-data checks tagged `@integration` (TFIXTURE-03, TFIX-01..04, TTIER-02).
- **Phase 142 — Verify Budget, Green Suite & Nightly Wiring:** pytest-randomly proved the fast suite green (197 passed / 9 skipped / 18.8s) under randomized order, surfacing and fixing three order-dependence bugs; added `verify-clean-checkout.sh`; wired the `@integration` hard gate into `nightly.sh` as block 2b (exits non-zero before S3 publish) with block 1c pre-pulling published artifacts so `test_dbt_diff` asserts against a real regression baseline (TFIX-05, TPERF-02, TPERF-03, TTIER-03).
- **Phase 143 — CI Gate:** an independent `python-tests.yml` GitHub Actions job runs the fast suite (uv + Python 3.14) on push and PR — with git-LFS checkout and pre-installed DuckDB spatial for the clean runner — failing the build on any test failure or on exceeding the < 5 min budget (TCI-01, TCI-02).

**Notable:** the milestone's entire premise was honesty — it converted a >40 min, partly-red, silently-skipping suite into a green, randomized-order-stable fast tier (< 5 min) that runs on a clean checkout with no built assets, no network, and no AWS, while routing genuine full-data checks (the 50,646-row count, full `taxa.csv.gz` LCA, sandbox-vs-public parquet diff) into an opt-in slow tier exercised nightly on maderas and gated in CI.

---

## v4.6 Taxonomy Hierarchy & Normalization (Shipped: 2026-06-04)

**Phases completed:** 5 phases (129–133), 18 plans, 25 tasks
**Timeline:** ~3 days (2026-06-01 → 2026-06-04)
**Requirements:** 20/20 complete (HIER-01..06, MFILT-01..03, NORM-01..03, PAGE-01..04, TREE-01..04)
**Audit:** passed (`.planning/milestones/v4.6-MILESTONE-AUDIT.md`)
**Known deferred items at close:** 28 (see STATE.md → Deferred Items; all pre-existing/non-blocking)

**Key accomplishments:**

- **Phase 129 — Hierarchy foundation:** a query-ready taxon_id hierarchy (materialized `lineage_path`) built into `occurrences.db` via a two-pass bee + bycatch load with a zero-orphan assertion; Apidae descendant query benchmarked at 2.0 ms (Firefox), far under the 50 ms gate.
- **Phase 130 — Map filter cutover:** frontend filtering switched to `taxon_id` with descendant-by-any-rank matching (`instr(lineage_path, '/N/')`), 8-rank autocomplete, and integer `?taxon=` URLs with backward-compatible legacy-name resolution.
- **Phase 131 — Occurrence normalization:** dropped the 4 denormalized rank-string columns (dbt occurrences contract 37→33 cols), rewrote `geo_blob` to a 7-field positional layout (−14.2% DB size), and moved display names to a query-time taxa JOIN.
- **Phase 132 — Page rebuild & subfamily pages:** rebuilt species/genus pages off the `higher_taxa` rollup and added 12 `/species/subfamily/{Name}/` pages (plus tribe/subgenus) with genus-colored SVG maps and a slug-collision hard-fail.
- **Phase 133 — Browse tree:** replaced the flat species index with an expandable bee-only `<details>` taxonomy tree — default family→genus→species, "Show all ranks" toggle (localStorage), type-to-filter with ancestor auto-expand, per-node specimen/observation count splits, and taxon-page + filtered-map links.

**Notable:** Phase 133 went through a code-review-driven gap closure — the reviewer caught a default view broken by `display:none` burying nested ranks (and source-grep tests that passed while the feature was broken). Fixed with a `display:contents` rank-skip, executable happy-dom tests, and three operator re-verify rounds. Post-audit, the operator also added taxon-page→map links, removed two orphaned modules, and recorded Phase 133 Nyquist validation.

---

## v4.5 iNat Taxonomy & Species Completeness (Shipped: 2026-06-01)

**Phases completed:** 5 phases (124–128), 8 plans
**Timeline:** ~3 days (2026-05-29 → 2026-06-01)
**LOC:** ~+1,400 / −60 across ~35 files (excluding `.planning/`)
**Requirements:** 13/13 complete (PWK-01..03, SPV-01..03, TID-01..03, ITR-01..04)

**Key accomplishments:**

- **Phase 124 — Pre-Work & Contract Cleanup:** extended `resolve_taxon_ids` to three name sources (checklist + ecdysis + inat_obs), reordered pipeline STEPS so inat-obs populates before resolution, added inactive-taxon enumeration, and fixed the stale column-count docstrings (PWK-01..03).
- **Phase 125 — Species Visibility:** a COALESCE epithet derivation in `int_species_universe` unlocked 65 off-checklist species (`specific_epithet` non-null 527 → 592), generating 231 additional occurrence SVGs and full static `/species/{Genus}/{epithet}/` pages (SPV-01..03).
- **Phase 126 — Taxon IDs:** threaded a non-null `taxon_id INTEGER` through the dbt marts (species.parquet 0-null; occurrences.parquet 37-col contract) behind a pre-build resolution gate + KNOWN_NON_BEES exclusion, and added "View on iNaturalist →" links to species/genus/subgenus/tribe pages (TID-01, TID-03, species-level TID-02).
- **Phase 127 — Inactive Taxon Remapping:** a dormant safety net that auto-remaps 1-successor inactive bridge entries (→ `auto_synonyms.csv` + bridge UPSERT, applied via the existing synonym JOIN), routes unresolvable cases to a triage report, and hard-fails the nightly gate — manual `occurrence_synonyms.csv` entries take precedence (ITR-01..04).
- **Phase 128 — Occurrence Finest-Rank Taxon Backfill:** closed the re-scoped TID-02 by backfilling `occurrences.taxon_id` for all 12,674 single-token genus rows (149 genera, bee + non-bee aculeate) from an Animalia-disambiguated genus map read directly from `taxa.csv.gz`, dropping whole-column NULL taxon_id 34,354 → 21,680 with the 37-col contract intact.

**Mid-milestone scope decision:** TID-02 ("non-null taxon_id for *every* occurrence row") proved literally impossible — ~21k Ecdysis specimens carry no identification. Re-scoped (human decision) to "every *identified* row carries its finest-rank taxon_id"; genus-rank backfill delegated to the inserted Phase 128. Disambiguation chose kingdom = Animalia over bees-only so the wasp/fly aculeates Ecdysis collects alongside the bees resolve to their real genus taxon. Phase 126 verified 3/4 (TID-02 gap closed downstream by 128, verified 9/9).

**Known deferred at close:** DEF-128-01 (`run.sh build` needs absolute `DB_PATH` — pre-existing dbt-duckdb seed-path bug; nightly unaffected) plus pre-existing v4.0 verification/UAT items and legacy quick-task dirs (see STATE.md Deferred Items).

---

## v4.3 Loading Performance (Shipped: 2026-05-28)

**Phases completed:** 2 phases (121–122), 5 plans
**Timeline:** 3 days (2026-05-26 → 2026-05-28)
**LOC:** +5,261 / −969 across 98 files
**Requirements:** 6/6 complete (PERF-01..03, PERF-GEO-01..03)

**Key accomplishments:**

- `data/sqlite_export.py` — DuckDB sqlite extension converts `occurrences.parquet` to `occurrences.db` with schema derived at runtime (no hardcoded DDL); `nightly.sh` uploads content-hashed with `occurrences_db` manifest key; `data/run.py` STEPS wired immediately after `dbt-build` — PERF-01 satisfied
- Worker cutover — `sqlite-worker.ts` rewritten to 3-step fetch→seed (MemoryVFS)→query; `hyparquet` import, `_insertRows`, `_escapeSqlValue`, `_buildGeoJSON`, `_serializedExec`, `CREATE TABLE`, and the sqlite3.exec monkey-patch all deleted; ~130 lines removed — PERF-02 satisfied
- `json_group_array` approach benchmarked (Plan 01) and rejected (1286 ms = 2× worse than 570 ms baseline); root cause: WASM→JS callback overhead ~6.4 μs × 92,802 rows = ~594 ms; pre-serialized `geo_blob` table in `sqlite_export.py` (Python `json.dumps`); worker fetches 1 row, 1 callback — SQL geo query 570 ms → 80 ms (86% reduction) — PERF-GEO-01..03 satisfied
- Benchmark results (Firefox, warm WASM cache): tablesReady 930 ms → **250 ms** (73% reduction); loadOccurrenceGeoJSON transfer 100 ms → **2 ms**; loading screen lifted 1460 ms → **875 ms** (40% reduction); all phase targets met

---

## v4.2 iNaturalist Expert Observations (Shipped: 2026-05-26)

**Phases completed:** 4 phases (117–120), 14 plans
**Timeline:** 2 days (2026-05-25 → 2026-05-26)
**LOC:** +10,277 / −4,275 across 110 files
**Requirements:** 15/15 complete (PIPE-05 superseded; future requirements deferred)

**Key accomplishments:**

- `data/inat_obs_pipeline.py` — reads committed `data/raw/inat_expert_obs.csv` (45,354 rows); applies D-04 `canonical_name` resolution; deduplicates against Ecdysis `specimen_observation_id` values (821 excluded); produces `inat_obs_data.observations` DuckDB staging table (44,534 rows, 12 columns) — PIPE-01..04 satisfied
- `int_combined.sql` ARM 3 + dbt contract expansion — third source arm unifies iNat expert obs into `occurrences.parquet`; `source` discriminator (`'ecdysis'`, `'waba_sample'`, `'inat_obs'`) added to all three arms; schema expands from 31 to 36 columns with iNat-specific nullable fields (`image_url`, `obs_url`, `user_login`, `license`); `int_species_universe.sql` gains `inat_obs_count_agg` CTE; `species.json` exports `inat_obs_count` per species — OCC-01..03 satisfied
- Map display and source filter — 44,534 iNat obs points rendered in amber (`#e8a020`) on Mapbox map; unified Sources filter row with four checkboxes (Ecdysis specimens / Provisional WABA / iNat expert obs / Checklist records); `src=` URL param encodes visible sources (absent = all on); UAT resolved 4 issues: `src=` polarity, checklist row merge, WABA relabel, `inat_obs:` prefix in `o=` allowlist — MAP-01..03 satisfied
- `bee-occurrence-detail._renderInatObs` — clicking an iNat obs point shows: date in Roman numeral format, observer login, CC-licensed photo loaded from iNaturalist S3, "View on iNaturalist" link (target=\_blank) — DET-01 satisfied
- Species/genus/subgenus/tribe pages — "N specimens · N community observations" replaces single "N records" label; `tribeMap` accumulator extended; Nunjucks templates updated with source-aware counts — SPE-01..02 satisfied
- `photos.json` artifact — `species_export.py` emits per-species list of `{ url, license }` objects for CC-licensed iNat obs images; hashed S3 upload wired into `nightly.sh`; `manifest.json` `photos` key added — SPE-03 satisfied; future photo carousel enabled

---

## v4.1 Validation & Code Quality (Shipped: 2026-05-25)

**Phases completed:** 3 phases (114–116), 12 plans
**Timeline:** 1 day (2026-05-25)
**LOC:** +5,367 / −131 across 49 files
**Requirements:** 12/12 complete

**Key accomplishments:**

- Retroactively restored Phase 89 VALIDATION.md; corrected Phase 90 VALIDATION.md (nyquist_compliant false→true, Historical Note appended); authored Phase 91 VALIDATION.md from scratch; all SEL-* `requirements-completed` frontmatter added to phases 89–91 SUMMARY files — v3.5 Nyquist gaps fully closed
- Created Phase 97 and 100 VALIDATION.md files; updated Phase 98 VALIDATION.md (false→true) with Historical Note citing 3 RED commits; created 98-VERIFICATION.md (summary-and-code-inspection, 9/9 pytest pass) — v3.7 Nyquist gaps fully closed
- Created Phase 112-VERIFICATION.md documenting browser UAT (6/6 PASS) as verification gate; Phase 112 VALIDATION.md updated to nyquist_compliant:true — v4.0 verification gap closed
- `places_validation.py` now raises descriptive `ValueError` for permit records missing `issuing_authority` or `type`; fail-fast before spatial work begins; 4 new pytest cases (10/10 pass) — CODE-01 closed
- `run.py` module docstring synced with current STEPS list; all 19 pipeline steps listed in execution order — CODE-02 closed
- Resolved 3 pre-existing `test_dbt_diff.py` failures by regenerating `species.parquet`/`species.json`/`seasonality.json` from current dbt sandbox; all 150 data tests pass — CODE-03 closed

---

## v4.0 Washington Checklist Records (Shipped: 2026-05-25)

**Phases completed:** 4 phases (110–113), 13 plans
**Timeline:** 2 days (2026-05-24 → 2026-05-25)
**LOC:** +63,769 / −1,882 across 104 files
**Requirements:** 18/18 complete

**Key accomplishments:**

- `data/taxa_pipeline.py` — ETag/304-cached download of iNat AWS Open Data taxa.csv.gz (37MB); DuckDB PIVOT ancestry walk produces `taxon_lineage_extended` for all active Anthophila taxa; live `/v2/taxa` enrichers deleted; dbt build PASS=44, 5 pytest tests pass; nightly.sh widened with S3 pull/push — rate-limit risk eliminated
- `data/dbt/models/marts/checklist.sql` — External parquet mart: 2,861 species-county rows from Bartholomew et al. 2024 WA checklist CSV; county-centroid spatial join (eco_fallback CTE for island counties); iNat family enrichment; `source='checklist'` load-bearing for layer separation; schema.yml enforced contract with 12 typed columns
- Checklist map layer (`bee-pane` toggle + `bee-atlas` coordinator + `bee-map` `checklist-county-fill` Mapbox fill layer) — "Checklist records" toggle in filter panel; semi-transparent green county fill; responds to taxon and year filters; `_checklistAllRows` parquet cache; `cl=1` URL persistence and restore; browser UAT approved
- Species pages expanded to 565 checklist species — genusList/subgenusList include checklist-only species with `#cccccc` swatch; species index shows "checklist only" badge; species-detail.njk shows county-fill SVG, "N checklist records · Bartholomew et al. 2024" attribution, atlas link suppressed for checklist-only species; seasonality-viz onChecklist fallback; 507 Vitest tests pass; browser UAT approved

---

## v3.9 Sidebar & Table Unification (Shipped: 2026-05-20)

**Phases completed:** 5 phases (105–109), 12 plans
**Timeline:** 2 days (2026-05-19 → 2026-05-20)
**LOC:** +10,639 / −1,326 across 54+ files (61 commits)
**Requirements:** 11/11 complete; no milestone audit (high-confidence UI refactor)

**Key accomplishments:**

- URL layer migrated: `UiState.viewMode` replaced with `UiState.paneState: 'collapsed' | 'list' | 'table'` in url-state.ts; `?pane=list`/`?pane=table` URL round-trip; legacy `?view=table` preserved via Option A precedence chain — URL-01 and URL-02 satisfied
- bee-atlas state machine refactored: three-flag view state (`_viewMode`, `_sidebarOpen`, `_tableFilterOpen`) replaced with single discriminated-union `@state() private _paneState: 'collapsed' | 'list' | 'table'`; SM-01 test block (7 tests) locks the machine transitions
- `bee-pane` component created: merged `bee-filter-panel` and `bee-sidebar` into a single three-state presenter component (1004 lines); persistent toggle button, expand-to-table button (desktop only), filter rows + occurrence detail in list state, `bee-table` embedded in table state — PANE-01..06 + TABLE-01 satisfied
- bee-atlas cutover: bee-atlas renders single `bee-pane` overlay replacing `bee-filter-panel` + `bee-sidebar` + `bee-table` siblings; MAP-01 satisfied by overlay architecture (bee-pane is `position:absolute`; bee-map element dimensions never change across pane transitions; no explicit `map.resize()` call needed)
- BeePane v2 unified occurrence model: `queryListPage` in filter.ts uses WHERE intersection (filter AND selection); unified list query replaces separate occurrence sidebar; collapsed button matches old filter-panel floating design (magnifying-glass SVG + count, highlighted on filter/selection); table as split-screen (40% map / 60% table); `bee-filter-panel.ts` and `bee-sidebar.ts` deleted — TABLE-02 satisfied

---

## v3.8 Conceptual Tidying (Shipped: 2026-05-19)

**Phases completed:** 4 phases (101–104), 5 plans
**Timeline:** 1 day (2026-05-18 → 2026-05-19)
**LOC:** +5,601 / −153 across 48 files
**Requirements:** 8/8 complete; no milestone audit (low-risk refactor milestone)

**Key accomplishments:**

- `src/occurrence.ts` — occurrence ID construction (`occIdFromRow`, `parseOccId`) and three named type predicates (`isSpecimenBacked`, `isSampleOnly`, `isProvisional`) centralized; 6 caller files migrated; 24 Vitest unit tests; all inline `ecdysis:N` / `inat:N` template-literal construction and `ecdysis_id != null` discriminants eliminated from production code
- `data/domain.py` — Python `slugify` extracted from `feeds.py`; `feeds.py` and `species_export.py` both import from domain; dead `BEE_FAMILIES` constant removed; `int_species_universe.sql` comment updated to claim sole-gate responsibility; 6-test byte-equivalence suite proves Phase 78 D-01 invariant
- `data/dbt/macros/inat_field_ids.sql` — five named Jinja2 macros replace anonymous OFV integer literals `8338`/`9963`/`18116`/`1718` across four intermediate models; duplicated Plantae CASE expression centralized into `is_plant_taxon(alias)` macro; dbt build PASS=46 WARN=0 ERROR=0; row-count diff confirms behavioral parity (47,953 rows)
- Semantic reconciliation (SEM-01) — `places_export.py` specimen count fixed to use `ecdysis_id IS NOT NULL` (matching `isSpecimenBacked`) rather than `is_provisional IS NOT TRUE`; sample-only iNat rows no longer overcounted as specimens; canonical predicate documented in `isSpecimenBacked` JSDoc with cross-layer citation; pytest fixture confirms correct count (1 specimen from 4-row fixture)

---

## v3.7 Places (Shipped: 2026-05-18)

**Phases completed:** 5 phases (97–100.1, including INSERTED Phase 100.1), 11 plans
**Timeline:** 2 days (2026-05-16 → 2026-05-18)
**LOC:** +12,314 / −2,566 across 103 files (97 commits)
**Requirements:** 16/16 complete; audit gaps_found at close (procedural gaps — see deferred items)
**Known deferred items at close:** Phase 98 VERIFICATION.md missing; W-02 permit field validation not runtime-enforced; Nyquist compliance for phases 97, 98, 100; stale run.py docstring (W-03)

**Key accomplishments:**

- Hand-curated `content/places.toml` TOML schema for collecting locations with slugs, WGS84 polygon geometry, and permit records; validation pipeline enforces slug format, WGS84 CRS, and polygon non-overlap (ST_Intersects)
- Pipeline spatial join: `place_slug` column in `occurrences.parquet` via ST_Within LEFT JOIN (dbt 31-column contract); `places.geojson` and `places.json` exported and committed to git so CI builds succeed without running the pipeline
- Per-place SVG occurrence maps generated at pipeline time following `species_maps.py` byte-stable pattern
- Static place pages: `/places.html` index and per-place pages at `/places/{slug}.html` with name, land owner, specimen count, SVG occurrence map, and deep-link to filtered map
- Places boundary mode (4th toggle: Off/Counties/Ecoregions/Places); click place polygon to apply filter; removable place chip in filter panel; `place=` URL round-trip and deep-link from place pages
- Phase 100.1 gap closure: nightly.sh uploads place-maps to S3 and invalidates CloudFront; `_onBoundaryModeChanged` clears `selectedPlace` filter when leaving places mode

**BLOCKER closed at milestone:** B-01 (place-maps not uploaded to S3) fixed in Phase 100.1 (commit c7d7a31); W-01 (`_onBoundaryModeChanged` didn't clear selectedPlace) fixed in Phase 100.1 (commit 1ce1e40).

---

## v3.6 Simpler Species Index (Shipped: 2026-05-16)

**Phases completed:** 5 phases (92–96), 13 plans
**Timeline:** 2 days (2026-05-15 → 2026-05-16)
**LOC:** +5,418 / −23,155 across 154 files (large net deletion — monolith removed)
**Requirements:** 25/25 complete; audit PASSED 2026-05-16
**Known deferred items at close:** 26 (carried from v3.5 close — see STATE.md Deferred Items)

**Key accomplishments:**

- Hierarchical `Genus/specificEpithet` slug format implemented in pipeline; 106 non-bee orphan TOML entries removed (735 → 629 species-photos.toml keys, 0 validate-species warnings)
- Multi-color SVG occurrence maps generated for 44 genera, 103 subgenera, and 19 tribes; D-01/D-02 alphabetical canonical_name sort binds Python SVG colors to JS swatch colors deterministically
- 527 species pages + 42 genus pages generated as static Eleventy pages with photo, SVG map, and seasonality; lean taxon-page.ts entry (4 imports) distinct from the heavier species chunk
- 103 subgenus pages at `/species/{Genus}/{Subgenus}/` and 19 tribe pages at `/species/tribe/{TribeName}/` with multi-color SVG maps
- Monolithic `/species/` all-cards layout (8 production files + 6 test files) replaced with searchable family→genus index; type-to-filter JS search narrows genus/species entries without page reload

**BLOCKER closed at milestone:** `nightly.sh` never uploaded `species-maps/` to S3 — fixed inline (commit `e9c3eed`) before milestone close.

---

## v3.5 Selection Rectangle (Shipped: 2026-05-15)

**Phases completed:** 3 phases, 4 plans, 3 tasks

**Key accomplishments:**

- Static-grep gate:
- 1. [Rule 1 - Bug] Used this._selectionBounds! instead of e.detail in queryOccurrencesByBounds call
- One-liner:
- Wires `_selectionBounds` into `_pushUrlState`, `_restoreBoundsSelection`, `firstUpdated`, `_onPopState`, and 4 clear sites in `src/bee-atlas.ts` so rectangle-selection bounds round-trip through `?sel=` — completing SEL-06 and SEL-07.

---

## v3.4 dbt Full Rewrite (Shipped: 2026-05-14)

**Phases completed:** 4 phases, 14 plans, 27 tasks

**Key accomplishments:**

- WHERE id IS NOT NULL added to stg_inat__observations staging view, dropping dlt tombstone row from 10,846 to 10,845 rows; dbt not_null and unique tests both PASS (TEST-01 resolved)
- FORMAT CSV workaround in emit_feature_collection locked and documented with three-section rationale: FORMAT JSON wraps scalar incorrectly, FORMAT GDAL adds incompatible "name" key and indented output, FORMAT CSV is the only path that emits raw VARCHAR verbatim
- Drop specimen_inat_login, specimen_inat_genus, specimen_inat_family from the mart contract (33 → 30 columns): schema.yml, occurrences.sql, sqlite.ts, validate-schema.mjs, and test_dbt_diff.py docstring all updated; dbt build exits 0 with PASS=33
- Three dbt staging views for the species mart DAG (canonical_to_taxon_id, taxon_lineage_extended, checklist.species) plus a LIN-05 singular test asserting 735/735 = 100% lineage coverage
- 1. [Rule 1 - Bug] specimen_count HUGEINT vs BIGINT contract mismatch
- species_export.py rewritten as thin dbt-mart consumer: reads 18-col sandbox/species.parquet, appends slug via feeds._slugify, emits 19-col species.parquet + byte-comparable species.json + seasonality.json; all 5 species diff tests PASS
- Captured 4 timed `dbt build` runs converting `int_combined` from `materialized='table'` to `materialized='incremental'` with ARM 1 watermark + ARM 2 `AND FALSE` skip; measured int_combined node drop from 0.236s baseline to 0.132s incremental no-op (~0.10s saved on the node, capped by downstream external mart still rebuilding fully).
- Recorded the evidence-anchored "keep full rebuilds" recommendation in 087-FINDINGS.md and reverted `int_combined.sql` byte-identically to pre-experiment SHA 78de3f5 — Phase 88's planner can now read one section (`## Recommendation`) and act without re-running the experiment.
- Deleted the legacy JS parquet-schema gate (validate-schema.mjs + package.json script + deploy.yml step) and replaced the CLAUDE.md bullet with a positive statement naming the dbt 30-column contract as the canonical schema gate; pre-cutover SHA 44a967c captured as the phase rollback marker.
- Rewrote `data/run.py` so `bash data/dbt/run.sh build` is the only path that produces `occurrences.parquet`, `counties.geojson`, and `ecoregions.geojson`; deleted `data/export.py` and its three orphaned test files; deleted `_apply_migrations` (both migrations are now obviated by dbt staging models).
- Closed out Phase 88 by confirming `data/nightly.sh` requires no edits (all invariants for dbt exit-code propagation + 3-artifact S3 upload already in place), recording the user's `approved — all 4 surfaces green` smoke check, and writing `088-CUTOVER-LOG.md` with the CUTOVER-02 migration → dbt mapping (cited by file:line), the VALIDATE-02 sign-off, the CUTOVER-04 no-op confirmation, and the single-commit rollback procedure pinned at SHA `44a967c`.

---

## v3.2 Species Tab (Shipped: 2026-05-05)

**Phases completed:** 7 phases (Phases 76–82, including INSERTED Phase 77), 34 plans
**Timeline:** 4 days (2026-05-02 → 2026-05-05)
**LOC:** +54,245 / −129 across 172 files (218 commits)
**Git range:** `0045594` → `e1ef3a6`
**Requirements:** 72/72 complete; audit PASSED 2026-05-05
**Known deferred items at close:** 20 (2 debug, 11 quick-task SUMMARY backfills, 2 todos, 3 UAT gaps, 2 verification gaps — see STATE.md Deferred Items)

**Key accomplishments:**

- Phase 76 Data Foundation: WA bee checklist (Bartholomew et al. 2024, JHR 97; 527 species, 2,861 county rows) committed verbatim with provenance README; `canonicalize()` 5-step pure helper (lowercase, single-spaced, authority-stripped, subgenus-paren-stripped) becomes THE join key; `checklist_data.species` table loaded via `CREATE OR REPLACE`; `enrich_taxon_lineage_extended()` walks full iNat ancestor chain over UNION of `inaturalist_data` + `inaturalist_waba_data`; `ecdysis_data.occurrences.canonical_name` materialized; reconcile-and-warn pattern with synonyms/unmatched CSV writeback; 6 plans, 12 integration tests
- Phase 77 Lineage Coverage Expansion (INSERTED 2026-05-03): `data/resolve_taxon_ids.py` queries iNat taxon-search for every canonical_name in the FULL OUTER union (D-02 filter ladder: matched_term → name → is_active → Insecta → rank; D-03 rank fallback: 1-token → genus, 2-token → species → genus); `inaturalist_data.canonical_to_taxon_id` bridge as durable cache (zero new API calls on rerun; `--refresh-lineage` flag forces re-resolution); `data/lineage_unresolved.csv` for 404/ambiguous/API-error names; LIN-05 ≥95% coverage threshold pinned by 19/20 deterministic fixture; 3 plans, 17-test suite
- Phase 78 Pipeline Outputs: `species_export.py` produces `species.parquet` (19-column AGG-02 schema with `month_histogram INT[12]`), `species.json` (flat array for Eleventy `_data/`), and `seasonality.json` (per-species × per-county × per-ecoregion-l3 buckets, 265 KB); `species_maps.py` writes 556 byte-stable SVGs (sorted attrib dicts before `ET.tostring`; sha256 byte-equality across consecutive runs); WA county backdrop via `ST_AsGeoJSON(ST_SimplifyPreserveTopology(geom, 0.005))`; off-bbox coordinates clipped silently with logged count; slug shared with `data/feeds.py::_slugify` — SVG filename / parquet `slug` / URL slug agree byte-for-byte across all 735 species; 4 plans
- Phase 79 Photo Manifest: `content/species-photos.toml` schema with required `license` (whitelist `cc0`/`cc-by`/`cc-by-nc`/`cc-by-sa`/`cc-by-nc-sa`) and `attribution` for non-CC0; `scripts/validate-species.mjs` parses TOML and gates the build (`validate-schema → validate-species → typecheck → eleventy`); `scripts/seed-species-photos.mjs` (NOT in CI per build-chain isolation Vitest guard) populates manifest from iNat at 1500ms pacing (recovery from 231-HTTP-429 burst at 1000ms); 735 species seeded (489 with photos = 60.8%, 246 bare entries handled in renderer fallback); fill-only merge pattern (D-01) preserves authored entries; WA-preferred + global-top-up fallback minimizes coverage gaps; `--rate-ms` CLI flag and bare-entry repurge-and-rerun recovery loop established; 3 plans, 31 Vitest cases
- Phase 80 Page Scaffolding: `/species/` page renders one server-rendered `<bee-species-card>` per species (light-DOM Lit) via `_pages/species.njk` declaring `layout: default.njk`; `_data/species.js` reads `species.json` (NOT parquet — preserves HMR per project memory); `_data/photos.js` reads TOML via `@iarna/toml`; `<bee-species-page>` is the page coordinator (mirrors v1.9 `<bee-atlas>` ARCH-03 invariant) — owns `_activeTaxonPath`, `_geoFilter`, `_seasonFilter`, URL state; presenters never import from coordinator; `loading="lazy"` on every photo and SVG occurrence map; `content-visibility: auto` on every card; ARCH-04 source-analysis test in `src/tests/arch.test.ts` enforces species chunk isolation (no `mapbox-gl` / `wa-sqlite` / `bee-map.ts` / `bee-atlas.ts` imports under `src/species/**`); species chunk 1.34 KB (0.63 KB gzip) distinct from SPA `index-*.js`; 4 plans, 242 tests green
- Phase 81 Filter UX & Nav: `<bee-taxon-nav>` renders vertical left-rail tree (family → subfamily → tribe → genus → subgenus → species) — Eleventy server-renders nested `<details>`/`<ul>` (no-JS navigable, pnwmoths pattern), light-DOM Lit decoration enables filtering; subgenus level renders only when populated; mute-not-hide (opacity 0.35) for filtered branches preserves orientation; `<bee-species-filter>` exposes county and ecoregion-l3 multi-selects + month-name selects (D-A8 — number inputs swapped for selects per UAT T5); URL params disjoint from SPA (`?fam=`, `?subf=`, `?tribe=`, `?gen=`, `?subg=`, `?county=`, `?ecor=`, `?m0=`, `?m1=`); `src/species/url-state.ts` round-trip (Vitest tests separate from SPA); breadcrumb pill row + empty state + Clear filters; `<seasonality-viz>` renders inline `<svg>` via Lit svg template (no chart library) with `n ≥ 5` bars / `n < 5` text fallback / BeeSearch season-band tints / star annotation; `buildSpaTaxonLink()` shared helper (`?taxon=&taxonRank=`) — both params required, contract documented as stable interface in `src/url-state.ts` header comment; 6 plans, 974 deep-link markers in built `_site/species/index.html`
- Phase 82 Hardening: `scripts/validate-bundle-size.mjs` enforces 100 KB gzipped cap on species chunk in CI (current 5.4 KB = 94.6 KB headroom); `scripts/measure-lcp.sh` Lighthouse runner aliased as `npm run measure-lcp` (NOT in build chain per D-06) — Andrena page LCP=1312 ms / 3000 ms budget; `srcset` deriveSrcset helper for responsive iNat photo sizes (medium/small/square); hand-rolled axe-style a11y assertions for nav tree `role`/`aria-expanded` sync, img alt presence, filter focusability; SSR taxon tree decorated with `role=tree`/`treeitem`/`group` and aria-expanded synced on details toggle; `scripts/check-photo-availability.mjs` weekly GitHub Actions cron (NOT every build per PITFALLS #1; informational, does not block deploys per D-10); seasonality fallback drops ambiguous single-letter month suffix (D-08 / UAT T7); UAT against seed use cases — both pass: "Which species of *Eucera* are present in this ecoregion?" (filter narrows correctly with mute-not-hide) and "Which are most likely / frequently collected?" (top-frequency match `species.json` ground truth); 8 plans

**Tech debt deferred (non-blocking, captured in audit):**

- v3.3+ DwC-A migration to consolidate `enrich_taxon_lineage` + `enrich_taxon_lineage_extended` (`.planning/seeds/inat-taxonomy-dwca.md`)
- LIN-05 live-DB ≥95% threshold requires periodic human re-verification against production DuckDB (test layer asserts SQL gate against fixture only)
- 60.8% photo coverage (489/735); reseed at 1500ms pacing if iNat 429 enforcement tightens
- DuckDB 1.4.x COALESCE-on-INTEGER[12] limitation; Python `[0]*12` backfill in `species_export.py:198-202`
- `data/manifest_drift_report.json` first cron run pending (informational only)
- `@ts-expect-error` pragma on `.mjs` imports in tests (could be eliminated via .d.mts generation)
- Plan 02 frontmatter typo: `must_haves.artifacts.exports` lists `rateLimitedFetch`; actual export is `RateLimiter` class

---

## v3.1 Eleventy Build Wrapper (Shipped: 2026-04-30)

**Phases completed:** 2 phases (Phases 74–75), 5 plans
**Timeline:** 2 days (2026-04-29 → 2026-04-30)
**LOC:** +9,360 / −333 across 73 files (most are renames from the `frontend/` → repo-root hoist)
**Git range:** `d064e28` → `eb3d173`
**Branch:** `gsd/phase-074-eleventy-build-wrapper` (kept across both phases per `branching_strategy: none`)

**Key accomplishments:**

- Phase 74: Eleventy 3.1.5 + `@11ty/eleventy-plugin-vite` 7.1.1 wrap the Vite SPA at the repo root; `frontend/` collapsed to repo root (single-package layout); `eleventy.config.js` wires Eleventy → Vite via `_site/` output; CI `deploy.yml` updated for `_site/` artifact paths; `npm run dev` from repo root with HMR confirmed; SPA URL unchanged (`/`); 172 Vitest tests green
- Phase 75: Two-layer Nunjucks layout chain (`_layouts/base.njk` + `_layouts/default.njk`) via Eleventy front-matter `layout:` + `{{ content | safe }}` (NOT Nunjucks `{% extends %}`); `<bee-header>` Lit component embedded in `default.njk` via side-effect Vite entry (`src/entries/bee-header.ts`); orphan verification page at `/_scaffold-check/` ships permanently as a deploy diagnostic; `_data/build.js` pattern established for build-time metadata
- Multi-entry Vite build via the plugin's HTML processor (`appType: "mpa"`) — Vite walks every emitted templated HTML page and produces a hashed bundle automatically; no `rollupOptions.input` config needed; load-bearing assumption A5 (Vite rewrites `<script src="/src/entries/bee-header.ts">` to `<script src="/assets/bee-header-[hash].js">` across every templated HTML page) verified end-to-end
- Bee-header bundle: 22,779 B raw / **8,474 B gzipped** — well under <100 KB budget and ~half the research estimate, thanks to Rollup shared-chunk dedup with the SPA bundle
- Pattern primer for v3.2 Species Tab: drop a new `.njk` into `_pages/` declaring `layout: default.njk` for automatic bee-header chrome; add `_data/<topic>.js` for build-time data feeds; add `src/entries/<name>.ts` for additional standalone Vite bundles

**Known deferred items at close:** 14 (1 debug session, 11 quick-task SUMMARY.md backfills, 2 todos — all pre-date v3.1; see STATE.md Deferred Items)

---

## v3.0 Mapbox GL JS Migration (Shipped: 2026-04-27)

**Phases completed:** 3 phases (Phases 71–73), 7 plans
**Timeline:** 3 days (2026-04-26 → 2026-04-28)
**LOC:** +6,301 / −3,565 across 47 files
**Git range:** `abf6792` → `f44b3ef`
**PR:** #11 (mapbox-migration → main)

**Key accomplishments:**

- Phase 71: `bee-map.ts` rewritten on Mapbox GL JS v3.22.0 with zero OL imports; clustered GeoJSON source with recency `clusterProperties`; ghost source for filtered-out features; filter-based selection ring; `setData`-based `visibleIds` filtering; ResizeObserver for resize; all 11 events preserved; `bee-atlas` loads county/ecoregion options from SQLite (decoupled from map source events); 162 tests pass
- Phase 72: County/ecoregion fill+line layers with `feature-state` highlighting via `generateId`; full click chain via Mapbox `addInteraction` + `preventDefault` (cluster→leaves, point, region, empty); `_clickConsumed` flag pattern; D-01 cluster click emits all leaves without auto-zoom; D-02 SQLite-options loading verified by source-analysis tests; 8/8 must-haves verified
- Phase 73: `ol`, `ol-mapbox-style`, `rbush`, `@types/rbush` removed from `package.json`; `region-layer.ts` and stale `frontend/package-lock.json` deleted; OL-era test mocks cleaned; production build succeeds (2,018 KB main JS — mapbox-gl ~1,700 KB + app ~318 KB); 172 Vitest tests pass on the OL-free dep tree
- Bug found and fixed in human UAT: `isStyleLoaded()` returns false during async clustered GeoJSON processing in Mapbox v3, blocking URL-restored filters and click selection; replaced with source/layer existence checks across `_applyVisibleIds`, `_applySelection`, `_applyBoundaryMode`, `_applyBoundarySelection`
- Bundle reality check: `mapbox-gl` v3 contributes ~1,700 KB to the main chunk and is not tree-shakeable; ROADMAP's "<200 KB" target was unrealistic; reframed as "app code excluding mapbox-gl"

**Known deferred items at close:** 2 (cluster blob selection visual feedback; boundary edge gap/overlap — see STATE.md Pending Todos)

---

## v2.7 Unified Occurrence Model (Shipped: 2026-04-17)

**Phases completed:** 4 phases (Phases 62–65), 8 plans
**Timeline:** 1 day (2026-04-17)
**LOC:** +9,338/−1,831 across 62 files

**Key accomplishments:**

- `export.py` full outer join of ecdysis specimens + iNat samples into single `occurrences.parquet` (25 columns); COALESCE-unified `lat`/`lon`/`date`; `validate-schema.mjs` updated; TDD with 6 failing tests first
- `sqlite.ts` loads single `occurrences` table; `loadAllTables` renamed to `loadOccurrencesTable`; all call sites and test mocks updated
- `buildFilterSQL` rewritten to return single `{ occurrenceWhere }` clause for unified table; all 167 existing filter tests pass without assertion changes
- `OccurrenceSource` replaces `EcdysisSource` + `SampleSource`; discriminated union `SelectionState` added; spatial cluster restore unified; `ecdysis:<int>` / `inat:<int>` feature ID convention preserved
- `bee-occurrence-detail` new unified component with null-omit rendering; `layerMode` eliminated from `url-state.ts`, all query functions, and all UI components; `bee-specimen-detail` + `bee-sample-detail` deleted

---

## v2.6 SQLite WASM Migration (Shipped: 2026-04-17)

**Phases completed:** 3 phases, 5 plans
**Timeline:** 2 days (2026-04-16 → 2026-04-17)

**Key accomplishments:**

- Baseline DuckDB WASM numbers captured: 539ms instantiate, 1941ms tablesReady, 613ms first-query, 18.7MB heap peak (Chrome 146, M1 MacBook Air)
- `sqlite.ts` module created: wa-sqlite (MemoryVFS sync build) + hyparquet parquet reader; `getDB`/`tablesReady`/`loadAllTables` API; `wa-sqlite.d.ts` type declarations written manually (no bundled types)
- features.ts, filter.ts, bee-atlas.ts migrated from DuckDB Arrow API to wa-sqlite exec callbacks; 5 SQL dialect rewrites (DuckDB `year()`/`month()` → SQLite `strftime`); all 165 tests pass
- Browser E2E verified; three runtime bugs found and fixed: Vite pre-bundling broke WASM URL resolution (`optimizeDeps.exclude`), concurrent `sqlite3.exec` caused Asyncify reentrance (serialized via microtask queue), hyparquet Date objects bound as null (converted to ISO strings)
- `@duckdb/duckdb-wasm` + `apache-arrow` removed from package.json; `frontend/src/duckdb.ts` deleted; `tsconfig.json` updated to make `@types/node` dependency explicit; 165 tests passing; `npm run build` succeeds
- Benchmark outcome: wa-sqlite 8× faster to instantiate, 1.8× faster to tablesReady, 613× faster first-query; heap after tablesReady 4× higher (76 vs 19 MB) due to hyparquet JS memory model

---

## v2.5 Elevation Data (Shipped: 2026-04-16)

**Phases completed:** 4 phases, 7 plans
**Timeline:** 2 days (2026-04-15 → 2026-04-16)
**LOC:** +8,556/−1,438 across 82 files

**Key accomplishments:**

- Built `dem_pipeline.py` DEM acquisition module (seamless-3dep + rasterio) with 5 synthetic fixture tests; discovered Ecdysis source already carries `minimum_elevation_in_meters` so rasterio path unused in production
- Both parquet outputs gain `elevation_m` (INT16, nullable) via pyarrow post-processing in `export.py`; schema gate enforced in CI; fixed geometry_wkt schema mismatch blocking full pytest suite
- `elevation_m` threaded from DuckDB through OL feature properties to `Sample`/`SampleEvent` TypeScript interfaces, with URL restore path covered
- Conditional elevation rows in `bee-specimen-detail` and `bee-sample-detail` — "1219 m" format, strict null-omission, 4 Vitest tests
- Elevation range filter (min/max number inputs) in filter toolbar with D-06 conditional null semantics (both bounds → exclude nulls; one bound → pass nulls through); `elev_min`/`elev_max` URL round-trip; 19 new tests

---

## v2.3 Specimen iNat Observation Links (Shipped: 2026-04-13)

**Phases completed:** 4 phases, 4 plans
**Timeline:** 2 days (2026-04-12 → 2026-04-13)

**Key accomplishments:**

- Atomically renamed `inat_observation_id` → `host_observation_id` across 12 source files (Python pipeline, export SQL, schema gate, TypeScript interfaces, test fixtures) to disambiguate before adding the new column
- Built WABA dlt pipeline (`waba_pipeline.py`) fetching 1,374 iNat observations via `field:WABA=` filter into isolated `inaturalist_waba_data` schema with incremental `updated_at` cursor
- Added `specimen_observation_id` (nullable BIGINT) to `ecdysis.parquet` via `waba_link` CTE joining WABA OFV catalog numbers to ecdysis `catalog_number` numeric suffixes; 1,347 specimens now have photo links in production data
- Surfaced specimen observation as camera emoji link (📷) in sidebar detail view; 3 Vitest render tests cover link presence, absence, and independence from host observation link

---

## v2.2 Feed Discoverability & Pipeline (Shipped: 2026-04-13)

**Phases completed:** 3 phases, 5 plans, 0 tasks

**Key accomplishments:**

- `FeedEntry` interface
- `FeedEntry` interface
- One-liner:

---

## v2.1 Determination Feeds (Shipped: 2026-04-11)

**Phases completed:** 3 phases, 3 plans
**Timeline:** 2 days (2026-04-10 → 2026-04-11)
**LOC:** +2,682/−157 across 27 files

**Key accomplishments:**

- `data/feeds.py` generates valid Atom XML for all recent determinations — DuckDB read-only query with 90-day window, blank-field exclusion, `ET.tostring+write_text` pattern avoiding UTF-8 BOM
- Four variant feed families (per-collector, per-genus, per-county, per-ecoregion) using `_slugify` for path-traversal-safe filenames; always writes even empty feeds; `index.json` lists all variants with title, filter_type, entry_count
- `nightly.sh` delegates to `run.py` (replacing inline heredoc) and uploads all feed files to S3 via `aws s3 sync`
- Browser autodiscovery: `<link rel="alternate" type="application/atom+xml">` in `index.html` pointing to `/data/feeds/determinations.xml`
- 14 feed tests covering all variant types, slug safety, empty feed behavior, and index.json structure; 27/27 data tests passing after fixing pre-existing fixture failures

---

## v2.0 Tabular Data View (Shipped: 2026-04-09)

**Phases completed:** 3 phases, 6 plans, 6 tasks

**Key accomplishments:**

- `viewMode` ('map'|'table') added to `UiState` with URL default-omit pattern (`?view=table` present; omitted when map); 4 round-trip tests added (67 total)
- View mode toggle row added to `bee-sidebar`; `bee-atlas` conditionally renders `<bee-map>` vs `<bee-table>` based on `_viewMode`; SQL injection fix applied to ecdysis ID validation via code review
- `<bee-table>` LitElement presenter with DuckDB-backed pagination (100 rows/page), layer-mode column sets (7 specimen cols / 5 sample cols), row count indicator, and filter integration; 19 new tests (96 total)
- `queryTablePage` and `queryAllFiltered` added to `filter.ts` with allowlist-based SQL injection protection and shared `buildFilterSQL` clause builder
- CSV export: `buildCsvFilename` with priority-based slugified naming (taxon > collector > year > county/ecoregion), `Download CSV` button in pagination bar, browser blob download in `bee-atlas`; 13 new tests (111 total)
- Direct-URL `?view=table` startup bug fixed: `_runTableQuery` now called in DuckDB-ready callback when starting in table mode

---

## v1.9 Component Architecture & Test Suite (Shipped: 2026-04-04)

**Phases completed:** 4 phases, 7 plans, 13 tasks

**Key accomplishments:**

- Pure `url-state.ts` module extracts URL serialization from `bee-map.ts`, exporting typed `buildParams`/`parseParams` functions with zero component dependencies
- `<bee-atlas>` coordinator LitElement created with full app-level state ownership, factory-based style.ts, vitest infrastructure, and updated HTML entry point
- bee-map.ts refactored to pure presenter with 9 @property inputs and 11 CustomEvent outputs; filter.ts/style.ts/region-layer.ts module-level singleton coupling fully removed; coordinator pattern verified in browser
- 1. [Rule 2 - Missing correctness] sample-dot-detail test pattern fixed to match CSS too
- Monotonic generation counter added to `_runFilterQuery` in bee-atlas.ts, discarding stale DuckDB async results that caused a flash of unfiltered specimens when removing county/ecoregion/taxon filter chips.
- 33 Vitest unit tests covering URL round-trips and SQL clause generation for both pure-function frontend modules
- Lit shadow DOM render tests for bee-specimen-detail: non-empty samples surface recordedBy/fieldNumber/species text; empty samples produce zero .sample divs; full 4-file suite (61 tests) passes together.

---

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
