# Phase 4: Filtering - Research

**Researched:** 2026-02-22
**Domain:** Client-side feature filtering on OpenLayers Cluster source + Lit reactive UI
**Confidence:** HIGH

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Sidebar layout:**
- Sidebar is unified: filter controls (top) → summary stats → specimen listing
- Summary stats show filtered vs. total counts, e.g., "Genera: 3 of 80", "Specimens: 142 of 4,800"
- Specimen listing below the summary only populates when the user clicks a cluster or point on the map
- When a cluster is clicked, the listing shows only the specimens from that cluster that match the active filter
- No tabs — filters, stats, and listing coexist in a single scrollable sidebar

**Map behavior when filters are applied:**
- Non-matching specimen points and clusters are **dimmed/ghosted** (reduced opacity), not hidden entirely
- Matching points render at full opacity and remain clickable
- Non-matching points are not clickable
- This preserves geographic context while highlighting the filtered subset
- Note: roadmap success criteria say "hides" non-matching points; user preference is to ghost them instead

**Taxon filter:**
- Text input with dropdown autocomplete suggestions as the user types
- Suggestions include all taxonomy levels mixed together (family, genus, species), each labeled by rank
- Selecting a taxon filters to that taxon AND all its descendants (e.g., selecting genus "Bombus" includes all Bombus species)
- Single selection only — selecting a new taxon replaces the previous one
- Clearing the input removes the taxon filter

**Date filter — year range:**
- Two plain number inputs: "From" year and "To" year
- Open-ended: filling only "From" means that year to present; filling only "To" means all years up to that year
- Both empty = no year filter active

**Date filter — month filter:**
- Checkboxes for each of the 12 months (non-contiguous selection allowed, e.g., May + September)
- No months checked = no month filter active

**Filter combination:**
- Taxon and date filters combine with AND logic: specimens must match both to be shown at full opacity

### Claude's Discretion

- Visual design of the dimmed/ghosted state (opacity level, color treatment)
- Exact layout and spacing of filter controls within the sidebar
- How the summary stats section is styled
- Whether the "From"/"To" year inputs have min/max constraints based on dataset range

### Deferred Ideas (OUT OF SCOPE)

- None — discussion stayed within phase scope
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| FILTER-01 | User can filter displayed specimens by taxon at species, genus, or family level | Taxon filter uses `scientificName`, `genus`, `family` fields already in `ParquetSource`. A `FilterState` object drives `clusterStyle` dimming and the Cluster `geometryFunction`. Autocomplete suggestions are built from distinct values loaded at startup. |
| FILTER-02 | User can filter displayed specimens by year range and/or month of year (independently) | Year and month fields already in `ParquetSource`. Year range filter uses two number inputs (open-ended). Month filter uses 12 checkboxes. Both combined with AND logic in the shared `FilterState`. |
</phase_requirements>

---

## Summary

Phase 4 adds in-browser filtering of the 51,633 specimen features already loaded into `specimenSource` (a `VectorSource`). No new data loading or network requests are needed. All filter work happens client-side by (a) adjusting what the `clusterStyle` function renders as full vs. ghosted opacity, and (b) driving the Cluster source's `geometryFunction` to produce cluster counts that reflect only matching features.

The key architectural challenge is that filter state lives outside the OpenLayers objects — it is owned by the `BeeMap` Lit component — yet the OL style function and geometry function must read it. The clean pattern is a shared mutable `FilterState` object that the style and geometry functions close over, updated by the Lit component when reactive state changes. After each filter update, calling `clusterSource.changed()` triggers reclustering and a map repaint.

The taxon autocomplete does not require any additional libraries. The dataset has 16 families, 91 genera, and 529 species names — well under the threshold where a fuzzy-search library would provide meaningful benefit. A native `<datalist>` element or a simple `<ul>` dropdown rendered by Lit handles this scale easily. The `datalist` approach is the simplest, though it gives no control over styling the dropdown.

**Primary recommendation:** Use a shared `FilterState` plain object closed over by `clusterStyle` and `geometryFunction`. Lit `@state` on `BeeMap` tracks filter inputs; each change updates the shared object and calls `clusterSource.changed()`. No new npm packages required.

---

## Standard Stack

