# Architecture Research — v3.7 Places Feature Integration

**Domain:** Hand-curated collecting locations integrated into a static-hosted BeeAtlas (Eleventy + Vite + Lit + wa-sqlite SPA + dbt/DuckDB pipeline)
**Researched:** 2026-05-17
**Confidence:** HIGH — all referenced files read end-to-end; patterns derived from existing analogue (county/ecoregion) already shipping

This document traces the Places feature end-to-end across all five architecture layers: (1) hand-curated source file, (2) Python/dbt pipeline, (3) export artifacts, (4) Eleventy build-time, (5) frontend filter and Mapbox layer. The county/ecoregion filter is the direct analogue for every integration point; differences are called out explicitly.

---

## 1. System Overview

```
  REPO (hand-curated)
  ─────────────────────────────────────────────────────────────────
  content/places.toml   (name, slug, owner, permits, polygon GeoJSON)
       │
       ▼
  DATA PIPELINE  (maderas nightly cron — data/run.py)
  ─────────────────────────────────────────────────────────────────
  data/places_pipeline.py         NEW
       │  reads places.toml, writes geographies.places table in DuckDB
       │
  data/dbt/models/staging/
       stg_geo__places.sql        NEW  (SELECT from geographies.places)
       │
  data/dbt/models/marts/
       places_geo.sql             NEW  (per-place occurrence count + GeoJSON emit)
       occurrences.sql            MODIFIED  (add place_slug column via ST_Within join)
       │
  data/run.py                     MODIFIED  (add places-pipeline step before dbt-build)
  data/species_export.py          UNCHANGED
  data/species_maps.py            UNCHANGED
       │
       ▼
  EXPORTS  (public/data/ → S3 → CloudFront)
  ─────────────────────────────────────────────────────────────────
  public/data/occurrences.parquet   MODIFIED  (+place_slug column)
  public/data/places.geojson        NEW  (FeatureCollection with per-place properties)
  public/data/places.json           NEW  (flat array for Eleventy _data loader)
       │
       ▼
  ELEVENTY BUILD
  ─────────────────────────────────────────────────────────────────
  _data/places.js                   NEW  (reads places.json)
  _pages/places/index.njk           NEW  (directory listing at /places/)
  _pages/places/place.njk           NEW  (per-place page; Eleventy pagination)
       │
       ▼
  FRONTEND (SPA at /)
  ─────────────────────────────────────────────────────────────────
  src/filter.ts                     MODIFIED  (FilterState + buildFilterSQL)
  src/url-state.ts                  MODIFIED  (place= param)
  src/sqlite.ts                     MODIFIED  (CREATE TABLE occurrences +place_slug)
  src/bee-atlas.ts                  MODIFIED  (placeOptions state + _onPlaceClick handler)
  src/bee-map.ts                    MODIFIED  (places source + layer + boundary toggle)
  src/bee-filter-panel.ts (or controls)  MODIFIED  (place chip)
```

---

## 2. Layer 1 — Hand-Curated Source File

### Format decision: TOML (not GeoJSON, not JSON)

Use `content/places.toml`. Reasons:

**TOML wins over GeoJSON:**
- GeoJSON has no natural place for structured metadata alongside geometry. `properties` is flat. Permit arrays, nested owner fields, and multi-record permit history are difficult to express cleanly.
- GeoJSON polygon coordinates are thousands of numbers — impossible for a human editor to verify or diff. TOML with an embedded WKT string or an `[[places.slug.geometry]]` section is equally unreadable for geometry. Neither TOML nor GeoJSON solves the geometry-editing problem; the actual polygon is drawn in a tool (geojson.io, QGIS) and copy-pasted. Given that, GeoJSON provides no ergonomic advantage for editing.
- The existing `content/species-photos.toml` proves TOML is the project's established format for hand-curated editorial content. Using the same format keeps the `_data/` loader pattern consistent.

**TOML wins over plain JSON:**
- TOML supports comments (key for permit notes, caveats, source citations).
- TOML handles multi-line strings cleanly for WKT geometry.
- JSON editing is error-prone for nested structures (trailing commas, mismatched braces).

**Schema:**

```toml
[[places]]
name = "Skagit Wildlife Area — Headquarters Unit"
slug = "skagit-wra-hq"
owner = "Washington Department of Fish and Wildlife"
permits = [
  { type = "collect", status = "active", note = "Scientific collecting permit required" },
  { type = "access",  status = "active", note = "Day use, no fee" },
]
# WKT polygon in WGS84. Generate with geojson.io, paste here.
geometry_wkt = """
POLYGON((-122.45 48.42, -122.44 48.42, -122.44 48.41, -122.45 48.41, -122.45 48.42))
"""

[[places]]
name = "Tiger Mountain State Forest"
slug = "tiger-mountain"
owner = "Washington Department of Natural Resources"
permits = [
  { type = "collect", status = "inactive", note = "Permit currently suspended (2025)" },
]
geometry_wkt = """
POLYGON(...)
"""
```

