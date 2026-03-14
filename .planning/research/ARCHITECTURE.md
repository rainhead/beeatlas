# Architecture Research

**Domain:** Geographic region filtering — integration into existing static bee atlas web app (v1.5)
**Researched:** 2026-03-14
**Confidence:** HIGH — all claims derived from direct inspection of current source files

## System Overview

```
┌─────────────────────────────────────────────────────────────────────────┐
│                     Python Pipeline (build time)                         │
├─────────────────────────┬───────────────────────────────────────────────┤
│  ecdysis/occurrences.py │  inat/download.py                             │
│  (MODIFY)               │  (MODIFY)                                     │
│  + sjoin county,        │  + sjoin county,                              │
│    ecoregion_l3         │    ecoregion_l3                               │
│  via regions.py (NEW)   │  via regions.py (NEW)                         │
└────────────┬────────────┴────────────────┬──────────────────────────────┘
             │                             │
             ▼                             ▼
      ecdysis.parquet               samples.parquet
      + county col                  + county col
      + ecoregion_l3 col            + ecoregion_l3 col
             │                             │
             └─────────────┬───────────────┘
                           │ cp to frontend/src/assets/
                           ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                     Frontend (Vite / TypeScript)                         │
├──────────────────────────────────┬──────────────────────────────────────┤
│  src/assets/                     │  src/                                │
│  ecdysis.parquet   (?url import) │  filter.ts        (MODIFY)           │
│  samples.parquet   (?url import) │  parquet.ts       (MODIFY)           │
│  links.parquet     (?url import) │  region-layer.ts  (NEW)              │
│  counties.geojson  (?url import) │  bee-map.ts       (MODIFY)           │
│  ecoregions.geojson(?url import) │  bee-sidebar.ts   (MODIFY)           │
│                                  │  style.ts         (unchanged)        │
└──────────────────────────────────┴──────────────────────────────────────┘
                           │
                           ▼ (runtime, browser)
┌─────────────────────────────────────────────────────────────────────────┐
│  BeeMap (LitElement)                                                     │
│  ├── OpenLayers Map                                                      │
│  │   ├── TileLayer x2 (Esri basemap)                                    │
│  │   ├── regionLayer (VectorLayer, NEW) ← counties or ecoregions GeoJSON│
│  │   ├── specimenLayer (cluster VectorLayer, unchanged)                  │
│  │   └── sampleLayer (dot VectorLayer, unchanged)                        │
│  └── BeeSidebar (LitElement)                                             │
│      ├── layer toggle (Specimens/Samples — unchanged)                    │
│      ├── boundary toggle (Off/Counties/Ecoregions — NEW)                │
│      ├── filter controls: taxon/year/month (unchanged)                   │
│      └── filter controls: county multi-select + ecoregion multi-select   │
│                           (NEW, inside existing filter-controls section) │
└─────────────────────────────────────────────────────────────────────────┘
```

### Component Responsibilities

| Component | Status | Responsibility |
|-----------|--------|----------------|
| `data/ecdysis/regions.py` | NEW | Load WA county GeoJSON + EPA L3 ecoregion GeoJSON; expose `spatial_join_regions(gdf)` helper |
| `data/ecdysis/occurrences.py` | MODIFY | Call `spatial_join_regions()` before `to_parquet()`; add county, ecoregion_l3 to output columns |
| `data/inat/download.py` | MODIFY | Convert observations DataFrame to GeoDataFrame; call `spatial_join_regions()`; add county, ecoregion_l3 to samples.parquet |
| `frontend/src/filter.ts` | MODIFY | Add `selectedCounties: Set<string>` and `selectedEcoregions: Set<string>` to `FilterState`; extend `isFilterActive()` and `matchesFilter()` |
| `frontend/src/parquet.ts` | MODIFY | Read county + ecoregion_l3 columns from both Parquet files; set as Feature properties |
| `frontend/src/region-layer.ts` | NEW | `countySource`, `ecoregionSource` VectorSources from GeoJSON; `regionLayer` VectorLayer; polygon style; `BoundaryMode` type export |
| `frontend/src/bee-map.ts` | MODIFY | Import regionLayer; add boundaryMode state; pre-check polygon click in singleclick handler; extend `_applyFilter()`; extend URL encode/decode; pass new props to sidebar |
| `frontend/src/bee-sidebar.ts` | MODIFY | Boundary toggle (3-way: off/counties/ecoregions); county multi-select autocomplete; ecoregion multi-select autocomplete; extend `FilterChangedEvent` |

