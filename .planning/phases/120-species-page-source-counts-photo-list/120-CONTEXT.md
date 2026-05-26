# Phase 120: Species Page Source Counts & Photo List - Context

**Gathered:** 2026-05-26
**Status:** Ready for planning

<domain>
## Phase Boundary

Update species/genus/subgenus/tribe page count labels to show source-aware breakdowns ("N specimens · N community observations") using `specimen_count` and `inat_obs_count` already in `species.json`. Produce a new `photos.json` artifact (keyed by canonical_name, CC-licensed iNat obs photos) written by `species_export.py` and published to CloudFront alongside `species.json`. No new pipeline steps, no changes to `species.parquet` schema, no UI for photos this milestone.

</domain>

<decisions>
## Implementation Decisions

### SPE-01: Species-Detail Count Label
- **D-01:** Replace the single `{{ sp.occurrence_count }} records` on `species-detail.njk:41` with `{{ sp.specimen_count }} specimens · {{ sp.inat_obs_count }} community observations`.
- **D-02:** Both `specimen_count` and `inat_obs_count` are already in `species.json` — no data change needed.

### SPE-02: Genus / Subgenus / Tribe Count Labels
- **D-03:** `genus.njk` and `subgenus.njk` per-species entry `<span class="count">` changes from "N records" to `N specimens · N community observations` when `sp.occurrence_count > 0` (checklist-only branch stays "N checklist records").
- **D-04:** SPE-02 **applies to tribe.njk genus entries** as well. `tribe.njk` currently shows `{{ g.occurrence_count }} records` per genus — this changes to `N specimens · N community observations` using the same label format.
- **D-05:** `tribeList` construction in `_data/species.js` must be extended to aggregate `specimen_count` and `inat_obs_count` per genus (sum over all species in the genus for that tribe), in addition to the existing `occurrence_count` sum.

### SPE-03: Photo List
- **D-06:** `inat_obs_photos` does NOT go into `species.json` or `species.parquet`. A separate `photos.json` file is produced instead.
- **D-07:** `photos.json` structure: `{ "Andrena accepta": [{ "url": "...", "license": "..." }, ...], ... }` — keyed by `canonical_name`, values are lists of `{ url, license }` objects.
- **D-08:** Only CC-licensed photos are included — filter `inat_obs_data.observations` to rows where `license IS NOT NULL AND license != 'all rights reserved'`.
- **D-09:** Written **inside `species_export.py`** (not a new pipeline step) using the same DuckDB connection. Written to `public/data/photos.json` (same directory as `species.json`).
- **D-10:** Published via `nightly.sh` hashed-upload pattern, same as `species.json` and `checklist.parquet`.

### Atlas Link Update
- **D-11:** "View N occurrences on the atlas →" becomes **"View N records on the atlas →"** where N = `occurrence_count + inat_obs_count`. Wording changes from "occurrences" to "records" since the count now spans WABA+Ecdysis+iNat sources.
- **D-12:** Template change in `species-detail.njk` — compute the sum or use a combined value. Since this is a Nunjucks template, either pre-compute in `_data/species.js` as a new `total_records` field, or inline as `{{ sp.occurrence_count + sp.inat_obs_count }}` if Nunjucks supports arithmetic (it does).

