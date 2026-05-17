# Stack Research

**Domain:** Static bee atlas — v3.7 Places feature additions only
**Researched:** 2026-05-17
**Confidence:** HIGH — all five sub-problems map onto patterns already running in production in this codebase

---

This file covers ONLY NEW stack additions for v3.7 Places. Existing decisions (TypeScript, Vite, Mapbox GL JS v3.22.0, Lit 3.2.1, wa-sqlite 1.0.0, Eleventy 3.1.5 + `@11ty/eleventy-plugin-vite` 7.1.1, Python 3.14+, uv, `dlt[duckdb]`, DuckDB 1.4 with spatial extension, dbt-duckdb 1.10.1, AWS CDK v2 + S3 + CloudFront) are LOCKED and not re-litigated here.

---

## Summary Verdict: No New Libraries Needed

Every sub-problem in the Places feature maps to a pattern already running in production:

| Sub-problem | Existing pattern it reuses |
|-------------|---------------------------|
| Hand-curated GeoJSON source file in repo | `counties.geojson` / `ecoregions.geojson` committed to git |
| Pipeline spatial join → `place_name` column | DuckDB `ST_Within` + fallback in `occurrences.sql` dbt mart |
| Export `places.geojson` with per-place counts | dbt `emit_feature_collection` macro + `run.py` copy step |
| Eleventy static place pages at `/places/{slug}/` | `_pages/species-detail.njk` pagination pattern; `_data/species.js` reader pattern |
| Mapbox GL JS place boundary overlay + click | `addSource('counties')` + `addLayer` + `addInteraction('click-county')` pattern |
| wa-sqlite `place_name` filter chip | `selectedCounties`/`buildFilterSQL` IN-clause pattern |

---

## Recommended Stack

### Core Additions (pipeline)

None. DuckDB spatial extension is already installed and used for `ST_Within` county/ecoregion joins. The places spatial join is an additional CTE in the existing `occurrences.sql` mart, identical in structure to the county and ecoregion CTEs already there.

No new Python packages. `geopandas` is intentionally absent (removed v2.2 Phase 47 — OOM on maderas); the places spatial join happens in DuckDB SQL, not Python, exactly as county/ecoregion do.

### Core Additions (Eleventy build)

| Addition | What it is | Existing pattern |
|----------|-----------|-----------------|
| `_data/places.js` | Node module that reads `public/data/places.json` (emitted by pipeline) and returns structured place list | Mirrors `_data/species.js` reading `public/data/species.json` |
| `_pages/place-detail.njk` | Eleventy pagination template; one page per place at `/places/{slug}/` | Mirrors `_pages/species-detail.njk` with `pagination: data: places.placeList size: 1` |
| `_pages/places.njk` | Index page listing all places | Mirrors `_pages/species.njk` index |

No new npm packages. Eleventy's `_data/*.js` JS data files and pagination are stable documented features already exercised by the species pages.

### Core Additions (frontend)

| Addition | What it is | Existing pattern |
|----------|-----------|-----------------|
| `place_name` column in `occurrences` wa-sqlite table | New `VARCHAR` column, null for occurrences outside any place | Mirrors `county`, `ecoregion_l3` columns |
| `selectedPlaces: Set<string>` in `FilterState` | New filter dimension in `filter.ts` | Mirrors `selectedCounties: Set<string>` |
| `place_name IN (...)` clause in `buildFilterSQL` | New SQL clause in the `occurrenceClauses` array | Identical to county IN clause (lines 234–237 of `filter.ts`) |
| `places` Mapbox GL JS source + fill/line layers | `addSource('places', { type: 'geojson', data: ..., generateId: true })` | Mirrors `counties` and `ecoregions` sources |
| `click-place` Mapbox GL JS interaction | `addInteraction('click-place', { type: 'click', target: { layerId: 'place-fill' }, handler: ... })` | Mirrors `click-county` interaction |
| Place filter chip in `<bee-filter-controls>` | Removable chip for selected place | Mirrors county/ecoregion chips |

No new npm packages.

---

## Integration Points

### Pipeline changes

1. **Source file**: `data/places.geojson` — hand-curated GeoJSON FeatureCollection committed to the repo. Properties per feature: `name` (string), `slug` (string, URL-safe), `land_owner` (string), `permits` (array of `{ type, status, expires }` objects). Geometry: polygon or multipolygon in EPSG:4326.

