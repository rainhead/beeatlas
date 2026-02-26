# Phase 3: Core Map - Research

**Researched:** 2026-02-20
**Domain:** OpenLayers clustering + Lit sidebar panel
**Confidence:** HIGH (verified against installed package sources and official OL docs)

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Cluster appearance:**
- Size encodes specimen count — larger circle = more specimens in cluster
- Color encodes recency of the most recent specimen in the cluster, three tiers:
  - Within last 6 weeks (fresh)
  - This year but older than 6 weeks
  - Before this year
- Recency tiers computed at page load time from today's date (not a fixed reference date)
- Count number always displayed inside every cluster (no threshold)
- Individual specimen points (not clustered): same 3-tier recency color, fixed small size
- Symbology will be revised over time — keep implementation easy to adjust

**Cluster click behavior:**
- Clicking a cluster opens the sidebar with a sample list; no zoom-in
- Clicking a single specimen point opens the sidebar showing just that specimen's sample
- Specimens are organized by **sample** — the grouping unit is (date + collector + host plant)
- Each sample entry shows: date, collector, host plant (fieldNumber) as a header, with species names listed below it
- When a cluster has multiple samples, they are ordered most-recent-first

**Sidebar design:**
- Layout mirrors salishsea.io (https://github.com/salish-sea/salishsea-io/blob/main/src/salish-sea.ts):
  - Desktop: fixed 25rem right panel, `border-left: 1px solid #cccccc`
  - Mobile: panel moves below map at `max-aspect-ratio: 1` breakpoint, map at `50svh`, panel fills remaining space
- Default state (nothing clicked): shows summary statistics — total specimen count, species/genus/family counts, date range of the dataset
- Panel must be structured to accommodate filter and search controls in Phase 4 (don't hard-code a specimen-only layout)
- Dismiss specimen details: clicking elsewhere on the map OR a close/back control inside the panel — both return to the summary statistics view

### Claude's Discretion
- Exact color values for the 3 recency tiers
- Close/back control placement and styling within the sidebar
- Spacing, typography, and visual polish

### Deferred Ideas (OUT OF SCOPE)
- Filter controls (taxon, date range) in the sidebar default state — Phase 4
- Search in the sidebar — Phase 4 or later
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| MAP-01 | Specimen points render as clusters at low zoom levels — existing `clusterStyle` wired to `ol/source/Cluster` | ol/source/Cluster wraps the existing ParquetSource; VectorLayer style function reads `feature.get('features')` for count and recency |
| MAP-02 | Clicking a specimen point or cluster shows sample details in a sidebar — species, collector, date, host plant (fieldNumber) | VectorLayer.getFeatures(pixel) returns a Promise; cluster features carry inner `features` array; Lit @state drives sidebar content |
</phase_requirements>

---

## Summary

The project already has all the necessary library scaffolding. OpenLayers 10.8.0 is installed and the existing `ParquetSource` (a plain `VectorSource`) is wired to a `VectorLayer`. The core work is:

1. **Clustering:** wrap `specimenSource` in `ol/source/Cluster` and replace the static `beeStyle` with a dynamic style function that reads `feature.get('features')` for count (controls circle radius and text label) and computes recency color from the feature array's most-recent year/month.

2. **Click to sidebar:** use `VectorLayer.getFeatures(event.pixel)` (returns a Promise) on the cluster layer; extract the inner features from the cluster feature's `features` property; group them into samples by (year + month + recordedBy + fieldNumber); display in a Lit reactive component sidebar.

3. **Sidebar layout:** restructure the existing `<bee-map>` Lit component (or the outer HTML) to hold a persistent right panel following the salishsea.io flex pattern — always present in DOM, toggling between summary-stats and specimen-detail views via `@state`.

**Primary recommendation:** Wire `ol/source/Cluster` first (MAP-01), verify clustering visually, then add click handler and sidebar (MAP-02). Keep style constants in a single exported object so symbology changes are one-location edits.

---

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| ol | 10.8.0 (installed) | Map, Cluster source, VectorLayer, style API | Already in use; has Cluster built in |
| lit | 3.3.2 (installed) | Reactive web component for sidebar | Already in use for BeeMap element |
| temporal-polyfill | 0.2.5 (installed) | Date arithmetic for recency tier computation | Already a dependency; Temporal.PlainDate avoids timezone traps |
| hyparquet | 1.23.3 (installed) | Read Parquet columns | Already in use; must expand columns read |

### No new packages required

All libraries needed for this phase are already installed. No `npm install` step.

---

## Architecture Patterns

### Recommended File Structure

```
frontend/src/
├── bee-map.ts          # Top-level LitElement — owns map, sidebar, selected state
├── parquet.ts          # ParquetSource — expand columns list
├── style.ts            # Cluster style function + recency color constants
├── sidebar.ts          # NEW: bee-sidebar LitElement (or inline in bee-map.ts)
└── index.css           # Add sidebar layout rules (panel flex)
```

The sidebar component can be a second `@customElement` or inlined in `bee-map.ts`. A separate `bee-sidebar.ts` is cleaner for Phase 4 extensibility, but is not strictly required.

### Pattern 1: ol/source/Cluster wrapping ParquetSource

**What:** Replace the direct `VectorSource` on the layer with a `Cluster` source that wraps it.

**When to use:** Any time point features must merge at lower zoom levels.

```typescript
// Source: ol/source/Cluster.d.ts (installed package)
import Cluster from 'ol/source/Cluster.js';

const clusterSource = new Cluster({
  distance: 40,        // pixels — features within 40px merge
  minDistance: 0,      // no enforced gap between cluster centers
  source: specimenSource,  // the existing ParquetSource
});

const specimenLayer = new VectorLayer({
  source: clusterSource,
  style: clusterStyle,
});
```

Key: `Cluster` listens for `CHANGE` events on the wrapped source and re-clusters automatically when the resolution changes. No manual refresh needed.

### Pattern 2: Dynamic cluster style function

**What:** A function passed to `VectorLayer.style` that receives each cluster feature and returns a `Style`. Every cluster feature carries a `features` array (the original point features) via `feature.get('features')`.

```typescript
// Source: openlayers.org/en/latest/examples/cluster.html (verified)
import Circle from 'ol/style/Circle.js';
import Fill from 'ol/style/Fill.js';
import Stroke from 'ol/style/Stroke.js';
import Style from 'ol/style/Style.js';
import Text from 'ol/style/Text.js';

// Constants — single location for easy revision
const RECENCY_COLORS = {
  fresh:    '#2ecc71',  // within 6 weeks
  thisYear: '#f39c12',  // this year, older than 6 weeks
  older:    '#7f8c8d',  // before this year
} as const;

// Computed once at page load
const today = Temporal.Now.plainDateISO();
const sixWeeksAgo = today.subtract({ weeks: 6 });

function recencyTier(year: number, month: number): keyof typeof RECENCY_COLORS {
  const date = Temporal.PlainDate.from({ year, month, day: 1 });
  if (Temporal.PlainDate.compare(date, sixWeeksAgo) >= 0) return 'fresh';
  if (year >= today.year) return 'thisYear';
  return 'older';
}

function clusterStyle(feature: Feature): Style {
  const features: Feature[] = feature.get('features') ?? [feature];
  const count = features.length;

  // Recency: take the most recent specimen in the cluster
  let bestTier: keyof typeof RECENCY_COLORS = 'older';
  for (const f of features) {
    const tier = recencyTier(f.get('year'), f.get('month'));
    if (tier === 'fresh') { bestTier = 'fresh'; break; }
    if (tier === 'thisYear') bestTier = 'thisYear';
  }

  const radius = count === 1 ? 4 : 6 + Math.log2(count) * 2;
  const color = RECENCY_COLORS[bestTier];

  return new Style({
    image: new Circle({
      radius,
      fill: new Fill({ color }),
      stroke: new Stroke({ color: '#fff', width: 1 }),
    }),
    text: new Text({
      text: String(count),
      fill: new Fill({ color: '#fff' }),
      font: 'bold 11px sans-serif',
    }),
  });
}
```

**Critical detail:** When the cluster has only one specimen, `feature.get('features')` still returns a single-element array — not the raw feature. Always access data via `.get('features')[0]`, not directly on the cluster feature.

### Pattern 3: VectorLayer.getFeatures(pixel) for click handling

**What:** The installed OL Layer base class exposes `getFeatures(pixel): Promise<FeatureLike[]>`. This returns whatever the cluster layer is rendering at that pixel — a cluster feature (with inner `features` array) or nothing.

```typescript
// Source: Layer.d.ts line 296 (installed package)
map.on('singleclick', async (event) => {
  const clickedFeatures = await specimenLayer.getFeatures(event.pixel);
  if (clickedFeatures.length === 0) {
    this.selectedSamples = null; // dismiss sidebar
    return;
  }
  const clusterFeature = clickedFeatures[0];
  const innerFeatures: Feature[] = clusterFeature.get('features') ?? [clusterFeature];
  this.selectedSamples = buildSamples(innerFeatures);
});
```

Use `singleclick` (250ms debounce, not a double-click) rather than `click` for the canonical OL single-click pattern.

**Note on dismiss:** "Clicking elsewhere" is already handled: a click that returns zero features at the pixel sets `selectedSamples = null`.

### Pattern 4: Sidebar as Lit reactive state

**What:** `bee-map.ts` owns a `@state() selectedSamples` property. The sidebar component (or template section) renders conditionally based on this state. The panel element is always present in DOM; content is swapped.

```typescript
// Source: lit.dev/docs/components/properties/ (verified)
import { state } from 'lit/decorators.js';

@customElement('bee-map')
export class BeeMap extends LitElement {
  @state()
  private selectedSamples: Sample[] | null = null;

  render() {
    return html`
      <link rel="stylesheet" href="..." />
      <div id="map"></div>
      <bee-sidebar
        .samples=${this.selectedSamples}
        .summary=${this.summary}
        @close=${() => { this.selectedSamples = null; }}
      ></bee-sidebar>
    `;
  }
}
```

### Pattern 5: Sample grouping logic

**What:** Specimens must be grouped into samples before display. A sample is: same `recordedBy` + same `fieldNumber` + same `year` + same `month`. Group key = `${year}-${month}-${recordedBy}-${fieldNumber}`.

```typescript
interface Sample {
  year: number;
  month: number;
  recordedBy: string;
  fieldNumber: string;
  species: string[];  // scientificName values
}

function buildSamples(features: Feature[]): Sample[] {
  const map = new Map<string, Sample>();
  for (const f of features) {
    const key = `${f.get('year')}-${f.get('month')}-${f.get('recordedBy')}-${f.get('fieldNumber')}`;
    if (!map.has(key)) {
      map.set(key, {
        year: f.get('year'),
        month: f.get('month'),
        recordedBy: f.get('recordedBy'),
        fieldNumber: f.get('fieldNumber'),
        species: [],
      });
    }
    map.get(key)!.species.push(f.get('scientificName'));
  }
  // Sort most-recent-first (year desc, month desc)
  return [...map.values()].sort((a, b) =>
    b.year - a.year || b.month - a.month
  );
}
```

### Pattern 6: Sidebar layout (salishsea.io pattern)

**What:** `bee-map`'s shadow DOM uses `display: flex; flex-direction: row`. The map div grows; the panel has fixed 25rem width. At `max-aspect-ratio: 1` (portrait), flip to column and set map to `50svh`.

```css
/* In BeeMap.styles */
:host {
  display: flex;
  flex-direction: row;
  flex-grow: 1;
  overflow: hidden;
}
#map {
  flex-grow: 1;
}
bee-sidebar {
  width: 25rem;
  border-left: 1px solid #cccccc;
  overflow-y: auto;
}
@media (max-aspect-ratio: 1) {
  :host {
    flex-direction: column;
  }
  #map {
    height: 50svh;
    flex-grow: 0;
    flex-shrink: 0;
  }
  bee-sidebar {
    width: 100%;
    border-left: none;
    border-top: 1px solid #cccccc;
    flex-grow: 1;
  }
}
```

### Pattern 7: Parquet column expansion

**What:** The current `parquet.ts` only reads `ecdysis_id`, `ecdysis_fieldNumber`, `longitude`, `latitude`. The sidebar needs more columns, and the cluster style needs `year`/`month`. The pipeline already writes all required fields.

Columns needed (verified against `occurrences.py` output):
- `year`, `month` — for recency tier + sample grouping
- `scientificName` — species label in sidebar
- `recordedBy` — collector
- `fieldNumber` — host plant / sample key

Update the `columns` array in `parquet.ts` and store all needed fields on the OL `Feature` object:

```typescript
const columns = [
  'ecdysis_id',
  'longitude',
  'latitude',
  'year',
  'month',
  'scientificName',
  'recordedBy',
  'fieldNumber',
];

// In loader:
feature.setGeometry(new Point(fromLonLat([obj.longitude, obj.latitude])));
feature.setId(`ecdysis:${obj.ecdysis_id}`);
feature.setProperties({
  year: obj.year,
  month: obj.month,
  scientificName: obj.scientificName,
  recordedBy: obj.recordedBy,
  fieldNumber: obj.fieldNumber,
});
```

### Anti-Patterns to Avoid

- **Accessing data directly on cluster feature:** `feature.get('year')` on a cluster feature returns `undefined` — data lives on inner features via `feature.get('features')`. Always unwrap.
- **Using `click` event instead of `singleclick`:** `click` fires twice for double-clicks. `singleclick` is debounced by 250ms and is the OL idiomatic single-click event.
- **Caching Style objects with mutable state:** The earthquake example caches styles by size, but this phase requires per-cluster recency colors, so caching by size alone is wrong. Cache by `(count, tier)` tuple or accept the minor allocation cost for ~10k clusters.
- **Putting summary stats computation in render():** Summary stats (total count, species/genus/family counts, date range) should be computed once when Parquet loads, stored in component state, not recomputed on every render.
- **Hardcoding today's date:** Recency tiers use `Temporal.Now.plainDateISO()` once at module load time. Do not reference a fixed date.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Point clustering | Custom clustering algorithm | `ol/source/Cluster` | Already handles resolution changes, distance parameter, centroid calculation |
| Click-to-feature | Manual coordinate→feature lookup | `VectorLayer.getFeatures(pixel)` Promise API | OL handles hit-testing correctly for canvas-rendered features |
| Date arithmetic | Manual year/week math | `temporal-polyfill` (`Temporal.PlainDate`, `.subtract()`, `.compare()`) | Already installed; handles month boundaries and leap years correctly |
| Reactive sidebar | Manual DOM updates | Lit `@state` decorator | Re-renders only changed parts; already in use |

**Key insight:** OL's `getFeatures(pixel)` on a cluster layer correctly returns cluster features (not the underlying point features). The caller must unwrap via `feature.get('features')`. This is the designed API — do not bypass it.

---

## Common Pitfalls

### Pitfall 1: Feature data not on cluster feature

**What goes wrong:** Style function or click handler calls `clusterFeature.get('year')` and gets `undefined`.

**Why it happens:** `ol/source/Cluster` creates synthetic cluster features. The original point features are stored in the `features` property array, not promoted to the cluster feature's properties.

**How to avoid:** Always read data via `feature.get('features')[0].get('year')` for individual points or iterate the array for aggregate computations.

**Warning signs:** `undefined` recency color, NaN in cluster size calculations.

### Pitfall 2: Style function recreates objects on every render

**What goes wrong:** OL calls the style function constantly during pan/zoom. Creating new `Fill`, `Stroke`, `Circle` objects each call degrades performance noticeably at ~10k clusters.

**Why it happens:** This phase has a recency dimension that varies per cluster, so the simple cache-by-size pattern from the OL docs is insufficient. But no cache at all is too slow.

**How to avoid:** Cache `Style` objects by a compound key: `${count}:${tier}`. Since there are only 3 tiers and count varies, cache size stays bounded. Use a `Map<string, Style>` at module scope.

### Pitfall 3: Sidebar dismissal on map interaction — double-fire

**What goes wrong:** A click on a feature opens the sidebar and then immediately dismisses it, because the `singleclick` handler fires once with the feature and the "dismiss on no feature" logic also runs.

**Why it happens:** If both "open" and "dismiss" logic are in the same handler without proper branching, or if there are two separate handlers.

**How to avoid:** Single click handler: if features found → set selectedSamples; if no features → set selectedSamples = null. Do not add a second handler for dismissal.

### Pitfall 4: Shadow DOM blocks ol.css

**What goes wrong:** The OL map renders inside a Shadow DOM (the `<bee-map>` custom element). The `ol.css` CDN link in the `render()` method is the current workaround. Styles applied to `document` head do not penetrate the shadow boundary.

**Why it happens:** Shadow DOM style encapsulation.

**How to avoid:** Keep the `<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/ol@v10.8.0/ol.css">` inside the shadow DOM render output. This is already the current pattern — preserve it.

### Pitfall 5: `flex-grow: 1` on bee-map without height constraint

**What goes wrong:** The map expands but `body` has no defined height so `flex-grow: 1` on `<bee-map>` has no effect. The map collapses to zero height.

**Why it happens:** `flex-grow` only works when the flex container has a defined size. `body` needs `height: 100vh`.

**How to avoid:** Already solved in `index.css` — `body { height: 100vh; flex-direction: column; }` and `<bee-map>` has `flex-grow: 1` in its host styles. Preserve this; don't break it when adding sidebar.

### Pitfall 6: Sidebar panel inside Shadow DOM vs outside

**What goes wrong:** If `bee-sidebar` is defined as a separate custom element but appended to `document.body` instead of rendered inside `bee-map`'s shadow, the flex layout breaks.

**Why it happens:** The flex layout (map + sidebar) must share the same flex container to work.

**How to avoid:** Render `<bee-sidebar>` as a direct child in `bee-map`'s `render()` method's returned template, not inserted into document outside the shadow.

---

## Code Examples

Verified patterns from official/installed sources:

### Full cluster source + layer setup

```typescript
// Source: ol/source/Cluster.d.ts + Cluster.js (installed, ol 10.8.0)
import Cluster from 'ol/source/Cluster.js';
import VectorLayer from 'ol/layer/Vector.js';

const clusterSource = new Cluster({
  distance: 40,
  source: specimenSource,  // existing ParquetSource (a VectorSource)
});

const specimenLayer = new VectorLayer({
  source: clusterSource,
  style: clusterStyle,  // style function from style.ts
});
```

### Click handler

```typescript
// Source: MapBrowserEventType.js (installed) — 'singleclick' is the correct event
// Layer.d.ts line 296 — getFeatures(pixel) returns Promise<FeatureLike[]>
this.map!.on('singleclick', async (event) => {
  const hits = await specimenLayer.getFeatures(event.pixel);
  if (!hits.length) {
    this.selectedSamples = null;
    return;
  }
  const inner: Feature[] = hits[0].get('features') ?? [hits[0]];
  this.selectedSamples = buildSamples(inner);
});
```

### Recency computation using temporal-polyfill

```typescript
// Source: temporal-polyfill 0.2.5 (installed), re-exports temporal-spec types
import { Temporal } from 'temporal-polyfill';

const today = Temporal.Now.plainDateISO();
const sixWeeksAgo = today.subtract({ weeks: 6 });

function recencyTier(year: number, month: number): 'fresh' | 'thisYear' | 'older' {
  // Use day: 1 as a safe lower bound for month-level data
  const sampleDate = Temporal.PlainDate.from({ year, month, day: 1 });
  if (Temporal.PlainDate.compare(sampleDate, sixWeeksAgo) >= 0) return 'fresh';
  if (year >= today.year) return 'thisYear';
  return 'older';
}
```

### Summary statistics (computed on data load)

```typescript
interface DataSummary {
  totalSpecimens: number;
  speciesCount: number;
  genusCount: number;
  familyCount: number;
  earliestYear: number;
  latestYear: number;
}

function computeSummary(features: Feature[]): DataSummary {
  const species = new Set<string>();
  const genera = new Set<string>();
  const families = new Set<string>();
  let min = Infinity, max = -Infinity;
  for (const f of features) {
    species.add(f.get('scientificName'));
    genera.add(f.get('genus'));        // need genus column in Parquet read
    families.add(f.get('family'));     // need family column in Parquet read
    const y = f.get('year');
    if (y < min) min = y;
    if (y > max) max = y;
  }
  return {
    totalSpecimens: features.length,
    speciesCount: species.size,
    genusCount: genera.size,
    familyCount: families.size,
    earliestYear: min,
    latestYear: max,
  };
}
```

Note: `genus` and `family` columns must also be added to the Parquet read columns if summary stats include them (REQUIREMENTS.md says the sidebar shows species/genus/family counts). Add `'genus'` and `'family'` to the `columns` array in `parquet.ts`.

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `ol/interaction/Select` for clicks | `VectorLayer.getFeatures(pixel)` async method | OL 6+ | Simpler; no interaction layer needed |
| OAI S3Origin (deprecated CDK) | OAC S3BucketOrigin (used in Phase 2) | CDK 2.156+ | Already handled |
| Manual date arithmetic | `temporal-polyfill` Temporal API | Installed for this project | Correct week/month boundary handling |

**Deprecated/outdated patterns:**
- `map.forEachFeatureAtPixel()` — still works but synchronous; `layer.getFeatures(pixel)` Promise API is the preferred pattern when working with a single specific layer, as it avoids iterating all layers.

---

## Open Questions

1. **`genus` and `family` columns in summary stats**
   - What we know: The Parquet file has `genus` and `family` columns (confirmed in occurrences.py). The current `parquet.ts` reads only 4 columns and does not include them.
   - What's unclear: REQUIREMENTS.md says the sidebar default shows species/genus/family counts. These are needed for summary stats.
   - Recommendation: Add `'genus'` and `'family'` to the `columns` array in `parquet.ts` alongside the other sidebar fields.

2. **`specificEpithet` in Parquet vs `scientificName`**
   - What we know: Both `scientificName` and `specificEpithet` are written to Parquet by `occurrences.py`. The sidebar spec says "species names listed below" each sample header.
   - What's unclear: Whether to display `scientificName` (full name with author) or `specificEpithet` alone.
   - Recommendation: Use `scientificName` — it is more informative and already included in the minimum column set.

3. **Close/back control in the sidebar**
   - What we know: This is Claude's discretion per CONTEXT.md.
   - Recommendation: A simple "Back" button at the top of the specimen detail view, dispatching a `close` custom event up to `bee-map`. Arrow-left icon `←` or plain text "Back" work. Keep it minimal to leave room for Phase 4 filter controls.

---

## Sources

### Primary (HIGH confidence)
- `/Users/rainhead/dev/beeatlas/node_modules/ol/source/Cluster.d.ts` + `Cluster.js` — Cluster API, options, feature structure
- `/Users/rainhead/dev/beeatlas/node_modules/ol/layer/Layer.d.ts` — `getFeatures(pixel): Promise<FeatureLike[]>` (line 296)
- `/Users/rainhead/dev/beeatlas/node_modules/ol/MapBrowserEventType.js` — `singleclick` event name
- `/Users/rainhead/dev/beeatlas/node_modules/ol/style/Text.d.ts` — Text style options
- `/Users/rainhead/dev/beeatlas/node_modules/lit/decorators.d.ts` — `@state` decorator availability
- `/Users/rainhead/dev/beeatlas/data/ecdysis/occurrences.py` — Parquet column names (ground truth)
- `/Users/rainhead/dev/beeatlas/frontend/src/bee-map.ts` — Existing component structure

### Secondary (MEDIUM confidence)
- [OpenLayers Cluster Example](https://openlayers.org/en/latest/examples/cluster.html) — style cache pattern, `feature.get('features').length`, click-to-extent
- [OpenLayers Earthquake Clusters Example](https://openlayers.org/en/latest/examples/earthquake-clusters.html) — per-feature color, single-vs-cluster branching in style function
- [salishsea.io salish-sea.ts](https://github.com/salish-sea/salishsea-io/blob/main/src/salish-sea.ts) — sidebar flex layout (25rem, border-left, mobile breakpoint)

### Tertiary (LOW confidence — WebSearch only)
- None. All critical claims verified against installed source or official docs.

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all libraries verified in installed `node_modules`
- Architecture: HIGH — Cluster API verified in installed .js/.d.ts; click API verified in Layer.d.ts; style API verified
- Pitfalls: HIGH — derived from actual OL source code reading + official OL examples
- Temporal date handling: HIGH — polyfill installed; API is standard TC39 Temporal

**Research date:** 2026-02-20
**Valid until:** 2026-03-20 (stable libraries; OL and Lit move slowly)
