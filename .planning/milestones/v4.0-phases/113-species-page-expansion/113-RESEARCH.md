# Phase 113: Species Page Expansion — Research

**Researched:** 2026-05-24
**Domain:** dbt SQL, Python SVG generation, Eleventy/Nunjucks templates, Lit Web Components
**Confidence:** HIGH — all findings verified against production source files in this repo

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**D-01:** Checklist-only species (occurrence_count=0, on_checklist=true) appear in the **same species list** on genus and subgenus pages alongside WABA-recorded species. Labeled with checklist count (e.g., "14 checklist records") rather than "0 records".

**D-02:** Genus SVG maps remain **occurrence-points only**. County fill maps appear only on species detail pages.

**D-03:** `genusList` and `subgenusList` construction in `_data/species.js` must be extended to include checklist-only species (currently filtered to `occurrence_count > 0`).

**D-04:** For species with checklist records, use a **single augmented SVG** in the existing image slot — county polygons filled `#b0cfe8`, `fill-opacity:0.5` for counties where the species appears in the checklist, WABA occurrence dots (`#c44`) rendered on top.

**D-05:** For checklist-only species (occurrence_count=0), the same augmented SVG with county fills only.

**D-06:** The existing `species-detail.njk` image slot condition (`occurrence_count > 0`) must be extended to also show the SVG when `on_checklist` is true.

**D-07:** `species_maps.py` extended to read checklist county data from `checklist.parquet` and render county fills before occurrence dots. One SVG per species (same `<slug>.svg` filename).

**D-08:** Checklist attribution is a **separate line** below the existing metadata line. Shown only when `on_checklist` is true.

**D-09:** Format: `N checklist records · <a href="https://jhr.pensoft.net/article/129013/">Bartholomew et al. 2024</a>`

**D-10:** `checklist_count` field to be added to `species.parquet` (via `int_species_universe` or a CTE in `species.sql`). Planner decides exact dbt placement.

**D-11:** Checklist month data **merged into `month_histogram`** in dbt (in `int_species_universe`). New `checklist_month_histogram` CTE aggregates `month` counts from `checklist.parquet` per `canonical_name` (NULL months skipped). Element-wise addition with the existing WABA `month_histogram`.

**D-12:** Merge happens **in dbt** — not in a Python post-step.

**D-13:** For checklist-only species where all checklist months are NULL (all-zero merged histogram), the `seasonality-viz` component shows the histogram with a **"Monthly phenology not recorded"** note.

**D-14:** Checklist-only species in the species index show a **"checklist only"** badge instead of "0 records".

**D-15:** The "View N occurrences on the atlas →" link is **hidden** when `occurrence_count` is 0.

### Claude's Discretion

- Exact dbt placement for `checklist_count` — new column in `int_species_universe` or a CTE in `species.sql`.
- CSS class naming for checklist county fills in `species_maps.py` STYLE_CSS.
- Whether `genusList` checklist count comes from reading `checklist.parquet` at build time or from a new field in `species.json`.

### Deferred Ideas (OUT OF SCOPE)

None — discussion stayed within phase scope.
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| SPEC-01 | All 565 checklist species appear in the species index and have dedicated taxon pages, including species with zero WABA records | D-03 fix in `_data/species.js` `speciesList` and `genusList`; `species-detail.njk` pagination source is `species.speciesList` which uses `flat.filter(s => s.specific_epithet !== null)` — no occurrence filter — so checklist-only species already appear once they're in `species.json`. However, genus/subgenus pages filter via `withOcc` (occurrence_count > 0). |
| SPEC-02 | Checklist-only species appear on genus and subgenus pages alongside WABA species | D-03: `genusList` and `subgenusList` `.filter(sp => sp.occurrence_count > 0)` must be extended to include `sp.on_checklist` species |
| SPEC-03 | Species pages show occurrence map including checklist record points (visually distinct from WABA occurrence points) | D-04–D-07: augmented SVG with county fills from `checklist.parquet` |
| SPEC-04 | Species pages show attribution for checklist records: "N checklist records · Bartholomew et al. 2024" | D-08–D-10: new `checklist_count` column in dbt + template change |
| SPEC-05 | Seasonality histogram draws from all sources; suppressed only when species has zero records from any source | D-11–D-13: dbt histogram merge + `seasonality-viz` "no data" note |
</phase_requirements>

---

## Summary

