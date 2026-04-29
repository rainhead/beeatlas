# Phase 71: Base Map and Occurrence Layer - Research

**Researched:** 2026-04-26
**Domain:** Mapbox GL JS v3 migration, GeoJSON clustering, Lit web component integration
**Confidence:** HIGH

## Summary

Phase 71 replaces OpenLayers with Mapbox GL JS v3 for the basemap and occurrence clustering layers. The migration is technically straightforward -- Mapbox GL JS has mature clustering APIs with `clusterProperties` for recency-tier aggregation, built-in TypeScript types, and declarative layer styling. However, three critical findings require plan adjustments:

**Bundle size reality:** Mapbox GL JS v3.22.0 does NOT reduce bundle size. It produces ~2,249 KB minified / ~524 KB gzip via Vite, compared to tree-shaken OL at ~406 KB / ~102 KB gzip. The current full main bundle is 528 KB / 152 KB gzip. The roadmap claim of "cut ~400 KB from the main bundle" is incorrect. The migration increases JS payload. The true value proposition is WebGL rendering performance at 250K+ points and Mapbox ecosystem features (3D terrain, geocoding). [VERIFIED: Vite build measurements in /tmp/mapbox-size-test]

**Filtering with clusters:** Mapbox GL JS has no dynamic source-level `setFilter()` for GeoJSON sources. The `filter` property on the source spec is set at initialization only. For `visibleIds` filtering (which must affect clustering), the approach is `source.setData(filteredGeoJSON)` -- replacing the entire FeatureCollection. At ~50K features this takes ~50-100ms on the worker thread and causes a brief re-cluster. This is fundamentally different from OL's approach where the style function simply reads `visibleIds` per feature. [VERIFIED: GitHub issue #10722, Mapbox GL JS style spec docs]

