# Architecture Research: v6.0 My Work — Progress & Provenance

**Domain:** Static web app + dbt pipeline integration
**Researched:** 2026-06-24
**Confidence:** HIGH (grounded in actual source files read)

## Integration Analysis

This document answers four concrete questions about integrating v6.0 features into the existing
architecture. Every claim is grounded in the files read: `int_combined.sql`, `occurrences.sql`,
`filter.ts`, `style.ts`, `bee-occurrence-detail.ts`, `occurrence.ts`, `occurrence_places.sql`,
`sqlite_export.py`, `schema.yml`, and the static page templates.

---

## (a) Collector Identity: Where It Lives and How to Key It

### Current collector fields across the five ARMs

Collector identity is split across four separate fields in `int_combined` that flow into the
`occurrences` mart:

| Field | ARM(s) present | Meaning |
|-------|---------------|---------|
| `recordedBy` | ARM 1 (ecdysis), ARM 5 (checklist) | Ecdysis free-text string, e.g. "Abrahamsen, Peter" |
| `host_inat_login` | ARM 1 (via `int_samples_base`), ARM 2 (waba_sample via `obs.user__login`) | iNat handle of the person who posted the sample/floral-host observation |
| `user_login` | ARM 4 (inat_obs) | iNat handle of the expert observer |
| `specimen_inat_login` | ARM 1 (via `int_specimen_obs_base`), ARM 3 (waba_specimen) | iNat handle of the WABA collector who photo-documented the specimen |

**Critical finding:** `specimen_inat_login` is present in `int_combined` (carried from
`int_specimen_obs_base`) but is **NOT** projected into the `occurrences` mart SELECT and does not
appear in `schema.yml`. It is invisible to the frontend. This is the key identity field for WABA
collectors (who photograph their bees in iNat before Ecdysis upload), and it covers ARM 1 (ecdysis
specimens linked to a specimen observation) and ARM 3 (waba_specimen — the ~33 specimens awaiting
Ecdysis upload).

**Current filter integration:** `filter.ts` `buildFilterSQL()` handles the split via a
`CollectorEntry` type carrying both `recordedBy` and `host_inat_login`, with an OR clause in SQL.
But it misses `specimen_inat_login` (ARM 1/3) and `user_login` (ARM 4 — expert iNat observers,
not WABA collectors).

### Identity gaps and normalization strategy

For a WABA collector like `@rainhead`:
- Ecdysis specimens appear under `recordedBy` = "Abrahamsen, Peter" AND under `host_inat_login` =
  "rainhead" (via the sample's plant observation in ARM 1)
- waba_specimen rows (ARM 3) carry `specimen_inat_login` = "rainhead" — currently dropped from the mart
- There is no single normalized "collector identity" column

**Recommendation: add a `collector_inat_login` derived column to `int_combined` and the mart.**

```sql
COALESCE(
  sob.specimen_inat_login,   -- ARM 1, ARM 3: WABA collector's iNat handle (highest priority)
  s.host_inat_login,         -- ARM 1 (via sample), ARM 2: sample observer's handle
  io.user_login              -- ARM 4: expert observer's handle
) AS collector_inat_login
```

The slug for per-collector pages is the iNat handle (`collector_inat_login`): URL-safe, already in
use in `url-state.ts` via the `collectors=` param, unique in the iNat namespace. `recordedBy` is
retained as a display label for Ecdysis-backed rows where `collector_inat_login` is NULL (historical
museum specimens in checklist ARM 5).

The `recordedBy` ↔ `inat_login` linkage for WABA collectors is implicitly established when both are
non-null on the same `ecdysis` ARM 1 row (a catalogued specimen that also has a sample observation).
No separate identity seed is needed for MVP.

**dbt contract impact:** adds one VARCHAR column `collector_inat_login` to `schema.yml` (36 → 37
cols). Apply the data-before-code release sequence.

---

## (b) Temporal Status History: Mechanism Recommendation

### The snapshot problem

The nightly pipeline emits a complete snapshot of `int_combined`. No change log exists. The
`modified` field (VARCHAR, Ecdysis only, sourced from `int_id_modified`) records the last edit
date of an Ecdysis identification. No `first_appeared` or `first_seen_date` timestamp exists for
any row. For waba_sample/waba_specimen/inat_obs/checklist rows, there is no pipeline-level date
representing "when this occurrence first entered the atlas."

### Three candidate approaches

**Option 1 — Pipeline-maintained append-only snapshot-diff event table**

After each nightly run, compare the new snapshot against yesterday's parquet (already pulled for
`test_dbt_diff`). Emit a `occurrence_events.parquet` CDN artifact with rows like:
```
(occ_id, event_type, event_date, prior_taxon_id, new_taxon_id)
```
Shipped to CDN alongside `occurrences.db`, loaded by the collector page frontend.

