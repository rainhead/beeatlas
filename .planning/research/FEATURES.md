# Feature Landscape

**Domain:** Biodiversity occurrence map — volunteer field collector workflow
**Project:** Washington Bee Atlas
**Researched:** 2026-02-18
**Overall confidence:** HIGH (OpenLayers APIs verified from installed source; domain knowledge from comparable tools)

---

## Context: What We're Adding

The map already renders Ecdysis arthropod specimen points from a Parquet file. This research covers the five features in scope:

1. Taxon filtering (species / genus / family)
2. Date range filtering
3. Click-to-see-details for specimen samples
4. iNaturalist host plant layer
5. Location search / navigate

Users are **field biologists planning collecting trips**, not general public. They know taxonomy, care about where and when specimens exist, and want to cross-reference host plant distribution.

---

## Table Stakes

Features users expect from any occurrence map. Missing = product feels incomplete.

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Point-click detail popup | Standard map interaction; users need to know what a dot represents | Medium | ol/Overlay anchored to coordinate; show species, collector, date, host plant |
| Taxon filter | Core use case: "show me only _Osmia_ records" | Medium | Requires taxon fields in Parquet; typeahead preferred |
| Date range filter | Seasonality matters hugely for bees; guides when to collect | Medium | Year or month-of-year range; stored as year/month/day columns |
| Clustered rendering at low zoom | Without it, 45K points overlap into an unreadable blob | Medium | ol/source/Cluster already available; clusterStyle already stubbed in style.ts |
| Scale bar | Universal map convention | Low | ol/control/ScaleLine — 3 lines of code |
| Attribution | Legally required for ESRI tiles; expected by biologists citing data | Low | Already partially present on XYZ source; ensure visible |
| Loading indicator | Parquet file is loaded in one shot — user needs feedback | Low | Show spinner until ParquetSource fires `featuresloadend` |

---

## Differentiators

Features valued for this specific use case that generic occurrence maps don't require.

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| iNaturalist host plant layer (toggleable) | Collectors choose locations by plant availability; cross-layer view is the whole point of the tool | Medium | Separate Parquet or GeoJSON; VectorLayer with plant-specific style; layer toggle control |
| Sample-level detail in popup | Each bee belongs to a sample (collector + date + place + host plant); showing only the specimen is half the story | Medium | Requires sample fields in Parquet; group same-sample specimens in popup |
| Shareable URL (map state in hash/params) | Collectors share "look at this spot" links with each other | Low | ol/interaction/Link already installed; syncs x, y, z, r + can be extended for filter state |
| Location search (geocoder) | Navigate to a county or place name quickly; useful when planning routes | Medium | No OL-native geocoder; requires external API call (Nominatim/OSM is free) or static WA place-name lookup |
| Taxon filter typeahead | With 100s of bee species, a dropdown is unusable; typeahead matching against taxon names is required | Medium | Client-side filter against taxon list from Parquet |
| Layer visibility toggles | Toggle host plants on/off; toggle specimen layer on/off | Low | ol/layer setVisible(); simple checkbox UI outside map |

---

## Anti-Features

Features to explicitly NOT build for this project.

| Anti-Feature | Why Avoid | What to Do Instead |
|--------------|-----------|-------------------|
| Server-side search / API backend | Violates the static hosting constraint; adds infra complexity | Keep all filtering client-side on in-memory Parquet data |
| User accounts / saved filters | Out of scope per PROJECT.md; adds auth complexity | Share URL via ol/interaction/Link for stateful links |
| Drawing / editing tools | Not a data-entry tool; Ecdysis is the source of truth | Link to Ecdysis record for corrections |
| Heat map density layer | Misleads: dense dot clusters near Pullman just mean WSU collects a lot, not ecological significance | Show raw points with clustering; let users interpret |
| Multi-source data (GBIF, OSU Museum) | Out of scope per PROJECT.md; adds data model complexity | Ecdysis only for specimens |
| Mobile-first design | Users are office/desktop planners; touch gestures are a bonus, not primary | Desktop-first; don't fight OpenLayers' touch defaults |
| Real-time data refresh | Data is a curated pipeline output; not a live feed | Static Parquet updated per pipeline run |
| Abundance charts / analytics dashboard | The map IS the analytical tool; side charts are scope creep | Keep it a map; detail panel only |

