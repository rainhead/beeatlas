# Phase 100: Map & Filter Integration - Pattern Map

**Mapped:** 2026-05-17
**Files analyzed:** 5
**Analogs found:** 5 / 5

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `src/filter.ts` | utility | CRUD/transform | `src/filter.ts` itself (extend) | exact — extend in place |
| `src/url-state.ts` | utility | request-response | `src/url-state.ts` itself (extend) | exact — extend in place |
| `src/bee-atlas.ts` | component/orchestrator | event-driven | `src/bee-atlas.ts` itself (extend) | exact — extend in place |
| `src/bee-map.ts` | component/presenter | event-driven | `src/bee-map.ts` itself (extend) | exact — extend in place |
| `src/bee-filter-panel.ts` | component/presenter | event-driven | `src/bee-filter-panel.ts` itself (extend) | exact — extend in place |

All five files are extensions of existing files. The patterns to follow are already present in the same file — specifically the county/ecoregion patterns that places mirrors.

---

## Pattern Assignments

### `src/filter.ts` — Add `selectedPlace`, `place_slug`, `buildFilterSQL` clause

**Analog section:** Lines 11–22 (`FilterState` interface), lines 24–54 (`OccurrenceRow`), lines 56–63 (`OCCURRENCE_COLUMNS`), lines 192–201 (`isFilterActive`), lines 233–242 (`buildFilterSQL` county/ecoregion clauses)

**FilterState extension pattern** (lines 11–22 — add `selectedPlace` as final field):
```typescript
export interface FilterState {
  taxonName: string | null;
  taxonRank: 'family' | 'genus' | 'species' | null;
  yearFrom: number | null;
  yearTo: number | null;
  months: Set<number>;
  selectedCounties: Set<string>;
  selectedEcoregions: Set<string>;
  selectedCollectors: CollectorEntry[];
  elevMin: number | null;
  elevMax: number | null;
  selectedPlace: string | null;   // ADD: singular, matches D-07
}
```

**OccurrenceRow extension pattern** (lines 24–54 — add `place_slug` after `ecoregion_l3`, mirrors `county`/`ecoregion_l3`):
```typescript
export interface OccurrenceRow {
  lat: number;
  lon: number;
  date: string;
  county: string | null;
  ecoregion_l3: string | null;
  place_slug: string | null;   // ADD: matches Phase 98 parquet column
  // ... rest unchanged
}
```

**OCCURRENCE_COLUMNS extension pattern** (lines 56–63):
```typescript
export const OCCURRENCE_COLUMNS = [
  'lat', 'lon', 'date', 'county', 'ecoregion_l3', 'place_slug',  // ADD place_slug
  // ... rest unchanged
] as const;
```

**isFilterActive extension pattern** (lines 192–201 — add place check last):
```typescript
export function isFilterActive(f: FilterState): boolean {
  return f.taxonName !== null
    || f.yearFrom !== null
    || f.yearTo !== null
    || f.months.size > 0
    || f.selectedCounties.size > 0
    || f.selectedEcoregions.size > 0
    || f.selectedCollectors.length > 0
    || f.elevMin !== null
    || f.elevMax !== null
    || f.selectedPlace !== null;   // ADD
}
```