Phase 113 extends the BeeAtlas species page system to include all 565 checklist species from Bartholomew et al. 2024, not just the ~527 species with WABA occurrence records. The phase touches five distinct subsystems in a specific dependency order: (1) dbt models must be extended first to produce `checklist_count` and the merged `month_histogram`; (2) `species_maps.py` must be extended to render county-fill SVGs from `checklist.parquet`; (3) `_data/species.js` must be updated to include checklist-only species in `genusList` and `subgenusList`; (4) all four Nunjucks templates must be updated for new display cases; (5) `seasonality-viz.ts` must gain a "Monthly phenology not recorded" note for all-zero histograms on checklist species.

The data pipeline and Eleventy template systems are well-understood and tightly coupled. The key patterns are established: `CASE` not `COALESCE` for `INTEGER[]` backfill in DuckDB 1.4.x, deepcopy-per-species SVG rendering, and deterministic attribute-sorted SVG output. No new libraries are required.

**Primary recommendation:** Implement in dependency order: dbt first (adds `checklist_count`, merges `month_histogram`), then Python SVG extension, then JS data layer, then templates, then `seasonality-viz`.

---

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| `checklist_count` aggregation | Data pipeline (dbt) | — | SQL aggregation is the natural place; flows to all downstream consumers automatically |
| Checklist histogram merge | Data pipeline (dbt) | — | D-12 locked — not Python post-step |
| County-fill SVG generation | Data pipeline (Python) | — | `species_maps.py` already owns static SVG generation |
| `genusList`/`subgenusList` construction | Build-time JS (`_data/species.js`) | — | Eleventy data cascade; reads `species.json` |
| Checklist attribution display | Frontend Server (Eleventy templates) | — | Static rendered HTML from `species-detail.njk` |
| "Monthly phenology not recorded" note | Browser (Lit component) | — | `seasonality-viz.ts` owns all histogram display logic |

---

## Standard Stack

No new packages required. All work uses existing project dependencies.

| Tool | Version (current) | Purpose |
|------|--------------------|---------|
| dbt-duckdb | 1.10.1 (verified from `run_results.json`) | SQL transforms, external parquet materialization |
| DuckDB | 1.4.x (in-process) | `INTEGER[]` type, `list_value()`, `CASE` over `COALESCE` |
| Python / uv | 3.14+ | `species_maps.py` SVG generation |
| `xml.etree.ElementTree` | stdlib | SVG construction — already used, no new dep |
| Eleventy | current | Static site build |
| Lit | current | `seasonality-viz` web component |
| Vitest | ^4.1.2 | JS/TS test runner |
| pytest | current | Python test runner |

## Package Legitimacy Audit

No new packages are installed in this phase. Omitted per protocol.

---

## Architecture Patterns

### System Architecture Diagram

```
checklist.parquet (from Phase 111 dbt mart)
       |
       +---> dbt: checklist_month_histogram CTE ---> element-wise ADD to month_histogram
       |         (int_species_universe.sql)
       +---> dbt: checklist_count CTE ------------> new column in species.parquet
       |
       +---> species_maps.py: county fill layer ----> augmented <slug>.svg
             (reads checklist.parquet directly from ASSETS_DIR)

species.parquet (19 cols + checklist_count = 20 cols post-phase)
       |
       +---> species_export.py: adds slug, writes species.json
       |
       +---> _data/species.js: builds speciesList, genusList, subgenusList
       |      (genusList/subgenusList: expand filter to include on_checklist species)
       |
       +---> Eleventy templates:
              - species.njk: "checklist only" badge for zero-occurrence species
              - species-detail.njk: SVG condition, attribution line, hide atlas link
              - genus.njk: checklist count display instead of "0 records"
              - subgenus.njk: same as genus
       |
       +---> seasonality-viz.ts:
              (data = merged month_histogram from species.json)
              (new: "Monthly phenology not recorded" note when all-zero + on_checklist)
```

### Recommended File Touch List

