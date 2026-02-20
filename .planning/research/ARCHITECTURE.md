# Architecture Patterns

**Domain:** Static biodiversity map — brownfield extension
**Researched:** 2026-02-18
**Confidence:** HIGH (all patterns derived from direct codebase inspection + established OpenLayers/Lit API knowledge)

---

## Current State (Baseline)

The existing frontend is a single `BeeMap` LitElement that creates an OpenLayers `Map` with two tile base layers and one `VectorLayer` backed by a custom `ParquetSource`. All setup happens in `firstUpdated()`. No reactive properties, no state management, no event handling, no UI controls.

```
BeeMap (LitElement, shadow DOM)
  └── OpenLayers Map
        ├── TileLayer (Ocean Base)
        ├── TileLayer (Ocean Reference)
        └── VectorLayer → ParquetSource → ecdysis.parquet
```

`ParquetSource` extends `ol/source/Vector`, uses `hyparquet.parquetReadObjects` with a fixed column list, creates `ol/Feature` points from lon/lat, and adds them all at once (`strategy: all`).

---

## Target Architecture

```
BeeMap (LitElement, shadow DOM)
  ├── OpenLayers Map
  │     ├── TileLayer (Ocean Base)
  │     ├── TileLayer (Ocean Reference)
  │     ├── VectorLayer → SpecimenSource → ecdysis.parquet  [layer A]
  │     └── VectorLayer → HostPlantSource → inat.parquet    [layer B]
  └── UI Panel (shadow DOM child elements, rendered by Lit)
        ├── Filter controls (taxon, date range)
        └── Detail sidebar (click popup)
```

---

## Component Boundaries

| Component | Responsibility | Communicates With |
|-----------|---------------|-------------------|
| `BeeMap` (LitElement) | Owns the OL `Map` instance; renders UI controls and panel via `render()`; holds reactive state for filters + selected feature | `SpecimenSource`, `HostPlantSource`, filter UI children |
| `ParquetSource` (extends `VectorSource`) | Generic: fetch Parquet URL, read columns, emit `ol/Feature` objects | OpenLayers `VectorLayer`, hyparquet |
| `SpecimenSource` | Configures `ParquetSource` with specimen columns; stores full feature data as properties | `BeeMap` (via OL click event) |
| `HostPlantSource` | Configures `ParquetSource` with host plant columns | `BeeMap` |
| Filter state (`@state` properties on `BeeMap`) | Holds `taxonFilter`, `dateRange`, `selectedFeatureId`; triggers re-render when changed | Filter controls (reads), OL style functions (reads), detail panel (reads) |
| Detail sidebar (rendered in `render()`) | Shows selected feature properties; conditionally visible | `BeeMap` state (`selectedFeatureId`) |

---

## Recommended Architecture

### Two-Layer Approach

**Do not break `ParquetSource` into a specimen-specific class.** Instead, make it more generic by accepting a `columns` parameter (it already has a hardcoded `columns` array — move this to the constructor).

```typescript
// parquet.ts — generalized
export interface ParquetSourceOptions {
  url: string;
  columns: string[];
  featureId: (row: Record<string, unknown>) => string;
  geometry: (row: Record<string, unknown>) => Point;
}

export class ParquetSource extends VectorSource {
  constructor({ url, columns, featureId, geometry }: ParquetSourceOptions) { ... }
}
```

Then in `bee-map.ts`, create two sources and two layers at module level (or inside `firstUpdated`, but module level works fine for static assets):

```typescript
import ecdysisDump from './assets/ecdysis.parquet?url';
import inatDump from './assets/inat.parquet?url';

const specimenSource = new ParquetSource({
  url: ecdysisDump,
  columns: ['ecdysis_id', 'longitude', 'latitude', 'scientificName',
            'recordedBy', 'eventDate', 'family', 'genus', 'specificEpithet'],
  featureId: row => `ecdysis:${row.ecdysis_id}`,
  geometry: row => new Point(fromLonLat([row.longitude as number, row.latitude as number])),
});

const hostPlantSource = new ParquetSource({
  url: inatDump,
  columns: ['inat_id', 'longitude', 'latitude', 'taxon_name',
            'time_observed_at', 'uri', 'photo_url'],
  featureId: row => `inat:${row.inat_id}`,
  geometry: row => new Point(fromLonLat([row.longitude as number, row.latitude as number])),
});

const specimenLayer = new VectorLayer({ source: specimenSource, style: beeStyle });
const hostPlantLayer = new VectorLayer({ source: hostPlantSource, style: plantStyle });
```