## Recommended Project Structure

```
data/
├── ecdysis/
│   ├── occurrences.py    MODIFY — add spatial join
│   ├── download.py       unchanged
│   └── regions.py        NEW — shared spatial join helper
├── inat/
│   ├── download.py       MODIFY — add spatial join
│   └── observations.py   unchanged
├── links/
│   └── fetch.py          unchanged
└── geodata/              NEW directory — authoritative GeoJSON source
    ├── wa_counties.geojson
    └── epa_l3_ecoregions_wa.geojson

frontend/src/
├── assets/
│   ├── ecdysis.parquet
│   ├── samples.parquet
│   ├── links.parquet
│   ├── counties.geojson     NEW — bundled by Vite (copied from data/geodata/)
│   └── ecoregions.geojson   NEW — bundled by Vite (copied from data/geodata/)
├── filter.ts                MODIFY
├── parquet.ts               MODIFY
├── region-layer.ts          NEW
├── bee-map.ts               MODIFY
├── bee-sidebar.ts           MODIFY
└── style.ts                 unchanged
```

### Structure Rationale

- **`data/geodata/`:** One authoritative copy of boundary GeoJSON. Both the pipeline (for spatial join) and the frontend asset directory (for map display) reference the same files. `build-data.sh` copies the preprocessed GeoJSON to `frontend/src/assets/` as part of the build.
- **`data/ecdysis/regions.py`:** Both ecdysis and inat pipelines perform the identical spatial join. Shared helper avoids duplication and ensures consistent column naming.
- **`frontend/src/region-layer.ts`:** Isolates OL VectorSource/VectorLayer construction and polygon styling. Keeps `bee-map.ts` from growing further. Exports `countySource`, `ecoregionSource`, `regionLayer`, and `BoundaryMode`.
- **GeoJSON as Vite `?url` assets:** Same pattern as the existing Parquet files. No plugin required. CloudFront serves them compressed.

## Architectural Patterns

### Pattern 1: Vite `?url` Import for GeoJSON Assets

**What:** Import GeoJSON files with Vite's `?url` suffix to get a cache-busted URL string; fetch at runtime via OpenLayers VectorSource.

**When to use:** Static files that must be served separately from the JS bundle (too large to inline). Already used for all three Parquet files in `bee-map.ts`.

**Trade-offs:** GeoJSON is a separate HTTP request, not inlined. For WA counties (~300-600KB raw, ~50-80KB gzipped) and EPA ecoregions (~500KB-2MB raw, ~80-200KB gzipped), this is the correct approach. Inline JSON import would bloat the bundle and delay first parse.

**Example:**
```typescript
import countiesUrl from './assets/counties.geojson?url';
import ecoregionsUrl from './assets/ecoregions.geojson?url';

const countySource = new VectorSource({
  url: countiesUrl,
  format: new GeoJSON(),
});
```

### Pattern 2: Single regionLayer with Source Swapping

**What:** One OL VectorLayer (`regionLayer`) whose source is swapped between `countySource` and `ecoregionSource` when the boundary toggle changes. The layer is hidden when boundary mode is 'off'.

**When to use:** Exclusive toggle between two GeoJSON datasets. Source swapping is cleaner than maintaining two layers with independent z-order management.

**Trade-offs:** Both sources are constructed at startup but OL's `url` option defers the HTTP fetch until the source is first rendered. Swapping triggers the other source's fetch on first use — acceptable since the user actively requested it.

**Example:**
```typescript
export type BoundaryMode = 'off' | 'counties' | 'ecoregions';

export function applyBoundaryMode(mode: BoundaryMode): void {
  if (mode === 'off') {
    regionLayer.setVisible(false);
  } else {
    regionLayer.setSource(mode === 'counties' ? countySource : ecoregionSource);
    regionLayer.setVisible(true);
  }
}
```

