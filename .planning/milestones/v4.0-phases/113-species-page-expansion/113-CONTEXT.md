# Phase 113: Species Page Expansion - Context

**Gathered:** 2026-05-24
**Status:** Ready for planning

<domain>
## Phase Boundary

Extend species pages to cover all 565 checklist species, including those with zero WABA occurrence records. Add county-presence SVG maps (county fills for checklist range, occurrence dots for WABA data), checklist attribution, and merge checklist month data into the seasonality histogram. No new routes or navigation structures — this phase deepens existing species/genus/subgenus pages with checklist data.

</domain>

<decisions>
## Implementation Decisions

### Genus and Subgenus Pages — Checklist-Only Species
- **D-01:** Checklist-only species (occurrence_count=0, on_checklist=true) appear in the **same species list** on genus and subgenus pages alongside WABA-recorded species. They are labeled with their checklist count (e.g., "14 checklist records") rather than "0 records".
- **D-02:** Genus SVG maps remain **occurrence-points only** — no county fills at the genus level. County fill maps appear only on species detail pages. (Checklist records have no lat/lon, so they cannot be added as occurrence dots at any level.)
- **D-03:** `genusList` and `subgenusList` construction in `_data/species.js` must be extended to include checklist-only species (currently filtered to `occurrence_count > 0`).