**Key decisions:**
- `geometry_wkt` stores WKT in WGS84, not GeoJSON. WKT is compact and DuckDB reads it directly via `ST_GeomFromText()`, avoiding a JSON parse step. Equivalent GeoJSON polygon strings are 30–40% longer.
- `slug` is the stable join key throughout the system. It is the `place_slug` column in `occurrences.parquet` and the Eleventy page URL path segment.
- `permits` is an array of inline tables. This handles the common case of a place having both a collect permit and an access permit with different statuses.
- Geometry is stored in the TOML (not a sidecar `.geojson` file) to keep each place record self-contained and to avoid a secondary file per place.

---

## 3. Layer 2 — Pipeline

### 3.1 `data/places_pipeline.py` (NEW)

Analogous to `data/geographies_pipeline.py`, but reads from `content/places.toml` instead of downloading shapefiles.

```
places_pipeline.py responsibilities:
  1. Read content/places.toml (tomllib, stdlib in Python 3.11+)
  2. Parse each [[places]] record
  3. Write to geographies.places table in DuckDB via
     ST_GeomFromText(geometry_wkt) for the polygon column
  4. Schema: (slug TEXT, name TEXT, owner TEXT, permits JSON, geom GEOMETRY)
  5. Full-replace each run (CREATE OR REPLACE TABLE) — places.toml is small

Table schema in DuckDB:
  geographies.places (
    slug TEXT PRIMARY KEY,
    name TEXT,
    owner TEXT,
    permits JSON,     -- serialized array of {type, status, note}
    geom GEOMETRY
  )
```

The `permits` column stores the full array as JSON text. This is intentional: the pipeline doesn't need to query permit fields; they pass through to `places.geojson` as-is for the frontend and Eleventy pages to render. Storing as JSON avoids a schema-breaking migration every time the permit structure evolves.

### 3.2 dbt staging model: `stg_geo__places.sql` (NEW)

```sql
{{ config(materialized='view') }}

SELECT slug, name, owner, permits, geom
FROM {{ source('geographies', 'places') }}
```

Mirrors `stg_geo__us_counties.sql` exactly. The spatial source extension is already loaded by the existing spatial join pattern.

### 3.3 dbt mart: `occurrences.sql` (MODIFIED)

Add a `place_slug` column via a new CTE block, following the exact pattern of the existing `with_county` / `county_fallback` / `final_county` chain:

```sql
-- After final_county and final_eco CTEs, add:
wa_places AS (SELECT * FROM {{ ref('stg_geo__places') }}),
with_place AS (
    SELECT occ_pt._row_id, p.slug AS place_slug
    FROM occ_pt
    LEFT JOIN wa_places p ON ST_Within(occ_pt.pt, p.geom)
),
-- No fallback: occurrences OUTSIDE all places get NULL place_slug.
-- Unlike county (which uses nearest-polygon fallback), a NULL place_slug
-- is semantically correct — the occurrence was not collected inside any
-- curated place. Do NOT apply nearest-polygon fallback here.

-- In the final SELECT:
SELECT
    ...,   -- existing columns
    wp.place_slug
FROM joined j
JOIN final_county fc ON fc._row_id = j._row_id
JOIN final_eco    fe ON fe._row_id = j._row_id
LEFT JOIN with_place wp ON wp._row_id = j._row_id
```

**Critical difference from county/ecoregion:** No nearest-polygon fallback for `place_slug`. A `NULL` place_slug means "not inside any curated place" — that is correct and expected for most occurrences. Applying a nearest-place fallback would spuriously assign occurrences to places they weren't collected in. This diverges intentionally from the county/ecoregion pattern where every point is assigned to the nearest region.

**dbt column contract:** The 30-column contract on `marts/occurrences` enforced by `bash data/dbt/run.sh build` must be updated to 31 columns (add `place_slug TEXT`). Update `data/dbt/dbt_project.yml` or the schema test accordingly.

### 3.4 dbt mart: `places_geo.sql` (NEW)

Emits `places.geojson`. Follows the `counties_geo.sql` pattern with the `emit_feature_collection` macro, but also joins occurrence counts:

```sql
{{ config(
    materialized='table',
    post_hook=[
      emit_feature_collection(this, 'slug', 'target/sandbox/places.geojson')
    ]
) }}

SELECT
    p.slug AS name,   -- macro uses 'name' column as the GeoJSON feature property key
    p.geom,
    p.owner,
    p.permits,
    COUNT(o.ecdysis_id) AS specimen_count,
    COUNT(o.observation_id) AS sample_count
FROM {{ ref('stg_geo__places') }} p
LEFT JOIN {{ ref('int_combined') }} o ON o.place_slug = p.slug
GROUP BY p.slug, p.geom, p.owner, p.permits
```

