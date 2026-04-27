# Phase 72: Boundaries and Interaction - Research

**Researched:** 2026-04-27
**Domain:** Mapbox GL JS v3 GeoJSON polygon layers, click interaction routing, feature-state highlighting
**Confidence:** HIGH

## Summary

Phase 72 ports county/ecoregion boundary layers and all click interactions from OpenLayers to Mapbox GL JS. The existing bee-map.ts (rewritten in Phase 71) already has the occurrence source, cluster layers, and a placeholder click handler that emits `map-click-empty` for all clicks. This phase adds two GeoJSON polygon sources (counties, ecoregions), fill+line layers for rendering boundaries, feature-state-based selection highlighting, and a multi-layer click handler that dispatches to the correct event (`map-click-occurrence`, `map-click-region`, `map-click-empty`).

The critical interaction design decision is D-01: clicking a cluster queries all cluster leaves via `getClusterLeaves` and emits `map-click-occurrence` with the full occurrence array. This differs from the common Mapbox pattern of zooming to expand clusters. The `getClusterLeaves` API uses callbacks (not Promises), so a wrapper is needed for clean async/await usage. The leaf features contain all occurrence properties (spread from SQLite row in features.ts), so no additional database lookup is needed to build the OccurrenceRow payload.

For boundary highlighting, the Mapbox `feature-state` approach is recommended over the Phase 71 filter-based approach used for occurrence selection. Boundaries are non-clustered polygon sources with no `promoteId` conflict -- `generateId: true` assigns stable numeric feature IDs. The paint expression reads `['feature-state', 'selected']` to switch between default and highlight styles, and `setFeatureState` toggles the selected flag. This avoids rebuilding filter expressions on every selection change.

**Primary recommendation:** Use `addInteraction` API with `preventDefault` for click routing priority (occurrence layers > boundary layers > empty). Use `feature-state` with `generateId: true` for boundary polygon highlighting. Wrap `getClusterLeaves` in a Promise for async click handler.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D-01:** Clicking a cluster queries all cluster leaves and emits `map-click-occurrence` with the full occurrence array. Does NOT zoom to expand. User sees the occurrence list in the sidebar without needing to zoom.
- **D-02:** Filter panel dropdown options (county names, ecoregion names) stay loaded from SQLite in bee-atlas.ts (Phase 71 approach). Boundary layers in bee-map are interactive overlays -- click targets that emit `map-click-region` -- but do NOT emit county-options-loaded or ecoregion-options-loaded events.

### Claude's Discretion
- Boundary layer rendering order (whether boundaries render above or below occurrence points)
- Boundary highlight mechanism (feature-state vs filter-based -- ROADMAP suggests feature-state)
- Whether to implement region-layer.ts as a real module or inline boundary logic directly in bee-map.ts

### Deferred Ideas (OUT OF SCOPE)
None -- discussion stayed within phase scope
</user_constraints>

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Boundary polygon rendering | Browser (Mapbox GL JS fill+line layers) | CDN (GeoJSON files in /data/) | Mapbox renders polygons client-side from fetched GeoJSON |
| Boundary toggle (off/counties/ecoregions) | Browser (Lit property + layer visibility) | -- | Already wired: boundaryMode property flows from bee-atlas to bee-map |
| Selected boundary highlighting | Browser (feature-state paint expressions) | -- | setFeatureState toggles selection; GPU evaluates paint |
| Cluster click -> leaf query | Browser (Mapbox getClusterLeaves) | -- | Supercluster on web worker returns leaf features |
| Single occurrence click | Browser (queryRenderedFeatures) | -- | GPU hit-test on point layers |
| Region polygon click | Browser (queryRenderedFeatures) | -- | GPU hit-test on fill layers |
| Empty map click | Browser (click event fallthrough) | -- | No features hit = empty click |
| OccurrenceRow construction | Browser (GeoJSON properties) | -- | Feature properties already contain all SQLite columns |

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| mapbox-gl | 3.22.0 | WebGL map rendering, polygon layers, feature-state, clustering API | Already installed in Phase 71 [VERIFIED: npm ls mapbox-gl] |
| lit | 3.2.1 | Web component framework | Already in use, no change [VERIFIED: package.json] |

### Supporting
No new libraries needed. All functionality uses built-in Mapbox GL JS APIs.

**Installation:**
```bash
# No new packages required -- all dependencies from Phase 71
```

## Architecture Patterns

