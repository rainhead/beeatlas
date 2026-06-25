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
- ✅ **v4.6 Taxonomy Hierarchy & Normalization** — Phases 129–133 (shipped 2026-06-04). Denormalized rank columns replaced by a taxon_id hierarchy; descendant-by-any-rank map filtering; expandable browse tree; subfamily/taxon pages. See [.planning/milestones/v4.6-ROADMAP.md](milestones/v4.6-ROADMAP.md).
- ✅ **v4.7 Checklist Records as Point Data** — Phases 134–138 (shipped 2026-06-08). 50,646-row Bartholomew CSV promoted into `occurrences.parquet` as a `source='checklist'` point peer with build-time reconciliation + conservative Ecdysis dedup; reverses the Phase 111 lock. See [.planning/milestones/v4.7-ROADMAP.md](milestones/v4.7-ROADMAP.md).
- ✅ **v4.8 Fast, Honest Test Suite** — Phases 139–143 (shipped 2026-06-08). Two-tier pytest (fast <5 min default, opt-in `@integration` slow tier); distilled committed fixtures replace full-file parsing; ~19 red/silent-skip tests greened and randomized-order-stable; nightly + CI gates. See [.planning/milestones/v4.8-ROADMAP.md](milestones/v4.8-ROADMAP.md).
- ✅ **v4.9 Map-Init Readiness** — Phase 144 (shipped 2026-06-09). Retired the recurring map-init race class structurally: await-based legacy-taxon resolution on the `ready.ts` barriers, a single `intendedFilterActive` gate (backed by a reactive `_filterResolving` flag) for hide-all + URL suppression, and the occurrence render moved into `<bee-map>` as f(filteredGeoJSON, intendedFilterActive). See [.planning/milestones/v4.9-ROADMAP.md](milestones/v4.9-ROADMAP.md).
- ✅ **v4.10 Housekeeping** — Phases 145–146 (shipped 2026-06-09). Two maintenance/polish items promoted from backlog: Dependabot version updates across npm (root + `infra/`) + Python (uv) + GitHub Actions, and session-coalesced viewport→history writes so map exploration produces one back-button entry. See [.planning/milestones/v4.10-ROADMAP.md](milestones/v4.10-ROADMAP.md).
- ✅ **v5.0 Offline Field Mode** — Phases 147–154 (shipped 2026-06-21). Installable PWA dogfooded behind unlisted `/app`: scoped service worker, app-shell + `/data/` offline caching with cold-start, cache-health/freshness UX, PWA manifest + install affordances, GeolocateControl + "occurrences near me", and a ToS-compliant Mapbox basemap performance cache. See [.planning/milestones/v5.0-ROADMAP.md](milestones/v5.0-ROADMAP.md).
- ✅ **v5.1 Housekeeping** — Phases 155–159 (shipped 2026-06-23). Post-v5.0 cleanup: the shift-drag discoverability hint and the bounds-as-filter state/URL refactor (155–156), the regions-dropdown stacking fix (157), non-WABA specimen-photo capture via reusable WABA-backfill curation tooling (158, resolved by curation — no pipeline change), and a one-click sidebar taxon-filter shortcut (159). See [.planning/milestones/v5.1-ROADMAP.md](milestones/v5.1-ROADMAP.md).
- ✅ **v5.2 Place Coverage Expansion** — Phases 160–162 (shipped 2026-06-24). Made the place model overlap-capable so an occurrence can belong to multiple places (160 — `occurrence_places` many-to-many bridge mart, scalar `place_slug` dropped, overlap guard removed), then added two new curated place sources on top of it: 33 WDFW wildlife areas (161) and 13 WTA hike corridors (162, ~250 m metric buffers solving the linear-feature problem; 1 of 14 deferred). The model change (160) was split out during Phase 161 research, which found 16 real WDFW↔existing-place overlaps and established that the legacy one-place-per-occurrence rule was an implementation artifact, not a requirement. See [.planning/milestones/v5.2-ROADMAP.md](milestones/v5.2-ROADMAP.md).
- **v6.0 My Work — Progress & Provenance** — Phases 167–172 (in progress). Per-collector bookmarkable pages with a collection→ID lifecycle event stream and accomplishments view, on a rebuilt occurrence model replacing `source` with orthogonal provenance-tier facets. See [.planning/milestones/v6.0-ROADMAP.md](milestones/v6.0-ROADMAP.md).

## Phases

### Active (promoted from backlog 2026-06-24 — milestone TBD)

- [ ] **Phase 163: Ecdysis download requires an authenticated session — add Symbiota login** — ⚠ **BLOCKS NIGHTLY.** Ecdysis/Symbiota's `downloadhandler.php` now returns `401 {"error":"Unauthorized access"}` even with `publicsearch=1` (reproduced via curl 2026-06-24). The pipeline's Ecdysis ingestion (`data/ecdysis_pipeline.py` `_download_zip`) was **always anonymous**, so this is an **upstream breaking change** (the public-download path was closed), not an expired credential. `ecdysis` is `run.py` STEP 1, so every nightly fails at the start until fixed → production data goes stale. Fix: authenticated Symbiota session — `POST /profile/index.php` real credential form (`login`/`password`/`action=login`/`remember`; NO CSRF, NOT the `loginButton` decoy — per 163-RESEARCH live-verified) → `PHPSESSID` on a `requests.Session` → reuse for `downloadhandler.php`, with a magic-bytes/Content-Type response guard and a cache-fallback so a future outage degrades gracefully. Creds live in gitignored `data/.dlt/secrets.toml` on maderas (the account with dataset-44 rights is confirmed available — CONTEXT D-1); CI/deploy unaffected (only pulls from S3). Decoupled immediate unblock for the v5.2 deploy: `ECDYSIS_CACHE_TTL_SECONDS=99999999 bash data/nightly.sh` reuses the cached ZIP. Promoted from backlog 999.12. **Depends on:** none structural (external account access). **Plans:** 1 plan (1 wave).
  Plans:

  - [x] 163-01-PLAN.md — Wave 1: add the `data/.dlt/secrets.toml` gitignore rule (security prereq) + failing fast-tier test scaffold, then patch `_download_zip` with `_get_credentials`/`_login_session`/`_assert_zip_response`/`_is_valid_cached_zip` (authenticated session login, response guard, cache-fallback), then a manual maderas integration checkpoint [D-1, D-2, D-3]
- [x] **Phase 164: Sidebar occurrence list ignores the `src=` source filter** — The source filter (Phase 119 — `hiddenSources` / `_applySourceFilter`, the `src=` URL param) is applied to the **map** layer but not to the **sidebar list / `bbox=` list query**, so the two views disagree: the map hides a source while the list still shows occurrences from **deselected** sources (e.g. `inat`/`inat_obs`/`checklist`). Repro: `?…&pane=list&src=ecdysis,waba_sample` restricts sources but the sidepanel list still includes others. **Resolved:** promoted source into `FilterState.hiddenSources` (first-class, like Phase 156 `bounds`), folded into the shared `buildFilterSQL` predicate + `isFilterActive` so the list, filter-result count, CSV export, and table all honor `src=`; map mechanism (`_visibleBySource`, clustering, ghost) left untouched (D-03/D-04); all-off persists via a `src=none` sentinel (WR-01). Relates to [[project_bounds_are_filter_not_selection]] and the many-to-many place membership work. Promoted from backlog 999.10. **Depends on:** Phase 119 (source filter). **Plans:** 1 plan (1 wave). (completed 2026-06-24 — 864 tests green; operator UAT PASS)
  Plans:

  - [x] 164-01-PLAN.md — Wave 1: promote source into `FilterState.hiddenSources` (type + `buildFilterSQL` `o.source IN (visible)` predicate + `isFilterActive` + `parseParams` read-side) with D-01/D-05 unit tests, then rewire `bee-atlas` so `_onSourceFilterChanged` re-runs the map/count, list, and table queries off `_filterState.hiddenSources` (CSV auto-fixed) and preserves the source filter across other filter changes; map left as-is (`_visibleBySource` retained, D-03/D-04) [D-01..D-05]