---

## Feature Dependencies

```
Parquet fields present → Taxon filter works
Parquet fields present → Popup shows meaningful content
Parquet fields present → Date range filter works
Parquet fields present → Host plant layer works (requires iNat data in Parquet)

Taxon filter → URL shareable filter state (filter value goes in URL params)
Date range filter → URL shareable filter state

Cluster source wrapping ParquetSource → Cluster rendering (replaces current direct VectorLayer)
Cluster source → Popup must handle: click on cluster (expand/zoom) vs click on single point (show detail)
```

---

## OpenLayers-Specific Implementation Notes

### Filtering (client-side on Parquet data)

**The core constraint:** All 45K+ features are loaded at once via `all` loading strategy. Filtering cannot be done by re-fetching — it must work on already-loaded Feature objects.

**Recommended pattern:** Store all raw Parquet rows in memory (as plain objects, not Features). When a filter changes, rebuild the VectorSource from the filtered subset.

```typescript
// In ParquetSource or a wrapper:
let allRows: ParquetRow[] = [];   // loaded once
let currentFilter: FilterState = {};

function applyFilter() {
  const filtered = allRows.filter(row => matchesFilter(row, currentFilter));
  source.clear();
  source.addFeatures(filtered.map(rowToFeature));
}
```

**Alternative:** Use `ol/source/Vector` with a `loader` that re-triggers on filter change by calling `source.refresh()`. This re-invokes the loader, but since `asyncBufferFromUrl` will fetch the same URL, the browser cache handles it. Re-parsing 45K rows on each filter change is fast (< 100ms for simple field comparisons in JS).

**Do not use:** `VectorSource.setStyle()` or style-based hide/show — hidden features still participate in hit detection and cluster distance calculations, producing wrong behavior.

### Clustering

`ol/source/Cluster` is already installed and `clusterStyle` is already stubbed in `style.ts`. Wire it up:

```typescript
import Cluster from 'ol/source/Cluster.js';

const clusterSource = new Cluster({
  distance: 40,       // pixels; tune for density
  minDistance: 10,    // avoid total overlap at zoom edges
  source: specimenSource,
});

const clusterLayer = new VectorLayer({
  source: clusterSource,
  style: clusterStyle,  // already handles count-based radius
});
```

**Click handling on clusters:** `map.on('click', ...)` → `map.forEachFeatureAtPixel()` → check `feature.get('features').length`. If > 1, zoom to cluster extent. If 1, show detail popup.

**Performance note:** `ol/source/Cluster` recalculates on every view change. With 45K points, this is CPU-bound. Consider `ol/layer/WebGLPoints` (also installed) for rendering if Cluster proves slow — but WebGLPoints does not support clustering natively; you'd need a separate spatial index (e.g. supercluster npm package).

### Popups

Use `ol/Overlay` anchored to the clicked coordinate. The element is a plain DOM node positioned absolutely over the map viewport.

```typescript
const popup = new Overlay({
  element: document.getElementById('popup'),
  positioning: 'bottom-center',
  offset: [0, -10],
  autoPan: { animation: { duration: 250 } },
});
map.addOverlay(popup);

map.on('click', (evt) => {
  const feature = map.forEachFeatureAtPixel(evt.pixel, f => f);
  if (feature) {
    popup.setPosition(evt.coordinate);
    // populate popup element with feature properties
  } else {
    popup.setPosition(undefined); // hides popup
  }
});
```

**Shadow DOM complication:** The `BeeMap` is a Lit custom element using shadow DOM. `document.getElementById('popup')` will not find elements inside the shadow root. The popup element must be created and appended to the shadow root, or the map target element must be the shadow host's child.

**Recommended:** Create the popup element imperatively in `firstUpdated()` and append to `this.shadowRoot`, then pass the reference to `new Overlay({ element: popupEl })`.

