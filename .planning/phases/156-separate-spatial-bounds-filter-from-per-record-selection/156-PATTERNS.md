# Phase 156: Separate Spatial-Bounds FILTER from Per-Record SELECTION — Pattern Map

**Mapped:** 2026-06-21
**Files analyzed:** 4 modified source files + 3 modified test files
**Analogs found:** 4/4 (each file is its own analog — this is a refactor, not greenfield)

---

## File Classification

| Modified File | Role | Data Flow | Closest Analog (in-file) | Match Quality |
|---------------|------|-----------|--------------------------|---------------|
| `src/filter.ts` | data model + query | CRUD / transform | Existing `FilterState` fields; existing `buildFilterSQL` clauses | exact (add one field, one clause) |
| `src/url-state.ts` | URL serialization | request-response | Existing `counties=` / `place=` filter param round-trip; existing `sel=` reader | exact (new bbox= mirrors counties= write; legacy sel= reader converts to filter) |
| `src/bee-atlas.ts` | state owner / controller | event-driven | Existing `_filterState` spread mutations; existing `_onFilterChanged`; existing `_applyBoundsSelection` | exact (20 `_selectionBounds` sites replaced in place) |
| `src/bee-pane.ts` | pure presenter | request-response | Existing `@property` declarations on same class | exact (rename only) |

---

## Pattern Assignments

---

### `src/filter.ts` — FilterState interface (lines 13–25)

**What changes:** Add `bounds` field after `selectedPlace`.

**Analog — existing nullable field declaration:**
```typescript
// filter.ts lines 13–25 (current shape)
export interface FilterState {
  taxonId: number | null;
  taxonDisplayName: string | null;
  yearFrom: number | null;
  yearTo: number | null;
  months: Set<number>;
  selectedCounties: Set<string>;
  selectedEcoregions: Set<string>;
  selectedCollectors: CollectorEntry[];
  elevMin: number | null;
  elevMax: number | null;
  selectedPlace: string | null;   // <-- last existing field; append bounds after this
}
```

**Target shape (append):**
```typescript
  selectedPlace: string | null;
  bounds: { west: number; south: number; east: number; north: number } | null;
```

---

### `src/filter.ts` — isFilterActive (lines 233–244)

**What changes:** Add one `|| f.bounds !== null` clause at the end.

**Analog — current function body:**
```typescript
// filter.ts lines 233–244
export function isFilterActive(f: FilterState): boolean {
  return f.taxonId !== null
    || f.yearFrom !== null
    || f.yearTo !== null
    || f.months.size > 0
    || f.selectedCounties.size > 0
    || f.selectedEcoregions.size > 0
    || f.selectedCollectors.length > 0
    || f.elevMin !== null
    || f.elevMax !== null
    || f.selectedPlace !== null;   // <-- append || f.bounds !== null here
}
```

---

### `src/filter.ts` — buildFilterSQL bounds clause (lines 251–324)

**What changes:** Add a bounds clause branch inside `buildFilterSQL`, mirroring the existing inline `boundsClause` construction. Copy from `queryVisibleGeoJSON` (lines 340–344) and `queryListPage` (lines 420–425) — those two identical blocks are the source of truth.

**Analog — existing inline boundsClause construction (queryVisibleGeoJSON lines 340–344):**
```typescript
// filter.ts lines 340–344 (inside queryVisibleGeoJSON — to be MOVED into buildFilterSQL)
let boundsClause = '';
if (selectionBounds !== null) {
  const { west, south, east, north } = selectionBounds;
  boundsClause = ` AND lat BETWEEN ${south} AND ${north} AND lon BETWEEN ${west} AND ${east}`;
}
```

**Target: add to buildFilterSQL after the elevation block (before line 322):**
```typescript
  // Bounds filter — spatial bounding box from shift-drag or near-me (D-01, phase 156)
  if (f.bounds !== null) {
    const { west, south, east, north } = f.bounds;
    occurrenceClauses.push(
      `lat BETWEEN ${south} AND ${north} AND lon BETWEEN ${west} AND ${east}`
    );
  }
```

**Analog — how another filter builds a clause (elevation, lines 314–320):**
```typescript
  if (f.elevMin !== null && f.elevMax !== null) {
    occurrenceClauses.push(`elevation_m IS NOT NULL AND elevation_m BETWEEN ${f.elevMin} AND ${f.elevMax}`);
  } else if (f.elevMin !== null) {
    occurrenceClauses.push(`(elevation_m IS NULL OR elevation_m >= ${f.elevMin})`);
  } else if (f.elevMax !== null) {
    occurrenceClauses.push(`(elevation_m IS NULL OR elevation_m <= ${f.elevMax})`);
  }
```

---

### `src/filter.ts` — queryVisibleGeoJSON signature + guard (lines 326–367)

