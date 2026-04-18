# Phase 64: OccurrenceSource - Pattern Map

**Mapped:** 2026-04-17
**Files analyzed:** 8 (5 source + 6 test files, minus overlap)
**Analogs found:** 8 / 8

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|
| `frontend/src/features.ts` | service | CRUD (SQLite read) | `frontend/src/features.ts` (EcdysisSource + SampleSource) | exact — replace in-place |
| `frontend/src/bee-map.ts` | component | event-driven | `frontend/src/bee-map.ts` current state | exact — modify in-place |
| `frontend/src/url-state.ts` | utility | transform | `frontend/src/url-state.ts` current state | exact — modify in-place |
| `frontend/src/bee-atlas.ts` | component | event-driven | `frontend/src/bee-atlas.ts` current state | exact — modify in-place |
| `frontend/src/style.ts` | utility | transform | `frontend/src/style.ts` (makeClusterStyleFn) | exact — modify in-place |
| `frontend/src/tests/url-state.test.ts` | test | request-response | `frontend/src/tests/url-state.test.ts` current tests | exact — extend in-place |
| `frontend/src/tests/bee-atlas.test.ts` | test | request-response | `frontend/src/tests/bee-atlas.test.ts` current mock | exact — update mock |
| `frontend/src/tests/bee-*.test.ts` (4 files) | test | request-response | `frontend/src/tests/bee-atlas.test.ts` mock pattern | exact — same mock update |

---

## Pattern Assignments

### `frontend/src/features.ts` — add OccurrenceSource, delete EcdysisSource + SampleSource

**Analog:** `frontend/src/features.ts` lines 1-63 (EcdysisSource)

**Imports pattern** (lines 1-8 — keep all, no additions needed):
```typescript
import { getDB, tablesReady } from './sqlite.ts';
import { Feature } from "ol";
import Point from "ol/geom/Point.js";
import { fromLonLat } from "ol/proj.js";
import { Vector as VectorSource } from 'ol/source.js';
import { all } from 'ol/loadingstrategy.js';
import type { Extent } from "ol/extent.js";
import type { Projection } from "ol/proj.js";
```

**Core loader pattern** — copy EcdysisSource constructor structure (lines 10-63), then change:
1. Class name: `EcdysisSource` → `OccurrenceSource`
2. SQL: explicit column list → `SELECT * FROM occurrences`
3. Null-guard: `obj.longitude == null || obj.latitude == null` → `obj.lat == null || obj.lon == null`
4. Geometry: `fromLonLat([Number(obj.longitude), Number(obj.latitude)])` → `fromLonLat([Number(obj.lon), Number(obj.lat)])`
5. Feature ID branch (D-04):
```typescript
// Replace: feature.setId(`ecdysis:${obj.ecdysis_id}`);
if (obj.ecdysis_id != null) {
  feature.setId(`ecdysis:${obj.ecdysis_id}`);
} else {
  feature.setId(`inat:${Number(obj.observation_id)}`);
}
```
6. Properties — iterate columnNames unconditionally (D-03), not a hand-written per-column object:
```typescript
// Replace: feature.setProperties({ year: Number(obj.year), month: Number(obj.month), ... })
const props: Record<string, unknown> = {};
for (const col of columnNames) {
  props[col] = obj[col] ?? null;
}
feature.setProperties(props);
```
7. Debug log: `Adding ${features.length} ecdysis features` → `Adding ${features.length} occurrence features`

**Error handling pattern** (lines 56-58 — copy verbatim):
```typescript
} catch (err: unknown) {
  if (onError) onError(err instanceof Error ? err : new Error(String(err)));
  failure();
}
```

**Deletion:** Remove the entire `SampleSource` class (lines 65-111).

---

### `frontend/src/bee-map.ts` — single Cluster→VectorLayer, new click handler, remove layerMode visibility gating

**Analog:** `frontend/src/bee-map.ts` current file

**Imports changes** (lines 6-11):
```typescript
// Remove:
import { EcdysisSource } from "./features.ts";
import { SampleSource } from './features.ts';
import { makeClusterStyleFn, makeSampleDotStyleFn } from "./style.ts";
// Add:
import { OccurrenceSource } from "./features.ts";
import { makeClusterStyleFn } from "./style.ts";
```