Wait — the `emit_feature_collection` macro only projects `name` and `geom` into the GeoJSON properties. It needs to be extended (or overridden) to include `owner`, `permits`, `specimen_count`, `sample_count`.

**Recommendation:** Create a new macro `emit_places_feature_collection` that projects all needed properties, or add a `properties` parameter to the existing macro. The existing macro projects only `name`; places need richer properties for the static pages. Given that the macro is already project-specific (not a dbt package), extend it.

Alternatively, the `places.geojson` can be emitted with only geometry + slug in its GeoJSON properties (to feed the Mapbox layer), and a separate `places.json` flat array (with all metadata) can be emitted for Eleventy consumption. This separates concerns cleanly.

**Recommended approach: two artifacts:**

1. `places.geojson` — polygon + `slug` property only. Used by Mapbox GL JS for the boundary layer. Small, cached.
2. `places.json` — flat array of all place metadata (slug, name, owner, permits, specimen_count, sample_count). Used by Eleventy `_data/places.js` at build time. Emitted by a new `data/places_export.py` step.

This mirrors the pattern where `counties.geojson` feeds Mapbox and `species.json` feeds Eleventy — each consumer gets the format optimized for its use.

### 3.5 `data/places_export.py` (NEW)

Runs after dbt-build, reads from `int_combined` (or `occurrences.parquet`), counts occurrences per slug, and merges with the TOML metadata:

```python
"""Export places.geojson and places.json.

- places.geojson: polygon features with slug property (for Mapbox layer)
- places.json: flat array with all metadata (for Eleventy _data/places.js)
"""
```

Rationale for a Python step (not a dbt macro): the `permits` TOML array needs to pass through verbatim to `places.json` without SQL JSON gymnastics. The Python step reads `content/places.toml` directly alongside the dbt output, merges them, and emits both artifacts.

### 3.6 `data/run.py` modifications

```python
STEPS: list[tuple[str, Callable]] = [
    ("ecdysis",              load_ecdysis),
    ("ecdysis-links",        load_links),
    ("inaturalist",          load_inaturalist_observations),
    ("waba",                 load_waba_observations),
    ("projects",             load_projects),
    ("anti-entropy",         run_anti_entropy),
    ("checklist",            load_checklist),
    ("resolve-taxon-ids",    resolve_taxon_ids),
    ("taxon-lineage-extended", enrich_taxon_lineage_extended),
    ("places-pipeline",      load_places),       # NEW — must precede dbt-build
    ("dbt-build",            _run_dbt_build),
    ("topology-postprocess", clean_region_topology),
    ("species-export",       export_species_parquet),
    ("places-export",        export_places),     # NEW — must follow dbt-build
    ("species-maps",         generate_species_maps),
    ("feeds",                generate_feeds),
]
```

`places-pipeline` must precede `dbt-build` because dbt reads `geographies.places`. `places-export` must follow `dbt-build` because it reads the `int_combined` mart (for occurrence counts).

Geographies (`load_geographies`) is excluded from the nightly run and run manually — `load_places` is different because `places.toml` can change with any commit and must be picked up nightly. It runs in-process (no subprocess), takes under 1 second.

---

## 4. Layer 3 — Export Artifacts

Three artifacts land in `public/data/` (and sync to S3):

| File | Producer | Consumer | Size estimate |
|------|----------|----------|---------------|
| `occurrences.parquet` | dbt `occurrences.sql` | wa-sqlite frontend | +1 col, negligible size change |
| `places.geojson` | `places_export.py` | Mapbox GL JS source | ~50–200 KB depending on polygon complexity |
| `places.json` | `places_export.py` | Eleventy `_data/places.js` | ~5–20 KB |

`places.geojson` carries only `slug` in GeoJSON properties — just enough for the click-to-filter interaction. `places.json` carries all display fields (name, owner, permits, counts).

`occurrences.parquet` gains one column: `place_slug TEXT NULLABLE`. The existing column order is append-only to avoid breaking the dbt contract test numbering. The manifest.json hashing system (content-hash URLs) means the frontend always fetches the freshest parquet — no CDN stale-cache concern.

---

## 5. Layer 4 — Eleventy

### 5.1 `_data/places.js` (NEW)

```javascript
// _data/places.js — build-time data loader for places pages
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, '..');
const placesJsonPath = join(repoRoot, 'public/data/places.json');

const raw = JSON.parse(readFileSync(placesJsonPath, 'utf8'));

// raw is a flat array: [{ slug, name, owner, permits, specimen_count, sample_count }, ...]
export default raw;
```

