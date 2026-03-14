# Stack Research

**Domain:** v1.5 Geographic Regions — spatial join pipeline + polygon overlay + region filter UI
**Researched:** 2026-03-14
**Confidence:** HIGH — all claims verified against actual repo source files and live data

---

## Key Finding: No New Python Dependencies, No New npm Packages

v1.5 is achievable with what is already installed:

**Python pipeline:** geopandas 1.1.2, pyogrio 0.12.1, pyarrow 22 are all in `data/pyproject.toml`.
`gpd.sjoin()` (point-in-polygon) and `gdf.to_crs()` (CRS alignment) are the only new API surface.

**Frontend:** `ol` 10.7.0 already includes `VectorLayer`, `VectorSource`, `GeoJSON` format, `Style`, `Fill`, `Stroke`. No new packages.

**GeoJSON bundling:** Vite treats `.geojson` as JSON (inline import as module object). No `?url` suffix required. Already have `@types/geojson` 7946.0.16 installed.

---

## Data Sources

### Ecoregions: CEC North America Level III — ALREADY IN REPO

| Source | Location | Format | CRS |
|--------|----------|--------|-----|
| CEC NA Level III ecoregions | `data/NA_CEC_Eco_Level3.zip` | Shapefile | Custom Lambert AEA (must reproject to EPSG:4326) |
| Derived intermediate | `data/eco3.parquet` | GeoParquet (binary WKB geometry) | — |

**Washington coverage:** 11 ecoregions after dissolve + bbox filter: Blue Mountains, Cascades, Coast Range, Coastal Western Hemlock-Sitka Spruce Forests, Columbia Mountains/Northern Rockies, Columbia Plateau, Eastern Cascades Slopes and Foothills, North Cascades, Strait of Georgia/Puget Lowland, Thompson-Okanogan Plateau, Willamette Valley.

**Verified:** Read `NA_CEC_Eco_Level3.zip` with geopandas, reprojected to EPSG:4326, filtered to WA bbox (-124.8 to -116.9 lon, 45.5 to 49.1 lat) — 79 raw polygons dissolve to 11 named ecoregions.

**Note on EPA vs CEC naming:** The milestone spec says "EPA Level III ecoregions." The CEC NA Level III classification is the joint US-Canada-Mexico framework from which EPA derived its Level III nomenclature. For Washington specifically, the CEC NA L3 names match what EPA uses (e.g. "Cascades," "Columbia Plateau"). The `NA_CEC_Eco_Level3.zip` already in the repo is the correct dataset — no additional download required.

**GeoJSON size:** At full resolution, WA ecoregion GeoJSON is 7.2 MB. After `geometry.simplify(0.005)` (approximately 500m tolerance), it is **382 KB** — acceptable for inline Vite bundling. At 0.001 tolerance it is 1.1 MB; 0.005 is the right tradeoff for display-only overlays at regional scale.

### Counties: Census TIGER Cartographic Boundary

| Source | URL Pattern | Format | Resolution |
|--------|-------------|--------|------------|
| US Census TIGER 2023 WA counties | `https://www2.census.gov/geo/tiger/GENZ2023/shp/cb_2023_53_county_500k.zip` | Shapefile | 1:500,000 (cartographic boundary, coast-clipped) |

**FIPS code for WA:** 53. Resolution 500k is sufficient for county-level display at state scale.

**Why cartographic boundary over TIGER/Line:** TIGER/Line extends into water bodies; cartographic boundary files clip to shoreline. Better visual result for an overlay layer with no additional processing.

**Why geopandas reads this directly:** `gpd.read_file(url)` with pyogrio engine uses GDAL's `/vsicurl/` virtual filesystem handler to stream the zip from the URL without a manual download step. This avoids storing a raw zip in the repo or pipeline.

**County name column:** `NAME` field in the Census shapefile gives the bare county name (e.g. "King", "Yakima") without "County" suffix. Use as-is.

**Expected size:** At 500k resolution, WA county GeoJSON is approximately 500-700 KB uncompressed. Simplify at 0.005 degrees to reduce to approximately 100-150 KB for bundling.

---

## Spatial Join Strategy

### Specimens (ecdysis.parquet)

**County:** The Ecdysis DarwinCore export already contains a `county` column. Verified: 100% of 46,090 rows with coordinates have non-null `county`. **No spatial join needed for specimen county.** Simply pass the `county` column through from `occurrences.py`.