### Pattern 3: FilterState Singleton Extension

**What:** Add `selectedCounties: Set<string>` and `selectedEcoregions: Set<string>` to the `FilterState` interface in `filter.ts`. Extend `isFilterActive()` and `matchesFilter()`.

**When to use:** Consistent with the established singleton pattern. The singleton is already closed over by `clusterStyle` in `style.ts` — no new wiring required for specimen cluster ghosting to respect region filter.

**Filter semantics:** OR within region sets (county OR ecoregion match is sufficient), AND with existing taxon/year/month filters.

**Example:**
```typescript
// Extension to matchesFilter() in filter.ts:
function matchesRegion(feature: Feature, f: FilterState): boolean {
  const noCounties = f.selectedCounties.size === 0;
  const noEcoregions = f.selectedEcoregions.size === 0;
  if (noCounties && noEcoregions) return true;
  const county = feature.get('county') as string | null;
  const eco = feature.get('ecoregion_l3') as string | null;
  if (!noCounties && county && f.selectedCounties.has(county)) return true;
  if (!noEcoregions && eco && f.selectedEcoregions.has(eco)) return true;
  return false;
}
```

### Pattern 4: Polygon Click as Pre-Check in Singleclick Handler

**What:** In `bee-map.ts` singleclick handler, check `regionLayer.getFeatures(pixel)` first (when boundaries are visible). If a polygon hit is found, extract the region name, add it to `filterState`, and return early. Otherwise fall through to the existing specimen/sample hit-testing.

**When to use:** Region boundaries are a filter mechanism, not a navigation target. The click pre-check avoids conflating polygon selection with specimen/sample selection and preserves existing specimen/sample click behavior.

**Example:**
```typescript
this.map.on('singleclick', async (event: MapBrowserEvent) => {
  // Pre-check: polygon click when boundaries visible
  if (this.boundaryMode !== 'off') {
    const regionHits = await regionLayer.getFeatures(event.pixel);
    if (regionHits.length > 0) {
      const f = regionHits[0]!;
      if (this.boundaryMode === 'counties') {
        const name = f.get('COUNTY_NM') as string; // property name TBD from GeoJSON schema
        filterState.selectedCounties = new Set([...filterState.selectedCounties, name]);
      } else {
        const name = f.get('US_L3NAME') as string;
        filterState.selectedEcoregions = new Set([...filterState.selectedEcoregions, name]);
      }
      this._applyFilterAndSync();
      return; // do not fall through to specimen/sample click
    }
  }
  // Existing specimen/sample click logic follows...
});
```

### Pattern 5: Region Options Derived from Parquet Data

**What:** County and ecoregion multi-select options are derived from the unique values present in `specimenSource.getFeatures()` after load — same pattern as `buildTaxaOptions()`. Do not hardcode region lists.

**When to use:** Ensures only counties/ecoregions that have actual specimen data appear in the filter. Avoids showing empty filter options for regions with no records.

**Trade-offs:** Options are not available until `specimenSource.once('change')` fires. This is identical to the existing taxon autocomplete behavior and is acceptable.

**Example:**
```typescript
function buildRegionOptions(features: Feature[]): { counties: string[], ecoregions: string[] } {
  const counties = new Set<string>();
  const ecoregions = new Set<string>();
  for (const f of features) {
    const c = f.get('county') as string | null;
    const e = f.get('ecoregion_l3') as string | null;
    if (c) counties.add(c);
    if (e) ecoregions.add(e);
  }
  return {
    counties: [...counties].sort(),
    ecoregions: [...ecoregions].sort(),
  };
}
```

### Pattern 6: Shared GeoJSON Files (Pipeline + Frontend)

**What:** The WA county and EPA ecoregion GeoJSON files live in `data/geodata/`. The pipeline reads them there for spatial join. `build-data.sh` copies them to `frontend/src/assets/` for bundling.

**When to use:** Both pipeline and frontend need the same boundary geometry. One authoritative copy prevents drift between what was joined and what is displayed.

