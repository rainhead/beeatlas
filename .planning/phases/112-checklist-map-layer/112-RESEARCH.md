# Phase 112: Checklist Map Layer — Research

**Researched:** 2026-05-24
**Domain:** Mapbox GL JS layer management, Lit web component event propagation, hyparquet fetch, URL state
**Confidence:** HIGH

---

<user_constraints>
## User Constraints (from CONTEXT.md / STATE.md)

### Locked Decisions

- Checklist map layer uses Mapbox county-fill on the existing `counties-source` GeoJSON, not a new point cluster layer.
- Checklist layer responds to taxon filter only — year, month, and collector filters have no effect on the checklist layer.
- `cl=1` URL param encodes checklist layer visibility.
- `source='checklist'` constant lives in `checklist.parquet` only; `occurrences.parquet` schema is unchanged.
- Year slider bounds remain scoped to `occurrences.parquet` only — no 1812 checklist dates in the WABA filter UI.
- Static hosting only — no server runtime at any layer.

### Claude's Discretion

Where exactly in `_renderListContent()` the checklist row sits (below `_renderWhen()` as a new `_renderShow()` section is the spec-specified approach).

### Deferred Ideas (OUT OF SCOPE)

- GPS-level point display for historical records with sub-county precision (FUTURE-04)
- Year/month filter support for checklist layer
- Collector names on species pages for checklist records
- CSV export including checklist records
- Table view for checklist records
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| MAP-01 | "Checklist records" toggle appears in filter panel alongside Specimens and Samples toggles | `bee-pane.ts` filter row pattern; new `_renderShow()` section following `_renderWhen()` |
| MAP-02 | County-fill overlay (green fill on counties GeoJSON source) when enabled; county presence derived from checklist.parquet coordinates | `counties` source with `generateId: true` already in `bee-map.ts`; `NAME` property verified as join key; `parquetReadObjects` with `columns: ['county','canonical_name']` for efficient read |
| MAP-03 | Checklist layer responds to taxon filter only | `filterState.taxonName` is the sole dependency; layer update path via `bee-map.updated()` on new `showChecklist` + `checklistTaxon` properties |
| MAP-04 | `cl=1` URL param encodes checklist layer visibility; restored on page load | `UiState` extension + `buildParams`/`parseParams` additions in `url-state.ts` |
</phase_requirements>

---

## Summary