### Core (already installed)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `lit` | ^3.2.1 | Reactive UI for filter controls + sidebar restructure | Already in use for `bee-map` and `bee-sidebar` |
| `ol` | ^10.7.0 | OpenLayers: `Cluster`, `VectorLayer`, `VectorSource`, `Style` | Already in use for map and clustering |
| `temporal-polyfill` | ^0.2.5 | Date math (already used for recency tier) | Already installed |

### No New Dependencies Required

The data scale (16 families, 91 genera, 529 species names) does not justify a fuzzy-search library. The native `<datalist>` element provides browser-native autocomplete with zero JS. A hand-rolled filtered `<ul>` dropdown in Lit is equally viable for more styling control.

If a fuzzy search library were needed later, Fuse.js (lightweight, no dependencies) is the ecosystem standard. Do not add it now.

**Installation:**
```bash
# No new packages
```

---

## Architecture Patterns

### Recommended File Structure

```
frontend/src/
├── bee-map.ts         # Owns FilterState, wires filter changes → clusterSource.changed()
├── bee-sidebar.ts     # Restructured: filter controls (top) → summary stats → specimen listing
├── parquet.ts         # Unchanged: ParquetSource loads specimen features
├── style.ts           # clusterStyle receives FilterState, dims non-matching clusters
└── filter.ts          # NEW: FilterState type + predicate function (isMatch)
```

A single new `filter.ts` module keeps filter logic isolated and testable. `style.ts` and `bee-map.ts` both import from it.

### Pattern 1: Shared FilterState Object (Closed Over)

**What:** A plain object holding the current filter criteria. The style function and geometry function close over the same reference. `BeeMap` updates the object's fields, then calls `clusterSource.changed()` to force re-evaluation.

**When to use:** When OpenLayers callbacks need to read state that lives outside OL's control. Passing state via function parameters is not possible because OL calls these functions with fixed signatures.

**Example:**
```typescript
// filter.ts
export interface FilterState {
  taxonName: string | null;      // scientificName, genus, or family value
  taxonRank: 'species' | 'genus' | 'family' | null;
  yearFrom: number | null;
  yearTo: number | null;
  months: Set<number>;           // empty = no month filter; 1-12
}

export function makeFilter(): FilterState {
  return { taxonName: null, taxonRank: null, yearFrom: null, yearTo: null, months: new Set() };
}

export function isFilterActive(f: FilterState): boolean {
  return f.taxonName !== null || f.yearFrom !== null || f.yearTo !== null || f.months.size > 0;
}

export function matchesFilter(feature: Feature, f: FilterState): boolean {
  // Taxon: family match, genus match, or scientificName match (plus descendants)
  if (f.taxonName !== null) {
    const family = feature.get('family') as string | null;
    const genus = feature.get('genus') as string | null;
    const name = feature.get('scientificName') as string | null;
    const match =
      (f.taxonRank === 'family' && family === f.taxonName) ||
      (f.taxonRank === 'genus' && genus === f.taxonName) ||
      (f.taxonRank === 'species' && name === f.taxonName);
    if (!match) return false;
  }
  // Year range
  const year = feature.get('year') as number;
  if (f.yearFrom !== null && year < f.yearFrom) return false;
  if (f.yearTo !== null && year > f.yearTo) return false;
  // Month
  if (f.months.size > 0) {
    const month = feature.get('month') as number;
    if (!f.months.has(month)) return false;
  }
  return true;
}
```

### Pattern 2: Dimming Non-Matching Clusters via Style Function

**What:** The `clusterStyle` function already iterates inner features to compute recency. Extend it to also check whether any inner features match the current filter. Clusters where NO inner features match are rendered at low opacity (e.g., 0.2). Clusters where SOME features match are rendered at full opacity — the cluster count label should reflect only the matching subset.

**When to use:** Required for the "ghost/dim" behavior. Do not use `layer.setOpacity()` (affects whole layer, not per-cluster).

**Key insight about Cluster feature structure:** Each feature passed to `clusterStyle` has a `features` property containing the original `Feature[]`. The inner features carry `family`, `genus`, `scientificName`, `year`, `month` properties set by `ParquetSource`. The style function must iterate inner features each call — the existing cache strategy must be invalidated when filter changes.