**Why read `places.json` (not `places.toml`):** `places.json` is the pipeline-produced artifact that includes specimen counts. Reading TOML at Eleventy build time would skip the pipeline and produce pages without counts. `places.json` is the single source of truth for Eleventy. It's analogous to `species.json` for species pages.

**Local dev without pipeline output:** If `places.json` is missing (fresh checkout before first pipeline run), `readFileSync` throws and Eleventy fails. Follow the `species.js` pattern — if the file doesn't exist, return an empty array with a console warning. Alternatively, commit a minimal `places.json` seed with zero-count entries (matches the TOML content at commit time) so CI always succeeds.

### 5.2 `_pages/places/index.njk` (NEW)

Directory listing at `/places/`:

```nunjucks
---
layout: default.njk
permalink: /places/index.html
title: Collecting Places — BeeAtlas
---
<article>
  <h1>Collecting Places</h1>
  <ul>
  {%- for place in places -%}
    <li>
      <a href="/places/{{ place.slug }}/"><strong>{{ place.name }}</strong></a>
      <span class="owner">{{ place.owner }}</span>
      <span class="count">{{ place.specimen_count }} specimens</span>
    </li>
  {%- endfor -%}
  </ul>
</article>
```

The `places` global comes from `_data/places.js` via Eleventy's data cascade.

### 5.3 `_pages/places/place.njk` (NEW)

Per-place page via Eleventy pagination, following the `_pages/species-detail.njk` pattern:

```nunjucks
---
pagination:
  data: places
  size: 1
  alias: place
permalink: "/places/{{ place.slug }}/"
eleventyComputed:
  title: "{{ place.name }} — BeeAtlas"
layout: default.njk
---
<article>
  <h1>{{ place.name }}</h1>
  <dl>
    <dt>Land owner</dt><dd>{{ place.owner }}</dd>
  </dl>

  <h2>Permits</h2>
  <ul>
  {%- for permit in place.permits -%}
    <li class="permit-{{ permit.status }}">
      {{ permit.type | capitalize }}: {{ permit.note }}
      <span class="status">{{ permit.status }}</span>
    </li>
  {%- endfor -%}
  </ul>

  <p>{{ place.specimen_count }} specimens collected · {{ place.sample_count }} collection events</p>

  <a href="/?place={{ place.slug | urlencode }}">
    View {{ place.specimen_count }} occurrences on the atlas →
  </a>
</article>
```

The deep-link `/?place={{ place.slug }}` drives the SPA's place filter via URL state (see §6.4).

---

## 6. Layer 5 — Frontend

### 6.1 `src/filter.ts` modifications

**FilterState** gains one field:

```typescript
export interface FilterState {
  // ... existing fields ...
  selectedPlaces: Set<string>;   // set of place slugs; empty = no place filter
}
```

**isFilterActive** gains one clause:
```typescript
|| f.selectedPlaces.size > 0
```