Phase 112 adds a "Checklist records" toggle to the filter panel that overlays a semi-transparent green county-fill layer on the Mapbox map. The layer derives county presence from `checklist.parquet` (produced in Phase 111, served via manifest's `checklist` key) and filters by taxon only. State flows from `bee-pane` → `bee-atlas` → `bee-map` via one new custom event and two new properties, with URL persistence via a new `cl` param.

The codebase already provides everything needed: the `counties` Mapbox GeoJSON source (with `generateId: true` and features having `NAME` property) is loaded in `_loadBoundaryData()`. The `parquetReadObjects` API from hyparquet is already in use in `sqlite.ts` and accepts a `columns` option for efficient column projection. The `resolveDataUrl` function in `manifest.ts` already resolves named keys from `manifest.json`, and Phase 111's nightly.sh edit has wired the `checklist` key into the manifest.

The implementation requires changes to five files: `bee-pane.ts` (toggle UI), `bee-atlas.ts` (state coordination + URL passthrough), `bee-map.ts` (layer add + filter update), `url-state.ts` (cl param), and `scripts/make-local-manifest.js` (local dev manifest). Tests are unit tests on `url-state.ts` (parse/build round-trip) and source-text assertions on `bee-pane.ts` (mirroring the existing pattern in `src/tests/bee-pane.test.ts`).

**Primary recommendation:** Follow the exact patterns already in the codebase — `year-label` checkbox for the toggle, `setLayoutProperty`/`setFilter` for layer control, `@property` + `updated()` for reactive property plumbing, `parquetReadObjects` with column projection for checklist data fetch.

---

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Toggle UI (checkbox + label) | Frontend (bee-pane.ts) | — | Filter panel is `bee-pane`'s sole responsibility; pure presenter |
| Checklist state (`_checklistVisible`, `_checklistCounties`) | Frontend (bee-atlas.ts) | — | `bee-atlas` owns all reactive state per CLAUDE.md invariant |
| County filter update on taxon change | Frontend (bee-atlas.ts) | — | Taxon filter already owned by `bee-atlas._filterState` |
| Mapbox layer add + visibility toggle | Frontend (bee-map.ts) | — | `bee-map` owns all Mapbox GL JS interaction |
| Checklist parquet fetch + column filtering | Frontend (bee-map.ts) | — | `bee-map` already fetches boundary GeoJSON; checklist fetch follows same pattern |
| URL encode/decode (cl param) | Frontend (url-state.ts) | — | All URL params centralized here |
| Local dev manifest (checklist key) | Build tool (make-local-manifest.js) | — | Dev manifest must mirror production manifest shape |
| Production manifest (checklist key) | Pipeline (nightly.sh) | — | Already wired by Phase 111 |

---

## Standard Stack

### Core (all already in the project)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Lit | ^3.2.1 | Reactive web components (`@state`, `@property`, `updated()`) | Project-wide component framework |
| mapbox-gl | ^3.22.0 | Map layers, `addLayer`, `setFilter`, `setLayoutProperty` | Existing map renderer |
| hyparquet | ^1.25.6 | `parquetReadObjects` to read checklist.parquet | Already used in `sqlite.ts` for occurrences |
| TypeScript | ^5.8.2 | Type safety for new interfaces | Project-wide |
| Vitest | ^4.1.2 | Unit tests | Project-wide test runner |

**No new packages needed for this phase.** [VERIFIED: package.json inspection]

### No Package Legitimacy Audit Required

This phase installs zero new packages. All dependencies are already present in `node_modules`.

---

## Architecture Patterns

### Data Flow Architecture

```
checklist.parquet (CloudFront/public/data/)
       │
       │  fetch via resolveDataUrl('checklist')
       ▼
  bee-map.ts
  _loadChecklistData(taxonName?)
  parquetReadObjects({ file, columns: ['county','canonical_name'], filter? })
       │
       │  returns Set<string> of county names
       ▼
  bee-map._checklistCounties: Set<string>
       │
       │  setFilter('checklist-county-fill', ['in', 'NAME', ...counties])
       ▼
  Mapbox GL JS 'checklist-county-fill' layer on 'counties' source
```

```
User checks toggle in bee-pane
       │
       │  dispatches 'checklist-layer-changed' { visible: boolean }
       ▼
  bee-atlas._onChecklistLayerChanged(e)
  sets _checklistVisible, runs _loadChecklistCounties()
       │
       │  passes showChecklist + checklistTaxon as @property to bee-map
       ▼
  bee-map.updated() detects change
  toggles layer visibility + triggers data reload if taxon changed
       │
       │  replaceState with cl=1 (or absent)
       ▼
  URL: ?cl=1&...
```

### Recommended File Changes

```
src/
├── url-state.ts           # Add checklistVisible to UiState; cl= in buildParams/parseParams
├── bee-pane.ts            # Add _showChecklist @state; _renderShow(); checklist-layer-changed event
├── bee-atlas.ts           # Add _checklistVisible @state; handler; pass props to bee-map
├── bee-map.ts             # Add showChecklist + checklistTaxon @property; addLayer; updated(); fetch
└── tests/
    ├── url-state.test.ts  # Add cl= round-trip tests
    └── bee-pane.test.ts   # Add MAP-01 source-text assertion tests
scripts/
└── make-local-manifest.js # Add checklist: 'checklist.parquet' key
```

### Pattern 1: Mapbox Layer Add (below occurrences clusters)

The new `checklist-county-fill` layer must be added BEFORE the occurrence cluster layers so specimen dots render on top. Mapbox's `addLayer` accepts a `beforeId` argument for insertion order.

```typescript
// Source: bee-map.ts firstUpdated → _map.on('load') callback (verified in codebase)
// Add BEFORE 'ghost-points' so specimen points remain on top
this._map!.addLayer({
  id: 'checklist-county-fill',
  type: 'fill',
  source: 'counties',          // already loaded — same source as county-fill
  layout: { visibility: 'none' },
  paint: {
    'fill-color': 'rgba(44, 122, 44, 0.25)',
    'fill-outline-color': 'rgba(44, 122, 44, 0.7)',
  },
  filter: ['in', ['get', 'NAME'], ['literal', []]],
}, 'ghost-points');             // beforeId — places this layer below ghost-points
```

**Important:** `counties` source uses `generateId: true` (confirmed in codebase). This means feature IDs are synthetic sequential integers. The county name for filtering is in the `NAME` property (verified: `counties.geojson` features all have `properties.NAME`). The filter expression `['in', ['get', 'NAME'], ['literal', countyArray]]` is the correct Mapbox GL JS expression syntax for array membership testing. [VERIFIED: codebase inspection]

### Pattern 2: Visibility Toggle via setLayoutProperty

Following the existing `_applyBoundaryMode()` pattern in `bee-map.ts`:

```typescript
// Source: bee-map.ts _applyBoundaryMode() (verified in codebase)
private _applyChecklistVisibility() {
  if (!this._map?.getLayer('checklist-county-fill')) return;
  this._map.setLayoutProperty(
    'checklist-county-fill',
    'visibility',
    this.showChecklist ? 'visible' : 'none'
  );
}
```

### Pattern 3: Reactive Property Plumbing (bee-atlas → bee-map)

Following the existing `boundaryMode`, `filterState`, `visibleIds` pattern:

```typescript
// In bee-atlas.ts render():
html`<bee-map
  ...
  .showChecklist=${this._checklistVisible}
  .checklistTaxon=${this._filterState.taxonName}
  ...
></bee-map>`

// In bee-map.ts:
@property({ attribute: false }) showChecklist = false;
@property({ attribute: false }) checklistTaxon: string | null = null;

updated(changedProperties: PropertyValues) {
  if (changedProperties.has('showChecklist') || changedProperties.has('checklistTaxon')) {
    this._applyChecklistLayer();
  }
  // ...existing property handlers...
}
```

### Pattern 4: Custom Event from bee-pane (existing event pattern)

```typescript
// In bee-pane.ts (following pane-expand-list pattern):
private _onChecklistChange(e: Event) {
  const visible = (e.target as HTMLInputElement).checked;
  this._showChecklist = visible;
  this.dispatchEvent(new CustomEvent('checklist-layer-changed', {
    bubbles: true, composed: true,
    detail: { visible },
  }));
}
```

```typescript
// In bee-atlas.ts:
@state() private _checklistVisible = false;

private _onChecklistLayerChanged(e: CustomEvent<{ visible: boolean }>) {
  this._checklistVisible = e.detail.visible;
  this._replaceUrlState();
}
```

### Pattern 5: Hyparquet Fetch with Column Projection

The existing `sqlite.ts` loads the full parquet via `parquetReadObjects({ file })`. For the checklist layer we only need `county` and optionally `canonical_name`. Using the `columns` option (confirmed in `node_modules/hyparquet/src/types.d.ts`) avoids deserializing unused columns:

```typescript
// Source: hyparquet types (verified), following sqlite.ts pattern
async _loadChecklistData(taxonName: string | null): Promise<void> {
  try {
    const url = await resolveDataUrl('checklist');
    if (!url) return;
    const resp = await fetch(url);
    const buffer = await resp.arrayBuffer();
    const file = { byteLength: buffer.byteLength, slice: (s: number, e: number) => buffer.slice(s, e) };
    const rows = await parquetReadObjects({
      file,
      columns: ['county', 'canonical_name'],
    });
    const filtered = taxonName
      ? rows.filter(r => r.canonical_name === taxonName)
      : rows;
    this._checklistCounties = new Set(filtered.map(r => r.county as string).filter(Boolean));
    this._applyChecklistFilter();
  } catch (err) {
    console.warn('checklist data unavailable:', err);
  }
}
```

**Note on `filter` option vs JS-side filter:** `parquetReadObjects` has a `filter` option (type `ParquetQueryFilter`), but the taxon filtering is trivial in JS after column projection. The `columns` option alone is the meaningful optimization (avoids deserializing 10 unused columns).

**Note on re-fetch on taxon change:** The parquet is 32 KB (confirmed: `public/data/checklist.parquet` is 32,768 bytes). Re-fetching on every taxon change is acceptable. Caching the full parsed array in `bee-map` as `_checklistAllRows: Array<{county: string, canonical_name: string}>` avoids re-network-fetching when only the taxon filter changes.

### Pattern 6: Mapbox Filter Expression for County Names

```typescript
private _applyChecklistFilter() {
  if (!this._map?.getLayer('checklist-county-fill')) return;
  const counties = [...this._checklistCounties];
  this._map.setFilter('checklist-county-fill',
    counties.length > 0
      ? ['in', ['get', 'NAME'], ['literal', counties]]
      : ['==', 'NAME', '__never__']   // empty = no counties highlighted
  );
}
```

**Verified:** County names in `checklist.parquet` match `NAME` property in `counties.geojson` exactly (39 counties, same list). No normalization needed. [VERIFIED: codebase inspection — duckdb query confirmed all 39 WA county names match between files]

### Pattern 7: URL State (UiState extension)

The `UiState` interface in `url-state.ts` currently holds `boundaryMode` and `paneState`. Adding `checklistVisible` follows the same pattern:

```typescript
// url-state.ts
export interface UiState {
  boundaryMode: 'off' | 'counties' | 'ecoregions' | 'places';
  paneState: 'list' | 'table' | 'collapsed';
  checklistVisible: boolean;   // NEW — cl=1 param
}

// buildParams:
if (ui.checklistVisible) params.set('cl', '1');

// parseParams:
const checklistVisible = p.get('cl') === '1';
// Include in result.ui when non-default:
if (boundaryMode !== 'off' || paneState !== 'collapsed' || checklistVisible) {
  result.ui = { boundaryMode, paneState, checklistVisible };
}
```

**Default:** `checklistVisible: false` (absent = hidden). Adding `checklistVisible` to `UiState` means ALL callers of `buildParams` and `parseParams` must be updated to pass/read it. Search confirms `buildParams` is only called from `bee-atlas.ts` via `_buildCurrentParams()`.

**Ripple:** `bee-atlas.ts` constructs `UiState` in `_buildCurrentParams()`. Must add `checklistVisible: this._checklistVisible` there.

**Ripple:** `bee-atlas.ts` reads `parsed.ui` in `firstUpdated` and `_onPopState`. Must read `checklistVisible` and set `this._checklistVisible`.

### Pattern 8: Local Dev Manifest

`scripts/make-local-manifest.js` writes `public/data/manifest.json` for local dev. The `checklist.parquet` file already exists in `public/data/` (32 KB, valid parquet). The manifest key must be added so `resolveDataUrl('checklist')` works in dev.

```javascript
// make-local-manifest.js — add to the JSON object:
checklist: 'checklist.parquet',
```

**Also:** `manifest.ts` `Manifest` interface and `DataKey` type must include `'checklist'`. Currently `Manifest` lists 7 keys; `checklist` must be added as the 8th.

### Anti-Patterns to Avoid

- **Adding `checklist` to the `occurrences` source:** Checklist records have no coordinates; they cannot be GeoJSON point features. County fill is the correct approach.
- **Re-fetching parquet on every property change without caching:** Cache the parsed rows in `_checklistAllRows` and only re-filter in JS when taxon changes; re-fetch only on first enable or after a full page reload.
- **Using `feature-state` for the checklist fill:** `feature-state` works well for interactive highlight (existing county selection pattern). For the checklist overlay, a `filter` expression on the `NAME` property is cleaner and avoids the need to iterate `_countyIdMap`.
- **Modifying `FilterState` for checklist:** The checklist toggle is UI state (`UiState`), not a filter on occurrences. Do not add `checklistVisible` to `FilterState` — it belongs in `UiState`.
- **Triggering `_runFilterQuery()` on checklist toggle:** The checklist layer is independent of the occurrence filter query. Toggling checklist does not change `_filterState` and must not trigger `_runFilterQuery()`.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Parquet reading | Custom binary parser | `parquetReadObjects` from hyparquet | Already in project; handles SNAPPY compression, schema inference, null values |
| Array membership filter in Mapbox | Hand-crafted `case` expression | `['in', ['get', 'NAME'], ['literal', array]]` | Mapbox GL JS built-in expression — correct, optimized |
| Layer Z-ordering | Hardcoded index | `addLayer(..., beforeId)` parameter | Mapbox GL JS API for insertion order — robust to future layer additions |
| URL param encoding | Custom serialization | Extend existing `buildParams`/`parseParams` in url-state.ts | Already handles defaults, validation, round-trips; all existing callers updated automatically |

---

## Common Pitfalls

### Pitfall 1: `counties` Source Not Ready When Layer Is Added

**What goes wrong:** `bee-map.ts` adds the `checklist-county-fill` layer in the `_map.on('load')` callback. The `counties` source is initialized with empty data in `load`, then populated by the async `_loadBoundaryData()`. Adding the `checklist-county-fill` layer referencing `counties` is safe because the source object exists (even with empty data) when the layer is added.

**Why it happens:** Misreading `generateId: true` sources as requiring data before layers can reference them.

**How to avoid:** Add `checklist-county-fill` in the `_map.on('load')` callback alongside the other county layers. The filter starts as `['==', 'NAME', '__never__']` (matches nothing) so empty source data is harmless.

### Pitfall 2: `beforeId` Layer Ordering

**What goes wrong:** Adding the checklist layer AFTER the occurrence layers causes it to render on top of specimen dots.

**Why it happens:** `addLayer` appends to the layer stack by default.

**How to avoid:** Always pass `'ghost-points'` as `beforeId` — the first occurrence-related layer in the stack. This places `checklist-county-fill` below `ghost-points`, `clusters`, `cluster-count`, `unclustered-point`, `selected-ring`, and `selected-cluster-halo`.

### Pitfall 3: `checklist` Key Missing from `manifest.ts` Interface

**What goes wrong:** TypeScript error `Argument of type '"checklist"' is not assignable to parameter of type 'DataKey'` when calling `resolveDataUrl('checklist')`.

**Why it happens:** `Manifest` interface and `DataKey` type are defined explicitly in `manifest.ts`; new keys must be added.

**How to avoid:** Add `checklist: string` to the `Manifest` interface and include `'checklist'` in `DataKey`.

### Pitfall 4: UiState Default Causes All Existing Tests to Fail

**What goes wrong:** Adding `checklistVisible: boolean` to `UiState` without a default causes TypeScript errors in url-state.test.ts where `defaultUi` is constructed without the new field.

**Why it happens:** Interface is non-optional.

**How to avoid:** Either make `checklistVisible` optional (`checklistVisible?: boolean`) or update `defaultUi` in `url-state.test.ts`. The simpler approach is to make it optional — treat absent as `false`.

### Pitfall 5: Stale Checklist Data on Taxon Filter Change

**What goes wrong:** User enables checklist layer (fetches + caches rows), then changes taxon filter — layer doesn't update because `bee-map` sees `showChecklist` unchanged.

**Why it happens:** `showChecklist` didn't change (still true); the property that changed is `checklistTaxon`.

**How to avoid:** In `bee-map.updated()`, check `changedProperties.has('checklistTaxon')` in addition to `changedProperties.has('showChecklist')`. When `showChecklist` is true and `checklistTaxon` changes, re-filter `_checklistAllRows` and call `_applyChecklistFilter()` (no re-fetch needed if rows are cached).

### Pitfall 6: `_checklistAllRows` Cached Indefinitely

**What goes wrong:** If `checklist.parquet` is content-hashed (production), the cached rows are correct. But in local dev, `checklist.parquet` is un-hashed — stale cache is not a problem for local dev.

**Why it happens:** Not a real pitfall; caching is correct behavior. The parquet is a static file; it does not change during a session.

**How to avoid:** Nothing needed. Cache the parsed rows for the lifetime of the component.

---

## Code Examples

### Adding checklist-county-fill Layer in bee-map.ts

```typescript
// Source: bee-map.ts firstUpdated pattern (verified in codebase)
// Add after all boundary layers (county-fill, county-line, ecoregion-*, place-*)
// and BEFORE ghost-points (beforeId='ghost-points' places it below occurrence dots)
this._map!.addLayer({
  id: 'checklist-county-fill',
  type: 'fill',
  source: 'counties',
  layout: { visibility: 'none' },
  paint: {
    'fill-color': 'rgba(44, 122, 44, 0.25)',
    'fill-outline-color': 'rgba(44, 122, 44, 0.7)',
  },
  filter: ['==', 'NAME', '__never__'],  // empty initial state
}, 'ghost-points');
```

### Checklist Toggle in bee-pane.ts

```typescript
// Source: bee-pane.ts _renderWhen() .year-label pattern (verified in codebase)
// New _renderShow() method, placed after _renderWhen() in _renderListContent()
private _renderShow() {
  return html`
    <div class="filter-row">
      <svg class="row-icon" width="16" height="16" viewBox="0 0 16 16" fill="none"
           stroke="currentColor" stroke-width="1.5" aria-hidden="true">
        <polygon points="8,2 14,5.5 8,9 2,5.5"/>
        <polyline points="2,8.5 8,12 14,8.5"/>
      </svg>
      <div class="year-row">
        <label class="year-label">
          <input type="checkbox" .checked=${this._showChecklist}
            aria-label="Show checklist county records on map"
            @change=${this._onChecklistChange}
          />
          Checklist records
        </label>
      </div>
    </div>
  `;
}
```

### URL State Round-Trip

```typescript
// Source: url-state.ts buildParams/parseParams pattern (verified in codebase)
// buildParams:
if (ui.checklistVisible) params.set('cl', '1');

// parseParams:
const checklistVisible = p.get('cl') === '1';
if (boundaryMode !== 'off' || paneState !== 'collapsed' || checklistVisible) {
  result.ui = { boundaryMode, paneState, checklistVisible };
}
```

---

## Data Facts

**checklist.parquet schema** (VERIFIED: duckdb introspection on `public/data/checklist.parquet`):

| Column | Type | Notes |
|--------|------|-------|
| canonical_name | VARCHAR | Lowercase species name; used for taxon filtering |
| scientificName | VARCHAR | Display name |
| genus | VARCHAR | |
| specific_epithet | VARCHAR | |
| family | VARCHAR | |
| lat | DOUBLE | Always NULL (county-range assertions have no point coords) |
| lon | DOUBLE | Always NULL |
| year | BIGINT | Always NULL |
| month | BIGINT | Always NULL |
| county | VARCHAR | Washington county name; matches GeoJSON `NAME` property exactly |
| ecoregion_l3 | VARCHAR | |
| source | VARCHAR | Always `'checklist'` |

**Row count:** 2,861 (species × county pairs)
**File size:** 32,768 bytes (32 KB — trivial fetch)
**Null county count:** 0 — every row has a county [VERIFIED: duckdb query]
**County name alignment:** All 39 WA counties in `checklist.parquet` match `NAME` property in `counties.geojson` exactly [VERIFIED: comparison of duckdb DISTINCT county + geojson feature inspection]

**Note on taxon filter:** `canonical_name` in `checklist.parquet` is lowercase (e.g. `'andrena aculeata'`). The `filterState.taxonName` set by the filter panel is the display-form scientific name (e.g. `'Andrena aculeata'`). A case-insensitive comparison or lowercase normalization is required when matching. Alternatively, `scientificName` (Title Case) matches `filterState.taxonName` directly — **use `scientificName` (not `canonical_name`) for taxon matching.**

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Mapbox GL JS v2 expression syntax | v3 expression syntax (addInteraction API) | mapbox-gl v3 (in this project) | `addInteraction` replaces `map.on('click', layerId, handler)` for click handlers; filter expressions unchanged |
| `parquetRead` with callback | `parquetReadObjects` for object-row API | hyparquet 1.x | `parquetReadObjects` is the preferred API for fetching all rows as objects |

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `filterState.taxonName` matches `scientificName` (not `canonical_name`) in checklist.parquet | Data Facts | County fill would never match if wrong — use `scientificName` for taxon comparison, not `canonical_name` |
| A2 | The `filter` expression `['in', ['get', 'NAME'], ['literal', []]]` (empty array) safely matches zero counties without error | Architecture Patterns | If empty array causes a Mapbox error, use `['==', 'NAME', '__never__']` as the empty-case fallback |

---

## Open Questions (RESOLVED)

1. **Taxon filter granularity (family vs species)** — RESOLVED: match all three ranks
   - What we know: `filterState.taxonRank` can be `'family'`, `'genus'`, or `'species'`. `checklist.parquet` has `family`, `genus`, and `scientificName` columns.
   - Resolution: Match on all three ranks using the appropriate column. When `taxonRank === 'family'`, filter rows where `family === filterState.taxonName`. When `'genus'`, filter on `genus`. When `'species'`, filter on `scientificName`. Implemented in Plan 03 Task 3.

2. **Generation guard for async checklist fetch** — RESOLVED: add `_checklistGeneration` counter
   - What we know: `bee-atlas` uses a `_filterQueryGeneration` counter to discard stale async results (documented in CLAUDE.md invariant). The checklist fetch is also async.
   - Resolution: Add `_checklistGeneration` counter in `bee-map` following the same pattern. Implemented in Plan 03 Task 3.

---

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| hyparquet | checklist.parquet fetch | ✓ | 1.25.6 | — |
| mapbox-gl | county fill layer | ✓ | ^3.22.0 | — |
| Lit | UI components | ✓ | ^3.2.1 | — |
| `public/data/checklist.parquet` | local dev testing | ✓ | 32 KB, 2,861 rows | — |
| `counties.geojson` | county name matching | ✓ | 39 features, NAME property | — |

All dependencies available; no missing dependencies.

---

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Vitest 4.1.2 |
| Config file | `vite.config.ts` (`test` key, `environment: 'happy-dom'`) |
| Quick run command | `npm test` |
| Full suite command | `npm test` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| MAP-01 | Toggle label "Checklist records" in filter panel | unit (source text) | `npm test` → `src/tests/bee-pane.test.ts` | ✓ (extend existing) |
| MAP-01 | Toggle emits `checklist-layer-changed` event | unit (source text) | `npm test` → `src/tests/bee-pane.test.ts` | ✓ (extend existing) |
| MAP-02 | `bee-map.ts` adds `checklist-county-fill` layer | unit (source text) | `npm test` → new `src/tests/bee-map.test.ts` | ❌ Wave 0 |
| MAP-03 | Taxon filter changes `checklistTaxon` property | unit (source text) | `npm test` → `src/tests/bee-atlas.test.ts` | ✓ (extend existing) |
| MAP-04 | `cl=1` encodes + decodes round-trip | unit | `npm test` → `src/tests/url-state.test.ts` | ✓ (extend existing) |
| MAP-04 | `cl` absent when `checklistVisible: false` | unit | `npm test` → `src/tests/url-state.test.ts` | ✓ (extend existing) |

### Sampling Rate

- **Per task commit:** `npm test`
- **Per wave merge:** `npm test`
- **Phase gate:** `npm test` green + `npm run typecheck` clean before `/gsd-verify-work`

### Wave 0 Gaps

- [ ] `src/tests/bee-map.test.ts` — source-text assertions for MAP-02 (`checklist-county-fill` layer ID, `showChecklist` property, `checklistTaxon` property)
- [ ] Extend `src/tests/bee-pane.test.ts` with MAP-01 assertions
- [ ] Extend `src/tests/url-state.test.ts` with MAP-04 cl= round-trip tests
- [ ] Extend `src/tests/bee-atlas.test.ts` with MAP-03 assertions (if file has relevant tests)

---

## Security Domain

Phase 112 fetches one additional parquet file (`checklist.parquet`) from the same CloudFront origin as `occurrences.parquet`. No new auth surface, no user-supplied data, no XSS vectors. The `filter` expression passed to Mapbox is constructed from parquet data, not from user input. No ASVS categories apply beyond V5 (input validation not relevant for a static data layer). Security posture unchanged from Phase 111.

---

## Project Constraints (from CLAUDE.md)

- Static hosting only — no server runtime. Checklist fetch uses the same CloudFront CDN as all other parquet files.
- `speicmenLayer` typo in `bee-map.ts` is intentionally deferred — do not fix incidentally.
- `<bee-map>` and `<bee-sidebar>` are pure presenters; `<bee-atlas>` owns all reactive state. The `_checklistVisible` boolean and any cached county set derived from parquet live in `bee-map` (the latter is internal map state, not cross-component state) and `bee-atlas` (the toggle visibility is cross-component state).
- Style cache: checklist layer visibility is not a filter on the occurrence layer; the existing cache bypass condition (`filterState` active or `selectedOccIds` non-empty) is unaffected.
- Filter race guard: checklist layer updates do not interact with `_filterQueryGeneration`. Use a separate `_checklistGeneration` counter in `bee-map`.

---

## Sources

### Primary (HIGH confidence)

- Codebase inspection: `src/bee-map.ts` (layer add patterns, `counties` source ID, `generateId: true`, `NAME` property usage in `_handleRegionClick`)
- Codebase inspection: `src/bee-pane.ts` (`year-label` checkbox pattern, `_renderWhen()`, event dispatch pattern)
- Codebase inspection: `src/bee-atlas.ts` (`@state` + `@property` plumbing, `_replaceUrlState`, event handler registration)
- Codebase inspection: `src/url-state.ts` (`UiState` interface, `buildParams`, `parseParams`)
- Codebase inspection: `src/manifest.ts` (`resolveDataUrl`, `Manifest` interface, `DataKey`)
- Codebase inspection: `src/sqlite.ts` (`parquetReadObjects` usage pattern, `ArrayBuffer` file object)
- Codebase inspection: `node_modules/hyparquet/types/*.d.ts` (`parquetReadObjects`, `columns` option, `asyncBufferFromUrl`)
- Data inspection: `public/data/checklist.parquet` (duckdb — schema, row count, county names, null counts)
- Data inspection: `public/data/counties.geojson` (python json — `NAME` property, 39 features)
- Data inspection: `public/data/manifest.json` (manifest key structure)
- Codebase inspection: `scripts/make-local-manifest.js` (local manifest generation)
- Codebase inspection: `.planning/phases/111-checklist-pipeline/111-01-SUMMARY.md` (Phase 111 output details)
- Codebase inspection: `.planning/phases/111-checklist-pipeline/111-VERIFICATION.md` (checklist.parquet column schema)
- Codebase inspection: `src/tests/url-state.test.ts` + `src/tests/bee-pane.test.ts` (test patterns)

### Secondary (MEDIUM confidence)

- UI-SPEC.md (112-UI-SPEC.md) — design decisions already approved
- STATE.md `## Decisions` — locked architecture choices

### Tertiary (LOW confidence)

- None — all claims verified from codebase or authoritative project files

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — zero new packages; all libraries verified in package.json and node_modules
- Architecture: HIGH — all integration points verified from live source code
- Data schema: HIGH — verified via duckdb query on actual parquet file
- County name alignment: HIGH — verified by comparing duckdb DISTINCT list with GeoJSON NAME values
- Pitfalls: HIGH — derived from direct code reading of existing patterns
- Test patterns: HIGH — verified from existing test files

**Research date:** 2026-05-24
**Valid until:** 2026-06-24 (stable stack; no fast-moving dependencies)