```
data/dbt/models/intermediate/int_species_universe.sql   # checklist_month_histogram CTE + merge + checklist_count
data/dbt/models/marts/species.sql                       # SELECT + checklist_count column
data/dbt/models/marts/schema.yml                        # add checklist_count column contract
data/species_maps.py                                    # county fill layer + checklist species SVG generation
data/species_export.py                                  # add checklist_count to SPECIES_COLUMNS list + schema
data/tests/test_species_maps.py                         # new tests for county fill rendering
_data/species.js                                        # genusList/subgenusList checklist-only inclusion
_pages/species.njk                                      # "checklist only" badge
_pages/species-detail.njk                               # SVG condition, attribution line, atlas link hide
_pages/genus.njk                                        # checklist count display
_pages/subgenus.njk                                     # checklist count display
src/species/seasonality-viz.ts                          # "Monthly phenology not recorded" note
src/tests/seasonality-viz.test.ts                       # new test for all-zero + on_checklist note
src/tests/data-species.test.ts                          # update speciesList count, genusList checklist assertions
src/tests/build-output.test.ts                          # new assertions for checklist-only species pages
```

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| `INTEGER[]` element-wise addition | Custom Python merge step (D-12 locked) | `list_apply` / per-element `CASE` in DuckDB SQL | Same pattern as existing `month_histogram` build |
| SVG coordinate projection | New projection math | `_project()` and `_ring_to_path()` already in `species_maps.py` | Existing functions are correct and tested |
| County polygon loading | New geojson reader | `_load_county_geojsons()` already in `species_maps.py` | Reads from DuckDB `geographies.us_counties` with STATE_FIPS config |
| Slug computation | SQL slug | `species_export.py` Python post-step | Byte-identical `unicodedata.normalize('NFKD')` only in Python |

---

## Common Pitfalls

### Pitfall 1: `COALESCE` on `INTEGER[]` in DuckDB 1.4.x
**What goes wrong:** Writing `COALESCE(checklist_month_histogram, [0,0,...])` causes a silent type error or runtime exception.
**Why it happens:** DuckDB 1.4.x has not implemented `COALESCE` for `INTEGER[]` types.
**How to avoid:** Use `CASE WHEN x IS NULL THEN [0,0,0,0,0,0,0,0,0,0,0,0]::INTEGER[] ELSE x END` — exactly as done for the existing `month_histogram` backfill in `int_species_universe.sql` lines 49-53.
**Warning signs:** SQL compilation errors mentioning `COALESCE` with list types.

### Pitfall 2: Element-wise list addition in DuckDB
**What goes wrong:** Using `+` on two `INTEGER[]` values is not valid DuckDB SQL.
**Why it happens:** DuckDB does not overload `+` for array types.
**How to avoid:** Use `list_transform` or per-element `list_apply`/`[a[1]+b[1], a[2]+b[2], ...]` syntax. Alternatively, use 12 separate `SUM(CASE ...)` columns and `list_value(...)::INTEGER[12]` — the same pattern used in `int_species_occurrences_agg.sql`.
**Recommended approach:** Add a separate `checklist_month_histogram` CTE mirroring `int_species_occurrences_agg.sql`'s `list_value(SUM(CASE WHEN month = N...)...)::INTEGER[12]` pattern (reading from `checklist.parquet` or `checklist_data.checklist_records`), then merge in the `species_universe` CTE with 12 element-wise additions: `list_value(oa.month_histogram[1] + cl.month_histogram[1], ...)::INTEGER[12]`. [ASSUMED — verify DuckDB 1.4.x `list_value` element-wise addition syntax is valid]

### Pitfall 3: `genusList` color index drift after adding checklist-only species
**What goes wrong:** Checklist-only species are inserted into the `withOcc` list used for color index assignment, changing the hue assignments for existing WABA species.
**Why it happens:** Color index is position-based (hue = i * 360 / n). Adding new members changes `n` and shifts all indices.
**How to avoid:** The color index computation must remain over `occurrence_count > 0` members only (the "withOcc" list). Checklist-only species are appended separately to the display list with a neutral color (`#cccccc` per the existing test at `data-species.test.ts:105`, or `#aaaaaa` per CONTEXT.md — see Note below).
**Warning signs:** Vitest test `genusList hexColors match the Python _group_colors algorithm` fails.

**Note — Color Value Conflict:** `data-species.test.ts` line 105 expects `#cccccc` for zero-occurrence species, but CONTEXT.md says `#aaaaaa`. The test currently passes vacuously (no zero-occurrence species exist in `genusList`). The planner must choose one value and make the test and implementation agree. The existing `#aaaaaa` for unresolved-species records (`_UNRESOLVED_COLOR` in Python, `_data/species.js` line 122) suggests `#aaaaaa` is the natural choice, but the pre-existing test says `#cccccc`. Update the test to match the implementation choice.