**Instance field changes** (lines 132-136):
```typescript
// Remove:
private specimenSource!: EcdysisSource;
private clusterSource!: Cluster;
private specimenLayer!: VectorLayer;
private sampleSource!: SampleSource;
private sampleLayer!: VectorLayer;

// Replace with:
private occurrenceSource!: OccurrenceSource;
private clusterSource!: Cluster;
private occurrenceLayer!: VectorLayer;
```

**updated() changes** (lines 236-288):

Remove the `sampleSource?.changed()` call in the `visibleEcdysisIds/visibleSampleIds` block (line 242). Remove the `layerMode` visibility block (lines 255-258):
```typescript
// DELETE this block entirely:
if (changedProperties.has('layerMode')) {
  this.specimenLayer?.setVisible(this.layerMode === 'specimens');
  this.sampleLayer?.setVisible(this.layerMode === 'samples');
}
```
The `clusterSource?.changed()` and `_emitFilteredSummary()` calls stay.

**_emitFilteredSummary changes** (lines 290-309) — rename source reference:
```typescript
// Before:
if (this.visibleEcdysisIds !== null && this.specimenSource) {
  const allFeatures = this.specimenSource.getFeatures();
// After:
if (this.visibleEcdysisIds !== null && this.occurrenceSource) {
  const allFeatures = this.occurrenceSource.getFeatures().filter(
    f => String(f.getId()).startsWith('ecdysis:')
  );
```
Note: filter to specimen-backed features only before `computeSummary`, per research recommendation §1.

**_buildRecentSampleEvents changes** (lines 311-335) — rename source and keep date parsing:
```typescript
// Before:
return this.sampleSource.getFeatures()
// After:
return this.occurrenceSource.getFeatures()
  .filter(f => String(f.getId()).startsWith('inat:'))
```

**firstUpdated source/layer construction** (lines 337-388):
```typescript
// Replace EcdysisSource + SampleSource setup with:
this.occurrenceSource = new OccurrenceSource({
  onError: (err) => this._emit('data-error', { message: err.message }),
});
this.clusterSource = new Cluster({
  distance: 20,    // D-02: tighter clusters (was 40)
  minDistance: 5,
  source: this.occurrenceSource,
});
this.occurrenceLayer = new VectorLayer({
  source: this.clusterSource,
  style: makeClusterStyleFn(() => this.visibleEcdysisIds, () => this.selectedOccIds),
});
```

Map layers array (lines 360-373) — remove `sampleLayer`, keep `occurrenceLayer`:
```typescript
layers: [
  new TileLayer({ source: new StadiaMaps({ layer: 'outdoors', retina: true }) }),
  new LayerGroup(),
  this.occurrenceLayer,
  regionLayer,
],
```

Remove the sampleLayer initial visibility setup (lines 382-387).

**Single data-loaded event** — merge the two `once('change')` handlers into one. Fire `data-loaded` with both `summary`/`taxaOptions` and `recentEvents`:
```typescript
// Copy pattern from specimenSource once('change') handler (lines 402-410), then extend:
this.occurrenceSource.once('change', () => {
  const features = this.occurrenceSource.getFeatures();
  if (features.length === 0) return;
  const specimenFeatures = features.filter(f => String(f.getId()).startsWith('ecdysis:'));
  this._emit('data-loaded', {
    summary: computeSummary(specimenFeatures),
    taxaOptions: buildTaxaOptions(specimenFeatures),
    recentEvents: this._buildRecentSampleEvents(),
  });
});
// Remove: the sampleSource on('change', onSampleLoaded) handler (lines 413-420)
```