2. **DuckDB load step**: A new `load_places()` function (analogous to `load_geographies()`) reads `data/places.geojson` into `geographies.places` table using DuckDB's `ST_Read` or `read_json` + `ST_GeomFromGeoJSON`. Because places are a small, hand-curated file (expected <100 polygons), this runs fast and can be included in the nightly `run.py` STEPS — unlike the heavy geography downloads, no HTTP download or caching is needed.

3. **dbt staging model**: `stg_geo__places.sql` — selects `slug`, `name`, `land_owner`, `geom` from `geographies.places`. Mirrors `stg_geo__us_counties.sql`.

4. **dbt mart**: `occurrences.sql` gains a `with_place` CTE and `place_name` column using the same ST_Within + ST_Distance fallback pattern. Because places are named parks/reserves that cover only a fraction of WA, the fallback (nearest-polygon) should NOT apply — occurrences outside all place polygons should be NULL (not forced to the nearest place). The county/ecoregion fallback exists because every point in WA is in a county; places are opt-in. The CTE uses LEFT JOIN and no fallback.

5. **dbt mart schema.yml**: `place_name` column added to the `occurrences` model contract (`data_type: varchar`). This is the dbt 30-column contract enforcement point — adding the column is a deliberate schema migration.

6. **dbt mart**: `places_geo.sql` — new mart analogous to `counties_geo.sql`, emits `public/data/places.geojson` with per-place occurrence counts as a feature property. Uses the existing `emit_feature_collection` macro.

7. **`public/data/places.json`**: A separate JSON export (simpler than GeoJSON for the Eleventy data cascade) containing the curated metadata (name, slug, land_owner, permits, occurrence_count) for each place. Written by a new `place_export.py` step or directly from a dbt model with a post-hook. Places.geojson is used by Mapbox; places.json is used by Eleventy.

8. **`run.py` STEPS**: Add a `("places", load_places)` step before `dbt-build`, and copy `places.geojson` from the dbt sandbox in `_run_dbt_build()` alongside `counties.geojson` and `ecoregions.geojson`.

### Mapbox GL JS changes (`bee-map.ts`)

The existing pattern is the spec:

```
addSource('places', { type: 'geojson', data: { type: 'FeatureCollection', features: [] }, generateId: true })
addLayer({ id: 'place-fill', type: 'fill', source: 'places', ... })  // fill-color: transparent + feature-state selected highlight
addLayer({ id: 'place-line', type: 'line', source: 'places', ... })  // stroke, line-join: round
addInteraction('click-place', { type: 'click', target: { layerId: 'place-fill' }, handler: _handleRegionClick(e, 'slug') })
```

The boundary toggle menu (currently Off / Counties / Ecoregions) gains a "Places" option. Places visibility follows `boundaryMode` extended to `'off' | 'counties' | 'ecoregions' | 'places'`.

Alternatively — since places are a curated overlay (not a region-type selector like counties/ecoregions) — places could be a separate always-on toggle independent of the existing boundary mode. This is a design decision for the plan phase, not a stack question. Either way the Mapbox GL JS mechanics are identical.

### Filter model changes (`filter.ts`)

```typescript
// FilterState gains:
selectedPlaces: Set<string>;

// buildFilterSQL gains:
if (f.selectedPlaces.size > 0) {
  const places = [...f.selectedPlaces].map(p => `'${p.replace(/'/g, "''")}'`).join(',');
  occurrenceClauses.push(`place_name IN (${places})`);
}

// isFilterActive gains:
|| f.selectedPlaces.size > 0
```

### URL state changes (`url-state.ts`)

A new `place=` query param (analogous to `counties=`, `ecor=`) encodes selected places as a comma-separated slug list.

### Eleventy data cascade (`_data/places.js`)

```javascript
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const placesJsonPath = join(here, '..', 'public', 'data', 'places.json');
const raw = JSON.parse(readFileSync(placesJsonPath, 'utf8'));

export default {
  placeList: raw,                                  // array for pagination
  bySlug: Object.fromEntries(raw.map(p => [p.slug, p])),
};
```

### Eleventy page template (`_pages/place-detail.njk`)

```yaml
---
pagination:
  data: places.placeList
  size: 1
  alias: place