**buildFilterSQL** gains one clause (after the ecoregion block):
```typescript
if (f.selectedPlaces.size > 0) {
  const slugs = [...f.selectedPlaces].map(s => `'${s.replace(/'/g, "''")}'`).join(',');
  occurrenceClauses.push(`place_slug IN (${slugs})`);
}
```

The `place_slug` column is a string in `occurrences.parquet` (like `county`) — no coercion needed. The filter semantics are: occurrences whose `place_slug` matches any of the selected slugs. If a user selects "Skagit WRA" and also has a county filter active, they get AND semantics (occurrences in Skagit WRA AND in the selected county) — consistent with existing cross-type filter behavior.

**OccurrenceRow** gains `place_slug: string | null` for completeness, though the sidebar and detail views don't need to display it.

### 6.2 `src/sqlite.ts` modifications

The `CREATE TABLE occurrences` DDL gains `place_slug TEXT`. Position: append after `ecoregion_l3`:

```typescript
await sqlite3.exec(db, `CREATE TABLE occurrences (
  ...
  county TEXT,
  ecoregion_l3 TEXT,
  place_slug TEXT       -- NEW
)`);
```

The `OCCURRENCE_COLUMNS` constant in `filter.ts` gains `'place_slug'` — this drives both the INSERT column list and all SELECT queries. Adding it here ensures existing query functions (queryTablePage, queryAllFiltered, queryOccurrencesByBounds) carry the new column forward without individual changes.

### 6.3 `src/bee-atlas.ts` modifications

State additions (analogous to `_countyOptions` / `_ecoregionOptions`):

```typescript
@state() private _placeOptions: Array<{ slug: string; name: string }> = [];
```

Initial FilterState object gains `selectedPlaces: new Set()`.

A `_loadPlaceOptions()` method reads distinct place_slug values from wa-sqlite (same pattern as `_loadCountyEcoregionOptions`), but also cross-references with `places.json` to get display names. Since `places.json` is small, it is fetched once at startup and cached in `_placeOptions`.

`_onRegionClick` in `bee-atlas.ts` handles county and ecoregion clicks from `bee-map`. A new `_onPlaceClick` handler handles place boundary clicks:

```typescript
private _onPlaceClick(e: CustomEvent<{ slug: string; shiftKey: boolean }>) {
  const { slug, shiftKey } = e.detail;
  // Single-select/toggle pattern matching county behavior
  if (!shiftKey) {
    const wasOnlySelection = this._filterState.selectedPlaces.size === 1
      && this._filterState.selectedPlaces.has(slug);
    this._filterState = {
      ...this._filterState,
      selectedPlaces: wasOnlySelection ? new Set() : new Set([slug]),
    };
  } else {
    const newSet = new Set(this._filterState.selectedPlaces);
    if (newSet.has(slug)) newSet.delete(slug);
    else newSet.add(slug);
    this._filterState = { ...this._filterState, selectedPlaces: newSet };
  }
  this._runFilterQuery().then(() => this._pushUrlState());
}
```

`_onMapClickEmpty` already clears counties and ecoregions; it must also clear `selectedPlaces` when the boundary mode is `places`.

`_onFilterChanged` must propagate `selectedPlaces` from the filter panel event.

The filter panel receives `placeOptions` via `@property`. The filter panel emits `selectedPlaces` in its `filter-changed` event.

### 6.4 `src/url-state.ts` modifications

New param: `place=slug1,slug2` (comma-separated slugs). Follows the same pattern as `counties=` and `ecor=`.

**In `buildParams`:**
```typescript
if (filter.selectedPlaces.size > 0) {
  params.set('place', [...filter.selectedPlaces].sort().join(','));
}
```

**In `parseParams`:**
```typescript
const placeRaw = p.get('place') ?? '';
const selectedPlaces = new Set<string>(
  placeRaw ? placeRaw.split(',').map(s => s.trim()).filter(Boolean) : []
);
```

`hasFilter` check and `result.filter` object both gain `selectedPlaces`.

The deep-link from `/places/{slug}/` is `/?place={slug}` — this matches `parseParams` exactly and will set `selectedPlaces` on page load.

The `bm=` boundary mode param gains `places` as a valid value: `'off' | 'counties' | 'ecoregions' | 'places'`. This controls which boundary overlay is visible in the map. A user who arrives via a deep-link from a place page should probably have `bm=places` auto-set so the boundary is visible — the deep-link from the Eleventy page includes it:
```
/?place=skagit-wra-hq&bm=places
```

### 6.5 `src/bee-map.ts` modifications

**Places source and layers** follow the county/ecoregion pattern exactly:

```typescript
// Source (added in the 'load' handler alongside counties and ecoregions):
this._map!.addSource('places', {
  type: 'geojson',
  data: { type: 'FeatureCollection', features: [] },
  generateId: true,
});