### Pitfall 4: SVG rendering order for county fills
**What goes wrong:** Occurrence dots rendered before county fills are hidden under fill polygons.
**Why it happens:** SVG renders in document order; later elements appear on top.
**How to avoid:** In `species_maps.py`, draw county backdrop paths (`class="county"`) first, then checklist-county fill paths (`class="checklist-county"` or similar), then occurrence circle elements last.

### Pitfall 5: `generate_species_maps` currently filters to `occurrence_count > 0`
**What goes wrong:** The main species SVG loop in `species_maps.py` line 397-405 queries `WHERE occurrence_count > 0 AND specific_epithet IS NOT NULL` — checklist-only species are excluded.
**Why it happens:** The original code predated the checklist pipeline.
**How to avoid:** Change the query to `WHERE (occurrence_count > 0 OR on_checklist = true) AND specific_epithet IS NOT NULL`. [VERIFIED: source code confirmed]

### Pitfall 6: `checklist_count` must flow through `species_export.py`
**What goes wrong:** Adding `checklist_count` to the dbt mart but not to `SPECIES_COLUMNS` in `species_export.py` means it is silently dropped from `species.json` — templates cannot access it.
**Why it happens:** `species_export.py` uses an explicit column list (`SPECIES_COLUMNS`) to read from the sandbox parquet and write to `species.json`.
**How to avoid:** Add `'checklist_count'` to `SPECIES_COLUMNS` in `species_export.py` AND add it to the PyArrow schema with `pa.int64()`. The dbt `schema.yml` contract must also include the new column.

### Pitfall 7: `subgenusList` zero-occurrence filter drops entire subgenus groups
**What goes wrong:** `subgenusList` has `.filter(g => g.totalOccurrences > 0)` at the end (line 206 of `_data/species.js`). After adding checklist-only species to display lists, subgenus groups whose only members are checklist-only will have `totalOccurrences === 0` and be dropped entirely — those subgenus pages will not be generated.
**How to avoid:** The filter logic must be updated. Two sub-decisions for planner: (a) should a subgenus page be generated if it contains only checklist species? If yes, the filter becomes `g.totalOccurrences > 0 || g.checklistCount > 0`. (b) What is `checklistCount`? Sum of `checklist_count` for members. This parallels the D-03 genus/subgenus expansion decision.

### Pitfall 8: Duplicate canonical_name rows in `int_species_universe` after checklist merge
**What goes wrong:** The `checklist_month_histogram` CTE join produces multiple rows per `canonical_name` if the JOIN is not properly keyed.
**Why it happens:** `checklist.parquet` has one row per specimen record, not per species. A `GROUP BY canonical_name` is required before joining.
**How to avoid:** The `checklist_month_histogram` CTE must `GROUP BY canonical_name` before being joined into `species_universe`. The existing `DISTINCT ON (canonical_name)` guard at the end of `int_species_universe.sql` is a safety net but not a substitute for correct aggregation.

### Pitfall 9: `seasonality-viz` "Monthly phenology not recorded" note
**What goes wrong:** The component's `render()` method currently shows "0 records" for all-zero histograms (VIZ-02 fallback branch, `total < 5`). A checklist-only species with all-NULL months will have total = 0, showing "0 records" — which is misleading because checklist records do exist, but their month is unknown.
**Why it happens:** The component has no way to distinguish "truly zero records" from "records exist but months are unknown".
**How to avoid:** Add an `onChecklist` boolean `@property` to `seasonality-viz`. When `total === 0 && this.onChecklist`, render `<p class="viz-fallback">Monthly phenology not recorded</p>` instead of "0 records". The template passes `on_checklist` via a new attribute. The existing `data` property remains the merged histogram from dbt.

---

## Code Examples

### Pattern 1: Checklist Month Histogram CTE (dbt SQL)

Mirror the pattern from `int_species_occurrences_agg.sql` but reading from `checklist.parquet` / `checklist_data`:

