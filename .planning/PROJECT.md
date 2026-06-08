# Washington Bee Atlas

## Milestone: v4.8 Fast, Honest Test Suite — COMPLETE (2026-06-08)

**Shipped:** The `data/` pytest suite went from >40 min, partly-red, and silently-skipping to a green, randomized-order-stable fast tier under 5 minutes. A registered `integration` marker with `addopts` default-deselection splits a fast default tier (`uv run pytest`) from an opt-in slow tier; `BASELINE.md` anchors the before/after and an honest ~19-failure red inventory. The dominant cost — per-test reparse of the 50,646-row `checklist_records_full.csv` — was removed by distilling small committed checklist + taxonomy-ancestry fixtures (replacing full-file parsing and the 39 MB `taxa.csv.gz`) and building the checklist DuckDB once via a module-scoped fixture. Built-asset-dependent tests now run against committed fixtures on a clean checkout instead of `skipif`-skipping; additive DDL stubs greened all 19 `test_resolve_taxon_ids.py` tests; the 16 `test_dbt_diff` tests are loudly deselected, never silently skipped. pytest-randomly proved the fast suite green (197 passed / 9 skipped / 18.8s) and surfaced three order-dependence bugs (fixed). The `@integration` hard gate is wired into `nightly.sh` (exits non-zero before S3 publish, with a pre-pulled published-artifact regression baseline for `test_dbt_diff`), and an independent `python-tests.yml` GitHub Actions job runs the fast suite (uv + Python 3.14) on push/PR enforcing the < 5 min budget. 17/17 requirements complete.

**Notable:** the milestone's whole premise was honesty — "green ≠ covered." Tests already mocked all network (iNat/GBIF), so the fast tier needs no AWS/S3; dbt is not invoked by pytest (its 33-col contract is enforced separately at `bash data/dbt/run.sh build`). Genuine full-data checks (50,646-row count, full `taxa.csv.gz` LCA, sandbox-vs-public parquet diff) were routed into the opt-in slow tier, exercised nightly on maderas and gated in CI.

## Current Milestone: v4.7 Checklist Records as Point Data — RESUMED (2026-06-08)

**Resumed** after v4.8 shipped (the slow/red test suite that prompted the pause is now fixed). State: Phase 134 complete; Phase 135 (name-reconciliation) at **4 of 5 plans done** — plans 135-01..04 shipped (resolver LCA core, GBIF refresh + fuzzy tier, `canonical_name` + reconcile retirement, dbt synonym subsystem); **135-05 is the only remaining plan** (wires the resolver into `run.py` as a no-op nightly step + build gate, runs the one-time `--refresh-checklist` GBIF lookup, then pauses at the curator HUMAN-REVIEW GATE before Phase 136). Phases 136–138 are not yet planned. Requirements restored to `.planning/REQUIREMENTS.md`. v4.7 reserved phases 134–138.

**Goal:** Re-import the original 50,646-row Bartholomew et al. 2024 checklist CSV — recovering the coordinates, full dates, collector, and locality that Phases 76/112 discarded — so checklist records render as real map points (a true 4th occurrence source) with proper reconciliation to current taxonomy.

**Target features:**
- Re-extract the full-fidelity source (lat/lon, date, `recordedBy`, locality) into the pipeline, replacing the 4-column `wa_bee_checklist_records.tsv` derivation.
- Promote checklist records into `occurrences.parquet` as a `source='checklist'` peer — sharing clustering, `taxon_id` filtering, the source-selection toggle, sidebar list, and CSV export. **Reverses the Phase 111 locked decision**, whose stated rationale ("checklist entries lack GPS coordinates") is factually void.
- Render coord-bearing records as points; **drop the ~9% (4,595) with no coordinates** from the point layer.
- Cross-source dedup/provenance strategy against Ecdysis specimen records — both are museum specimen data, so double-plotting the same physical bee is the primary risk of promotion.
- Multi-class name reconciliation (authority-strip, whitespace, synonym, gender-agreement, misspelling) with ITIS as a build-time external adjudicator; iNat stays the `taxon_id` source via an accepted-name→taxon_id bridge.
- Normalize mixed/missing dates (ISO + m/d/yyyy, ~13% null, range to 1812) and handle 5,184 internal-duplicate groups.

**Key context:** Static hosting — ITIS/GBIF consulted at pipeline build time, baked into parquet, never at runtime. The existing county-fill presence layer and `checklist.parquet` mart remain the fallback for presence display; this milestone adds the point representation. v4.4 already resolved `texanus→subtilior` in the dbt staging arm, so synonym unification is partly done (the `checklist_unmatched.csv` reconcile path lags the dbt one).

## Milestone: v4.6 Taxonomy Hierarchy & Normalization — COMPLETE (2026-06-04)

