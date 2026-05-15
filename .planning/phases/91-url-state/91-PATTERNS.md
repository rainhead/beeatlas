# Phase 91: URL State - Pattern Map

**Mapped:** 2026-05-15
**Files analyzed:** 2 (1 modified, 1 modified)
**Analogs found:** 2 / 2

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `src/url-state.ts` | utility | transform | `src/url-state.ts` itself (existing `cluster` variant) | exact |
| `src/bee-atlas.ts` | controller | event-driven | `src/bee-atlas.ts` itself (`_restoreClusterSelection` + `_onSelectionDrawn`) | exact |

Both files are modifications of existing code. The analog for each change is the nearest existing variant in the same file.

---

## Pattern Assignments

### `src/url-state.ts` — extend `SelectionState` union + `buildParams` + `parseParams`

**Analog within same file:** existing `cluster` variant (lines 24–27, 61–63, 159–177)

**SelectionState union — current** (lines 24–27):
```typescript
export type SelectionState =
  | { type: 'ids'; ids: string[] }
  | { type: 'cluster'; lon: number; lat: number; radiusM: number };
```

Add a third variant:
```typescript
  | { type: 'bounds'; west: number; south: number; east: number; north: number }
```

**buildParams — cluster branch to mirror** (lines 59–63):
```typescript
  if (selection.type === 'ids' && selection.ids.length > 0) {
    params.set('o', selection.ids.join(','));
  } else if (selection.type === 'cluster') {
    params.set('o', `@${selection.lon.toFixed(4)},${selection.lat.toFixed(4)},${Math.ceil(selection.radiusM)}`);
  }
```

New `bounds` branch goes after `cluster`, using `sel=` param (not `o=`):
```typescript
  } else if (selection.type === 'bounds') {
    params.set('sel', [
      selection.west.toFixed(4),
      selection.south.toFixed(4),
      selection.east.toFixed(4),
      selection.north.toFixed(4),
    ].join(','));
  }
```

**parseParams — cluster validation pattern to mirror** (lines 159–177):
```typescript
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

New `sel=` parsing goes before the `oRaw` block (or after — but `sel=` and `o=` are mutually exclusive per D-01, so either order is fine). Per the validation spec in D-DISCRETION: 4 finite floats, west/east ∈ [-180, 180], south/north ∈ [-90, 90], south < north.

---

### `src/bee-atlas.ts` — `_pushUrlState`, `_onSelectionDrawn`, `_onClose`, `_onMapClickEmpty`, `_onFilterChanged`, `firstUpdated`, `_onPopState`, `_restoreBoundsSelection`

#### `_pushUrlState` — current (lines 496–511):
```typescript
  private _pushUrlState() {
    const params = buildParams(
      this._currentView,
      this._filterState,
      this._selectedCluster
        ? { type: 'cluster' as const, ...this._selectedCluster }
        : { type: 'ids' as const, ids: this._selectedOccIds ?? [] },
      { boundaryMode: this._boundaryMode, viewMode: this._viewMode }
    );
    window.history.replaceState({}, '', '?' + params.toString());
    if (this._mapMoveDebounce) clearTimeout(this._mapMoveDebounce);
    this._mapMoveDebounce = setTimeout(() => {
      window.history.pushState({}, '', '?' + params.toString());
      this._mapMoveDebounce = null;
    }, 500);
  }
```

The selection ternary must be extended to a three-way check. Per D-01/CONTEXT `_pushUrlState` ternary note: `_selectionBounds && _sidebarOpen` takes precedence:
```typescript
      this._selectionBounds && this._sidebarOpen
        ? { type: 'bounds' as const, ...this._selectionBounds }
        : this._selectedCluster
          ? { type: 'cluster' as const, ...this._selectedCluster }
          : { type: 'ids' as const, ids: this._selectedOccIds ?? [] },