```sql
-- Source: data/dbt/models/intermediate/int_species_occurrences_agg.sql (lines 25-38) — replicate for checklist
checklist_month_agg AS (
    SELECT
        canonical_name,
        list_value(
            SUM(CASE WHEN TRY_CAST(month AS INT) =  1 THEN 1 ELSE 0 END),
            SUM(CASE WHEN TRY_CAST(month AS INT) =  2 THEN 1 ELSE 0 END),
            SUM(CASE WHEN TRY_CAST(month AS INT) =  3 THEN 1 ELSE 0 END),
            SUM(CASE WHEN TRY_CAST(month AS INT) =  4 THEN 1 ELSE 0 END),
            SUM(CASE WHEN TRY_CAST(month AS INT) =  5 THEN 1 ELSE 0 END),
            SUM(CASE WHEN TRY_CAST(month AS INT) =  6 THEN 1 ELSE 0 END),
            SUM(CASE WHEN TRY_CAST(month AS INT) =  7 THEN 1 ELSE 0 END),
            SUM(CASE WHEN TRY_CAST(month AS INT) =  8 THEN 1 ELSE 0 END),
            SUM(CASE WHEN TRY_CAST(month AS INT) =  9 THEN 1 ELSE 0 END),
            SUM(CASE WHEN TRY_CAST(month AS INT) = 10 THEN 1 ELSE 0 END),
            SUM(CASE WHEN TRY_CAST(month AS INT) = 11 THEN 1 ELSE 0 END),
            SUM(CASE WHEN TRY_CAST(month AS INT) = 12 THEN 1 ELSE 0 END)
        )::INTEGER[12] AS checklist_month_histogram,
        COUNT(*) AS checklist_count
    FROM {{ ref('checklist') }}
    WHERE canonical_name IS NOT NULL
      AND month IS NOT NULL           -- ~15% of rows have NULL month — skip them per D-11
    GROUP BY canonical_name
)
```

Then in `species_universe` CTE, LEFT JOIN and merge:
```sql
-- Element-wise addition — CASE guards against NULL (DuckDB 1.4.x COALESCE on INTEGER[] unimplemented)
CASE WHEN oa.month_histogram IS NULL AND cma.checklist_month_histogram IS NULL
     THEN [0,0,0,0,0,0,0,0,0,0,0,0]::INTEGER[]
     WHEN oa.month_histogram IS NULL
     THEN cma.checklist_month_histogram
     WHEN cma.checklist_month_histogram IS NULL
     THEN oa.month_histogram
     ELSE list_value(
         oa.month_histogram[1] + cma.checklist_month_histogram[1],
         -- ... repeat for all 12 months
     )::INTEGER[12]
END AS month_histogram
```

### Pattern 2: County Fill Rendering in `species_maps.py`

```python
# Source: data/species_maps.py _build_county_backdrop(), _write_species_svg() — extend these

# Add to STYLE_CSS:
STYLE_CSS = (
    ".county { fill: #f4f4f0; stroke: #888; stroke-width: 0.5; }\n"
    ".checklist-county { fill: #b0cfe8; fill-opacity: 0.5; stroke: #888; stroke-width: 0.5; }\n"
    ".occ { fill: #c44; fill-opacity: 0.6; stroke: none; }"
)

# New function signature for species SVG (extend _write_species_svg):
def _write_species_svg(
    slug: str,
    points: list[tuple[float, float]],
    checklist_counties: set[str],          # NEW
    county_geojsons_by_name: dict[str, dict],  # NEW — keyed by county name
    backdrop: ET.Element,
    out_dir: Path,
) -> int:
    root = copy.deepcopy(backdrop)
    # 1. Draw checklist county fills (before occurrence dots)
    for county_name, geom in county_geojsons_by_name.items():
        if county_name in checklist_counties:
            # render with class="checklist-county"
            ...
    # 2. Draw occurrence dots on top
    for lon, lat in points:
        ...
```

### Pattern 3: `genusList` Checklist-Only Species (species.js)

```javascript
// Source: _data/species.js lines 110-146 — extend this block
// After withOcc (occurrence_count > 0), also collect checklist-only species:
const checklistOnly = g.allMembers
  .filter(sp => sp.occurrence_count === 0 && sp.on_checklist && sp.specific_epithet !== null)
  .sort((a, b) => a.canonical_name.localeCompare(b.canonical_name));

// Append to display list with neutral color
const checklistSpecies = checklistOnly.map(sp => ({
  ...sp,
  hexColor: '#cccccc',  // or '#aaaaaa' — must match test at data-species.test.ts:105
}));
const species = [...speciesOnly, ...checklistSpecies];
// (or if "Genus sp." entry is also present, insert before it)
```