**Trade-offs:** The pipeline spatial join and the display GeoJSON must match exactly. If the display GeoJSON is simplified (for size), the pipeline should also use the simplified version — otherwise a point near a boundary may show in a county visually but be joined to a different county in the parquet.

## Data Flow

### Pipeline Spatial Join Flow (build time)

```
data/geodata/wa_counties.geojson ─────────────┐
data/geodata/epa_l3_ecoregions_wa.geojson ────┤
                                              ▼
                                    regions.py
                                    load_wa_counties() → GeoDataFrame
                                    load_epa_ecoregions() → GeoDataFrame
                                              │
                  ┌───────────────────────────┤
                  ▼                           ▼
        occurrences.py                 inat/download.py
        reads DarwinCore zip           fetches iNat API
        → GeoDataFrame (EPSG:4326)     → DataFrame
        → spatial_join_regions()       → to GeoDataFrame (EPSG:4326)
          adds county col              → spatial_join_regions()
          adds ecoregion_l3 col          adds county col
        → to_parquet()                   adds ecoregion_l3 col
                  │                → to_parquet()
                  ▼                           │
        ecdysis.parquet                       ▼
        (+ county, ecoregion_l3)      samples.parquet
                  │                   (+ county, ecoregion_l3)
                  └──────────┬────────────────┘
                             │ cp to frontend/src/assets/
                             ▼
build-data.sh also:
  cp data/geodata/counties.geojson frontend/src/assets/counties.geojson
  cp data/geodata/ecoregions.geojson frontend/src/assets/ecoregions.geojson
```

### Frontend Filter Data Flow (runtime)

```
App startup
  ├── regionLayer created (hidden); countySource + ecoregionSource deferred
  ├── ParquetSource loads ecdysis.parquet (reads county, ecoregion_l3 columns)
  └── SampleParquetSource loads samples.parquet (reads county, ecoregion_l3 columns)

specimenSource.once('change'):
  └── buildRegionOptions(features) → { counties: string[], ecoregions: string[] }
      → pushed as @property to BeeSidebar (populates autocomplete options)

User selects county in autocomplete OR clicks county polygon:
  → filterState.selectedCounties.add(countyName)
  → clusterSource.changed() → OL rerenders specimenLayer (matchesFilter checks region)
  → map.render() → sample layer re-evaluation (if region filter applies to samples)
  → BeeMap recomputes filteredSummary → pushed to sidebar

User toggles boundary display to 'counties':
  → regionLayer.setSource(countySource); regionLayer.setVisible(true)
  → OL triggers countySource fetch (if not yet loaded)
  → polygons render on map
```

### URL State Extension

New params (backward compatible — absent = no region filter):

| Param | Format | Example |
|-------|--------|---------|
| `counties` | comma-separated county names | `counties=King,Yakima` |
| `ecor` | comma-separated ecoregion names | `ecor=Cascades` |
| `bm` | `counties` or `ecoregions` | `bm=counties` (boundary display mode; absent = off) |

These encode into `buildSearchParams()` and decode from `parseUrlParams()` following the existing pattern for `months`, `taxon`, etc.

## Integration Points

### New vs. Modified — Explicit Inventory