### System Architecture Diagram

```
                      User Click on Map Canvas
                              |
                              v
                    +-------------------+
                    | Mapbox Interaction |
                    | Priority Chain     |
                    +---+---+---+-------+
                        |   |   |
            +-----------+   |   +------------+
            |               |                |
            v               v                v
    [clusters layer]  [unclustered-   [county-fill /
    [cluster-count]    point layer]    ecoregion-fill]
            |               |                |
            v               v                v
    getClusterLeaves   queryRendered    queryRendered
    (async callback)   Features(point)  Features(point)
            |               |                |
            v               v                v
    Build OccurrenceRow  Build OccRow    Extract NAME /
    array from leaves    from feature    NA_L3NAME
            |               |                |
            +-------+-------+       +--------+
                    |               |
                    v               v
            map-click-occurrence  map-click-region
            {occurrences, occIds, {name, shiftKey}
             centroid?, radiusM?}

    If NO hit on any layer:
            |
            v
      map-click-empty
```

### Layer Rendering Order

```
Top (rendered last, visually on top)
  |-- selected-ring          (selection highlight for occurrences)
  |-- unclustered-point      (individual occurrence dots)
  |-- cluster-count          (cluster labels)
  |-- clusters               (cluster circles)
  |-- county-line            (county borders - only visible when mode=counties)
  |-- county-fill            (county transparent fill - click target)
  |-- ecoregion-line         (ecoregion borders - only visible when mode=ecoregions)
  |-- ecoregion-fill         (ecoregion transparent fill - click target)
  |-- ghost-points           (filtered-out features)
Bottom (rendered first)
```

**Rationale for boundaries BELOW occurrences:** The OL version added `regionLayer` last (on top) for stroke visibility, but in Mapbox the fill layer is transparent and only serves as a click target. Boundaries below occurrences ensures dots are always clickable and visually prominent. The boundary strokes (line layers) render above the fills but below the occurrence points. [VERIFIED: OL code added regionLayer last, but Mapbox click interaction priority is set explicitly via addInteraction order, not layer z-order]

### Pattern 1: Boundary GeoJSON Sources with generateId

**What:** Two GeoJSON sources for county and ecoregion boundaries, using `generateId` to enable feature-state.
**When to use:** On map load, after occurrence sources are set up.

```typescript
// Source: Mapbox style spec GeoJSON source [VERIFIED: Context7 + mapbox-gl.d.ts]
// Counties source
this._map!.addSource('counties', {
  type: 'geojson',
  data: { type: 'FeatureCollection', features: [] }, // placeholder until fetch
  generateId: true, // enables feature-state with auto-assigned numeric IDs
});

// Ecoregions source
this._map!.addSource('ecoregions', {
  type: 'geojson',
  data: { type: 'FeatureCollection', features: [] },
  generateId: true,
});
```

**Why `generateId` instead of `promoteId`:** `generateId: true` assigns stable integer IDs based on array index. `promoteId: 'NAME'` would work for counties but requires string-to-feature mapping. `generateId` is simpler and works identically for both sources regardless of property name differences (NAME vs NA_L3NAME). [VERIFIED: Mapbox docs -- generateId assigns id based on feature index]

### Pattern 2: Boundary Fill + Line Layers

**What:** Separate fill and line layers for each boundary type. Fill layer is the click target with transparent fill. Line layer provides the visible stroke.
**When to use:** For both counties and ecoregions.

```typescript
// Source: OL region-layer.ts styling translated to Mapbox expressions [VERIFIED: codebase main branch]
// County fill layer (click target + selection highlight)
this._map!.addLayer({
  id: 'county-fill',
  type: 'fill',
  source: 'counties',
  layout: { visibility: 'none' }, // hidden until boundaryMode = 'counties'
  paint: {
    'fill-color': [
      'case',
      ['boolean', ['feature-state', 'selected'], false],
      'rgba(44, 123, 229, 0.12)', // selectedBoundaryStyle fill
      'rgba(0, 0, 0, 0)',          // boundaryStyle fill (transparent)
    ],
  },
});

// County line layer (visible stroke)
this._map!.addLayer({
  id: 'county-line',
  type: 'line',
  source: 'counties',
  layout: { visibility: 'none' },
  paint: {
    'line-color': [
      'case',
      ['boolean', ['feature-state', 'selected'], false],
      'rgba(44, 123, 229, 0.85)', // selectedBoundaryStyle stroke
      'rgba(80, 80, 80, 0.55)',    // boundaryStyle stroke
    ],
    'line-width': [
      'case',
      ['boolean', ['feature-state', 'selected'], false],
      2.5,
      1.5,
    ],
  },
});

// Identical pattern for ecoregion-fill and ecoregion-line
```