### Pattern 4: `seasonality-viz` "Monthly phenology not recorded"

```typescript
// Source: src/species/seasonality-viz.ts render() method — extend VIZ-02 fallback branch
@property({ attribute: false }) onChecklist = false;   // NEW property

render() {
  const total = this.data.reduce((a, b) => a + b, 0);
  if (total < 5) {
    // NEW: distinguish all-zero checklist-only from truly zero records
    if (total === 0 && this.onChecklist) {
      return html`<p class="viz-fallback">Monthly phenology not recorded</p>`;
    }
    // ... existing fallback rendering
  }
}
```

Template wiring in `species-detail.njk`:
```nunjucks
<seasonality-viz id="sviz"></seasonality-viz>
<script>
  customElements.whenDefined('seasonality-viz').then(function(){
    const el = document.getElementById('sviz');
    el.data = {{ sp.month_histogram | dump | safe }};
    el.onChecklist = {{ sp.on_checklist | dump | safe }};
  });
</script>
```

---

## Critical Cross-Cutting Concerns

### dbt Contract: Adding `checklist_count` to `species.parquet`

The `species` model in `data/dbt/models/marts/schema.yml` has `contract: enforced: true` with 18 named columns. Adding `checklist_count` requires:

1. Add CTE in `int_species_universe.sql` (or `species.sql`)
2. Add `checklist_count` to the SELECT in `species.sql`
3. Add `checklist_count` entry to `schema.yml` contracts under `species`
4. Add `'checklist_count'` to `SPECIES_COLUMNS` in `species_export.py`
5. Add `('checklist_count', pa.int64())` to the PyArrow schema in `species_export.py`

Failure to do all five steps atomically will cause dbt contract failures or silent column drops.

### `speciesList` already includes checklist-only species (SPEC-01 is largely free)

In `_data/species.js`, `speciesList` is:
```javascript
const speciesList = flat.filter(s => s.specific_epithet !== null);
```
There is NO `occurrence_count > 0` filter here. `flat` contains all rows from `species.json`, which in turn comes from `species.parquet`. Since checklist-only species are already in `species.parquet` (via the FULL OUTER JOIN in `int_species_universe`), they will automatically appear in `speciesList` and therefore get Eleventy pages generated at `/species/{Genus}/{epithet}/`. **SPEC-01 (species index and dedicated pages) requires no change to `speciesList`** — the pages will be generated automatically. The only gap is what those pages display.

### `genusList` and `subgenusList` filter IS the SPEC-02 blocker

The `genusList` `.filter(sp => sp.occurrence_count > 0)` (line 115 of `_data/species.js`) is the sole reason checklist-only species do not appear on genus pages. This is D-03.

However, there is a subtle complication: the current `subgenusList` has a trailing filter:
```javascript
.filter(g => g.totalOccurrences > 0)
```
(line 206). This will drop entire subgenus groups that consist only of checklist-only species. The planner needs to address this.

### `species_maps.py` needs county-name-to-geometry mapping

Currently `_load_county_geojsons()` returns GeoJSON dicts without the county name. To look up which counties have checklist records and render those polygons with `class="checklist-county"`, the loader must also return county names. The county name is in the source table (`geographies.us_counties`) but not currently extracted. A revised query would be:

```sql
SELECT name, ST_AsGeoJSON(ST_SimplifyPreserveTopology(geom, 0.005))
FROM geographies.us_counties
WHERE state_fips = ?
```

The current function signature must change to return `list[tuple[str, dict]]` or `dict[str, dict]`.

### `checklist.parquet` county names must match `geographies.us_counties` name column