**Shipped:** A `taxon_id`-keyed taxon hierarchy (materialized `lineage_path`) built into `occurrences.db` via a two-pass bee + bycatch load with a zero-orphan assertion (Apidae descendant query 2.0 ms, far under the 50 ms gate); map filtering cut over to `taxon_id` + descendant-by-any-rank matching with an 8-rank autocomplete and integer `?taxon=` URLs (legacy-name back-compat); the occurrences mart dropped its 4 denormalized rank-string columns (dbt contract 37→33, `canonical_name` retained) with a 7-field `geo_blob` rewrite (−14.2% DB size) and a query-time `display_name` taxa JOIN; species/genus pages rebuilt off the `higher_taxa` rollup with 12 new `/species/subfamily/{Name}/` pages (plus tribe/subgenus) and a slug-collision hard-fail; and the flat `/species` index replaced by an expandable bee-only `<details>` taxonomy tree (default family→genus→species, "Show all ranks" toggle, type-to-filter with ancestor auto-expand, per-node count splits, page + filtered-map links). 20/20 requirements complete; audit passed.

**Notable:** Phase 133 needed a code-review-driven gap closure — the reviewer caught a default tree view broken by `display:none` burying nested ranks (and source-grep tests that passed while the feature was broken); fixed with a `display:contents` rank-skip + executable happy-dom tests + three operator re-verify rounds. Post-audit the operator added taxon-page→map links, removed two orphaned modules (`spa-link.ts`, the `species.js` flat-tree export), and recorded Phase 133 Nyquist validation. Reusability held: the hierarchy is `taxon_id`-keyed and bee-agnostic (bee-only is a presentation filter, not baked into the data).

## Milestone: v4.5 iNat Taxonomy & Species Completeness — COMPLETE (2026-06-01)

**Shipped:** A non-null `taxon_id INTEGER` surfaced through the dbt marts (species.parquet 0-null; occurrences.parquet 37-col contract) behind a pre-build resolution gate; 65 off-checklist species made visible (231 new occurrence SVGs + static pages); "View on iNaturalist →" links on species/genus/subgenus/tribe pages; a dormant inactive-taxon auto-remap safety net (`auto_synonyms` + hard-fail gate, manual entries win); and a genus-rank occurrence taxon_id backfill that drove `occurrences.parquet` NULL taxon_id **34,354 → 21,680**. 13/13 requirements complete.

**Mid-milestone scope decision:** TID-02 ("non-null taxon_id for *every* occurrence row") proved literally impossible — ~21k Ecdysis specimens carry no identification. Re-scoped (human decision) to "every *identified* row carries its finest-rank taxon_id"; genus-rank backfill delivered by the **inserted Phase 128**, with kingdom = Animalia disambiguation chosen over bees-only so wasp/fly aculeates resolve to their real genus taxon. MPTT / nested-set groundwork was **deferred** to a future milestone (out of v4.5 scope).

## Milestone: v4.4 Pipeline Data Quality — COMPLETE (2026-05-29)

**Shipped:** Occurrence synonymy applied at dbt layer via `int_combined` LEFT JOIN on `occurrence_synonyms` seed; checklist arm in `stg_checklist__species` also applies synonymy; `agapostemon texanus → subtilior` (Portman et al. 2024) fully resolved; `occurrence_synonyms.csv` moved to `data/dbt/seeds/` as single canonical source.

## Milestone: v4.3 Loading Performance — COMPLETE (2026-05-28)

**Shipped:** `occurrences.db` prebuilt SQLite DB replaces runtime hyparquet+INSERT loop; `geo_blob` pre-serialized table eliminates 92K WASM→JS callbacks; tablesReady 73% faster (930 ms → 250 ms), loading screen 40% faster (1460 ms → 875 ms). All 6 PERF requirements satisfied.

## Milestone: v4.2 iNaturalist Expert Observations — COMPLETE (2026-05-26)

**Shipped:** 45,354 expert-identified iNat observations ingested (44,534 net new after deduplication); `occurrences.parquet` extended to 36 columns with a `source` discriminator and iNat-specific nullable fields; amber points on the Mapbox map with unified source-selection filter and URL persistence; species pages show per-source counts; `photos.json` artifact stores CC-licensed images per species for future carousel.

## Milestone: v4.1 Validation & Code Quality — COMPLETE (2026-05-25)

**Shipped:** Retroactively filled all missing VALIDATION.md / VERIFICATION.md for phases 89–91 (v3.5), 97–98–100 (v3.7), and 112 (v4.0); fixed SUMMARY.md `requirements-completed` frontmatter for phases 89–91; enforced permit field validation in `places_validation.py` (raises on missing `issuing_authority`/`type`); synced stale `run.py` module docstring to list all 19 pipeline steps; resolved 3 pre-existing `test_dbt_diff.py` failures by regenerating public artifacts from current dbt sandbox. All 8 requirements satisfied.

## Milestone: v4.0 Washington Checklist Records — COMPLETE (2026-05-25)

**Shipped:** iNat taxonomy replaced with offline taxa.csv.gz (rate-limit risk eliminated); Bartholomew et al. 2024 checklist ingested as `checklist.parquet` (2,861 species-county rows); "Checklist records" toggle-able county-fill map layer; all 565 checklist species have taxon pages, county-presence SVG maps, attribution, and seasonality histograms. 18/18 requirements satisfied.

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

### Active