**Ecoregion:** No ecoregion field in DarwinCore. Requires spatial join: create a `GeoDataFrame` from `longitude`/`latitude` columns, join against the WA ecoregion polygons.

### Samples (samples.parquet)

**County and ecoregion:** iNat API provides only `lat`/`lon`. Both fields require spatial join.

### Spatial Join Pattern

```python
import geopandas as gpd
from shapely.geometry import Point

# Points GeoDataFrame
gdf_pts = gpd.GeoDataFrame(
    df,
    geometry=gpd.points_from_xy(df['lon'], df['lat']),
    crs='EPSG:4326'
)

# Region polygons (reproject to match)
regions = gpd.read_file(...).to_crs('EPSG:4326')

# Left join: keep all points, assign region attributes
joined = gpd.sjoin(gdf_pts, regions[['NAME', 'geometry']], how='left', predicate='within')
df['county'] = joined['NAME']
```

**CRS must match before sjoin.** The ecoregion shapefile is in a custom Lambert AEA projection and must be reprojected to EPSG:4326 before joining points that are stored as WGS84 lon/lat.

**`predicate='within'`** is correct for point-in-polygon. Points on polygon boundaries go to one polygon arbitrarily — acceptable for this use case.

**Null handling:** Points outside all WA polygons (e.g. specimens near the OR border or in water) will get null county/ecoregion. Store as nullable string in the output Parquet. Frontend treats null as "no region" — excluded from region filter matches but still visible on map.

**Performance:** 46,090 specimens + 9,586 samples against 11 ecoregion polygons and 39 county polygons. geopandas sjoin uses an STR-tree spatial index — this runs in under a second.

---

## Frontend: GeoJSON Bundling

### Import Strategy

```typescript
// Direct inline import — Vite treats .geojson as a JSON module
import waCounties from './assets/wa_counties.geojson';
import waEcoregions from './assets/wa_ecoregions.geojson';
```

Vite's JSON module behavior: the file is parsed at build time and inlined as a JS object. No runtime fetch required. This is the correct approach for geometry that is needed immediately on map init (the overlay layer must be ready before any user interaction).

**TypeScript type:** `import type { FeatureCollection } from 'geojson'` — already available via `@types/geojson` 7946.0.16.

**Alternative `?url` suffix:** Use `import url from './assets/wa_counties.geojson?url'` only if deferring load is needed. Not needed here — the files are 100-400 KB, well within acceptable initial bundle overhead, and the overlay renders during initial map setup.

**Vite config:** No changes to `vite.config.ts` needed. Vite handles GeoJSON out of the box.

### Asset Naming Convention

| File | Description | Target Size |
|------|-------------|-------------|
| `frontend/src/assets/wa_counties.geojson` | 39 WA counties, simplified 0.005 deg | ~150 KB |
| `frontend/src/assets/wa_ecoregions.geojson` | 11 CEC NA L3 ecoregions, simplified 0.005 deg | ~382 KB |

Both files are produced by the Python pipeline at build time and committed to the repo (same pattern as `ecdysis.parquet`).

---

## Frontend: OpenLayers Vector Layer

### Pattern

`ol` 10.7.0 already provides everything needed. The relevant imports are a superset of what is already in `bee-map.ts`:

| OL Class | Import Path | Already Used? | v1.5 Use |
|----------|-------------|--------------|----------|
| `VectorLayer` | `ol/layer/Vector.js` | Yes | Region polygon overlay layer |
| `VectorSource` | `ol/source/Vector.js` | Yes | Backing source for region features |
| `GeoJSON` | `ol/format/GeoJSON.js` | No — new import | Parse inline GeoJSON object |
| `Style` | `ol/style/Style.js` | Yes | Polygon stroke + fill style |
| `Fill` | `ol/style/Fill.js` | Yes | Semi-transparent fill for region polygons |
| `Stroke` | `ol/style/Stroke.js` | Yes | Border for region polygons |

**GeoJSON format usage:**

```typescript
import GeoJSONFormat from 'ol/format/GeoJSON.js';
import waCounties from './assets/wa_counties.geojson';

const countiesSource = new VectorSource({
  features: new GeoJSONFormat().readFeatures(waCounties, {
    featureProjection: 'EPSG:3857',
  }),
});
```