County fills require matching `checklist.parquet`'s `county` column against the geometry table's `name` column. If there is a naming mismatch (e.g., "King" vs "King County"), county fills will silently fail. [ASSUMED — verify name column in geographies.us_counties matches checklist.parquet county values]

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `species_maps.py` generates SVGs only for species with `occurrence_count > 0` | Must generate for all `specific_epithet IS NOT NULL AND (occurrence_count > 0 OR on_checklist)` | Phase 113 | SVG count expands from ~527 to ~565 |
| `month_histogram` contains WABA data only | `month_histogram` merges WABA + checklist monthly data | Phase 113 | `species.parquet` schema grows by 1 col (`checklist_count`); histogram values change for checklist species |
| `genusList`/`subgenusList` show only species with WABA records | All checklist species shown | Phase 113 | More genus/subgenus page entries; some subgenus pages may gain entries for first time |

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | DuckDB 1.4.x supports element-wise `list_value(a[1]+b[1], ...)` for `INTEGER[12]` addition | Code Examples Pattern 1 | Must use a different merge approach (e.g., 12-column unnest/zip then re-aggregate) |
| A2 | `geographies.us_counties` `name` column values match `checklist.parquet` `county` values exactly | Critical Cross-Cutting Concerns | County fills silently produce no output; must add normalization |
| A3 | `checklist.parquet` in `ASSETS_DIR` is available at `species_maps.py` run time (after dbt-build step copies it) | SVG pipeline | `species_maps.py` must handle missing `checklist.parquet` gracefully or fail loudly |
| A4 | Checklist-only subgenus groups currently produce zero Eleventy pages (because `subgenusList.filter(g => g.totalOccurrences > 0)`) | Don't Hand-Roll | Some checklist species in subgenus groups will lack subgenus navigation pages — acceptable if desired, blocker if SPEC-02 requires subgenus pages |

---

## Open Questions (RESOLVED)

1. **Subgenus page scope for SPEC-02**
   - What we know: `subgenusList` has `filter(g => g.totalOccurrences > 0)` that drops zero-occurrence subgenus groups.
   - What's unclear: Does SPEC-02 require subgenus pages for checklist-only subgenera? CONTEXT.md says "same species list on genus and subgenus pages" — implying yes.
   - Recommendation: Planner should add `|| g.checklistCount > 0` to the subgenusList filter and track `checklistCount` alongside `totalOccurrences`.
   - RESOLVED: Plan 04 Task 1 — `subgenusList` filter extended to `g.totalOccurrences > 0 || g.checklistCount > 0`; `checklistCount` tracked as sum of `checklist_count` for members.

2. **Grey color value: `#cccccc` vs `#aaaaaa`**
   - What we know: `data-species.test.ts` line 105 expects `#cccccc`. CONTEXT.md says `#aaaaaa` (analogous to unresolved species). Neither exists in implementation yet (test passes vacuously).
   - Recommendation: Planner should pick one value, update both implementation and test to match. `#cccccc` is lighter and more visually distinct from `#aaaaaa` (unresolved records) — may be the better choice.
   - RESOLVED: Plan 04 Task 1 — `'#cccccc'` chosen; matches pre-existing test at `data-species.test.ts` line 105.

3. **County geometry name matching**
   - What we know: `_load_county_geojsons` currently returns geometries without names.
   - What's unclear: The exact column name in `geographies.us_counties` that holds the county name.
   - Recommendation: Planner task should verify `SELECT name FROM geographies.us_counties WHERE state_fips = '53' LIMIT 3` and confirm it matches `checklist.parquet` county values before implementing.
   - RESOLVED: Plan 03 Task 1 — verification step added: run `EXCEPT` query between `checklist.county` and `us_counties.name`; normalize-by-trim fallback if mismatch detected.

---

## Environment Availability

All dependencies are available in the existing dev environment. No new tools required.

| Dependency | Required By | Available | Notes |
|------------|------------|-----------|-------|
| DuckDB | dbt, `species_maps.py`, `species_export.py` | Yes | Existing |
| uv / Python 3.14+ | All pipeline steps | Yes | Existing |
| Node.js / npm | Eleventy build, Vitest | Yes | Existing |
| `checklist.parquet` | `species_maps.py` SVG generation | Yes (post-dbt-build) | Produced by Phase 111, exported in `run.py` `_run_dbt_build` |