Pros: shareable, supports the community feed in a later milestone, authoritative. Cons:
indefinitely growing artifact, requires a second CDN file loaded by every collector page, adds
pipeline complexity.

**Option 2 — Client `localStorage` "last seen" watermark only**

The frontend stores the last-loaded DB generation date in `localStorage`. On load, it diffs the
current snapshot to surface "new since last visit" using only the `modified` field (available only
for ecdysis rows) and occurrence existence.

Cons: truly device-local (no cross-device portability), a fresh device shows everything as new,
and `modified` doesn't exist for non-Ecdysis rows so most of the event stream is uncomputable.

**Option 3 — Hybrid: `first_seen_date` column in the pipeline + client watermark**

The pipeline adds two new VARCHAR columns to the `occurrences` mart:
- `first_seen_date` — the nightly-run date when this `occ_id` first appeared in the atlas. On each
  nightly run, `first_seen_date = COALESCE(yesterday.first_seen_date, TODAY())` (computed by
  DuckDB JOIN against yesterday's parquet pulled from S3).
- `id_date` — the date this occurrence first had a species identification. For ecdysis rows this
  is derivable from `modified` when `taxon_id` changed from NULL. For others it approximates as
  `first_seen_date` when `taxon_id IS NOT NULL`.

The client uses a `localStorage` watermark (the DB generation date of the last visit) to filter
events: show rows where `first_seen_date > watermark`. A fresh device with no watermark shows the
last 30 days.

### Recommendation: Option 3 (hybrid)

**Why:** `first_seen_date` makes the event stream deterministic and portable — the same result
appears on any device for the same watermark. The computation reuses an S3 artifact (yesterday's
parquet) that is already pulled for `test_dbt_diff`. No new CDN file is needed; the two new columns
ride in `occurrences.db`. The event log (Option 1) is reserved for the community feed milestone.

**Implementation:** In `nightly.sh` / `run.py`, after the S3 pull of yesterday's parquet, add a
DuckDB step:
```sql
SELECT
  new.*,
  COALESCE(old.first_seen_date, strftime(CURRENT_DATE, '%Y-%m-%d')) AS first_seen_date,
  -- id_date: date taxon_id first became non-null (approximation for non-ecdysis)
  CASE
    WHEN new.taxon_id IS NOT NULL AND (old.taxon_id IS NULL OR old.first_seen_date IS NULL)
      THEN strftime(CURRENT_DATE, '%Y-%m-%d')
    ELSE old.id_date
  END AS id_date
FROM new_occurrences new
LEFT JOIN yesterday_occurrences old USING (occ_id)
```

**dbt contract impact:** adds `first_seen_date` VARCHAR and `id_date` VARCHAR to `schema.yml`
(37 → 39 cols after Phase 1). These are computed after `dbt build` completes, as a post-dbt step
in `run.py`, before `sqlite_export.py` reads the final parquet. This avoids complicating the dbt
model itself with pipeline-date logic.

**Release sequence:** data-before-code applies (project memory `project_occurrences_contract_release_sequence`). Ship the new columns in one nightly run before the frontend JS that reads them.

---

## (c) Facets: How to Model Them

### What "facets" means in v6.0

The current `source` enum (`ecdysis | waba_sample | waba_specimen | inat_obs | checklist`) is
mutually exclusive. The three consumers are:
1. `src/filter.ts` — `hiddenSources` in `FilterState`; `VALID_SOURCES` allowlist; `o.source IN
   (...)` SQL clause; `SourceKey` type (also in `url-state.ts`)
2. `src/style.ts` — `_occurrencePointPaint()` uses `['match', ['get', 'source'], 'checklist',
   '#2c7a2c', ...]` on GeoJSON feature property
3. `src/bee-occurrence-detail.ts` — detail card branches on source to select the correct fields
   and template

The v6.0 goal is to replace mutually-exclusive source filtering with orthogonal facets. The
proposed dimensions are: provenance tier (how was this documented?), identification status, and
collector identity. Time, taxon, and place are already orthogonal filter dimensions.

### Three modeling options

**Option A — Derived columns in the occurrences mart**

Add computed boolean/enum columns: `provenance_tier` (enum: 'physical_specimen' | 'photo_observation' | 'expert_inat' | 'museum_record'), `is_identified` (`taxon_id IS NOT NULL`). All are derivable from existing columns without data loss.

Widens the mart contract (adds to the 36-col base) but requires no JOIN at query time.

**Option B — Separate facets bridge**

A new `occurrence_facets.parquet` with one row per (occ_id, facet_key, facet_value). Arbitrary extensibility at the cost of SQL JOIN overhead on every query. Not justified for a fixed, known set of orthogonal booleans.

**Option C — Computed query-time in the frontend**

Derive facet predicates from existing `OccurrenceRow` fields in the frontend SQL. `ecdysis_id IS
NOT NULL` is already available in the mart. A "provenance tier" filter can be expressed as a SQL
CASE clause over existing columns without any new mart columns.

### Recommendation: Option C for filter SQL, Option C also for GeoJSON properties

**Filter layer:** Replace `hiddenSources` → a `hiddenProvenanceTiers` set in `FilterState`. The
SQL clause maps tiers to existing column predicates:

```sql
-- provenance_tier derivation (inline in buildFilterSQL)
CASE
  WHEN ecdysis_id IS NOT NULL THEN 'physical_specimen'
  WHEN source IN ('waba_specimen', 'waba_sample') THEN 'photo_observation'
  WHEN source = 'inat_obs' THEN 'expert_inat'
  WHEN source = 'checklist' THEN 'museum_record'
END
```

No new mart column needed. The mapping is a constant in `filter.ts`.

**Map symbology layer:** `queryVisibleGeoJSON` in `filter.ts` constructs the GeoJSON features.
Currently it embeds `source` as a feature property. Switch to embedding a computed
`provenance_tier` string derived from the same CASE at GeoJSON construction time. `style.ts`
`_occurrencePointPaint` then uses `['get', 'provenance_tier']` instead of `['get', 'source']`.

**Detail card layer:** `bee-occurrence-detail.ts` can continue branching on the raw `source`
field from `OccurrenceRow` for precise field rendering — source is still in the mart and the row.
The detail card does not need to change its branching logic just because the filter UI uses tiers.

**No new mart columns needed for facets.** The mart `source` column is retained as the raw
discriminator. Facet logic lives entirely in the frontend as pure derivations from existing data.

### URL contract impact

`SourceKey` in `url-state.ts` currently lists the raw source enum values. If filtering switches
to provenance tiers, `SourceKey` becomes `ProvenanceTierKey` and the `src=` URL param changes to
`tier=`. This is a URL breaking change — needs legacy fallback parsing for existing bookmarks
that use `src=ecdysis` etc.

### Impact on the three source consumers (summary)

| Consumer | Change |
|----------|--------|
| `filter.ts` | `hiddenSources: Set<SourceKey>` → `hiddenProvenanceTiers: Set<ProvenanceTierKey>`; SQL clause becomes CASE-based; `OccurrenceRow` unchanged |
| `style.ts` | `_occurrencePointPaint` match expression switches from `source` to `provenance_tier` GeoJSON feature property |
| `bee-occurrence-detail.ts` | No change to source-based branching; detail rendering remains source-aware |
| `url-state.ts` | `SourceKey` → `ProvenanceTierKey`; `src=` → `tier=` with legacy fallback |

---

## (d) Build Order

### Dependency graph

```
Phase 1: collector_inat_login in mart (dbt contract 36→37)
    │
    ├─→ Phase 3: collectors.json export artifact + Eleventy data
    │       │
    │       └─→ Phase 4: collector-detail.njk static pages
    │
Phase 2: first_seen_date + id_date in mart (contract 37→39, after Phase 1)
    │
    └─→ Phase 6: event stream frontend (gated on Phase 5 too)

Phase 5: source → facets rebuild (filter.ts + style.ts + url-state.ts)
    │     (can start after Phase 1; independent of Phase 2)
    │
    └─→ Phase 6: event stream frontend (provenance rendering uses tiers)
            │
            └─→ Phase 7: accomplishment view (coverage map, breadth, badges)
```

### Recommended build order

**Phase 1 — Collector identity column in the mart**
Add `collector_inat_login` (VARCHAR) to `int_combined` (COALESCE of `specimen_inat_login`,
`host_inat_login`, `user_login`) and project it into `occurrences.sql`. Add to `schema.yml` (36 →
37 cols). This is a dbt contract change — apply data-before-code release sequence.

**Phase 2 — Temporal columns in the mart**
Add `first_seen_date` and `id_date` (VARCHAR) as post-dbt pipeline steps in `run.py`. Add to
`schema.yml` (37 → 39 cols). This is a second contract change — ship separately from Phase 1 to
avoid a double-gated release. `sqlite_export.py` picks up the new columns automatically (it reads
the full parquet schema; no positional coupling on columns added to the end).

**Phase 3 — `collectors.json` export artifact**
Add `generate_collectors()` step to `export.py`/`run.py` producing `public/data/collectors.json`:
array of collector records keyed on `collector_inat_login` (slug), with display name, occurrence
count, year range, species count. Follows the `places.json` pattern. Add `_data/collectors.js`
Eleventy data module reading it (mirrors `_data/places.js`). No dbt contract change.

**Phase 4 — Per-collector static pages (Eleventy)**
Add `_pages/collector-detail.njk` following `place-detail.njk`. Permalink:
`/collectors/{inat_login}/`. Page shows static stats and a filtered-map link using the existing
`collectors=inat_login:handle` URL param (already implemented in `url-state.ts`). No frontend JS
changes. Gated on Phase 3.

**Phase 5 — Source → facets rebuild (filter + style + URL)**
Refactor the three `source` consumers atomically. This is the highest-risk change: it touches
`FilterState` (all callers must update — project memory `project_filterstate_required_field_contract`
applies), the GeoJSON feature property schema, and the URL state contract. Do it in a single atomic
phase to avoid a half-refactored state. Include legacy `src=` → `tier=` fallback in `parseParams`.
Can start after Phase 1; independent of Phase 2.

**Phase 6 — Per-collector event stream (frontend)**
Add event stream query to `filter.ts` / the collector page: for a given `collector_inat_login`,
fetch their occurrences ordered by `first_seen_date DESC`, render as a chronological feed. Gated
on Phase 2 (temporal columns in mart) and Phase 5 (provenance tiers for rendering). This is a
new frontend component (`<bee-collector>` coordinator or a simpler entry-level page component).

**Phase 7 — Accomplishment view (frontend)**
County coverage map (choropleth), taxonomic breadth, derivable badges (years active, species count).
Gated on Phase 4 (collector page exists) and Phase 6 (event stream renders).

### Summary table

| Phase | Primary change | dbt contract? | Static hosting safe? | Gated on |
|-------|---------------|---------------|----------------------|----------|
| 1 | `collector_inat_login` in mart | YES (36→37) | Yes | — |
| 2 | `first_seen_date`, `id_date` in mart | YES (37→39) | Yes | Phase 1 |
| 3 | `collectors.json` + Eleventy data | No | Yes | Phase 1 |
| 4 | `collector-detail.njk` static pages | No | Yes | Phase 3 |
| 5 | Source → facets rebuild | No | Yes | Phase 1 (conceptually) |
| 6 | Event stream frontend | No | Yes | Phases 2, 5 |
| 7 | Accomplishment view | No | Yes | Phases 4, 6 |

---

## Component Boundaries

### New vs. modified components

**New:**
- `data/export.py` — `generate_collectors()` step producing `collectors.json`
- `_data/collectors.js` — Eleventy data module (mirrors `places.js`)
- `_pages/collector-detail.njk` — static page template (mirrors `place-detail.njk`)
- `src/entries/collector.ts` (if interactive) — Vite entry for collector page JS
- New `<bee-collector>` coordinator element (if the collector page needs reactive state beyond
  static HTML)

**Modified:**
- `data/dbt/models/intermediate/int_combined.sql` — add `collector_inat_login` COALESCE to all five ARMs
- `data/dbt/models/marts/occurrences.sql` — project `collector_inat_login` in SELECT
- `data/dbt/models/marts/schema.yml` — add `collector_inat_login`, `first_seen_date`, `id_date`
- `data/run.py` — add temporal column computation step (post-dbt, pre-sqlite-export)
- `src/filter.ts` — `FilterState.hiddenSources` → `hiddenProvenanceTiers`; collector SQL clause
  gains `collector_inat_login`; `OccurrenceRow` adds three new fields
- `src/style.ts` — `_occurrencePointPaint` switches `['get', 'source']` → `['get', 'provenance_tier']`
- `src/bee-occurrence-detail.ts` — minor: adapt any source-tier display if needed
- `src/url-state.ts` — `SourceKey` type renamed; `src=` param → `tier=` with legacy fallback

### State ownership invariant (unchanged)

The invariant is unaffected. The per-collector static page is an Eleventy-rendered HTML page with
no coordinator needed for the static content. If an interactive event stream is added, it follows
the `<bee-atlas>` ownership pattern: a new `<bee-collector>` coordinator owns all reactive state,
and any sub-components are pure presenters.

### occ_id positional coupling (unaffected)

The `collector_inat_login` addition, the temporal columns, and the facets rebuild do NOT touch the
occ_id CASE expression. No change to the three positionally-coupled files (`src/occurrence.ts`,
`src/filter.ts` `OCC_ID_SQL_CASE`, `data/dbt/models/marts/occurrence_places.sql`).

---

## Architecture Patterns to Follow

### Pattern 1: Static page from Eleventy data module

`_data/places.js` reads `places.json` (written by pipeline). `_pages/place-detail.njk` paginates
over `places.placesArray`. The collector page follows this pattern exactly:
- `export.py` writes `collectors.json`
- `_data/collectors.js` reads it, exports `{ collectorsArray }`
- `_pages/collector-detail.njk` paginates over `collectors.collectorsArray`
- Permalink: `/collectors/{inat_login}/`

### Pattern 2: Filtered map deep-link from static page

Existing static pages link to the SPA with filter params: `/?place=slug`, `/?taxon=12345`. The
collector page uses the already-wired `collectors=` URL param. In `url-state.ts`, the `collectors`
param encodes a `|`-separated list of `recordedBy:NAME` or `inat_login:HANDLE` entries. The
collector page links to `/?collectors=inat_login:rainhead`. No new URL param needed.

### Pattern 3: Bridge mart for many-to-many

`occurrence_places.sql` is the canonical pattern. A new `occurrence_collector` bridge is NOT
needed — collector identity is a scalar (`collector_inat_login`) directly on the occurrence row.

---

## Anti-Patterns to Avoid

### Anti-Pattern 1: Adding a full event log to occurrences.db

An append-only event log that grows with each nightly run will bloat `occurrences.db` (currently
22.9 MB compressed). The `first_seen_date` + client watermark approach bounds DB size growth to
two VARCHAR columns per row. The event log as a separate CDN artifact is reserved for the
community feed milestone.

### Anti-Pattern 2: Partial facets refactor across phases

The three `source` consumers are tightly coupled. Changing `filter.ts` without updating
`style.ts` leaves the map rendering on `source` while the filter uses `provenance_tier` — a
half-refactored state that breaks the map layer. Phase 5 must be atomic: all three consumers
switch in one commit, with the URL param backward-compat in the same diff.

### Anti-Pattern 3: Adding `specimen_inat_login` directly to `OccurrenceRow` without routing through the mart

`specimen_inat_login` is currently in `int_combined` but NOT projected into `occurrences`. Adding
it to `OccurrenceRow` without a mart + schema.yml change would produce a column that is NULL
everywhere (it simply would not exist in the SQLite export). The correct path is: add to mart
SELECT → add to `schema.yml` → add to `OCCURRENCE_COLUMNS` in `filter.ts` → add to `OccurrenceRow`.
The unified `collector_inat_login` approach (coalescing all three iNat identity fields) is cleaner
than exposing the raw `specimen_inat_login` directly.

### Anti-Pattern 4: Per-collector pages requiring auth

The milestone explicitly requires no auth, public data, static hosting. The collector page is
identified by the iNat handle in the URL. Self-identification (visiting your own page) requires no
login — collectors bookmark `beeatlas.net/collectors/rainhead/`.

### Anti-Pattern 5: FilterState partial update (per project memory `project_filterstate_required_field_contract`)

When adding or renaming a FilterState field (hiddenSources → hiddenProvenanceTiers), every literal
construction of FilterState — including the `bee-map.ts` default literal — must be updated. Run
`tsc --noEmit` as the post-merge gate, not file-by-file byte checks.

---

## Scalability Considerations

| Concern | Current (v5.2) | v6.0 impact |
|---------|----------------|-------------|
| `occurrences.db` size | 22.9 MB compressed | +3 VARCHAR cols ≈ +4–5%; within budget |
| `collectors.json` artifact | Does not exist | ~5–20 KB (estimate: ~50–100 WABA collectors) |
| Per-collector static pages | 0 | ~50–100 pages at build time; negligible vs 600+ species pages |
| Nightly runtime | S3 pull already done for `test_dbt_diff` | Previous parquet reuse; one DuckDB JOIN step added |
| `first_seen_date` history correctness | N/A | Bootstrapped on first run: all existing rows get TODAY; future runs correctly carry forward |

---

## Sources

All findings are grounded directly in the codebase files read for this research. No external web
searches were required — the architecture questions are about integrating with the existing system.

- `data/dbt/models/intermediate/int_combined.sql` — five ARM structure, all collector fields confirmed
- `data/dbt/models/marts/occurrences.sql` — mart SELECT (confirmed `specimen_inat_login` absence)
- `data/dbt/models/marts/schema.yml` — authoritative 36-column dbt contract
- `data/dbt/models/marts/occurrence_places.sql` — bridge mart pattern; occ_id positional coupling documented
- `src/filter.ts` — `FilterState`, `CollectorEntry`, `buildFilterSQL`, `OccurrenceRow`, `OCC_ID_SQL_CASE`, `OCCURRENCE_COLUMNS`
- `src/occurrence.ts` — `occIdFromRow`, `isSpecimenBacked`, positional coupling documentation
- `src/style.ts` — `_occurrencePointPaint` source match expression
- `src/bee-occurrence-detail.ts` — detail card source branching pattern
- `src/url-state.ts` — `SourceKey`, `VALID_SOURCES`, `collectors=` URL param encoding
- `_data/places.js` — Eleventy data module pattern to follow
- `_pages/place-detail.njk` — static page template pattern to follow
- `docs/domain-model.md` — occ_id positional coupling; five ARM definitions; `is_provisional` semantics

---

*Architecture research for: v6.0 My Work — Progress & Provenance*
*Researched: 2026-06-24*
