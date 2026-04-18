# Phase 64: OccurrenceSource - Research

**Researched:** 2026-04-17
**Domain:** OpenLayers VectorSource, TypeScript, URL state management, wa-sqlite
**Confidence:** HIGH

## Summary

Phase 64 consolidates two separate OL vector sources (`EcdysisSource` and `SampleSource`) into a single `OccurrenceSource` backed by the `occurrences` table created in Phase 63. All feature ID conventions from prior phases are preserved: `ecdysis:<int>` for specimen-backed rows, `inat:<int>` for sample-only rows. The unified source goes through a single `Cluster → VectorLayer` stack, eliminating the `specimenLayer` / `sampleLayer` split and the `layerMode` visibility gating.

The second major change is URL encoding: large clusters previously serialized all feature IDs into `?o=ecdysis:1,ecdysis:2,...`, causing URL length overflow for dense clusters. Phase 64 replaces that with a centroid+radius encoding (`o=@lon,lat,radiusM`) for multi-feature clusters. Restore is implemented via an equirectangular spatial query against the SQLite `occurrences` table.

The style function `makeClusterStyleFn` in `style.ts` already handles recency-based coloring and selection rings; only the minimum tap-target size enforcement needs adjustment. `makeSampleDotStyleFn` becomes dead code once the unified layer is in place — it stays in the file for Phase 65 to clean up.

**Primary recommendation:** Copy `EcdysisSource`'s loader structure verbatim, replace the SELECT with `SELECT * FROM occurrences`, use `ecdysis_id IS NOT NULL` to branch the feature ID prefix, and use the COALESCE-unified `lat`/`lon` columns for coordinates. All other infrastructure stays the same.

## Project Constraints (from CLAUDE.md)

- Static hosting only — no server runtime
- Python 3.14+ for data pipeline (not relevant here)
- `speicmenLayer` typo in `bee-map.ts` is intentionally deferred — do not fix incidentally
- Frontend tests run via `cd frontend && npm test` (Vitest)

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