**Click handler** (lines 447-515) — remove the `layerMode` branch entirely. Keep only the specimen branch logic, adapted for `occurrenceLayer`:
```typescript
this.map.on('click', async (event: MapBrowserEvent) => {
  if (event.dragging) return;
  const hits = await this.occurrenceLayer.getFeatures(event.pixel);
  if (hits.length) {
    const inner: Feature[] = (hits[0].get('features') as Feature[]) ?? [hits[0] as unknown as Feature];
    const toShow = this.visibleEcdysisIds !== null
      ? inner.filter(f => this.visibleEcdysisIds!.has(f.getId() as string))
      : inner;
    if (toShow.length === 0) return;
    // D-06/D-08: single vs cluster encoding
    if (toShow.length === 1) {
      const specimenFeatures = toShow.filter(f => String(f.getId()).startsWith('ecdysis:'));
      this._emit('map-click-occurrence', {
        occIds: toShow.map(f => f.getId() as string),
        samples: buildSamples(specimenFeatures),
      });
    } else {
      // Cluster: compute centroid + radiusM
      // (inline haversine — see Pattern 3 in RESEARCH.md)
      this._emit('map-click-occurrence', {
        occIds: toShow.map(f => f.getId() as string),
        centroid: clusterCentroid(toShow),
        radiusM: maxHaversineMetres(toShow),
      });
    }
    return;
  }
  // Boundary and empty-click logic unchanged (copy lines 463-514, collapsed)
});
```

---

### `frontend/src/url-state.ts` — SelectionState discriminated union; @lon,lat,r encoding

**Analog:** `frontend/src/url-state.ts` current file

**SelectionState type change** (lines 9-11):
```typescript
// Before:
export interface SelectionState {
  occurrenceIds: string[];
}

// After (D-08):
export type SelectionState =
  | { type: 'ids'; ids: string[] }
  | { type: 'cluster'; lon: number; lat: number; radiusM: number };
```

**buildParams selection block** (lines 45-47) — replace:
```typescript
// Before:
if (selection.occurrenceIds.length > 0) {
  params.set('o', selection.occurrenceIds.join(','));
}

// After (D-05 / D-06):
if (selection.type === 'ids' && selection.ids.length > 0) {
  params.set('o', selection.ids.join(','));
} else if (selection.type === 'cluster') {
  params.set('o', `@${selection.lon.toFixed(4)},${selection.lat.toFixed(4)},${Math.ceil(selection.radiusM)}`);
}
```

**parseParams selection block** (lines 142-149) — replace:
```typescript
// Before:
const oRaw = p.get('o') ?? '';
const occurrenceIds = oRaw
  ? oRaw.split(',').map(s => s.trim()).filter(s => s.startsWith('ecdysis:') && s.length > 8)
  : [];
if (occurrenceIds.length > 0) {
  result.selection = { occurrenceIds };
}

// After (D-05 / D-06 / D-07 — fix inat: bug):
const oRaw = p.get('o') ?? '';
if (oRaw.startsWith('@')) {
  const parts = oRaw.slice(1).split(',');
  if (parts.length === 3) {
    const lon = parseFloat(parts[0]!);
    const lat = parseFloat(parts[1]!);
    const radiusM = parseInt(parts[2]!, 10);
    if (isFinite(lon) && lon >= -180 && lon <= 180 &&
        isFinite(lat) && lat >= -90  && lat <= 90  &&
        isFinite(radiusM) && radiusM > 0 && radiusM <= 100000) {
      result.selection = { type: 'cluster', lon, lat, radiusM };
    }
  }
} else if (oRaw) {
  // D-05: accept both ecdysis: and inat: prefixes (fixes the ecdysis:-only bug on line 145)
  const ids = oRaw.split(',').map(s => s.trim())
    .filter(s => (s.startsWith('ecdysis:') || s.startsWith('inat:')) && s.length > 5);
  if (ids.length > 0) {
    result.selection = { type: 'ids', ids };
  }
}
```

**AppState.selection type** — `SelectionState` type change cascades; no other structural changes in this file.

---

### `frontend/src/bee-atlas.ts` — _restoreSelectionSamples spatial path; SelectionState propagation

**Analog:** `frontend/src/bee-atlas.ts` current file