// Layers: place-fill and place-line (identical paint expressions to county-fill/county-line)
this._map!.addLayer({
  id: 'place-fill',
  type: 'fill',
  source: 'places',
  layout: { visibility: 'none' },
  paint: {
    'fill-color': ['case',
      ['boolean', ['feature-state', 'selected'], false],
      'rgba(44, 123, 229, 0.12)',
      'rgba(0, 0, 0, 0)',
    ],
  },
});
this._map!.addLayer({
  id: 'place-line',
  type: 'line',
  source: 'places',
  layout: { visibility: 'none', 'line-join': 'round', 'line-cap': 'round' },
  paint: {
    'line-color': ['case',
      ['boolean', ['feature-state', 'selected'], false],
      'rgba(44, 123, 229, 0.85)',
      'rgba(120, 60, 180, 0.65)',   // distinct from county/ecoregion (purple tint)
    ],
    'line-width': ['case',
      ['boolean', ['feature-state', 'selected'], false],
      2.5, 1.5,
    ],
  },
});
```

**Click interaction** (added alongside click-county and click-ecoregion):
```typescript
this._map.addInteraction('click-place', {
  type: 'click',
  target: { layerId: 'place-fill' },
  handler: (e) => {
    this._clickConsumed = true;
    e.preventDefault();
    this._handleRegionClick(e, 'slug');  // property name in places.geojson
  },
});
```

`_handleRegionClick` reads the named property and emits `map-click-region` with `{ name: slug, shiftKey }` — identical to county/ecoregion. The slug value flows as the "name" through the existing event; `bee-atlas._onRegionClick` routes it based on boundary mode. Because `boundaryMode === 'places'`, it calls `_onPlaceClick` instead of the county/ecoregion path.

Actually — `_onRegionClick` in `bee-atlas` currently routes based on `this._boundaryMode === 'counties'`. With three boundary types, this becomes:

```typescript
private _onRegionClick(e: CustomEvent<{ name: string; shiftKey: boolean }>) {
  const { name, shiftKey } = e.detail;
  if (this._boundaryMode === 'counties') { /* ... county logic ... */ }
  else if (this._boundaryMode === 'ecoregions') { /* ... ecoregion logic ... */ }
  else if (this._boundaryMode === 'places') { /* ... place logic (slug-based) ... */ }
}
```

**Boundary GeoJSON loading** in `_loadBoundaryData()` (already loads counties and ecoregions from CloudFront): add a third fetch for `places.geojson`, storing features in `_placesIdMap: Map<number, string>` (Mapbox numeric feature ID → slug).

**Boundary mode toggle** in the Regions menu: add "Places" as a fourth option. The `_applyBoundaryMode` private method sets `visibility: visible/none` per layer based on `this.boundaryMode`; extend to handle `'places'`.

**`_applyBoundarySelection`** must also handle `'places'`: read `this.filterState.selectedPlaces` (set of slugs), iterate `_placesIdMap`, and call `setFeatureState` with `{ selected: slugs.has(slug) }`.

The `@property boundaryMode` type annotation in `bee-map.ts` widens from `'off' | 'counties' | 'ecoregions'` to `'off' | 'counties' | 'ecoregions' | 'places'`. Same widening in `url-state.ts`, `bee-atlas.ts`, and any test files.

---

## 7. Component Responsibilities Summary

| Component | Responsibility | New/Modified |
|-----------|---------------|-------------|
| `content/places.toml` | Hand-curated place records (geometry + metadata) | NEW |
| `data/places_pipeline.py` | Load TOML → `geographies.places` in DuckDB | NEW |
| `data/dbt/staging/stg_geo__places.sql` | Expose `geographies.places` to dbt | NEW |
| `data/dbt/marts/occurrences.sql` | Add `place_slug` via ST_Within join | MODIFIED |
| `data/places_export.py` | Emit `places.geojson` + `places.json` to `public/data/` | NEW |
| `data/run.py` | Add `places-pipeline` + `places-export` steps | MODIFIED |
| `_data/places.js` | Read `places.json`, expose to Eleventy templates | NEW |
| `_pages/places/index.njk` | Directory listing at `/places/` | NEW |
| `_pages/places/place.njk` | Per-place static page via pagination | NEW |
| `src/filter.ts` | Add `selectedPlaces: Set<string>` to FilterState + SQL clause | MODIFIED |
| `src/sqlite.ts` | Add `place_slug TEXT` to CREATE TABLE | MODIFIED |
| `src/url-state.ts` | Add `place=` param + widen `boundaryMode` type | MODIFIED |
| `src/bee-atlas.ts` | Add `_placeOptions` state + `_onPlaceClick` handler | MODIFIED |
| `src/bee-map.ts` | Add `places` source/layers + click interaction + load | MODIFIED |
| `src/bee-filter-panel.ts` | Add place chip/autocomplete | MODIFIED |

No new Lit components are required. The places feature reuses all existing coordinator/presenter patterns.

---

## 8. Data Flow — End to End

### 8.1 Nightly pipeline

```
places.toml (repo)
    │ places_pipeline.py: tomllib.load → ST_GeomFromText → INSERT
    ▼
geographies.places (DuckDB)
    │ dbt stg_geo__places.sql
    ▼
stg_geo__places (DuckDB view)
    │ dbt occurrences.sql: LEFT JOIN on ST_Within(pt, p.geom)
    ▼
occurrences.parquet (+place_slug column)  →  S3 → CloudFront
    │
    │ places_export.py: reads int_combined → COUNT per slug
    │                   merges with places.toml metadata
    ▼
places.geojson  →  S3 → CloudFront
places.json     →  S3 → CloudFront
```

### 8.2 Eleventy build

```
places.json (public/data/)
    │ _data/places.js: JSON.parse → flat array
    ▼
places (Eleventy global)
    │ _pages/places/index.njk: iteration → static HTML
    │ _pages/places/place.njk: pagination → N static pages
    ▼
_site/places/index.html
_site/places/{slug}/index.html
```

### 8.3 Frontend runtime

```
User loads /?place=skagit-wra-hq&bm=places
    │ parseParams → selectedPlaces = Set(["skagit-wra-hq"]), boundaryMode = 'places'
    ▼
bee-atlas.firstUpdated:
    filterState.selectedPlaces = { "skagit-wra-hq" }
    boundaryMode = 'places'
    _runFilterQuery() → queryVisibleIds() →
      buildFilterSQL: "place_slug IN ('skagit-wra-hq')"
      → wa-sqlite → Set<featureId>
    ▼
bee-map receives visibleIds, boundaryMode='places'
    _loadBoundaryData: fetch places.geojson → setData on 'places' source
    _applyBoundaryMode: place-fill/place-line layers set to visible
    _applyBoundarySelection: setFeatureState({ selected: true }) on matching slug
    _applyVisibleIds: occurrences source filtered to place specimens
    ▼