**v4.7 Checklist Records as Point Data** (resumed 2026-06-08) — see `.planning/REQUIREMENTS.md` (ING / RCN / DUP / PRO / UIX categories). Re-import the 50,646-row Bartholomew checklist CSV and promote it into `occurrences.parquet` as a `source='checklist'` point peer with build-time taxonomic reconciliation and conservative Ecdysis dedup. **Current:** Phases 135 (Name Reconciliation), 136 (Deduplication), 137 (Promotion into Occurrences), and 138 (Frontend Points & Detail Card) complete — **all v4.7 phases done**; ready for `/gsd:complete-milestone`.

*Backlog (ROADMAP.md): Phase 999.1 (debounce URL updates on map move), 999.2 (dependabot deps). v4.8 shipped 2026-06-08.*

### Validated

- ✓ **UIX-01..04**: checklist renders as real green (`#2c7a2c`) map points keyed on the `source` feature property, clustering with the other three sources (county-fill layer + entire `_showChecklist`/`_checklistVisible` chain removed); `checklist` is a real `VALID_SOURCES` member flowing through the standard `hiddenSources` toggle + `src=checklist` URL round-trip; detail card (`_renderChecklist`) shows accepted name + inline `(det. as {verbatim})`, collector, precision-aware Roman date (`formatRomanDate` null/length-4/7/10), locality, collapsed-count, muted "Bartholomew et al. 2024"; 3 columns (`verbatim_name`/`locality`/`collapsed_count`) promoted into the dbt `occurrences` contract (34→37); `checklist_count` re-sourced from the deduped `int_checklist_dedup_status` (no double-count vs the retired county surface). Click-to-sidebar selection routing (`parseOccId` checklist case + `checklist_id IN (...)` in list/table queries) and a null-date card crash were caught at the human-verify gate + code review and fixed — v4.7 (Phase 138)
- ✓ **PRO-01..04**: deduplicated coord-bearing checklist records promoted into `occurrences.parquet` as a `source='checklist'` ARM 4 of `int_combined` (reads `int_checklist_dedup_status`, filtered `dedup_status IS DISTINCT FROM 'confirmed'` + non-null coords; 19,929 rows); enforced dbt `occurrences` contract bumped 33→34 (`checklist_id INTEGER` = ObjectID; ARMs 1–3 emit `NULL::INTEGER`); Phase 111 isolation test retired → positive `source='checklist'` floor (≥10k) + re-baselined ceiling (160k) + greppable v4.7-reversal comment; `sqlite_export._GEO_COLS` (index 7) ↔ `src/features.ts` `checklist:<N>` occId decode in one atomic commit; defensive frontend wiring (occId in filter/url-state/occurrence) so checklist points don't crash on click/filter/share — detail-card UX deferred to Phase 138 — v4.7 (Phase 137)
- ✓ **DUP-01..03**: build-time checklist deduplication — `int_checklist_collapsed` collapses exact internal duplicates (lowest-ObjectID survivor + `collapsed_count`); `int_dedup_candidates` conservatively flags cross-source checklist↔Ecdysis pairs (exact accepted-name + full-precision shared date + 1.0 km lat-first `ST_Distance_Sphere` + collector token-set match) into an auditable `dedup_candidate_pairs.csv`; `int_checklist_dedup_status` exposes a joinable `dedup_status` and **no record is suppressed without an explicit curator-confirmed decision** in the `dedup_decisions.csv` seed; `check_dedup_gate()` build gate + run.py STEPS wiring (`dedup-candidates`→`dedup-gate` between `dbt-build` and `generate-sqlite`); curator HUMAN-REVIEW gate (0 candidates in current data, approved) — v4.7 (Phase 136)
- ✓ **TPERF-01..03 / TFIXTURE-01..04 / TFIX-01..05 / TTIER-01..03 / TCI-01..02** (17/17): `data/` pytest suite cut from >40 min to a green < 5 min fast tier — `integration` marker + `addopts` default-deselect; distilled committed checklist/taxonomy fixtures replace full-file parsing of `checklist_records_full.csv` and 39 MB `taxa.csv.gz`; built-asset deps run on a clean checkout (no `skipif`); ~19 red tests greened and randomized-order-stable (197 passed/9 skipped/18.8s); slow tier wired into `nightly.sh` + an independent `python-tests.yml` CI gate enforcing the budget on push/PR — v4.8
- ✓ **HIER-01..06**: `taxon_id`-keyed hierarchy (materialized `lineage_path`) built into `occurrences.db` via a two-pass bee + bycatch load; `is_anthophila` flag; zero-orphan assertion; Apidae descendant query 2.0 ms (< 50 ms gate) — v4.6 (Phase 129)
- ✓ **MFILT-01..03**: map filtering switched to `taxon_id` + descendant-by-any-rank (`instr(lineage_path, '/N/')`); 8-rank autocomplete; integer `?taxon=` URLs with legacy-name back-compat and twin disambiguation — v4.6 (Phase 130)
- ✓ **NORM-01..03**: dropped 4 denormalized rank-string columns from the occurrences mart (dbt contract 37→33; `canonical_name` retained) and rewrote `geo_blob` to a 7-field layout; `occurrences.db` −14.2% (26.7→22.9 MB), gzip −9.5%; migrated table/detail name rendering to a `display_name` taxa JOIN (`taxon_id`-keyed) and deleted dead string-column paths — v4.6 (Phase 131)
- ✓ **PAGE-01..04**: genus/species pages rebuilt off the `higher_taxa` rollup; 12 `/species/subfamily/{Name}/` pages (plus tribe/subgenus) with genus-colored SVG maps; slug-collision hard-fail — v4.6 (Phase 132)
- ✓ **TREE-01..04**: expandable bee-only `<details>` taxonomy tree at `/species` — default family→genus→species, "Show all ranks" toggle (localStorage), type-to-filter with ancestor auto-expand, per-node specimen/observation count splits, taxon-page + filtered-map links, no bycatch — v4.6 (Phase 133)
- ✓ **PWK-01..03**: extended `resolve_taxon_ids` to 3 name sources, reordered STEPS (inat-obs before resolution), inactive-taxon enumeration, stale docstrings fixed — v4.5
- ✓ **SPV-01..03**: 65 off-checklist species made visible (`specific_epithet` 527→592 non-null); static `/species/{Genus}/{epithet}/` pages + 231 occurrence SVGs — v4.5
- ✓ **TID-01, TID-03**: non-null `taxon_id INTEGER` on species.parquet + "View on iNaturalist →" links on species/genus/subgenus/tribe pages — v4.5
- ✓ **TID-02** (re-scoped): every *identified* occurrence row carries its finest-rank taxon_id; genus-rank backfill (kingdom=Animalia) drove occurrences NULL taxon_id 34,354→21,680; truly-unidentified specimens stay NULL — v4.5 (Phase 128)
- ✓ **ITR-01..04**: dormant inactive-taxon auto-remap (1-successor → `auto_synonyms` + bridge UPSERT, applied via synonym JOIN), triage report for unresolvable, hard-fail gate, manual entries take precedence — v4.5
- ✓ **PIPE-01..04**: iNat CSV export (45,354 rows) ingested into `inat_obs_data.observations`; canonical_name resolved; 821 Ecdysis-linked obs deduplicated; floral_host populated from OFV — v4.2
- ✓ **OCC-01..03**: `int_combined` ARM 3; `occurrences.parquet` expanded to 36 cols with `source` discriminator and iNat-specific nullable fields; `inat_obs_count` per species in `species.json` — v4.2
- ✓ **MAP-01..03 + DET-01**: 44,534 amber iNat obs points on map; unified Sources filter row; `src=` URL round-trip; iNat obs detail card (observer, date, CC image, iNat link) — v4.2
- ✓ **SPE-01..03**: "N specimens · N community observations" on species/genus/subgenus/tribe pages; `photos.json` with CC-licensed images per species — v4.2
- ✓ **VAL-01–05**: Phases 89–91, 97–98–100, 112 VALIDATION.md / VERIFICATION.md retroactively completed; SUMMARY.md frontmatter fixed — v4.1
- ✓ **CODE-01**: `places_validation.py` raises on missing permit `issuing_authority`/`type` — v4.1
- ✓ **CODE-02**: `run.py` module docstring lists all 19 pipeline steps — v4.1
- ✓ **CODE-03**: `test_dbt_diff.py` all 150 data tests pass — v4.1
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