**Shadow DOM CSS:** Mapbox GL JS CSS does not automatically apply inside Shadow DOM. The existing `?raw` import pattern used for OL CSS (`import cssText from 'mapbox-gl/dist/mapbox-gl.css?raw'`) works -- inject via `<style>` tag in the render template. Additionally, Mapbox GL JS has a known issue (#13355) with incorrect canvas dimensions when CSS transforms are applied outside the shadow root, but BeeAtlas does not use transforms on the map container, so this is not a blocker. [VERIFIED: GitHub issues #7814, #13355]

**Primary recommendation:** Use `setData()` for filtering (not layer-level `setFilter`), `clusterProperties` for recency aggregation, `promoteId: 'occId'` for string-based feature-state selection highlighting, and `mapbox-gl/dist/mapbox-gl.css?raw` for Shadow DOM CSS injection.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Basemap rendering | Browser (WebGL via Mapbox GL JS) | CDN (vector tile serving by Mapbox) | Map rendering is client-side WebGL; tiles come from Mapbox CDN |
| Occurrence clustering | Browser (Mapbox worker thread) | -- | Supercluster runs in Mapbox's web worker |
| Recency coloring | Browser (Mapbox expressions) | -- | Declarative paint expressions evaluate per-feature |
| Filter application | Browser (GeoJSON source setData) | -- | Pre-filter GeoJSON then push to Mapbox source |
| Selection highlighting | Browser (feature-state) | -- | setFeatureState for per-feature selection ring |
| View state sync | Browser (Lit + URL API) | -- | Map moveend event -> URL push (same as OL) |
| Token management | Static config (Vite env var) | CDN (URL restriction in Mapbox dashboard) | Token baked at build time, restricted by referrer |
| Data loading | Browser (SQLite WASM) | CDN (parquet file) | Same as current -- SQLite -> GeoJSON conversion |

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| mapbox-gl | 3.22.0 | WebGL map rendering, vector tiles, clustering | Official Mapbox GL JS, built-in TS types since v3.5 [VERIFIED: npm registry] |
| lit | 3.2.1 | Web component framework | Already in use, no change [VERIFIED: package.json] |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| wa-sqlite | 1.0.0 | SQLite WASM for occurrence data | Already in use, no change [VERIFIED: package.json] |
| hyparquet | 1.25.6 | Parquet file parsing | Already in use for initial data load [VERIFIED: package.json] |

### Removed (Phase 73, not this phase)
| Library | Version | Removal Reason |
|---------|---------|----------------|
| ol | 10.7.0 | Replaced by mapbox-gl |
| ol-mapbox-style | 13.2.0 | No longer needed |

**Installation:**
```bash
cd frontend && npm install mapbox-gl
```

**Version verification:**
- `mapbox-gl`: 3.22.0 [VERIFIED: npm view mapbox-gl version, 2026-04-26]
- No `@types/mapbox-gl` needed -- first-class TypeScript declarations included since v3.5 [VERIFIED: node_modules/mapbox-gl/dist/mapbox-gl.d.ts exists]

## Architecture Patterns

### System Architecture Diagram

```
                    URL params (center/zoom/filter/selection)
                              |
                              v
                    +-------------------+
                    |    bee-atlas.ts    |  (coordinator -- state owner)
                    |  _filterState     |
                    |  _visibleIds      |
                    |  _selectedOccIds  |
                    +---+--------+------+
                        |        |
              properties|        |events
                        v        ^
                    +-------------------+
                    |    bee-map.ts      |  (pure presenter -- Mapbox GL JS)
                    |                   |
                    | Shadow DOM:       |
                    | <style>CSS</style>|  <-- mapbox-gl.css injected ?raw
                    | <div id="map">    |  <-- Mapbox GL JS target
                    +--------+----------+
                             |
           +-----------------+------------------+
           |                 |                  |
    +------v------+   +------v------+   +-------v-------+
    | GeoJSON     |   | Mapbox      |   | Mapbox        |
    | source      |   | circle      |   | symbol        |
    | (clustered) |   | layers x4   |   | layer x1      |
    | setData()   |   | (clusters,  |   | (cluster-     |
    | for filter  |   |  points,    |   |  count)       |
    +---------+---+   |  ghost,     |   +---------------+
              |       |  selected)  |
              |       +-------------+
              |
       +------v------+
       | features.ts  |  (SQLite -> GeoJSON FeatureCollection)
       | loadGeoJSON() |
       +------+-------+
              |
       +------v-------+
       | sqlite.ts    |  (wa-sqlite WASM, in-memory DB)
       | tablesReady  |
       +--------------+
```

### Data Flow: Filter Application

```
User changes filter
       |
       v
bee-atlas._onFilterChanged()
       |
       +---> queryVisibleIds(filterState) -> Set<string> of matching IDs
       |
       v
bee-atlas._visibleIds = result  (Lit property change)
       |
       v
bee-map.updated() detects visibleIds changed
       |
       +---> Build filtered GeoJSON FeatureCollection (keep all features, but
       |     only include those in visibleIds set; add ghost=true to excluded)
       |
       v
map.getSource('occurrences').setData(filteredGeoJSON)
       |
       v
Mapbox re-clusters visible features; ghost layer shows filtered-out at low opacity
```

### Recommended Project Structure (changes only)
```
frontend/src/
├── bee-map.ts          # REWRITE: Mapbox GL JS map component
├── features.ts         # REWRITE: SQLite -> GeoJSON FeatureCollection
├── style.ts            # SIMPLIFY: Keep recency logic, remove OL style objects
├── region-layer.ts     # STUB: Remove OL, export no-ops for Phase 72
├── bee-atlas.ts        # MINOR: Remove OL-specific event handlers that move to Phase 72
├── env.d.ts            # NEW: Vite env var type declarations
└── mapbox-layers.ts    # NEW (optional): Mapbox layer/source configuration module
```

### Pattern 1: GeoJSON Clustered Source with Custom Aggregate Properties

**What:** Define a GeoJSON source with clustering enabled and use `clusterProperties` to aggregate recency tier counts across clustered features.
**When to use:** When clusters need to display information about their constituent features (e.g., dominant recency tier).

```typescript
// Source: https://docs.mapbox.com/mapbox-gl-js/style-spec/sources [VERIFIED: Context7]
map.addSource('occurrences', {
  type: 'geojson',
  data: geojson,
  cluster: true,
  clusterRadius: 20,
  clusterMinPoints: 2,
  clusterMaxZoom: 14,
  promoteId: 'occId',  // enables string feature IDs for feature-state
  clusterProperties: {
    freshCount:    ['+', ['case', ['==', ['get', 'recencyTier'], 'fresh'], 1, 0]],
    thisYearCount: ['+', ['case', ['==', ['get', 'recencyTier'], 'thisYear'], 1, 0]],
    olderCount:    ['+', ['case', ['==', ['get', 'recencyTier'], 'older'], 1, 0]],
  },
});
```

### Pattern 2: Recency-Based Cluster Coloring with Expressions

**What:** Use Mapbox paint expressions to pick cluster color from the dominant recency tier.
**When to use:** On the `clusters` circle layer.

```typescript
// Source: https://docs.mapbox.com/mapbox-gl-js/style-spec/expressions [VERIFIED: Context7]
map.addLayer({
  id: 'clusters',
  type: 'circle',
  source: 'occurrences',
  filter: ['has', 'point_count'],
  paint: {
    'circle-color': [
      'case',
      ['>', ['get', 'freshCount'], 0], '#2ecc71',     // fresh = green
      ['>', ['get', 'thisYearCount'], 0], '#f39c12',   // thisYear = orange
      '#7f8c8d',                                        // older = gray
    ],
    'circle-radius': [
      'step', ['get', 'point_count'],
      14,   // base radius for 2+ features
      10, 16,
      50, 20,
      200, 26,
    ],
  },
});
```

### Pattern 3: Selection Highlighting via Separate Layer

**What:** A dedicated circle layer that renders a yellow ring around selected features.
**When to use:** When `selectedOccIds` is non-null.

Two approaches, choose one:

**Approach A: Filter-based (simpler, used for small selection sets)**
```typescript
map.addLayer({
  id: 'selected-ring',
  type: 'circle',
  source: 'occurrences',
  filter: ['in', ['get', 'occId'], ['literal', [...selectedOccIds]]],
  paint: {
    'circle-radius': 10,
    'circle-color': 'transparent',
    'circle-stroke-width': 2.5,
    'circle-stroke-color': '#f1c40f',
  },
});
// Update: map.setFilter('selected-ring', newFilter)
```

**Approach B: feature-state (more performant for frequent updates)**
```typescript
// Requires promoteId: 'occId' on the source
// In paint expression:
'circle-stroke-color': [
  'case',
  ['boolean', ['feature-state', 'selected'], false],
  '#f1c40f',
  'transparent',
],
// To select:
for (const id of selectedOccIds) {
  map.setFeatureState({ source: 'occurrences', id }, { selected: true });
}
```

**Recommendation:** Use Approach A (filter-based) for Phase 71. Selection sets are small (typically < 100 IDs). feature-state requires promoteId which complicates cluster ID handling (cluster features get auto-generated numeric IDs that conflict with promoteId). [ASSUMED]

### Pattern 4: Shadow DOM CSS Injection

**What:** Import Mapbox GL CSS as raw text and inject into the Lit component's shadow DOM.
**When to use:** Always -- Mapbox GL CSS must be available inside the shadow root.

```typescript
// Source: existing OL pattern in bee-map.ts [VERIFIED: codebase]
import mapboxCssText from 'mapbox-gl/dist/mapbox-gl.css?raw';

@customElement('bee-map')
export class BeeMap extends LitElement {
  static _mapboxCss = unsafeCSS(mapboxCssText);

  render() {
    return html`
      <style>${BeeMap._mapboxCss}</style>
      <div id="map"></div>
      <!-- region menu UI unchanged -->
    `;
  }
}
```

### Pattern 5: Filtering with Clustered Source via setData

**What:** When `visibleIds` changes, rebuild GeoJSON and call `source.setData()`.
**When to use:** Every time the filter state changes.

```typescript
// Two strategies:
// Strategy A: Replace source data with only visible features
//   Pro: Clusters only contain matching features (accurate counts)
//   Con: Non-matching features disappear entirely (no ghost dots)
//   Con: Re-cluster on every filter change

// Strategy B: Keep all features, add 'ghost' property, use two source instances
//   Pro: Ghost dots remain visible at low opacity
//   Con: Two GeoJSON sources, double memory, complex sync

// Strategy C (RECOMMENDED): Keep full data, two layer sets
//   - One source with ALL features, cluster: true
//   - Ghost layer: filter to ['!', ['in', 'occId', ...visibleIds]] with low opacity
//   - Active layers: filter to ['in', 'occId', ...visibleIds]
//   - Problem: layer filters apply POST-clustering, so cluster counts include ghosted features
//   - Mitigation: Use setData() with filtered subset for the clustered source,
//     and a separate unclustered source for ghost dots

// FINAL RECOMMENDATION: Strategy A + separate ghost source
//   Source 'occurrences': setData(filteredGeoJSON) with cluster: true
//   Source 'occurrences-ghost': setData(ghostGeoJSON) with cluster: false
//   Ghost layer renders small gray dots at 0.2 opacity for excluded features
```

### Anti-Patterns to Avoid
- **Using `['in', 'occId', ...ids]` with 50K+ IDs on a layer filter:** Expressions with 50K+ literal values are slow to serialize and evaluate. Use `setData()` to pre-filter instead. [CITED: https://github.com/mapbox/mapbox-gl-js/issues/7898]
- **Using `feature-state` on clustered sources with `promoteId`:** Cluster features get auto-assigned `cluster_id` values that conflict with `promoteId`. Feature-state on clusters requires the auto-generated numeric ID, not the promoted string ID. Use a layer filter for selection instead. [ASSUMED]
- **Removing and re-adding source on filter change:** Causes visual flash. Use `source.setData()` instead -- it performs a diff internally. [CITED: https://github.com/mapbox/mapbox-gl-js/issues/10722]
- **Accessing `this.map` before the `load` event:** Mapbox GL JS style is not loaded until `map.on('load')`. Adding sources/layers before this event causes errors. [VERIFIED: Mapbox examples via Context7]

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Point clustering | Custom spatial index + merge logic | `cluster: true` on GeoJSON source | Mapbox uses Supercluster internally, runs on web worker [VERIFIED: Context7] |
| Cluster property aggregation | Post-render cluster inspection | `clusterProperties` with MapReduce expressions | Computed during clustering on worker thread [VERIFIED: Context7] |
| Recency-based paint | Imperative per-feature style function | Mapbox data-driven paint expressions (`case`, `step`) | GPU-evaluated, no main thread overhead [VERIFIED: Context7] |
| View state debounce | Custom moveend debounce | Mapbox `moveend` event (fires once per animation) | Already debounced by the library [ASSUMED] |
| Feature hit testing | Manual coordinate math | `queryRenderedFeatures(point, { layers })` | GPU-accelerated hit testing [VERIFIED: Context7] |
| GeoJSON feature ID | Manual id tracking | `promoteId: 'occId'` on GeoJSON source | Enables feature-state without numeric IDs [VERIFIED: Mapbox style spec docs] |

**Key insight:** Mapbox GL JS pushes clustering and styling to the web worker + GPU. The main thread should only prepare data (GeoJSON construction) and respond to events. Avoid imperative per-feature logic that was necessary in OL.

## Common Pitfalls

### Pitfall 1: Bundle Size Surprise
**What goes wrong:** Developer expects smaller bundle after replacing OL with Mapbox GL JS, but gets a larger one.
**Why it happens:** OL tree-shakes (~406 KB min for the features used); Mapbox GL JS is a monolith (~2,249 KB min). The roadmap mentions "cut ~400 KB" but this is incorrect for the JS bundle.
**How to avoid:** Accept the bundle size increase. The value is in rendering performance (WebGL) and ecosystem features, not bundle size. Document the actual sizes.
**Warning signs:** Build output shows larger JS chunks than before.

### Pitfall 2: Adding Sources/Layers Before Style Load
**What goes wrong:** `map.addSource()` or `map.addLayer()` throws because the style isn't loaded yet.
**Why it happens:** Mapbox GL JS constructor starts loading the style asynchronously. Code that runs synchronously after construction fails.
**How to avoid:** Always add sources and layers inside `map.on('load', () => { ... })` or `map.on('style.load', () => { ... })`. For dynamic updates, check `map.isStyleLoaded()`.
**Warning signs:** Console error "Style is not done loading" or "Cannot read properties of undefined".

### Pitfall 3: visibleIds Filter Approach
**What goes wrong:** Attempting to use `['in', 'occId', ...visibleIds]` as a layer filter with 50K+ IDs. The expression is slow to serialize and causes visible lag.
**Why it happens:** Mapbox expressions are serialized to JSON and sent to the web worker on every filter change.
**How to avoid:** Use `source.setData()` with a pre-filtered FeatureCollection. Keep the full GeoJSON in memory on the main thread. Filter in JS, then push the filtered subset.
**Warning signs:** UI freezes for 200ms+ when toggling a filter.

### Pitfall 4: Cluster Feature IDs vs Point Feature IDs
**What goes wrong:** Code assumes all features in a layer have the same ID format. Cluster features have `cluster_id` (numeric, auto-generated) while unclustered points have the promoted `occId` string.
**Why it happens:** Mapbox's Supercluster generates its own IDs for cluster features.
**How to avoid:** Always check `feature.properties.cluster` before accessing `feature.id` or `feature.properties.occId`. Cluster-specific logic uses `cluster_id`; point-specific logic uses `occId`.
**Warning signs:** `undefined` when accessing `occId` on a cluster feature; crash when calling `getClusterExpansionZoom` with a point's ID.

### Pitfall 5: Shadow DOM CSS Missing
**What goes wrong:** Map controls (zoom buttons, attribution, compass) render unstyled or invisible.
**Why it happens:** Mapbox GL JS CSS is not applied inside the Lit component's shadow root.
**How to avoid:** Import CSS with Vite's `?raw` suffix and inject into the shadow DOM via `<style>` tag in the render template. Same pattern already used for OL CSS.
**Warning signs:** Map canvas renders but controls are invisible or mispositioned.

### Pitfall 6: Map Resize After Container Change
**What goes wrong:** Map canvas does not fill its container after a layout change (e.g., switching from table mode back to map mode).
**Why it happens:** Mapbox GL JS calculates canvas dimensions once; it doesn't automatically observe container resize.
**How to avoid:** Call `map.resize()` after any layout change that affects the map container's dimensions. In `updated()`, if `viewMode` changes, schedule `requestAnimationFrame(() => this.map.resize())`.
**Warning signs:** Map appears at wrong size or has white space.

## Code Examples

### GeoJSON Construction from SQLite (features.ts rewrite)

```typescript
// Source: current features.ts pattern + Mapbox GeoJSON format [VERIFIED: codebase + Context7]
import type { FeatureCollection, Point, Feature } from 'geojson';
import { getDB, tablesReady } from './sqlite.ts';
import { recencyTier } from './style.ts';

interface OccurrenceProperties {
  occId: string;        // 'ecdysis:123' or 'inat:456'
  recencyTier: string;  // 'fresh' | 'thisYear' | 'older'
  [key: string]: unknown;
}

export async function loadOccurrenceGeoJSON(): Promise<{
  geojson: FeatureCollection<Point, OccurrenceProperties>;
  summary: DataSummary;
  taxaOptions: TaxonOption[];
}> {
  await tablesReady;
  const { sqlite3, db } = await getDB();
  const features: Feature<Point, OccurrenceProperties>[] = [];
  // ... query and build features with occId and recencyTier properties
  return { geojson: { type: 'FeatureCollection', features }, summary, taxaOptions };
}
```

### Mapbox Map Initialization (bee-map.ts)

```typescript
// Source: Mapbox GL JS v3 docs [VERIFIED: Context7]
import mapboxgl from 'mapbox-gl';
import mapboxCssText from 'mapbox-gl/dist/mapbox-gl.css?raw';

// In firstUpdated():
mapboxgl.accessToken = import.meta.env.VITE_MAPBOX_TOKEN ?? '';
this._map = new mapboxgl.Map({
  container: this.mapElement,
  style: 'mapbox://styles/mapbox/outdoors-v12',
  center: [this.viewState?.lon ?? DEFAULT_LON, this.viewState?.lat ?? DEFAULT_LAT],
  zoom: this.viewState?.zoom ?? DEFAULT_ZOOM,
  attributionControl: true,
});
```

### View State Sync

```typescript
// Source: Mapbox GL JS moveend event [VERIFIED: Context7]
this._map.on('moveend', () => {
  const center = this._map!.getCenter();
  const zoom = this._map!.getZoom();
  this._emit('view-moved', { lon: center.lng, lat: center.lat, zoom });
});

// Restore from URL (in updated()):
if (changedProperties.has('viewState') && this.viewState && this._map) {
  this._map.jumpTo({
    center: [this.viewState.lon, this.viewState.lat],
    zoom: this.viewState.zoom,
  });
}

// Pan-to animation:
if (changedProperties.has('panTo') && this.panTo && this._map) {
  this._map.flyTo({
    center: this.panTo.coordinate as [number, number],
    zoom: this.panTo.zoom,
    duration: 300,
  });
}
```

### Mapbox Token Configuration for CI/CD

```yaml
# Source: existing deploy.yml pattern [VERIFIED: codebase]
# In .github/workflows/deploy.yml build step:
- name: Build frontend
  run: npm run build --workspace=frontend
  env:
    VITE_MAPBOX_TOKEN: ${{ secrets.MAPBOX_TOKEN }}
```

```bash
# Local development (.env in frontend/):
VITE_MAPBOX_TOKEN=pk.your_dev_token_here
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `@types/mapbox-gl` community types | Built-in TypeScript declarations | v3.5.0 (2024) | Remove community types, use first-party [VERIFIED: migration guide] |
| `map.on('click', handler)` + manual hit test | `map.addInteraction()` API | v3.x | Cleaner event handling, but classic API still works [VERIFIED: Context7] |
| `mapbox://styles/mapbox/streets-v11` | `mapbox://styles/mapbox/standard` (default) | v3.0 | New Standard style with 3D, lighting; outdoors-v12 still available [VERIFIED: Context7] |
| OL `VectorSource` + `Feature` objects | Mapbox GeoJSON source + worker-side clustering | N/A (different library) | No more main-thread feature objects; data is plain GeoJSON |
| OL imperative `Style` functions | Mapbox declarative paint/layout expressions | N/A | Styling evaluated on GPU, not in JS per frame |
| OL `Cluster` source (distance-based) | Mapbox `cluster: true` (Supercluster) | N/A | Similar behavior, different implementation |

**Deprecated/outdated:**
- `@types/mapbox-gl`: Not compatible with v3.5+ first-party types. Do NOT install. [VERIFIED: migration guide]
- Mapbox GL JS v2 `map.on('click', layerId, handler)`: Still works in v3 but `addInteraction` is the new API. Either is acceptable for Phase 71. [VERIFIED: Context7]

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | feature-state with promoteId on clustered sources causes ID conflicts for cluster features | Anti-Patterns | If wrong, could use feature-state for selection instead of layer filter -- simpler code |
| A2 | Mapbox moveend fires once per completed animation (no manual debounce needed) | Don't Hand-Roll | If wrong, need debounce wrapper -- minor |
| A3 | setData() with ~50K features takes ~50-100ms | Filtering Pattern | If much slower, may need a different filtering approach |
| A4 | Layer filter with selection sets < 100 IDs is performant | Pattern 3 | If slow at small sets, use feature-state or separate source |
| A5 | outdoors-v12 style visually matches current StadiaMaps outdoors | Pattern | If too different, may need to use a different Mapbox style |

## Open Questions

1. **Mapbox access token for production**
   - What we know: Mapbox public tokens are safe to embed (URL-restricted). Build-time env var via `VITE_MAPBOX_TOKEN` is the standard pattern.
   - What's unclear: Does the user already have a Mapbox account and token? What URL restrictions should be set?
   - Recommendation: User must create a Mapbox account, generate a public token, and add URL restriction for `beeatlas.net`. Token added as GitHub Actions secret for CI builds.

2. **Ghost dots for filtered-out features**
   - What we know: Current OL implementation shows filtered-out features as ghosted (0.2 opacity gray). The draft plan mentions "ghosted styling".
   - What's unclear: With `setData()` approach, filtered-out features are removed from the clustered source. A separate unclustered source is needed for ghost dots, doubling memory for feature coordinates.
   - Recommendation: Use two sources -- `occurrences` (clustered, filtered data) and `occurrences-ghost` (unclustered, excluded data). Memory overhead is acceptable at 50K features (~5 MB GeoJSON).

3. **Bundle size vs. value proposition**
   - What we know: Migration INCREASES JS bundle from ~528 KB to ~2,200+ KB (minified). The roadmap says "cut ~400 KB".
   - What's unclear: Whether the user is aware of this tradeoff.
   - Recommendation: Flag for user discussion. The migration still has value for rendering performance and ecosystem, but the bundle size claim needs correction.

4. **Dynamic import for mapbox-gl**
   - What we know: mapbox-gl is ~2.2 MB minified. Dynamic import could keep the initial bundle small and load Mapbox lazily.
   - What's unclear: Whether this adds unacceptable latency to first map render.
   - Recommendation: Consider `const mapboxgl = await import('mapbox-gl')` to split Mapbox into a separate chunk loaded after initial HTML paint. This partially mitigates the bundle size increase.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | Build toolchain | Yes | 24.12 | -- |
| npm | Package management | Yes | (bundled with Node) | -- |
| Vite | Build/dev server | Yes | 6.4.1 | -- |
| Mapbox account + token | Map tiles | Unknown | -- | Must create account |
| GitHub Actions secrets | CI build with token | Unknown | -- | Must add MAPBOX_TOKEN secret |

**Missing dependencies with no fallback:**
- Mapbox account and access token (blocks map rendering entirely)

**Missing dependencies with fallback:**
- None

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest 4.1.2 |
| Config file | `frontend/vite.config.ts` (test section) |
| Quick run command | `cd frontend && npx vitest run --reporter=verbose` |
| Full suite command | `cd frontend && npm test` |

### Phase Requirements -> Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| SC-1 | Basemap renders with outdoors style | manual | -- | N/A (visual) |
| SC-2 | GeoJSON source loads with clustering | unit | `npx vitest run src/tests/bee-atlas.test.ts -t "data-loaded"` | Needs update |
| SC-3 | Clusters show recency coloring | manual | -- | N/A (visual) |
| SC-4 | Unclustered points show recency coloring | manual | -- | N/A (visual) |
| SC-5 | View state syncs to URL | unit | `npx vitest run src/tests/url-state.test.ts` | Exists (no change needed) |
| SC-6 | visibleIds filtering works | unit | `npx vitest run src/tests/filter.test.ts` | Exists (no change needed) |
| SC-7 | selectedOccIds highlighting works | manual | -- | N/A (visual) |
| SC-8 | Token configured via env var | unit | Check env.d.ts exists; build succeeds | Wave 0 |

### Sampling Rate
- **Per task commit:** `cd frontend && npx vitest run`
- **Per wave merge:** `cd frontend && npm test`
- **Phase gate:** Full suite green before verification

### Wave 0 Gaps
- [ ] Update mock for `features.ts` in `bee-atlas.test.ts` -- current mock returns OccurrenceSource; needs to return GeoJSON loading function
- [ ] Update mock for `region-layer.ts` in `bee-atlas.test.ts` -- current mock has OL VectorLayer/VectorSource APIs; needs simplified stubs
- [ ] Update mock for `bee-map.ts` imports -- tests that read source files will detect OL import removal
- [ ] `frontend/src/env.d.ts` -- Vite env var type declarations for VITE_MAPBOX_TOKEN

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | No | -- |
| V3 Session Management | No | -- |
| V4 Access Control | No | -- |
| V5 Input Validation | Yes (token handling) | Vite env var, never in source code |
| V6 Cryptography | No | -- |

### Known Threat Patterns for Mapbox GL JS

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Access token exposure in source | Information Disclosure | Use `VITE_MAPBOX_TOKEN` env var; URL-restrict token in Mapbox dashboard; never commit to git [CITED: Mapbox security docs] |
| Unvalidated GeoJSON injection | Tampering | GeoJSON is constructed from SQLite (trusted local data), not from external input |

## Sources

### Primary (HIGH confidence)
- Context7 `/websites/mapbox_mapbox-gl-js` -- GeoJSON source spec, clusterProperties, filter, promoteId, feature-state, queryRenderedFeatures, getClusterLeaves, CSS import, Map constructor, interactions API
- npm registry `mapbox-gl@3.22.0` -- version verification
- Vite build measurements (local /tmp/mapbox-size-test) -- bundle size comparison: OL tree-shaken 406 KB / 102 KB gzip; Mapbox GL JS 2,249 KB / 524 KB gzip

### Secondary (MEDIUM confidence)
- GitHub issue #10722 (mapbox/mapbox-gl-js) -- no dynamic setFilter for GeoJSON source
- GitHub issue #7898 (mapbox/mapbox-gl-js) -- `['in', ...]` expression performance with large lists
- GitHub issue #13355 (mapbox/mapbox-gl-js) -- Shadow DOM canvas dimension bug (still open, not affecting this project)
- GitHub issue #7814 (mapbox/mapbox-gl-js) -- attribution not visible in Shadow DOM
- GitHub issue #12995 (mapbox/mapbox-gl-js) -- v3 bundle size increase (~25% over v2)
- GitHub issue #2613 (mapbox/mapbox-gl-js) -- pre-clustering filter added via PR #9864

### Tertiary (LOW confidence)
- Bundle size claim correction ("cut ~400 KB") -- based on local measurement, should be independently verified by user with production build

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- mapbox-gl v3.22.0 verified on npm, TypeScript types confirmed, API verified via Context7
- Architecture: HIGH -- clustering, expressions, and source APIs thoroughly documented with official examples
- Pitfalls: HIGH -- bundle size measured empirically, Shadow DOM issues verified via GitHub issues, filter approach verified via issue tracker
- Filtering strategy: MEDIUM -- setData approach is well-documented but the two-source ghost dot pattern is an architectural choice that needs validation in practice

**Research date:** 2026-04-26
**Valid until:** 2026-05-26 (stable library, v3 API is mature)