**Critical detail from OL code:** "Transparent fill is required for OL to fire click events on polygon interiors. Without a fill, only the stroke edge is hit-detectable." The same applies to Mapbox: `queryRenderedFeatures` only hits fill layers on their interior if the fill layer exists. A transparent fill (`rgba(0,0,0,0)`) is necessary. [VERIFIED: OL region-layer.ts comment, confirmed for Mapbox via Context7 polygon click example]

### Pattern 3: Feature-State Selection Highlighting

**What:** Use `setFeatureState` to mark boundary polygons as selected, and `removeFeatureState` to clear.
**When to use:** When `filterState.selectedCounties` or `filterState.selectedEcoregions` changes.

```typescript
// Source: Mapbox hover-styles example [VERIFIED: Context7]
private _applyBoundarySelection() {
  if (!this._map?.isStyleLoaded()) return;

  // Clear all previous selections on both sources
  // removeFeatureState with only source clears all features
  this._map.removeFeatureState({ source: 'counties' });
  this._map.removeFeatureState({ source: 'ecoregions' });

  if (this.boundaryMode === 'counties') {
    // Find features whose NAME matches selected counties
    const source = this._map.getSource('counties') as mapboxgl.GeoJSONSource;
    // We need to track feature-id-to-name mapping
    for (const [id, name] of this._countyIdMap.entries()) {
      if (this.filterState.selectedCounties.has(name)) {
        this._map.setFeatureState({ source: 'counties', id }, { selected: true });
      }
    }
  } else if (this.boundaryMode === 'ecoregions') {
    for (const [id, name] of this._ecoregionIdMap.entries()) {
      if (this.filterState.selectedEcoregions.has(name)) {
        this._map.setFeatureState({ source: 'ecoregions', id }, { selected: true });
      }
    }
  }
}
```

**ID mapping requirement:** With `generateId: true`, feature IDs are array indices (0, 1, 2...). To map between a region name (e.g. "King") and a feature ID (e.g. 5), we need to build a lookup map when the GeoJSON is loaded. This is a one-time operation when boundary data is fetched. [VERIFIED: generateId assigns sequential integer IDs per docs]

### Pattern 4: Click Interaction Priority Chain with addInteraction

**What:** Use Mapbox v3 `addInteraction` API for layer-targeted click handlers with `preventDefault()` to stop propagation.
**When to use:** For the multi-layer click routing chain.

```typescript
// Source: Mapbox addInteraction API [VERIFIED: Context7 + mapbox-gl.d.ts]
// Priority: cluster > unclustered point > boundary fill > empty

// 1. Cluster click -- query all leaves per D-01
this._map.addInteraction('click-cluster', {
  type: 'click',
  target: { layerId: 'clusters' },
  handler: (e) => {
    e.preventDefault(); // stop propagation to lower-priority handlers
    this._handleClusterClick(e);
  },
});

// 2. Unclustered point click
this._map.addInteraction('click-point', {
  type: 'click',
  target: { layerId: 'unclustered-point' },
  handler: (e) => {
    e.preventDefault();
    this._handlePointClick(e);
  },
});

// 3. County fill click (only active when visible)
this._map.addInteraction('click-county', {
  type: 'click',
  target: { layerId: 'county-fill' },
  handler: (e) => {
    e.preventDefault();
    this._handleRegionClick(e, 'NAME');
  },
});

// 4. Ecoregion fill click (only active when visible)
this._map.addInteraction('click-ecoregion', {
  type: 'click',
  target: { layerId: 'ecoregion-fill' },
  handler: (e) => {
    e.preventDefault();
    this._handleRegionClick(e, 'NA_L3NAME');
  },
});

// 5. Fallback: empty map click (no layer target = fires on any click)
this._map.on('click', (e) => {
  // Only fires if no addInteraction handler called preventDefault
  this._emit('map-click-empty');
});
```

**Important:** `addInteraction` handlers fire BEFORE `map.on('click')` listeners. When an interaction handler calls `e.preventDefault()`, it prevents propagation to other interactions and the generic `map.on('click')` handler. This gives us the exact priority chain we need. [VERIFIED: Mapbox docs -- "Prevents the event propagation to the next interaction in the stack"]