- [x] **Phase 165: Duplicate occurrence rows sharing one occ_id across int_combined source arms** — A single physical specimen can appear as TWO `marts/occurrences` rows from different `int_combined` source arms (e.g. `specimen_observation_id 320276469` as both a `waba_sample` and an `inat_obs` row), both resolving to the SAME synthetic `occ_id` via `occIdFromRow` → the occurrence lists **twice** in the sidebar and the D-04 member-place chip renders twice. **Pre-existing** in the unified occurrence model (predates Phase 160; data integrity is fine — Phase 160's WR-01 fix dedupes per-place counts/maps via `COUNT(DISTINCT occ_id)`/`SELECT DISTINCT`; only the *list rendering* shows the dup). Rare today (1 pair) but Phase 161 (WDFW) and more sample/specimen linkage will surface more. Options: (a) dedupe the list/selection query by `occ_id`; (b) give the two source arms distinct `occ_id`s; (c) merge sample+specimen rows into one occurrence at `int_combined` (most correct, biggest change). Open question: semantically one occurrence (collapse) or two (keep both, de-dup display)? Promoted from backlog 999.9. Discussion reframed the dup as a symptom of data-model drift; the chosen approach FIXES the int_combined model (D-01..D-13): correct is_provisional to WABA plant-images project (166376) membership, remove the int_waba_link MIN() catalog-match gap, and keep the 33 pre-Ecdysis iNat-photo specimens as a new `waba_specimen` source — plus a human-first `docs/domain-model.md`. **Depends on:** v2.7 unified occurrence model; surfaced by Phase 160. **Plans:** 4 plans (3 waves). (completed 2026-06-24)
  Plans:

  - [x] 165-01-PLAN.md — Wave 1: create the D-09 occ_id uniqueness dbt test (severity:warn) + the category-3 occIdFromRow vitest case [D-09, D-11]
  - [x] 165-02-PLAN.md — Wave 2: the data-model correction — int_waba_link MIN() fix (rescue 320276469, no ARM 1 fan-out), provisional `waba_sample` arm via project-166376 membership (samples only, D-11), and the new `waba_specimen` arm (the 33 specimens) [D-01,D-02,D-05,D-08,D-09,D-10,D-11,D-12]
  - [x] 165-03-PLAN.md — Wave 3: frontend `waba_specimen` source — SourceKey/VALID_SOURCES, fifth source toggle (+ corrected `waba_sample` copy), occurrence-detail badge [D-12, D-13]
  - [x] 165-04-PLAN.md — Wave 3: `docs/domain-model.md` (human-first 5-category model) + CLAUDE.md link [D-03,D-04,D-06,D-07]
- [ ] **Phase 166: Seasonality charts on species and genus pages** — Add a phenology / seasonality chart showing the months each bee is active. **Species page:** one chart — bars/area over the 12 months showing occurrence counts per month for that species. **Genus page:** the flight season of each species in the genus (small-multiples or a stacked/heatmap "phenogram", species × month grid) for at-a-glance comparison. Pure frontend/visualization over the in-browser wa-sqlite store — `marts/occurrences` already carries the `month` column (used by the existing month filter in `buildFilterSQL`), so no pipeline change; a per-month `COUNT(*)` grouped by `taxon_id` (with descendant roll-up for the genus, mirroring the taxon-descendant subquery already in `buildFilterSQL`) feeds the chart. Open questions for discuss/plan: (1) **where these pages live** — BeeAtlas is map-centric with no per-taxon page route, so this may need a new species/genus view (relates to [[project_taxon_id_milestone]]); (2) chart form (12-bar histogram vs ridgeline/heatmap phenogram) under the static-hosting + no-heavy-deps constraint (CLAUDE.md); (3) null-`month` rows excluded vs shown as "unknown"; (4) count vs normalized y-axis, and whether to respect active source/year filters or always show all-time phenology. Promoted from backlog 999.13 (2026-06-24). **Depends on:** per-taxon page route (none exists yet — see open question 1). **Plans:** TBD.

### v6.0 My Work — Progress & Provenance (Phases 167–172)

- [ ] **Phase 167: Collector Identity Column** — COALESCE `collector_inat_login` into the occurrences mart; dbt contract 36→37; data-before-code S3 release sequence. **Plans:** 1 plan (1 wave; final operator step is a blocking checkpoint).
  Plans:

  - [ ] 167-01-PLAN.md — COALESCE `collector_inat_login` into all 5 int_combined arms + occurrences mart SELECT + schema.yml contract (36→37) with the D-05 hard-error and D-06 warn `not_null` tests; local `run.sh build` + sqlite spot-check; one-time operator SKIP_INTEGRATION_GATE nightly to land the column in S3 [IDENT-01; D-01..D-08]
- [ ] **Phase 168: Temporal Lifecycle Dates** — Surface intrinsic lifecycle dates (collection, posting, identification) into the mart; second isolated dbt contract bump; waba_specimen→ecdysis transition linkage; data-before-code S3 release
- [ ] **Phase 169: Per-Collector Static Pages** — Export `collectors.json`, generate Eleventy pages at `/collectors/{login}/` following the places pattern; public (no auth), gated on `collector_inat_login IS NOT NULL`
- [ ] **Phase 170: Source → Provenance Facets Rebuild** — Replace the `source` enum with orthogonal provenance-tier facets across all three coupled consumers; atomic commit with positional-coupling Vitest assertion; `tier=` URL param with `src=` back-compat
- [ ] **Phase 171: Per-Collector Event Stream** — Reverse-chronological collection→ID feed on the collector page; waba_specimen cataloguing event; pagination for high-volume collectors
- [ ] **Phase 172: Accomplishment View** — County coverage SVG map, taxonomic-breadth species list, ecoregion breadth, and active-seasons badge on the collector page

<details>
<summary>✅ v5.2 Place Coverage Expansion (Phases 160–162) — SHIPPED 2026-06-24</summary>

- [x] **Phase 160: Overlap-capable place model (many-to-many membership)** — Make a bee occurrence able to belong to *multiple* places. Today `marts/occurrences.sql` assigns a single `place_slug` via `ST_Within` + `DISTINCT ON` (no tiebreak), and `places_validation.py` rejects partially-overlapping place polygons (`ST_Overlaps`) to keep that assignment deterministic — an implementation artifact, not a domain requirement (land management genuinely nests/overlaps). Per the locked 160-CONTEXT decisions (D-01/D-02 supersede the earlier `place_slugs VARCHAR[]` sketch): introduce a normalized `occurrence_places` **bridge mart** (one row per occurrence↔place membership, keyed on a synthetic `occ_id` mirroring `occIdFromRow`), **drop** the scalar `place_slug` from the occurrences mart (dbt contract 37→36 cols), drop the overlap-rejection guard, recompute per-place counts (`places_export.py`) + maps (`places_maps.py`) via the bridge (double-count per D-05), and rewrite the frontend place filter (`filter.ts`) to an `EXISTS` membership test + list all member places in occurrence detail (D-04). **Depends on:** v3.7 place data model. **Plans:** 4 plans (4 waves). (completed 2026-06-23)
- [x] **Phase 161: Add WDFW wildlife areas as places** — Add the 33 web-listed Washington Department of Fish & Wildlife wildlife areas to `content/places.toml`, one MultiPolygon entry per area (units dissolved). Source verified: WDFW ArcGIS REST layer (EPSG:4326 GeoJSON); DuckDB-spatial dissolve→WKT, zero new deps. The 16 WDFW↔existing overlaps just work once Phase 160 lands (a shared-ground point tags to both places). Geometry simplified for the browser-shipped `places.geojson` per measured weight (D-05). See `161-CONTEXT.md` + `161-RESEARCH.md`. Promoted from backlog 999.2 (2026-06-22). **Depends on:** Phase 160 (overlap-capable model). **Plans:** 2 plans (2 waves). (completed 2026-06-23)
  Plans:

  - [x] 161-01-PLAN.md — Wave 1: create the committed curation script `data/add_wdfw_wildlife_areas.py` (WDFW ArcGIS fetch → DuckDB dissolve-by-WLA_Name + simplify → 33 MultiPolygon `[[places]]` blocks; Jackman Creek excluded; NO overlap handling — Phase 160 removed the guard) + golden-fixture test [WLA-ACQUIRE, WLA-DISSOLVE, WLA-WGS84; D-01, D-02, D-03]
  - [x] 161-02-PLAN.md — Wave 2: run the script to append 33 WDFW entries to `content/places.toml`, ratify the D-05 simplification tolerance against the ≤~1 MB `places.geojson` budget, and confirm the full pipeline runs green (validation passes with the 16 overlaps loading as multi-place membership; ST_Within + bridge assign slugs; size reported) [WLA-DISSOLVE, WLA-WGS84, WLA-VALID, WLA-WEIGHT; D-01, D-02, D-05]
- [x] **Phase 162: Add specific hikes as places** — Add a hand-curated proof-of-concept set of 14 named WTA hikes to `content/places.toml` as ordinary `[[places]]` entries. Hikes are linear (trail centerline), so each is represented as a ~250 m **corridor buffer** (D-02): OSM/Overpass trail geometry → DuckDB metric buffer in UTM 10N (`always_xy=true`) → MULTIPOLYGON WKT → the reused place pipeline. Source is OSM only (WTA ToS prohibits scraping); 12/14 hikes resolve from OSM, 2 are gaps (Snoqualmie–Olallie, Geyser Valley) handled via deeper OSM query or hand-traced GPX. No `place_type` schema change (D-03); Phase-160 many-to-many means trail↔area overlaps just work. See `162-CONTEXT.md` + `162-RESEARCH.md`. Promoted from backlog 999.3 (2026-06-22). **Depends on:** v3.7 place data model; benefits from Phase 160 (a hike corridor will overlap its parent place). Independent of Phase 161. **Plans:** 2 plans (2 waves). (completed 2026-06-24 — 13 corridors shipped; `snoqualmie-pass-to-olallie-meadow-trail` deferred at the execution checkpoint because OSM only exposes it as the full ~75 km PCT Section J, ~9× the day-hike; commented out in the script for a future hand-traced GPX)
  Plans:

  - [x] 162-01-PLAN.md — Wave 1: create the committed list-driven curation script `data/add_hikes_as_places.py` (OSM/GPX trail geometry → DuckDB ~250 m metric-buffer corridor with `always_xy=true` → 14 MULTIPOLYGON `[[places]]` blocks; 2 OSM gaps tracked-not-dropped) + golden-fixture buffer/slug test [HKE-BUFFER, HKE-SLUG, HKE-NONETWORK; D-01, D-02, D-03]
  - [x] 162-02-PLAN.md — Wave 2: run the script to append the hike corridors to `content/places.toml`, resolve the 2 OSM-gap hikes (deeper OSM query → hand-traced GPX → or formal defer; checkpoint), ratify the simplification tolerance against the ≤~1 MB `places.geojson` budget, and confirm the full pipeline runs green (trail↔area overlaps load as multi-place membership; ST_Within + bridge assign hike slugs; size reported) [HKE-VALID, HKE-LOAD, HKE-WEIGHT; D-01, D-02]

</details>

<details>
<summary>✅ v5.1 Housekeeping (Phases 155–159) — SHIPPED 2026-06-23</summary>

- [x] **Phase 155: Surface shift-drag rectangle selection in the UI** — Desktop-only "Shift-drag on map to set bounds" hint below the "County, ecoregion, or place" input (`.hint` reuse + `@media (hover: hover) and (pointer: fine)` gate; hidden on touch), making the bounds-**filter** gesture discoverable with no behavior change. Promoted from backlog 999.1. Completed 2026-06-21 (operator UAT PASS). **Plans:** 1 plan (1 wave). **UI hint:** yes.
- [x] **Phase 156: Separate spatial-bounds FILTER from per-record SELECTION** — Made the state model and URL contract honest: a spatial box is a FILTER (`FilterState.bounds`, serialized `bbox=`); SELECTION (`o=` ids/cluster) is per-record only. Removed the legacy `_selectionBounds`/`sel=`-write/`_applyBoundsSelection` plumbing and the forced `_paneState='list'`; bounds + selection now coexist; legacy `?sel=` links still restore. Promoted from backlog 999.8. Completed 2026-06-21 (815 tests green; D-08 global filter-reset affordance deferred). **Plans:** 3 plans.
- [x] **Phase 157: Regions dropdown obscured by filter button** — UI bug: the regions dropdown is visually obscured by the filter button (z-index / stacking-context issue in the header/toolbar). Fixed by relocating the region control out of `<bee-map>`'s `z-index:0` context into a `<bee-atlas>` `.map-toolbar` flex row (regions + collapsed filter button), retaining the load-bearing `bee-map { z-index: 0 }`. Promoted from backlog 999.4. Completed 2026-06-22 (operator UAT PASS; 828 tests green). **Plans:** 2 plans (2 waves). **UI hint:** yes.
- [x] **Phase 158: Capture specimen photos from non-WABA-field iNat users** — Some collectors post specimen photos without the "WABA" observation field, so they fall out of the provisional-occurrence path. **Resolved by manual data curation, not a pipeline change** (see 158-CONTEXT.md): affected collectors record their WSDA catalog number in the observation *description* (prefixed `OBA`/`WABA`) rather than the WABA field; the fix is per-collector curation that copies the number into field `18116`, after which the existing `int_waba_link` machinery matches it. Durable tooling committed at `data/curation/waba_backfill/` (commit `21b11df0`). Executed for @swisschick (470 WABA fields written, 0 errors) + @rainhead, 2026-06-22. No nightly-pipeline automation built — capture remains a curator-run operation (deferred). Promoted from backlog 999.5. **Plans:** 0 (resolved via curation, no plan/execute pass). (completed 2026-06-22)
- [x] **Phase 159: Filter by taxon from occurrence summary in sidebar** — Give a quick click target on a taxon in the sidebar occurrence summary to filter the map to just that taxon, saving the filter-panel round-trip. Decisions locked in 159-CONTEXT.md: filter at the exact `taxon_id` clicked (no species roll-up, D-05); replace only the taxon dimension and preserve all other active filters (intersect, D-07); table/drawer view affordance deferred (sidebar list only). Implementation is a new *entry point* into the existing filter — thread `filterState` pane→`bee-occurrence-detail`, dispatch the existing `FilterChangedEvent` upward (`bubbles/composed`), demote external record links to icons. Promoted from backlog 999.6. **Plans:** 1 plan (1 wave). **UI hint:** yes. (completed 2026-06-23)
  Plans:

  - [x] 159-01-PLAN.md — Taxon name → one-click filter across occurrence-detail render paths; external links demoted to icons; source-text tests.

</details>

### ✅ v5.0 Offline Field Mode (Phases 147–154) — SHIPPED 2026-06-21

- [x] **Phase 147: `/app` Route + SW Topology** — Unlisted `/app/` route served by Eleventy; `sw.js` registered with `scope: '/app'`; no SW on `/`; CDK `no-cache` behavior on `sw.js` + `manifest.webmanifest`. **Plans:** 2 plans (1 wave).
- [x] **Phase 148: App Shell Precache + vite-plugin-pwa Wiring** — `vite-plugin-pwa` wired through `eleventy.config.js` `viteOptions.plugins` with `injectManifest` strategy; hashed JS/CSS for the `/app` entry precached and verified offline.
- [x] **Phase 149: `/data/` Runtime Caching + Offline Cold-Start** — `occurrences.db` + all GeoJSON cached via `CacheFirst` runtime strategy; full offline cold-start; re-prime if DB absent on reconnect; `QuotaExceededError` handling; graceful basemap-degradation label; online/offline status indicator.
- [x] **Phase 150: Cache Health & Freshness UX** — "Ready for offline" indicator; determinate prime progress bar; cache-size display; "Data as of `<date>`" freshness label; SW update lifecycle with prompt-to-reload (no `skipWaiting`).
- [x] **Phase 151: PWA Manifest & Installability** — `manifest.webmanifest` with icons; `beforeinstallprompt` capture for Android; iOS "Add to Home Screen" instructions; offline cold-start in standalone mode confirmed. **Plans:** 4 plans (3 waves).
  - [x] 151-01-PLAN.md — Wave 0: static `manifest.webmanifest` + from-scratch icon set (SVG master + 192/512/maskable/apple-touch PNGs) + non-build-wired `gen-app-icons.sh` + test scaffolds (`install-affordance.test.ts`, `build-output.test.ts` extension) [PWA-01, PWA-02; D-01..D-08, D-13]
  - [x] 151-02-PLAN.md — Wave 1: `<link rel="manifest">` + iOS `apple-*` meta + apple-touch-icon on `_pages/app/index.html` only (no-PWA-on-/ guarantee) [PWA-01, PWA-02; D-04]
  - [x] 151-03-PLAN.md — Wave 1: install affordance — `install-prompt.ts` capture + `<bee-atlas>` `_installable`/`_iosInstructable` relay + `<bee-header>` Install button & iOS A2HS popover (reuse cache chrome) [PWA-01, PWA-02; D-09..D-12]
  - [x] 151-04-PLAN.md — Wave 2: `151-HUMAN-UAT.md` real-device offline cold-start checklist + blocking human-verify checkpoint (autonomous: false, UI hint: yes) [PWA-03; D-13, D-14]
- [x] **Phase 152: GeolocateControl + Location State** — `GeolocateControl` added in `<bee-map>.firstUpdated()` (after `new mapboxgl.Map()`, offline-safe); `user-location-changed` composed CustomEvent relayed to `<bee-atlas>` (`@state _userLocation`); blue dot + accuracy ring + recenter; granted-only auto-trigger (D-03); app-level denied/unavailable banner. Control placed **top-left** (UAT deviation from D-02: the custom Regions button owns top-right). Completed 2026-06-20 (3/3 plans, verified 4/4, operator UAT PASS). **Plans:** 3 plans (3 waves). **UI hint:** yes.
  - [x] 152-01-PLAN.md — Wave 0: create `src/tests/geolocation.test.ts` (source-analysis gate for the LOC-02 pure-presenter invariant) + extend the `mapbox-gl` `vi.mock` in `bee-atlas.test.ts`/`cache-state.test.ts` (addControl + GeolocateControl stub) [LOC-02]
  - [x] 152-02-PLAN.md — Wave 1: GeolocateControl in `bee-map.ts` (D-01 opts, granted-only auto-trigger D-03, emit `user-location-changed`) + `bee-atlas.ts` `@state _userLocation`/`_locationError`, handler, binding, denial banner (D-04) [LOC-01, LOC-02, LOC-03]
  - [x] 152-03-PLAN.md — Wave 2: `152-HUMAN-UAT.md` (blue dot/recenter, offline GPS, denial banner, real-device iOS standalone) + blocking human-verify checkpoint (autonomous: false) [LOC-01, LOC-03]
- [x] **Phase 153: Occurrences Near Me** — A geolocate-icon button inside the "County, ecoregion, or place" input resolves the user's GPS into a ~10 km bounding box, applied as a spatial **filter** (map + list + table) that REUSES the existing shift-drag mechanism (`_selectionBounds` → `filter.ts` `boundsClause` → `sel=west,south,east,north` URL round-trip). Active bounds show **in that input** (no chip); AND-composes with other filters; a shared link reproduces the exact occurrence set with no recipient GPS. Redesigned 2026-06-21 from the reverted haversine/`?near=1` form (commit a4e269cb); bounds promoted from selection to filter (shift-drag too — see Phase 156). Completed 2026-06-21 (operator UAT PASS; 792 tests green). **Plans:** 4 plans (3 waves). **UI hint:** yes.
  - [x] 153-01-PLAN.md — Wave 1: `<bee-map>` public `requestUserLocation()` seam (promote GeolocateControl to an instance field) + geolocation source-analysis gate [NEAR-01/02/03; D-06]
  - [x] 153-02-PLAN.md — Wave 1: `<bee-pane>` geolocate button in the where `.input-wrap` (emits `near-me-requested`) + icon-only removable bounds chip (emits `near-me-cleared`) + `selectionBoundsActive` property + render tests [NEAR-01/02/03; D-04, D-05]
  - [x] 153-03-PLAN.md — Wave 2: `<bee-atlas>` integration — `boundsFromLocation` ±10 km box, shared `_applyBoundsSelection` (near-me ≡ shift-drag state + `sel=` URL), event handlers, `selectionBoundsActive` binding, Phase 152 denial-toast fix + tests [NEAR-01/02/03; D-01, D-02, D-03, D-07, D-08, D-09]
  - [x] 153-04-PLAN.md — Wave 3: `153-HUMAN-UAT.md` (desktop DevTools-Sensors scenarios + the shared-URL reproducibility check + real-device confirmation) + blocking human-verify checkpoint (autonomous: false / auto_advance: false) [NEAR-01/02/03; D-03, D-05, D-08, D-09]
- [x] **Phase 154: Mapbox Basemap Performance Cache (ToS-compliant)** — Re-scoped 2026-06-21: ToS review found web-SDK offline serving isn't licensed, so this is now a ship-enabled StaleWhileRevalidate **performance** cache for basemap requests (token retained, 200-only, `maxEntries` + ≤30d TTL, attribution intact), not an offline feature; ADR records the legal analysis. **Plans:** 1 plan (1 wave). (completed 2026-06-21)
  - [x] 154-01-PLAN.md — SWR `mapbox-basemap` route in `src/sw.ts` (token retained, 200-only, 7-day TTL, `maxEntries` 150, `/map-sessions/`+events excluded) + ToS ADR `docs/adr/0001-mapbox-basemap-cache.md` + CLAUDE.md pointer + build-output assertions [TILE-01, TILE-02; D-01..D-08]

### ✅ v4.10 Housekeeping (Phases 145–146) — SHIPPED 2026-06-09

- [x] **Phase 145: Add npm + Python deps to Dependabot** — Dependabot version updates across npm (root + `infra/`), Python (`data/` via uv), and GitHub Actions, with grouped/scheduled PRs. Promoted from backlog 999.2. Completed 2026-06-09. **Plans:** 1 plan (1 wave).
  - [x] 145-01-PLAN.md — add npm (`/`) + uv (`/data`) entries, retrofit github-actions grouping; all weekly, minor+patch grouped, major ungrouped [D-01..D-05]
- [x] **Phase 146: Debounce URL updates on map zoom/pan** — session-coalesced viewport history writes (one entry per exploration session, delimited by filter/selection/UI actions). Promoted from backlog 999.1. Completed 2026-06-09.

### ✅ v4.9 Map-Init Readiness (Phase 144) — SHIPPED 2026-06-09

- [x] **Phase 144: Map-Init Readiness** — Converted legacy-taxon resolution to `await taxaReady` (retired the store-and-poll dance); introduced a dedicated reactive `_filterResolving` flag + single `intendedFilterActive` gate (hide-all + URL suppression); moved the render decision into `bee-map` so the occurrence layer is a pure function of `(filteredGeoJSON, intendedFilterActive)` — no unfiltered flash structurally possible. Built on `ready.ts` (quick task 260608-tnc). Completed 2026-06-09 (2/2 plans, verified 5/5).

### Phase 144: Map-Init Readiness

**Goal**: The recurring map-init race class is retired structurally. Legacy-taxon URL resolution awaits `taxaReady` instead of storing-and-polling; a single `intendedFilterActive` gate (backed by a dedicated `_filterResolving` flag, not `_pendingLegacyTaxon`) governs hide-all + URL suppression; and the first occurrence-layer render is a pure function of `(filteredGeoJSON, intendedFilterActive)` gated on `mapReady` — so an unfiltered flash or a stranded legacy-taxon URL is no longer structurally possible, not merely timed-around.
**Depends on**: `ready.ts` readiness barriers (`taxaReady`/`mapReady`) shipped in quick task 260608-tnc (commit 90dfe12)
**Requirements**: None formal — v4.9 is a single-phase milestone scoped by this roadmap entry and the LOCKED design decisions in `.planning/STATE.md` (planning discussion 2026-06-09). To be captured in `144-CONTEXT.md` via discuss-phase.
**Success Criteria** (what must be TRUE):

  1. Legacy-taxon URL resolution `await`s `taxaReady` (the store-in-`_pendingLegacyTaxon`-and-poll dance is removed); a legacy-taxon deep link resolves to its modern taxon and applies the filter without depending on render-cycle timing
  2. A dedicated `_filterResolving` boolean feeds a single `intendedFilterActive` getter on `<bee-atlas>`; hide-all behavior and URL suppression both read from that one gate (no second source of "are we mid-resolve" truth)
  3. `<bee-map>` decides the occurrence layer render as a pure function of `(filteredGeoJSON, intendedFilterActive)`, gated on `mapReady`; the unfiltered-flash-on-load path is removed at the structural level, not guarded by a timer or ordering assumption
  4. State ownership is preserved: `<bee-atlas>` still owns all reactive state, `<bee-map>` remains a pure presenter receiving state as properties (Architecture Invariant); the filter race guard (`_filterQueryGeneration`) and style-cache bypass rules are not regressed
  5. The regression net `bee-atlas-legacy-taxon.test.ts` (commit 5833b41) passes, and tests cover the await-resolution path and the `intendedFilterActive` gate; `npm test` is green and `npm run build` succeeds

**Plans**: 2 plans (2 waves — sequential; both touch bee-atlas.ts)
Plans:

- [x] 144-01-PLAN.md — await-taxaReady legacy resolution + dedicated `_filterResolving` flag feeding a single `intendedFilterActive` gate (hide-all + URL suppression); regression net updated (Wave 1)
- [x] 144-02-PLAN.md — move occurrence render decision into `bee-map` as f(filteredGeoJSON, intendedFilterActive) gated on `mapReady`; remove bee-atlas empty-collection pre-seed (Wave 2, depends on 144-01)

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

<details>
<summary>✅ v4.6 Taxonomy Hierarchy & Normalization (Phases 129–133) — SHIPPED 2026-06-04</summary>

- [x] Phase 129: Hierarchy Foundation (3/3 plans) — completed 2026-06-02
- [x] Phase 130: Map Filter Cutover (3/3 plans) — completed 2026-06-02
- [x] Phase 131: Occurrence Normalization (4/4 plans) — completed 2026-06-03
- [x] Phase 132: Page Rebuild & Subfamily Pages (4/4 plans) — completed 2026-06-03
- [x] Phase 133: Browse Tree (4/4 plans) — completed 2026-06-03

See `.planning/milestones/v4.6-ROADMAP.md` for full phase details.

</details>

<details>
<summary>✅ v4.7 Checklist Records as Point Data (Phases 134–138) — SHIPPED 2026-06-08</summary>

- [x] Phase 134: Full-Fidelity Ingest (2/2 plans) — completed 2026-06-04
- [x] Phase 135: Name Reconciliation (5/5 plans) — completed 2026-06-08
- [x] Phase 136: Deduplication (4/4 plans) — completed 2026-06-08
- [x] Phase 137: Promotion into Occurrences (2/2 plans) — completed 2026-06-08
- [x] Phase 138: Frontend Points & Detail Card (4/4 plans) — completed 2026-06-08

See `.planning/milestones/v4.7-ROADMAP.md` for full phase details.

</details>

<details>
<summary>✅ v4.8 Fast, Honest Test Suite (Phases 139–143) — SHIPPED 2026-06-08</summary>

- [x] Phase 139: Baseline & Two-Tier Scaffold (1/1 plans) — completed 2026-06-05
- [x] Phase 140: Checklist & Taxonomy Fixture Distillation (2/2 plans) — completed 2026-06-06
- [x] Phase 141: Built-Asset Fixtures, Red-Test Fixes & Silent-Skip Elimination (5/5 plans) — completed 2026-06-06
- [x] Phase 142: Verify Budget, Green Suite & Nightly Wiring (2/2 plans) — completed 2026-06-07
- [x] Phase 143: CI Gate (1/1 plans) — completed 2026-06-07

See `.planning/milestones/v4.8-ROADMAP.md` for full phase details.

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

---

<!-- Phase 134-138 (v4.7) details archived to .planning/milestones/v4.7-ROADMAP.md -->

### Phase 140: Checklist & Taxonomy Fixture Distillation

**Goal**: The two dominant per-test parse costs in the `data/` build-time tier are eliminated — checklist fast-tier tests read a tiny committed sample through the real `load_checklist()` path against a once-built module-scoped in-memory DuckDB, and resolver fast-tier tests read a tiny committed ancestry gz — with committed, provenance-documented fixtures in `data/tests/fixtures/`. The real nightly path is behavior-unchanged.
**Depends on**: Phase 139
**Requirements**: TFIXTURE-01, TFIXTURE-02, TFIXTURE-04
**Success Criteria** (what must be TRUE):

  1. `test_checklist_pipeline.py` fast-tier tests no longer call the full 50,646-row loader; they read an 8-row committed sample through the real `load_checklist(con=con)` CSV→DuckDB path, with the DuckDB built once per file via a module-scoped shared in-memory connection; rewritten count assertions match the sample's exact counts
  2. The two `@pytest.mark.integration` checklist tests keep reading the real `checklist_records_full.csv` (unchanged) and remain in the nightly tier
  3. `resolve_checklist_names` fast-tier tests read a 2-row committed `taxa_subset.csv.gz` and pass with `data/raw/taxa.csv.gz` ABSENT from disk
  4. `data/tests/fixtures/` exists holding `checklist_sample.csv` + `taxa_subset.csv.gz`, each with recorded provenance (which rows/taxa distilled from, which branch invariants preserved)

**Plans**: 2 plans
Plans:
**Wave 1**

- [x] 140-01-PLAN.md — load_checklist(con=) seam + resolve_checklist_names TAXA_PATH constant + committed checklist_sample.csv (8 rows) and taxa_subset.csv.gz (2 rows) with provenance [TFIXTURE-01, TFIXTURE-02, TFIXTURE-04]

**Wave 2** *(blocked on Wave 1)*

- [x] 140-02-PLAN.md — module-scoped shared-connection checklist_sample_db fixture + fast-tier test migration + exact-count rewrites; resolver TAXA_PATH monkeypatch + absent-file proof [TFIXTURE-01, TFIXTURE-02]

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
| 129. Hierarchy Foundation | v4.6 | 3/3 | Complete | 2026-06-02 |
| 130. Map Filter Cutover | v4.6 | 3/3 | Complete | 2026-06-02 |
| 131. Occurrence Normalization | v4.6 | 4/4 | Complete | 2026-06-03 |
| 132. Page Rebuild & Subfamily Pages | v4.6 | 4/4 | Complete | 2026-06-03 |
| 133. Browse Tree | v4.6 | 4/4 | Complete | 2026-06-03 |
| 134. Full-Fidelity Ingest | v4.7 | 2/2 | Complete    | 2026-06-04 |
| 135. Name Reconciliation | v4.7 | 5/5 | Complete   | 2026-06-08 |
| 136. Deduplication | v4.7 | 4/4 | Complete    | 2026-06-08 |
| 137. Promotion into Occurrences | v4.7 | 2/2 | Complete    | 2026-06-08 |
| 138. Frontend Points & Detail Card | v4.7 | 4/4 | Complete    | 2026-06-08 |
| 139. Baseline & Two-Tier Scaffold | v4.8 | 1/1 | Complete    | 2026-06-05 |
| 140. Checklist & Taxonomy Fixture Distillation | v4.8 | 2/2 | Complete    | 2026-06-06 |
| 141. Built-Asset Fixtures, Red-Test Fixes & Silent-Skip Elimination | v4.8 | 5/5 | Complete    | 2026-06-06 |
| 142. Verify Budget, Green Suite & Nightly Wiring | v4.8 | 2/2 | Complete    | 2026-06-07 |
| 143. CI Gate | v4.8 | 1/1 | Complete    | 2026-06-07 |
| 144. Map-Init Readiness | v4.9 | 2/2 | Complete    | 2026-06-09 |
| 145. Add deps to Dependabot | v4.10 | 1/1 | Complete    | 2026-06-09 |
| 146. Debounce URL on map move | v4.10 | 1/1 | Complete    | 2026-06-09 |

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

<!-- ✅ v4.6 Taxonomy Hierarchy & Normalization (Phases 129–133) — SHIPPED 2026-06-04.
     Full phase details, success criteria, and progress archived to
     .planning/milestones/v4.6-ROADMAP.md -->

### Phase 139: Baseline & Two-Tier Scaffold

**Goal**: The current suite's actual runtime is measured and documented; the two-tier marker infrastructure is in place so all subsequent phases have a before/after number and a fast/slow harness
**Depends on**: Nothing (first phase of v4.8)
**Requirements**: TPERF-01, TTIER-01
**Success Criteria** (what must be TRUE):

  1. `data/tests/BASELINE.md` is committed listing total wall-clock time and per-file/per-fixture durations from `pytest --durations`, with the exact command to reproduce
  2. A `slow` marker is registered in `data/pyproject.toml` (or `conftest.py`) and `addopts` deselects it by default; running `uv run pytest` runs only unmarked (fast) tests
  3. An explicit opt-in (`-m slow` or `--run-slow`) runs the heavy tier; the two-tier mechanism is verified with at least one placeholder `@pytest.mark.slow` test
  4. The measured baseline runtime matches or exceeds expectations (documents the before-state); the fast tier at this point is a subset of the full suite

**Plans**: 1 plan

- [x] 139-01-PLAN.md — BASELINE.md estimate doc + register `integration` marker, addopts deselect, tag 1-2 dataset tests to prove the harness

> **Note:** Success criteria above predate `/gsd:discuss-phase` and use stale terms (`slow` marker, `-m slow`/`--run-slow`, full timed `--durations` run). The LOCKED decisions in `139-CONTEXT.md` supersede them: marker is `integration` (not `slow`), opt-in is stock `-m integration` only (no custom flag), and the baseline is an ESTIMATE — the full ~40-min run is intentionally NOT paid (D-01/D-05/D-06).

---

### Phase 140: Checklist & Taxonomy Fixture Distillation

**Goal**: The two dominant per-test parse costs are eliminated — checklist CSV full-file parsing is replaced by a committed sample and the DuckDB build is session-scoped; taxa ancestry parsing is replaced by a committed small fixture; all fixtures live in a documented directory
**Depends on**: Phase 139
**Requirements**: TFIXTURE-01, TFIXTURE-02, TFIXTURE-04
**Success Criteria** (what must be TRUE):

  1. `test_checklist_pipeline.py` fast-tier tests load from a committed sample (not `checklist_records_full.csv`) and the per-test DuckDB build is replaced by a session/module-scoped fixture; the file runs in seconds, not minutes
  2. `test_resolve_checklist_names.py` fast-tier tests pass with `raw/taxa.csv.gz` absent from disk; per-test cost drops to sub-second
  3. `data/tests/fixtures/` exists and contains committed sample and ancestry fixture files with a README or docstrings recording which real rows each covers and what branch invariants they preserve
  4. Existing test assertions are rewritten against the samples' known counts; no assertion silently loses coverage by testing against a smaller set without updating expectations

**Plans**: TBD

---

### Phase 141: Built-Asset Fixtures, Red-Test Fixes & Silent-Skip Elimination

**Goal**: Tests that previously required un-checked-in built assets now run on clean checkout using committed fixtures; the ~19 red tests are green; no test silently skips due to a missing asset in the fast tier; full-data checks are tagged slow
**Depends on**: Phase 140
**Requirements**: TFIXTURE-03, TFIX-01, TFIX-02, TFIX-03, TFIX-04, TTIER-02
**Success Criteria** (what must be TRUE):

  1. The formerly-skipped dbt/parquet scaffold, diff, higher-taxa, and species-export assertions now run and pass on a clean checkout (no `dbt/target`, no `public/data/*.parquet`)
  2. The ~16 `test_resolve_taxon_ids.py` tests that required `dbt_sandbox.occurrence_synonyms` pass — `resolver_db` fixture provides the table and tests assert real resolution behavior
  3. `test_dbt_diff.py` failures are resolved — either converted to fixture-based comparison or replaced with a loud explicit skip; no silent-pass on stale data
  4. The `test_at_least_13_fuzzy_candidates` failure in `test_resolve_checklist_names.py` is fixed
  5. A clean-checkout fast run reports 0 silent asset-driven skips; all remaining conditional skips are visible in the summary and confined to the integration tier
  6. Genuine full-data checks (50,646-row count, full taxa.csv.gz LCA, sandbox-vs-public parquet diff) are tagged `@pytest.mark.integration` (the marker locked in Phase 139; `addopts = -m "not integration"` deselects it by default); they pass when explicitly run against real built data

**Plans**: 5 plans (1 gap-closure)

Plans:
**Wave 1**

- [x] 141-01-PLAN.md — Distilled fixture CSVs (species/higher_taxa/occurrences) + D-05 silent-skip conftest guard
- [x] 141-02-PLAN.md — resolver_db fix: add dbt_sandbox.occurrence_synonyms + inaturalist_waba_data.observations (16 tests)

**Wave 2** *(blocked on Wave 1 completion)*

- [x] 141-03-PLAN.md — Parquet-fixture consumers: rewrite test_species_export + test_dbt_synonymy; tag real-data tests @integration
- [x] 141-04-PLAN.md — @integration tagging (test_dbt_diff / fuzzy / species_maps) + WR-01/WR-02 checklist_pipeline hardening

**Gap closure** *(closes SC-1 / SC-5 / TFIX-04 from 141-VERIFICATION.md)*

- [x] 141-05-PLAN.md — Migrate the two unmigrated files (test_dbt_scaffold.py, test_higher_taxa.py) to @integration + tighten the D-05 --select signature stem

---

### Phase 142: Verify Budget, Green Suite & Nightly Wiring

**Goal**: The fast suite is demonstrably green, under 5 minutes, and clean-checkout-safe; the slow tier is wired into nightly.sh so full-data regressions surface in the nightly log
**Depends on**: Phase 141
**Requirements**: TFIX-05, TPERF-02, TPERF-03, TTIER-03
**Success Criteria** (what must be TRUE):

  1. `cd data && uv run pytest` completes in under 5 minutes on the dev host (timed run confirmed; result recorded)
  2. `cd data && uv run pytest` passes with 0 failures and 0 errors on a clean checkout: no `dbt/target`, no `public/data`, no `raw/taxa.csv.gz`, no `beeatlas.duckdb` present
  3. `nightly.sh` invokes the slow/integration tier after the build completes; a non-zero exit from the slow tier is observable in the nightly log (non-zero exit or logged error)
  4. The slow tier passes when run on maderas against real built data (full 50,646-row pipeline + dbt outputs present)

**Plans**: 2 plans
Plans:
**Wave 1**

- [x] 142-01-PLAN.md — Add pytest-randomly; prove fast suite green (randomized) + record budget; fix test_at_least_13_fuzzy_candidates fixture; create+run verify-clean-checkout.sh; update BASELINE.md [TFIX-05, TPERF-02, TPERF-03]

**Wave 2** *(blocked on Wave 1)*

- [x] 142-02-PLAN.md — Wire nightly.sh: block 1c pre-run public/data baseline pull + block 2b @integration hard gate before publish; document expected first-run test_dbt_diff behavior [TTIER-03]

---

### Phase 143: CI Gate

**Goal**: Every push and pull request automatically runs the fast pytest suite; a failed or slow suite fails the build; Python tests are no longer invisible in CI
**Depends on**: Phase 142
**Requirements**: TCI-01, TCI-02
**Success Criteria** (what must be TRUE):

  1. A GitHub Actions job runs `cd data && uv run pytest` using Python 3.14 + uv on push and pull request; the build fails on any test failure or error
  2. The CI job enforces the runtime budget — the build fails (or is flagged as a warning-level failure) if the fast suite exceeds 5 minutes
  3. The CI job completes successfully on a clean checkout (no cached built assets); the Python test job is visible in the PR check list alongside the existing frontend build job
  4. A green CI run is confirmed end-to-end on a push to a branch

**Plans**: 1 plan

Plans:

- [x] 143-01-PLAN.md — Add independent python-tests.yml CI workflow (fast suite on push, hard <5 min budget) and confirm a green run

### Phase 145: add npm and python deps to dependabot

**Goal:** Enable Dependabot version updates across all three dependency ecosystems — npm (root `package.json`/`package-lock.json`), Python (`data/` via uv / `pyproject.toml` + `uv.lock`), and GitHub Actions (the workflows in `.github/workflows/`) — with grouped/scheduled PRs to keep deps current. Promoted from backlog (999.2) 2026-06-09; part of v4.10 Housekeeping.
**Requirements**: TBD
**Depends on:** Phase 144
**Plans:** 1/1 plans complete

Plans:

- [x] TBD (run /gsd-plan-phase 145 to break down) (completed 2026-06-09)

### Phase 146: debounce URL updates when zooming and panning the map

**Goal:** Reduce browser-history churn from map pan/zoom by session-coalescing viewport writes: an entire exploration session yields exactly ONE history entry (delimited by a meaningful filter/selection/UI action), while the live URL still always reflects the current viewport. (Reframed during discussion: per-frame URL writes were already a non-issue — `moveend` fires once per settled gesture; the real problem is viewport being the app's only `pushState`.) Promoted from backlog (999.1) 2026-06-09; part of v4.10 Housekeeping.
**Requirements**: None (no REQUIREMENTS.md IDs for this phase)
**Depends on:** None (independent of Phase 145; baseline is the current `<bee-map>`/URL-state code)
**Plans:** 1/1 plans complete

Plans:

- [x] 146-01-PLAN.md — session-coalesced viewport→history writes in <bee-atlas> + scoped bee-atlas tests

---

### Phase 147: `/app` Route + SW Topology

**Goal**: A correctly-scoped service worker exists at `/app/sw.js` with `scope: '/app'`, the unlisted `/app/` route is served by Eleventy, and the main `/` route has no service worker — verified in DevTools. CDK serves `sw.js` and `manifest.webmanifest` with `Cache-Control: no-cache` so updates are not delayed by CloudFront's default long-TTL.
**Depends on**: Phase 146 (baseline codebase)
**Requirements**: ROUTE-01, ROUTE-02, ROUTE-03
**Success Criteria** (what must be TRUE):

  1. Navigating to `/app/` loads an Eleventy-served page that is not linked from the main site, sitemap, or nav; the main `/` page is unchanged
  2. DevTools → Application → Service Workers shows a SW attached to `/app` and nothing attached to `/`
  3. `curl -I` on `/app/sw.js` and `/app/manifest.webmanifest` returns `Cache-Control: no-cache` (or equivalent no-cache directive) from CloudFront
  4. SW `scope: /app` means the SW fetch handler intercepts `/data/*` requests made by the `/app` page — confirmed by a DevTools Network entry showing the SW as the initiator for a `/data/` fetch

**Plans**: 2 plans (1 wave — fully parallel; disjoint file sets)
Plans:

- [x] 147-01-PLAN.md — /app Eleventy template + app-entry + sw-registration + pass-through stub sw.js; extend build-output test [ROUTE-01, ROUTE-02] (Wave 1)
- [x] 147-02-PLAN.md — CloudFront no-cache behaviors for /app/sw.js + /app/manifest.webmanifest + CDK template-assertion test [ROUTE-03] (Wave 1)

**UI hint**: yes

### Phase 148: App Shell Precache + vite-plugin-pwa Wiring

**Goal**: `vite-plugin-pwa` is wired via `eleventy.config.js` `viteOptions.plugins` (not `vite.config.ts`) with `injectManifest` strategy; the hashed JS/CSS for the `/app` Vite entry point is precached; `maximumFileSizeToCacheInBytes` is raised to at least 30 MB; and the `/app` page loads fully offline from the SW cache after a single online visit.
**Depends on**: Phase 147
**Requirements**: OFF-01
**Success Criteria** (what must be TRUE):

  1. `_site/app/sw.js` (post-build) contains an injected precache manifest with hash-versioned URLs matching the actual `/app` JS/CSS assets in `_site/`
  2. After one online load of `/app`, DevTools → Network (offline mode) shows JS/CSS served from `(ServiceWorker)` with no network errors
  3. `maximumFileSizeToCacheInBytes` is set to ≥ 30,000,000 in the plugin config (confirmed in `eleventy.config.js`)
  4. `npm run build` succeeds and a post-build verification script (or manual check) confirms every precache URL exists as a file in `_site/`

**Plans**: 1 plan

  - [x] 148-01-PLAN.md — Wire vite-plugin-pwa injectManifest via eleventy.config.js viteOptions.plugins; precache the /app app shell; raise the cache cap to 30 MB; replace the Phase 147 SW stub; verify via build-output assertions + offline HUMAN-UAT

### Phase 149: `/data/` Runtime Caching + Offline Cold-Start

**Goal**: `occurrences.db` (~23 MB) and all GeoJSON files (`counties`, `ecoregions`, `places`) are runtime-cached via Workbox `CacheFirst` strategy in the SW; the app completes a full offline cold-start (map renders, filters run, table populates) with no network connection; iOS eviction is mitigated by re-priming the DB if it is absent on reconnect; `QuotaExceededError` is handled with partial-write cleanup; and the app shows honest UI for the offline state and the blank basemap.
**Depends on**: Phase 148
**Requirements**: OFF-02, OFF-03, OFF-04, OFF-05, CACHE-05
**Success Criteria** (what must be TRUE):

  1. After one online prime, toggling DevTools to offline and refreshing `/app` loads the map with occurrence dots; filter/table/selection queries run against the cached DB without any network requests
  2. County/ecoregion overlays render offline (GeoJSON served from SW cache)
  3. The basemap renders blank (not crashing) offline; a label explains basemap tiles are only available for areas browsed while online
  4. A non-blocking indicator shows the current online/offline state; the map is fully usable in either state
  5. If `occurrences.db` is evicted from cache and the device reconnects, the app re-fetches and re-caches the DB without requiring a manual action; `navigator.storage.persist()` is requested at first launch
  6. A `QuotaExceededError` during DB caching triggers partial-write cleanup (the incomplete cache entry is removed)
  7. SW update lifecycle uses prompt-to-reload, never `skipWaiting`/`clientsClaim` — confirmed by observing the "waiting" SW state in DevTools before the user acknowledges the update prompt

**Plans**: 3 plans (2 waves — Plan 01 in Wave 1; Plans 02 and 03 in Wave 2 in parallel)

  - [x] 149-01-PLAN.md — Wave 1: add workbox-strategies / -expiration / -cacheable-response devDeps; extend src/sw.ts with CacheFirst routes for /data/*.db (ExpirationPlugin maxEntries:1, purgeOnQuotaError:true) and /data/*.geojson under the data-artifacts cache; extend build-output.test.ts with the new runtime-route + no-skipWaiting carry-forward + devDep assertions [OFF-02, OFF-03]
  - [x] 149-02-PLAN.md — Wave 2 (parallel with 03): add the page-side cold-start probe + online re-prime listener in src/app-entry.ts; add the once-per-profile navigator.storage.persist() request in src/sw-registration.ts (localStorage gate); add src/tests/cache-probe.test.ts covering all probe branches [CACHE-05]
  - [x] 149-03-PLAN.md — Wave 2 (parallel with 02): add _offline @state + online/offline event wiring in <bee-atlas>; add offline @property + Offline pill to <bee-header>; add offline @property + blank-basemap explanation overlay to <bee-map> (pure-presenter invariant preserved); add render tests for all three components [OFF-04, OFF-05]

### Phase 150: Cache Health & Freshness UX

**Goal**: The user can see whether the app is ready for offline use, how much space it occupies, how fresh the cached data is, and receives a prompt (not an automatic reload) when a SW update is available.
**Depends on**: Phase 149
**Requirements**: CACHE-01, CACHE-02, CACHE-03, CACHE-04
**Success Criteria** (what must be TRUE):

  1. A "ready for offline" indicator shows as incomplete (with a "finish setup on WiFi" state) while caching is in progress, and as ready only once app shell + `occurrences.db` + all GeoJSON are cached
  2. During the ~23 MB initial prime, a determinate progress indicator (showing files or MB) updates as the SW caches each asset (via SW→page `postMessage`), not just an indeterminate spinner
  3. After priming, the device storage size ("X MB stored on this device") is shown using `navigator.storage.estimate()`
  4. A "Data as of `<date>`" label is always visible; the date reflects the pipeline `generated_at` from `manifest.json`; it updates only when a newer DB is fetched, not on page refresh
  5. When a new SW is waiting, a non-blocking prompt ("A data update is available — tap to reload") appears; dismissing it leaves the old version running; tapping it reloads to the new version

**Plans**: 4 plans (3 waves)
Plans:
**Wave 1**

- [x] 150-01-PLAN.md — SW source change + build-output gate move together: NetworkFirst route for /data/manifest.json + SKIP_WAITING-gated message listener in src/sw.ts; replace existing skipWaiting-absent assertion with gated form + add NetworkFirst + workbox-window-dep assertions; move workbox-window to runtime dependencies [CACHE-02; D-08, D-13, D-16]

**Wave 2** *(parallel — no file overlap)*

- [x] 150-02-PLAN.md — Migrate src/sw-registration.ts to workbox-window.Workbox; emit `sw-update-available` CustomEvent on the `waiting` lifecycle event; stash `window.__wb` for the banner tap-handler; preserve the 149 D-12 requestPersistentStorage block verbatim; new src/tests/sw-update.test.ts pins the contract [CACHE-02; D-13]
- [x] 150-03-PLAN.md — src/manifest.ts gains parseGeneratedAt + formatFreshness + loadFreshnessLabel + promotes loadManifest to exported; new src/prime-orchestrator.ts owns the byte-progress fetch loop + caches.match ready probe + online re-prime + localStorage persistence; src/app-entry.ts reduced to 3 side-effect imports; src/tests/cache-probe.test.ts retired in favor of src/tests/prime-orchestrator.test.ts + src/tests/freshness.test.ts (Wave 0) [CACHE-02, CACHE-04; D-02, D-04, D-06, D-09, D-12]

**Wave 3** *(depends on Wave 2)*

- [x] 150-04-PLAN.md — <bee-atlas> gains 5 new @state fields, 4 new window listeners, the bottom non-modal update-banner render, and a freshness-refresh wire (online + focus); <bee-header> gains 5 new @property fields + ready-pill (3 states per UI-SPEC) + freshness sub-line + cache-popover (storage estimate, freshness, passive update affordance); cache-update-acted event routes the popover affordance through the same `_onBannerTap` path; new src/tests/cache-state.test.ts pins the contract (Wave 0) [CACHE-01, CACHE-02, CACHE-03, CACHE-04; D-05, D-09, D-14, D-15, D-17, D-18, D-19, D-20]

**UI hint**: yes

### Phase 151: PWA Manifest & Installability

**Goal**: The `/app` route is installable as a PWA on Android (Chrome `beforeinstallprompt`) and iOS (static "Add to Home Screen" instructions); the installed app opens offline in standalone mode and renders the map from cache.
**Depends on**: Phase 149 (offline cold-start must work before installability is meaningful), Phase 150 (freshness/ready badge)
**Requirements**: PWA-01, PWA-02, PWA-03
**Success Criteria** (what must be TRUE):

  1. `/app/manifest.webmanifest` declares `name`, `start_url: /app/index.html` (NOT `/app/` — S3+CloudFront OAC returns 403 for trailing-slash paths, so the installed PWA must launch the explicit index.html key; see Phase 147 + memory `cloudfront-subdir-403-no-index-rewrite`), `display: standalone`, `background_color`, `theme_color`, and 192px / 512px / maskable icons; Chrome DevTools → Application → Manifest shows no validation errors
  2. On Android/Chrome, an in-app "Install" affordance (captured `beforeinstallprompt`, not a blocking modal) appears and installs the app to the home screen
  3. On iOS Safari (where `beforeinstallprompt` is unavailable), the `/app` page shows static "Add to Home Screen" instructions; the instructions are hidden when already running standalone (`navigator.standalone === true`)
  4. Launching the installed app with no network connection opens in standalone mode and renders the map + table fully from cache (offline cold-start confirmed on a real device)

**Plans**: TBD
**UI hint**: yes

**Phase note — research flag:** iOS standalone-mode geolocation permission behavior differs from Safari tab; requires real-device verification (not simulable). Plan Phase 152 implementation-time verification on a physical iOS device.

### Phase 152: GeolocateControl + Location State

**Goal**: A Mapbox `GeolocateControl` shows a blue dot + accuracy ring + recenter button; GPS works offline; location state is owned by `<bee-atlas>` per the state-owner/pure-presenter invariant; denied permission is handled gracefully.
**Depends on**: Phase 147 (the `/app` route must exist; GeolocateControl requires a Map instance in `<bee-map>._initMap()`)
**Requirements**: LOC-01, LOC-02, LOC-03
**Success Criteria** (what must be TRUE):

  1. A blue dot and accuracy ring appear on the map when the user allows location access; a recenter button returns the viewport to the user's position
  2. GPS positioning works with DevTools "offline" active (no network required for GPS fix)
  3. `<bee-atlas>` owns `@state _userLocation`; `<bee-map>` hosts the `GeolocateControl` and relays position upward via a `composed: true` `user-location-changed` CustomEvent — confirmed by a source-analysis test asserting `<bee-map>` emits (not stores) the location
  4. Denying or revoking location permission shows a disabled/error state on the control with a brief explanation; the rest of the app (map, filters, table) is unaffected

**Plans**: TBD
**UI hint**: yes

**Phase note — research flag:** Verify geolocation permission prompt fires correctly in iOS standalone mode on a real device before finalizing the implementation. Permission prompt behavior differs between a Safari tab and a home-screen standalone launch.

### Phase 153: Occurrences Near Me

**Goal**: A geolocate-icon button inside the "County, ecoregion, or place" input resolves the user's GPS into a ~10 km bounding box and applies it as a selection-bounds filter, REUSING the existing shift-drag rectangle-selection mechanism end-to-end (`_selectionBounds` → `filter.ts` `boundsClause` → `SelectionState{type:'bounds'}` `sel=west,south,east,north` URL round-trip). The bounds are explicit and round-trip in the URL, so a shared link reproduces the exact same occurrences for any recipient with no GPS. Redesigned 2026-06-21 from the reverted haversine/`?near=1` form (commit a4e269cb); the old SC-3 (<200 ms haversine timing log) is obsolete — performance is that of the existing fast bounds query.
**Depends on**: Phase 152 (GeolocateControl + `_userLocation` state on `<bee-atlas>`)
**Requirements**: NEAR-01, NEAR-02, NEAR-03
**Success Criteria** (what must be TRUE):

  1. A geolocate-icon button right-aligned inside the where input resolves the user's GPS into a ±10 km bounding box (`dLat=10/111.32`, `dLon=10/(111.32·cos(lat))`) and assigns it to `_selectionBounds`; the map + list/table filter to that box and an icon-only removable chip appears in the where input (NEAR-01)
  2. Near-me reuses the EXISTING selection-bounds query path (`boundsClause`) — no separate proximity query, no haversine; a near-me box is indistinguishable from a shift-drag box and AND-composes with taxon/date/region filters (NEAR-01, NEAR-02)
  3. The bounds round-trip in the URL via the existing selection-bounds serialization (`sel=west,south,east,north`); a shared link reproduces the exact occurrence set with no recipient GPS and no geolocation re-trigger on restore; the chip ✕ / "Clear filters" clears the bounds (NEAR-03)
  4. On denied/unavailable location, the Phase 152 toast appears (fixed — it failed in the 152 UAT) and no bounds are applied (NEAR-03)

**Plans**: 4 plans (3 waves)

Plans:
**Wave 1** *(parallel — no shared files)*

- [x] 153-01-PLAN.md — `<bee-map>` public `requestUserLocation()` seam (promote GeolocateControl to an instance field) + geolocation source gate [NEAR-01/02/03; D-06]
- [x] 153-02-PLAN.md — `<bee-pane>` geolocate button (emits `near-me-requested`) + icon-only removable bounds chip (emits `near-me-cleared`) + `selectionBoundsActive` property + render tests [NEAR-01/02/03; D-04, D-05]

**Wave 2** *(blocked on Wave 1)*

- [x] 153-03-PLAN.md — `<bee-atlas>` integration — `boundsFromLocation` ±10 km box, shared `_applyBoundsSelection` (near-me ≡ shift-drag state + `sel=` URL), event handlers, `selectionBoundsActive` binding, denial-toast fix + tests [NEAR-01/02/03; D-01, D-02, D-03, D-07, D-08, D-09]

**Wave 3** *(blocked on Wave 2)*

- [x] 153-04-PLAN.md — `153-HUMAN-UAT.md` (desktop DevTools-Sensors scenarios + shared-URL reproducibility check + real-device confirmation) + blocking human-verify checkpoint (autonomous: false / auto_advance: false) [NEAR-01/02/03; D-03, D-05, D-08, D-09]

**UI hint**: yes

### Phase 154: Mapbox Basemap Performance Cache (ToS-compliant)

> **Re-scoped 2026-06-21.** Original scope (flag-gated *offline* tile cache) was
> dropped after a ToS review found offline basemap serving is **not licensed for
> the Mapbox web SDK** (Product Terms 2026-06-17 §1.9 + §2.8.1; offline is a
> Mobile-SDK-only right). Now a ship-enabled, compliant *performance* cache. See
> `.planning/phases/154-mapbox-tile-caching-tos-gated/154-CONTEXT.md`.

**Goal**: The SW runtime-caches Mapbox basemap requests (tiles, style, sprites,
glyphs) with a **StaleWhileRevalidate** strategy to speed up warm/repeat map
loads while online — a §2.8.1-compliant on-device performance cache populated
live from the Mapping APIs, shipped **enabled** (no feature flag). It does **not**
provide offline basemap serving (Phase 149's graceful degradation still covers
offline).
**Depends on**: Phase 149 (SW runtime caching infrastructure must exist)
**Requirements**: TILE-01, TILE-02
**Success Criteria** (what must be TRUE):

  1. `src/sw.ts` registers a `StaleWhileRevalidate` route (dedicated `cacheName`, e.g. `mapbox-basemap`) for Mapbox basemap GET requests, active by default with no feature flag
  2. The `access_token` is **retained** in the request/cache key (not stripped — ToS §1.1/§2.9.4); `events.mapbox.com` telemetry is **not** intercepted
  3. Only HTTP 200 responses are cached; `ExpirationPlugin` bounds growth with `maxEntries` + a TTL **≤ 30 days** (legal ceiling) and `purgeOnQuotaError: true`
  4. Mapbox GL JS default attribution (logo + © Mapbox + © OpenStreetMap + Improve this map) remains visible — not suppressed when serving from cache (ToS §1.4, no offline exception)
  5. An ADR (`docs/adr/`) records the ToS analysis, the verdict (web offline not licensed), and the compliance checklist this design satisfies; a one-line pointer is added to CLAUDE.md "Known State"

**Phase note — maxEntries research flag:** Before finalizing `maxEntries`, inspect Mapbox basemap responses in DevTools Network. GL JS fetches tiles with CORS (non-opaque → normal-sized entries) — confirm; if any response is opaque (`no-cors`), each entry costs ~7 MB in Chrome's Storage Quota accounting and `maxEntries` must be very conservative.

**Plans**: 1 plan (1 wave — single autonomous plan; sw.ts + ADR + CLAUDE.md + build-output test)Plans:

- [x] 154-01-PLAN.md — SWR `mapbox-basemap` route + ToS ADR + CLAUDE.md pointer + build-output assertions [TILE-01, TILE-02]

---

### Phase 157: Regions dropdown obscured by filter button

**Goal**: The map "Regions" dropdown menu renders fully visible and clickable, no
longer obscured by the filter pane / filter button. Root cause is a
cross-component stacking-context interaction: the region control lives inside
`<bee-map>`, which is `z-index: 0` within `.content` (so it forms a stacking
context capped below its siblings); `<bee-pane>` is `position: absolute; z-index: 1`
anchored at `right: 0.5em; top: calc(0.5em + 2.5rem)` — directly below the
`right: 0.5em` region button. When the region menu opens downward it expands into
the pane's territory and is painted beneath it. Raising the menu's *local*
z-index inside `<bee-map>` cannot fix this — the whole map subtree is below
`<bee-pane>`. Repro and fix at the right layer.
**Depends on**: none (isolated UI fix; must not regress the Phase 152 fix that
made the region control render visibly, nor the Phase 999.8/156 bounds+selection
coexistence)
**Requirements**: none (v5.1 housekeeping — no REQUIREMENTS.md for this milestone)
**Success Criteria** (what must be TRUE):

  1. Opening the Regions dropdown shows all four options (Off / Counties /
     Ecoregions / Places) fully visible and clickable — not clipped or covered by
     the filter button or pane — in both the wide (side pane) and narrow
     (`max-aspect-ratio: 1`, bottom pane) layouts

  2. The fix addresses the cross-component stacking context (the `<bee-map>`
     `z-index: 0` vs `<bee-pane>` `z-index: 1` relationship), not just a local
     z-index bump inside `<bee-map>` that the bug analysis shows cannot work

  3. The architecture invariants hold: `<bee-map>` and `<bee-pane>` stay pure
     presenters with state owned by `<bee-atlas>`; no shared module-level mutable
     state is introduced

  4. A regression test (source-analysis assertion and/or render test) locks in the
     chosen stacking mechanism so the obscuring cannot silently return

**Plans**: 2 plans (2 waves)

Plans:
**Wave 1**

- [x] 157-01-PLAN.md — relocate region control from `<bee-map>` into `<bee-atlas>` (markup + CSS + `_regionMenuOpen` + outside-click), route selection via shared `_applyBoundaryMode`, RETAIN `bee-map { z-index: 0 }`, lay collapsed filter button beside the regions button; STACK-01 source-analysis tests [SC-1, SC-2, SC-3, SC-4]

**Wave 2** *(blocked on Wave 1)*

- [x] 157-02-PLAN.md — `157-HUMAN-UAT.md` (3 pane states × 2 layouts + attribution-not-bleeding regression check) + blocking human-verify checkpoint (autonomous: false / auto_advance: false) [SC-1, SC-2, SC-4]

**UI hint**: yes

### Phase 160: Overlap-capable place model (many-to-many membership)

**Goal**: Let a bee occurrence belong to *more than one* place. Today the place
model is a forced partition: `marts/occurrences.sql` assigns a single
`place_slug` via `ST_Within` + `DISTINCT ON` (no `ORDER BY` → non-deterministic
when a point falls in two polygons), and `places_validation.py` rejects
partially-overlapping place polygons (`ST_Overlaps`) so that ambiguity never
surfaces. This one-place-per-occurrence rule is an implementation artifact of
the scalar column, NOT a domain requirement — real land management nests and
overlaps (a wildlife area enclosing a state park; an easement over other
ownership), and the guard is already incoherent (it blocks partial overlap but
lets full containment through to the same arbitrary assignment). Make place
membership many-to-many so a point keeps every place it falls within.
**Depends on**: v3.7 place data model.
**Requirements**: none (v5.2 — no REQUIREMENTS.md for this milestone)
**Success Criteria** (what must be TRUE):

  1. A new `occurrence_places` bridge mart holds one row per (occurrence, place)
     membership, sourced from the `ST_Within` join (no `DISTINCT ON` collapse),
     keyed on a synthetic `occ_id` matching the frontend's `occIdFromRow`
     priority. The scalar `place_slug` is DROPPED from the occurrences mart (dbt
     contract 37 → 36 cols — the "33" in older notes was already stale), the
     bridge has its own 2-col contract, and `bash data/dbt/run.sh build` passes.

  2. `places_validation.py` no longer rejects overlapping place polygons; WKT
     validity, WGS84-bounds, slug, and permit checks are retained. Overlapping
     places load cleanly.

  3. Per-place counts (`places_export.py` → `places.json`) and per-place maps
     (`places_maps.py`) JOIN the bridge, so an occurrence counts toward / maps
     in every place it belongs to (D-05 double-count).

  4. The frontend place filter (`bee-atlas.ts` / `filter.ts`) matches on
     membership via an `EXISTS` subquery against the `occurrence_places` table
     in `occurrences.db` (a point in place X is found whether or not it's also
     in Y); single-place selection behavior is preserved. The sidebar
     occurrence detail lists ALL member place names (D-04).

  5. The change is covered: a point in the overlap of two places resolves to
     BOTH place slugs (two bridge rows), deterministically, and selecting
     either place finds it.

**Plans**: 4 plans (4 waves — sequential; the dbt build is the gate between pipeline and frontend)

Plans:

- [x] 160-01-PLAN.md — Wave 0: failing tests/fixtures — bridge-membership DuckDB test (`test_occurrence_places.py`), inverted overlap-acceptance test, double-count export fixtures, frontend EXISTS-clause assertions [SC-2, SC-3, SC-5]
- [x] 160-02-PLAN.md — Wave 1 (pipeline / dbt-green gate): `occurrence_places` bridge mart (Option B `occ_id`), drop `place_slug` from occurrences (contract 37→36 cols) + new bridge contract, remove `ST_Overlaps` guard, copy bridge parquet through `run.py`, ship as indexed `occurrences.db` table, fix both JS table whitelists [SC-1, SC-2, SC-5]
- [x] 160-03-PLAN.md — Wave 2 (exports): `places_export._query_counts` + `places_maps` recomputed via the bridge JOIN; an occurrence counts toward / maps in every place it belongs to (D-05) [SC-3]
- [x] 160-04-PLAN.md — Wave 3 (frontend): `filter.ts` membership `EXISTS` rewrite + remove `place_slug` from row type/projection; D-04 occurrence-detail member-place list (state-owner-resolved names) [SC-4, D-04]

### Phase 161: Add WDFW wildlife areas as places

**Goal**: Add the 33 web-listed Washington Department of Fish & Wildlife (WDFW)
wildlife areas to `content/places.toml` as new `[[places]]` entries — one entry
per wildlife area, `geometry_wkt` a MultiPolygon dissolving all of that area's
non-contiguous units — so occurrences inside them are tagged, filterable, and
mapped. Source verified (161-RESEARCH.md): the WDFW ArcGIS REST WildlifeAreas
layer returns EPSG:4326 GeoJSON; DuckDB-spatial dissolves units → one
MultiPolygon WKT per area with zero new dependencies, via a committed
`data/add_wdfw_wildlife_areas.py` curation script. Decisions in 161-CONTEXT.md
(scope = 33 web-listed, one-entry-per-area, full-fidelity-then-simplify-by-weight).
**Depends on**: **Phase 160** (overlap-capable model — the 16 measured
WDFW↔existing overlaps load cleanly only after the partition is removed); v3.7
place data model. Independent of Phase 162.
**Requirements**: none (v5.2 — no REQUIREMENTS.md for this milestone)
**Success Criteria** (what must be TRUE):

  1. The 33 web-listed WDFW wildlife areas appear as `[[places]]` entries in
     `content/places.toml`, each with `land_owner = "Washington Department of
     Fish & Wildlife"`, an immutable `[a-z0-9-]` slug, and a valid WGS84
     MultiPolygon `geometry_wkt` covering all of that area's units

  2. The full `data/run.py` pipeline (places-validation → places-load →
     dbt-build → places-export → places-maps) completes green with the new
     entries, including the 16 areas that overlap existing places (now legal
     post-Phase-160)

  3. The browser-shipped `public/data/places.geojson` weight delta is measured;
     geometry is simplified to a recorded tolerance so the total stays within
     the threshold agreed during planning (full fidelity ≈ +3 MB is too heavy)

  4. Occurrences whose point falls inside a WDFW area acquire that area's slug
     in `place_slugs` (alongside any overlapping existing place), and the area
     is selectable as a place filter on the map

**Plans**: 2 (planned 2026-06-23)

  - 161-01 — curation script `data/add_wdfw_wildlife_areas.py`: WDFW ArcGIS
    fetch → DuckDB dissolve-by-area + simplify → 33 MultiPolygon `[[places]]`
    blocks (Jackman Creek excluded) + golden-fixture test

  - 161-02 — run script to append 33 entries; ratify D-05 tolerance vs ≤~1 MB
    budget; full `run.py` green + size report

### Phase 162: Add specific hikes as places

**Goal**: Add a hand-curated proof-of-concept set of 14 named WTA hikes as
ordinary `[[places]]` entries. Each linear trail centerline is represented as a
~250 m corridor buffer (so `ST_Within` can tag along-trail occurrences), sourced
from OpenStreetMap via Overpass (WTA ToS prohibits scraping), buffered in a metric
CRS (UTM 10N, `always_xy=true`) and simplified for browser weight. No `place_type`
schema change (D-03); the Phase-160 many-to-many model means a trail corridor
overlapping its parent place tags to both. The only new code is a committed,
list-driven curation script `data/add_hikes_as_places.py`.
**Depends on**: v3.7 place data model; benefits from Phase 160 (a hike corridor
will overlap its parent place). Independent of Phase 161.
**Requirements**: none (v5.2 — no REQUIREMENTS.md for this milestone)
**Success Criteria** (what must be TRUE):

  1. Named hikes can be represented as places and surfaced on the map and in
     the filter, with a geometry representation that lets occurrences along the
     hike be associated with it (corridor buffer or equivalent — not a bare
     LineString that `ST_Within` can never match)

**Plans**: 2 (planned 2026-06-23)

  - 162-01 — curation script `data/add_hikes_as_places.py`: OSM/Overpass (+ GPX
    fallback) trail geometry → DuckDB ~250 m metric-buffer corridor (`always_xy=true`)
    → 14 MULTIPOLYGON `[[places]]` blocks (2 OSM gaps tracked-not-dropped) +
    golden-fixture buffer/slug test

  - 162-02 — run the script + resolve the 2 OSM-gap hikes (checkpoint) + append the
    hike corridors to `content/places.toml`, ratify the simplification tolerance vs.
    the ≤~1 MB `places.geojson` budget, and confirm the full pipeline runs green
    (trail↔area overlaps load as multi-place membership; ST_Within + bridge assign
    hike slugs; weight reported)

---

## Progress

| Phase | Milestone | Plans Complete | Status | Completed |
|-------|-----------|----------------|--------|-----------|
| 147. `/app` Route + SW Topology | v5.0 | 2/2 | Complete    | 2026-06-11 |
| 148. App Shell Precache + vite-plugin-pwa | v5.0 | 1/1 | Complete    | 2026-06-14 |
| 149. `/data/` Runtime Caching + Cold-Start | v5.0 | 3/3 | Complete   | 2026-06-18 |
| 150. Cache Health & Freshness UX | v5.0 | 4/4 | Complete   | 2026-06-19 |
| 151. PWA Manifest & Installability | v5.0 | 4/4 | Complete   | 2026-06-20 |
| 152. GeolocateControl + Location State | v5.0 | 3/3 | Complete   | 2026-06-21 |
| 153. Occurrences Near Me | v5.0 | 4/4 | Complete   | 2026-06-21 |
| 154. Mapbox Basemap Performance Cache | v5.0 | 1/1 | Complete    | 2026-06-21 |

## Backlog

### Phase 999.11: Add federal wilderness areas as regions (BACKLOG)

**Goal:** [Captured for future planning]
**Requirements:** TBD
**Plans:** 0 plans

Captured 2026-06-23. A new place/region source in the same family as Phase 161
(WDFW wildlife areas) and Phase 162 (hikes): add federally designated
**wilderness areas** (National Wilderness Preservation System) as `[[places]]`
entries so occurrences inside them are tagged, filterable, and surfaced as
"Regions" on the map. Polygon boundaries (no linear-geometry problem like hikes),
so the established curation pattern applies directly — mirror
`data/add_wdfw_wildlife_areas.py`: fetch authoritative boundaries → DuckDB
dissolve/validate → simplify for browser weight → emit TOML. Benefits from Phase
160 (many-to-many): a wilderness area overlaps its managing agency's land and
often a national forest/park, so multi-place membership is expected. Open
questions for discuss/plan: authoritative source (Wilderness.net / NWPS GIS,
USGS PAD-US, or per-agency layers), scope (WA-only to match current coverage, or
broader per [[project_multi_state_expansion]]), `land_owner` attribution
(managing agency — USFS/NPS/BLM/USFWS varies per wilderness), and weight impact
on `places.geojson` (already ~898 KB after 161+162 vs the ~1 MB guard — may force
a tighter simplification tolerance or a budget rethink).

Plans:

- [ ] TBD (promote with /gsd-review-backlog when ready)

### Phase 999.7: Handle Safari private-browsing in the offline-ready UI (BACKLOG)

**Goal:** [Captured for future planning]
**Requirements:** TBD
**Plans:** 0 plans

Surfaced during Phase 150 UAT (2026-06-19): in Safari private browsing, `caches.put()` is a silent no-op, so the Phase 150 prime orchestrator streams 29 MB through the SW but the `data-artifacts` cache stays empty. The post-prime cache probe finds all 4 URLs MISS and the ready-pill caps at 99% forever, showing "Caching…" indefinitely. Functionally the app still works (the page can hold the manifest + DB in memory for the session), but the affordance lies. Options to evaluate: detect via a probe entry round-trip (write/read/delete) or via `navigator.storage.estimate()` returning quota 0; on detection, suppress the prime bar and show a quiet pill like "Offline mode unavailable in private browsing" or hide the chrome entirely. Open questions: does private browsing always report quota 0 (cross-browser), should the table/queries still work in-memory, and is this worth shipping vs leaving as a known limitation.

Plans:

- [ ] TBD (promote with /gsd-review-backlog when ready)

### Phase 167: Collector Identity Column

**Goal**: Every occurrence row carries a unified `collector_inat_login` COALESCE column, unblocking all per-collector queries downstream
**Depends on**: Phase 165 (waba_specimen arm defines the COALESCE priority order)
**Requirements**: IDENT-01
**Success Criteria** (what must be TRUE):
  1. `occurrences.parquet` and `occurrences.db` carry a `collector_inat_login VARCHAR` column (dbt contract 36→37) resolving via `COALESCE(specimen_inat_login, host_inat_login, user_login)`
  2. WABA collector occurrences — Ecdysis specimens, WABA samples, and waba_specimen rows — all resolve to the correct iNat login without NULL
  3. The data-before-code S3 release sequence completes: nightly runs with `SKIP_INTEGRATION_GATE=1`, the new column is live in S3 before any TypeScript that reads it ships
  4. No identity-reconciliation seed is required (WABA collectors always carry an iNat handle, appearing in iNaturalist before Ecdysis); a build-time assertion validates that WABA specimen/sample rows resolve to a non-NULL `collector_inat_login`
**Plans**: TBD

### Phase 168: Temporal Lifecycle Dates

**Goal**: Each occurrence carries its intrinsic lifecycle dates (collection, posting, identification) readable from the mart, and the waba_specimen→ecdysis transition reads as a single specimen's timeline rather than a phantom delete+create
**Depends on**: Phase 167 (collector identity column; same data layer)
**Requirements**: TEMP-01, TEMP-02
**Success Criteria** (what must be TRUE):
  1. `occurrences.db` carries `collection_date`, `posted_date` (iNat `created_at`), and `id_date` (best-available identification date) columns; dbt contract bump ships data-before-code with its own isolated S3 release
  2. A `waba_specimen` row linked to a subsequent Ecdysis record (via `specimen_observation_id`) carries both its iNat `posted_date` and the Ecdysis `collection_date` — the transition does not produce a phantom delete+create in the event timeline
  3. Lifecycle dates are read from intrinsic source fields (no snapshot-diffing), so no first-run baseline is needed; rows with partial/missing dates (e.g. Ecdysis `date_identified` year-only or `s.d.`) are handled explicitly rather than dropped
  4. Lifecycle dates for Ecdysis specimens, waba_specimen rows, iNat expert obs, WABA samples, and checklist records are each populated from the correct source field (no cross-ARM NULL gaps for available fields)
**Plans**: TBD

### Phase 169: Per-Collector Static Pages

**Goal**: Every active WABA collector has a bookmarkable, public page at `/collectors/{inat_login}/` with headline stats, a status split, and a map deep-link
**Depends on**: Phase 167 (collector_inat_login in the mart)
**Requirements**: PAGE-01, PAGE-02, PAGE-03, PAGE-04
**Success Criteria** (what must be TRUE):
  1. Visiting `/collectors/{inat_login}/` renders a static page for every collector with a non-NULL `collector_inat_login`; the page URL is stable and bookmarkable with no auth
  2. The page shows headline contribution stats: specimen count, sample count, species count
  3. The page shows a pending-vs-identified status split ("N identified, N awaiting ID") derived from lifecycle date availability
  4. The page links to the main map filtered to that collector (`/?collector={login}` or equivalent), and the map filter applies correctly
  5. Pages are generated only where `collector_inat_login IS NOT NULL` (checklist-only contributors without iNat handles are excluded); a build-time page-count assertion fails the build if count is below expected floor
**Plans**: TBD
**UI hint**: yes

### Phase 170: Source → Provenance Facets Rebuild

**Goal**: The `source` enum is replaced by orthogonal provenance-tier facets across all three coupled consumers, with `tier=` URL round-trip and `src=` back-compat, and the occ_id positional coupling is preserved and asserted
**Depends on**: Phase 165 (waba_specimen arm defines all five source categories); Phase 167 (collector facet now meaningful in the model)
**Requirements**: PROV-01, PROV-02, PROV-03
**Success Criteria** (what must be TRUE):
  1. The map filter, map symbology (`style.ts`), and occurrence detail card (`bee-occurrence-detail.ts`) are all driven by provenance tier, not the raw `source` string — the three consumers ship as one atomic commit
  2. `FilterState` carries `hiddenProvenanceTiers` replacing `hiddenSources`; `tier=` URL param round-trips correctly; `src=` legacy param parses and maps to the new tier vocabulary (back-compat)
  3. A Vitest assertion compares the occ_id CASE branch priority order between `src/occurrence.ts` (`occIdFromRow`) and `src/filter.ts` (`OCC_ID_SQL_CASE`) — the positional coupling is explicit and tested; the `data/dbt/models/marts/occurrence_places.sql` CASE is cross-checked in the same commit
  4. `tsc --noEmit` is green after the facets commit; all place-filter queries return correct results for each source arm (no silent zero-result regressions)
**Plans**: TBD

### Phase 171: Per-Collector Event Stream

**Goal**: The collector page shows a reverse-chronological collection→identification event feed, including the waba_specimen→ecdysis cataloguing event, with pagination for high-volume collectors
**Depends on**: Phase 168 (lifecycle dates in mart); Phase 170 (provenance-tier rendering for the feed)
**Requirements**: STREAM-01, STREAM-02, STREAM-03
**Success Criteria** (what must be TRUE):
  1. The collector page shows a reverse-chronological feed of events (collection, posting, identification) keyed on lifecycle dates from the mart — the feed is readable on any device from the same bookmarked URL
  2. A waba_specimen row that gains an Ecdysis cataloguing link (via `specimen_observation_id`) appears as a "specimen catalogued in Ecdysis" event in the feed, not as a deletion + creation
  3. Collectors with more than ~500 occurrence records see the feed paginated or bounded (no unbounded DOM or query); the bound is documented and the collector-page load time stays reasonable
  4. The feed renders correctly when lifecycle dates are partially absent (e.g. identification date NULL for unidentified specimens — the event still appears as "collected, awaiting ID")
**Plans**: TBD
**UI hint**: yes

### Phase 172: Accomplishment View

**Goal**: The collector page shows a county coverage map, taxonomic-breadth list, ecoregion breadth, and active-seasons badge — all pre-aggregated in the pipeline, not computed in the browser
**Depends on**: Phase 169 (per-collector static page shell); Phase 171 (event stream establishes the full collector page)
**Requirements**: ACCOM-01, ACCOM-02, ACCOM-03, ACCOM-04
**Success Criteria** (what must be TRUE):
  1. The collector page includes a county coverage SVG map (reusing the taxon/place SVG pattern from `data/svg_map.py`) showing counties where the collector has contributed occurrences
  2. The page shows a taxonomic-breadth list of contributed species, each linked to its taxon page
  3. The page shows ecoregion breadth (the distinct ecoregions the collector has contributed to)
  4. The page shows an "Active since YYYY (N seasons)" badge derived from the `collection_date` column range — no streak tracking, no leaderboard elements
  5. All aggregations are pre-computed in the pipeline (`collectors.json`) and rendered statically; no wa-sqlite GROUP BY query runs in the browser on the collector page
**Plans**: TBD
**UI hint**: yes