### Claude's Discretion
- Exact Nunjucks arithmetic syntax for `occurrence_count + inat_obs_count` in the atlas link (inline addition vs a pre-computed field in `_data/species.js`).
- `tribeList` aggregation: whether `specimen_count`/`inat_obs_count` per genus is computed inline during `buildTree()` or in a separate `tribeList`-building pass.
- `photos.json` sort order within each species list (by `obs_id` or arbitrary — doesn't matter for a data-storage-only artifact).
- Exact DuckDB query for CC-license filtering — planner identifies which license string values `inat_obs_data.observations` contains and filters accordingly.
- Whether `nightly.sh` manifest key for `photos.json` is `"photos"` (consistent naming convention with other artifacts).

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Requirements and Roadmap
- `.planning/ROADMAP.md` §Phase 120 — goal, success criteria (SC-1 through SC-3); acceptance gate
- `.planning/REQUIREMENTS.md` §SPE-01, SPE-02, SPE-03 — formal requirements for this phase

### Templates to Modify (SPE-01, SPE-02)
- `_pages/species-detail.njk` — species detail template; lines 41 (metadata/count) and 45-46 (atlas link); D-01, D-11/D-12 changes here
- `_pages/genus.njk` — genus template; per-species count span at lines 27-32; D-03 change here
- `_pages/subgenus.njk` — subgenus template; per-species count span at lines 28-33; D-03 change here
- `_pages/tribe.njk` — tribe template; per-genus count span at line 26; D-04 change here

### Data Layer (SPE-02 tribe aggregation, SPE-03 photos)
- `_data/species.js` — `tribeList` construction; lines ~230-250 where `occurrence_count` is summed per genus; D-05 requires adding `specimen_count`/`inat_obs_count` sums
- `data/species_export.py` — `build_species()` function (lines 83+); D-09 requires adding photos.json write alongside species.json at line 192+
- `data/nightly.sh` — hashed-upload pattern and manifest.json construction; D-10 requires adding `photos.json` upload and manifest entry

### Data Sources
- `inat_obs_data.observations` (DuckDB table) — source for `photos.json`; columns `canonical_name`, `image_url`, `license`; queried directly in `species_export.py`
- `public/data/species.json` — already contains `specimen_count` and `inat_obs_count` per species (confirmed in production); no changes needed

### Prior Phase Context (patterns to follow)
- `.planning/phases/113-species-page-expansion/113-CONTEXT.md` — D-08/D-09 checklist attribution format; D-03 genusList checklist-only species pattern; established the species-detail metadata line format
- `data/checklist_pipeline.py` — pattern for reading DuckDB tables in species_export.py context

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `_data/species.js` `buildTree()` / `genusList` construction — already aggregates `occurrence_count` per genus using `.reduce(...)`; extend to sum `specimen_count` and `inat_obs_count` using the same reduce pattern
- `species_export.py` DuckDB connection (`con`) — already open and connected to `beeatlas.duckdb` in `build_species()`; query `inat_obs_data.observations` directly in the same function
- `nightly.sh` `_upload_hashed()` function — copy exact pattern from `checklist.parquet` or `species.json` upload for `photos.json`

### Established Patterns
- Nunjucks arithmetic: `{{ sp.occurrence_count + sp.inat_obs_count }}` works natively — no helper needed
- Genus.njk / subgenus.njk count branch: `{%- if sp.occurrence_count > 0 -%}` / `{%- elif sp.on_checklist -%}` / `{%- else -%}` — D-03 updates the `occurrence_count > 0` branch only
- `species.json` is written with `sort_keys=True, indent=2` for idempotency — `photos.json` should follow the same convention
- `manifest.json` key naming: lowercase snake_case matching parquet/json filename stem (e.g., `"species"` → `species-<hash>.json`, `"checklist"` → `checklist-<hash>.parquet`)

### Integration Points
- `species.json` already in `public/data/` → `_data/species.js` reads it at build time; `specimen_count` and `inat_obs_count` are already exposed to all templates
- `photos.json` will be at `public/data/photos.json` → no Eleventy consumer this milestone (future carousel only); just needs to be uploaded to CloudFront
- `tribeList` in `_data/species.js` feeds `_pages/tribe.njk` via `species.tribeList` — adding `specimen_count`/`inat_obs_count` per genus flows directly to the template

</code_context>

<specifics>
## Specific Ideas

- Atlas link wording: "View N records on the atlas →" (not "occurrences") since N spans all three sources
- Photos.json is data-only this milestone — no template change, no frontend consumer
- iNat obs URL pattern for any needed reference: `https://www.inaturalist.org/observations/{obs_id}`

</specifics>

<deferred>
## Deferred Ideas

- **Photo carousel UI (SPE-F01)** — `photos.json` stored now; carousel display is a future milestone
- **Atlas link filter pre-selection** — clicking "View N records" could pre-apply source filters matching the species page context; deferred, separate UX feature

</deferred>

---

*Phase: 120-species-page-source-counts-photo-list*
*Context gathered: 2026-05-26*
