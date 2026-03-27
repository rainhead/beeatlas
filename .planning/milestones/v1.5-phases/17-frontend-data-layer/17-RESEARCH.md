# Phase 17: Frontend Data Layer - Research

**Researched:** 2026-03-14
**Domain:** OpenLayers VectorLayer + GeoJSON sources, TypeScript FilterState extension, Parquet column projection
**Confidence:** HIGH

## Summary

Phase 17 has three self-contained deliverables: (1) expose `county` and `ecoregion_l3` columns from the existing Parquet sources as OL feature properties, (2) extend `FilterState` with region Sets and corresponding logic, and (3) create a new `region-layer.ts` module with two `VectorSource` objects backed by the committed GeoJSON boundary assets. All three are pure TypeScript/OpenLayers work with no new dependencies.

The GeoJSON assets are already in `frontend/src/assets/` (committed in Phase 16). The Parquet files already contain `county` and `ecoregion_l3` columns (written by the pipeline in Phase 16). This phase is entirely frontend-side wiring: reading columns that exist, adding state that doesn't, and constructing a layer that isn't yet created.

The critical constraint is that `region-layer.ts` must export a single `regionLayer` (`VectorLayer`) that switches sources via `layer.setSource()` — OL's `Layer` base class provides `setSource(source | null)`. Phase 18 will wire the toggle; Phase 17 just constructs and exports both sources plus the layer (initially invisible, no source set or set to `countySource`).

**Primary recommendation:** Add `county` to `ParquetSource.columns` and `county` + `ecoregion_l3` to `SampleParquetSource.sampleColumns`; extend `FilterState` interface inline in `filter.ts`; create `region-layer.ts` with `GeoJSON` format + `Vector` source pattern, `Fill(rgba(0,0,0,0))` for polygon interior hit-detection.

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `ol/format/GeoJSON` | 10.7.0 (installed) | Parse GeoJSON assets into OL Features | Built into OL; standard pattern for static GeoJSON files |
| `ol/source/Vector` (via `VectorSource`) | 10.7.0 (installed) | Hold polygon Features for boundary layers | Same class used by existing Parquet sources |
| `ol/layer/Vector` (via `VectorLayer`) | 10.7.0 (installed) | Render boundary polygons on map | Same class used by `specimenLayer` and `sampleLayer` |
| `ol/style/Fill`, `ol/style/Stroke`, `ol/style/Style` | 10.7.0 (installed) | Style boundary polygons | Same pattern as `style.ts` |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `hyparquet` | 1.23.3 (installed) | Parquet column projection | Already used; just add column names to arrays |
| `@types/geojson` | 7946.0.16 (installed) | TypeScript types for GeoJSON objects | Useful if typing the imported JSON objects |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `ol/format/GeoJSON` + `Vector` source | Fetch + manual parse | More code, no benefit — OL GeoJSON format handles CRS projection automatically |
| Single `VectorLayer` with `setSource()` | Two VectorLayers in a `LayerGroup` | LayerGroup is cleaner for independent visibility; single layer with setSource is simpler for Phase 18 toggle logic. Single layer with setSource is the right choice here given Phase 18 design intent. |

**Installation:** No new packages needed.

## Architecture Patterns

### Recommended Project Structure

Phase 17 adds one new file and modifies two existing files:
```
frontend/src/
├── filter.ts          # MODIFY: add selectedCounties/selectedEcoregions to FilterState
├── parquet.ts         # MODIFY: add county/ecoregion_l3 to column lists + feature properties
├── region-layer.ts    # CREATE: GeoJSON-backed VectorLayer + two VectorSources
├── bee-map.ts         # no changes this phase (region-layer imported but not wired yet)
└── style.ts           # no changes this phase
```

### Pattern 1: GeoJSON Static Asset as VectorSource

OL's standard pattern for static GeoJSON files bundled as Vite assets:

```typescript
// Source: OL 10.x official API — ol/format/GeoJSON + ol/source/Vector
import GeoJSONFormat from 'ol/format/GeoJSON.js';
import { Vector as VectorSource } from 'ol/source.js';
import VectorLayer from 'ol/layer/Vector.js';
import countiesData from './assets/wa_counties.geojson?url';   // or direct JSON import

// Option A: URL fetch (consistent with existing parquet pattern)
const countySource = new VectorSource({
  url: countiesData,
  format: new GeoJSONFormat({ featureProjection: 'EPSG:3857' }),
});

// Option B: Direct JSON import (synchronous, no fetch round-trip)
import countiesJson from './assets/wa_counties.geojson';
const countySource = new VectorSource({
  features: new GeoJSONFormat({ featureProjection: 'EPSG:3857' }).readFeatures(countiesJson),
});
```