```

#### `_onSelectionDrawn` — placeholder comment at lines 669 and 680:
```typescript
  private async _onSelectionDrawn(e: CustomEvent<{ west: number; south: number; east: number; north: number }>) {
    const generation = ++this._selectionDrawnGeneration;
    this._selectionBounds = e.detail;
    // ... (sync clears, filter snapshot) ...
    try {
      const rows = await queryOccurrencesByBounds(f, this._selectionBounds!);
      if (generation !== this._selectionDrawnGeneration) return;
      if (rows.length === 0) return;
      import('./bee-sidebar.ts');
      this._selectedOccurrences = rows.sort((a, b) => b.date.localeCompare(a.date));
      this._selectedOccIds = rows.map(r =>
        r.ecdysis_id != null ? `ecdysis:${r.ecdysis_id}` : `inat:${Number(r.observation_id)}`
      );
      this._selectedCluster = null;
      this._sidebarOpen = true;
      // Phase 91 will call this._pushUrlState() here to encode sel= in the URL
    } catch (err) {
      console.error('Bounds query failed:', err);
    }
  }
```

Replace the Phase 91 placeholder comment with `this._pushUrlState();`.

#### `_onClose` — current (lines 813–819):
```typescript
  private _onClose() {
    this._selectedOccurrences = null;
    this._selectedOccIds = null;
    this._selectedCluster = null;
    this._sidebarOpen = false;
    this._pushUrlState();
  }
```

Add `this._selectionBounds = null;` before `_pushUrlState()`. Same pattern applies to `_onMapClickEmpty` (lines 686–711) and `_onFilterChanged` (lines 713–740) — each clears `_selectedOccurrences`, `_selectedOccIds`, `_selectedCluster`; add `_selectionBounds = null` alongside those.

#### `_onMapClickEmpty` — clear-selection site (lines 703–710):
```typescript
    } else {
      // Clear selection
      this._selectedOccurrences = null;
      this._selectedOccIds = null;
      this._selectedCluster = null;
      this._sidebarOpen = false;
      this._pushUrlState();
    }
```

And the boundary-mode clear branch (lines 688–700) also clears `_selectedOccIds`/`_selectedCluster` — add `_selectionBounds = null` there too.

#### `_onFilterChanged` — clear block (lines 729–733):
```typescript
    // Clear selections when filter changes
    this._selectedOccurrences = null;
    this._selectedOccIds = null;
    this._selectedCluster = null;
    this._sidebarOpen = false;
```

Add `this._selectionBounds = null;` here.

#### `_restoreClusterSelection` — mirror pattern for `_restoreBoundsSelection` (lines 896–935):
```typescript
  private async _restoreClusterSelection({ lon, lat, radiusM }: { lon: number; lat: number; radiusM: number }) {
    try {
      await tablesReady;
      // ... query ...
      this._selectedOccIds = restoredIds;
      this._selectedOccurrences = filtered.sort((a, b) => b.date.localeCompare(a.date));
    } catch (err) {
      console.error('Failed to restore cluster selection from URL:', err);
    }
  }
```

`_restoreBoundsSelection` mirrors this exactly but calls `queryOccurrencesByBounds` instead of the bespoke SQLite haversine query. Per CONTEXT `_restoreBoundsSelection` note: sets `_sidebarOpen = true` immediately (sidebar shows loading state), awaits `tablesReady`, then calls `queryOccurrencesByBounds`. Also applies the `_selectionDrawnGeneration` guard as in `_onSelectionDrawn`:

```typescript
  private async _restoreBoundsSelection(bounds: { west: number; south: number; east: number; north: number }) {
    this._sidebarOpen = true;
    const generation = ++this._selectionDrawnGeneration;
    try {
      await tablesReady;
      const rows = await queryOccurrencesByBounds(this._filterState, bounds);
      if (generation !== this._selectionDrawnGeneration) return;
      if (rows.length === 0) return;
      import('./bee-sidebar.ts');
      this._selectedOccurrences = rows.sort((a, b) => b.date.localeCompare(a.date));
      this._selectedOccIds = rows.map(r =>
        r.ecdysis_id != null ? `ecdysis:${r.ecdysis_id}` : `inat:${Number(r.observation_id)}`
      );
    } catch (err) {
      console.error('Failed to restore bounds selection from URL:', err);
    }
  }
```

#### `firstUpdated` — restore block (lines 276–285):
```typescript
    // Restore selected occurrences from URL
    const initSel = initialParams.selection;
    if (initSel?.type === 'ids' && initSel.ids.length > 0) {
      import('./bee-sidebar.ts');
      this._selectedOccIds = initSel.ids;
      this._sidebarOpen = true;
    } else if (initSel?.type === 'cluster') {
      import('./bee-sidebar.ts');
      this._selectedCluster = { lon: initSel.lon, lat: initSel.lat, radiusM: initSel.radiusM };
      this._sidebarOpen = true;
    }