**Cache invalidation:** The existing `styleCache` uses `count:tier` keys. When a filter is active, cluster rendering becomes input-sensitive to the filter (same count could have different match counts). Two options:
1. **Disable cache when filter active** — simple, correct, slight perf cost
2. **Extend cache key** to `count:tier:matchCount` — more complex

For a dataset of ~50K specimens, option 1 (skip cache when filter active) is safe. The cache benefits the no-filter steady state.

**Example:**
```typescript
// style.ts — updated clusterStyle
import { filterState } from './filter.ts';  // shared mutable singleton

export function clusterStyle(feature: FeatureLike): Style | Style[] {
  const innerFeatures: Feature[] = (feature.get('features') as Feature[] | undefined) ?? [feature as Feature];
  const active = isFilterActive(filterState);

  let matchCount = 0;
  let bestTier: keyof typeof RECENCY_COLORS = 'older';

  for (const f of innerFeatures) {
    const tier = recencyTier(f.get('year') as number, f.get('month') as number);
    if (tier === 'fresh') { bestTier = 'fresh'; }
    else if (tier === 'thisYear' && bestTier === 'older') bestTier = 'thisYear';
    if (!active || matchesFilter(f, filterState)) matchCount++;
  }

  const isGhosted = active && matchCount === 0;
  const displayCount = active ? matchCount : innerFeatures.length;

  if (isGhosted) {
    // Return dimmed style — NOT cached (or use separate ghost cache)
    // ...
  }

  const cacheKey = active ? null : `${displayCount}:${bestTier}`;
  if (cacheKey && styleCache.has(cacheKey)) return styleCache.get(cacheKey)!;
  // ... build Style, cache if !active ...
}
```

### Pattern 3: Triggering Cluster Recalculation

**What:** After updating `filterState`, call `clusterSource.changed()` to force the Cluster to re-run its geometry function and recalculate which features cluster together. Then call `speicmenLayer.changed()` to force redraw.

**Verified behavior:** The Cluster source's internal `cluster()` function runs on each `loadFeatures()` call when resolution changes, and also when the underlying source emits a `change` event. Calling `clusterSource.changed()` dispatches a `change` event that triggers a repaint. The geometry function re-runs against all features.

**CRITICAL WARNING — geometryFunction approach:** Returning `null` from `geometryFunction` removes a feature from the map entirely (it does not render as an unclustered dot). This is the WRONG approach for the "ghost" behavior. The geometry function should always return the feature's geometry. Ghosting must be done in the style function only.

**Example:**
```typescript
// In BeeMap — after filter state change
filterState.taxonName = selectedTaxon?.name ?? null;
filterState.taxonRank = selectedTaxon?.rank ?? null;
clusterSource.changed();       // triggers reclustering + repaint
this.filterVersion++;          // @state increment to trigger Lit re-render for stats
```

### Pattern 4: Taxon Autocomplete with `<datalist>`

**What:** Native HTML `<datalist>` bound to an `<input>` provides browser-native autocomplete with no JS logic. Populate `<option>` elements from distinct taxa at startup. Each option includes the rank in its label.

**Limitation:** `<datalist>` styling is browser-controlled — no custom CSS for the dropdown list. The `value` attribute controls what gets inserted; the visible label can be different via the display text.

**Alternative:** A Lit-rendered `<ul>` dropdown positioned below the input (using `position: absolute`), showing only matching options as the user types. More styling control, more code.

**Recommendation:** Start with `<datalist>` for simplicity. The dataset is small enough (636 total suggestions: 16 families + 91 genera + 529 species) that even all options fit in memory with zero performance concern.

**Example (datalist approach in Lit):**
```typescript
// In bee-sidebar.ts — render filter controls
private _allTaxa: Array<{label: string; value: string; rank: 'family'|'genus'|'species'}> = [];

// Called once after features load, passed down from bee-map
setTaxaOptions(features: Feature[]) {
  const families = new Set<string>();
  const genera = new Set<string>();
  const species = new Set<string>();
  for (const f of features) {
    const fam = f.get('family') as string | null;
    const gen = f.get('genus') as string | null;
    const sp = f.get('scientificName') as string | null;
    if (fam) families.add(fam);
    if (gen) genera.add(gen);
    if (sp) species.add(sp);
  }
  this._allTaxa = [
    ...[...families].map(v => ({label: `${v} (family)`, value: v, rank: 'family' as const})),
    ...[...genera].map(v => ({label: `${v} (genus)`, value: v, rank: 'genus' as const})),
    ...[...species].map(v => ({label: `${v}`, value: v, rank: 'species' as const})),
  ];
}

// In render():
html`
  <input list="taxon-options" placeholder="Filter by taxon…" @input=${this._onTaxonInput} />
  <datalist id="taxon-options">
    ${this._allTaxa.map(t => html`<option value="${t.label}"></option>`)}
  </datalist>