| File | Status | Key Changes |
|------|--------|-------------|
| `data/ecdysis/regions.py` | NEW | `load_wa_counties()`, `load_epa_ecoregions()`, `spatial_join_regions(gdf: GeoDataFrame) -> GeoDataFrame` |
| `data/ecdysis/occurrences.py` | MODIFY | Call `spatial_join_regions()` before column selection in `to_parquet()`; add `county` and `ecoregion_l3` to output columns list |
| `data/inat/download.py` | MODIFY | Construct GeoDataFrame from lat/lon; call `spatial_join_regions()`; add `county` and `ecoregion_l3` to `samples.parquet` output |
| `data/geodata/wa_counties.geojson` | NEW | WA county boundaries — authoritative source |
| `data/geodata/epa_l3_ecoregions_wa.geojson` | NEW | EPA L3 ecoregions clipped to WA — authoritative source |
| `frontend/src/assets/counties.geojson` | NEW | Copy of data/geodata version; Vite bundles with ?url import |
| `frontend/src/assets/ecoregions.geojson` | NEW | Copy of data/geodata version; Vite bundles with ?url import |
| `frontend/src/filter.ts` | MODIFY | Add `selectedCounties`, `selectedEcoregions` to `FilterState`; extend `isFilterActive()` and `matchesFilter()` |
| `frontend/src/parquet.ts` | MODIFY | Add `county`, `ecoregion_l3` to `columns` arrays in `ParquetSource` and `SampleParquetSource`; set as Feature properties |
| `frontend/src/region-layer.ts` | NEW | `countySource`, `ecoregionSource`, `regionLayer`; `BoundaryMode` type; `applyBoundaryMode()` helper; polygon style function |
| `frontend/src/bee-map.ts` | MODIFY | Import region-layer; add `boundaryMode` @state; add `countyOptions`/`ecoregionOptions` @state; extend singleclick handler; extend `_applyFilter()`; extend `buildSearchParams()`/`parseUrlParams()`; add restored-region @state props; pass new props to `<bee-sidebar>` |
| `frontend/src/bee-sidebar.ts` | MODIFY | `BoundaryMode` property; boundary toggle UI; county multi-select; ecoregion multi-select; extend `FilterChangedEvent` with `selectedCounties`, `selectedEcoregions`, `boundaryMode` |
| `build-data.sh` | MODIFY | Add `cp data/geodata/*.geojson frontend/src/assets/` step |
| `style.ts` | UNCHANGED | No changes — region filter extension of `matchesFilter()` is transparent |
| `infra/` (CDK) | UNCHANGED | No new AWS resources; GeoJSON assets deploy via existing `aws s3 sync` |

### New TypeScript Types

```typescript
// region-layer.ts (exported):
export type BoundaryMode = 'off' | 'counties' | 'ecoregions';

// bee-sidebar.ts FilterChangedEvent extension:
export interface FilterChangedEvent {
  taxonName: string | null;
  taxonRank: 'family' | 'genus' | 'species' | null;
  yearFrom: number | null;
  yearTo: number | null;
  months: Set<number>;
  selectedCounties: Set<string>;       // NEW
  selectedEcoregions: Set<string>;     // NEW
  boundaryMode: BoundaryMode;          // NEW
}
```

### Internal Boundaries

| Boundary | Communication | Notes |
|----------|---------------|-------|
| `filter.ts` ↔ `style.ts` | Direct singleton read (existing) | `matchesFilter()` extension includes region; `clusterStyle` automatically picks it up |
| `filter.ts` ↔ `bee-map.ts` | Direct import + mutation (existing) | `_applyFilter()` mutates filterState, calls `clusterSource.changed()` |
| `region-layer.ts` ↔ `bee-map.ts` | Direct import | bee-map imports `regionLayer`, `applyBoundaryMode`, `BoundaryMode` from region-layer |
| `bee-map.ts` → `bee-sidebar.ts` | Lit `@property` (down) | New: `countyOptions`, `ecoregionOptions`, `boundaryMode`, `restoredCounties`, `restoredEcoregions` |
| `bee-sidebar.ts` → `bee-map.ts` | `filter-changed` CustomEvent (up) | Extended `FilterChangedEvent` carries new fields |

## Recommended Build Order

### Phase 1: Pipeline — Spatial Join

1. Acquire GeoJSON boundary files:
   - WA county boundaries: WA State GIS Open Data portal (39 counties)
   - EPA L3 ecoregions: EPA website (US-level file; clip to WA bounding box with geopandas)
   - Simplify if raw file exceeds ~2MB: `gdf.simplify(tolerance=0.01, preserve_topology=True)`
2. Create `data/ecdysis/regions.py` with `spatial_join_regions()` using geopandas `sjoin()`
3. Modify `data/ecdysis/occurrences.py`: integrate spatial join before column selection
4. Modify `data/inat/download.py`: add GeoDataFrame construction and spatial join
5. Update `build-data.sh`: add GeoJSON copy step to frontend assets
6. Validate: run pipeline locally; inspect parquet for correct county/ecoregion_l3 values on 5-10 known specimens from King County and a Cascade ecoregion

