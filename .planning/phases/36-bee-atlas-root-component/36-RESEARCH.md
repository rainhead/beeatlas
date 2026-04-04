# Phase 36: bee-atlas Root Component - Research

**Researched:** 2026-04-04
**Domain:** Lit coordinator component pattern, custom element composition, event/property threading
**Confidence:** HIGH

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| ARCH-01 | `<bee-atlas>` custom element exists and is the document root component; bee-map is a child rendered by bee-atlas | See "bee-atlas as root: HTML entry point change" and "Lit coordinator pattern" sections |
| ARCH-02 | `<bee-map>` accepts filter results, layer mode, boundary mode, and selection as properties and emits events — it does not read or write any shared state | See "State inventory" and "bee-map @property interface" sections |
| ARCH-03 | bee-atlas handles all events from bee-map and bee-sidebar, updates its own state, and propagates updated properties downward — bee-map and bee-sidebar have no direct references to each other | See "Event bubbling and the coordinator pattern" section |
</phase_requirements>

---

## Summary

`BeeMap` currently does two jobs at once: it owns all application state (filter, selection, layer mode, boundary mode, URL history) AND renders the OL map. The goal of Phase 36 is to split these jobs. A new `<bee-atlas>` element owns all non-map state and acts as a coordinator, while `<bee-map>` and `<bee-sidebar>` become pure presenter components that receive data as properties and emit events upward.

The pattern is standard Lit: a root coordinator component holds `@state` for everything that matters, renders its children with `.property=${value}` bindings, and wires `@event-name=${handler}` to receive child events. Neither child holds canonical state — they are driven entirely by properties from the parent.

The primary challenge is the DuckDB/OL initialization lifecycle, which currently lives inside `BeeMap.firstUpdated()`. This lifecycle code straddles the line: DuckDB loading is cross-cutting (bee-atlas should initiate it), but OL map setup is legitimately bee-map work. The research below clarifies where each piece belongs.

**Primary recommendation:** Create `bee-atlas.ts` as a Lit `@customElement` that imports `filter.ts`, `url-state.ts`, `duckdb.ts`, and renders `<bee-map>` and `<bee-sidebar>` as children. Move all `@state` properties that represent app state from BeeMap to BeeAtlas. Convert those same fields on BeeMap to `@property({ attribute: false })` so BeeAtlas can drive them. Wire all events from bee-map and bee-sidebar to handlers on BeeAtlas.

---

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| lit | ^3.2.1 | Custom element base class + reactive properties | Already in use [VERIFIED: frontend/package.json] |
| lit/decorators.js | (bundled with lit) | @customElement, @state, @property, @query | Already in use [VERIFIED: bee-map.ts, bee-sidebar.ts] |

No new packages required. This is a structural refactor, not a dependency addition.

**Installation:** none needed.

---

## Architecture Patterns

### Recommended Project Structure After Phase 36

```
frontend/src/
├── bee-atlas.ts       # NEW — root coordinator, owns all app state
├── bee-map.ts         # CHANGED — presenter only; @property for all state inputs
├── bee-sidebar.ts     # UNCHANGED (mostly) — already property-driven
├── url-state.ts       # Already pure module (Phase 35)
├── filter.ts          # Already pure module (Phase 34)
├── duckdb.ts          # Already pure module
├── features.ts        # OL VectorSource classes (stay in bee-map.ts scope)
├── region-layer.ts    # OL layer/source singletons (stay in bee-map.ts scope)
└── style.ts           # OL style functions (stay in bee-map.ts scope)
```

### Pattern 1: Lit Coordinator Component

**What:** A root custom element that owns `@state` properties, renders children with `.prop=${value}`, and handles child events via `@event-name=${handler}`. Children are "controlled" — their visible state is fully determined by the properties they receive.

**When to use:** When two sibling components need to share state without referencing each other. This is the canonical Lit approach for cross-sibling coordination.

**Example (coordinator structure):**
```typescript
// Source: Lit documentation — https://lit.dev/docs/components/events/#dispatching-events
@customElement('bee-atlas')
export class BeeAtlas extends LitElement {
  @state() private _filterState: FilterState = { ... };
  @state() private _layerMode: 'specimens' | 'samples' = 'specimens';
  @state() private _boundaryMode: 'off' | 'counties' | 'ecoregions' = 'off';
  @state() private _selectedSamples: Sample[] | null = null;
  @state() private _filteredSummary: FilteredSummary | null = null;
  // ... etc

  render() {
    return html`
      <bee-map
        .filterState=${this._filterState}
        .layerMode=${this._layerMode}
        .boundaryMode=${this._boundaryMode}
        .selectedSamples=${this._selectedSamples}
        @filter-changed=${this._onFilterChanged}
        @layer-changed=${this._onLayerChanged}
        @selection-changed=${this._onSelectionChanged}
        @view-moved=${this._onViewMoved}
      ></bee-map>
      <bee-sidebar
        .filterState=${this._filterState}
        .layerMode=${this._layerMode}
        .summary=${this._summary}
        .filteredSummary=${this._filteredSummary}
        @filter-changed=${this._onFilterChanged}
        @layer-changed=${this._onLayerChanged}
      ></bee-sidebar>
    `;
  }
}
```
[ASSUMED — pattern shape is standard Lit; specific property names determined by state inventory below]