The `featureProjection: 'EPSG:3857'` argument reprojects from WGS84 (GeoJSON standard) to Spherical Mercator (OL's internal CRS). This is the standard OpenLayers pattern for GeoJSON imports.

**Layer styling:**

```typescript
const regionLayerStyle = new Style({
  stroke: new Stroke({ color: 'rgba(60, 100, 200, 0.8)', width: 1.5 }),
  fill: new Fill({ color: 'rgba(60, 100, 200, 0.05)' }),
});
```

Light fill (5% opacity) + visible stroke. Adjust color by region type (counties vs ecoregions).

**Exclusive toggle (off / counties / ecoregions):** One `VectorLayer` for counties, one for ecoregions. Toggle by calling `setVisible()` on each. Matches the existing `specimens`/`samples` toggle pattern.

**Click-to-filter:** Add a branch to the existing `singleclick` handler. Check active region layer, call `regionLayer.getFeatures(event.pixel)`, get the region name from `feature.get('NAME')` (counties) or `feature.get('NA_L3NAME')` (ecoregions), dispatch a filter event.

---

## Frontend: Region Filter UI

**No new component.** Extend `BeeSidebar` with two additional multi-select inputs, following the existing autocomplete datalist pattern for taxon filtering.

**State extension:** Add `counties: string[]` and `ecoregions: string[]` to `FilterState` in `filter.ts`. Both default to `[]` (no filter active). Region filter ANDs with existing taxon/date filters.

**`matchesFilter` extension:** Add county and ecoregion checks using the new columns in specimen/sample features:
```typescript
if (f.counties.length > 0 && !f.counties.includes(feature.get('county'))) return false;
if (f.ecoregions.length > 0 && !f.ecoregions.includes(feature.get('ecoregion_l3'))) return false;
```

**Autocomplete options:** Available counties and ecoregions are derived from the data (known at build time). Hard-code the 39 WA county names and 11 ecoregion names as static arrays in the sidebar — no dynamic computation needed.

---

## Parquet Schema Changes

### ecdysis.parquet (new columns)

| Column | Type | Source | Notes |
|--------|------|--------|-------|
| `county` | string nullable | DarwinCore `county` field (pass-through) | 100% populated in current data |
| `ecoregion_l3` | string nullable | Spatial join against CEC NA L3 polygons | Null for points outside WA |

### samples.parquet (new columns)

| Column | Type | Source | Notes |
|--------|------|--------|-------|
| `county` | string nullable | Spatial join against Census county polygons | Null for points outside WA |
| `ecoregion_l3` | string nullable | Spatial join against CEC NA L3 polygons | Null for points outside WA |

**CI schema validation:** The existing `scripts/validate-schema.mjs` checks Parquet column schemas before build. Add `county` and `ecoregion_l3` to the expected column list for both `ecdysis.parquet` and `samples.parquet` to catch regressions.

---

## What NOT to Add

| Avoid | Why | Use Instead |
|-------|-----|-------------|
| EPA WA-specific ecoregion shapefile (`wa_eco_l3` from EPA S3) | `NA_CEC_Eco_Level3.zip` is already in the repo and covers WA correctly; EPA WA L3 file uses identical region names | The existing `NA_CEC_Eco_Level3.zip` |
| `fiona` as geopandas engine | `pyogrio` is already installed and is the default as of geopandas 1.0; fiona is the deprecated path | pyogrio (default, no config needed) |
| `topojson` format for bundled geometry | TopoJSON reduces file size ~30-50% vs GeoJSON but requires a parser library (`topojson-client`, ~24 KB). At 150-400 KB GeoJSON, the savings do not justify adding a dependency | GeoJSON (built into OL, no extra library) |
| Fetching GeoJSON at runtime via `url:` in VectorSource | Would require CloudFront to serve the GeoJSON separately from the JS bundle; complicates the static build model | Inline Vite JSON import |
| `ol-mapbox-style` for region styling | Already installed for tile basemap; polygon overlay styling is simple enough for native OL `Style`/`Fill`/`Stroke` | Native OL style API |
| Server-side spatial query | Project constraint: static hosting only | Spatial join at pipeline build time, store county/ecoregion in Parquet |
| `shapely` direct usage | geopandas wraps shapely; `geometry.simplify()` is available on the GeoDataFrame geometry column via geopandas | `gdf.geometry.simplify(tolerance)` |

---

## Alternatives Considered

| Recommended | Alternative | When to Use Alternative |
|-------------|-------------|-------------------------|
| CEC NA L3 ecoregions (already in repo) | EPA WA-specific L3 shapefile from `dmap-prod-oms-edc.s3.us-east-1.amazonaws.com` | If EPA-specific attributes (US L3 codes, not NA codes) were required |
| DarwinCore `county` pass-through for specimens | Spatial join for specimens county | If Ecdysis data had < 100% county coverage |
| Census TIGER 500k cartographic boundary (coast-clipped) | TIGER/Line full-resolution county file | If precise shoreline geometry were needed (it's not — display only) |
| `geometry.simplify(0.005)` in pipeline | Simplify in a post-processing step or manually | Only if pipeline needed to preserve full-res geometry for another purpose |
| Inline Vite JSON import | `?url` import + runtime fetch | If GeoJSON files were > 2 MB or needed cache-busting separate from the JS bundle |

---

## Version Compatibility

| Package | Version | Notes |
|---------|---------|-------|
| `geopandas` | >=1.1.2 (installed) | `gpd.sjoin()` stable; pyogrio default engine as of 1.0 |
| `pyogrio` | >=0.12.1 (installed) | GDAL URL reading via `/vsicurl/`; handles zip URLs |
| `pyarrow` | >=22 (installed) | Nullable string type for `county`/`ecoregion_l3` columns |
| `ol` | 10.7.0 (installed) | `GeoJSON` format, `VectorLayer`, `VectorSource`, `Style` all stable |
| `@types/geojson` | 7946.0.16 (installed) | `FeatureCollection` type for inline GeoJSON imports |
| `vite` | 6.2.x (installed) | JSON module import of `.geojson` files: no config needed |

---

## Installation

```bash
# No new packages for either Python pipeline or frontend
# All required libraries are already installed
```

Pipeline additions are purely new Python modules and scripts. Frontend additions are new TypeScript in existing files plus two new GeoJSON assets in `frontend/src/assets/`.

---

## Sources

- `data/pyproject.toml` — geopandas 1.1.2, pyogrio 0.12.1, pyarrow 22 confirmed installed (HIGH)
- `data/NA_CEC_Eco_Level3.zip` — read with geopandas, verified 11 WA ecoregions after reproject + dissolve (HIGH)
- `data/eco3.parquet` — schema verified: NA_L3CODE, NA_L3NAME, geometry (WKB binary), 2548 rows (HIGH)
- `data/ecdysis/occurrences.py` — county field exists in DarwinCore dtype dict; currently dropped in `to_parquet` (HIGH)
- Ecdysis zip `occurrences.tab` — county column: 100% populated for 46,090 WA records (HIGH, verified live)
- `data/samples.parquet` — schema: observation_id, observer, date, lat, lon, specimen_count, sample_id, downloaded_at — no county/ecoregion (HIGH)
- `frontend/package.json` — ol 10.7.0, @types/geojson 7946.0.16, vite 6.2.3 (HIGH)
- `frontend/src/bee-map.ts` — existing OL imports, VectorLayer, VectorSource, singleclick pattern (HIGH)
- geopandas.org/en/stable/docs/reference/api/geopandas.sjoin.html — sjoin left join, predicate='within' (HIGH)
- geopandas.org/en/stable/docs/user_guide/io.html — pyogrio URL reading, GeoJSON export, CRS handling (HIGH)
- openlayers.org/en/latest/apidoc/module-ol_format_GeoJSON-GeoJSON.html — readFeatures with featureProjection (MEDIUM, official docs)
- vite.dev/guide/assets — JSON/GeoJSON inline import vs ?url behavior (MEDIUM, official docs)
- US Census TIGER cartographic boundary naming convention: `cb_{year}_{state_fips}_county_{resolution}.zip` (MEDIUM, WebSearch verified)
- EPA ecoregion download page confirmed WA L3 file at `dmap-prod-oms-edc.s3.amazonaws.com/ORD/Ecoregions/wa/` (MEDIUM, WebSearch)

---
*Stack research for: v1.5 Geographic Regions — Washington Bee Atlas pipeline + frontend*
*Researched: 2026-03-14*