permalink: "/places/{{ place.slug }}/"
eleventyComputed:
  title: "{{ place.name }} — BeeAtlas"
layout: default.njk
---
```

The page body follows the species-detail pattern: name, land owner, permit table (static HTML from template data), occurrence count, deep-link to the map with `?place={{ place.slug }}&bm=places` params.

---

## What NOT to Use

| Avoid | Why | Use Instead |
|-------|-----|-------------|
| `geopandas` for the places spatial join | Removed in v2.2 Phase 47 for OOM reasons. DuckDB spatial extension handles ST_Within for small polygon sets with zero memory risk. | DuckDB `ST_Within` in the dbt mart, same as county/ecoregion |
| Python `shapely` for spatial join | Unnecessary — DuckDB spatial extension already does ST_Within in SQL; Python only sees the result. | DuckDB SQL |
| DuckDB-WASM re-introduced | Removed in v2.6; rejected for page weight. wa-sqlite handles the `place_name IN (...)` filter query identically to county. | wa-sqlite (existing) |
| New Eleventy plugin for place pages | Pagination is a built-in Eleventy feature, already exercised for 672 species/genus/etc. pages. No plugin needed. | Eleventy built-in `pagination` |
| Client-side polygon intersection to determine if an occurrence is in a place | Adds JS geometry library; incorrect anyway (polygon containment must be computed at pipeline time for correctness and performance). | `place_name` column in `occurrences.parquet` set at pipeline time |
| A separate "places" parquet file loaded client-side | The frontend needs the place name as a filter string, not the geometry. `place_name` column in the existing `occurrences` table covers this completely. | `place_name` column in `occurrences` (wa-sqlite virtual table already loaded) |

---

## Alternatives Considered

| Recommended | Alternative | When to Use Alternative |
|-------------|-------------|-------------------------|
| Commit `data/places.geojson` to repo as source of truth | Load from an external API (iNaturalist places, OpenStreetMap, etc.) | If places were discovered programmatically at scale. Curated collecting locations with permit metadata are hand-maintained — repo is the right home. |
| DuckDB `ST_Within` spatial join at pipeline time | ST_Within query client-side in wa-sqlite | wa-sqlite does not have a spatial extension. Client-side geometry libraries would add tens of KB and introduce a new test surface. Rejected. |
| `place_name` as a VARCHAR in occurrences | Store `place_id` integer FK | Slug string matches how county and ecoregion_l3 are stored; avoids a join in every filter query; consistent with existing pattern. |
| LEFT JOIN with NULL for out-of-place occurrences | Nearest-polygon fallback (same as county/ecoregion) | County/ecoregion fallback exists because every point in WA must be in a county/ecoregion. A place is opt-in — occurrences outside all places should be NULL, not forced to the nearest park. |
| Extend `boundaryMode` type to include `'places'` | Separate boolean toggle for places overlay | Either works mechanically. Design preference; recommend a separate toggle so users can show both a place boundary and a county grid simultaneously if useful. Flag for plan phase. |

---

## Sources

- BeeAtlas codebase — `src/bee-map.ts` lines 396–405, 455–491, 692–724: existing `counties`/`ecoregions` source/layer/interaction pattern (HIGH confidence, direct read)
- BeeAtlas codebase — `src/filter.ts` lines 234–241: existing county/ecoregion IN-clause pattern (HIGH confidence, direct read)
- BeeAtlas codebase — `data/dbt/models/marts/occurrences.sql`: existing ST_Within CTE structure for county and ecoregion spatial joins (HIGH confidence, direct read)
- BeeAtlas codebase — `data/dbt/models/marts/counties_geo.sql` + `emit_feature_collection` macro: existing GeoJSON export pattern from dbt (HIGH confidence, direct read)
- BeeAtlas codebase — `_data/species.js` + `_pages/species-detail.njk`: existing Eleventy data-file + pagination pattern (HIGH confidence, direct read)
- BeeAtlas codebase — `.planning/PROJECT.md` Key Decisions (geopandas removal, DuckDB-WASM rejection, wa-sqlite migration): locked decisions carried forward (HIGH confidence)

---
*Stack research for: v3.7 Places feature additions only*
*Researched: 2026-05-17*