**Preferred: Option B (direct JSON import)** — Vite handles `.geojson` as JSON by default. No async fetch needed for assets already bundled. Simpler than the async parquet pattern. The `featureProjection: 'EPSG:3857'` option reprojects from the file's CRS84 (WGS84 lon/lat) to the map's spherical Mercator projection.

**Vite JSON import note:** Vite imports JSON files as JavaScript objects by default — no `?url` suffix needed. TypeScript will type the import as `any` unless `@types/geojson` is used. A `as FeatureCollection` cast or `satisfies` is sufficient.

### Pattern 2: Transparent Fill for Interior Hit-Detection

OL only hit-detects rendered pixels. Polygon fills must be non-null (even with alpha=0) for interior clicks to register. This is a confirmed project decision from STATE.md.

```typescript
// Source: STATE.md v1.5 decisions + OL hit-detection behavior
import Fill from 'ol/style/Fill.js';
import Stroke from 'ol/style/Stroke.js';
import Style from 'ol/style/Style.js';

export const boundaryStyle = new Style({
  fill: new Fill({ color: 'rgba(0, 0, 0, 0)' }),    // transparent but rendered
  stroke: new Stroke({ color: '#3388ff', width: 1.5 }),
});
```

### Pattern 3: Single VectorLayer with Switchable Source

`Layer.setSource(source | null)` (OL 10.x, confirmed in `Layer.d.ts` line 369) allows Phase 18 to switch between county/ecoregion sources:

```typescript
// Source: ol/layer/Layer.d.ts — setSource(source: SourceType | null): void
export const regionLayer = new VectorLayer({
  source: countySource,   // default source; Phase 18 will call setSource() to switch
  style: boundaryStyle,
  visible: false,          // hidden by default; Phase 18 wires visibility toggle
});
```

Phase 18 will call `regionLayer.setSource(countySource)` or `regionLayer.setSource(ecoregionSource)` and `regionLayer.setVisible(true/false)` based on the toggle state.

### Pattern 4: Extending FilterState

The existing `FilterState` interface and `filterState` singleton are in `filter.ts`. The region Sets follow the same pattern as `months: Set<number>`:

```typescript
// Extend the interface:
export interface FilterState {
  taxonName: string | null;
  taxonRank: 'family' | 'genus' | 'species' | null;
  yearFrom: number | null;
  yearTo: number | null;
  months: Set<number>;
  selectedCounties: Set<string>;     // NEW
  selectedEcoregions: Set<string>;   // NEW
}

// Extend the singleton:
export const filterState: FilterState = {
  // ... existing fields ...
  selectedCounties: new Set(),
  selectedEcoregions: new Set(),
};
```

`isFilterActive()` must also check the new sets:
```typescript
export function isFilterActive(f: FilterState): boolean {
  return f.taxonName !== null
    || f.yearFrom !== null
    || f.yearTo !== null
    || f.months.size > 0
    || f.selectedCounties.size > 0    // NEW
    || f.selectedEcoregions.size > 0; // NEW
}
```

`matchesFilter()` adds AND-across-types / OR-within-type region logic:
```typescript
// After existing taxon + year + month checks:
if (f.selectedCounties.size > 0) {
  const county = feature.get('county') as string | null | undefined;
  if (!county || !f.selectedCounties.has(county)) return false;
}
if (f.selectedEcoregions.size > 0) {
  const ecor = feature.get('ecoregion_l3') as string | null | undefined;
  if (!ecor || !f.selectedEcoregions.has(ecor)) return false;
}
return true;
```

The AND-across-types / OR-within-type semantics: if both county and ecoregion sets are non-empty, a feature must match a county in `selectedCounties` AND an ecoregion in `selectedEcoregions` (AND across types). Within each set it's OR (King OR Pierce).

### Pattern 5: Adding Parquet Columns

Both `ParquetSource` and `SampleParquetSource` use static `columns` arrays passed to `parquetReadObjects`. Adding region columns is a two-step change: add to the columns array, add to `feature.setProperties()`.

```typescript
// In ParquetSource columns array — add 'county':
const columns = [
  'ecdysis_id', 'occurrenceID', 'longitude', 'latitude',
  'year', 'month', 'scientificName', 'recordedBy',
  'fieldNumber', 'genus', 'family', 'floralHost',
  'county',    // NEW — from Phase 16 spatial join
];

// In feature.setProperties() — add county:
feature.setProperties({
  // ... existing properties ...
  county: obj.county as string ?? null,
});

// In SampleParquetSource sampleColumns array — add both:
const sampleColumns = [
  'observation_id', 'observer', 'date', 'lat', 'lon',
  'specimen_count', 'sample_id',
  'county',         // NEW
  'ecoregion_l3',   // NEW
];

// In sampleSource feature.setProperties() — add both:
feature.setProperties({
  // ... existing properties ...
  county: obj.county as string ?? null,
  ecoregion_l3: obj.ecoregion_l3 as string ?? null,
});
```