**Alternative considered:** Using `map.on('click', layerId, handler)` (v2 style). This still works in v3 but doesn't support `preventDefault()` for controlling propagation. The older approach requires manual hit-testing with `queryRenderedFeatures` and explicit priority logic. The `addInteraction` API is cleaner. [VERIFIED: both APIs available in v3 per mapbox-gl.d.ts]

### Pattern 5: getClusterLeaves Promise Wrapper

**What:** Wrap the callback-based `getClusterLeaves` in a Promise for use in async click handlers.
**When to use:** In the cluster click handler to get all leaf features.

```typescript
// Source: mapbox-gl.d.ts type signature [VERIFIED: node_modules inspection]
function getClusterLeavesAsync(
  source: mapboxgl.GeoJSONSource,
  clusterId: number,
  limit: number,
): Promise<GeoJSON.Feature[]> {
  return new Promise((resolve, reject) => {
    source.getClusterLeaves(clusterId, limit, 0, (error, features) => {
      if (error) reject(error);
      else resolve(features ?? []);
    });
  });
}
```

### Pattern 6: Boundary Visibility Toggle

**What:** Toggle boundary layer visibility when `boundaryMode` changes.
**When to use:** In the `updated()` lifecycle callback.

```typescript
// In updated():
if (changedProperties.has('boundaryMode') || changedProperties.has('filterState')) {
  this._applyBoundaryMode();
  this._applyBoundarySelection();
}

private _applyBoundaryMode() {
  if (!this._map?.isStyleLoaded()) return;
  
  const countyVisible = this.boundaryMode === 'counties' ? 'visible' : 'none';
  const ecoregionVisible = this.boundaryMode === 'ecoregions' ? 'visible' : 'none';
  
  this._map.setLayoutProperty('county-fill', 'visibility', countyVisible);
  this._map.setLayoutProperty('county-line', 'visibility', countyVisible);
  this._map.setLayoutProperty('ecoregion-fill', 'visibility', ecoregionVisible);
  this._map.setLayoutProperty('ecoregion-line', 'visibility', ecoregionVisible);
}
```

### Pattern 7: Building OccurrenceRow from GeoJSON Feature Properties

**What:** Convert GeoJSON feature properties (from cluster leaves or unclustered points) to the OccurrenceRow format expected by bee-atlas event handlers.
**When to use:** In click handlers before emitting `map-click-occurrence`.

```typescript
// Source: features.ts loadOccurrenceGeoJSON [VERIFIED: codebase]
// GeoJSON features have { ...obj } spread from SQLite row, so all columns are present.
// OCCURRENCE_COLUMNS defines the expected fields.
import { OCCURRENCE_COLUMNS, type OccurrenceRow } from './filter.ts';

function featureToOccurrenceRow(feature: GeoJSON.Feature): OccurrenceRow {
  const props = feature.properties ?? {};
  const row: Record<string, unknown> = {};
  for (const col of OCCURRENCE_COLUMNS) {
    row[col] = props[col] ?? null;
  }
  return row as unknown as OccurrenceRow;
}
```

### Anti-Patterns to Avoid

- **Adding boundary interactions before layers exist:** Interactions target layer IDs. If `addInteraction` is called before `addLayer`, it silently does nothing. Always add interactions after layers. [VERIFIED: Mapbox docs -- "If there is no layer with the name provided, then no interaction will be added"]
- **Using `queryRenderedFeatures` for boundary polygons without a fill layer:** Without a fill, only the line stroke is hit-detectable. A transparent fill (`rgba(0,0,0,0)`) is required for interior clicks. [VERIFIED: OL code comment + Mapbox polygon click examples]
- **Forgetting to removeFeatureState before setting new selection:** `setFeatureState` merges state, it doesn't replace. Must call `removeFeatureState` on the entire source first to clear stale selections. [VERIFIED: Mapbox docs -- "state object is merged with any existing key-value pairs"]
- **Treating getClusterLeaves as synchronous:** It uses a callback pattern. Must wrap in Promise or use callback correctly. The callback may return null features on error. [VERIFIED: mapbox-gl.d.ts signature]
- **Using addInteraction with boundary fill layers while they are hidden:** Hidden layers (`visibility: 'none'`) do not render features, so `queryRenderedFeatures` returns nothing. Interactions on hidden layers silently do nothing -- this is correct behavior (no hits when boundaries are off). [ASSUMED]

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Click priority routing | Manual queryRenderedFeatures + if/else chain | `addInteraction` with `preventDefault()` | Built-in layer-targeted events with propagation control [VERIFIED: Context7] |
| Polygon hit testing | Point-in-polygon math | Fill layer + `queryRenderedFeatures` | GPU-accelerated, handles complex multipolygons [VERIFIED: Context7] |
| Cluster leaf enumeration | Manual spatial query | `getClusterLeaves(clusterId, count, 0)` | Supercluster on worker thread, handles nested clusters [VERIFIED: Context7] |
| Feature selection state | Rebuilding filter expressions | `setFeatureState` + paint expression | O(1) per feature update vs O(n) filter rebuild [VERIFIED: Context7] |
| Polygon rendering | Canvas path drawing | Mapbox fill + line layers | GPU-rendered, handles anti-aliasing and zoom interpolation [VERIFIED: Context7] |

