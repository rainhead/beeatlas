# Project Research Summary

**Project:** BeeAtlas v6.0 — My Work: Progress & Provenance
**Domain:** Per-collector personal progress surface on a static-hosted citizen-science atlas
**Researched:** 2026-06-24
**Confidence:** HIGH

## Executive Summary

v6.0 adds the first personal page type to BeeAtlas: a bookmarkable, no-auth, public per-collector page showing a collection→ID lifecycle event stream and an accomplishment/coverage view. The recommended approach follows two well-established site patterns (per-place Eleventy static pages, nightly pipeline JSON exports) and requires zero new npm dependencies or infrastructure. The one genuinely hard problem — surfacing "what changed since you last visited" on a snapshot-only pipeline — has a viable MVP path (two VARCHAR columns added as a post-dbt pipeline step), but that path requires an architectural decision that must be made before Phase 2 is planned.

The feature dependency order is firm: (1) unify collector identity with a `collector_inat_login` COALESCE column and commit to the first dbt contract bump, (2) add `first_seen_date`/`id_date` temporal columns as a second contract bump, (3) export `collectors.json` and generate Eleventy static pages (parallelizable with step 4), (4) rebuild the `source` enum into orthogonal provenance facets, (5) build the event stream frontend, (6) build the accomplishment view. The two dbt contract bumps each require the documented data-before-code S3 release sequence and must be shipped as separate nightly runs to avoid the double-gate deadlock.

The highest structural risks are: (a) the `waba_specimen → ecdysis` occ_id transition that makes a physical bee appear as a phantom delete+create in any naive snapshot diff — this must be resolved before the event-history schema is committed; (b) the three-file positional coupling across `src/occurrence.ts`, `src/filter.ts`, and `data/dbt/models/marts/occurrence_places.sql` that the facets rebuild will touch; and (c) privacy on the public per-collector pages — opt-out seed, minimum-activity threshold, and `noindex` meta tag are launch requirements, not polish.

---

## Key Design Fork: Temporal History Mechanism

**This is the milestone's single unresolved design decision. It must be resolved before Phase 2 is planned.**

The core problem: the nightly pipeline emits a complete snapshot. No change log exists. The event stream feature needs "what changed" not just "current state."

### Option A — Pipeline append-only history table (STACK.md recommendation)

A `dbt_sandbox.occurrence_status_history` DuckDB table maintained by `run.py`. Each night, compare current snapshot against the prior state, INSERT changed rows. Export `collector-events-{login}.json` per collector.

Pros: portable (bookmarkable, shareable across devices), supports community feed in a later milestone, authoritative timeline.
Cons: history table grows indefinitely in the persisted DuckDB (though cost is minimal — DuckDB is already S3-backed); adds pipeline complexity; requires managing the `waba_specimen → ecdysis` transition identity explicitly; one JSON file per collector to upload and bust.

### Option B — Client `localStorage` watermark only

Frontend stores `lastSeen` date; diffs current snapshot on load.

Pros: no pipeline changes.
Cons: device-local (breaks on new device/incognito), `modified` field absent for non-Ecdysis rows (most of the corpus), cannot reconstruct a timeline. Not viable for a bookmarkable shared page.

### Option C — Hybrid: `first_seen_date`/`id_date` columns + client watermark (ARCHITECTURE.md recommendation)

Pipeline adds two VARCHAR columns computed via a post-dbt DuckDB JOIN against yesterday's parquet (already pulled for `test_dbt_diff`). Client watermark gates what is "new" on first visit (default: last 30 days). No separate CDN file; columns ride in `occurrences.db`.

Pros: portable (same result on any device for same watermark), bounds DB growth to two columns, no new CDN artifact, reuses existing S3 pull step.
Cons: first-run bootstraps all existing rows as `first_seen_date=TODAY` (one-time event flood that must be suppressed); `id_date` is an approximation for non-Ecdysis rows; still requires the `waba_specimen → ecdysis` transition to be handled.

### Recommended MVP path: Option C

Option C is lower-risk for static hosting: no growing separate artifact, no per-collector JSON upload complexity at this stage, and the client watermark is adequate for a personal (non-shared) event feed. The `waba_specimen → ecdysis` transition problem must be addressed regardless of which option is chosen.

Option A is the right long-term architecture (required for the community feed milestone) and should be targeted for v6.1. If the roadmapper treats the community feed as in-scope for this milestone, go directly to Option A instead.

**Mark for explicit resolution at discuss/plan time for Phase 2.**

---

## Key Findings

### Recommended Stack

The existing stack requires no new dependencies. All v6.0 features compose from TypeScript + Lit + Eleventy + dbt + DuckDB. The collector page follows the same pattern as per-place pages (`places.json` → `_data/places.js` → `place-detail.njk`). Accomplishment aggregations belong in the pipeline (DuckDB GROUP BY at export time), not in the browser (avoid wa-sqlite scan of 90k+ rows on every page load). Per-collector coverage maps reuse `data/svg_map.py`.