`
```

**Note on datalist + Shadow DOM:** `<datalist>` referenced by `list=` must be in the same DOM tree scope. Inside a Lit shadow root, this works fine because the `<input>` and `<datalist>` are in the same shadow root.

### Pattern 5: Filtered Summary Stats

**What:** The sidebar currently shows total counts (`DataSummary`). With filtering, it must show both filtered and total. The filtered counts are computed by iterating `specimenSource.getFeatures()` and counting only matching features.

**When to recompute:** Every time filter state changes. At 51,633 features, a full linear scan takes ~1–5ms — acceptable for a user-triggered action.

**Example:**
```typescript
function computeFilteredSummary(
  allFeatures: Feature[],
  filter: FilterState
): { filtered: DataSummary; total: DataSummary } {
  const matching = allFeatures.filter(f => matchesFilter(f, filter));
  return {
    total: computeSummary(allFeatures),
    filtered: computeSummary(matching),
  };
}
```

The `DataSummary` interface in `bee-sidebar.ts` needs a companion `FilteredSummary` or just optional `filteredXxx` fields.

### Pattern 6: Click-to-Detail Filtered Cluster Listing

**What:** When a cluster is clicked, `buildSamples(inner)` currently passes all inner features. With filtering active, the listing should show only the matching specimens from that cluster. The non-matching ones are still present in the cluster (because `geometryFunction` does not exclude them), so filter at the `buildSamples` call site.

**Example:**
```typescript
// In BeeMap singleclick handler
const inner: Feature[] = (hits[0].get('features') as Feature[]) ?? [hits[0] as unknown as Feature];
const toShow = isFilterActive(filterState)
  ? inner.filter(f => matchesFilter(f, filterState))
  : inner;
this.selectedSamples = toShow.length > 0 ? buildSamples(toShow) : null;
```

### Anti-Patterns to Avoid

- **Using `geometryFunction` returning `null` to filter features:** This removes features from the map entirely. Use the style function for dimming instead.
- **Hiding features with `return null` style:** Returning `null` from a style function makes the feature invisible but it remains clickable — broken UX.
- **Calling `layer.setOpacity()` for per-cluster dimming:** `setOpacity()` affects the entire layer uniformly. Per-cluster opacity must be set via the fill/stroke color's alpha channel in the `Style` object.
- **Using a global styleCache key that ignores filter state:** When filter is active, the same cluster count can have different match counts, rendering the cache incorrect. Skip the cache when filter is active.
- **Putting filter state in Lit @state only:** OL style functions are called synchronously by OL outside Lit's control. Lit reactive state cannot be read directly by OL callbacks. Use a shared plain object instead.
- **Debouncing year number inputs too aggressively:** Year changes are discrete (type a 4-digit year). Debounce is not needed; update on `change` event (not `input`).

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Autocomplete UI | Custom virtual-scroll dropdown | Native `<datalist>` | 636 taxa fit in memory, browser handles display |
| Fuzzy matching | Levenshtein distance implementation | Native `<datalist>` prefix matching | Prefix matching is sufficient for taxon names |
| Change notification from Lit to OL | Custom event bus | Shared mutable `FilterState` object + `clusterSource.changed()` | Simplest correct pattern for OL integration |

**Key insight:** OL's style system is synchronous and callback-driven. Fighting it with reactive/observable patterns adds complexity. The shared mutable object is idiomatic for this use case.

---

## Common Pitfalls

### Pitfall 1: geometryFunction null vs. style null confusion

**What goes wrong:** Using `geometryFunction` returning `null` to hide non-matching features. Result: features disappear from the map entirely and the cluster count drops, but the features are also excluded from click interactions, producing ghost clusters with wrong counts.

**Why it happens:** Developers conflate "exclude from clustering" with "hide from view." OL's cluster source uses `geometryFunction` to determine cluster membership, not visibility.