The `map.addLayer()` call in `firstUpdated` adds both layers after the tile layers. Layer ordering: base tiles → specimens → host plants (so plants render on top; reverse if desired).

**Null guard is required.** The existing code has a known bug where null coordinates crash `fromLonLat`. Fix in the generalized constructor:

```typescript
.then(objects => {
  const features = objects
    .filter(obj => obj.longitude != null && obj.latitude != null)
    .map(obj => {
      const feature = new Feature();
      feature.setGeometry(geometry(obj));
      feature.setId(featureId(obj));
      feature.setProperties(obj);  // store all columns as feature props
      return feature;
    });
  ...
})
```

Calling `feature.setProperties(obj)` stores all Parquet columns on each OL Feature. This is the hook for popup details — the detail panel reads `feature.getProperties()` on click.

---

### Client-Side Filtering Pattern

**Do not reload Parquet.** The entire dataset is in memory as OL Features after the initial load. Filtering means hiding features, not re-fetching.

**Use OL VectorLayer's `style` function as the filter gate.** A style function returning `null` or `undefined` for a feature causes OL to skip rendering that feature. This is the idiomatic OL approach — no need to call `source.clear()` or `source.refresh()`.

```typescript
// In BeeMap, reactive property drives re-render of the style function
@state() private taxonFilter = '';
@state() private dateFrom: number | null = null;
@state() private dateTo: number | null = null;

// Style function reads current filter state via closure
private specimenStyleFn = (feature: FeatureLike): Style | null => {
  if (this.taxonFilter) {
    const family = feature.get('family') as string | undefined;
    const genus = feature.get('genus') as string | undefined;
    const species = feature.get('specificEpithet') as string | undefined;
    const matches = [family, genus, species].some(
      v => v?.toLowerCase().includes(this.taxonFilter.toLowerCase())
    );
    if (!matches) return null;
  }
  if (this.dateFrom || this.dateTo) {
    const year = feature.get('year') as number | undefined;
    if (year == null) return null;
    if (this.dateFrom && year < this.dateFrom) return null;
    if (this.dateTo && year > this.dateTo) return null;
  }
  return beeStyle;
};
```

**The critical wiring step:** When Lit reactive state changes, OL does not automatically know to re-render the layer. Call `specimenLayer.changed()` (or `specimenSource.changed()`) in a Lit `updated()` lifecycle hook to force OL to re-evaluate all feature styles:

```typescript
protected updated(changedProperties: PropertyValues): void {
  super.updated(changedProperties);
  if (changedProperties.has('taxonFilter') ||
      changedProperties.has('dateFrom') ||
      changedProperties.has('dateTo')) {
    specimenLayer.changed();
  }
}
```

**Why this approach vs alternatives:**
- `source.clear()` + re-read Parquet: wasteful network + CPU; defeats the purpose of client-side loading.
- `source.forEachFeature()` + `feature.setStyle(null)`: works but is O(n) manual iteration and bypasses OL's render loop.
- Style function gate: O(n) in OL's render pass anyway; no extra bookkeeping; composable.

**Performance note:** With tens of thousands of points, style-function filtering is fast because OL already iterates all features per frame for rendering. The closure read (`feature.get('family')`) is a simple property map lookup.

---

### State Management: Lit Reactive Properties

**Use Lit's built-in `@state()` decorator only.** Do not introduce a state management library (MobX, Zustand, Jotai, etc.). The component is self-contained and the state surface is small: a few filter values and a selected feature ID.

```typescript
@state() private taxonFilter = '';
@state() private dateRange: [number, number] | null = null;
@state() private selectedFeatureId: string | null = null;
```

`@state()` triggers Lit's re-render, which:
1. Updates the UI controls (filter inputs, detail panel)
2. Triggers the `updated()` hook, which calls `layer.changed()` to force OL re-render

This is a one-directional flow: user gesture → update `@state` property → Lit re-renders UI + `updated()` triggers OL re-render.