**New pipeline artifacts (Option C path):**
- `collectors.json` — pre-aggregated collector stats keyed on `collector_inat_login`
- Two new VARCHAR columns (`first_seen_date`, `id_date`) inside `occurrences.db`
- Per-collector SVG coverage maps (reuses `data/svg_map.py` pattern)

**No new npm packages. No new infrastructure. No DuckDB-WASM.**

### Expected Features

**Must have (table stakes):**
- Per-collector page at `/collectors/{inat_login}/` — bookmarkable, no auth, public
- Total count stats (specimens, samples, species, years active)
- Current status breakdown (awaiting ID / identified / provisional)
- County coverage map (SVG, reuses taxon-page pattern)
- Taxon breadth list (species contributed to, with taxon links)

**Should have (differentiators):**
- Personal event stream (collection→ID lifecycle, reverse-chronological)
- "New county record!" milestone events in the stream
- Pending vs. identified visual split on the page
- "Active since YYYY (N seasons)" badge
- Link to filtered main map (`/?collectors=inat_login:handle`)

**Defer to v6.1+:**
- Collector dot map (occurrence points colored by year)
- Year-over-year comparison chart (eBird-style)
- Community/shared feed (`collection-event-coordination.md` seed)
- Role badges (require a roster data source not in the pipeline)

**Anti-features (explicitly do not build):**
- Leaderboards / rankings — demotivates the bottom 90%
- Generic point totals — disconnected from scientific meaning
- Streak tracking — wrong model for seasonal activity
- Push notifications / email alerts — requires server infrastructure

### Architecture Approach

The build is structured as seven sequential-with-parallelism phases. Two phases require dbt contract bumps (collector identity column: 36→37 cols; temporal columns: 37→39 cols), each triggering the documented data-before-code S3 release sequence and requiring a separate nightly run. The facets rebuild (source enum → orthogonal provenance tiers) touches `filter.ts`, `style.ts`, and `url-state.ts` and must be committed atomically. Per-collector pages follow the places pattern exactly.

**Major new/modified components:**
1. `data/dbt/models/intermediate/int_combined.sql` + `occurrences.sql` — add `collector_inat_login` COALESCE
2. `data/run.py` — post-dbt temporal column computation; `collectors.json` export
3. `_data/collectors.js` + `_pages/collector-detail.njk` — Eleventy static page (mirrors places pattern)
4. `src/filter.ts` + `src/style.ts` + `src/url-state.ts` — facets rebuild (atomic)
5. New `<bee-collector>` coordinator element — owns reactive state for the event stream page

**Collector identity is currently fragmented across four fields:**

| Field | ARM(s) | Notes |
|-------|--------|-------|
| `recordedBy` | ARM 1 (ecdysis), ARM 5 (checklist) | Free-text; not URL-safe |
| `host_inat_login` | ARM 1 (via sample), ARM 2 | iNat handle of sample observer |
| `user_login` | ARM 4 (inat_obs) | iNat handle of expert observer |
| `specimen_inat_login` | ARM 1, ARM 3 (waba_specimen) | **Currently dropped from mart SELECT** |

The fix: `COALESCE(specimen_inat_login, host_inat_login, user_login) AS collector_inat_login` in `int_combined.sql`, projected through `occurrences.sql`, added to `schema.yml`. A `collector_identity.csv` seed handles the `recordedBy` ↔ iNat handle mapping for WABA collectors whose Ecdysis records lack an iNat link.

### Critical Pitfalls

1. **Three-file occ_id positional coupling** — `src/occurrence.ts` (`occIdFromRow`), `src/filter.ts` (`OCC_ID_SQL_CASE`), and `data/dbt/models/marts/occurrence_places.sql` must stay byte-identical in CASE branch priority order. The facets rebuild will touch at least `filter.ts`. Treat as an atomic commit unit; add a Vitest assertion comparing both TypeScript structures. Breakage is silent (place filters return zero results for one source category).

2. **`waba_specimen → ecdysis` occ_id transition** — ~33 `waba_specimen` rows (mostly 2024 backlog) carry `occ_id='inat_obs:N'` before Ecdysis upload and `occ_id='ecdysis:M'` after. A naive snapshot diff shows a phantom delete+create rather than "specimen catalogued." Design the transition linkage via `specimen_observation_id` cross-reference before committing any event-history schema. Recovery cost if skipped: redesign + full history re-run.

3. **Two dbt contract bumps require isolated S3 release sequences** — `collector_inat_login` (Phase 1) and `first_seen_date`/`id_date` (Phase 2) must each follow: update `schema.yml` → nightly with `SKIP_INTEGRATION_GATE=1` → then ship TypeScript that reads new columns. Never combined into a single nightly run. See `project_occurrences_contract_release_sequence.md`.