---

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| JS/TS Framework | Vitest ^4.1.2 |
| Python Framework | pytest (via `uv run pytest`) |
| Quick run command (JS) | `npm test` |
| Full suite command (JS) | `npm test` |
| Quick run command (Py) | `cd data && uv run pytest tests/test_species_maps.py -x` |
| Build output tests | `VITEST_SKIP_BUILD=0 npm test` (slow, runs Eleventy build) |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| SPEC-01 | 565 checklist species in `speciesList` | unit | `npm test -- --reporter=verbose src/tests/data-species.test.ts` | Yes — update count assertion |
| SPEC-01 | Pages generated for checklist-only species | build output | `VITEST_SKIP_BUILD=0 npm test` | Yes — add assertion for a known checklist-only species |
| SPEC-02 | Checklist-only species in `genusList` | unit | `npm test -- src/tests/data-species.test.ts` | Yes — add assertion |
| SPEC-02 | Genus page shows checklist-only species | build output | `VITEST_SKIP_BUILD=0 npm test` | Yes — add assertion |
| SPEC-03 | County fill SVG generated for checklist species | Python unit | `cd data && uv run pytest tests/test_species_maps.py -x` | Partial — add new tests |
| SPEC-04 | `checklist_count` in `species.json` | unit | `npm test -- src/tests/data-species.test.ts` | No — Wave 0 gap |
| SPEC-04 | Attribution line in species-detail HTML | build output | `VITEST_SKIP_BUILD=0 npm test` | No — Wave 0 gap |
| SPEC-05 | Merged `month_histogram` in `species.parquet` | Python integration | `cd data && uv run pytest tests/test_species_export.py -x` | Partial — add assertion |
| SPEC-05 | "Monthly phenology not recorded" in `seasonality-viz` | unit | `npm test -- src/tests/seasonality-viz.test.ts` | No — Wave 0 gap |

### Wave 0 Gaps

- [ ] `src/tests/seasonality-viz.test.ts` — add test: `onChecklist=true, total=0` → renders "Monthly phenology not recorded"
- [ ] `src/tests/data-species.test.ts` — add test: `genusList` contains at least one `on_checklist` species with `occurrence_count === 0`
- [ ] `src/tests/data-species.test.ts` — add test: `speciesList.length >= 565`
- [ ] `src/tests/build-output.test.ts` — add test for a known checklist-only species page (e.g., one with zero WABA records)
- [ ] `data/tests/test_species_maps.py` — add tests for county fill rendering in SVGs

---

## Security Domain

This phase produces static build artifacts (SVG files, parquet files, HTML pages) with no runtime server component. No new authentication, session management, access control, or cryptographic requirements apply. The citation URL (`https://jhr.pensoft.net/article/129013/`) is a hard-coded outbound link — no user input is involved.

---

## Sources

### Primary (HIGH confidence — verified against production source files)

- `data/dbt/models/intermediate/int_species_universe.sql` — FULL OUTER JOIN pattern, CASE-not-COALESCE constraint, `on_checklist` boolean derivation
- `data/dbt/models/intermediate/int_species_occurrences_agg.sql` — `list_value(SUM(CASE...))::INTEGER[12]` pattern to replicate for checklist
- `data/dbt/models/marts/species.sql` — 18-column external parquet mart; `checklist_count` must be added here
- `data/dbt/models/marts/checklist.sql` — schema: `canonical_name, scientificName, genus, specific_epithet, family, lat(NULL), lon(NULL), year, month, county, ecoregion_l3, source`
- `data/dbt/models/marts/schema.yml` — enforced contract columns; `species` model has 18 columns
- `data/species_maps.py` — full SVG generation pipeline: `_load_county_geojsons`, `_ring_to_path`, `_project`, `STYLE_CSS`, `_write_species_svg`, `generate_species_maps`
- `data/species_export.py` — `SPECIES_COLUMNS`, `export_species_parquet`, PyArrow schema
- `_data/species.js` — `speciesList`, `genusList`, `subgenusList`, `hslToHex`
- `_pages/species-detail.njk`, `_pages/genus.njk`, `_pages/subgenus.njk`, `_pages/species.njk` — template source
- `src/species/seasonality-viz.ts` — `render()`, `@property data`, `VIZ-02` fallback, `total < 5` threshold
- `src/tests/data-species.test.ts` — existing test assertions including `#cccccc` for zero-occurrence species (line 105)
- `src/tests/seasonality-viz.test.ts` — existing VIZ-01..05 tests
- `src/tests/build-output.test.ts` — existing build output assertions pattern
- `data/run.py` — STEPS order: dbt-build → species-export → species-maps → feeds

### Metadata

**Confidence breakdown:**
- dbt SQL patterns: HIGH — read directly from source files
- SVG pipeline: HIGH — read directly from source files
- JS data layer: HIGH — read directly from source files
- Templates: HIGH — read directly from source files
- Lit component API: HIGH — read directly from source files
- DuckDB list element-wise addition syntax: ASSUMED — not verified against DuckDB 1.4.x docs

**Research date:** 2026-05-24
**Valid until:** 2026-06-24 (stable project; no fast-moving external dependencies)