- **D-01:** Single `Cluster → VectorLayer` for all occurrences. `makeSampleDotStyleFn` no longer used by `bee-map.ts`.
- **D-02:** Cluster `distance` reduced for tighter clusters; minimum rendered dot diameter ≥ 44px (Claude's discretion on exact `distance` value — target ~20px; style function enforces minimum tap target size).
- **D-03 (Claude's Discretion):** `OccurrenceSource` sets all columns from `occurrences` table as feature properties (no per-type conditional logic).
- **D-04:** Feature IDs: `ecdysis:<ecdysis_id>` when `ecdysis_id IS NOT NULL`; `inat:<observation_id>` for sample-only rows. Coordinates from unified `lat`/`lon` columns.
- **D-05:** Single-feature click → `o=ecdysis:1234` or `o=inat:5678` (extended to accept `inat:` prefix in `parseParams`).
- **D-06:** Cluster click → `o=@lon,lat,radiusM` (mean WGS84 centroid, 4 decimal places; radiusM rounded up to nearest metre).
- **D-07:** URL restore for `@lon,lat,r` format: spatial query against `occurrences` table using equirectangular approximation for distance ≤ radiusM.
- **D-08:** `SelectionState` discriminated union:
  ```ts
  type SelectionState =
    | { type: 'ids'; ids: string[] }
    | { type: 'cluster'; lon: number; lat: number; radiusM: number };
  ```
  `buildParams` and `parseParams` updated accordingly. `bee-atlas.ts` handles both variants in `_restoreSelectionSamples`.
- **D-09 (Claude's Discretion):** `layerMode` property remains on `bee-map.ts` and `bee-atlas.ts`; `layerMode`-gated visibility logic removed from `bee-map.ts`; property itself stays for Phase 65 to clean up.

### Claude's Discretion
- Exact OL cluster `distance` parameter value (target ~20px; min tap target 44px)
- Cluster style minimum size enforcement in `style.ts`

### Deferred Ideas (OUT OF SCOPE)
- Click-to-sidebar data flow revisit (Phase 65+)
- `makeSampleDotStyleFn` removal (Phase 65 cleanup)
- `speicmenLayer` typo fix (CLAUDE.md: intentionally deferred)
- `layerMode` toggle removal (Phase 65)
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| OCC-07 | `OccurrenceSource` replaces `EcdysisSource` and `SampleSource`; OL feature IDs follow existing convention (`ecdysis:<int>` for specimen-backed rows, `inat:<int>` for sample-only rows) | Confirmed: `occurrences` table schema from `sqlite.ts` has all necessary columns; existing `VectorSource` loader pattern in `EcdysisSource` is directly reusable |
</phase_requirements>

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Feature loading from SQLite | Browser (OL VectorSource loader) | — | `tablesReady` + wa-sqlite query; already established pattern |
| Feature ID assignment | Browser (OccurrenceSource) | — | `ecdysis_id IS NOT NULL` branch; same convention as prior sources |
| Cluster rendering | Browser (OL Cluster + VectorLayer) | — | `makeClusterStyleFn` already handles recency + selection ring |
| URL selection encoding | Browser (url-state.ts) | — | `buildParams`/`parseParams` are pure functions; no server involvement |
| Cluster centroid calculation | Browser (bee-map.ts click handler) | — | Uses `toLonLat` on EPSG:3857 feature geometry |
| URL selection restore (spatial) | Browser (bee-atlas.ts) | SQLite (equirectangular query) | `_restoreSelectionSamples` queries SQLite with flat-earth approximation |
| Tap target minimum enforcement | Browser (style.ts) | — | `makeClusterStyleFn` radius calculation already exists; clamp added here |

## Standard Stack

### Core (all already installed)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `ol` | 10.8.0 (from bee-map.ts link tag) | OpenLayers map + VectorSource | Existing stack |
| `wa-sqlite` | installed | In-browser SQLite | Established in Phase 63 |
| `lit` | installed | Web components | Established pattern |
| `temporal-polyfill` | installed | Date arithmetic for recency tiers | Used in style.ts |

No new dependencies required for this phase.

## Architecture Patterns

### System Architecture Diagram

```
occurrences (SQLite table)
        |
        v
  OccurrenceSource (VectorSource)
  - SELECT * FROM occurrences
  - tablesReady await
  - ecdysis_id IS NOT NULL → feature.setId('ecdysis:<id>')
  - else                   → feature.setId('inat:<id>')
  - geometry: fromLonLat([lon, lat])
  - properties: all columns set directly
        |
        v
  Cluster (OL source, wraps OccurrenceSource)
  - distance: ~20 (tighter than current 40)
        |
        v
  VectorLayer (single layer)
  - style: makeClusterStyleFn(getVisibleEcdysisIds, getSelectedOccIds)
        |
        v
  bee-map click handler
  ├── single feature → emit map-click-occurrence { occId, samples }
  └── multi-feature cluster → compute centroid+radiusM via haversine → emit map-click-occurrence { occIds }
        |
        v
  bee-atlas.ts
  ├── _onOccurrenceClick → _selectedOccIds, _pushUrlState (SelectionState discriminated union)
  └── _restoreSelectionSamples (SelectionState.type === 'cluster' → equirectangular spatial query)
        |
        v
  url-state.ts
  ├── buildParams: SelectionState → o=ecdysis:X | o=inat:X | o=@lon,lat,r
  └── parseParams: parse o= → { type:'ids', ids } | { type:'cluster', lon, lat, radiusM }
```

### Recommended Project Structure

No structural changes to the project layout. All changes are within existing files:

```
frontend/src/
├── features.ts         — add OccurrenceSource, delete EcdysisSource + SampleSource
├── bee-map.ts          — single Cluster→VectorLayer; new click handler; remove layerMode visibility gating
├── url-state.ts        — SelectionState discriminated union; @lon,lat,r encoding
├── bee-atlas.ts        — _restoreSelectionSamples spatial path; SelectionState propagation
├── style.ts            — makeClusterStyleFn: minimum radius clamp for 44px tap target
└── tests/
    ├── bee-atlas.test.ts  — mock OccurrenceSource instead of EcdysisSource/SampleSource
    ├── bee-header.test.ts — same mock update
    ├── bee-filter-toolbar.test.ts — same mock update
    ├── bee-sidebar.test.ts — same mock update
    ├── bee-table.test.ts  — same mock update
    └── url-state.test.ts  — add @lon,lat,r round-trip tests
```

### Pattern 1: OccurrenceSource Loader

**What:** Single VectorSource that queries the unified `occurrences` table
**When to use:** Replace all uses of `EcdysisSource` and `SampleSource`

```typescript
// Source: EcdysisSource in features.ts (verified by direct read)
export class OccurrenceSource extends VectorSource {
  constructor({ onError }: { onError?: (err: Error) => void } = {}) {
    const load = async (_extent, _resolution, _projection, success, failure) => {
      try {
        await tablesReady;
        const { sqlite3, db } = await getDB();
        const rows: Record<string, unknown>[] = [];
        await sqlite3.exec(db, `SELECT * FROM occurrences`, (rowValues, columnNames) => {
          const obj: Record<string, unknown> = {};
          columnNames.forEach((col, i) => { obj[col] = rowValues[i]; });
          rows.push(obj);
        });
        const features = rows.flatMap(obj => {
          if (obj.lat == null || obj.lon == null) return [];
          const feature = new Feature();
          feature.setGeometry(new Point(fromLonLat([Number(obj.lon), Number(obj.lat)])));
          // D-04: ecdysis_id IS NOT NULL → ecdysis prefix; else inat prefix
          if (obj.ecdysis_id != null) {
            feature.setId(`ecdysis:${obj.ecdysis_id}`);
          } else {
            feature.setId(`inat:${Number(obj.observation_id)}`);
          }
          // D-03: set all columns directly — no conditional per-type logic
          const props: Record<string, unknown> = {};
          for (const col of columnNames) {
            props[col] = obj[col] ?? null;
          }
          feature.setProperties(props);
          return feature;
        });
        this.addFeatures(features);
        if (success) success(features);
      } catch (err) {
        if (onError) onError(err instanceof Error ? err : new Error(String(err)));
        failure();
      }
    };
    super({ loader: load, strategy: all });
  }
}
```

**Critical:** `year` is a direct column in `occurrences` — already an INTEGER. No date parsing needed. `makeClusterStyleFn` reads `year` and `month` as numbers; these will be present on specimen-backed rows and null on sample-only rows. Null year/month will fall through `recencyTier` as NaN → `'older'` tier — acceptable behavior for sample-only features until Phase 65.

### Pattern 2: SelectionState Discriminated Union

**What:** Replaces `{ occurrenceIds: string[] }` with a type-tagged union
**When to use:** buildParams, parseParams, bee-atlas.ts, anywhere SelectionState is referenced

```typescript
// Source: D-08 in 64-CONTEXT.md (verified)
export type SelectionState =
  | { type: 'ids'; ids: string[] }
  | { type: 'cluster'; lon: number; lat: number; radiusM: number };
```

**buildParams encoding:**
```typescript
// Single ID
params.set('o', id);                          // o=ecdysis:1234  or  o=inat:5678
// Multiple IDs
params.set('o', ids.join(','));               // o=ecdysis:1,ecdysis:2
// Cluster centroid
params.set('o', `@${lon.toFixed(4)},${lat.toFixed(4)},${Math.ceil(radiusM)}`);  // o=@-120.5123,47.4567,312
```

**parseParams detection:**
```typescript
const oRaw = p.get('o') ?? '';
if (oRaw.startsWith('@')) {
  // cluster: @lon,lat,radiusM
  const parts = oRaw.slice(1).split(',');
  // parse lon, lat, radiusM
} else {
  // ids: comma-separated ecdysis: or inat: prefixed strings
  // IMPORTANT: current parseParams filters to only 'ecdysis:' — must extend to accept 'inat:'
}
```

**Current bug in url-state.ts (line 145):** `occurrenceIds` filter is `.filter(s => s.startsWith('ecdysis:') && s.length > 8)` — this silently drops `inat:` prefixed IDs. D-05 requires `parseParams` to accept both prefixes.

### Pattern 3: Cluster Centroid + RadiusM Calculation

**What:** Click handler computes mean centroid and max haversine distance for cluster URL encoding
**When to use:** In `bee-map.ts` click handler, when cluster contains >1 feature

```typescript
// Source: D-06 in 64-CONTEXT.md (verified)
// Use toLonLat from 'ol/proj.js' (already imported in bee-map.ts)
import { toLonLat } from 'ol/proj.js';

function clusterCentroid(features: Feature[]): { lon: number; lat: number } {
  let sumLon = 0, sumLat = 0;
  for (const f of features) {
    const [lon, lat] = toLonLat((f.getGeometry() as Point).getCoordinates());
    sumLon += lon!;
    sumLat += lat!;
  }
  return { lon: sumLon / features.length, lat: sumLat / features.length };
}

// Haversine distance (metres) for radiusM
function haversineMetres(lon1: number, lat1: number, lon2: number, lat2: number): number {
  const R = 6371000;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat/2)**2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
```

### Pattern 4: Equirectangular Spatial Restore

**What:** SQLite query to restore features from `@lon,lat,r` URL param
**When to use:** `bee-atlas.ts _restoreSelectionSamples` when SelectionState.type === 'cluster'

```typescript
// Source: 64-CONTEXT.md code_context (verified)
// wa-sqlite has no built-in trig; use equirectangular approximation
// acceptable for WA state extents and small cluster radii

const degPerMetre = 1 / 111320; // approximate
const dLat = radiusM * degPerMetre;
const dLon = radiusM * degPerMetre / Math.cos(lat * Math.PI / 180);

// SQL: bounding box pre-filter (fast), no trig needed
`SELECT * FROM occurrences
 WHERE lat BETWEEN ${lat - dLat} AND ${lat + dLat}
   AND lon BETWEEN ${lon - dLon} AND ${lon + dLon}`
// Then post-filter in JS with haversine for precision
```

### Anti-Patterns to Avoid

- **Conditional property assignment per row type:** D-03 says set all columns unconditionally. Don't repeat `EcdysisSource`'s pattern of per-property `.setProperties({...})` with explicit null coercion for each column — iterate `columnNames` instead.
- **Keeping visibleSampleIds wiring unchanged:** After Phase 64, `OccurrenceSource` features use `ecdysis:` and `inat:` IDs. `makeClusterStyleFn` checks `visibleEcdysisIds` — it only highlights `ecdysis:` prefixed IDs. Sample-only features will never match, so they render as "older" tier and unfaded even under filter. This is acceptable for Phase 64 (Phase 65 revisits).
- **Forgetting the `inat:` filter fix in parseParams:** The current filter `s.startsWith('ecdysis:') && s.length > 8` silently drops inat IDs. This must be updated to accept both prefixes or the `o=inat:5678` single-click URL param will never restore.
- **Using `layerMode` guard in click handler:** Remove the `if (this.layerMode === 'specimens') { ... } else { ... }` branching in the click handler — there is now a single layer, so the else branch (sample click) is gone.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| EPSG:3857 ↔ WGS84 conversion | Custom projection math | `toLonLat` / `fromLonLat` from `ol/proj.js` | Already imported; handles edge cases |
| Cluster feature extraction | Custom OL hit-testing | `layer.getFeatures(event.pixel)` then `.get('features')` | Existing pattern in bee-map.ts |
| Haversine | Custom formula | Inline (10 lines max) — no library needed | Simple formula; no dep justified |

**Key insight:** All OL infrastructure is already in place. This phase is a consolidation, not new infrastructure.

## occurrences Table Schema (verified from sqlite.ts)

The `occurrences` table has these columns — `OccurrenceSource` SELECT must cover all of them (or use `SELECT *`):

```
ecdysis_id INTEGER          -- null for sample-only rows
catalog_number TEXT
scientificName TEXT
recordedBy TEXT
fieldNumber TEXT
genus TEXT
family TEXT
floralHost TEXT
host_observation_id INTEGER
inat_host TEXT
inat_quality_grade TEXT
modified TEXT
specimen_observation_id INTEGER
elevation_m REAL
year INTEGER               -- from ecdysis; null for sample-only (no extraction from date currently)
month INTEGER              -- same
observation_id INTEGER     -- null for specimen-only rows
observer TEXT
specimen_count INTEGER
sample_id INTEGER
lat REAL                   -- COALESCE from Phase 62
lon REAL                   -- COALESCE from Phase 62
date TEXT
county TEXT
ecoregion_l3 TEXT
```

[VERIFIED: `frontend/src/sqlite.ts` CREATE TABLE statement, lines 66-93]

The schema also matches `scripts/validate-schema.mjs` EXPECTED columns (verified by direct read).

## Key Interaction Points Requiring Care

### 1. `_emitFilteredSummary` in bee-map.ts
Currently reads `this.specimenSource.getFeatures()`. After Phase 64 this becomes `this.occurrenceSource.getFeatures()`. The summary should still be computed only over specimen-backed features (`ecdysis_id IS NOT NULL` equivalent: features whose ID starts with `ecdysis:`).

### 2. `_buildRecentSampleEvents` in bee-map.ts
Currently reads from `this.sampleSource`. After Phase 64, this must read from `this.occurrenceSource` filtering for features with `observation_id != null` (or ID starting with `inat:`). The date string format may differ: `EcdysisSource` uses the `date` column directly (ISO date from occurrences table); the sample date parsing in the old `SampleSource` used `new Date(String(obj.date))`. The unified `occurrences.date` column is ISO format — same parsing works.

### 3. `data-loaded` vs `sample-data-loaded` events
Currently two separate events fire when each source loads. After Phase 64, there is one source. `data-loaded` should fire once when `OccurrenceSource` loads, carrying both summary (from specimen-backed features) and `recentEvents` (from sample-backed features) in a single event — OR keep two events but fire both from the single source's `once('change')` handler. The simplest approach: fire `data-loaded` once with the combined data (summary + taxaOptions), then compute and emit `sample-data-loaded` from the same handler. Alternatively, fire both events sequentially from one handler.

### 4. `visibleSampleIds` property on bee-map.ts
After Phase 64, `sampleLayer` is gone but `visibleSampleIds` is still passed from `bee-atlas.ts` (per D-09, `layerMode` stays). The property can remain as dead input on `bee-map.ts` for Phase 65 cleanup. Remove only the `sampleSource.changed()` call in `updated()`.

### 5. Cluster `distance` parameter
Current value is `40`. The context says target ~20px. OL `distance` is in pixels. Setting `distance: 20` with `minDistance: 5` would produce tighter clusters. The 44px minimum tap target is enforced in `makeClusterStyleFn` by clamping radius: `const radius = Math.max(22, displayCount <= 1 ? 4 : 6 + Math.log2(...) * 2)`. Note: OL radius is in CSS pixels, and a 44px touch target requires radius ≥ 22px.

## Common Pitfalls

### Pitfall 1: `parseParams` only accepts `ecdysis:` IDs
**What goes wrong:** `inat:` prefixed single-click IDs silently dropped on URL parse — sidebar never restores for sample-only clicks.
**Why it happens:** Line 145 of url-state.ts: `.filter(s => s.startsWith('ecdysis:') && s.length > 8)`.
**How to avoid:** Update filter to `s.startsWith('ecdysis:') || s.startsWith('inat:')`.
**Warning signs:** url-state.test.ts has no test for `inat:` round-trip — add one.

### Pitfall 2: NaN year/month on sample-only features
**What goes wrong:** `recencyTier(NaN, NaN)` returns `'older'` (since NaN comparisons always false). Features render as gray dots — not wrong but not ideal.
**Why it happens:** `year`/`month` columns are null for sample-only rows in the current `occurrences` table (Phase 62 chose not to extract from `date`).
**How to avoid:** Acceptable for Phase 64. Style function should guard: `if (!year || !month) return 'older';`.
**Warning signs:** Sample-only features always appearing gray even when recently collected.

### Pitfall 3: `buildSamples()` called on mixed clusters
**What goes wrong:** `buildSamples` reads `year`, `month`, `recordedBy`, `fieldNumber` — all null for sample-only features. The key `undefined-undefined-undefined-undefined` would merge all sample-only features into one Sample entry.
**Why it happens:** `buildSamples` was designed only for specimen features.
**How to avoid:** Filter `toShow` to only specimen-backed features before calling `buildSamples`: `const specimenFeatures = toShow.filter(f => String(f.getId()).startsWith('ecdysis:'))`. Emit the full `occIds` list but only pass `specimenFeatures` to `buildSamples`. Note: Phase 64 context says "sample-only clusters will have null species data until Phase 65" — this is the expected behavior.
**Warning signs:** All sample-only features collapsed into one entry in the sidebar.

### Pitfall 4: Two data-loaded events become one
**What goes wrong:** `bee-atlas.ts` calls `_loadCollectorOptions()` from both `_onDataLoaded` and `_onSampleDataLoaded` — after Phase 64 with one source, if only `data-loaded` fires, `_loading` may not be set to false correctly.
**Why it happens:** Current flow: `data-loaded` sets `_loading = false`; `sample-data-loaded` also sets `_loading = false` and calls `_loadCollectorOptions()`.
**How to avoid:** After Phase 64, fire both events from `OccurrenceSource`'s load handler, or consolidate into a single `data-loaded` that carries both sets of data. The simpler fix: fire `data-loaded` once; eliminate `sample-data-loaded`; call `_loadCollectorOptions()` from `_onDataLoaded` only.

### Pitfall 5: Stale `this.specimenSource` / `this.sampleSource` references
**What goes wrong:** `_emitFilteredSummary()` and `_buildRecentSampleEvents()` still reference `this.specimenSource` and `this.sampleSource` — compile error or runtime null reference.
**Why it happens:** Both methods in bee-map.ts are not listed in CONTEXT.md's "Source Files to Modify" change list but reference the old fields.
**How to avoid:** Rename `this.specimenSource` → `this.occurrenceSource`. Update `_emitFilteredSummary` to filter features by ID prefix. Update `_buildRecentSampleEvents` to filter features from `this.occurrenceSource`.

## Code Examples

### Filter features by type from OccurrenceSource
```typescript
// Source: direct analysis of features.ts / bee-map.ts patterns (verified)
const allFeatures = this.occurrenceSource.getFeatures();
const specimenFeatures = allFeatures.filter(f => String(f.getId()).startsWith('ecdysis:'));
const sampleFeatures = allFeatures.filter(f => String(f.getId()).startsWith('inat:'));
```

### Equirectangular bounding box query for cluster restore
```typescript
// Source: 64-CONTEXT.md code_context (verified)
const degPerMetre = 1 / 111320;
const dLat = radiusM * degPerMetre;
const dLon = radiusM * degPerMetre / Math.cos(lat * Math.PI / 180);
// Pre-filter with bounding box, then haversine post-filter in JS
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `EcdysisSource` + `SampleSource` | `OccurrenceSource` | Phase 64 | Single VectorSource, single cluster layer |
| `specimenLayer` + `sampleLayer` | single `VectorLayer` | Phase 64 | `layerMode` visibility toggling removed |
| `o=ecdysis:1,ecdysis:2,...` (unbounded) | `o=@lon,lat,r` for clusters | Phase 64 | Fixes URL length overflow bug |
| SelectionState flat `{ occurrenceIds }` | Discriminated union | Phase 64 | Type-safe cluster vs individual encoding |

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `year`/`month` are null (not extracted from `date`) for sample-only rows in `occurrences` table | NaN year/month pitfall | If year/month ARE populated for samples, recency coloring works better than documented — no harm |
| A2 | `wa-sqlite` has no `sin`/`cos` built-in trig functions | Equirectangular spatial restore | If trig IS available, haversine query could be done in SQL; fallback (bounding box + JS) still works |

## Open Questions

1. **Single `data-loaded` event or keep two events?**
   - What we know: `bee-atlas.ts` has separate handlers for `data-loaded` and `sample-data-loaded`; both set `_loading = false`; both call `_loadCollectorOptions()`
   - What's unclear: Whether the planner should consolidate into one event or keep two (fired sequentially from one handler)
   - Recommendation: Consolidate into one `data-loaded` event; simplest and eliminates the double-call problem. The event detail can carry both `summary`/`taxaOptions` and `recentEvents`.

2. **`_emitFilteredSummary` — include sample-only in filtered count?**
   - What we know: Currently only counts specimen-backed features; `computeSummary` reads `scientificName` / `genus` / `family` (null on sample-only rows)
   - What's unclear: Whether filtered summary should count sample-only occurrences at all
   - Recommendation: Keep filtering to `ecdysis:`-prefixed features for summary (Phase 65 will revisit when `<bee-occurrence-detail>` is added). `visibleEcdysisIds` remains the filter highlight set.

## Environment Availability

Step 2.6: SKIPPED (no new external dependencies — all tools are already installed as part of Phase 63).

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest (frontend) |
| Config file | `frontend/vitest.config.ts` (or package.json scripts) |
| Quick run command | `cd frontend && npm test -- --run` |
| Full suite command | `cd frontend && npm test` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| OCC-07 | OccurrenceSource replaces EcdysisSource+SampleSource | unit (structural) | `cd frontend && npm test -- --run` | Tests need mock updates |
| OCC-07 | Feature IDs follow `ecdysis:<int>` / `inat:<int>` convention | unit | `cd frontend && npm test -- --run url-state` | Partially — need new inat: round-trip test |
| D-06/D-07 | `@lon,lat,r` URL encoding round-trip | unit | `cd frontend && npm test -- --run url-state` | ❌ Wave 0 — add to url-state.test.ts |
| D-08 | SelectionState discriminated union type | unit | `cd frontend && npm test -- --run url-state` | ❌ Wave 0 |

### Sampling Rate
- **Per task commit:** `cd frontend && npm test -- --run`
- **Per wave merge:** `cd frontend && npm test -- --run`
- **Phase gate:** Full suite green before `/gsd-verify-work`

### Wave 0 Gaps
- [ ] `url-state.test.ts` — add `@lon,lat,r` round-trip encode/decode tests (OCC-07, D-06/D-07)
- [ ] `url-state.test.ts` — add `inat:` prefix single-ID round-trip test (D-05)
- [ ] `bee-atlas.test.ts` — update `vi.mock('../features.ts')` to export `OccurrenceSource` instead of `EcdysisSource`/`SampleSource`
- [ ] `bee-header.test.ts`, `bee-filter-toolbar.test.ts`, `bee-sidebar.test.ts`, `bee-table.test.ts` — same mock update

## Security Domain

This phase involves no authentication, session management, or input validation beyond what already exists. The haversine/equirectangular URL parameter parsing accepts lon/lat/radiusM floats — these should be validated with range checks (lon: ±180, lat: ±90, radiusM: positive integer ≤ reasonable cap such as 100000) in `parseParams` to prevent degenerate queries. This is a low-risk XSS/injection surface since the values go into arithmetic, not SQL string interpolation.

## Sources

### Primary (HIGH confidence)
- `frontend/src/features.ts` — EcdysisSource and SampleSource patterns read directly
- `frontend/src/bee-map.ts` — full source read; all interaction points identified
- `frontend/src/url-state.ts` — full source read; current SelectionState type identified; inat: filter bug confirmed
- `frontend/src/bee-atlas.ts` — full source read; all event handlers and SelectionState usage confirmed
- `frontend/src/style.ts` — full source read; makeClusterStyleFn radius formula identified
- `frontend/src/sqlite.ts` — full source read; occurrences table schema verified
- `frontend/src/filter.ts` — queryVisibleIds pattern verified; still returns { ecdysis, samples }
- `scripts/validate-schema.mjs` — authoritative column list verified
- `.planning/phases/64-occurrencesource/64-CONTEXT.md` — all decisions read

### Secondary (MEDIUM confidence)
- `.planning/REQUIREMENTS.md` — OCC-07 requirements verified
- `.planning/phases/62-pipeline-join/62-RESEARCH.md` — Phase 62 decisions confirmed

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all libraries already in use; no new dependencies
- Architecture: HIGH — source files read directly; all interaction points traced
- Pitfalls: HIGH — identified by tracing current code paths through the proposed change

**Research date:** 2026-04-17
**Valid until:** 2026-05-17 (stable project; no upstream churn expected)