**Rationale:** Pipeline first. Frontend cannot read new columns until they exist in the parquet files. This phase has no frontend dependencies and is independently testable.

### Phase 2: Frontend Data Layer

1. Add `county` and `ecoregion_l3` to `columns` arrays in `parquet.ts` (both `ParquetSource` and `SampleParquetSource`)
2. Set them as Feature properties in the loader callbacks
3. Extend `FilterState` in `filter.ts` with `selectedCounties`, `selectedEcoregions`; initialize both as `new Set()`
4. Extend `isFilterActive()` to return true if either set is non-empty
5. Extend `matchesFilter()` with region check (OR within sets, AND with existing checks)
6. Create `frontend/src/region-layer.ts`: `countySource`, `ecoregionSource`, `regionLayer`, `BoundaryMode` type, `applyBoundaryMode()`, polygon style function

**Rationale:** Data layer before interaction. Validates that parquet columns parse correctly and filter logic is sound before UI is wired up. The region layer module can be created and imported without yet adding the layer to the OL map.

### Phase 3: Map Integration

1. Import `regionLayer`, `applyBoundaryMode`, `BoundaryMode` from `region-layer.ts` in `bee-map.ts`
2. Add `regionLayer` to the OL map layer stack, below specimen and sample layers
3. Add `boundaryMode: BoundaryMode` as `@state` on BeeMap (initial: `'off'`)
4. Extend `singleclick` handler: polygon pre-check when `boundaryMode !== 'off'`
5. Extend `buildSearchParams()` and `parseUrlParams()` for `bm`, `counties`, `ecor` params
6. Add `countyOptions: string[]` and `ecoregionOptions: string[]` as `@state`; populate in `specimenSource.once('change')` callback
7. Pass new state as `@property` to `<bee-sidebar>`

**Rationale:** Map layer and polygon click before sidebar UI. Polygon click is the primary discovery mechanism. Validates that region features load and clicks register correctly before building the sidebar multi-select.

### Phase 4: Sidebar UI

1. Extend `FilterChangedEvent` interface with `selectedCounties`, `selectedEcoregions`, `boundaryMode`
2. Add `boundaryMode` property and boundary toggle buttons to `BeeSidebar` (3-way: Off / Counties / Ecoregions)
3. Add `countyOptions` and `ecoregionOptions` properties to sidebar
4. Add `selectedCounties` and `selectedEcoregions` internal `@state` fields
5. Render county multi-select autocomplete (uses `<datalist>` or custom multi-select)
6. Render ecoregion multi-select autocomplete
7. Include new fields in `_dispatchFilterChanged()`
8. Add URL-restore properties for region state; extend `updated()` handler

**Rationale:** UI last. Autocomplete options depend on parquet data being loaded (populated in Phase 3 step 6). The sidebar change is the largest UI modification and benefits from the data layer and polygon click being confirmed working first.

## Anti-Patterns

### Anti-Pattern 1: Inlining GeoJSON into the Bundle

**What people do:** `import countiesData from './assets/counties.geojson'` (Vite default behavior inlines JSON)

**Why it's wrong:** WA county GeoJSON is ~300-600KB. Inlining adds ~80KB+ gzipped to the JS bundle and delays first render. The browser cannot cache the GeoJSON independently of the JS bundle.

**Do this instead:** `import countiesUrl from './assets/counties.geojson?url'` — Vite emits the file as a separate asset with a content hash, and OL VectorSource fetches it lazily only when the boundary layer first becomes visible.

### Anti-Pattern 2: Two Separate Region Layers

**What people do:** Create `countyLayer` and `ecoregionLayer` as separate OL VectorLayer instances; toggle visibility.

**Why it's wrong:** The exclusive 3-way toggle means only one is ever visible. Two registered layers means two z-order positions to manage, two event registrations, and more code surface. OL does not optimize invisible layer computation, so having both registered costs more than needed.

**Do this instead:** One `regionLayer` with source swapping (`regionLayer.setSource(countySource | ecoregionSource)`). Both sources fetch their GeoJSON on first use.