**What changes:** Remove `selectionBounds` parameter; read `f.bounds` instead; simplify guard.

**Current shape (lines 326–344):**
```typescript
// filter.ts lines 326–344
export async function queryVisibleGeoJSON(
  f: FilterState,
  selectionBounds: { west: number; south: number; east: number; north: number } | null = null
): Promise<...> {
  if (!isFilterActive(f) && selectionBounds === null) return null;
  const { occurrenceWhere } = buildFilterSQL(f);
  let boundsClause = '';
  if (selectionBounds !== null) {
    const { west, south, east, north } = selectionBounds;
    boundsClause = ` AND lat BETWEEN ${south} AND ${north} AND lon BETWEEN ${west} AND ${east}`;
  }
  // ...
  `... WHERE (${occurrenceWhere})${boundsClause} AND lat IS NOT NULL ...`
```

**Target shape:** Remove `selectionBounds` param, change guard, remove the `boundsClause` local (it's now in `buildFilterSQL` and included in `occurrenceWhere`):
```typescript
export async function queryVisibleGeoJSON(
  f: FilterState
): Promise<...> {
  if (!isFilterActive(f)) return null;            // isFilterActive now covers f.bounds
  const { occurrenceWhere } = buildFilterSQL(f);  // boundsClause already included
  // ...
  `... WHERE (${occurrenceWhere}) AND lat IS NOT NULL ...`
```

---

### `src/filter.ts` — queryListPage signature (lines 396–456)

**What changes:** Remove `selectionBounds` parameter (last param); read `f.bounds` via `buildFilterSQL`.

**Current signature (lines 396–404):**
```typescript
// filter.ts lines 396–404
export async function queryListPage(
  f: FilterState,
  page: number,
  sortBy: SpecimenSortBy = 'date',
  selectedEcdysisIds: number[] = [],
  selectedInatIds: number[] = [],
  selectedInatObsIds: number[] = [],
  selectedChecklistIds: number[] = [],
  selectionBounds: { west: number; south: number; east: number; north: number } | null = null
): Promise<{ rows: OccurrenceRow[]; total: number }> {
```

**Bounds clause inside queryListPage (lines 419–430 — to be REMOVED):**
```typescript
// filter.ts lines 419–430 (remove after moving clause into buildFilterSQL)
  let boundsClause = '';
  if (selectionBounds !== null) {
    const { west, south, east, north } = selectionBounds;
    boundsClause =
      ` AND lat BETWEEN ${south} AND ${north} AND lon BETWEEN ${west} AND ${east}`;
  }

  const selFilter = selParts.length > 0 ? ` AND (${selParts.join(' OR ')})` : '';
  const fullWhere = `(${occurrenceWhere})${selFilter}${boundsClause}`;
```

**Target:** Remove `selectionBounds` param; `fullWhere` becomes `(${occurrenceWhere})${selFilter}` (bounds is already inside `occurrenceWhere`).

---

### `src/url-state.ts` — SelectionState type (lines 27–30)

**What changes:** Remove the `{ type: 'bounds' }` variant from the union.

**Current shape (lines 27–30):**
```typescript
// url-state.ts lines 27–30
export type SelectionState =
  | { type: 'ids'; ids: string[] }
  | { type: 'cluster'; lon: number; lat: number; radiusM: number }
  | { type: 'bounds'; west: number; south: number; east: number; north: number };
```

**Target (remove last variant):**
```typescript
export type SelectionState =
  | { type: 'ids'; ids: string[] }
  | { type: 'cluster'; lon: number; lat: number; radiusM: number };
```

---

### `src/url-state.ts` — buildParams bounds write (lines 79–114)

**What changes:** Remove the `else if (selection.type === 'bounds')` branch; add a new `bbox=` write that reads from `filter.bounds`.

**Current bounds branch (lines 83–90):**
```typescript
// url-state.ts lines 83–90 (to be REMOVED)
  } else if (selection.type === 'bounds') {
    params.set('sel', [
      selection.west.toFixed(4),
      selection.south.toFixed(4),
      selection.east.toFixed(4),
      selection.north.toFixed(4),
    ].join(','));
  }
```

**Analog for new bbox= write — existing `counties=` filter param write (lines 98–100):**
```typescript
// url-state.ts lines 98–100
  if (filter.selectedCounties.size > 0) {
    params.set('counties', [...filter.selectedCounties].sort().join(','));
  }
```

**Analog for bbox= encoding — the existing `sel=` format being retired (lines 84–89):**
```typescript
// The 4-float toFixed(4) encoding is unchanged; only the param key and source change:
  if (filter.bounds !== null) {
    params.set('bbox', [
      filter.bounds.west.toFixed(4),
      filter.bounds.south.toFixed(4),
      filter.bounds.east.toFixed(4),
      filter.bounds.north.toFixed(4),
    ].join(','));
  }
```

**Placement:** Add the `bbox=` write alongside other filter params (after `place=`, before the `counties=` block, or anywhere before the selection block). Remove the `bounds` branch from the `selection.type` switch.

---

### `src/url-state.ts` — parseParams sel= reader + hasFilter (lines 188–248)

**What changes:** (a) Add a new `bbox=` reader that populates `boundsResult`. (b) Convert the `sel=` reader to populate `boundsResult` instead of `result.selection`. (c) Update `hasFilter` to include `boundsResult !== null`. (d) Add `bounds: boundsResult` to `result.filter`.

**Current sel= reader (lines 231–248 — to be CONVERTED):**
```typescript
// url-state.ts lines 231–248 (current — will be modified, not deleted)
  // Bounds selection — sel=west,south,east,north (SEL-06)
  const selRaw = p.get('sel') ?? '';
  if (selRaw) {
    const parts = selRaw.split(',');
    if (parts.length === 4) {
      const west  = parseFloat(parts[0]!);
      const south = parseFloat(parts[1]!);
      const east  = parseFloat(parts[2]!);
      const north = parseFloat(parts[3]!);
      if (isFinite(west)  && west  >= -180 && west  <= 180 &&
          isFinite(east)  && east  >= -180 && east  <= 180 &&
          isFinite(south) && south >= -90  && south <= 90  &&
          isFinite(north) && north >= -90  && north <= 90  &&
          south < north) {
        result.selection = { type: 'bounds', west, south, east, north };  // <-- CHANGE THIS LINE
      }
    }
  }
```

**Analog for bbox= reader — the `o=` cluster reader (lines 210–219) shows the parse+validate pattern:**
```typescript
// url-state.ts lines 210–229 (o= reader pattern — follow same validate-then-assign shape)
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
  }
```

**Current hasFilter predicate (lines 188–191 — to be updated):**
```typescript
// url-state.ts lines 188–191
  const hasFilter = resolvedTaxonId !== null || yearFrom !== null || yearTo !== null
    || months.size > 0 || selectedCounties.size > 0 || selectedEcoregions.size > 0
    || selectedCollectors.length > 0 || elevMin !== null || elevMax !== null
    || selectedPlace !== null;
```

**Current result.filter construction (lines 192–206 — add bounds field):**
```typescript
// url-state.ts lines 192–206
  if (hasFilter) {
    result.filter = {
      taxonId: resolvedTaxonId,
      taxonDisplayName: null,
      yearFrom,
      yearTo,
      months,
      selectedCounties,
      selectedEcoregions,
      selectedCollectors,
      elevMin,
      elevMax,
      selectedPlace,
      // ADD: bounds: boundsResult,
    };
  }
```

**Target migration structure:**
```typescript
  // NEW: bbox= reader (canonical post-156 format)
  let boundsResult: { west: number; south: number; east: number; north: number } | null = null;
  const bboxRaw = p.get('bbox') ?? '';
  if (bboxRaw) {
    const parts = bboxRaw.split(',');
    if (parts.length === 4) {
      const west  = parseFloat(parts[0]!);
      const south = parseFloat(parts[1]!);
      const east  = parseFloat(parts[2]!);
      const north = parseFloat(parts[3]!);
      if (isFinite(west)  && west  >= -180 && west  <= 180 &&
          isFinite(east)  && east  >= -180 && east  <= 180 &&
          isFinite(south) && south >= -90  && south <= 90  &&
          isFinite(north) && north >= -90  && north <= 90  &&
          south < north) {
        boundsResult = { west, south, east, north };
      }
    }
  }

  // LEGACY: sel= reader (backward compat) — populates boundsResult if bbox= absent
  const selRaw = p.get('sel') ?? '';
  if (selRaw && boundsResult === null) {
    const parts = selRaw.split(',');
    if (parts.length === 4) {
      const west  = parseFloat(parts[0]!);
      const south = parseFloat(parts[1]!);
      const east  = parseFloat(parts[2]!);
      const north = parseFloat(parts[3]!);
      if (isFinite(west)  && west  >= -180 && west  <= 180 &&
          isFinite(east)  && east  >= -180 && east  <= 180 &&
          isFinite(south) && south >= -90  && south <= 90  &&
          isFinite(north) && north >= -90  && north <= 90  &&
          south < north) {
        boundsResult = { west, south, east, north };
        // NOTE: do NOT set result.selection here — bounds is now a filter
      }
    }
  }

  const hasFilter = resolvedTaxonId !== null || ... || selectedPlace !== null
    || boundsResult !== null;   // ADD this clause
  if (hasFilter) {
    result.filter = { ..., selectedPlace, bounds: boundsResult };
  }
```

---

### `src/bee-atlas.ts` — _filterState initial literal (lines 82–94)

**What changes:** Add `bounds: null` field.

**Current shape (lines 82–94):**
```typescript
// bee-atlas.ts lines 82–94
  @state() private _filterState: FilterState = {
    taxonId: null,
    taxonDisplayName: null,
    yearFrom: null,
    yearTo: null,
    months: new Set(),
    selectedCounties: new Set(),
    selectedEcoregions: new Set(),
    selectedCollectors: [],
    elevMin: null,
    elevMax: null,
    selectedPlace: null,
    // ADD: bounds: null,
  };
```

---

### `src/bee-atlas.ts` — @state() _selectionBounds field (line 122)

**What changes:** Remove the field entirely.

**Current (line 122):**
```typescript
// bee-atlas.ts line 122 (to be REMOVED)
  @state() private _selectionBounds: { west: number; south: number; east: number; north: number } | null = null;
```

---

### `src/bee-atlas.ts` — intendedFilterActive getter (lines 189–193)

**What changes:** Remove `|| this._selectionBounds !== null` — covered automatically by `isFilterActive`.

**Current shape (lines 189–193):**
```typescript
// bee-atlas.ts lines 189–193
  get intendedFilterActive(): boolean {
    return isFilterActive(this._filterState) || this._filterResolving || this._selectionBounds !== null;
    //                                                                    ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^ REMOVE
  }
```

---

### `src/bee-atlas.ts` — _selectionBoundsLabel getter (lines 197–201)

**What changes:** Rename to `_boundsFilterLabel`; read from `this._filterState.bounds`.

**Current shape (lines 197–201):**
```typescript
// bee-atlas.ts lines 197–201
  private get _selectionBoundsLabel(): string {
    const b = this._selectionBounds;
    if (b === null) return '';
    return `${b.south.toFixed(3)}, ${b.west.toFixed(3)} → ${b.north.toFixed(3)}, ${b.east.toFixed(3)}`;
  }
```

**Target:**
```typescript
  private get _boundsFilterLabel(): string {
    const b = this._filterState.bounds;
    if (b === null) return '';
    return `${b.south.toFixed(3)}, ${b.west.toFixed(3)} → ${b.north.toFixed(3)}, ${b.east.toFixed(3)}`;
  }
```

---

### `src/bee-atlas.ts` — bee-pane template bindings (lines 455–456)

**What changes:** Update to pass from `_filterState.bounds` and renamed getter.

**Current (lines 455–456):**
```typescript
// bee-atlas.ts lines 455–456
            .selectionBoundsActive=${this._selectionBounds !== null}
            .selectionBoundsLabel=${this._selectionBoundsLabel}
```

**Target (if bee-pane props renamed):**
```typescript
            .boundsFilterActive=${this._filterState.bounds !== null}
            .boundsFilterLabel=${this._boundsFilterLabel}
```

---

### `src/bee-atlas.ts` — firstUpdated filter restore (lines 510–558)

**What changes:** (a) Add `bounds: initFilter?.bounds ?? null` to the `_filterState` spread. (b) Remove the `initSel?.type === 'bounds'` branch (lines 555–558) — bounds now arrives via `initFilter.bounds`, not `initSel`. (c) Change guard on line 543 to just `isFilterActive(this._filterState)` (now includes bounds automatically). (d) Remove `_paneState = 'list'` from the removed branch (D-04).

**Current `_filterState` restore spread (lines 513–525):**
```typescript
// bee-atlas.ts lines 513–525
    if (initFilter) {
      this._filterState = {
        taxonId: initFilter.taxonId ?? null,
        taxonDisplayName: initFilter.taxonDisplayName ?? null,
        yearFrom: initFilter.yearFrom ?? null,
        yearTo: initFilter.yearTo ?? null,
        months: initFilter.months ?? new Set(),
        selectedCounties: initFilter.selectedCounties ?? new Set(),
        selectedEcoregions: initFilter.selectedEcoregions ?? new Set(),
        selectedCollectors: initFilter.selectedCollectors ?? [],
        elevMin: initFilter.elevMin ?? null,
        elevMax: initFilter.elevMax ?? null,
        selectedPlace: initFilter.selectedPlace ?? null,
        // ADD: bounds: initFilter.bounds ?? null,
      };
    }
```

**Current bounds branch to REMOVE (lines 555–558):**
```typescript
// bee-atlas.ts lines 555–558 (REMOVE entirely)
    } else if (initSel?.type === 'bounds') {
      this._selectionBounds = { west: initSel.west, south: initSel.south, east: initSel.east, north: initSel.north };
      this._paneState = 'list';
    }
```

**buildParams call on line 569–574 — `initSel` fallback (no longer needs bounds case):**
```typescript
// bee-atlas.ts lines 569–574 (current — the bounds case in initSel is now gone; fallback to ids)
        initSel ?? { type: 'ids' as const, ids: [] },
```
This line is already correct once `initSel` can no longer be `{ type: 'bounds' }`.

---

### `src/bee-atlas.ts` — _runFilterQuery call (line 636)

**What changes:** Remove the `this._selectionBounds` second argument.

**Analog — locate with grep; the call is:**
```typescript
// bee-atlas.ts line 636 (approximate)
    queryVisibleGeoJSON(this._filterState, this._selectionBounds)
    // becomes:
    queryVisibleGeoJSON(this._filterState)
```

---

### `src/bee-atlas.ts` — _runListQuery hasSelection + queryListPage call (lines 897–903)

**What changes:** Remove `|| this._selectionBounds !== null` from `hasSelection`; remove `this._selectionBounds ?? null` from `queryListPage` call.

**Current (lines 897–904):**
```typescript
// bee-atlas.ts lines 897–904
    const hasSelection = selEcdysisIds.length > 0 || selInatIds.length > 0 || selInatObsIds.length > 0 || selChecklistIds.length > 0 || this._selectionBounds !== null;
    //                                                                                                       ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^ REMOVE
    const guarded = await this._listGuard(async () => {
      try {
        const { rows, total } = await queryListPage(
          this._filterState, this._listPage, this._tableSortBy,
          selEcdysisIds, selInatIds, selInatObsIds, selChecklistIds,
          this._selectionBounds ?? null   // <-- REMOVE this argument
        );
```

---

### `src/bee-atlas.ts` — _buildCurrentParams (lines 920–931)

**What changes:** Remove the `_selectionBounds && _paneState === 'list'` ternary branch; simplify selection arg to ids/cluster only.

**Current (lines 920–931):**
```typescript
// bee-atlas.ts lines 920–931
  private _buildCurrentParams(): URLSearchParams {
    return buildParams(
      this._currentView,
      this._filterState,
      this._selectionBounds && this._paneState === 'list'
        ? { type: 'bounds' as const, ...this._selectionBounds }
        : this._selectedCluster
          ? { type: 'cluster' as const, ...this._selectedCluster }
          : { type: 'ids' as const, ids: this._selectedOccIds ?? [] },
      { boundaryMode: this._boundaryMode, paneState: this._paneState, hiddenSources: this._hiddenSources }
    );
  }
```

**Target:**
```typescript
  private _buildCurrentParams(): URLSearchParams {
    return buildParams(
      this._currentView,
      this._filterState,
      this._selectedCluster
        ? { type: 'cluster' as const, ...this._selectedCluster }
        : { type: 'ids' as const, ids: this._selectedOccIds ?? [] },
      { boundaryMode: this._boundaryMode, paneState: this._paneState, hiddenSources: this._hiddenSources }
    );
  }
```

(`buildParams` writes `bbox=` from `filter.bounds` automatically.)

---

### `src/bee-atlas.ts` — _onNearMeCleared (lines 1074–1087)

**What changes:** Change `this._selectionBounds = null` to spread `_filterState`; remove `_selectedOccIds = null`, `_selectedCluster = null` (D-05 — clearing bounds does not clear record selection); remove `_paneState = 'collapsed'` (D-04 — bounds change does not touch pane).

**Current (lines 1074–1087):**
```typescript
// bee-atlas.ts lines 1074–1087
  private _onNearMeCleared = () => {
    this._nearMePending = false;
    this._selectedOccIds = null;      // REMOVE — D-05
    this._selectedCluster = null;     // REMOVE — D-05
    this._selectionBounds = null;     // CONVERT — see target below
    this._paneState = 'collapsed';    // REMOVE — D-04
    this._runFilterQuery();
    this._runTableQuery();
    this._replaceUrlState();
  };
```

**Target:**
```typescript
  private _onNearMeCleared = () => {
    this._nearMePending = false;
    this._filterState = { ...this._filterState, bounds: null };
    this._runFilterQuery();
    this._runTableQuery();
    this._replaceUrlState();
  };
```

**Analog for `_filterState` spread mutation — `_onRegionClick` single-select (lines 1241–1252):**
```typescript
// bee-atlas.ts lines 1241–1252 (pattern to follow for spread)
      if (isCounty) {
        this._filterState = {
          ...this._filterState,
          selectedCounties: wasOnlySelection ? new Set() : new Set([name]),
          selectedEcoregions: new Set(),
        };
      }
```

---

### `src/bee-atlas.ts` — _onPopState filter restore (lines 1122–1171)

**What changes:** (a) Add `bounds: parsed.filter?.bounds ?? null` to the `_filterState` spread. (b) Remove `parsedSel?.type === 'bounds'` branch (lines 1163–1165). (c) Remove `|| this._selectionBounds !== null` from the popstate `hasSelection` (line 1177). (d) Simplify `isFilterActive` guard on line 1192.

**Current _filterState restore spread (lines 1122–1134):**
```typescript
// bee-atlas.ts lines 1122–1134
    this._filterState = {
      taxonId: parsed.filter?.taxonId ?? null,
      taxonDisplayName: parsed.filter?.taxonDisplayName ?? null,
      yearFrom: parsed.filter?.yearFrom ?? null,
      yearTo: parsed.filter?.yearTo ?? null,
      months: parsed.filter?.months ?? new Set(),
      selectedCounties: parsed.filter?.selectedCounties ?? new Set(),
      selectedEcoregions: parsed.filter?.selectedEcoregions ?? new Set(),
      selectedCollectors: parsed.filter?.selectedCollectors ?? [],
      elevMin: parsed.filter?.elevMin ?? null,
      elevMax: parsed.filter?.elevMax ?? null,
      selectedPlace: parsed.filter?.selectedPlace ?? null,
      // ADD: bounds: parsed.filter?.bounds ?? null,
    };
```

**Current bounds-selection branch to REMOVE (lines 1163–1165):**
```typescript
// bee-atlas.ts lines 1163–1165 (REMOVE)
    } else if (parsedSel?.type === 'bounds') {
      this._selectionBounds = { west: parsedSel.west, south: parsedSel.south, east: parsedSel.east, north: parsedSel.north };
      this._selectedOccIds = null;
      this._selectedCluster = null;
```

**Current hasSelection (line 1175–1177 — remove bounds reference):**
```typescript
// bee-atlas.ts lines 1175–1177
    const hasSelection = (parsedSel?.type === 'ids' && parsedSel.ids.length > 0)
      || parsedSel?.type === 'cluster'
      || parsedSel?.type === 'bounds';   // REMOVE this line
```

---

### `src/bee-atlas.ts` — _applyBoundsSelection (lines 1322–1336) — RENAME + REFACTOR

**What changes:** Rename to `_applyBoundsFilter`. Remove `_selectedOccIds = null` and `_selectedCluster = null` (D-05). Remove `_paneState = 'list'` (D-04). Change `_selectionBounds = bounds` to `_filterState` spread. The calls to `_runFilterQuery`, `_runListQuery`, `_runTableQuery`, `_replaceUrlState` are KEPT.

**Current (lines 1322–1340):**
```typescript
// bee-atlas.ts lines 1322–1340
  // Shared bounds-selection state transition — called by BOTH _onSelectionDrawn (shift-drag)
  // and the near-me success path.
  private _applyBoundsSelection(bounds: { west: number; south: number; east: number; north: number }): void {
    ++this._selectionDrawnGeneration;
    this._selectionBounds = bounds;    // CONVERT
    this._selectedOccIds = null;       // REMOVE — D-05
    this._selectedCluster = null;      // REMOVE — D-05
    this._paneState = 'list';          // REMOVE — D-04
    this._listPage = 1;
    this._runFilterQuery();
    this._runListQuery();
    this._runTableQuery();
    this._replaceUrlState();
  }

  private _onSelectionDrawn(e: CustomEvent<{ west: number; south: number; east: number; north: number }>) {
    this._applyBoundsSelection(e.detail);  // UPDATE call site
  }
```

**Target:**
```typescript
  // Shared bounds-filter state transition — called by BOTH _onSelectionDrawn (shift-drag)
  // and the near-me success path. Guarantees byte-identical _filterState.bounds (D-01).
  private _applyBoundsFilter(bounds: { west: number; south: number; east: number; north: number }): void {
    ++this._selectionDrawnGeneration;
    this._filterState = { ...this._filterState, bounds };
    // D-04: do NOT touch _paneState
    // D-05: do NOT null _selectedOccIds or _selectedCluster
    this._listPage = 1;
    this._runFilterQuery();
    this._runListQuery();
    this._runTableQuery();
    this._replaceUrlState();
  }

  private _onSelectionDrawn(e: CustomEvent<{ west: number; south: number; east: number; north: number }>) {
    this._applyBoundsFilter(e.detail);
  }
```

---

### `src/bee-atlas.ts` — _onMapClickEmpty (lines 1342–1367)

**What changes (D-06):** Remove `this._selectionBounds = null` from BOTH branches. Only record selection is cleared by empty-map click.

**Current (lines 1342–1367):**
```typescript
// bee-atlas.ts lines 1342–1367
  private _onMapClickEmpty() {
    if (this._boundaryMode !== 'off') {
      // Clear region filter and any open selection
      this._filterState = {
        ...this._filterState,
        selectedCounties: new Set(),
        selectedEcoregions: new Set(),
      };
      this._selectedOccIds = null;
      this._selectedCluster = null;
      this._selectionBounds = null;    // REMOVE — D-06
      this._paneState = 'collapsed';
      this._runFilterQuery().then(() => { this._replaceUrlState(); });
      this._tablePage = 1;
      this._runTableQuery();
    } else {
      // Clear selection
      this._selectedOccIds = null;
      this._selectedCluster = null;
      this._selectionBounds = null;    // REMOVE — D-06
      this._paneState = 'collapsed';
      this._replaceUrlState();
    }
  }
```

---

### `src/bee-atlas.ts` — _onFilterChanged (lines 1369–1408)

**What changes (D-05):** Remove `this._selectionBounds = null` (line 1399). Add `bounds: this._filterState.bounds` to the `_filterState` spread to PRESERVE existing bounds through filter panel changes.

**Current _filterState construction (lines 1373–1385):**
```typescript
// bee-atlas.ts lines 1373–1385
    this._filterState = {
      taxonId: detail.taxonId,
      taxonDisplayName: detail.taxonDisplayName,
      yearFrom: detail.yearFrom,
      yearTo: detail.yearTo,
      months: detail.months,
      selectedCounties: detail.selectedCounties,
      selectedEcoregions: detail.selectedEcoregions,
      selectedCollectors: detail.selectedCollectors,
      elevMin: detail.elevMin ?? null,
      elevMax: detail.elevMax ?? null,
      selectedPlace: detail.selectedPlace ?? null,
      // ADD: bounds: this._filterState.bounds,  ← CRITICAL: preserves active bounds (D-05)
    };
```

**Current cleanup block (lines 1397–1399 — REMOVE line 1399):**
```typescript
// bee-atlas.ts lines 1397–1399
    this._selectedOccIds = null;
    this._selectedCluster = null;
    this._selectionBounds = null;    // REMOVE — D-05
```

---

### `src/bee-atlas.ts` — _onClearSelection (lines 1434–1442)

**What changes (D-05):** Remove `this._selectionBounds = null` (line 1437).

**Current (lines 1434–1442):**
```typescript
// bee-atlas.ts lines 1434–1442
  private _onClearSelection() {
    this._selectedOccIds = null;
    this._selectedCluster = null;
    this._selectionBounds = null;    // REMOVE — D-05
    this._selectionCount = null;
    this._listPage = 1;
    this._runListQuery();
    this._replaceUrlState();
  }
```

---

### `src/bee-atlas.ts` — _onPaneCollapse (lines 1485–1491)

**What changes (D-05/D-07):** Remove `this._selectionBounds = null` (line 1488). Collapsing pane does not clear the bounds filter.

**Current (lines 1485–1491):**
```typescript
// bee-atlas.ts lines 1485–1491
  private _onPaneCollapse() {
    this._selectedOccIds = null;
    this._selectedCluster = null;
    this._selectionBounds = null;    // REMOVE — D-05/D-07
    this._paneState = 'collapsed';
    this._replaceUrlState();
  }
```

---

### `src/bee-atlas.ts` — other `_selectionBounds = null` removal sites (D-05)

The following single-line removals follow the same D-05 rule (mutual exclusivity dropped). No analog needed beyond the pattern above:

| Line | Method | Change |
|------|--------|--------|
| 1217 | `_onOccurrenceClick` | Remove `this._selectionBounds = null` |
| 1280 | `_onRegionClick` else branch | Remove `this._selectionBounds = null` |
| 1158/1162/1170 | `_onPopState` selection restore | Remove all three `this._selectionBounds = null` in the `ids`/`cluster`/else branches |
| 1316 | `_openSidebarForFilter` | Remove `this._selectionBounds = null` |

---

### `src/bee-pane.ts` — prop declarations (lines 88–90)

**What changes:** Rename both props (Claude's discretion — go with `boundsFilterActive`/`boundsFilterLabel` for semantic clarity).

**Current (lines 88–90):**
```typescript
// bee-pane.ts lines 88–90
  @property({ attribute: false }) selectionBoundsActive: boolean = false;
  @property({ attribute: false }) selectionBoundsLabel: string = '';
```

**Analog — existing prop declaration pattern (lines 83–84):**
```typescript
// bee-pane.ts lines 83–84
  @property({ attribute: false }) selectedIds: Set<string> | null = null;
  @property({ attribute: false }) hiddenSources: Set<string> = new Set();
```

**Target:**
```typescript
  @property({ attribute: false }) boundsFilterActive: boolean = false;
  @property({ attribute: false }) boundsFilterLabel: string = '';
```

---

### `src/bee-pane.ts` — template bindings (lines 1051–1066)

**What changes:** Update all 4 references from `selectionBoundsActive`/`selectionBoundsLabel` to `boundsFilterActive`/`boundsFilterLabel`. The `near-me-cleared` event dispatch and button structure are **unchanged**.

**Current (lines 1051–1066):**
```typescript
// bee-pane.ts lines 1051–1066
            .value=${this.selectionBoundsActive ? this.selectionBoundsLabel : this._whereInput}
            ?readonly=${this.selectionBoundsActive}
            ...
            ${this.selectionBoundsActive ? html`
              <button type="button" class="near-me-btn"
                aria-label="Clear near-me filter"
                @click=${() => this.dispatchEvent(new CustomEvent('near-me-cleared', { bubbles: true, composed: true }))}>&#x2715;</button>
            ` : html`
```

---

## Shared Patterns

### FilterState spread mutation pattern

**Source:** `src/bee-atlas.ts` lines 1241–1252 (`_onRegionClick`)
**Apply to:** All sites that update `_filterState.bounds` (specifically `_applyBoundsFilter` and `_onNearMeCleared`)

```typescript
// Pattern: always spread the full _filterState, only override the changed field(s)
this._filterState = {
  ...this._filterState,
  bounds,  // or bounds: null for clear
};
```

### FilterState construction at restore sites

**Source:** `src/bee-atlas.ts` lines 513–525 (`firstUpdated`) and lines 1122–1134 (`_onPopState`)
**Apply to:** Both restore sites — add `bounds: initFilter?.bounds ?? null` / `bounds: parsed.filter?.bounds ?? null`

The pattern at both restore sites is identical: spread all fields from the parsed filter, defaulting each to null/empty. `bounds` follows the same pattern as `selectedPlace: initFilter.selectedPlace ?? null`.

### bounds filter preserved through FilterChangedEvent

**Source:** `src/bee-atlas.ts` lines 1373–1385 (`_onFilterChanged`)
**Apply to:** ONLY this method — `FilterChangedEvent` does not carry `bounds`; the bounds field must be explicitly preserved: `bounds: this._filterState.bounds`

**Critical pitfall:** Do NOT follow the pattern of other fields in `_onFilterChanged` that come from `detail.*`. `bounds` has no `detail.bounds` — it must be copied from the existing state.

### `_runFilterQuery` and downstream sequence

**Source:** `src/bee-atlas.ts` `_applyBoundsSelection` (lines 1332–1335)
**Apply to:** `_applyBoundsFilter` (renamed method) — keep the same 4-call sequence:
```typescript
this._runFilterQuery();
this._runListQuery();
this._runTableQuery();
this._replaceUrlState();
```

### `near-me-cleared` event path

**Source:** `src/bee-pane.ts` lines 1063–1066
**The event dispatch is unchanged** — only the handler in `bee-atlas.ts` changes. The `near-me-cleared` CustomEvent name is stable (D-07).

---

## No Analog Found

None — all changes are within existing files, modifying existing patterns.

---

## FilterState Construction Sites — Exhaustive List

Every site that constructs a `FilterState` literal must add `bounds: null` (or preserve existing bounds). Sites that use `{ ...this._filterState, field: value }` spread automatically inherit `bounds` — no change needed at those sites.

| File | Location | Action |
|------|----------|--------|
| `src/bee-atlas.ts:82–94` | `_filterState` initial literal | Add `bounds: null` |
| `src/bee-atlas.ts:513–525` | `firstUpdated` filter restore | Add `bounds: initFilter?.bounds ?? null` |
| `src/bee-atlas.ts:1122–1134` | `_onPopState` filter restore | Add `bounds: parsed.filter?.bounds ?? null` |
| `src/bee-atlas.ts:1373–1385` | `_onFilterChanged` new `_filterState` | Add `bounds: this._filterState.bounds` (PRESERVE) |
| `src/url-state.ts:192–206` | `parseParams` `result.filter` construction | Add `bounds: boundsResult` |
| `src/tests/filter.test.ts` | `emptyFilter()` helper | Add `bounds: null` |
| `src/tests/url-state.test.ts` | `emptyFilter()` helper | Add `bounds: null` |
| `src/tests/bee-atlas.test.ts` | Any inline FilterState fixtures | Add `bounds: null` |

Sites using `{ ...this._filterState, ... }` spread (e.g., `_onRegionClick`, `_onPlaceSelected`, `_onBoundaryModeChanged`) inherit `bounds` automatically — no change needed.

---

## Metadata

**Analog search scope:** `src/filter.ts`, `src/url-state.ts`, `src/bee-atlas.ts`, `src/bee-pane.ts` (full reads)
**Files scanned:** 4 source files + confirmed line ranges from RESEARCH.md
**Pattern extraction date:** 2026-06-21