User sees: place boundary highlighted in purple, ghost dots outside boundary
```

---

## 9. Differences from County/Ecoregion Analogue

| Aspect | County/Ecoregion | Places |
|--------|------------------|--------|
| Source | Downloaded shapefile (geographies_pipeline.py) | Hand-curated TOML (places_pipeline.py) |
| Geometry source | External (Census/EPA) | Drawn by maintainer, stored in repo |
| NULL fallback | Nearest-polygon for every occurrence | NULL = not in any place (correct; no fallback) |
| Display name | Property from GeoJSON (NAME / NA_L3NAME) | `slug` in GeoJSON, `name` in places.json |
| Eleventy pages | None | /places/ + /places/{slug}/ |
| URL param | `counties=` / `ecor=` | `place=` |
| Boundary color | Gray (#808080) | Purple tint (distinct from counties/ecoregions) |
| Click → filter | `map-click-region` event → `_onRegionClick` | Same event, same handler, routes by `boundaryMode` |
| Filter chip label | County/ecoregion name | Place name (looked up from `_placeOptions`) |
| Extra metadata | None | permits, owner, specimen/sample counts |

---

## 10. Build Order Dependencies

```
places.toml (in repo, always present)
    │
    ├──▶ places-pipeline  (write geographies.places to DuckDB)
    │         │
    │         ▼
    │    dbt-build  (reads geographies.places for occurrences.sql join)
    │         │
    │         ├──▶ occurrences.parquet (+place_slug)  → frontend filter
    │         │
    │         └──▶ places-export  (reads int_combined for counts + TOML for metadata)
    │                   │
    │                   ├──▶ places.geojson  → Mapbox layer
    │                   └──▶ places.json     → Eleventy build
    │
    └──▶ Eleventy build (reads places.json from public/data/)
              │
              └──▶ _site/places/**  (static pages)
```

Critical constraint: `places-pipeline` must run before `dbt-build`. `places-export` must run after `dbt-build`. Eleventy reads `places.json` which is output of `places-export` — on a CI build that skips the data pipeline (frontend-only CI), `places.json` must already be committed or fetched from S3. Follow the `species.json` precedent: the file is committed to git at its last-known-good value so CI doesn't need the full pipeline.

---

## 11. Architectural Risks

### Risk 1: Polygon complexity and Mapbox performance

**What:** A place boundary could be a complex polygon (e.g., Tiger Mountain with irregular forest boundaries) with thousands of vertices. Loading all places as one GeoJSON source could increase tile rendering time.

**Mitigation:** Simplify polygon geometry in `places_pipeline.py` before storing in DuckDB using `ST_SimplifyPreserveTopology(geom, 0.0005)`. This preserves topology while reducing vertex count to ~hundreds. Target: each polygon < 100 KB in GeoJSON. If a place boundary requires higher fidelity, add a `simplification_tolerance` field to the TOML schema and apply it per-place.

### Risk 2: `place_slug` column and the dbt 30-column contract

**What:** The dbt mart enforces exactly 30 columns on `occurrences`. Adding `place_slug` makes it 31. The contract check will fail until updated.

**Prevention:** Update the column count assertion in `dbt_project.yml` (or wherever the contract is enforced) as part of the same PR that adds the column to `occurrences.sql`. These are inseparable.

### Risk 3: Stale `places.json` in CI (frontend-only build)

**What:** CI builds run Eleventy without the data pipeline. If `places.json` isn't committed or isn't in S3, `_data/places.js` throws and the build fails.

**Prevention:** Commit a canonical `public/data/places.json` alongside `places.toml`. The nightly cron updates it; CI uses the committed version. This matches what happens with `counties.geojson` and `ecoregions.geojson` (committed to git per the v1.5 Key Decision). Document in `data/README.md`.

### Risk 4: Place slug stability

**What:** If a slug changes (typo fix, rename), all deep-links from place pages break and `place=` URL params in shared links 404 on the filter (the slug won't match any `place_slug` in occurrences.parquet until the next pipeline run).

**Prevention:** Treat slugs as immutable once published. If a place is renamed, add the old slug as an `alias` field in the TOML and handle redirects or alias filtering in `buildFilterSQL`. Document the slug-stability commitment in `content/places.toml` header comments.

### Risk 5: `boundaryMode` type widening across test files

**What:** Widening `'off' | 'counties' | 'ecoregions'` to include `'places'` touches `url-state.ts`, `bee-atlas.ts`, `bee-map.ts`. TypeScript will catch missing cases in switch/ternary chains, but Vitest url-state.test.ts has explicit round-trip tests for `bm=` values — those tests need updating.

**Prevention:** The TypeScript compiler will flag exhaustive checks at build time. In `parseParams`, the `bm=` validation expression must include `|| bmRaw === 'places'`. Add a `bm=places` round-trip test to `url-state.test.ts`.

---

## 12. Project Structure Diff

```
beeatlas/
├── content/
│   ├── species-photos.toml          UNCHANGED
│   └── places.toml                  NEW (hand-curated place records)
├── data/
│   ├── places_pipeline.py           NEW
│   ├── places_export.py             NEW
│   ├── run.py                       MODIFIED (2 new STEPS)
│   ├── dbt/models/
│   │   ├── staging/
│   │   │   └── stg_geo__places.sql  NEW
│   │   └── marts/
│   │       └── occurrences.sql      MODIFIED (+place_slug column + CTE)
│   └── tests/
│       └── test_places_export.py    NEW
├── public/data/
│   ├── occurrences.parquet          MODIFIED (+place_slug column)
│   ├── places.geojson               NEW (committed seed + nightly update)
│   └── places.json                  NEW (committed seed + nightly update)
├── _data/
│   ├── species.js                   UNCHANGED
│   └── places.js                    NEW
├── _pages/
│   ├── index.html                   UNCHANGED
│   ├── species/                     UNCHANGED
│   └── places/
│       ├── index.njk                NEW (directory listing)
│       └── place.njk                NEW (per-place page via pagination)
└── src/
    ├── filter.ts                    MODIFIED (FilterState, buildFilterSQL, isFilterActive)
    ├── sqlite.ts                    MODIFIED (CREATE TABLE +place_slug)
    ├── url-state.ts                 MODIFIED (place= param, boundaryMode widening)
    ├── bee-atlas.ts                 MODIFIED (_placeOptions, _onPlaceClick, filterState init)
    ├── bee-map.ts                   MODIFIED (places source/layers/click/load)
    ├── bee-filter-panel.ts          MODIFIED (place chip)
    └── tests/
        ├── url-state.test.ts        MODIFIED (bm=places round-trip)
        └── filter.test.ts           MODIFIED (place_slug IN clause)
```

No new Vite entries. No new Lit component files. No new Eleventy layouts.

---

## 13. Sources

- `/Users/rainhead/dev/beeatlas/.planning/PROJECT.md` — v3.7 milestone context, constraints, existing Key Decisions
- `/Users/rainhead/dev/beeatlas/src/filter.ts` — FilterState shape, buildFilterSQL pattern for county/ecoregion; exact extension points for places
- `/Users/rainhead/dev/beeatlas/src/url-state.ts` — `counties=`/`ecor=` encoding pattern; boundaryMode type definition
- `/Users/rainhead/dev/beeatlas/src/bee-atlas.ts` — `_onRegionClick` routing, filterState init, placeOptions load pattern
- `/Users/rainhead/dev/beeatlas/src/bee-map.ts` — county/ecoregion source + layer setup; `_handleRegionClick`; `_applyBoundaryMode`; `_applyBoundarySelection`; `_loadBoundaryData`
- `/Users/rainhead/dev/beeatlas/src/sqlite.ts` — `CREATE TABLE occurrences` DDL; OCCURRENCE_COLUMNS pattern
- `/Users/rainhead/dev/beeatlas/data/dbt/models/marts/occurrences.sql` — ST_Within join pattern; `with_county`/`final_county` CTE chain to mirror for places
- `/Users/rainhead/dev/beeatlas/data/dbt/models/marts/counties_geo.sql` — `emit_feature_collection` macro usage pattern
- `/Users/rainhead/dev/beeatlas/data/dbt/macros/emit_feature_collection.sql` — macro internals; property projection limitation (projects only `name`)
- `/Users/rainhead/dev/beeatlas/data/dbt/models/staging/stg_geo__us_counties.sql` — staging view pattern for places
- `/Users/rainhead/dev/beeatlas/data/geographies_pipeline.py` — DuckDB-native geometry load pattern
- `/Users/rainhead/dev/beeatlas/data/run.py` — STEPS list; placement constraints for new steps
- `/Users/rainhead/dev/beeatlas/data/species_export.py` — Python export step pattern (reads dbt sandbox + TOML, writes to public/data/)
- `/Users/rainhead/dev/beeatlas/_data/species.js` — Eleventy data loader pattern (readFileSync JSON)
- `/Users/rainhead/dev/beeatlas/_pages/species-detail.njk` — Eleventy pagination pattern for per-item pages
- `/Users/rainhead/dev/beeatlas/content/species-photos.toml` — established TOML format for hand-curated repo content
- `/Users/rainhead/dev/beeatlas/eleventy.config.js` — `dir.input = "_pages"`, `data = "../_data"` traversal

---
*Architecture research for: v3.7 Places feature integration into BeeAtlas static site*
*Researched: 2026-05-17*