### Anti-Pattern 3: Spatial Join at Frontend Runtime

**What people do:** Ship raw GeoJSON + Parquet to the browser, run point-in-polygon using a library like turf.js.

**Why it's wrong:** 45,000+ point-in-polygon tests against county + ecoregion polygons runs for 1-5 seconds in the browser. Adds ~100KB (turf.js) to the bundle. The filter result is then a derived computation that must be recomputed whenever the filter changes.

**Do this instead:** Spatial join at build time in the Python pipeline using geopandas. County and ecoregion values become string columns in Parquet — the client filter is a `Set.has()` lookup, O(1) per feature.

### Anti-Pattern 4: Using the Ecdysis DarwinCore `county` Field Directly

**What people do:** The existing DarwinCore export has a `county` column — use it as-is to avoid the spatial join.

**Why it's wrong:** The Ecdysis `county` field is free-text, collector-entered. It has inconsistent casing, typos, abbreviations, and missing values. Filtering on it would produce unreliable, inconsistent results.

**Do this instead:** Ignore the DarwinCore `county` column. Overwrite it with the authoritative value from the spatial join against the WA State GIS county boundary file.

### Anti-Pattern 5: Hardcoding County and Ecoregion Lists in the Frontend

**What people do:** Define `const WA_COUNTIES = ['Adams', 'Asotin', ...]` in TypeScript; use this as the multi-select option list.

**Why it's wrong:** Options would show counties/ecoregions with no specimen records — confusing filter choices that return 0 results. Also requires manual maintenance if county data changes.

**Do this instead:** Derive options from `specimenSource.getFeatures()` after data loads — identical to the existing `buildTaxaOptions()` pattern. Only counties/ecoregions with actual records appear as filter options.

### Anti-Pattern 6: Applying Sample Layer Region Filter Through matchesFilter

**What people do:** Apply `matchesFilter(f, filterState)` to sample features when re-rendering the sample layer after region filter change.

**Why it's wrong:** `matchesFilter` checks `taxonName`, `year`, `month` — none of which sample features have (samples.parquet has `observer`, `date`, `county`, `ecoregion_l3` but not taxon). The region check itself can safely use `feature.get('county')` on sample features, but calling the full `matchesFilter` would silently misbehave for taxon checks.

**Do this instead:** Add a separate `matchesRegionFilter(feature, f)` function (or extend `matchesFilter` to guard against missing taxon properties gracefully) and apply it to sample features separately.

## Scaling Considerations

This is a static app with a fixed dataset. Scale is not a concern. Size matters only at build time:

| Asset | Estimated Raw Size | Gzipped | Notes |
|-------|-------------------|---------|-------|
| WA counties GeoJSON | 300-600KB | 50-80KB | 39 counties; simplification optional |
| EPA L3 ecoregions (WA clip) | 500KB-2MB | 80-200KB | Clip and simplify to ~1MB raw |
| ecdysis.parquet with new columns | +200KB raw | negligible % change | Two short string cols, 45K rows |
| samples.parquet with new columns | +20KB raw | negligible % change | Two short string cols, 9.5K rows |

If ecoregion GeoJSON exceeds 1MB raw after clipping, apply `gdf.simplify(tolerance=0.01, preserve_topology=True)` during pipeline preprocessing. The WA ecoregion boundaries are not precision-critical for a map filter; moderate simplification is acceptable.

## Sources

- Direct inspection of `frontend/src/bee-map.ts`, `bee-sidebar.ts`, `parquet.ts`, `filter.ts`, `style.ts` (HIGH confidence)
- Direct inspection of `data/ecdysis/occurrences.py`, `data/inat/observations.py`, `data/inat/download.py` (HIGH confidence)
- Direct inspection of `build-data.sh` (HIGH confidence)
- Direct inspection of `frontend/package.json`, `vite.config.ts` (HIGH confidence)
- Project history and key decisions: `.planning/PROJECT.md` (HIGH confidence)
- All architectural decisions are internal to an existing well-understood codebase; no external research required

---

*Architecture research for: Washington Bee Atlas v1.5 Geographic Regions*
*Researched: 2026-03-14*