**Do not store the selected feature object in state.** Store only the feature ID. Resolve it at render time via `specimenSource.getFeatureById(this.selectedFeatureId)`. This avoids stale object references if the source ever reloads.

---

### Click Popup / Detail Sidebar

**Use a Lit-rendered sidebar inside shadow DOM, not an OL Overlay.** `ol/Overlay` anchors a DOM element to map coordinates; it is awkward inside shadow DOM because OL would need to append the element to the map container, which lives inside shadow DOM and is not accessible from outside without refs.

The simpler and more Lit-idiomatic approach: a conditional sidebar rendered by `BeeMap.render()` alongside `<div id="map">`.

```typescript
// bee-map.ts render()
public render() {
  const selectedFeature = this.selectedFeatureId
    ? specimenSource.getFeatureById(this.selectedFeatureId)
    : null;
  return html`
    <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/ol@v10.8.0/ol.css" />
    <div id="map"></div>
    <div id="controls">
      <input
        type="text"
        placeholder="Filter by taxon..."
        .value=${this.taxonFilter}
        @input=${(e: InputEvent) => { this.taxonFilter = (e.target as HTMLInputElement).value; }}
      />
      <!-- date range inputs -->
    </div>
    ${selectedFeature ? html`
      <div id="detail-panel">
        <button @click=${() => { this.selectedFeatureId = null; }}>Close</button>
        <dl>
          <dt>Species</dt><dd>${selectedFeature.get('scientificName') ?? 'Unknown'}</dd>
          <dt>Collector</dt><dd>${selectedFeature.get('recordedBy') ?? '—'}</dd>
          <dt>Date</dt><dd>${selectedFeature.get('eventDate') ?? '—'}</dd>
          <dt>Host plant</dt><dd>${selectedFeature.get('hostPlant') ?? '—'}</dd>
        </dl>
      </div>
    ` : nothing}
  `;
}
```

**Click wiring:** In `firstUpdated()`, attach an OL `singleclick` listener on the `map` instance:

```typescript
this.map.on('singleclick', (evt) => {
  const feature = this.map!.forEachFeatureAtPixel(
    evt.pixel,
    f => f,
    { hitTolerance: 8 }
  );
  this.selectedFeatureId = feature?.getId() as string ?? null;
});
```

`forEachFeatureAtPixel` respects both layers (specimens and host plants). If you need to distinguish which layer was clicked, pass a `layerFilter` option.

**Shadow DOM constraint is satisfied:** the sidebar lives entirely inside shadow DOM, rendered by Lit, and reads from `@state`. No DOM escaping required.

**Layout:** The host element already uses `flex-direction: row`. Add the `#controls` panel as a column on the left and `#detail-panel` as a column on the right (or as an overlay on small screens via CSS). Update `static styles` accordingly.

---

### Parquet Column Selection

**Specimens (ecdysis.parquet) — include for popup:**

| Column | Purpose |
|--------|---------|
| `ecdysis_id` | Feature ID |
| `longitude`, `latitude` | Geometry |
| `scientificName` | Display name |
| `genus`, `specificEpithet` | Taxon filter |
| `family` | Taxon filter (broad) |
| `recordedBy` | Popup: collector |
| `eventDate` | Popup: collection date |
| `year`, `month` | Date range filter |
| `stateProvince`, `county` | Popup: location |
| `fieldNumber` | Sample grouping key (links specimens in same event) |

Omit: `basisOfRecord`, `institutionCode`, `occurrenceID`, `taxonRank`, `identifiedBy`, and all `verbatim*` fields from the frontend Parquet. They add file size without UI value.

**Host plants (inat.parquet) — include for popup:**

The Makefile `fieldspec` already specifies: `id`, `geojson`, `description`, `license_code`, `time_observed_at`, `uri`, `public_positional_accuracy`, `observation_photos`, `taxon.id`, `taxon.ancestor_ids`, `user.login`, `user.name`.

For the frontend Parquet, include:

| Column | Purpose |
|--------|---------|
| `inat_id` | Feature ID |
| `longitude`, `latitude` | Geometry (extracted from `geojson.coordinates`) |
| `taxon_name` | Display / filter |
| `time_observed_at` | Date filter + popup |
| `uri` | Popup: link to iNat observation |
| `photo_url` | Popup: thumbnail |
| `observer_name` | Popup: who observed it |