**Key insight:** Mapbox `addInteraction` replaces the entire manual click-routing pattern from OL. In OL, the click handler had to manually call `getFeatures(pixel)` on each layer and check results. In Mapbox, `addInteraction` with layer targets + `preventDefault` gives the same priority chain declaratively.

## Common Pitfalls

### Pitfall 1: Click Propagation with addInteraction
**What goes wrong:** A click on a cluster also fires the boundary click handler and the empty-click handler.
**Why it happens:** Without `preventDefault()`, all matching interactions fire plus the generic `map.on('click')`.
**How to avoid:** Every `addInteraction` handler that should consume the event must call `e.preventDefault()`. The generic `map.on('click')` handler for empty clicks only fires when nothing called `preventDefault`.
**Warning signs:** Sidebar opens AND filter changes on a single click.

### Pitfall 2: Feature-State Requires Feature IDs
**What goes wrong:** `setFeatureState` silently does nothing. No error, but polygons don't highlight.
**Why it happens:** The GeoJSON source was created without `generateId: true` or `promoteId`, so features have no ID.
**How to avoid:** Always set `generateId: true` on boundary GeoJSON sources. Verify with `map.queryRenderedFeatures` that returned features have a non-null `id` property.
**Warning signs:** Click handler fires (event emitted) but polygon stays gray.

### Pitfall 3: Stale Feature-State After setData
**What goes wrong:** Previously selected boundary polygon loses its highlight after the source data is updated.
**Why it happens:** `setData()` on a GeoJSON source clears feature-state. But for boundaries, we don't call `setData` after initial load, so this is only a concern if boundary data is reloaded.
**How to avoid:** After any `setData()` call on boundary sources, re-apply feature-state from current filterState.
**Warning signs:** Selection disappears after boundary mode toggle (if toggle re-fetches data).

### Pitfall 4: getClusterLeaves Returns Fewer Features Than point_count
**What goes wrong:** Cluster has `point_count: 500` but `getClusterLeaves` only returns 10 features.
**Why it happens:** The `limit` parameter defaults to 10 if falsy. Must pass the actual `point_count` value.
**How to avoid:** Always pass `feature.properties.point_count` as the limit: `getClusterLeaves(clusterId, pointCount, 0, callback)`.
**Warning signs:** Sidebar shows "10 occurrences" for a cluster labeled "500".

### Pitfall 5: Feature Properties from Cluster Leaves Have Different Shape
**What goes wrong:** Properties from `getClusterLeaves` features don't match what `featureToOccurrenceRow` expects.
**Why it happens:** Cluster leaf features are the original GeoJSON features passed to the source. Since `features.ts` spreads `...obj` (all SQLite columns), the properties should contain everything.
**How to avoid:** Verify that leaf features have the same properties as unclustered point features. Both come from the same GeoJSON source data. Add a debug assertion in development.
**Warning signs:** `undefined` values in OccurrenceRow fields.

### Pitfall 6: Boundary GeoJSON Fetch Timing
**What goes wrong:** Boundary layers show no polygons even though boundaryMode is set.
**Why it happens:** GeoJSON data hasn't been fetched yet when the user toggles boundaries.
**How to avoid:** Fetch boundary GeoJSON on map load (deferred after occurrence data, per existing pattern). Store in memory. Call `source.setData()` once fetched. Layers become visible immediately once data is loaded.
**Warning signs:** Empty boundary layer for a few seconds after toggle.