- v4.2 iNaturalist Expert Observations — COMPLETE (2026-05-26)
- v4.1 Validation & Code Quality — COMPLETE (2026-05-25)
- v4.0 Washington Checklist Records — COMPLETE (2026-05-25)
- v3.9 Sidebar & Table Unification — COMPLETE (2026-05-20)
- v3.8 Conceptual Tidying — COMPLETE (2026-05-19)
- v3.7 Places — COMPLETE (2026-05-18)
- v3.6 Simpler Species Index — COMPLETE (2026-05-16)
- v3.5 Selection Rectangle — COMPLETE (2026-05-15)
- v3.4 dbt Full Rewrite — COMPLETE (2026-05-14)
- v3.3 dbt Spike — COMPLETE (2026-05-13)
- v3.2 Species Tab — COMPLETE (2026-05-05)
- v3.1 Eleventy Build Wrapper — COMPLETE (2026-04-30)
- v3.0 Mapbox GL JS Migration — COMPLETE (2026-04-27)
- v2.9 UI Flow Redesign — COMPLETE (2026-04-21)
- v2.8 Liveness: Provisional Specimen Records — COMPLETE (2026-04-20)
- v2.7 Unified Occurrence Model — COMPLETE (2026-04-17)
- v2.6 SQLite WASM Migration — COMPLETE (2026-04-17)
- v2.5 Elevation Data — COMPLETE (2026-04-16)
- v2.4 Header Navigation & Toolbar — COMPLETE (2026-04-14)
- v2.3 Specimen iNat Observation Links — COMPLETE (2026-04-13)
- v2.2 Feed Discoverability & Pipeline — COMPLETE (2026-04-12)
- v2.1 Determination Feeds — COMPLETE (2026-04-11)
- v2.0 Tabular Data View — COMPLETE (2026-04-09)
- v1.9 Component Architecture & Test Suite — COMPLETE (2026-04-04)
- v1.8 DuckDB WASM Frontend — COMPLETE (2026-04-01)
- v1.7 Production Pipeline Infrastructure — COMPLETE (2026-03-30)
- v1.6 dlt Pipeline Migration — COMPLETE (2026-03-28)

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