### SVG Map Design
- **D-04:** For species with checklist records, use a **single augmented SVG** in the existing image slot — county polygons filled light blue (#b0cfe8, fill-opacity:0.5) for counties where the species appears in the checklist, with WABA occurrence dots (existing red #c44) rendered on top.
- **D-05:** For checklist-only species (occurrence_count=0), the same augmented SVG is shown but with county fills only and no dots.
- **D-06:** The existing `species-detail.njk` image slot condition (currently `occurrence_count > 0`) must be extended to also show the SVG when `on_checklist` is true.
- **D-07:** `species_maps.py` is extended to read checklist county data from `checklist.parquet` and render county fills before occurrence dots. One SVG per species (same `<slug>.svg` filename), not a separate file.

### Attribution Display
- **D-08:** Checklist attribution is a **separate line** below the existing "N records · N counties · N ecoregions" metadata line. Shown only when `on_checklist` is true.
- **D-09:** Format: `N checklist records · <a href="https://jhr.pensoft.net/article/129013/">Bartholomew et al. 2024</a>`
- **D-10:** The "N" count requires a `checklist_count` field — this needs to be added to `species.parquet` (via `int_species_universe` or a separate CTE in `species.sql`). Planner decides exact placement in dbt.

### Seasonality Histogram
- **D-11:** Checklist month data is **merged into `month_histogram`** in dbt (in `int_species_universe`). A new `checklist_month_histogram` CTE aggregates `month` counts from `checklist.parquet` per canonical_name (NULL months skipped — ~15% of checklist records). Element-wise addition with the existing WABA `month_histogram`.
- **D-12:** Merge happens **in dbt** — not in a Python post-step. All downstream consumers get the merged histogram automatically.
- **D-13:** For checklist-only species where all checklist months are NULL (all-zero merged histogram), the `seasonality-viz` component shows the histogram with a **"Monthly phenology not recorded" note** rather than silently hiding it. Template or component change needed to display this note.

### Species Index Display
- **D-14:** Checklist-only species in the species index show a **"checklist only" badge** instead of "0 records". Badge appears in the `<span class="count">` slot.
- **D-15:** The "View N occurrences on the atlas →" link at the bottom of `species-detail.njk` is **hidden** when `occurrence_count` is 0. Checklist-only species have no occurrence points on the map.

### Claude's Discretion
- Exact dbt placement for `checklist_count` — new column in `int_species_universe` or a CTE in `species.sql`; planner decides what's cleanest.
- Color class naming for checklist county fills in `species_maps.py` STYLE_CSS — use `.checklist-county` or extend existing `.county` class with a modifier; planner decides.
- Whether `genusList` checklist count comes from reading `checklist.parquet` at build time or from a new field in `species.json` — planner decides based on build performance.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Requirements and Roadmap
- `.planning/ROADMAP.md` §Phase 113 — success criteria (SC-1 through SC-5); success criteria are the acceptance gate
- `.planning/REQUIREMENTS.md` §SPEC-01 through SPEC-05 — formal requirements for this phase

### Species Data Model
- `data/dbt/models/marts/species.sql` — 18-column species mart (19 after Python slug post-step); `on_checklist` boolean and `month_histogram` are the key fields for this phase
- `data/dbt/models/intermediate/int_species_universe.sql` — FULL OUTER JOIN of checklist + occurrences; `month_histogram` is built here from WABA data only (must be extended)
- `data/dbt/models/intermediate/int_species_occurrences_agg.sql` — WABA month histogram CTE pattern to replicate for checklist
- `data/dbt/models/marts/checklist.sql` — checklist mart schema: `canonical_name, scientificName, genus, specific_epithet, family, lat (NULL), lon (NULL), year, month, county, ecoregion_l3, source='checklist'`

### Existing SVG Pipeline
- `data/species_maps.py` — existing SVG generation; reads `species.parquet` and `occurrences` table; must be extended to also read `checklist.parquet` for county fills; key patterns: STYLE_CSS, VIEWBOX, `_project()`, `_ring_to_path()`

### Eleventy Data and Templates
- `_data/species.js` — builds `speciesList`, `genusList`, `subgenusList`; `genusList`/`subgenusList` filter to `occurrence_count > 0` (D-03 fix here)
- `_pages/species-detail.njk` — species detail template; SVG image slot condition, metadata line, attribution line, atlas link (D-06, D-08, D-15 changes here)
- `_pages/genus.njk` — genus page template; species list rendering (D-01 change here)
- `_pages/subgenus.njk` — subgenus page template; same checklist-species change as genus
- `_pages/species.njk` — species index; checklist badge for checklist-only species (D-14 change here)

### Citation
- Bartholomew et al. 2024: `https://jhr.pensoft.net/article/129013/`

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `species_maps.py` `_load_county_geojsons()` — already loads WA county polygons; reuse for checklist county fill rendering
- `species_maps.py` `_ring_to_path()` and `_project()` — SVG coordinate projection; county fill paths use the same functions
- `species_maps.py` STYLE_CSS — add `.checklist-county { fill: #b0cfe8; fill-opacity: 0.5; stroke: #888; stroke-width: 0.5; }` class (D-04)
- `int_species_occurrences_agg.sql` — 12-element `list_value(SUM(CASE WHEN month = N)...)` pattern; replicate for checklist month histogram

### Established Patterns
- SVG rendering order: draw county backdrops first, then checklist fills, then occurrence dots — ensures dots always appear on top of fills
- `genusList` color index computation in `_data/species.js` uses `occurrence_count > 0` members for color assignment; checklist-only species have no occurrence-based color — they should receive a neutral color (e.g., `#aaaaaa`) analogous to the existing unresolved-species handling
- dbt FULL OUTER JOIN pattern in `int_species_universe` — checklist_month_histogram CTE must handle species absent from checklist (NULL → `[0]*12`)
- `month_histogram` NULL backfill uses `CASE` not `COALESCE` (DuckDB INTEGER[] COALESCE unimplemented in 1.4.x)

### Integration Points
- `species.parquet` → `_data/species.js` → `genusList`/`speciesList`: checklist_count field added in dbt flows here automatically
- `checklist.parquet` → `species_maps.py`: new read path for county fill data
- `month_histogram` in `species.parquet` → `seasonality-viz` web component: merged histogram flows through unchanged

</code_context>

<specifics>
## Specific Ideas

- Attribution URL confirmed: `https://jhr.pensoft.net/article/129013/`
- County fill color confirmed: `#b0cfe8` (light blue), `fill-opacity: 0.5` — clearly distinct from red (#c44) occurrence dots against the #f4f4f0 county backdrop
- "Monthly phenology not recorded" note for all-zero histograms: need a way for `seasonality-viz` to receive this signal (all-zero histogram + on_checklist=true implies data gap, not truly zero observations)

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---

*Phase: 113-species-page-expansion*
*Context gathered: 2026-05-24*