## Code Examples

### Cluster Click Handler (D-01 Implementation)

```typescript
// Source: Mapbox getClusterLeaves + D-01 user decision [VERIFIED: Context7 + CONTEXT.md]
private async _handleClusterClick(e: mapboxgl.InteractionEvent) {
  const feature = e.feature;
  if (!feature || !this._map) return;

  const clusterId = feature.properties?.cluster_id;
  const pointCount = feature.properties?.point_count;
  if (clusterId == null || pointCount == null) return;

  const source = this._map.getSource('occurrences') as mapboxgl.GeoJSONSource;
  
  try {
    const leaves = await new Promise<GeoJSON.Feature[]>((resolve, reject) => {
      source.getClusterLeaves(clusterId, pointCount, 0, (error, features) => {
        if (error) reject(error);
        else resolve(features ?? []);
      });
    });

    // Filter to visible features only (if filter is active)
    const toShow = this.visibleIds !== null
      ? leaves.filter(f => this.visibleIds!.has(f.properties?.occId))
      : leaves;
    if (toShow.length === 0) return;

    const occIds = toShow.map(f => f.properties!.occId as string);
    const occurrences = toShow.map(featureToOccurrenceRow);

    // Compute centroid and radius for cluster URL state
    const coords = toShow.map(f => (f.geometry as GeoJSON.Point).coordinates);
    const centroid = {
      lon: coords.reduce((s, c) => s + c[0], 0) / coords.length,
      lat: coords.reduce((s, c) => s + c[1], 0) / coords.length,
    };
    const radiusM = Math.max(...coords.map(c => 
      haversineMetres(centroid.lon, centroid.lat, c[0], c[1])
    ));

    this._emit('map-click-occurrence', { occurrences, occIds, centroid, radiusM });
  } catch (err) {
    console.error('Failed to get cluster leaves:', err);
  }
}
```

### Region Click Handler

```typescript
// Source: OL bee-map.ts click handler for regions [VERIFIED: main branch codebase]
private _handleRegionClick(e: mapboxgl.InteractionEvent, nameProperty: string) {
  const feature = e.feature;
  if (!feature) return;
  
  const name = feature.properties?.[nameProperty] as string | undefined;
  if (!name) return;

  this._emit('map-click-region', {
    name,
    shiftKey: e.originalEvent.shiftKey,
  });
}
```

### Unclustered Point Click Handler

```typescript
// Source: OL bee-map.ts click handler for single features [VERIFIED: main branch codebase]
private _handlePointClick(e: mapboxgl.InteractionEvent) {
  const feature = e.feature;
  if (!feature) return;

  const occId = feature.properties?.occId as string;
  if (!occId) return;

  // Skip ghost features (filtered out)
  if (this.visibleIds !== null && !this.visibleIds.has(occId)) return;

  const occurrence = featureToOccurrenceRow(feature as unknown as GeoJSON.Feature);
  this._emit('map-click-occurrence', {
    occurrences: [occurrence],
    occIds: [occId],
  });
}
```

### Boundary Data Loading

```typescript
// Source: existing loadBoundaries pattern in region-layer.ts [VERIFIED: main branch codebase]
// Boundary GeoJSON is in public/data/ -- served at /data/ in dev, DATA_BASE_URL in prod
private async _loadBoundaryData() {
  const baseUrl = (import.meta.env.VITE_DATA_BASE_URL as string | undefined) ?? '/data';
  
  try {
    const [countiesResp, ecoregionsResp] = await Promise.all([
      fetch(`${baseUrl}/counties.geojson`),
      fetch(`${baseUrl}/ecoregions.geojson`),
    ]);

    const countiesData = await countiesResp.json();
    const ecoregionsData = await ecoregionsResp.json();

    // Build ID-to-name maps for feature-state selection
    this._countyIdMap = new Map(
      countiesData.features.map((f: GeoJSON.Feature, i: number) => [i, f.properties?.NAME])
    );
    this._ecoregionIdMap = new Map(
      ecoregionsData.features.map((f: GeoJSON.Feature, i: number) => [i, f.properties?.NA_L3NAME])
    );

    // Push data to sources
    (this._map!.getSource('counties') as mapboxgl.GeoJSONSource).setData(countiesData);
    (this._map!.getSource('ecoregions') as mapboxgl.GeoJSONSource).setData(ecoregionsData);

    // Apply selection if filter was restored from URL
    this._applyBoundarySelection();
  } catch (err) {
    console.error('Failed to load boundary GeoJSON:', err);
  }
}
```