**How to avoid:** Visibility and interactivity are controlled by the style function. Use `geometryFunction` only for geometry transformation, never for filtering.

**Warning signs:** Features are invisible but the cluster count is less than expected; clicking a cluster produces empty or reduced listings.

### Pitfall 2: Style cache invalidation

**What goes wrong:** The `styleCache` keyed on `count:tier` returns stale styles after filter changes. A cluster with 10 features might now have 3 matching, but the cached style still shows count=10 at full opacity.

**Why it happens:** The cache was designed for the no-filter case where count+tier uniquely determines style.

**How to avoid:** When `isFilterActive(filterState)`, bypass the cache entirely. The existing cache continues to serve the no-filter steady state.

**Warning signs:** Map does not update after filter change, or cluster counts remain wrong after clearing a filter.

### Pitfall 3: clusterSource.changed() not triggering repaint

**What goes wrong:** After updating `filterState`, the map does not repaint because `clusterSource.changed()` alone may not force a full re-render in all OL versions.

**Why it happens:** OL sometimes needs both the source and the layer to be marked changed.

**How to avoid:** Call both `clusterSource.changed()` and the map's `render()` method, or alternatively `speicmenLayer.changed()`. Verify visually during development.

**Warning signs:** Filter controls update but the map does not visually respond.

### Pitfall 4: datalist inside Shadow DOM scoping

**What goes wrong:** `<datalist id="taxon-options">` is invisible to an `<input list="taxon-options">` in a different shadow root.

**Why it happens:** The `list` attribute uses `getElementById` which is scoped to the shadow root's document.

**How to avoid:** Keep both `<input>` and `<datalist>` in the same shadow root. In `bee-sidebar`, this is automatic since Lit renders both in the same shadow root.

**Warning signs:** Autocomplete dropdown does not appear despite `<datalist>` being present.

### Pitfall 5: month checkbox "no filter" vs "none selected" ambiguity

**What goes wrong:** "No months checked" should mean "no month filter active" (show all months). But if a user checks all 12 then unchecks all 12, the intent is ambiguous.

**Why it happens:** The CONTEXT.md decision is clear: "No months checked = no month filter active." The implementation just needs to check `months.size === 0`.

**How to avoid:** Use `Set<number>` where empty means "no filter." No special "all months" logic needed.

---

## Code Examples

Verified patterns from official sources and codebase inspection:

### FilterState singleton (shared between OL and Lit)

```typescript
// filter.ts
import type Feature from 'ol/Feature.js';

export interface FilterState {
  taxonName: string | null;
  taxonRank: 'family' | 'genus' | 'species' | null;
  yearFrom: number | null;
  yearTo: number | null;
  months: Set<number>;  // 1-12; empty = no month filter
}

// Shared singleton — OL style/geometry functions close over this
export const filterState: FilterState = {
  taxonName: null,
  taxonRank: null,
  yearFrom: null,
  yearTo: null,
  months: new Set(),
};

export function isFilterActive(f: FilterState): boolean {
  return f.taxonName !== null
    || f.yearFrom !== null
    || f.yearTo !== null
    || f.months.size > 0;
}

export function matchesFilter(feature: Feature, f: FilterState): boolean {
  if (f.taxonName !== null) {
    const ok =
      (f.taxonRank === 'family' && feature.get('family') === f.taxonName) ||
      (f.taxonRank === 'genus' && feature.get('genus') === f.taxonName) ||
      (f.taxonRank === 'species' && feature.get('scientificName') === f.taxonName);
    if (!ok) return false;
  }
  const year = feature.get('year') as number;
  if (f.yearFrom !== null && year < f.yearFrom) return false;
  if (f.yearTo !== null && year > f.yearTo) return false;
  if (f.months.size > 0 && !f.months.has(feature.get('month') as number)) return false;
  return true;
}
```

### Triggering OL repaint from Lit filter change

```typescript
// In BeeMap (bee-map.ts)
// @state() filterVersion = 0; — increment to trigger Lit re-render of stats
private _applyFilter() {
  // filterState already mutated
  clusterSource.changed();         // triggers OL reclustering + repaint
  this.filterVersion++;            // triggers Lit re-render for summary stats
  this._recomputeSummary();
}
```