---

## Data Flow (Updated)

### Offline Pipeline

```
data/ecdysis/occurrences.py
  → ecdysis.parquet (columns: id, lon, lat, scientificName, genus, specificEpithet,
                              family, recordedBy, eventDate, year, month,
                              stateProvince, county, fieldNumber)
  → cp frontend/src/assets/ecdysis.parquet

data/inat/ (new script needed)
  → inat.parquet (columns: inat_id, lon, lat, taxon_name, time_observed_at,
                            uri, photo_url, observer_name)
  → cp frontend/src/assets/inat.parquet
```

Both assets are bundled by Vite via `?url` import and served as static files.

### Runtime

```
1. Browser loads bee-map.ts → BeeMap.firstUpdated() initializes OL Map
2. OL Map gets [TileA, TileB, specimenLayer, hostPlantLayer]
3. ParquetSource loaders fire (async, parallel)
4. hyparquet fetches .parquet, reads columns, emits Features with setProperties(row)
5. Features added to sources → OL renders points
6. User types in filter input → BeeMap @state updates → Lit re-render + updated() fires
7. updated() calls specimenLayer.changed() → OL calls specimenStyleFn for each feature
8. specimenStyleFn returns null for non-matching features → they disappear
9. User clicks map → singleclick handler → selectedFeatureId set → detail panel renders
```

---

## Build Order

Dependencies determine this order strictly:

1. **Parquet schema definition** — Decide what columns go in each Parquet file. This gates both the Python pipeline work and the frontend column list.

2. **Data pipeline: specimens** — Fix `ecdysis/occurrences.py` (remove `pdb.set_trace()`, extend `to_parquet` column list), produce `ecdysis.parquet` with all popup fields.

3. **Data pipeline: host plants** — Implement `inat/observations.py` to produce `inat.parquet` from downloaded JSON observations. The Makefile rule body needs completing.

4. **Generalize `ParquetSource`** — Accept `columns`, `featureId`, `geometry` in constructor. Add null-coordinate guard. Call `feature.setProperties(row)` to store all popup data on the feature.

5. **Add second layer** — Import `inat.parquet?url`, create `HostPlantSource` and `hostPlantLayer`, add to OL Map in `firstUpdated()`.

6. **Add filter state + style gate** — Add `@state()` properties to `BeeMap`. Change `specimenLayer` to use `specimenStyleFn` instead of `beeStyle`. Wire `updated()` to call `specimenLayer.changed()`.

7. **Add filter UI** — Add `<input>` and date range inputs to `render()`. Bind to state properties.

8. **Add click handler + detail panel** — Wire `map.on('singleclick', ...)` in `firstUpdated()`. Add conditional detail panel in `render()`.

9. **Wire cluster style** — `clusterStyle` exists in `style.ts` but is unused. It can be wired after the filtering pattern is established.

---

## Patterns to Follow

### Pattern: Style-function as visibility gate

**What:** Return `null` from an OL style function to hide a feature; return the real style to show it.
**When:** Any time you need client-side filtering without reloading data.
**Why:** OL already iterates all features each render frame; no extra bookkeeping needed.

### Pattern: Lit `updated()` bridges Lit state to OL

**What:** Detect changed reactive properties in `updated()` and call `layer.changed()` to force OL re-render.
**When:** Any time Lit state needs to affect how OL renders map features.
**Why:** OL and Lit have separate render loops; `changed()` is the explicit signal that OL's render output is stale.

### Pattern: Store feature properties at load time

**What:** Call `feature.setProperties(row)` inside `ParquetSource` loader so all Parquet column values travel with the OL Feature.
**When:** Any time you need to display per-feature data in a popup.
**Why:** Avoids a secondary lookup (no need to maintain a `Map<id, data>` separately). OL `Feature.getProperties()` is the natural store.

### Pattern: Sidebar over OL Overlay in shadow DOM

**What:** Render the detail panel as a Lit template inside `render()`, positioned with CSS next to `#map`.
**When:** You need a click-triggered detail panel inside a shadow DOM component.
**Why:** `ol/Overlay` appends DOM elements to the map container. Working with those from inside shadow DOM requires careful `@query` refs and OL constructor options (`element: this.shadowRoot.querySelector(...)` called in `firstUpdated`). The Lit-rendered sidebar avoids all of that while being reactive for free.