**_pushUrlState** (lines 430-443) — update SelectionState construction:
```typescript
// Before:
{ occurrenceIds: this._selectedOccIds ?? [] },
// After (D-08):
this._selectedOccIds
  ? { type: 'ids' as const, ids: this._selectedOccIds }
  : (this._selectedCluster
      ? { type: 'cluster' as const, ...this._selectedCluster }
      : { type: 'ids' as const, ids: [] }),
```
Add `@state() private _selectedCluster: { lon: number; lat: number; radiusM: number } | null = null;` field.

**firstUpdated URL restore** (lines 251-255) — parse new discriminated union:
```typescript
// Before:
const initOccIds = initialParams.selection?.occurrenceIds ?? [];
if (initOccIds.length > 0) {
  this._selectedOccIds = initOccIds;
  this._sidebarOpen = true;
}

// After:
const initSel = initialParams.selection;
if (initSel?.type === 'ids' && initSel.ids.length > 0) {
  this._selectedOccIds = initSel.ids;
  this._sidebarOpen = true;
} else if (initSel?.type === 'cluster') {
  this._selectedCluster = { lon: initSel.lon, lat: initSel.lat, radiusM: initSel.radiusM };
  this._sidebarOpen = true;
}
```

**_onDataLoaded** (lines 723-743) — extend to handle cluster restore:
```typescript
// Existing ecdysis restore:
if (this._selectedOccIds && this._selectedOccIds.length > 0 && this._selectedSamples === null) {
  this._restoreSelectionSamples(this._selectedOccIds);
}
// Add cluster restore:
if (this._selectedCluster && this._selectedSamples === null) {
  this._restoreClusterSelection(this._selectedCluster);
}
```

**_restoreSelectionSamples** (lines 745-792) — extend to accept `inat:` IDs (D-07):
The current method filters to `ecdysis:` only. Add a parallel path for `inat:` IDs, or extend the existing query to use the `occurrences` table for both prefix types. The simplest extension: after collecting `ecdysisIds`, also collect `inatObsIds` from `inat:` prefixed IDs and query `WHERE CAST(ecdysis_id AS TEXT) IN (...) OR CAST(observation_id AS TEXT) IN (...)`.

**New method _restoreClusterSelection** — copy structure from `_restoreSelectionSamples` (lines 745-792), replace the specific ID query with the equirectangular bounding-box query from RESEARCH.md §Pattern 4:
```typescript
private async _restoreClusterSelection({ lon, lat, radiusM }: { lon: number; lat: number; radiusM: number }) {
  // Copy try/catch/getDB pattern from _restoreSelectionSamples (lines 750-791)
  const degPerMetre = 1 / 111320;
  const dLat = radiusM * degPerMetre;
  const dLon = radiusM * degPerMetre / Math.cos(lat * Math.PI / 180);
  // Bounding-box query, then JS haversine post-filter
  // Build Sample map using same key pattern as _restoreSelectionSamples
}
```

**_onSampleDataLoaded handler** (lines 718-721) — delete this method; consolidate into `_onDataLoaded` which now receives `recentEvents` in the event detail.

**_onPopState** (lines 445-503) — update selection restore to mirror firstUpdated pattern above.

**Event listener** in render template (lines 174-176): replace `@map-click-specimen` and `@map-click-sample` with `@map-click-occurrence`.

---

### `frontend/src/style.ts` — makeClusterStyleFn minimum tap target (D-02)

**Analog:** `frontend/src/style.ts` lines 67-130 (makeClusterStyleFn)

**Radius clamp** (line 99):
```typescript
// Before:
const radius = displayCount <= 1 ? 4 : 6 + Math.log2(Math.max(displayCount, 1)) * 2;

// After (D-02: minimum 22px radius = 44px tap target):
const rawRadius = displayCount <= 1 ? 4 : 6 + Math.log2(Math.max(displayCount, 1)) * 2;
const radius = Math.max(rawRadius, 22);
// Note: single non-clustered features (displayCount === 1) keep radius 4 — 
// they are individual dots, not cluster tap targets. The 44px minimum applies
// only to actual cluster dots (displayCount > 1).
```

For single-feature dots, keep radius 4 to preserve visual distinction. Only clamp clusters:
```typescript
const radius = displayCount <= 1 ? 4 : Math.max(22, 6 + Math.log2(Math.max(displayCount, 1)) * 2);
```