```

Add a `bounds` branch after `cluster`:
```typescript
    } else if (initSel?.type === 'bounds') {
      import('./bee-sidebar.ts');
      this._selectionBounds = { west: initSel.west, south: initSel.south, east: initSel.east, north: initSel.north };
      this._restoreBoundsSelection(this._selectionBounds);
    }
```

Note: `_sidebarOpen = true` is set inside `_restoreBoundsSelection` immediately (before the first await), matching the `_restoreClusterSelection` pattern where `firstUpdated` does not set it.

#### `_onPopState` — restore block (lines 551–568):
```typescript
    // Restore selection
    const parsedSel = parsed.selection;
    if (parsedSel?.type === 'ids' && parsedSel.ids.length > 0) {
      this._selectedOccIds = parsedSel.ids;
      this._selectedCluster = null;
      this._sidebarOpen = true;
      this._selectedOccurrences = null;
      this._restoreSelectionOccurrences(parsedSel.ids);
    } else if (parsedSel?.type === 'cluster') {
      this._selectedCluster = { lon: parsedSel.lon, lat: parsedSel.lat, radiusM: parsedSel.radiusM };
      this._selectedOccIds = null;
      this._sidebarOpen = true;
      this._selectedOccurrences = null;
      this._restoreClusterSelection(this._selectedCluster);
    } else {
      this._selectedOccurrences = null;
      this._selectedOccIds = null;
      this._selectedCluster = null;
      this._sidebarOpen = false;
    }
```

Add `bounds` branch between `cluster` and `else`, and clear `_selectionBounds` in the `else` branch:
```typescript
    } else if (parsedSel?.type === 'bounds') {
      this._selectionBounds = { west: parsedSel.west, south: parsedSel.south, east: parsedSel.east, north: parsedSel.north };
      this._selectedOccIds = null;
      this._selectedCluster = null;
      this._selectedOccurrences = null;
      this._restoreBoundsSelection(this._selectionBounds);
    } else {
      this._selectedOccurrences = null;
      this._selectedOccIds = null;
      this._selectedCluster = null;
      this._selectionBounds = null;   // clear bounds on navigate-away
      this._sidebarOpen = false;
    }
```

---

## Shared Patterns

### Generation guard (stale-query protection)
**Source:** `src/bee-atlas.ts` lines 659, 671 (`_onSelectionDrawn`)
**Apply to:** `_restoreBoundsSelection`
```typescript
const generation = ++this._selectionDrawnGeneration;
// ... await ...
if (generation !== this._selectionDrawnGeneration) return;
```
The same `_selectionDrawnGeneration` counter used in `_onSelectionDrawn` is reused — any new draw or restore call cancels the in-flight restore.

### tablesReady await
**Source:** `src/bee-atlas.ts` line 898 (`_restoreClusterSelection`)
**Apply to:** `_restoreBoundsSelection`
```typescript
await tablesReady;
```
Must come before any SQLite/query call in async restore methods.

### Error handling in restore methods
**Source:** `src/bee-atlas.ts` lines 933–935
**Apply to:** `_restoreBoundsSelection`
```typescript
    } catch (err) {
      console.error('Failed to restore cluster selection from URL:', err);
    }
```

### Test pattern for new SelectionState variants
**Source:** `src/tests/url-state.test.ts` lines 134–146 (cluster round-trip tests)
```typescript
  test('cluster centroid encodes as @lon,lat,r (D-06)', () => {
    const selection: SelectionState = { type: 'cluster', lon: -120.5123, lat: 47.4567, radiusM: 312 };
    const params = buildParams(defaultView, emptyFilter(), selection, defaultUi);
    expect(params.get('o')).toBe('@-120.5123,47.4567,312');
    const result = parseParams(params.toString());
    expect(result.selection).toEqual({ type: 'cluster', lon: -120.5123, lat: 47.4567, radiusM: 312 });
  });
```
Mirror this pattern for `bounds`: encode/decode round-trip, out-of-range rejection (west > 180, south > north, non-finite values).

---

## No Analog Found

None — both files are modifications of existing code with clear internal precedents.

---

## Metadata

**Analog search scope:** `src/url-state.ts`, `src/bee-atlas.ts`, `src/tests/url-state.test.ts`
**Files scanned:** 3
**Pattern extraction date:** 2026-05-15