**buildFilterSQL place clause pattern** (copy county clause at lines 233–236, adapt for singular string):
```typescript
  // County filter
  if (f.selectedCounties.size > 0) {
    const counties = [...f.selectedCounties].map(c => `'${c.replace(/'/g, "''")}'`).join(',');
    occurrenceClauses.push(`county IN (${counties})`);
  }

  // Place filter — singular string (D-07: multi-place is PRICH-02 future)
  if (f.selectedPlace !== null) {
    const slug = f.selectedPlace.replace(/'/g, "''");
    occurrenceClauses.push(`place_slug = '${slug}'`);
  }
```

**Every call site that constructs a FilterState literal** must also add `selectedPlace: null` — search for `selectedCounties: new Set()` to find all construction sites (bee-atlas.ts lines 18–29, 248–259, 534–547; bee-map.ts lines 48–59; bee-filter-panel emits via `FilterChangedEvent`).

---

### `src/url-state.ts` — Add `place=` encoding/parsing, extend `boundaryMode` union

**Analog section:** Lines 29–32 (`UiState`), lines 72–86 (`buildParams` boundary + region block), lines 127–153 (`parseParams` filter block), lines 210–219 (`parseParams` UI block)

**UiState extension** (line 30 — add `'places'` to union):
```typescript
export interface UiState {
  boundaryMode: 'off' | 'counties' | 'ecoregions' | 'places';  // extend
  viewMode: 'map' | 'table';
}
```

**buildParams place param pattern** (insert after `ecor` block at lines 78–80, following the same `if non-null → set` pattern):
```typescript
  if (filter.selectedEcoregions.size > 0) {
    params.set('ecor', [...filter.selectedEcoregions].sort().join(','));
  }
  if (filter.selectedPlace !== null) {   // ADD
    params.set('place', filter.selectedPlace);
  }
  // bm=places is implied by place= (D-09); still serialize bm for non-place modes:
  if (ui.boundaryMode !== 'off') params.set('bm', ui.boundaryMode);
```

**parseParams place param pattern** (insert in filter block after `ecor` parsing at lines 132–135, following the same `p.get → null` pattern):
```typescript
  const ecorRaw = p.get('ecor') ?? '';
  const selectedEcoregions = new Set<string>(
    ecorRaw ? ecorRaw.split(',').map(s => s.trim()).filter(Boolean) : []
  );

  const selectedPlace = p.get('place') ?? null;   // ADD: null = no filter
```

**parseParams hasFilter guard** (lines 151–153 — add `selectedPlace !== null`):
```typescript
  const hasFilter = resolvedTaxonName !== null || yearFrom !== null || yearTo !== null
    || months.size > 0 || selectedCounties.size > 0 || selectedEcoregions.size > 0
    || selectedCollectors.length > 0 || elevMin !== null || elevMax !== null
    || selectedPlace !== null;   // ADD
  if (hasFilter) {
    result.filter = {
      // ...existing fields...,
      selectedPlace,   // ADD
    };
  }
```

**parseParams UI block — boundaryMode with place= implication** (lines 210–214, implement D-01):
```typescript
  const bmRaw = p.get('bm') ?? '';
  // D-01: place= implies boundaryMode = 'places'; bm= only needed for counties/ecoregions
  const placeImplied = (p.get('place') ?? '') !== '';
  const boundaryMode: 'off' | 'counties' | 'ecoregions' | 'places' =
    placeImplied ? 'places'
    : (bmRaw === 'counties' || bmRaw === 'ecoregions' || bmRaw === 'places') ? bmRaw
    : 'off';
```

---

### `src/bee-atlas.ts` — Extend `_boundaryMode`, add `_selectedPlace` state, new event handlers

**Analog section:** Lines 18–29 (`_filterState` init), lines 33 (`_boundaryMode` type), lines 240–260 (`_init` restoration block), lines 534–548 (popstate restoration), lines 625–671 (`_onRegionClick`), lines 734–761 (`_onFilterChanged`), lines 984–987 (`_onBoundaryModeChanged`)

**`_boundaryMode` type extension** (line 33):
```typescript
@state() private _boundaryMode: 'off' | 'counties' | 'ecoregions' | 'places' = 'off';
```

**`_filterState` init — add `selectedPlace`** (lines 18–29):
```typescript
@state() private _filterState: FilterState = {
  taxonName: null,
  taxonRank: null,
  yearFrom: null,
  yearTo: null,
  months: new Set(),
  selectedCounties: new Set(),
  selectedEcoregions: new Set(),
  selectedCollectors: [],
  elevMin: null,
  elevMax: null,
  selectedPlace: null,   // ADD
};
```

**`_init` restoration pattern** (lines 248–259 — add `selectedPlace` to restore block):
```typescript
    if (initFilter) {
      this._filterState = {
        // ...existing fields...,
        selectedPlace: initFilter.selectedPlace ?? null,   // ADD
      };
    }
    // D-01: place= in URL implies boundaryMode='places' (handled in parseParams)
    // initBoundaryMode will already be 'places' if place= was set
```

**`_onPlaceSelected` — new handler** (follows `_onRegionClick` pattern at lines 625–671, but simpler — singular, no shift-multi):
```typescript
  private _onPlaceSelected(e: CustomEvent<{ slug: string }>) {
    const { slug } = e.detail;
    // Toggle off if already selected (same toggle-off pattern as _onRegionClick)
    const wasSelected = this._filterState.selectedPlace === slug;
    this._filterState = {
      ...this._filterState,
      selectedPlace: wasSelected ? null : slug,
    };
    this._runFilterQuery().then(() => { this._pushUrlState(); });
    this._tablePage = 1;
    this._runTableQuery();
  }
```

**`_onFilterChanged` extension** (lines 734–748 — add `selectedPlace` to the destructured detail):
```typescript
  private _onFilterChanged(e: CustomEvent<FilterChangedEvent>) {
    const detail = e.detail;
    this._filterState = {
      // ...existing fields...,
      selectedPlace: detail.selectedPlace ?? null,   // ADD
    };
    // rest unchanged
  }
```

**`_onBoundaryModeChanged` extension** (lines 984–987 — extend accepted type):
```typescript
  private _onBoundaryModeChanged(e: CustomEvent<'off' | 'counties' | 'ecoregions' | 'places'>) {
    this._boundaryMode = e.detail;
    this._pushUrlState();
  }
```

**Wire up `place-selected` event in render** (near where `boundary-mode-changed` is wired at line 190):
```typescript
  @place-selected=${this._onPlaceSelected}
```

---

### `src/bee-map.ts` — Places source/layer setup, click handler, `_placeIdMap`, `boundaryMode` extension

**Analog section:** Lines 41 (`boundaryMode` property), lines 75–76 (`_countyIdMap`/`_ecoregionIdMap`), lines 395–492 (source + layer setup), lines 692–712 (click interaction registration), lines 934–963 (`_loadBoundaryData`), lines 966–996 (`_applyBoundaryMode`, `_applyBoundarySelection`), lines 1062–1075 (`_handleRegionClick`)

**`boundaryMode` property type extension** (line 41):
```typescript
@property({ attribute: false }) boundaryMode: 'off' | 'counties' | 'ecoregions' | 'places' = 'off';
```

**`_placeIdMap` declaration** (after line 76, following `_ecoregionIdMap`):
```typescript
private _countyIdMap: Map<number, string> = new Map();
private _ecoregionIdMap: Map<number, string> = new Map();
private _placeIdMap: Map<number, string> = new Map();   // ADD: maps feature id → slug
```

**`filterState` default — add `selectedPlace`** (lines 48–59):
```typescript
@property({ attribute: false }) filterState: FilterState = {
  // ...existing fields...,
  selectedPlace: null,   // ADD
};
```

**Places source setup** (after ecoregions source at lines 401–404, identical pattern):
```typescript
this._map!.addSource('places', {
  type: 'geojson',
  data: { type: 'FeatureCollection', features: [] },
  generateId: true,
});
```

**Initial visibility computation** (after lines 411–412, add places):
```typescript
const countyVis = this.boundaryMode === 'counties' ? 'visible' as const : 'none' as const;
const ecoVis = this.boundaryMode === 'ecoregions' ? 'visible' as const : 'none' as const;
const placesVis = this.boundaryMode === 'places' ? 'visible' as const : 'none' as const;
```

**place-fill layer** (insert after county-line block at ~line 492, copy ecoregion-fill pattern with amber palette from D-06):
```typescript
// Place fill (click target + selection highlight) — warm amber, D-06
this._map!.addLayer({
  id: 'place-fill',
  type: 'fill',
  source: 'places',
  layout: { visibility: placesVis },
  paint: {
    'fill-color': [
      'case',
      ['boolean', ['feature-state', 'selected'], false],
      'rgba(220, 130, 30, 0.12)',   // D-06 selected fill
      'rgba(0, 0, 0, 0)',           // D-06 unselected: transparent
    ],
  },
});

// Place line (visible stroke) — warm amber, D-06
this._map!.addLayer({
  id: 'place-line',
  type: 'line',
  source: 'places',
  layout: { visibility: placesVis, 'line-join': 'round', 'line-cap': 'round' },
  paint: {
    'line-color': [
      'case',
      ['boolean', ['feature-state', 'selected'], false],
      'rgba(220, 130, 30, 0.85)',   // D-06 selected line
      'rgba(180, 100, 30, 0.65)',   // D-06 unselected line
    ],
    'line-width': [
      'case',
      ['boolean', ['feature-state', 'selected'], false],
      2.5,
      1.5,
    ],
  },
});
```

**Click interaction for place-fill** (after click-ecoregion at lines 703–712, following D-02 priority):
```typescript
// 5. Place fill click — fires only when place-fill layer is visible (D-03)
this._map.addInteraction('click-place', {
  type: 'click',
  target: { layerId: 'place-fill' },
  handler: (e) => {
    this._clickConsumed = true;
    e.preventDefault();
    this._handlePlaceClick(e);
  },
});
```

**`_selectBoundary` type extension** (line 299–302):
```typescript
private _selectBoundary(mode: 'off' | 'counties' | 'ecoregions' | 'places') {
  this._regionMenuOpen = false;
  if (mode === this.boundaryMode) return;
  this._emit<'off' | 'counties' | 'ecoregions' | 'places'>('boundary-mode-changed', mode);
}
```

**`_loadBoundaryData` extension** (lines 934–963 — add places fetch in `Promise.all`, build `_placeIdMap` with slug):
```typescript
private async _loadBoundaryData() {
  try {
    const [countiesResp, ecoregionsResp, placesResp] = await Promise.all([
      resolveDataUrl('counties').then(url => fetch(url)),
      resolveDataUrl('ecoregions').then(url => fetch(url)),
      resolveDataUrl('places').then(url => fetch(url)),   // ADD
    ]);
    const countiesData = await countiesResp.json();
    const ecoregionsData = await ecoregionsResp.json();
    const placesData = await placesResp.json();           // ADD

    // Build ID-to-name maps (generateId assigns sequential integers)
    this._countyIdMap = new Map(
      (countiesData.features as ...[]).map((f, i) => [i, f.properties?.NAME ?? ''])
    );
    this._ecoregionIdMap = new Map(
      (ecoregionsData.features as ...[]).map((f, i) => [i, f.properties?.NA_L3NAME ?? ''])
    );
    // ADD: _placeIdMap maps feature id → slug (the filterable key)
    this._placeIdMap = new Map(
      (placesData.features as { properties?: { slug?: string } }[]).map(
        (f, i) => [i, f.properties?.slug ?? '']
      )
    );

    (this._map!.getSource('counties') as mapboxgl.GeoJSONSource).setData(countiesData);
    (this._map!.getSource('ecoregions') as mapboxgl.GeoJSONSource).setData(ecoregionsData);
    (this._map!.getSource('places') as mapboxgl.GeoJSONSource).setData(placesData);  // ADD

    this._applyBoundaryMode();
    this._applyBoundarySelection();
  } catch (err) {
    console.error('Failed to load boundary GeoJSON:', err);
  }
}
```

**`_applyBoundaryMode` extension** (lines 966–973 — add places visibility):
```typescript
private _applyBoundaryMode() {
  if (!this._map?.getLayer('county-fill')) return;
  const countyVis = this.boundaryMode === 'counties' ? 'visible' : 'none';
  const ecoVis = this.boundaryMode === 'ecoregions' ? 'visible' : 'none';
  const placesVis = this.boundaryMode === 'places' ? 'visible' : 'none';  // ADD
  this._map.setLayoutProperty('county-fill', 'visibility', countyVis);
  this._map.setLayoutProperty('county-line', 'visibility', countyVis);
  this._map.setLayoutProperty('ecoregion-fill', 'visibility', ecoVis);
  this._map.setLayoutProperty('ecoregion-line', 'visibility', ecoVis);
  this._map.setLayoutProperty('place-fill', 'visibility', placesVis);   // ADD
  this._map.setLayoutProperty('place-line', 'visibility', placesVis);   // ADD
}
```

**`_applyBoundarySelection` extension** (lines 976–995 — add places branch mirroring ecoregions):
```typescript
private _applyBoundarySelection() {
  if (!this._map?.getSource('counties') || !this._map?.getSource('ecoregions')) return;

  this._map.removeFeatureState({ source: 'counties' });
  this._map.removeFeatureState({ source: 'ecoregions' });
  this._map.removeFeatureState({ source: 'places' });  // ADD

  if (this.boundaryMode === 'counties') {
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
  } else if (this.boundaryMode === 'places') {  // ADD: D-05 — highlight when mode=places and filter active
    for (const [id, slug] of this._placeIdMap.entries()) {
      if (this.filterState.selectedPlace === slug) {
        this._map.setFeatureState({ source: 'places', id }, { selected: true });
      }
    }
  }
}
```

**`_handlePlaceClick` — new method** (copy `_handleRegionClick` at lines 1062–1075; emits `place-selected` with slug instead of `map-click-region` with name):
```typescript
private _handlePlaceClick(e: mapboxgl.InteractionEvent) {
  this._clickConsumed = true;
  e.preventDefault();
  const feature = e.feature;
  if (!feature) return;

  const slug = feature.properties?.['slug'] as string | undefined;
  if (!slug) return;

  this._emit('place-selected', { slug });
}
```

---

### `src/bee-filter-panel.ts` — Place chip rendering, `_removePlace`, `FilterChangedEvent` extension

**Analog section:** Lines 70–73 (`_selectedCounties`/`_selectedEcoregions` state), lines 307–331 (`willUpdate` sync from filterState), lines 349–368 (`_emitFilter`), lines 547–558 (`_removeCounty`/`_removeEcoregion`), lines 676–703 (`_renderWhere` with chip template)

**`FilterChangedEvent` extension** (in `src/bee-sidebar.ts` lines 31–42 — add `selectedPlace`):
```typescript
export interface FilterChangedEvent {
  // ...existing fields...,
  selectedPlace: string | null;   // ADD
}
```

**Local state for selected place** (after line 73 in bee-filter-panel):
```typescript
@state() private _selectedCounties: Set<string> = new Set();
@state() private _selectedEcoregions: Set<string> = new Set();
@state() private _selectedPlace: string | null = null;   // ADD
```

**`willUpdate` sync pattern** (after lines 329–331, sync `_selectedPlace` from filterState):
```typescript
    const localPlace = this._selectedPlace;
    const fsPlace = f.selectedPlace;
    if (localPlace !== fsPlace) this._selectedPlace = fsPlace;
```

**`_emitFilter` extension** (lines 349–368 — add `selectedPlace`):
```typescript
    this.dispatchEvent(new CustomEvent<FilterChangedEvent>('filter-changed', {
      bubbles: true, composed: true,
      detail: {
        // ...existing fields...,
        selectedPlace: this._selectedPlace,   // ADD
      } as FilterChangedEvent,
    }));
```

**`_removePlace` method** (copy `_removeEcoregion` pattern at lines 554–558, but sets to null):
```typescript
private _removePlace() {
  this._selectedPlace = null;
  this._emitFilter();
}
```

**Place chip rendering** (in `_renderWhere`, after ecoregion chips at lines 696–702 — reuse `.chip`/`.chip-remove` CSS, no new classes needed):
```typescript
  ${this._selectedPlace !== null ? html`
    <span class="chip">
      ${this._selectedPlace}
      <button class="chip-remove" @click=${() => this._removePlace()}
        aria-label="Remove place filter">&#x2715;</button>
    </span>
  ` : nothing}
```

---

## Shared Patterns

### Feature-state selection highlight
**Source:** `src/bee-map.ts` lines 420–427 (ecoregion-fill paint), lines 980–995 (`_applyBoundarySelection`)
**Apply to:** `place-fill` and `place-line` layers; `_applyBoundarySelection` places branch
```typescript
// Paint expression — identical structure for all three boundary types:
'fill-color': [
  'case',
  ['boolean', ['feature-state', 'selected'], false],
  '<selected-rgba>',
  '<unselected-rgba>',
],
// Selection update — same setFeatureState call signature:
this._map.setFeatureState({ source: 'places', id }, { selected: true });
```

### GeoJSON source with generateId
**Source:** `src/bee-map.ts` lines 395–404
**Apply to:** `'places'` source (required for feature-state to work)
```typescript
this._map!.addSource('places', {
  type: 'geojson',
  data: { type: 'FeatureCollection', features: [] },
  generateId: true,  // required for setFeatureState
});
```

### Click interaction priority chain
**Source:** `src/bee-map.ts` lines 663–718
**Apply to:** `click-place` interaction — must be priority 5 (after cluster=1, point=2, county=3, ecoregion=4), implementing D-02
```typescript
// D-02: occurrence dot clicks (1,2) win; place click fires only when no dot is hit
// D-03: only active when place-fill layer is visible (enforced by target: { layerId: 'place-fill' })
this._map.addInteraction('click-place', {
  type: 'click',
  target: { layerId: 'place-fill' },
  handler: (e) => { ... },
});
```

### CustomEvent emission pattern
**Source:** `src/bee-map.ts` lines 1071–1074 (`_emit` call in `_handleRegionClick`)
**Apply to:** `_handlePlaceClick` emitting `place-selected`
```typescript
this._emit('place-selected', { slug });
// bee-atlas wires: @place-selected=${this._onPlaceSelected}
```

### `_filterQueryGeneration` race guard
**Source:** `src/bee-atlas.ts` lines 66, 331–334
**Apply to:** `_onPlaceSelected` must call `_runFilterQuery()` (which already uses the guard internally) — no extra wiring needed; guard fires automatically for all `_filterState` changes.

---

## No Analog Found

All files have close analogs (they are self-analogous — each extends an existing file by mirroring its own county/ecoregion patterns).

---

## Metadata

**Analog search scope:** `src/` directory
**Files scanned:** 5 (filter.ts, url-state.ts, bee-atlas.ts, bee-map.ts, bee-filter-panel.ts)
**Pattern extraction date:** 2026-05-17