**Note on specimens:** The ecdysis pipeline joins to county but NOT ecoregion_l3 — wait, actually PIPE-05 says specimens get both `county` and `ecoregion_l3`. Check the Phase 17 success criterion: "Each specimen OL feature has a `county` string property" (no mention of `ecoregion_l3` for specimens). This is consistent with REQUIREMENTS.md which only says "county" for specimens in the UI requirements. However, `ecdysis.parquet` does have both columns from the pipeline. Only add `county` to specimens for now per the success criterion — `ecoregion_l3` on specimens is not required by Phase 17 and would be a future enhancement. The `matchesFilter` ecoregion check on specimen features would return false if the property is absent (feature.get returns undefined), so adding just `county` is safe.

Actually re-reading: the filter logic must work. FILTER-03/FILTER-04 apply to "specimens and samples." If ecoregion filter applies to specimens too, we need `ecoregion_l3` on specimen features. But Phase 17 success criterion 1 says only `county` for specimens. Clarification: add both `county` and `ecoregion_l3` to `ParquetSource` because the data exists in the parquet file and the filter will need it — the success criterion says at minimum `county` must be visible.

**Decision: add `county` to specimen features, add both `county` and `ecoregion_l3` to sample features.** The success criterion only mandates `county` for specimens but adding `ecoregion_l3` is harmless and completes the data layer for Phase 18/19 filtering.

### GeoJSON Property Names (Confirmed)

Inspected actual committed GeoJSON files in `frontend/src/assets/`:

| File | Property Name | Example Value |
|------|--------------|--------------|
| `wa_counties.geojson` | `NAME` | `"Wahkiakum"`, `"Lewis"`, `"Jefferson"` |
| `epa_l3_ecoregions_wa.geojson` | `NA_L3NAME` | `"Thompson-Okanogan Plateau"` |

These are the property names OL features will have after parsing. The region-layer module should document these. Phase 18's click handler will use `feature.get('NAME')` for counties and `feature.get('NA_L3NAME')` for ecoregions.

**Blocker from STATE.md resolved:** STATE.md noted uncertainty about `NA_L3NAME` vs `US_L3NAME`. The committed file uses `NA_L3NAME`. This is now confirmed. The planner should note this in the plan.

### Anti-Patterns to Avoid

- **Null fill:** `new Style({ stroke: ... })` with no fill means polygon interior is transparent AND has no rendered pixels — OL will not fire hits on interior clicks. Always include `new Fill({ color: 'rgba(0,0,0,0)' })`.
- **Missing featureProjection:** Loading GeoJSON without specifying `featureProjection: 'EPSG:3857'` puts features in WGS84 (EPSG:4326) lon/lat space, which displays at wrong coordinates on the spherical Mercator map.
- **Forgetting BigInt coercion:** The region columns (`county`, `ecoregion_l3`) are string columns in Parquet — no BigInt coercion needed. Year/month require `Number()` coercion (existing pattern already handles this).
- **Mutating the Set singleton directly in matchesFilter:** `matchesFilter` must not mutate `f.selectedCounties` — it's read-only in the function. The existing `months` pattern uses `has()` not `add()`; follow the same pattern.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| GeoJSON parsing + CRS reprojection | Custom fetch+parse+reproject | `ol/format/GeoJSON` with `featureProjection` | Handles all GeoJSON geometry types, nested CRS, coordinate order normalization |
| Polygon hit-detection | Custom point-in-polygon math | OL `layer.getFeatures(pixel)` | OL handles all geometry types, map projection, device pixel ratio |
| Source switching | Two separate layers toggled visible | `layer.setSource(source)` | Single layer in z-order stack; cleaner than managing two layers' visibility independently |

## Common Pitfalls

### Pitfall 1: GeoJSON loaded in wrong projection
**What goes wrong:** Boundaries appear over the ocean or at wrong coordinates.
**Why it happens:** GeoJSON CRS84 uses lon/lat; OL map uses EPSG:3857 (spherical Mercator).
**How to avoid:** Always pass `featureProjection: 'EPSG:3857'` to the `GeoJSON` format constructor (or to `readFeatures()` as second arg).
**Warning signs:** Features not visible on map; features at (0,0) in EPSG:3857.