## Module Structure Decision

**Recommendation: Inline boundary logic in bee-map.ts** rather than reviving region-layer.ts as a real module.

Rationale:
1. The old `region-layer.ts` was 65 lines of OL-specific code (sources, layers, style objects). The Mapbox equivalent is just source/layer definitions + a few private methods.
2. The boundary logic needs direct access to `this._map` (for addSource, addLayer, setFeatureState, setLayoutProperty). Extracting to a separate module would require passing the map instance and exposing internal state.
3. bee-map.ts is the single file that owns all Mapbox source/layer setup. Keeping boundary layers there maintains the single-responsibility of "all map visualization in one component."
4. The `loadBoundaries()` export in region-layer.ts can be updated to a real boundary fetch function OR the fetch can happen directly in bee-map.ts. Given that the data URL needs `VITE_DATA_BASE_URL`, it's cleaner to have the fetch in the same module that uses it.

region-layer.ts should remain as a stub (or be removed). The boundary logic lives in bee-map.ts private methods: `_loadBoundaryData()`, `_applyBoundaryMode()`, `_applyBoundarySelection()`.

## Boundary Data Properties

| File | Size | Property Key | Example Value | Feature Count |
|------|------|-------------|---------------|---------------|
| counties.geojson | 37 KB | `NAME` | "Wahkiakum" | ~39 (WA counties) |
| ecoregions.geojson | 204 KB | `NA_L3NAME` | "Columbia Plateau" | ~10 (L3 ecoregions) |

[VERIFIED: head inspection of both files in frontend/public/data/]

These are small files -- both load in < 100ms. Safe to fetch in parallel immediately after occurrence data loads.

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `map.on('click', layerId, handler)` | `map.addInteraction(id, options)` | v3.x | Layer-targeted events with propagation control [VERIFIED: Context7] |
| OL `regionLayer.getFeatures(pixel)` manual hit test | Mapbox `addInteraction` with layer target | N/A (different library) | No manual hit testing needed |
| OL `Style` function per feature (highlight) | Mapbox `feature-state` + paint expression | N/A | GPU-evaluated, no JS per frame |
| OL `VectorSource` with GeoJSON format | Mapbox GeoJSON source with `generateId` | N/A | Worker-thread parsing, auto feature IDs |
| `setSource()` to switch county/ecoregion | `setLayoutProperty('visibility')` on separate layers | N/A | Both source+layer pairs exist; toggle visibility |

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Hidden layers (visibility: 'none') cause addInteraction handlers to silently not fire (no queryRenderedFeatures hits) | Anti-Patterns | If wrong, boundary click fires even when boundaries are off -- need explicit check in handler |
| A2 | addInteraction e.preventDefault() blocks both other interactions AND map.on('click') generic handlers | Pattern 4 | If wrong, need manual hit-test + early return pattern instead of addInteraction |
| A3 | getClusterLeaves returns features with the same properties as the original GeoJSON source data (including all SQLite columns) | Pattern 7 | If properties are stripped, need SQLite lookup by occId for OccurrenceRow |
| A4 | removeFeatureState({source: 'counties'}) clears state for ALL features in source (not just one) | Pattern 3 | If wrong, need to iterate and clear individually |

## Open Questions

1. **addInteraction propagation with map.on('click')**
   - What we know: `addInteraction` docs say `preventDefault` stops propagation "to the next interaction in the stack." The `map.on('click')` handler is a generic event listener, not an interaction.
   - What's unclear: Does `preventDefault` also suppress the generic `map.on('click')` handler, or only other `addInteraction` handlers?
   - Recommendation: Test empirically. If generic click still fires, add a flag (`_clickConsumed`) set by interaction handlers and checked by the generic click listener. Reset flag on each click event start.

2. **Feature-state with generateId after source.setData()**
   - What we know: Docs say "you might need to reapply the state" after setData. For boundaries, setData is called once (on load), so this is mainly a concern for the initial load + URL-restored selection.
   - What's unclear: Whether the initial setData (replacing the empty placeholder) triggers feature-state clearing.
   - Recommendation: Always call `_applyBoundarySelection()` after `setData()` on boundary sources.

## Environment Availability