### Multiple Data Layers

iNaturalist host plant layer is a second VectorLayer on the same map:

```typescript
const plantSource = new VectorSource({ ... }); // from separate Parquet or GeoJSON
const plantLayer = new VectorLayer({
  source: plantSource,
  style: plantStyle,
  visible: true,  // controlled by toggle
});

map.addLayer(plantLayer);
```

**Layer ordering:** OpenLayers renders layers in order added; add plant layer before specimen layer so bee dots appear on top of plant markers.

**Toggle:** `plantLayer.setVisible(false)` / `setVisible(true)` — no re-fetch needed.

**Layer group:** Use `ol/layer/Group` only if you need to toggle multiple layers together. For two independent layers, individual `setVisible` is simpler.

### Location Search

No built-in OL geocoder. Options in order of preference:

1. **Nominatim (OSM) — FREE, no key required:** `fetch('https://nominatim.openstreetmap.org/search?q='+query+'&format=json')` → zoom to result bbox using `view.fit(extent)`. Requires attributing OSM. Rate limit: 1 req/sec (acceptable for manual user input).

2. **Static WA county/city lookup:** Bundle a small GeoJSON of WA county centroids. Zero external dependency, instant, works offline. Limited to pre-defined places.

3. **Mapbox Geocoding / Google Places:** Paid/keyed APIs; avoid for a static site without a secret store.

**Recommendation:** Nominatim with a simple debounced input. The call happens only on user action (not continuous), so rate limits are not a concern.

### URL State Sharing

`ol/interaction/Link` is already in the dependency tree and syncs `x`, `y`, `z` (center/zoom) to URL search params automatically. Wire it up:

```typescript
import Link from 'ol/interaction/Link.js';
map.addInteraction(new Link());
```

For filter state (taxon, date range), extend by listening to filter change events and manually updating URL params, or use a custom `params` extension of `Link`.

---

## MVP Recommendation

Build in this order, as each unblocks the next:

1. **Parquet fields** — Ensure the Parquet contains: `taxon_name`, `family`, `genus`, `species`, `year`, `month`, `day`, `collector`, `host_plant`, `sample_id`, `ecdysis_id`, `longitude`, `latitude`. Nothing else matters until these exist.

2. **Clustering** — Wire `clusterStyle` and `Cluster` source. Immediately makes the map usable at state-level zoom.

3. **Click popup** — `ol/Overlay` showing species, date, collector, host plant for a clicked specimen. Essential for any map utility.

4. **Taxon filter** — Typeahead input filtering the in-memory rows. The primary user workflow.

5. **Date range filter** — Year or month-of-year slider. Secondary but expected.

6. **Host plant layer** — Second VectorLayer from iNaturalist Parquet. Requires plant data pipeline to be complete first.

7. **Location search** — Nominatim fetch + `view.fit()`. Quality-of-life improvement, low risk.

8. **URL sharing** — `ol/interaction/Link` + manual filter params. Last because filters must exist first.

**Defer:**
- Scale bar: trivial to add, not user-facing priority
- Loading indicator: add when Parquet file grows large enough to be perceptible (currently unknown)

---

## Sources

- OpenLayers 10.8.0 source examined directly at `/Users/rainhead/dev/beeatlas/node_modules/ol/` (HIGH confidence)
  - `source/Cluster.js` — distance, minDistance, createCluster options verified
  - `Overlay.js` — positioning, autoPan, element, offset options verified
  - `interaction/Select.js` — singleClick condition verified
  - `interaction/Link.js` — params tracking verified
  - `layer/WebGLPoints.js` — disableHitDetection, renderer confirmed present
  - `control/ScaleLine.js` — confirmed present
- Project context from `.planning/PROJECT.md` and `.planning/codebase/ARCHITECTURE.md` (HIGH confidence)
- Data schema from `data/scripts/download.py` ECDYSIS_DTYPES and MASTER_2025_DTYPES (HIGH confidence)
- Nominatim usage pattern — training knowledge (MEDIUM confidence; verify rate limits at nominatim.org/release-notes before shipping)