### Pitfall 2: Polygon interior not clickable
**What goes wrong:** Clicking inside a polygon registers no hit; only clicking the boundary stroke works.
**Why it happens:** OL hit-detection uses pixel color; transparent CSS background has no rendered pixels.
**How to avoid:** Include `new Fill({ color: 'rgba(0, 0, 0, 0)' })` in the polygon style.
**Warning signs:** `layer.getFeatures(pixel)` returns empty array for interior clicks; stroke edge clicks work.

### Pitfall 3: county column absent from features
**What goes wrong:** `feature.get('county')` returns `undefined` for all features.
**Why it happens:** Column not listed in the `columns` array passed to `parquetReadObjects`.
**How to avoid:** Add `'county'` to `ParquetSource.columns` and `'county'`, `'ecoregion_l3'` to `SampleParquetSource.sampleColumns`.
**Warning signs:** Browser console shows `undefined` when inspecting feature properties.

### Pitfall 4: TypeScript strict-mode errors on `noUncheckedIndexedAccess`
**What goes wrong:** TypeScript errors like `possibly undefined` when accessing `Set<string>` operations.
**Why it happens:** `tsconfig.json` has `"noUncheckedIndexedAccess": true` and `"strict": true`.
**How to avoid:** Use `f.selectedCounties.has(county)` not `county in f.selectedCounties`; check for null/undefined before calling `has()`.
**Warning signs:** Build fails with TypeScript errors.

### Pitfall 5: isFilterActive not updated to include region Sets
**What goes wrong:** Region filter appears active visually but `isFilterActive()` returns false, so filter is not applied.
**Why it happens:** Forgetting to add `|| f.selectedCounties.size > 0 || f.selectedEcoregions.size > 0` to `isFilterActive()`.
**How to avoid:** Update `isFilterActive()` at the same time as extending the interface.

## Code Examples

Verified patterns from OL source:

### VectorSource with GeoJSON format
```typescript
// Source: ol/source/Vector.d.ts + ol/format/GeoJSON.d.ts (confirmed in node_modules)
import GeoJSONFormat from 'ol/format/GeoJSON.js';
import { Vector as VectorSource } from 'ol/source.js';
import countiesJson from './assets/wa_counties.geojson';

const countySource = new VectorSource({
  features: new GeoJSONFormat({
    featureProjection: 'EPSG:3857',
  }).readFeatures(countiesJson),
});
```

### VectorLayer with setVisible and setSource
```typescript
// Source: ol/layer/Layer.d.ts line 369: setSource(source: SourceType | null): void
import VectorLayer from 'ol/layer/Vector.js';

export const regionLayer = new VectorLayer({
  source: countySource,
  style: boundaryStyle,
  visible: false,
});

// Phase 18 will call:
// regionLayer.setSource(countySource);   // switch to county mode
// regionLayer.setSource(ecoregionSource); // switch to ecoregion mode
// regionLayer.setVisible(true);
```

### Boundary style with transparent fill
```typescript
// Source: STATE.md decision + OL Style API
import Fill from 'ol/style/Fill.js';
import Stroke from 'ol/style/Stroke.js';
import Style from 'ol/style/Style.js';

export const boundaryStyle = new Style({
  fill: new Fill({ color: 'rgba(0, 0, 0, 0)' }),
  stroke: new Stroke({ color: '#3388ff', width: 1.5 }),
});
```