- ✓ **TAX-01..04**: iNat taxonomy replaced with offline taxa.csv.gz ETag-cached download + DuckDB ancestry walk; live `/v2/taxa` enrichers deleted; nightly.sh S3 sync for taxa archive — Phase 110
- ✓ **CHECK-01..04**: `checklist.parquet` (2,861 species-county rows) with county spatial join, eco_fallback, TRIM, iNat family enrichment, enforced schema contract; nightly.sh S3 upload + manifest key — Phase 111
- ✓ **EXT-01**: `source='checklist'` column in checklist.parquet; architecture comment documents future-source convention (GBIF, other Bee Atlas programs) — Phase 111
- ✓ **MAP-01..04**: "Checklist records" toggle in filter panel; Mapbox county-fill layer; taxon+year filter responsiveness; `cl=1` URL persistence and restore — Phase 112
- ✓ **SPEC-01..05**: All 565 checklist species in species index and taxon pages; genusList/subgenusList include checklist-only species; county-fill SVG maps with distinct checklist styling; "N checklist records · Bartholomew et al. 2024" attribution; seasonality histogram from all sources — Phase 113

### Future

- [ ] **TAB-01**: Determinations (identifications) for my specimens listed by recency — requires iNat determination data in pipeline
- [ ] **TAB-02**: Specimens collected last season on land owned by a named organization — requires land ownership data source
- [ ] **TAB-03**: Common floral hosts by month and region — cross-table aggregation query on ecdysis data

### Out of Scope

| Feature | Reason |
|---------|--------|
| ~~Tribe-level filtering~~ | ~~Tribe not present in Ecdysis DarwinCore export~~ — **superseded in v4.6**: tribe (and subfamily/subgenus) now resolve from `taxa.csv.gz` lineage, not the DarwinCore export |
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