### Updated clusterStyle with ghosting (source: codebase + OL API docs)

```typescript
// style.ts — key change: check filter match for cluster opacity
export function clusterStyle(feature: FeatureLike): Style {
  const innerFeatures: Feature[] = (feature.get('features') as Feature[] | undefined) ?? [feature as Feature];
  const active = isFilterActive(filterState);

  let bestTier: keyof typeof RECENCY_COLORS = 'older';
  let matchCount = 0;

  for (const f of innerFeatures) {
    const tier = recencyTier(f.get('year') as number, f.get('month') as number);
    if (tier === 'fresh') bestTier = 'fresh';
    else if (tier === 'thisYear' && bestTier === 'older') bestTier = 'thisYear';
    if (!active || matchesFilter(f, filterState)) matchCount++;
  }

  const isGhosted = active && matchCount === 0;
  const displayCount = active ? matchCount : innerFeatures.length;

  // Skip cache when filter active (count:tier no longer uniquely determines style)
  const cacheKey = active ? null : `${displayCount}:${bestTier}`;
  if (cacheKey && styleCache.has(cacheKey)) return styleCache.get(cacheKey)!;

  const opacity = isGhosted ? 0.2 : 1.0;
  const color = isGhosted ? '#aaaaaa' : RECENCY_COLORS[bestTier];
  const radius = displayCount === 1 ? 4 : 6 + Math.log2(Math.max(displayCount, 1)) * 2;

  const style = new Style({
    image: new Circle({
      radius,
      fill: new Fill({ color: hexWithOpacity(color, opacity) }),
      stroke: new Stroke({ color: `rgba(255,255,255,${opacity})`, width: 1 }),
    }),
    text: isGhosted ? undefined : new Text({
      text: String(displayCount),
      fill: new Fill({ color: '#fff' }),
      font: 'bold 11px sans-serif',
    }),
  });

  if (cacheKey) styleCache.set(cacheKey, style);
  return style;
}
```

Note: `hexWithOpacity(color, opacity)` is a small helper that converts a hex color to `rgba(r, g, b, opacity)`.

### Taxon autocomplete options construction

```typescript
// Built once when ParquetSource fires 'change' event
function buildTaxaOptions(features: Feature[]): TaxonOption[] {
  const families = new Set<string>();
  const genera = new Set<string>();
  const species = new Set<string>();
  for (const f of features) {
    const fam = f.get('family') as string | null;
    const gen = f.get('genus') as string | null;
    const sp  = f.get('scientificName') as string | null;
    if (fam) families.add(fam);
    if (gen) genera.add(gen);
    if (sp) species.add(sp);
  }
  return [
    ...[...families].sort().map(v => ({ label: `${v} (family)`, name: v, rank: 'family' as const })),
    ...[...genera].sort().map(v => ({ label: `${v} (genus)`, name: v, rank: 'genus' as const })),
    ...[...species].sort().map(v => ({ label: v, name: v, rank: 'species' as const })),
  ];
}
```

Dataset sizes: 16 families, 91 genera, 529 scientific names = 636 total options. Prefix matching is sufficient.

### Year input — update on `change` not `input`

```html
<!-- Use 'change' event (fires on blur/Enter), not 'input' (fires on each keystroke) -->
<input type="number" min="2023" max="2025" placeholder="From"
       @change=${this._onYearFromChange} />
```

Year filter updates are cheap but there is no need to filter while the user is still typing a 4-digit year. The `change` event fires when the user commits the value (Tab/Enter/blur).

---

## Data Facts (from parquet inspection)

| Fact | Value | Implication |
|------|-------|-------------|
| Total specimens | 51,633 | Linear scan for filter match: ~1–5ms |
| Distinct families | 16 | Small enough to show all in autocomplete |
| Distinct genera | 91 | Small enough to show all in autocomplete |
| Distinct scientific names | 529 | Small enough to show all in autocomplete |
| Total autocomplete options | ~636 | Native `<datalist>` is fine |
| Year range | 2023–2025 | Only 3 years — min/max on inputs makes sense |
| Month range | 1–12 | All months present |
| `specificEpithet` field | In parquet schema | Not loaded by `ParquetSource` (columns list) — NOT needed since `scientificName` serves as species identifier |

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `geometryFunction` returning null to hide features | Style function opacity for ghosting | OL has always had this; just a misconception to avoid | Do not use geometryFunction for visibility |
| `layer.setOpacity()` for feature dimming | Per-style alpha in fill/stroke color | OL has per-feature style; layer opacity is a known rough tool | Per-cluster dimming requires style function |
| Manual cache-all strategy | Selective cache bypass when filter active | No OL version change — pattern choice | Required for correctness |