4. **`specimen_inat_login` is absent from the mart** — currently dropped from `occurrences.sql` SELECT despite being in `int_combined`. Adding it to `OccurrenceRow` without the mart change produces a column that is NULL everywhere. The `collector_inat_login` COALESCE is the correct fix.

5. **Privacy on public per-collector pages is a launch requirement** — `collector_optout.csv` seed, minimum-activity threshold (≥5 occurrences), `<meta name="robots" content="noindex">`, and no coordinate display (county only) must be in Phase 3 acceptance criteria. Not polish.

6. **Collector page generation must be gated on the identity seed** — generating pages from all distinct `host_inat_login` values includes casual iNat observers and historical museum contributors from checklist ARM 5. Gate on `collector_identity.csv`; add a build-time assertion on page count.

7. **First-run event flood** — on the first nightly run with temporal history, every existing occurrence gets `first_seen_date=TODAY`. Set the baseline without emitting events; show historical accomplishments from the snapshot, not the diff. Required as an explicit design decision in Phase 2.

---

## Implications for Roadmap

Based on research, suggested phase structure:

### Phase 1: Collector Identity Column

**Rationale:** Everything downstream keys on a unified collector identity. `specimen_inat_login` is currently dropped from the mart; the COALESCE unblocks all per-collector queries. Ship this contract bump standalone so the S3 release sequence is isolated.
**Delivers:** `collector_inat_login` VARCHAR in `occurrences.parquet` + `occurrences.db`; dbt contract 36→37 cols; `collector_identity.csv` seed bootstrapped with active WABA collectors
**Avoids:** `specimen_inat_login` null-everywhere trap; double-gate deadlock from combining with Phase 2
**Research flag:** Standard patterns — no deeper research needed

### Phase 2: Temporal Columns + Transition Design

**Rationale:** Second dbt contract bump, isolated from Phase 1. The `waba_specimen → ecdysis` transition linkage and the "first-run baseline" strategy are unresolved design decisions that must be made here — before the event-history schema is committed.
**Delivers:** `first_seen_date` + `id_date` VARCHAR in mart (37→39 cols); `waba_specimen` transition matched via `specimen_observation_id`; first-run flood suppressed
**Resolves:** Temporal history fork (Option A vs Option C) — must be decided at discuss/plan step
**Avoids:** waba_specimen identity break; first-run flood; late-arriving backfill corrupting timeline
**Research flag:** Needs discuss step before planning — temporal fork and transition design are unresolved

### Phase 3: `collectors.json` Export + Eleventy Static Pages (parallelizable with Phase 4)

**Rationale:** Once Phase 1 lands, the pipeline can aggregate per-collector stats. Follows the exact `places.json`/`place-detail.njk` pattern — no new concepts.
**Delivers:** `collectors.json` artifact; `_data/collectors.js`; `_pages/collector-detail.njk` at `/collectors/{login}/`; privacy requirements baked in (noindex, opt-out seed, min-threshold gate, county-only display)
**Avoids:** Privacy exposure; scale blowup (seed-gated generation); static-gen performance trap (pre-aggregate in pipeline, not Eleventy)
**Research flag:** Standard patterns — no deeper research needed

### Phase 4: Source → Provenance Facets Rebuild (parallelizable with Phase 3)

**Rationale:** High-risk, self-contained refactor. Must be atomic. Unblocks the event stream rendering in Phase 5. The three source consumers (`filter.ts`, `style.ts`, `url-state.ts`) cannot be half-refactored.
**Delivers:** `hiddenProvenanceTiers` in `FilterState`; `provenance_tier` GeoJSON property replacing `source` in `style.ts`; `tier=` URL param with legacy `src=` fallback in `parseParams`
**Avoids:** Partial facets state (all three consumers in one commit); occ_id positional coupling break; `FilterState` partial update (run `tsc --noEmit` as gate)
**Research flag:** Standard patterns but HIGH execution risk — plan must include positional-coupling verification criterion and atomic-commit requirement; place-filter integration test covering each source arm is acceptance criterion

### Phase 5: Per-Collector Event Stream Frontend

**Rationale:** Gated on Phase 2 (temporal columns) and Phase 4 (provenance tiers for rendering). Core differentiator — no other WABA-ecosystem tool closes the collection→ID loop.
**Delivers:** Event stream on collector page, reverse-chronological by `first_seen_date`; "specimen catalogued" event for waba_specimen transitions; "new county record!" milestone events; pending vs. identified visual split
**Avoids:** Sorting by collection date (use ingestion date); event stream without pagination for 500+ record collectors; late-arriving backfill shown as recent
**Research flag:** Standard patterns — hard design decisions resolved in Phases 2 and 4

### Phase 6: Accomplishment View

