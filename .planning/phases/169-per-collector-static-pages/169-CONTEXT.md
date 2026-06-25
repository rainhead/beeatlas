# Phase 169: Per-Collector Static Pages - Context

**Gathered:** 2026-06-25
**Status:** Ready for planning

<domain>
## Phase Boundary

Stand up a public, no-auth, bookmarkable Eleventy page at `/collectors/{inat_login}/`
for every **active WABA collector**, following the existing **places pattern**:

```
data export step  → public/data/collectors.json
_data/collectors.js → reads collectors.json (Eleventy data cascade)
_pages/collector-detail.njk → paginates collectorsArray, one page per collector
_pages/collectors.njk → index roster (parallel to _pages/places.njk)
```

Each page shows headline contribution stats, a pending-vs-identified status
split, and a deep-link into the main map filtered to that collector.

**Frontend + new data-export step only.** The data layer is already done:
`collector_inat_login` (Phase 167) and `id_date` (Phase 168) are live in the
mart. This phase adds a `collectors_export.py` step, the Eleventy templates, the
`_data` loader, and a Vitest floor test. **No dbt contract change.**

### Audience anchor
The milestone's audience is **volunteer collectors**, not casual iNat observers.
Live data (dbt sandbox `occurrences.parquet`, 2026-06-25): 4,858 distinct
non-NULL logins, but **4,702 are casual observers** who only ever photographed a
bee (`source='inat_obs'` only). The gate (D-01) excludes them.

</domain>

<decisions>
## Implementation Decisions

### Page gate — who gets a page (D-01)
- **D-01:** Generate a page for every `collector_inat_login` that appears as a
  **collected specimen OR a sample host** — predicate:
  `collector_inat_login IS NOT NULL AND (ecdysis_id IS NOT NULL OR source = 'waba_sample')`.
  **124 pages today** (121 specimen-backed + 16 sample-host, 13 overlap).
- **D-02:** This is a **derived SQL gate in the export**, NOT a curated seed.
  It **resolves the live contradiction**: STATE.md `[v6.0 PAGE]` says "gate on
  `collector_identity.csv`, exclude casual observers," but Phase 167 **D-04
  killed that seed**. The intent (exclude casual observers) is preserved; the
  dead mechanism is replaced by the D-01 predicate. ROADMAP criterion 1/5's
  literal "every non-NULL login" (4,858, ~97% casual) is **superseded** by D-01 —
  downstream agents follow D-01 over the literal criterion where they conflict.

### Headline stats — PAGE-02 (D-03)
- **D-03:** Headline counts = **specimen count, sample count, species count**.
  Mirror `places_export.py` counting conventions where applicable:
  - specimen count = `COUNT(DISTINCT occ_id WHERE ecdysis_id IS NOT NULL)`
  - sample count = `COUNT(DISTINCT sample_id)`
  - species count = distinct species-rank taxa the collector has records for.
- **D-04:** Page **H1 = human display name with `@login` fallback** — the
  collector's human name when known (resolve from Ecdysis `recordedBy`; same
  intent as the frontend `CollectorEntry.displayName` "human name if known, else
  iNat username"), falling back to `@{inat_login}` when no name is on record.
  The export resolves the name per login.

### Pending-vs-identified status split — PAGE-03 (D-05, D-06, D-07)
- **D-05:** **Denominator = the collector's specimens** (Ecdysis-backed
  `ecdysis_id IS NOT NULL`, plus `source='waba_specimen'` not-yet-catalogued
  photo bees). Samples and casual observations are **excluded** from the split —
  they have no identification lifecycle. Reads e.g. *"82 identified to species,
  14 awaiting ID."*
- **D-06:** **"Identified" = a species-rank (or finer) determination exists** —
  keyed on **taxon rank = species / subspecies / variety / form**, regardless of
  *who* made the ID. Operator rationale: collectors often self-identify their own
  specimens; project staff only re-ID when a collector's ID was wrong. So the
  meaningful signal is "does a species-level ID exist," not who assigned it.