### Pattern 2: Property-Driven Presenter Component

**What:** A custom element with `@property({ attribute: false })` decorators for all inputs that used to be `@state`. It reads only from its received properties and emits events to signal user interactions. It holds no canonical state.

**When to use:** Any component that is rendered by a coordinator parent.

**Key Lit detail:** `@property({ attribute: false })` is the correct decorator for rich objects (Set, arrays, OL sources) passed from parent. Lit will re-render when the reference changes. Primitive values (`string`, `boolean`) can use `@property()` without special options (attribute reflection is harmless for inputs). [VERIFIED: Lit source — lit/decorators.js `property` decorator; official Lit docs https://lit.dev/docs/components/properties/]

### Pattern 3: Composed Event Bubbling

**What:** Events dispatched with `bubbles: true, composed: true` cross shadow DOM boundaries. The coordinator registers `@event-name=${handler}` on the child element in its template. Handlers on bee-atlas receive the event even though it originates in a shadow root.

**Critical detail:** `composed: true` is required for events to cross the shadow DOM boundary from bee-map or bee-sidebar up to bee-atlas. All existing events in the codebase already set `composed: true`. [VERIFIED: bee-sidebar.ts lines 404-408, 686-690, 694-696]

**Note on layout:** `<bee-sidebar>` is currently rendered inside `<bee-map>`'s shadow DOM, positioned via CSS in bee-map's stylesheet. After Phase 36, `<bee-atlas>` renders both as siblings. The flex layout CSS that currently lives in `BeeMap.styles` (`:host { display: flex; flex-direction: row; }` with the sidebar width rule) must move to `BeeAtlas.styles`. BeeMap's shadow root will contain only the map canvas and overlays.

### Anti-Patterns to Avoid

- **Shared module-level singletons used as state:** `filterState` in `filter.ts` is currently a mutable module-level export used as shared state between bee-map and style.ts. After Phase 36, `filterState` must be an instance property on BeeAtlas (or replaced with individual fields). Style functions (`clusterStyle`, `sampleDotStyle`) currently read `visibleEcdysisIds`/`visibleSampleIds` from the filter module as module-level globals — this coupling must be addressed. See "Remaining coupling in style.ts" below.
- **`@state` on properties that should be `@property`:** If BeeMap keeps `@state` on layerMode, boundaryMode, etc., Lit will allow internal updates that bypass the coordinator — defeating the architecture. These must become `@property`.
- **Event handlers in render() that mutate parent state via querySelector or direct references:** bee-map and bee-sidebar must not call methods on bee-atlas; they only emit events.

---

## State Inventory (Answer to Question 1)

### BeeMap @state properties to move to BeeAtlas

All of the following are currently `@state` on BeeMap. Per the success criteria, they must become `@state` on BeeAtlas and be passed to BeeMap as `@property`.

| Current BeeMap @state | Target | Notes |
|----------------------|--------|-------|
| `layerMode: 'specimens' \| 'samples'` | BeeAtlas @state | Drives bee-sidebar toggle AND OL layer visibility |
| `boundaryMode: 'off' \| 'counties' \| 'ecoregions'` | BeeAtlas @state | Drives regionLayer visibility AND filter |
| `selectedSamples: Sample[] \| null` | BeeAtlas @state | Drives bee-sidebar detail panel |
| `summary: DataSummary \| null` | BeeAtlas @state | Computed from specimenSource; passed to bee-sidebar |
| `taxaOptions: TaxonOption[]` | BeeAtlas @state | Computed from specimenSource; passed to bee-sidebar |
| `filteredSummary: FilteredSummary \| null` | BeeAtlas @state | Computed after DuckDB filter query |
| `sampleDataLoaded: boolean` | BeeAtlas @state | Passed to bee-sidebar for loading hint |
| `recentSampleEvents: SampleEvent[]` | BeeAtlas @state | Computed from sampleSource; passed to bee-sidebar |
| `_selectedSampleEvent: SampleEvent \| null` | BeeAtlas @state | Drives bee-sidebar sample detail |
| `_dataLoading: boolean` | BeeAtlas @state (or BeeMap) | Loading overlay — could stay in BeeMap if overlay is map-local |
| `_dataError: string \| null` | BeeAtlas @state (or BeeMap) | Error overlay — same consideration |
| `_countyOptions: string[]` | BeeAtlas @state | Passed to bee-sidebar filter dropdowns |
| `_ecoregionOptions: string[]` | BeeAtlas @state | Passed to bee-sidebar filter dropdowns |
| `_restoredTaxonInput` etc. (8 properties) | **Eliminated** | URL-restore pattern replaced by bee-atlas setting filter state directly on bee-sidebar via filterState property |

**Note on `_dataLoading` and `_dataError`:** The loading/error overlay is rendered inside BeeMap's shadow DOM alongside the map canvas. It may be simpler to keep these as BeeMap @state — the map is what's loading, and the overlay sits on top of it. This is a local rendering concern rather than cross-component shared state. This decision is left to Claude's discretion during planning.

### BeeMap @state properties to keep on BeeMap

These are internal OL/rendering concerns with no cross-component sharing:

| BeeMap @state | Reason to keep |
|--------------|---------------|
| `_isRestoringFromHistory` (private field, not @state) | Internal popstate flag; not rendered |
| `_mapMoveDebounce` (private field) | Internal timeout handle |
| `_selectedOccIds` (private field) | Internal OL hit-test result; not rendered |

### Filter state: the module-level global problem

`filterState` in `filter.ts` is currently an exported mutable singleton used as shared state. After Phase 36, this pattern conflicts with bee-atlas owning filter state. Two options:

**Option A (simpler):** BeeAtlas holds `@state private _filterState: FilterState` as an instance property. When filter changes, BeeAtlas updates this property and passes a copy to BeeMap. BeeMap uses the received filterState to call `queryVisibleIds()`. The module-level `filterState` singleton in filter.ts becomes unused and can be removed.

**Option B:** Keep the module-level `filterState` singleton but treat it as a write-through cache (BeeAtlas writes to it when its own state changes). This preserves style.ts's current read of `filterState` without changing the style functions. However, it maintains a hidden coupling between BeeAtlas and style.ts.

**Recommendation: Option A.** It is the architecturally correct approach and enables the testability goals of Phase 38. The style functions (`clusterStyle`, `sampleDotStyle`) need to be updated to receive `visibleEcdysisIds`/`visibleSampleIds` as closures or parameters rather than reading them from the module. This is a prerequisite side effect of Phase 36.

[ASSUMED: Option A is the intended direction given the Phase 34 STATE.md decision to eliminate module-level mutable state]

---

## Event Interface Catalog (Answer to Question 2)

### Events bee-sidebar currently emits

All three events use `bubbles: true, composed: true`. [VERIFIED: bee-sidebar.ts]

| Event name | CustomEvent detail type | When dispatched |
|-----------|------------------------|-----------------|
| `filter-changed` | `FilterChangedEvent` | Any filter field changes (taxon, year, month, county, ecoregion, boundary toggle) |
| `layer-changed` | `'specimens' \| 'samples'` | User clicks Specimens/Samples tab |
| `sample-event-click` | `{ coordinate: number[] }` | User clicks a recent sample event row |
| `close` | (no detail) | User clicks "Clear selection" button |

`FilterChangedEvent` includes `boundaryMode` in its payload — this is how bee-sidebar communicates boundary mode changes. [VERIFIED: bee-sidebar.ts lines 403-418]

### Events bee-map currently handles (from bee-sidebar, via internal render)

BeeMap currently renders bee-sidebar as a child and handles:
- `@close` — clears selectedSamples and selectedOccIds, pushes URL state
- `@filter-changed` — calls `_applyFilter(e.detail)`
- `@layer-changed` — calls `_onLayerChanged(e.detail)`
- `@sample-event-click` — animates map view to the sample coordinate

[VERIFIED: bee-map.ts lines 571-579]

### New events bee-map must emit (for bee-atlas)

After Phase 36, bee-map must emit events instead of handling state directly:

| New event | Detail | Purpose |
|-----------|--------|---------|
| `view-moved` | `{ lon, lat, zoom }` | Map pan/zoom → bee-atlas pushes URL state |
| `map-click-specimen` | `{ samples: Sample[], occIds: string[] }` | Specimen cluster clicked → bee-atlas updates selection |
| `map-click-sample` | `SampleEvent` | Sample dot clicked → bee-atlas updates selection |
| `map-click-empty` | (none) | Click on empty map area → bee-atlas clears selection |
| `map-click-region` | `{ name: string, shiftKey: boolean }` | Polygon region clicked → bee-atlas updates filter |
| `data-loaded` | `{ summary: DataSummary, taxaOptions: TaxonOption[] }` | specimenSource loaded → bee-atlas updates state |
| `sample-data-loaded` | `{ recentEvents: SampleEvent[] }` | sampleSource loaded → bee-atlas updates state |
| `data-error` | `{ message: string }` | Load failed → bee-atlas updates error state |
| `county-options-loaded` | `{ options: string[] }` | countySource loaded → bee-atlas updates options |
| `ecoregion-options-loaded` | `{ options: string[] }` | ecoregionSource loaded → bee-atlas updates options |

[ASSUMED — derived from current BeeMap `firstUpdated()` logic and the refactoring intent]

---

## DuckDB/Data Loading Lifecycle (Answer to Question 3)

### Current ownership (BeeMap)

DuckDB init (`getDuckDB` + `loadAllTables`) is called in `BeeMap.firstUpdated()`. This is the right place today but the wrong place after Phase 36, because:
1. DuckDB results feed `summary`, `taxaOptions`, and `filteredSummary` which must be owned by BeeAtlas.
2. `specimenSource.once('change')` callback computes `DataSummary` and `TaxonOption[]` from OL features — this computation lives in bee-map but produces data that BeeAtlas must own.

### Recommended split after Phase 36

**BeeAtlas owns:**
- Calling `getDuckDB()` + `loadAllTables()` in its `firstUpdated()` (or delegating to bee-map via a property, then receiving the result event)
- URL state read/write (`parseParams`, `buildParams`, `window.history`)
- `window.addEventListener('popstate', ...)` / cleanup in `disconnectedCallback`
- `filterState` (as an instance property)
- Running `queryVisibleIds()` after filter changes and storing results
- Computing `filteredSummary`, `summary`, `taxaOptions` when OL features arrive

**BeeMap retains:**
- Creating the `OpenLayersMap` instance (`new OpenLayersMap(...)`) in `firstUpdated()`
- Creating OL sources and layers (specimenSource, clusterSource, sampleLayer, regionLayer) as instance properties
- Registering `map.on('singleclick')` and `map.on('moveend')` — then emitting events upward
- Calling `specimenSource.once('change')` and `sampleSource.on('change')` — then emitting results upward
- Calling `clusterSource.changed()` / `sampleSource.changed()` / `map.render()` when BeeAtlas updates visible IDs (received as a property)

**Key insight:** BeeMap does NOT need to be aware of filter state as a concept. It receives `visibleEcdysisIds: Set<string> | null` and `visibleSampleIds: Set<string> | null` as properties and calls `.changed()` + `.render()` when those properties change. It emits data-loaded events with raw results; BeeAtlas computes summaries.

### The style.ts coupling problem

`clusterStyle` and `sampleDotStyle` in `style.ts` currently read `visibleEcdysisIds` and `visibleSampleIds` directly from the `filter.ts` module-level exports. [VERIFIED: style.ts lines 9, 39, 98]

After Phase 36, these module-level globals go away. The style functions must be factory-created closures, or BeeMap must update the module-level variables before triggering OL repaints. The cleanest solution: make the style functions accept a getter parameter, matching the existing pattern for `makeRegionStyleFn`. [VERIFIED: region-layer.ts line 29 — `makeRegionStyleFn(getBoundaryMode: () => ...)` is exactly this pattern]

**Recommendation:** Add `makeClusterStyleFn` and `makeSampleDotStyleFn` factory functions in style.ts that accept `() => Set<string> | null` getters, and set these on layers in BeeMap's firstUpdated. BeeMap stores `visibleEcdysisIds` and `visibleSampleIds` as private instance fields (not @state) updated from received @property changes. [ASSUMED: aligns with Phase 34 STATE.md decision "Style factory closures (makeClusterStyleFn, makeSampleDotStyleFn) set on layers in firstUpdated"]

Wait — the Phase 34 STATE.md decision (line 61) already anticipates this: "Style factory closures (makeClusterStyleFn, makeSampleDotStyleFn) set on layers in firstUpdated via this.visibleEcdysisIds/visibleSampleIds getters — factories called at module level not possible because BeeMap instance doesn't exist yet; plan 02 moves layers into class."

This means Phase 34 plan 02 already moved toward instance-owned style factories. The current code may not fully reflect this yet (it still uses the module-level `clusterStyle` function that reads module globals). Phase 36 should complete this transition. [ASSUMED: the Phase 34 decision is a forward-looking note, not yet implemented]

---

## bee-atlas Entry Point: HTML Change (Answer to Question 4)

### Current state
`index.html` uses `<bee-map>` as the document root and imports `bee-map.ts` as the module. [VERIFIED: frontend/index.html lines 9, 20]

### Required change
```html
<!-- Change this: -->
<script type="module" src="./src/bee-map.ts"></script>
...
<bee-map></bee-map>

<!-- To this: -->
<script type="module" src="./src/bee-atlas.ts"></script>
...
<bee-atlas></bee-atlas>
```

`bee-atlas.ts` imports `bee-map.ts` (and `bee-sidebar.ts`), so all existing imports transitively continue to work. No other HTML changes needed.

---

## Does bee-atlas need to import OL or DuckDB? (Answer to Question 5)

**OL:** BeeAtlas does NOT import OpenLayers. All OL-specific code (map instantiation, source/layer objects, click handlers, `fromLonLat`/`toLonLat`) remains in bee-map.ts. BeeAtlas sends commands downward via properties (e.g., `visibleEcdysisIds`, `layerMode`) and receives results upward via events (e.g., `view-moved`, `map-click-specimen`).

**DuckDB:** BeeAtlas DOES import `getDuckDB` and `loadAllTables` from `duckdb.ts` — it initiates the DuckDB lifecycle in its own `firstUpdated()`. It also imports `queryVisibleIds` from `filter.ts` to run filter queries after filter state changes. These are pure modules with no Lit or OL imports, so the import is fine.

**filter.ts:** BeeAtlas imports `FilterState`, `queryVisibleIds`, `isFilterActive`, `buildFilterSQL` from `filter.ts`. The module-level `filterState` singleton export becomes unused after Phase 36 (BeeAtlas owns an instance copy).

**url-state.ts:** BeeAtlas imports `buildParams`, `parseParams`, `AppState` from `url-state.ts` and owns all URL read/write. [VERIFIED: these functions exist and are pure — url-state.ts]

---

## Filter State Flow (Answer to Question 6)

### Recommended flow

```
User changes filter in bee-sidebar
  → bee-sidebar emits 'filter-changed' (FilterChangedEvent)
  → BeeAtlas._onFilterChanged(e.detail) handler:
      1. Updates this._filterState (creates new object, triggers Lit reactivity)
      2. Calls queryVisibleIds(this._filterState) → { ecdysis, samples }
      3. Updates this._visibleEcdysisIds, this._visibleSampleIds
      4. Computes this._filteredSummary from visible specimen features
      5. Clears this._selectedSamples
      6. Pushes URL state via buildParams + window.history
      7. Re-renders: passes updated props to bee-map and bee-sidebar
  → bee-map receives visibleEcdysisIds/@property change
      → in updated(), calls clusterSource.changed() + sampleSource.changed() + map.render()
```

BeeAtlas passes down to BeeMap:
- `filterState: FilterState` (the full filter state object)
- `visibleEcdysisIds: Set<string> | null`
- `visibleSampleIds: Set<string> | null`
- `layerMode`, `boundaryMode`, `selectedSamples`, `selectedSampleEvent`

BeeAtlas passes down to BeeSidebar:
- All the same properties it currently receives from BeeMap (summary, filteredSummary, taxaOptions, etc.)
- **Crucially:** Instead of passing `restored*` properties, BeeAtlas passes a unified `filterState: FilterState` property — BeeSidebar reads initial values from it in `connectedCallback` or `firstUpdated`. The `restored*` pattern is eliminated.

[ASSUMED: the simplified filterState-as-property-to-sidebar approach is the intended architecture; the `restored*` properties are a workaround for the lack of a coordinator]

---

## Circular Dependency Risks (Answer to Question 7)

### Dependency graph after Phase 36

```
bee-atlas.ts
  imports: bee-map.ts (types only via lit), bee-sidebar.ts (types only via lit),
           filter.ts, url-state.ts, duckdb.ts

bee-map.ts
  imports: features.ts, region-layer.ts, style.ts, filter.ts (FilterState type),
           url-state.ts (NOT needed after Phase 36 — URL moves to bee-atlas),
           duckdb.ts (getDuckDB for OL source loading),
           bee-sidebar.ts (ELIMINATED — sidebar is now a sibling, not a child)

bee-sidebar.ts
  imports: lit only (no app modules)

filter.ts
  imports: duckdb.ts

url-state.ts
  imports: filter.ts (type only)

style.ts
  imports: filter.ts (visibleEcdysisIds/visibleSampleIds — resolved by factory approach)

features.ts
  imports: duckdb.ts, ol

region-layer.ts
  imports: filter.ts, ol
```

**No circular dependencies.** The key change that eliminates the cycle risk: bee-map.ts drops its import of bee-sidebar.ts. Bee-sidebar becomes a sibling rendered by bee-atlas, not a child rendered by bee-map.

**Note:** bee-atlas.ts imports bee-map.ts and bee-sidebar.ts, but only because Lit `@customElement` registration happens via import. The import does not create a logical cycle because bee-map and bee-sidebar do not import bee-atlas.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Reactive property updates from parent to child | Manual DOM manipulation / direct `querySelector` calls | Lit `@property` + template `.prop=${value}` bindings | Lit handles dirty-checking, batching, and update timing [VERIFIED: Lit docs] |
| Cross-shadow-DOM event propagation | Custom event relay or pub/sub system | `CustomEvent` with `bubbles: true, composed: true` | Already used in codebase; Lit `@event-name` bindings in templates handle this [VERIFIED: bee-sidebar.ts] |
| Style function access to filter state | Importing bee-atlas from style.ts | Closure / getter pattern (like `makeRegionStyleFn`) | Already established pattern in region-layer.ts [VERIFIED: region-layer.ts line 29] |

**Key insight:** All the Lit machinery needed for this coordinator pattern is already installed and used in the project. No new patterns or libraries are required.

---

## Common Pitfalls

### Pitfall 1: Forgetting `updated()` to react to @property changes in BeeMap

**What goes wrong:** BeeMap's OL layers don't repaint when `visibleEcdysisIds` property changes — the property updates Lit's rendering but OL sources need an explicit `.changed()` call.

**Why it happens:** Lit's reactivity handles DOM/template re-renders, but OL canvas rendering is outside Lit's purview. The style functions read `visibleEcdysisIds` at paint time, so you need to tell OL to repaint.

**How to avoid:** In BeeMap's `updated(changedProperties)`, when `changedProperties.has('visibleEcdysisIds')` or `changedProperties.has('visibleSampleIds')`, call `clusterSource.changed()`, `sampleSource.changed()`, and `this.map?.render()`.

**Warning signs:** Map points don't update after filter changes, but sidebar summary does.

### Pitfall 2: Setting @property on mutable objects (Set, arrays) — Lit won't detect mutations

**What goes wrong:** BeeAtlas mutates `this._filterState.months.add(3)` instead of creating a new object. Lit's dirty check (`===`) sees the same reference and doesn't re-render bee-map or bee-sidebar.

**Why it happens:** JavaScript sets and arrays are mutated by reference.

**How to avoid:** Always replace with new objects: `this._filterState = { ...this._filterState, months: new Set([...this._filterState.months, 3]) }`. The `FilterChangedEvent` detail already provides fresh `Set` copies (bee-sidebar creates them with `new Set(this._months)`) — use them directly.

**Warning signs:** Filter state appears to update internally but children don't re-render.

### Pitfall 3: `bee-atlas` CSS layout must replace `bee-map` CSS layout

**What goes wrong:** After removing bee-sidebar from bee-map's shadow DOM, the flex layout (map left, sidebar right) breaks because it was defined in `BeeMap.styles`.

**Why it happens:** The `bee-sidebar { width: 25rem; border-left: ... }` rule in BeeMap.styles referenced the sidebar as a child. After the move, sidebar is a sibling of bee-map, not a child.

**How to avoid:** Move the flex layout CSS (`display: flex`, `flex-direction: row`, sidebar width, media queries) to `BeeAtlas.styles`. BeeMap.styles keeps only `.map-container` and overlay styles. [VERIFIED: bee-map.ts lines 303-353 — all layout rules]

**Warning signs:** Sidebar appears below the map instead of to the right, or at 100% width.

### Pitfall 4: The `_restoredX` property pattern must be fully replaced, not partially refactored

**What goes wrong:** Some `_restored*` properties are removed but bee-sidebar still checks for others, causing the filter UI to not restore from URL correctly.

**Why it happens:** The 8 `_restored*` properties on BeeMap were a workaround — BeeMap was pushing URL-restored values to bee-sidebar. After Phase 36, BeeAtlas initializes its own `@state _filterState` from URL params and passes it as a single property to bee-sidebar.

**How to avoid:** Audit all 8 `_restored*` properties on BeeMap (lines 156-163) and their corresponding `@property` bindings in bee-sidebar (lines 88-100). Remove them all and replace with bee-sidebar reading its initial state from the `filterState` property received from bee-atlas.

**Warning signs:** Filter inputs don't pre-populate from URL on load.

### Pitfall 5: popstate handler moves to bee-atlas but needs map.getView() — which is on bee-map

**What goes wrong:** `_onPopState` calls `this.map.getView()` and `view.setCenter()`. After moving popstate to bee-atlas, these OL calls can't happen there.

**Why it happens:** URL navigation changes both state (filter, layerMode) AND map view position. Map view is owned by BeeMap.

**How to avoid:** BeeAtlas handles popstate for state updates (filter, layer mode, selection). For map view restoration, BeeAtlas sets a new `@property viewState` on BeeMap, and BeeMap's `updated()` calls `this.map?.getView().setCenter(...)` when `viewState` changes. Alternatively, BeeAtlas calls a public method on BeeMap via `@query`. The event-and-property approach is cleaner.

**Warning signs:** Back/forward navigation restores filter state but map view doesn't change.

---

## Code Examples

### How bee-atlas wires bee-map events in render()

```typescript
// Source: Pattern from Lit docs + existing bee-map event handler structure [ASSUMED shape]
render() {
  return html`
    <bee-map
      .layerMode=${this._layerMode}
      .boundaryMode=${this._boundaryMode}
      .filterState=${this._filterState}
      .visibleEcdysisIds=${this._visibleEcdysisIds}
      .visibleSampleIds=${this._visibleSampleIds}
      .selectedSamples=${this._selectedSamples}
      .selectedSampleEvent=${this._selectedSampleEvent}
      .viewState=${this._viewState}
      @view-moved=${(e: CustomEvent) => this._onViewMoved(e.detail)}
      @map-click-specimen=${(e: CustomEvent) => this._onSpecimenClick(e.detail)}
      @map-click-region=${(e: CustomEvent) => this._onRegionClick(e.detail)}
      @map-click-empty=${() => this._onMapClickEmpty()}
      @data-loaded=${(e: CustomEvent) => this._onDataLoaded(e.detail)}
      @sample-data-loaded=${(e: CustomEvent) => this._onSampleDataLoaded(e.detail)}
      @county-options-loaded=${(e: CustomEvent) => this._onCountyOptionsLoaded(e.detail)}
      @ecoregion-options-loaded=${(e: CustomEvent) => this._onEcoregionOptionsLoaded(e.detail)}
      @data-error=${(e: CustomEvent) => this._onDataError(e.detail)}
    ></bee-map>
    <bee-sidebar
      .filterState=${this._filterState}
      .layerMode=${this._layerMode}
      .boundaryMode=${this._boundaryMode}
      .summary=${this._summary}
      .filteredSummary=${this._filteredSummary}
      .taxaOptions=${this._taxaOptions}
      .samples=${this._selectedSamples}
      .selectedSampleEvent=${this._selectedSampleEvent}
      .recentSampleEvents=${this._recentSampleEvents}
      .sampleDataLoaded=${this._sampleDataLoaded}
      .countyOptions=${this._countyOptions}
      .ecoregionOptions=${this._ecoregionOptions}
      @filter-changed=${(e: CustomEvent<FilterChangedEvent>) => this._onFilterChanged(e.detail)}
      @layer-changed=${(e: CustomEvent<string>) => this._onLayerChanged(e.detail as any)}
      @sample-event-click=${(e: CustomEvent) => this._onSampleEventClick(e.detail)}
      @close=${() => this._onClose()}
    ></bee-sidebar>
  `;
}
```

### BeeMap updated() for OL repaint on property changes

```typescript
// Source: Lit docs — https://lit.dev/docs/components/lifecycle/#updated [ASSUMED: exact implementation]
updated(changedProperties: PropertyValues) {
  super.updated(changedProperties);
  if (changedProperties.has('visibleEcdysisIds') || changedProperties.has('visibleSampleIds')) {
    this.clusterSource?.changed();
    this.sampleSource?.changed();
    this.map?.render();
  }
  if (changedProperties.has('layerMode')) {
    const mode = this.layerMode;
    this.specimenLayer?.setVisible(mode === 'specimens');
    this.sampleLayer?.setVisible(mode === 'samples');
  }
  if (changedProperties.has('boundaryMode')) {
    // update regionLayer visibility and source
  }
  if (changedProperties.has('viewState') && this.viewState) {
    this.map?.getView().setCenter(fromLonLat([this.viewState.lon, this.viewState.lat]));
    this.map?.getView().setZoom(this.viewState.zoom);
  }
}
```

---

## Validation Architecture

Config has `nyquist_validation: true`.

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Vitest (Phase 33 declared complete but vite.config.ts has no test block; package.json has no vitest) |
| Config file | vite.config.ts — test block missing (Wave 0 gap) |
| Quick run command | `npm test` (once configured) |
| Full suite command | `npm test` |

**Note:** Phase 33 is listed as complete in STATE.md and ROADMAP.md, but the working directory shows no vitest in package.json and no test block in vite.config.ts. [VERIFIED: `frontend/package.json` devDependencies, `frontend/vite.config.ts` content]. This appears to be a state divergence — the test infrastructure may have been set up in a worktree or was reverted. Phase 36 Wave 0 should include verifying or re-establishing vitest before writing tests.

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| ARCH-01 | `<bee-atlas>` is registered and renders without errors | smoke | `npm test -- --grep "bee-atlas"` | No — Wave 0 |
| ARCH-02 | `<bee-map>` accepts layerMode/filterState/etc as properties without error | render test | `npm test -- --grep "bee-map properties"` | No — Wave 0 |
| ARCH-03 | Events from bee-map bubble up and are handled by bee-atlas | integration | `npm test -- --grep "bee-atlas events"` | No — Wave 0 |

All Phase 36 tests are integration-style Lit component tests. These require happy-dom (or JSDOM) which also needs to be verified from Phase 33 setup.

### Wave 0 Gaps

- [ ] Verify/re-install vitest and happy-dom: `npm install -D vitest @vitest/ui happy-dom`
- [ ] Add test block to `vite.config.ts` (environment: 'happy-dom', globals: true)
- [ ] Add `"test": "vitest run"` to `scripts` in `package.json`
- [ ] `frontend/src/tests/bee-atlas.test.ts` — covers ARCH-01, ARCH-02, ARCH-03

*(Note: if Phase 33 test infrastructure is found to already be present in a worktree or was applied to main after the git snapshot, these gaps may be resolved)*

---

## Open Questions

1. **`_dataLoading` and `_dataError` ownership**
   - What we know: These drive a loading overlay rendered inside BeeMap's shadow DOM
   - What's unclear: Should they be BeeAtlas @state (coordinator knows data state) or BeeMap @state (local rendering concern)?
   - Recommendation: Keep as BeeMap @state and have BeeMap emit `data-error` events upward for global error handling if needed. The loading overlay is map-local UI.

2. **Does bee-sidebar need to know about viewState / map animation?**
   - What we know: `sample-event-click` currently triggers `this.map.getView().animate(...)` in BeeMap. After Phase 36, bee-atlas receives this event.
   - What's unclear: Does bee-atlas pass a "pan-to" command to bee-map, or does bee-map retain this logic?
   - Recommendation: bee-atlas sets a `panTo: {coordinate, zoom}` property on bee-map, and bee-map's `updated()` calls `this.map.getView().animate(...)` when it changes. Alternatively, expose a public `panTo(coord)` method on BeeMap that bee-atlas calls via `@query('bee-map')`. The property approach is more declarative and testable.

3. **Module-level side effects in region-layer.ts**
   - What we know: `countySource.loadFeatures(...)` and `ecoregionSource.loadFeatures(...)` execute at module import time. [VERIFIED: region-layer.ts lines 63-65]
   - What's unclear: Phase 34 eliminated module-level side effects in bee-map.ts, but region-layer.ts still eagerly loads GeoJSON. Does Phase 36 address this or defer to Phase 37/38?
   - Recommendation: Defer — this is a STATE-03 compliance issue (Phase 34). If Phase 34 SUMMARY.md marked this as accepted tech debt, leave it alone. If not, BeeMap's firstUpdated() should call a new `loadRegionSources()` function. Flag for plan review.

4. **filterState singleton in filter.ts removal**
   - What we know: `style.ts` imports `visibleEcdysisIds` and `visibleSampleIds` from filter.ts
   - What's unclear: Does Phase 36 also update style.ts to use factory closures, or does it leave the module-level vars?
   - Recommendation: Phase 36 must update style.ts to eliminate this coupling, or the filter.ts module-level state is never truly removed. The planner should include a task: "Convert clusterStyle and sampleDotStyle to factory functions."

---

## Environment Availability

Step 2.6: SKIPPED — Phase 36 is a pure code/structural refactor. No new external dependencies, CLIs, databases, or runtime services are required beyond what is already installed for the existing frontend build.

---

## Sources

### Primary (HIGH confidence)
- `frontend/src/bee-map.ts` — Complete source audit: all @state properties catalogued, all event handlers identified
- `frontend/src/bee-sidebar.ts` — Complete source audit: all @property inputs and CustomEvent dispatches catalogued
- `frontend/src/filter.ts` — Module-level globals and exports verified
- `frontend/src/region-layer.ts` — Eager-load side effects and `makeRegionStyleFn` factory pattern verified
- `frontend/src/style.ts` — Coupling to filter.ts module globals verified
- `frontend/src/url-state.ts` — Pure module; no Lit/OL deps verified
- `frontend/index.html` — Current root element (`<bee-map>`) verified
- `.planning/STATE.md` — Accumulated decisions from Phases 33–35 (Phase 34 style factory decision)
- `.planning/phases/35-url-state-module/35-01-SUMMARY.md` — Phase 35 outcome and readiness notes

### Secondary (MEDIUM confidence)
- Lit documentation — https://lit.dev/docs/components/events/ (coordinator pattern, composed events)
- Lit documentation — https://lit.dev/docs/components/properties/ (@property decorator semantics)

### Tertiary (LOW confidence)
- None

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Option A (BeeAtlas owns FilterState as instance property) is the intended direction | Filter state section | Plan might use write-through singleton instead — different task structure |
| A2 | The 8 `_restored*` properties are eliminated by passing filterState as a single property to bee-sidebar | State inventory | Sidebar may need a different mechanism to initialize its UI inputs from filterState |
| A3 | Phase 34 decision "makeClusterStyleFn, makeSampleDotStyleFn" was forward-looking and not yet implemented | Style.ts coupling | If already implemented, style.ts tasks can be skipped |
| A4 | The `panTo` use case is handled via a property on bee-map, not a public method call | Open questions | If using a public method, the coordinator pattern via @query is still acceptable |
| A5 | `_dataLoading` and `_dataError` stay as BeeMap @state | Open questions | If they move to BeeAtlas, BeeMap needs new events for them |

---

## Metadata

**Confidence breakdown:**
- State inventory (current BeeMap @state): HIGH — directly read from source
- Event interface catalog: HIGH — directly read from source
- Architecture pattern (coordinator): HIGH — standard Lit, matches existing codebase patterns
- New event names for bee-map: MEDIUM — derived from current code structure; planner may adjust names
- style.ts factory approach: MEDIUM — pattern exists (makeRegionStyleFn); application to clusterStyle/sampleDotStyle is ASSUMED

**Research date:** 2026-04-04
**Valid until:** 2026-05-04 (stable Lit APIs; 30-day horizon)