No other changes to `style.ts`. `makeSampleDotStyleFn` stays (Phase 65 cleanup per D-09).

---

### `frontend/src/tests/url-state.test.ts` — add @lon,lat,r round-trip tests

**Analog:** `frontend/src/tests/url-state.test.ts` lines 69-75 (occurrenceIds round-trip test)

**New defaultSelection** — update from `{ occurrenceIds: [] }` to match the new discriminated union:
```typescript
// Before (line 22):
const defaultSelection = { occurrenceIds: [] as string[] };

// After:
const defaultSelection: SelectionState = { type: 'ids', ids: [] };
```

**Update existing occurrenceIds test** (lines 69-75):
```typescript
// Before:
const selection = { occurrenceIds: ['ecdysis:123', 'ecdysis:456'] };
// ...
expect(result.selection?.occurrenceIds).toEqual(['ecdysis:123', 'ecdysis:456']);

// After:
const selection: SelectionState = { type: 'ids', ids: ['ecdysis:123', 'ecdysis:456'] };
// ...
expect(result.selection).toEqual({ type: 'ids', ids: ['ecdysis:123', 'ecdysis:456'] });
```

**New tests to add** (copy test structure from lines 69-75):
```typescript
test('inat: prefixed single ID round-trips (D-05)', () => {
  const selection: SelectionState = { type: 'ids', ids: ['inat:5678'] };
  const params = buildParams(defaultView, emptyFilter(), selection, defaultUi);
  expect(params.get('o')).toBe('inat:5678');
  const result = parseParams(params.toString());
  expect(result.selection).toEqual({ type: 'ids', ids: ['inat:5678'] });
});

test('cluster centroid encodes as @lon,lat,r (D-06)', () => {
  const selection: SelectionState = { type: 'cluster', lon: -120.5123, lat: 47.4567, radiusM: 312 };
  const params = buildParams(defaultView, emptyFilter(), selection, defaultUi);
  expect(params.get('o')).toBe('@-120.5123,47.4567,312');
  const result = parseParams(params.toString());
  expect(result.selection).toEqual({ type: 'cluster', lon: -120.5123, lat: 47.4567, radiusM: 312 });
});

test('cluster with fractional radiusM rounds up (D-06)', () => {
  const selection: SelectionState = { type: 'cluster', lon: -120.0, lat: 47.0, radiusM: 100.7 };
  const params = buildParams(defaultView, emptyFilter(), selection, defaultUi);
  expect(params.get('o')).toBe('@-120.0000,47.0000,101');
});

test('invalid @lon,lat,r with out-of-range lon: selection undefined', () => {
  const result = parseParams('o=@999,47,100');
  expect(result.selection).toBeUndefined();
});
```

**Update combined round-trip test** (line 146):
```typescript
// Before:
const selection = { occurrenceIds: ['ecdysis:999'] };
// After:
const selection: SelectionState = { type: 'ids', ids: ['ecdysis:999'] };
// Update assertion (line 164):
expect(result.selection).toEqual({ type: 'ids', ids: ['ecdysis:999'] });
```

---

### `frontend/src/tests/bee-atlas.test.ts` (and 4 sibling test files) — update OccurrenceSource mock

**Analog:** `frontend/src/tests/bee-atlas.test.ts` lines 15-28

**Pattern to apply** — replace the two-class mock with a single `OccurrenceSource` mock:
```typescript
// Before (lines 15-28):
vi.mock('../features.ts', () => ({
  EcdysisSource: vi.fn().mockImplementation(() => ({
    once: vi.fn(),
    on: vi.fn(),
    getFeatures: vi.fn(() => []),
    un: vi.fn(),
  })),
  SampleSource: vi.fn().mockImplementation(() => ({
    once: vi.fn(),
    on: vi.fn(),
    getFeatures: vi.fn(() => []),
    un: vi.fn(),
  })),
}));

// After:
vi.mock('../features.ts', () => ({
  OccurrenceSource: vi.fn().mockImplementation(() => ({
    once: vi.fn(),
    on: vi.fn(),
    getFeatures: vi.fn(() => []),
    un: vi.fn(),
  })),
}));
```