**Rationale:** Final phase — gated on Phases 3 and 5. All data is pre-aggregated in the pipeline; the frontend renders from JSON artifacts.
**Delivers:** County coverage SVG map; taxon breadth list; "Active since YYYY (N seasons)" badge; ecoregion breadth; filtered-map deep link
**Avoids:** Gamification anti-patterns (no leaderboards, no percentages, absolute counts only); empty-state zeros (prompt framing, not scorecard); metrics that plateau quickly
**Research flag:** Standard patterns — UX copy for empty state must be resolved at plan step

### Phase Ordering Rationale

- Phases 1 and 2 are sequential: each carries an independent dbt contract bump with its own S3 release sequence; combining them creates a double-gate deadlock.
- Phases 3 and 4 can run in parallel after Phase 1: they share no pipeline or frontend dependencies on each other.
- Phase 5 is gated on both Phase 2 (for data) and Phase 4 (for rendering).
- Phase 6 is last because it builds on the complete data + rendering + page foundation.
- Per ARCHITECTURE.md's dependency graph: the build-order is source-identity (Phase 1) → temporal substrate (Phase 2) → static pages + facets rebuild (Phases 3, 4) → event stream (Phase 5) → accomplishment (Phase 6).

### Research Flags

Needs discuss step before planning:
- **Phase 2:** Temporal history fork (Option A vs Option C) and `waba_specimen → ecdysis` transition linkage are unresolved. Do not plan Phase 2 without a discuss step.

Standard patterns (no research-phase needed):
- **Phases 1, 3, 4, 5, 6:** All follow established project patterns (dbt contract bumps, Eleventy data modules, FilterState refactors, Lit frontends). Pitfalls are known; prevention strategies are concrete.

---

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | Verified against live codebase and live DuckDB; no new deps required; all patterns already in production |
| Features | HIGH | Grounded in peer-reviewed citizen-science motivation research + direct iNat/eBird comparisons + authoritative project docs |
| Architecture | HIGH | Every claim grounded in actual source files; collector field gaps confirmed by direct mart SELECT inspection |
| Pitfalls | HIGH (structural) / MEDIUM (gamification) | Positional coupling, contract deadlock, waba_specimen transition: directly observed. Gamification pitfalls: inferred from domain knowledge, no prior analogous phase |

**Overall confidence:** HIGH

### Gaps to Address

- **Temporal fork resolution (Phase 2 discuss step):** Choose Option A (append-only history table) vs Option C (two columns + client watermark). Decision criteria: if community feed is within two milestones, go Option A now. If >6 months out, Option C for MVP then Option A for v6.1.
- **`collector_identity.csv` initial seed content:** Must be populated with active WABA collectors before Phase 3 ships. Data curation task, not engineering — but it gates the phase.
- **`collector_optout.csv` operator process:** No process currently exists for a collector to request removal. Document the workflow at Phase 3 plan step.
- **Per-identification `created_at` from iNat API (deferred):** Requires extra nightly API call per observation; deferred from MVP. Target for v6.1 to enrich event stream with "your sample was IDed by [identifier] on [date]."

---

## Sources

### Primary (HIGH confidence — live codebase + live data)
- `data/beeatlas.duckdb` (live queries) — Ecdysis `modified` timestamps 2025-02 through 2026-06; `created_at`/`updated_at` as `TIMESTAMP WITH TIME ZONE`; quality_grade distribution; ~156 WABA collectors with `host_inat_login`
- `data/dbt/models/intermediate/int_combined.sql` — five ARM structure, all collector fields confirmed
- `data/dbt/models/marts/occurrences.sql` — mart SELECT; `specimen_inat_login` absence confirmed
- `data/dbt/models/marts/schema.yml` — 36-column enforced contract
- `data/dbt/models/marts/occurrence_places.sql` — occ_id positional coupling
- `src/filter.ts`, `src/occurrence.ts`, `src/style.ts`, `src/bee-occurrence-detail.ts`, `src/url-state.ts`
- `_data/places.js`, `_pages/place-detail.njk` — Eleventy pattern to follow
- `docs/domain-model.md` — occ_id transitions, waba_specimen lifecycle
- iNat API live call — per-identification `created_at` confirmed ISO 8601

### Secondary (HIGH confidence — peer-reviewed / official docs)
- Tandfonline 2020 — feedback as top citizen-science retention factor
- eBird My eBird help center + design philosophy notes
- iNat observation lifecycle documentation
- `MEMORY.md` → `project_occurrences_contract_release_sequence.md` — S3 deadlock recovery (documented prior incident)
- `.planning/seeds/me-and-my-progress.md`, `.planning/research/questions.md`, `.planning/notes/work-vs-learning-two-halves.md`

---

*Research completed: 2026-06-24*
*Ready for roadmap: yes — resolve temporal fork at Phase 2 discuss step before planning*