---

## Anti-Patterns to Avoid

### Anti-Pattern: Module-level source/layer construction referencing assets that may not exist yet

**What goes wrong:** The existing code creates `specimenSource` and `speicmenLayer` at module level (outside any class). This works because `ecdysis.parquet?url` import is resolved at bundle time.
**Risk for second layer:** If `inat.parquet` does not exist yet when building, Vite will throw at build time. Keep the second layer import guarded or add the Parquet asset before adding the import.
**Mitigation:** Add the asset file (even an empty placeholder) to `frontend/src/assets/` before adding the import to `bee-map.ts`.

### Anti-Pattern: Calling source.clear() + refresh() to "filter"

**What goes wrong:** `clear()` removes all features and `refresh()` re-fires the loader, causing a network fetch + full re-parse. For a static site with data bundled as assets, the "network" is a local file, but it still re-runs hyparquet decode on every filter change.
**Instead:** Style-function gate (see above).

### Anti-Pattern: Storing selected OL Feature object as Lit state

**What goes wrong:** OL features are mutable objects; Lit's change detection compares by reference. If the source ever reloads, the stored reference becomes stale. Also, storing complex objects as `@state` can trigger unexpected re-renders.
**Instead:** Store only the feature ID string; resolve via `source.getFeatureById()` at render time.

### Anti-Pattern: Using `@property()` instead of `@state()` for internal filter state

**What goes wrong:** `@property()` exposes the property as a reflected HTML attribute and is part of the component's public API. Filter state is internal.
**Instead:** Use `@state()` for all internal state. It triggers re-renders identically but does not expose the property externally.

---

## Scalability Considerations

| Concern | Current scale (~5K specimens) | At 50K features | Notes |
|---------|-------------------------------|-----------------|-------|
| Parquet file size | Small (<1 MB) | ~5–10 MB | Snappy compression; hyparquet streams by row group |
| Feature rendering | Fast (OL canvas) | May need clustering | Wire `clusterStyle` at zoom < 10 |
| Filter performance | Instant | Instant | OL iterates all features per frame regardless |
| Parquet column count | Small | Keep trim | Each extra column adds file size; don't include fields not shown in UI |

Clustering is already half-implemented (`clusterStyle` in `style.ts`). When point density becomes visually noisy, switch `specimenLayer` to use `ol/source/Cluster` wrapping `specimenSource`. The existing `clusterStyle` function handles the radius-from-count logic.

---

## Sources

**Confidence: HIGH** — All findings from direct codebase inspection:

- `/Users/rainhead/dev/beeatlas/frontend/src/bee-map.ts` — current map setup
- `/Users/rainhead/dev/beeatlas/frontend/src/parquet.ts` — ParquetSource implementation
- `/Users/rainhead/dev/beeatlas/frontend/src/style.ts` — beeStyle, clusterStyle
- `/Users/rainhead/dev/beeatlas/.planning/codebase/ARCHITECTURE.md` — existing architecture analysis
- `/Users/rainhead/dev/beeatlas/.planning/codebase/CONCERNS.md` — known bugs (null coords, pdb.set_trace)
- `/Users/rainhead/dev/beeatlas/.planning/PROJECT.md` — project requirements and constraints
- `/Users/rainhead/dev/beeatlas/data/ecdysis/occurrences.py` — available specimen columns
- `/Users/rainhead/dev/beeatlas/data/Makefile` — iNat fieldspec, pipeline dependencies

OpenLayers API knowledge (HIGH confidence, stable across OL 10.x):
- `VectorLayer` style function returning `null` hides features — documented behavior
- `layer.changed()` forces re-render — documented method
- `map.forEachFeatureAtPixel()` — documented click detection API
- `feature.setProperties()` / `feature.getProperties()` — documented Feature API

Lit API knowledge (HIGH confidence, stable across Lit 3.x):
- `@state()` for internal reactive state — core Lit API
- `updated(changedProperties)` lifecycle hook — core Lit API
- Shadow DOM containment of `render()` output — fundamental Lit/web component behavior

---

*Architecture research: 2026-02-18*