Shipped v1.0 on 2026-02-22 (~6,172 lines across 47 files, 4 days). Shipped v1.1 on 2026-03-10 — URL sharing (+324 lines). Shipped v1.2 on 2026-03-11 — iNat pipeline (+5,069/−1,005 lines, 2 days). Shipped v1.3 on 2026-03-12 — links pipeline (+1,405/−31 lines, single day). Shipped v1.4 on 2026-03-13 — sample layer UI (iNat dots, toggle, sidebar detail, iNat links). Shipped v1.5 on 2026-03-27 — geographic region filters (+9,599/−88 lines across 68 files, 4 days). Shipped v1.6 on 2026-03-28 — dlt Pipeline Migration (+3,694/−3,066 lines across 67 files, 1 day). Shipped v1.7 on 2026-03-30 — Production Pipeline Infrastructure (+6,116/−325 lines, 65 files, 10 days): CDK Lambda deployed (abandoned for OOM/timeout); maderas nightly cron (`data/nightly.sh`) is the execution path; data files exported to S3; frontend fetches all data at runtime from CloudFront; CI simplified to frontend-only build; 13 pytest tests cover export schemas and transform logic. Shipped v1.8 on 2026-04-01 — DuckDB WASM Frontend (+4,120/−6,399 lines across 66 files, 1 day): hyparquet replaced by DuckDB WASM EH-bundle; all parquet reads and filter queries now SQL in-browser; `matchesFilter()` replaced by `visibleIds` Set; 3 phases, 5 plans, 10 tasks. Shipped v1.9 on 2026-04-04 — Component Architecture & Test Suite (+8,138/−1,560 lines across 47 files, 2 days): `<bee-atlas>` coordinator component owns all app state; `bee-map` and `bee-sidebar` refactored to pure presenter components; `bee-sidebar` decomposed into `bee-filter-controls`, `bee-specimen-detail`, `bee-sample-detail` sub-components; Vitest test suite with 61 tests across 4 files (url-state round-trips, filter SQL, Lit render tests); 6 phases, 11 plans. Shipped v3.6 on 2026-05-16 — Simpler Species Index (+5,418/−23,155 lines across 154 files, 2 days): 527 species pages, 42 genus pages, 103 subgenus pages, 19 tribe pages generated via Eleventy pagination; multi-color SVG occurrence maps at all taxon levels; monolithic `/species/` all-cards layout (8 files) replaced with searchable family→genus index; hierarchical `Genus/specificEpithet` slug format; BLOCKER-01 closed (species-maps/ S3 upload); 5 phases, 13 plans. Shipped v3.7 on 2026-05-18 — Places (+12,314/−2,566 lines across 103 files, 2 days): hand-curated `content/places.toml` TOML schema with WGS84 polygon geometry and validation pipeline (slug format, CRS, non-overlap); pipeline spatial join adds `place_slug` to `occurrences.parquet` (dbt 31-column contract); `places.geojson` + `places.json` committed to git; per-place SVG occurrence maps; `/places.html` index + per-place pages at `/places/{slug}.html`; Places boundary mode in Mapbox (4th toggle), click-to-filter, removable chip, `place=` URL round-trip; B-01 + W-01 closed in Phase 100.1; 5 phases (including INSERTED 100.1), 11 plans. Shipped v3.8 on 2026-05-19 — Conceptual Tidying (+5,601/−153 across 48 files, 1 day): `src/occurrence.ts` (6 pure-function exports, 6 caller files migrated, 24 Vitest tests); `data/domain.py` (Python slugify extracted, BEE_FAMILIES removed, byte-equivalence tests); `data/dbt/macros/inat_field_ids.sql` (5 named macros, dbt build PASS=46); SEM-01 semantic reconciliation (places_export.py specimen predicate fixed, isSpecimenBacked canonical across 3 stack layers); 4 phases, 5 plans. Shipped v3.9 on 2026-05-20 — Sidebar & Table Unification (+10,639/−1,326 across 54+ files, 2 days): `bee-pane` unified component (1004 lines) merging `bee-filter-panel` + `bee-sidebar` into three-state chrome (collapsed/list/table); `bee-atlas` state machine refactored (three flags → single `_paneState`); `queryListPage` WHERE intersection for unified occurrence query; table as split-screen (40% map/60% table); `bee-filter-panel.ts` and `bee-sidebar.ts` deleted; URL pane state with legacy alias; MAP-01 via overlay architecture; 5 phases, 12 plans, 61 commits. Shipped v4.0 on 2026-05-25 — Washington Checklist Records (+63,769/−1,882 across 104 files, 2 days): offline taxa.csv.gz replaces live iNat API calls; Bartholomew et al. 2024 checklist ingested as `checklist.parquet` (2,861 species-county rows); "Checklist records" toggle-able county-fill layer; 565 checklist species have taxon pages; 4 phases, 13 plans. Shipped v4.1 on 2026-05-25 — Validation & Code Quality (+5,367/−131 across 49 files, 1 day): retroactive VALIDATION.md/VERIFICATION.md for v3.5/v3.7/v4.0; permit validation hardened; run.py docstring synced; test_dbt_diff.py 150 tests green; 3 phases, 12 plans. Shipped v4.2 on 2026-05-26 — iNaturalist Expert Observations (+10,277/−4,275 across 110 files, 2 days): 44,534 expert iNat obs ingested and unified into `occurrences.parquet` as ARM 3; amber map points with source-selection filter and URL persistence; per-source counts on species pages; `photos.json` artifact for future carousel; 4 phases, 14 plans. Shipped v4.3 on 2026-05-28 — Loading Performance (+5,261/−969 across 98 files, 3 days): `occurrences.db` prebuilt SQLite DB exported by pipeline and loaded via MemoryVFS (eliminates INSERT loop); `geo_blob` pre-serialized GeoJSON table (eliminates 92K WASM→JS callbacks); tablesReady 73% faster (930 ms → 250 ms); loading screen 40% faster (1460 ms → 875 ms); 2 phases, 5 plans. Shipped v4.6 on 2026-06-04 — Taxonomy Hierarchy & Normalization (+4,306/−2,468 across 59 non-planning files, ~3 days): `taxon_id`-keyed materialized-path hierarchy in `occurrences.db`; map filtering cut over to descendant-by-any-rank; occurrences mart dropped 4 denormalized columns (37→33, −14.2% DB) with a `display_name` taxa JOIN; subfamily/tribe/subgenus pages added; flat `/species` index replaced by an expandable bee-only browse tree with toggle + filter; 5 phases, 18 plans. Shipped v4.8 on 2026-06-08 — Fast, Honest Test Suite (+1,672/−408 across 32 `data/`+`.github/` files, ~3 days): two-tier pytest (`integration` marker + `addopts` default-deselect) splits a < 5 min fast default from an opt-in slow tier; distilled committed checklist/taxonomy fixtures + a module-scoped DuckDB build remove the per-test reparse of the 50,646-row `checklist_records_full.csv`; built-asset-dependent tests run on a clean checkout instead of `skipif`-skipping; ~19 red tests greened and proven randomized-order-stable via pytest-randomly (197 passed/9 skipped/18.8s); slow tier wired into `nightly.sh` and an independent `python-tests.yml` CI gate enforces the budget on push/PR; 5 phases, 11 plans.

**Tech stack:**
- Frontend: TypeScript, Vite, Mapbox GL JS, Lit (LitElement), wa-sqlite, hyparquet, temporal-polyfill
- Pipeline: Python 3.14+, uv, dbt-duckdb, duckdb, requests, beautifulsoup4, geopandas
- Infrastructure: AWS CDK v2 (TypeScript), S3 + CloudFront OAC, OIDC IAM role
- CI/CD: GitHub Actions (build on all pushes, deploy on push to main)

**Live site:** https://d1o1go591lqnqi.cloudfront.net