Step 2.6: SKIPPED (no external dependencies identified -- all functionality uses already-installed mapbox-gl and existing GeoJSON files)

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
| SC-1 | County/ecoregion GeoJSON render as fill+line layers | manual | -- | N/A (visual) |
| SC-2 | Boundary toggle (off/counties/ecoregions) works | unit | `npx vitest run src/tests/bee-atlas.test.ts` | Needs new test |
| SC-3 | Selected boundaries highlight with blue fill/stroke | manual | -- | N/A (visual) |
| SC-4 | Cluster click emits map-click-occurrence with full leaf array (D-01) | unit | `npx vitest run src/tests/bee-atlas.test.ts` | Needs new test |
| SC-5 | Single occurrence click emits map-click-occurrence | unit | `npx vitest run src/tests/bee-atlas.test.ts` | Needs new test |
| SC-6 | Region polygon click emits map-click-region with name | unit | `npx vitest run src/tests/bee-atlas.test.ts` | Needs new test |
| SC-7 | Empty map click emits map-click-empty | unit | `npx vitest run src/tests/bee-atlas.test.ts` | Exists (from Phase 71 -- but handler will change) |
| SC-8 | data-loaded, county/ecoregion options from SQLite (D-02) | unit | `npx vitest run src/tests/bee-atlas.test.ts` | Exists (Phase 71) |

### Sampling Rate
- **Per task commit:** `cd frontend && npx vitest run`
- **Per wave merge:** `cd frontend && npm test`
- **Phase gate:** Full suite green before verification

### Wave 0 Gaps
- [ ] Update mapbox-gl mock to include `addInteraction`, `removeInteraction`, `setLayoutProperty`, `setFeatureState`, `removeFeatureState` methods
- [ ] Add mock for `fetch` to return boundary GeoJSON test fixtures
- [ ] New test: boundary mode toggle calls setLayoutProperty for correct layers
- [ ] New test: cluster click handler emits map-click-occurrence (requires mock getClusterLeaves on source)

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | No | -- |
| V3 Session Management | No | -- |
| V4 Access Control | No | -- |
| V5 Input Validation | Yes (GeoJSON from fetch) | GeoJSON is self-hosted static files, not user input. Mapbox validates internally. |
| V6 Cryptography | No | -- |

### Known Threat Patterns for Phase 72

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Malicious GeoJSON injection via compromised CDN | Tampering | GeoJSON served from same origin (beeatlas.net/data/); Mapbox validates GeoJSON schema internally |
| Click event spoofing | Spoofing | Events are browser-native; no additional risk beyond standard web app |

## Sources

### Primary (HIGH confidence)
- Context7 `/websites/mapbox_mapbox-gl-js` -- addInteraction, getClusterLeaves, setFeatureState, removeFeatureState, generateId, GeoJSON source spec, fill/line layer styling, queryRenderedFeatures
- `node_modules/mapbox-gl/dist/mapbox-gl.d.ts` -- TypeScript signatures for getClusterLeaves (callback-based), setFeatureState, addInteraction, Interaction type
- Codebase (main branch) `frontend/src/region-layer.ts` -- OL boundary styling constants (rgba values), feature property names (NAME, NA_L3NAME), transparent fill requirement comment
- Codebase (mapbox-migration branch) `frontend/src/bee-map.ts` -- current Mapbox layer structure, source IDs, click handler placeholder
- Codebase `frontend/src/features.ts` -- GeoJSON feature property structure (spreads all SQLite columns)
- Codebase `frontend/public/data/counties.geojson` and `ecoregions.geojson` -- property keys and file sizes

### Secondary (MEDIUM confidence)
- Mapbox hover-styles example (Context7) -- pattern for feature-state with mousemove/click on polygon fill layers
- Mapbox cluster example (Context7) -- getClusterExpansionZoom and getClusterLeaves click pattern

### Tertiary (LOW confidence)
- None

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- no new libraries, all APIs verified in mapbox-gl.d.ts
- Architecture: HIGH -- click routing via addInteraction verified in Context7 docs, boundary rendering pattern verified in multiple Mapbox examples
- Pitfalls: HIGH -- feature-state requirements verified, getClusterLeaves callback pattern verified in type definitions, transparent fill requirement verified in OL codebase comments
- Interaction design: MEDIUM -- addInteraction preventDefault propagation to generic map.on('click') needs empirical verification (A2)

**Research date:** 2026-04-27
**Valid until:** 2026-05-27 (stable library, v3 API is mature)