---

## Open Questions

1. **`clusterSource.changed()` alone sufficient to force repaint?**
   - What we know: Calling `changed()` increments revision and fires the `change` event, which OL's rendering pipeline listens to.
   - What's unclear: Whether this consistently forces a sync re-render vs. requiring `map.render()` as well.
   - Recommendation: Call `clusterSource.changed()` first; if the map doesn't update in testing, also call `this.map!.render()`. This is trivially testable during implementation.

2. **Non-matching cluster click behavior: suppress or allow?**
   - Context decision says non-matching points are "not clickable." With the ghost approach, they are still present in OL's hit-test. Filtering in the click handler (Pattern 6) achieves this: a click on a fully-ghosted cluster would find zero matching samples and could show nothing, or the back button.
   - Recommendation: Filter at click handling time; if `toShow.length === 0`, do not update `selectedSamples`. The cluster remains visually ghosted and click produces no sidebar change.

3. **Should the sidebar's taxon filter input be in `bee-sidebar` or `bee-map`?**
   - The filter controls affect `filterState` which is owned by `BeeMap`. The sidebar is the visual location. Two clean options: (a) `BeeSidebar` renders the inputs and dispatches a `filter-changed` CustomEvent that `BeeMap` handles; (b) `BeeMap` renders filter inputs outside `BeeSidebar`.
   - Recommendation: (a) — `BeeSidebar` owns the filter UI and dispatches events. This keeps the sidebar's layout unified as the CONTEXT decision requires. `BeeMap` listens and mutates `filterState`.

---

## Sources

### Primary (HIGH confidence)
- OpenLayers v10.8.0 VectorLayer API — https://openlayers.org/en/latest/apidoc/module-ol_layer_Vector-VectorLayer.html — style function signature verified
- OpenLayers v10.8.0 Cluster API — https://openlayers.org/en/latest/apidoc/module-ol_source_Cluster-Cluster.html — geometryFunction behavior, changed() method
- OpenLayers Cluster.js source (v8.1.0) — https://github.com/openlayers/openlayers/blob/v8.1.0/src/ol/source/Cluster.js — internal refresh() mechanism verified
- Lit Reactive Properties — https://lit.dev/docs/components/properties/ — @state vs @property behavior
- Lit Events — https://lit.dev/docs/components/events/ — custom event dispatch + Shadow DOM
- Codebase inspection: `/Users/rainhead/dev/beeatlas/frontend/src/parquet.ts`, `bee-map.ts`, `bee-sidebar.ts`, `style.ts` — existing architecture understood
- Parquet data inspection: 51,633 rows, schema, distinct value counts — Python/pyarrow

### Secondary (MEDIUM confidence)
- OpenLayers Cluster issue #12541 — https://github.com/openlayers/openlayers/issues/12541 — confirmed: `geometryFunction` null removes features from map entirely, not just from clustering
- Earthquake Clusters OL example — https://openlayers.org/en/latest/examples/earthquake-clusters.html — per-cluster opacity via style function confirmed viable
- MDN `<datalist>` — https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/datalist — Shadow DOM scoping behavior

### Tertiary (LOW confidence — needs validation during implementation)
- `clusterSource.changed()` triggering repaint without `map.render()` — inferred from OL Observable pattern; not verified by a direct runnable test

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all libraries already in use; no new packages
- Architecture (FilterState singleton pattern): HIGH — verified against OL style function API; consistent with existing codebase patterns
- geometryFunction pitfall: HIGH — verified by GitHub issue #12541 and OL API docs
- Taxon autocomplete via datalist: HIGH — native HTML, trivially verified
- Cache invalidation pattern: HIGH — derived from direct code analysis of existing `styleCache`
- `changed()` repaint triggering: MEDIUM — consistent with OL Observable design; recommend verify in implementation

**Research date:** 2026-02-22
**Valid until:** 2026-03-22 (stable libraries, short-lived dataset facts)