**Known tech debt:**
- EPA L3 ecoregion CRS risk: `geographies_pipeline.py` calls `.to_crs('EPSG:4326')` before yielding rows — handled for the current ingestion path. Any future shapefile ingestion added to the pipeline must repeat this step or risk silently wrong spatial joins.
- dlt pipeline write-path tests deferred (TEST-03 scope): dlt resource tests skipped in v1.7; only pure-function unit tests and export integration tests covered.
- Lambda execution path retired (quick task 260514-fcq, 2026-05-14): PipelineFunction + EventBridge schedulers + Function URL removed from BeeAtlasStack; maderas nightly cron is authoritative.
- TAX-04/CHECK-03 S3 runtime not yet verified: code is wired; runtime verification fires on first nightly cron run on maderas after deploy.

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
| iNat taxonomy source is AWS Open Data taxa.csv.gz (not DwC-A zip archive) | DwC-A disqualified: URL-form IDs, no subfamily/tribe, no ancestry column; taxa.csv.gz has `ancestry` string enabling DuckDB PIVOT ancestry walk | ✓ Good — Phase 110; 5 pytest tests confirm schema and caching behavior |
| Checklist records are county-range assertions in separate mart (not in int_combined) | Historical checklist entries lack GPS coordinates; treating them as occurrence points would contaminate the WABA specimen model; `source='checklist'` in separate mart keeps provenance clean | ✓ Good — Phase 111; isolation pytest confirms occurrences.parquet row count unchanged |
| Checklist map layer uses Mapbox county-fill (not point cluster) | 2,861 species-county rows are county-range records, not point coordinates; county-fill on existing counties GeoJSON source is the correct visual representation | ✓ Good — Phase 112; addLayer with beforeId ensures specimen dots render on top |
| `_checklistAllRows` cached after first parquet fetch; re-filter in JS on taxon/year change | Avoids repeated CloudFront fetches on every filter interaction; checklist.parquet is small (~100KB) and static within a session | ✓ Good — Phase 112; `_checklistGeneration` guard prevents stale results |
| Atlas link on species-detail.njk wrapped in `occurrence_count > 0` guard | Checklist-only species don't have occurrence records on the WABA map; linking to the atlas with `o=` param would be misleading | ✓ Good — Phase 113; checklist-only pages show attribution + county SVG but no atlas deep-link |
| `queryListPage` uses WHERE intersection for selection + filter (not priority sort) | Priority sort would show selection first then fall through to full list — creates confusing UX where "clear" changes total count; intersection is what users expect ("show me these 3 in the context of my filter") | ✓ Good — Phase 109; `_runListQuery` called on filter change + selection change + clear |
| `_onFilterChanged` calls `_runListQuery()` when `_paneState === 'list'` | Without this guard, changing a filter while the pane is open leaves the occurrence list stale (showing pre-filter results) | ✓ Good — Phase 109-06 gap closure; gap only visible when pane is already open during filter change |
| Table-mode collapse goes to `'collapsed'` not `'list'` | Preserves D-08 from v2.9: user who expands to table and collapses should land on the clean map, not the list view they didn't explicitly open | ✓ Good — Phase 106; matches pre-v3.9 "table close → clean map" expectation |
| iNat expert obs sourced from periodic CSV export (not live API) | Avoids API dependency and auth complexity; `ident_user_id` list is the quality gate; `quality_grade=any` included because expert identification supersedes community consensus | ✓ Good — Phase 117; 45,354 rows in first export |
| iNat obs merge into `occurrences.parquet` via `int_combined` ARM 3 (not separate parquet) | Unified model avoids duplicate frontend rendering paths; `source` discriminator + nullable iNat-specific columns keeps the schema extension additive | ✓ Good — Phase 118; dbt contract expands 31 → 36 columns cleanly |
| `src=` URL param encodes *visible* sources (absent = all on) | Initial implementation encoded *hidden* sources — polarity bug caught in UAT; visible-sources encoding produces cleaner minimal URLs (absent = default) | ✓ Good — Phase 119 UAT; `VALID_SOURCES` allowlist in url-state.ts co-located with `SourceKey` type |
| Checklist records merged into unified Sources filter row | Separate row with identical icon was confusing; four checkboxes in one row clarifies the source model (Ecdysis / Provisional WABA / iNat expert obs / Checklist) | ✓ Good — Phase 119 UAT; `_renderShow()` removed; `_renderSources()` owns all four items |
| CC license gate for iNat obs images: `row.license.toUpperCase().startsWith('CC')` | Non-CC images cannot be embedded; case-insensitive check prevents rendering restricted images; null-safe | ✓ Good — Phase 119; confirmed with live obs (wenatcheeb, 1 IV 2018) |
| `sqlite_export.py` schema derived from parquet at export time (`CREATE TABLE AS SELECT * FROM read_parquet(...)`) | No hardcoded DDL means future dbt column changes require no edits to the exporter | ✓ Good — Phase 121; clean separation of schema ownership |
| MemoryVFS seeding pattern: `mapNameToFile({flags: 0x2, size, data})` before `open_v2` | Preloaded DB opens in ~1–3 ms vs ~1229 ms INSERT loop; no CREATE TABLE, no row iteration in worker | ✓ Good — Phase 121; replaces entire hyparquet+INSERT boot path |
| `json_group_array` rejected; `geo_blob` pre-serialized table used instead | `json_group_array` benchmarked at 1286 ms (2× worse): WASM→JS callback overhead ~6.4 μs × 92K rows is constant regardless of SQL; Python `json.dumps` at export time reduces worker to 1 row, 1 callback | ✓ Good — Phase 122; root cause correctly identified; 86% query reduction confirmed |
| `cast self as any` for two-arg `postMessage` in worker | TypeScript's DOM lib lacks the `(message, transferList)` overload for `WorkerGlobalScope`; runtime behavior is correct; comment explains the cast | ✓ Good — Phase 122; acceptable workaround for TypeScript lib gap |
| TID-02 re-scoped from "every occurrence row" to "every *identified* row" | The literal wording was impossible — ~21k Ecdysis specimens carry no taxonomic identification; forcing a taxon_id would mean a meaningless root "bees" link. Finest-rank semantics + NULL for the unidentified is the honest contract | ✓ Good — v4.5 human decision; surfaced during Phase 126 verification, closed by inserted Phase 128 |
| Genus taxon_id disambiguation by kingdom = Animalia (not Anthophila/bees-only) | Ecdysis identifications are all animals; Animalia resolves 80/149 occurrence genera (vs 39) incl. the wasp/fly aculeates collected alongside bees, with 0 collisions in our data — and removes a hand-curated non-bee exclusion list | ✓ Good — v4.5 Phase 128 user decision; verified stelis→127831 (bee not orchid), bembix→53067 |
| `stg_inat__genus_taxon_ids` reads `../raw/taxa.csv.gz` directly via DuckDB `read_csv` | The full taxa dump (all ranks/kingdoms) is not loaded into DuckDB — only an Anthophila-filtered lineage table is; the raw CSV is the only dbt-only source. First raw-CSV-in-model in the repo; `HAVING COUNT(*)=1` dedups the 58 cross-phylum homonyms so the join can't fan out | ✓ Good — Phase 128; build CWD is `data/dbt` so the relative path resolves |
| Materialized path (`lineage_path` + `instr()`) over closure/nested-set for the taxon hierarchy | Benchmarked: Apidae descendant filter 2.0 ms in wa-sqlite/Firefox, far under the 50 ms gate, with the simplest schema | ✓ Good — Phase 129; gate decided structure before any schema was finalized |
| Bycatch via two-pass load with `is_anthophila` flag (hierarchy-resident, not surfaced) | Non-bee aculeates collected alongside bees must resolve to a name after the string columns drop, but get no tree/page/autocomplete presence | ✓ Good — Phase 129; zero-orphan assertion confirms every occurrence taxon_id maps to the hierarchy |
| `?taxon=` migrated to integer `taxon_id`, legacy `name&taxonRank` parsed as fallback | Names aren't unique within a kingdom; integer ids are canonical and rank is derivable from the cache (D-06) | ✓ Good — Phase 130; `_resolveLegacyTaxon` handles old URLs with twin disambiguation |
| Browse-tree intermediate ranks skipped via `display:contents` (NOT the `hidden` attribute) | `hidden`/`display:none` on a wrapping `<details>` buries the genera/species nested inside — the default view showed empty families | ⚠️ Revisit — Phase 133; shipped correct but only after a code-review gap closure caught the broken default view that source-grep tests had passed |
| Browse-tree behavior extracted to `src/species-tree.ts` (pure DOM) + executable happy-dom tests | The original source-grep tests asserted strings existed in source and passed while the rendered feature was broken (e.g. the `.open = true` line that failed to reveal matches) | ✓ Good — Phase 133 gap closure; real DOM tests now exercise toggle/filter/reset/auto-expand |
| Two-tier pytest: `integration` marker + `addopts = -m "not integration"` default-deselect | `uv run pytest` must be fast-by-default (<5 min) with full-data checks opt-in (`-m integration`); a single suite can't be both the dev inner loop and the nightly truth-check | ✓ Good — v4.8 Phase 139; slow tier runs in nightly.sh + gated in CI |
| Distill committed fixtures over session-scoping alone | Dominant cost was per-test reparse of the committed 50,646-row `checklist_records_full.csv` (not un-checked-in-asset brittleness); tiny distilled samples + a module-scoped DuckDB build remove the ~25× reparse | ✓ Good — v4.8 Phase 140; fixtures in `data/tests/fixtures/` with documented provenance |
| Loud deselect over silent `skipif` for stale built-asset tests | "green ≠ covered" — a silently-skipped test reads as passing; deselection/`@integration` tagging keeps the gap visible in the summary | ✓ Good — v4.8 Phase 141; `test_dbt_diff` deselected from fast tier, run for real in nightly against a pre-pulled published baseline |
| pytest-randomly in the fast tier | Order-dependence is a latent honesty bug — a suite green only in collection order is lying; randomization surfaced three such bugs | ✓ Good — v4.8 Phase 142; fast suite green (197 passed/9 skipped/18.8s) under randomized order |
| Independent `python-tests.yml` CI job (LFS checkout + pre-installed DuckDB spatial) | Python tests were not in CI (frontend-only); the clean runner needs git-LFS data + the spatial extension pre-installed to mirror a real clean checkout | ✓ Good — v4.8 Phase 143; fails build on red or over the < 5 min budget |

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
*Last updated: 2026-06-08 after Phase 138 (Frontend Points & Detail Card) completion — UIX-01..04 verified (10/10 must-haves, human-verify approved). Checklist now renders as real green map points with a full detail card; county-fill layer retired; `checklist` is a real source-selection member; counts deduped. **All v4.7 phases (135–138) complete — milestone ready to close.** Two defects (click-to-sidebar selection routing, null-date card crash) were caught by the human-verify gate + code review and fixed. v4.8 (Fast, Honest Test Suite) shipped 2026-06-08 (17/17). Backlog: Phase 999.1 (debounce URL updates on map move), 999.2 (dependabot). Next: `/gsd:complete-milestone` to archive v4.7.*