### FilterState region extension
```typescript
// Source: existing filter.ts pattern (filter.ts lines 3-9, 19-24, 26-42)
export interface FilterState {
  // ... existing fields ...
  selectedCounties: Set<string>;
  selectedEcoregions: Set<string>;
}

export function isFilterActive(f: FilterState): boolean {
  return f.taxonName !== null
    || f.yearFrom !== null
    || f.yearTo !== null
    || f.months.size > 0
    || f.selectedCounties.size > 0
    || f.selectedEcoregions.size > 0;
}

// matchesFilter additions (after existing month check):
if (f.selectedCounties.size > 0) {
  const county = feature.get('county') as string | null | undefined;
  if (!county || !f.selectedCounties.has(county)) return false;
}
if (f.selectedEcoregions.size > 0) {
  const ecor = feature.get('ecoregion_l3') as string | null | undefined;
  if (!ecor || !f.selectedEcoregions.has(ecor)) return false;
}
return true;
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Fetch GeoJSON at runtime | Import GeoJSON as Vite static asset | Vite standard | No CORS issues, bundled, fast |
| Separate tile overlay for boundaries | GeoJSON VectorLayer | Standard OL approach | Enables feature click events on polygons |

## Open Questions

1. **Specimen ecoregion_l3 needed for filter?**
   - What we know: Phase 17 success criterion only requires `county` on specimen features; both `county` and `ecoregion_l3` exist in `ecdysis.parquet`
   - What's unclear: Whether FILTER-04 (ecoregion filter applies to specimens) is intended — FILTER-03/04 say "specimens and samples"
   - Recommendation: Add both `county` and `ecoregion_l3` to `ParquetSource` for completeness; data exists in the file and the cost is negligible

2. **GeoJSON TypeScript import typing**
   - What we know: Vite imports `.geojson` as `any`; `@types/geojson` is installed
   - What's unclear: Whether TypeScript will accept `import foo from './assets/wa_counties.geojson'` without a `declare module '*.geojson'` in `vite/client`
   - Recommendation: Check `vite/client` types or use `import foo from './assets/wa_counties.geojson' assert { type: 'json' }` or `as unknown as FeatureCollection`; alternatively use the `?url` suffix + fetch pattern to avoid the typing issue entirely

3. **regionLayer initial source**
   - What we know: Phase 17 must construct the layer; Phase 18 wires the toggle
   - What's unclear: Should regionLayer start with `countySource` or null?
   - Recommendation: Initialize with `countySource` and `visible: false` — Phase 18 sets visibility and source. This is simpler than `setSource(null)` which OL may handle differently.

## Validation Architecture

> `workflow.nyquist_validation` is `true` in `.planning/config.json`.

### Test Framework

| Property | Value |
|----------|-------|
| Framework | None — no frontend test framework installed or configured |
| Config file | None |
| Quick run command | `cd /Users/rainhead/dev/beeatlas/frontend && npm run build` (TypeScript compile + Vite build as proxy) |
| Full suite command | `cd /Users/rainhead/dev/beeatlas/frontend && npm run build` |

No vitest, jest, or other frontend test runner is present. The project uses `npm run build` (tsc + vite build) as its automated gate. All three tasks in this phase are verified by build-pass + browser console inspection.

### Phase Requirements to Test Map

Phase 17 has no standalone requirement IDs. Validation maps to the three success criteria:

| Criterion | Behavior | Test Type | Automated Command | Infrastructure |
|-----------|----------|-----------|-------------------|---------------|
| SC-1 | Specimen features have `county`; sample features have `county` + `ecoregion_l3` | build + manual console inspect | `npm run build` | Build passes |
| SC-2 | `FilterState` has Sets; `isFilterActive()` and `matchesFilter()` correct | build (type-checks interface) | `npm run build` | Build passes |
| SC-3 | `region-layer.ts` exports `regionLayer`, `countySource`, `ecoregionSource`; polygon interior clickable | build + manual browser test | `npm run build` | Build passes |

Manual browser verification: open dev server, open console, trigger parquet load, inspect `specimenSource.getFeatures()[0].get('county')` and `sampleSource.getFeatures()[0].get('ecoregion_l3')`.

### Sampling Rate
- **Per task commit:** `cd /Users/rainhead/dev/beeatlas/frontend && npm run build`
- **Per wave merge:** `cd /Users/rainhead/dev/beeatlas/frontend && npm run build`
- **Phase gate:** Build green + browser console verification of feature properties before `/gsd:verify-work`

### Wave 0 Gaps
None — build infrastructure exists; no test framework scaffold needed.

## Sources

### Primary (HIGH confidence)
- `frontend/node_modules/ol/format/GeoJSON.d.ts` — GeoJSON format API, featureProjection option
- `frontend/node_modules/ol/layer/Layer.d.ts` line 369 — `setSource(source | null): void` confirmed
- `frontend/node_modules/ol/layer/Vector.d.ts` — VectorLayer Options, single source constructor
- `frontend/src/assets/wa_counties.geojson` — confirmed `NAME` property on county features
- `frontend/src/assets/epa_l3_ecoregions_wa.geojson` — confirmed `NA_L3NAME` property on ecoregion features
- `frontend/src/filter.ts` — existing FilterState interface and function signatures
- `frontend/src/parquet.ts` — existing columns arrays and feature.setProperties patterns

### Secondary (MEDIUM confidence)
- `.planning/STATE.md` — v1.5 decisions: transparent fill requirement, click priority

### Tertiary (LOW confidence)
- None

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all libraries already installed and in use
- Architecture: HIGH — OL API confirmed via type declarations; patterns are extensions of existing code
- Pitfalls: HIGH — confirmed from OL type declarations and existing project decisions in STATE.md
- GeoJSON property names: HIGH — directly inspected committed files

**Research date:** 2026-03-14
**Valid until:** 2026-04-14 (stable OL version; no fast-moving dependencies)