Apply the same replacement to all four sibling test files:
- `frontend/src/tests/bee-header.test.ts`
- `frontend/src/tests/bee-filter-toolbar.test.ts`
- `frontend/src/tests/bee-sidebar.test.ts`
- `frontend/src/tests/bee-table.test.ts`

---

## Shared Patterns

### SQLite query pattern
**Source:** `frontend/src/bee-atlas.ts` lines 307-321 (`_loadSummaryFromSQLite`)
**Apply to:** `OccurrenceSource` loader, `_restoreClusterSelection`
```typescript
await tablesReady;
const { sqlite3, db } = await getDB();
const rows: Record<string, unknown>[] = [];
await sqlite3.exec(db, `SELECT ... FROM occurrences WHERE ...`,
  (rowValues: unknown[], columnNames: string[]) => {
    rows.push(Object.fromEntries(columnNames.map((col, i) => [col, rowValues[i]])));
  }
);
```

### Custom event emission
**Source:** `frontend/src/bee-map.ts` lines 192-196
**Apply to:** All new events emitted from `bee-map.ts`
```typescript
private _emit<T>(name: string, detail?: T) {
  this.dispatchEvent(new CustomEvent(name, {
    bubbles: true, composed: true, detail,
  }));
}
```

### Filter generation guard (async race prevention)
**Source:** `frontend/src/bee-atlas.ts` lines 296-303
**Apply to:** `_restoreClusterSelection` if it becomes async
```typescript
const generation = ++this._filterQueryGeneration;
const result = await someAsyncQuery();
if (generation !== this._filterQueryGeneration) return; // discard stale result
```

### OL projection helpers
**Source:** `frontend/src/bee-map.ts` line 5
**Apply to:** Centroid/haversine calculation in `bee-map.ts` click handler
```typescript
import { fromLonLat, toLonLat } from "ol/proj.js";
// Usage: const [lon, lat] = toLonLat((f.getGeometry() as Point).getCoordinates());
```

---

## No Analog Found

All files have close analogs in the codebase. No files require falling back to RESEARCH.md patterns exclusively.

The haversine and equirectangular distance functions are new inline utilities (10-15 lines each), but they follow the same inline helper pattern already used in `bee-map.ts` (e.g., `buildSamples`, `computeSummary`, `buildTaxaOptions` at lines 29-97). No new file is needed.

---

## Key Cross-Cutting Concerns

### SelectionState type propagation
The `SelectionState` type change in `url-state.ts` cascades to every call site of `buildParams` and every read of `result.selection`. Call sites:
- `bee-atlas.ts` `_pushUrlState` (line 432) — update `{ occurrenceIds: ... }` to discriminated union
- `bee-atlas.ts` `firstUpdated` (line 251) — update `initialParams.selection?.occurrenceIds` read
- `bee-atlas.ts` `_onPopState` (line 484) — update `parsed.selection?.occurrenceIds` read
- `url-state.test.ts` — update `defaultSelection` and all `selection.occurrenceIds` assertions

### `sample-data-loaded` event elimination
`bee-map.ts` currently emits two events (`data-loaded` and `sample-data-loaded`). After Phase 64 with a single source, fire one `data-loaded` event carrying `{ summary, taxaOptions, recentEvents }`. Consequences:
- `bee-atlas.ts` render template: remove `@sample-data-loaded=${this._onSampleDataLoaded}` listener
- `bee-atlas.ts`: delete `_onSampleDataLoaded` method (lines 718-721)
- `bee-atlas.ts` `_onDataLoaded`: add `recentEvents` handling from event detail

### `buildSamples` specimen-only guard
Every call to `buildSamples(toShow)` in `bee-map.ts` must pre-filter `toShow` to specimen-backed features:
```typescript
const specimenFeatures = toShow.filter(f => String(f.getId()).startsWith('ecdysis:'));
buildSamples(specimenFeatures)
```

---

## Metadata

**Analog search scope:** `frontend/src/` (all TypeScript source + tests)
**Files scanned:** 8 source files read in full
**Pattern extraction date:** 2026-04-17