- **D-07:** **`id_date` is NOT the predicate for this split.** Phase 168 built
  `id_date` as the *formal Ecdysis determination date* — it stays the **Phase 171
  event-stream timestamp** ("when"). A specimen can carry a self-assigned species
  ID with no `id_date` and still counts as identified here. A specimen identified
  only to **genus or coarser counts as awaiting ID** (species is the bar).
  - *Implementation note:* the export must JOIN taxon rank (the dbt `taxa` /
    `higher_taxa` source — see `species_export.py`'s rank handling) onto the
    specimen rows; the mart carries only `taxon_id`, not rank (rank is
    JOIN-resolved per `src/filter.ts`).

### Index roster (D-08)
- **D-08:** Add `_pages/collectors.njk` — an index page listing every generated
  collector (name + headline counts, link to each `/collectors/{login}/`),
  **parallel to `_pages/places.njk`** (`/places.html`). Order: places-pattern
  default (alpha/pipeline order) is fine.

### Build-time page-count floor — criterion 5 (D-09)
- **D-09:** Enforce as a **Vitest test** asserting `collectors.json` length **≥ 100**,
  **parallel to `src/tests/data-places.test.ts`**. Runs in `npm test` / CI (the
  deploy gate). 124 today → ~20% headroom catches a real regression (broken join,
  bad gate) without tripping on normal collector churn. **Single layer** — not
  also duplicated in the python export.

### Map deep-link — criterion 4 / PAGE-04 (D-10, Claude's discretion + research flag)
- **D-10 (recommended default — user delegated this area):** Avoid adding a new
  `FilterState` dimension (per memory `project_filterstate_required_field_contract`,
  a new filter dimension is a heavy, required-field contract change touching every
  `FilterState` literal). Instead:
  1. `collectors.json` carries each collector's `recordedBy` + `host_inat_login`.
  2. The page deep-links via the **existing** `?collectors=` URL param
     (`url-state.ts` encodes entries as `recordedBy:host_inat_login`, `|`-joined),
     which the shipped collector filter already round-trips.
  - **RESEARCH FLAG (must resolve before implementing D-10):** A single
    `collector_inat_login` (the COALESCE of specimen/host/user login) may map to
    **more than one** `(recordedBy, host_inat_login)` pair, so a one-pair
    `?collectors=` value might not capture *all* of that collector's records.
    The researcher MUST verify coverage for real multi-pair collectors. **Fallback
    if coverage is incomplete:** add a clean `?collector={login}` param keyed on
    `collector_inat_login` (which requires threading `collector_inat_login` into
    the frontend `occurrences.db` / `OccurrenceRow` — currently NOT exposed, Phase
    167 was data-layer only). Either way, criterion 4 ("the map filter applies
    correctly") is the acceptance bar.

### Claude's Discretion
- Exact `collectors_export.py` SQL shape, occ_id reconstruction (reuse the
  Option-B `occ_id` CASE from `places_export.py` if specimen counting needs the
  bridge), and where the name-resolution join lives — planner's call, provided
  D-01/D-03/D-05/D-06 predicates hold.
- Page layout/styling (reuse `src/styles/places.css` or a new `collectors.css`),
  empty-state copy, whether headline counts show on the index — planner's call.
- The D-10 deep-link mechanism, subject to the research flag above.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase spec & decisions
- `.planning/ROADMAP.md` §"Phase 169" (lines 1665–1679) — goal + 5 success
  criteria. **Note:** criterion 1/5's literal "every non-NULL login" is
  superseded by D-01 (gate excludes casual observers).
- `.planning/REQUIREMENTS.md` — PAGE-01 (line 29), PAGE-02 (30), PAGE-03 (31),
  PAGE-04 (32)
- `.planning/STATE.md` §Decisions — `[v6.0 PAGE]` (line 74): the intent
  (exclude casual observers); its named `collector_identity.csv` mechanism is
  **dead** (Phase 167 D-04) and replaced by D-01.
- `.planning/phases/167-collector-identity-column/167-CONTEXT.md` — the
  `collector_inat_login` derivation + the D-04 seed rejection this phase honors.
- `.planning/phases/168-temporal-lifecycle-dates/168-CONTEXT.md` — why `id_date`
  exists (formal Ecdysis determination date / Phase 171 event stream), and why
  it is **not** the PAGE-03 predicate (D-07).

### Places pattern to mirror (the template for this phase)
- `data/places_export.py` — the export-step template (DuckDB over
  `occurrences.parquet` → `*.json` in `EXPORT_DIR`; occ_id reconstruction for
  the bridge; counts query). Build `data/collectors_export.py` after this shape.
- `_data/places.js` — the Eleventy data loader to mirror as `_data/collectors.js`
  (reads only the `.json`, never columnar files — keeps HMR sub-100ms).
- `_pages/place-detail.njk` — per-entity detail template (pagination over an
  array, `permalink`, map deep-link) → mirror as `_pages/collector-detail.njk`.
- `_pages/places.njk` — index roster template → mirror as `_pages/collectors.njk`.
- `src/tests/data-places.test.ts` — the data-shape Vitest test to mirror for the
  D-09 floor assertion.
- `eleventy.config.js` — Eleventy 3.x + Vite plugin wiring (no per-page config
  needed; pages live in `_pages/`).
- `run.py` (`data/run.py`) — STEPS list; add the `collectors_export` step (after
  dbt build, like `export_places_step`).

### Frontend filter (for the D-10 deep-link)
- `src/filter.ts` — `FilterState` (`selectedCollectors: CollectorEntry[]`),
  `CollectorEntry` (`displayName` / `recordedBy` / `host_inat_login`), and the
  filter-active predicates. **`collector_inat_login` is NOT in `OccurrenceRow`** —
  the frontend currently keys collector filtering on `recordedBy`/`host_inat_login`.
- `src/url-state.ts` (lines ~111–186) — `collectors=` param encode/decode
  (`recordedBy:host_inat_login`, `|`-joined). The deep-link target if D-10 holds.
- `src/bee-atlas.ts` (`_loadCollectorOptions`, ~line 927) — how collector options
  are derived in the SPA today (DISTINCT collectors).

### Domain vocabulary
- `CLAUDE.md` §"Domain Vocabulary" — Specimen vs Sample vs Observation vs
  Collection event; the five `int_combined` source arms.
- `docs/domain-model.md` — full occurrence data model.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `places_export.py` is a near-exact template — DuckDB over the ASSETS_DIR
  parquet, slug→record JSON, `EXPORT_DIR`/`DB_PATH` env-driven, registered as a
  zero-arg step in `run.py`. Clone its structure for `collectors_export.py`.
- The Option-B synthetic `occ_id` CASE in `places_export.py:_query_counts`
  (positionally coupled with `occIdFromRow` in `src/occurrence.ts`) is the
  pattern for distinct-specimen counting if the bridge is needed.
- `quantify` Eleventy filter (`src/lib/quantify.js`) for count-noun copy
  ("1 specimen" / "3 specimens"), already used in the place templates.
- `src/styles/places.css` — candidate stylesheet to reuse or fork.

### Established Patterns
- Static-page generation is **export-step → `_data` loader → `_pages` template**;
  the loader reads only the exported `.json` (Pitfall #8 — never columnar files —
  asserted by `data-places.test.ts`). Follow it exactly.
- Per-collector stats come from `occurrences.parquet` **read from `EXPORT_DIR`**
  (the dbt-build copy), NOT from the dbt sandbox (places_export Pitfall 5).
- `int_combined` 5-arm vocabulary: `ecdysis`, `waba_sample`, `waba_specimen`,
  `inat_obs`, `checklist` — the gate (D-01) and the status denominator (D-05)
  are expressed in these `source` values + `ecdysis_id`.

### Integration Points
- New file `public/data/collectors.json` (committed export artifact, like
  `places.json`); produced by the new `run.py` STEPS entry.
- `OccurrenceRow` / `src/occurrence.ts` — only touched if the D-10 research flag
  forces the `?collector={login}` fallback (threading `collector_inat_login`
  into the frontend). Default path (D-10) touches no SPA types.
- No dbt/contract change — this phase is downstream of the mart.

### Live data (dbt sandbox occurrences.parquet, 2026-06-25)
- 4,858 distinct non-NULL `collector_inat_login`; 4,702 casual-observer-only
  (excluded by D-01).
- D-01 gate = **124** today (121 specimen-backed + 16 sample-host) — the floor
  baseline for D-09 (≥ 100).
- Per source: `inat_obs` 4,766 logins, `ecdysis` 156, `waba_sample` 16,
  `waba_specimen` 1.

</code_context>

<specifics>
## Specific Ideas

- The status split's framing is the user's exact words: *"did my bees get
  IDed?"* — and "identified" means **identified to species**, with the operator
  note that self-IDs count (staff only re-ID when wrong). This is the load-bearing
  nuance that makes D-06/D-07 (taxon-rank predicate, not `id_date`) correct.
- Re-run the gate/floor sizing query against the **dbt-build** `occurrences.parquet`
  (in `EXPORT_DIR`, not the sandbox) at plan time if the 124 baseline needs
  refreshing — the committed `public/data/occurrences.parquet` is currently stale
  (lacks `collector_inat_login` until Phase 167's S3 landing; see memory
  `project_local_uat_stale_occurrences_db`).

</specifics>

<deferred>
## Deferred Ideas

- **Per-collector event stream** (collection→ID feed, `id_date` as the
  "Identified" timestamp, pagination) — **Phase 171**. `id_date` lives there, not
  in this phase's status count.
- **Accomplishment view** (county-coverage SVG map, taxonomic breadth, ecoregion
  breadth, active-seasons badge) — **Phase 172**.
- **`?collector={login}` filter keyed on `collector_inat_login`** (threading the
  unified column into the frontend) — only pulled forward into this phase **if**
  the D-10 research flag shows the existing `?collectors=` param can't fully
  capture a multi-pair collector. Otherwise a future-phase nicety.
- **Casual-observer pages** (the 4,702 excluded logins) — explicitly out of scope
  by D-01/D-02; not the milestone audience.

None of these are in scope for Phase 169.

</deferred>

---

*Phase: 169-per-collector-static-pages*
*Context gathered: 2026-06-25*
