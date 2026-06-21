# Phase 156: Separate Spatial-Bounds FILTER from Per-Record SELECTION — Research

**Researched:** 2026-06-21
**Domain:** TypeScript / Lit web component state-model refactor (src/filter.ts, src/url-state.ts, src/bee-atlas.ts, src/bee-pane.ts)
**Confidence:** HIGH — all findings are grounded in direct source-file reads of the current codebase

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D-01:** Fold the bounds box into `FilterState` — it becomes a first-class filter field (renamed off `_selectionBounds`), flowing through the existing filter plumbing (`isFilterActive`, `queryVisibleGeoJSON`/`queryVisibleIds`, `_onFilterChanged`, `_runFilterQuery`/`_runListQuery`/`_runTableQuery`). Bounds is "just another filter." `queryVisibleGeoJSON`/`queryListPage` currently take `selectionBounds` as a separate arg (filter.ts:328, 404) — that arg folds into the `FilterState` they already receive. `isFilterActive(f)` must return true when bounds is set. `intendedFilterActive` on `<bee-atlas>` reads from the single filter source rather than OR-ing `_selectionBounds`.
- **D-02:** New URL param: `bbox=west,south,east,north` (same 4-float `toFixed(4)` encoding). `buildParams` only ever writes `bbox=` for bounds.
- **D-03:** `parseParams` performs read-old/write-new migration: still parses legacy `sel=` and maps into the bounds filter; re-serializes as `bbox=` on next URL write. `o=` is untouched. `SelectionState { type: 'bounds' }` variant moves out of selection and into the filter.
- **D-04:** A bounds-filter change does NOT touch `_paneState`. Remove the `_paneState = 'list'` force in `_applyBoundsSelection` (currently bee-atlas.ts:1330).
- **D-05:** Bounds filter and per-record selection may coexist (AND-compose). The `_applyBoundsSelection` behavior of clearing `_selectedOccIds`/`_selectedCluster` (bee-atlas.ts:1328-1329) is dropped.
- **D-06:** `_onMapClickEmpty` clears per-record selection ONLY, leaves bounds active. Bounds-nulling in both branches of that handler (bee-atlas.ts:1350-1364) is removed.
- **D-07:** Bounds filter cleared through the 'where' input reusing the Phase-153 `near-me-cleared` mechanism. No new dedicated UI control.
- **D-08 (DEFERRED):** Global "clear all filters" reset is deferred — no such affordance exists.

### Claude's Discretion
- Exact field name on `FilterState` for the box (e.g. `bounds` / `bbox` / `boundsFilter`) — pick what reads cleanly alongside existing fields.
- Internal naming of the renamed apply path (old `_applyBoundsSelection`) — choose a filter-oriented name (e.g. `_applyBoundsFilter`).
- Whether to keep a thin shim so a near-me box and a shift-drag box still produce byte-identical state (D-01 guarantee from Phase 153).

### Deferred Ideas (OUT OF SCOPE)
- Global "clear all filters" reset that also drops bounds (D-08).
- Surfacing the shift-drag gesture (backlog 155).
</user_constraints>

---

## Summary

Phase 153 shipped the spatial-bounds behavior correctly (bounds filter the map + list + table; bounds survive URL round-trip; the `near-me-cleared` event clears them). However the state model still treats a bounding box as a special-cased sub-variant of "selection" rather than a filter. The legacy machinery (`_selectionBounds` field, the `{ type: 'bounds' }` SelectionState variant, `sel=` URL param, `_applyBoundsSelection` method that clears record selection and forces the list pane) is the entire target of this refactor.

The refactor touches exactly four source files: `filter.ts` (add `bounds` field to `FilterState`, fold `selectionBounds` arg into it, update `isFilterActive`), `url-state.ts` (add `bbox=` write, add `sel=` legacy read into filter, remove `{ type: 'bounds' }` from `SelectionState`), `bee-atlas.ts` (the largest file — ~20 distinct touchpoints spread across state declaration, filter query, list query, URL building, popstate restore, firstUpdated restore, `_applyBoundsSelection`, `_onMapClickEmpty`, `_onNearMeCleared`, `_onPaneCollapse`, `_onFilterChanged`, several `_selectionBounds = null` clears that become no-ops or narrow to selection-only), and `bee-pane.ts` (two props may be renamed).

The test surface is concentrated in three test files: `url-state.test.ts` (the SEL-06 describe block, ~12 tests, all need updating from `sel=` to `bbox=` terminology), `bee-atlas.test.ts` (the SEL-06+SEL-07 describe block, ~15 tests, several assert the OLD coupling that must be updated), and `bee-pane.test.ts` (the NEAR-01/D-04/D-05 describe block, ~10 tests, mostly about prop names). The 153 regression bar is 792 passing tests.

**Primary recommendation:** Migrate in three sequential waves — (1) `filter.ts` and `url-state.ts` (type model + URL contract, no bee-atlas.ts changes yet), (2) `bee-atlas.ts` (the big transition, methodically replacing every `_selectionBounds` site), (3) update tests to match the new model. `npm test` must stay green at the end of each wave.

---

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| `FilterState` bounds field | filter.ts (data model) | bee-atlas.ts (owner) | Filter domain logic lives in filter.ts; bee-atlas.ts holds the `@state` instance |
| `isFilterActive` bounds check | filter.ts | — | Pure function over FilterState; all callers in bee-atlas.ts and bee-pane.ts read it |
| Bounds SQL clause | filter.ts (`buildFilterSQL`) | — | The `boundsClause` construction already exists inside `queryVisibleGeoJSON` and `queryListPage`; moves from a separate arg to reading `f.bounds` |
| URL `bbox=` write | url-state.ts (`buildParams`) | — | Pure URL serialization; bounds is now a filter param, not a selection param |
| Legacy `sel=` read | url-state.ts (`parseParams`) | — | Backward-compat shim; reads old sel= and populates `result.filter.bounds` |
| `SelectionState` bounds variant (removal) | url-state.ts | — | `{ type: 'bounds' }` is removed from the union; only `ids` and `cluster` remain |
| Bounds state field | bee-atlas.ts (`_filterState.bounds`) | — | Folds from private `_selectionBounds` into the existing `_filterState` object |
| `_applyBoundsFilter` (renamed method) | bee-atlas.ts | — | Still the single shared entry point for shift-drag + near-me; now writes to `_filterState.bounds` instead of `_selectionBounds` |
| `_onMapClickEmpty` (D-06 behavior) | bee-atlas.ts | — | Clears record selection only; leaves `_filterState.bounds` untouched |
| Pane props for bounds state | bee-pane.ts | bee-atlas.ts | bee-pane receives new/renamed props from bee-atlas; bee-atlas passes from `_filterState` |
| `near-me-cleared` event path | bee-pane.ts → bee-atlas.ts | — | Retained as-is; handler in bee-atlas.ts updates `_filterState` instead of `_selectionBounds` |

---

## Standard Stack

No new packages. This is a pure refactor of existing TypeScript within the project's established Lit + Vitest stack.

| Existing Library | Version | Role |
|------------------|---------|------|
| Lit | ^3.x | `@state()` / `@property()` reactivity — no changes to usage pattern |
| Vitest | ^4.1.8 | Test runner — `npm test` = `vitest run` |
| TypeScript | in project | Static type checking — `tsc --noEmit` run by `npm run build` |

---

## Package Legitimacy Audit

Not applicable — no new packages are installed in this phase.

---

## Touchpoint Inventory

This is the primary deliverable of Research Question 1.

### filter.ts

| Line(s) | Symbol | What Changes |
|---------|--------|--------------|
| 13–25 | `FilterState` interface | Add `bounds: { west: number; south: number; east: number; north: number } | null` field |
| 233–244 | `isFilterActive(f)` | Add `|| f.bounds !== null` to the return expression |
| 251–323 | `buildFilterSQL(f)` | Add a `bounds` clause branch mirroring the existing inline `boundsClause` construction in `queryVisibleGeoJSON`; move the SQL clause generation here so all consumers benefit automatically |
| 326–328 | `queryVisibleGeoJSON(f, selectionBounds = null)` | Remove the `selectionBounds` parameter; read `f.bounds` instead; the guard `if (!isFilterActive(f) && selectionBounds === null)` becomes simply `if (!isFilterActive(f))` — since `isFilterActive` now includes bounds |
| 340–344 | `boundsClause` construction inside `queryVisibleGeoJSON` | Remove (moved to `buildFilterSQL`) |
| 396–404 | `queryListPage(f, ..., selectionBounds = null)` | Remove the `selectionBounds` parameter; read `f.bounds` instead |
| 419–425 | `boundsClause` construction inside `queryListPage` | Remove (moved to `buildFilterSQL`) |

**Key detail:** The `boundsClause` in `buildFilterSQL` must still AND-compose with `occurrenceWhere`, as it always has — it just moves from a call-site-specific addition to a standard filter clause. The comment "Selection constraint: IDs (from cluster click) OR bounds (from rectangle draw)" in `queryListPage` needs updating: bounds is now a filter, not a selection.

### url-state.ts

| Line(s) | Symbol | What Changes |
|---------|--------|--------------|
| 27–30 | `SelectionState` union type | Remove `{ type: 'bounds'; west...; south...; east...; north... }` variant. Remaining variants: `{ type: 'ids' }`, `{ type: 'cluster' }` only |
| 43–47 | `AppState.filter` | `AppState.filter: FilterState` now carries bounds via the new field — no change to `AppState` structure itself, but the type change in `FilterState` propagates |
| 60–114 | `buildParams(view, filter, selection, ui)` | (a) Add: `if (filter.bounds !== null) params.set('bbox', [filter.bounds.west.toFixed(4), ...].join(','))`. (b) Remove: the `else if (selection.type === 'bounds')` branch that wrote `sel=` (lines 83–90). The `sel=` key is never written from `buildParams` again |
| 116–278 | `parseParams(search)` | (a) Add reader for `bbox=` param — parse into the `result.filter` object's `bounds` field (same 4-value parsing + range/finite validation as the current `sel=` reader). (b) Retain `sel=` reader (lines 231–248) but have it populate `result.filter.bounds` instead of `result.selection = { type: 'bounds' }`. (c) Update `hasFilter` predicate (line 188–191) to include `boundsFromBbox !== null || boundsFromSel !== null`. (d) Remove `result.selection = { type: 'bounds' ... }` assignment. The `sel=` reader becomes a silent migration: it reads the old format and writes the same `result.filter.bounds` that `bbox=` writes |

**Coexistence confirmation:** The `o=` reader (lines 210–229) is unchanged. `bbox=` and `o=` (ids/cluster) are now orthogonal URL params that may both be present simultaneously.

### bee-atlas.ts

Line numbers are from the current file (1565 lines total).

| Line(s) | Symbol | What Changes |
|---------|--------|--------------|
| 82–94 | `_filterState` initial value | Add `bounds: null` field |
| 122 | `@state() private _selectionBounds` | Remove this field entirely |
| 164 | `_selectionDrawnGeneration` field | Keep — still used to guard against stale `selection-drawn` events, even though bounds is now a filter |
| 189–193 | `get intendedFilterActive()` | Remove `|| this._selectionBounds !== null` — now covered automatically by `isFilterActive(this._filterState)` since bounds is in `FilterState` |
| 197–201 | `get _selectionBoundsLabel()` | Rename to `get _boundsFilterLabel()`; read from `this._filterState.bounds` instead of `this._selectionBounds` |
| 455–456 | bee-pane props in template | Update to pass `this._filterState.bounds !== null` and `this._boundsFilterLabel` (or rename props if bee-pane props are renamed) |
| 512–536 | `firstUpdated` — `_filterState` restore | Add `bounds: initFilter?.bounds ?? null` in the spread. Update `isFilterActive(this._filterState)` check on line 543 — now naturally true when bounds is present (automatic) |
| 548–558 | `firstUpdated` — selection restore block | Remove the `initSel?.type === 'bounds'` branch (lines 555–558) entirely. `bounds` is now parsed into `result.filter.bounds` by `parseParams`, so it arrives via `initFilter` not `initSel`. The `_paneState = 'list'` forced here is also removed (D-04) |
| 569–575 | `buildParams` call in `firstUpdated` URL write | Pass `initSel ?? { type: 'ids' as const, ids: [] }` — no longer needs a bounds branch since `buildParams` reads bounds from `filter.bounds` |
| 636 | `_runFilterQuery` | Change `queryVisibleGeoJSON(this._filterState, this._selectionBounds)` to `queryVisibleGeoJSON(this._filterState)` (arg removed) |
| 897 | `_runListQuery` — `hasSelection` | Remove `|| this._selectionBounds !== null` from the `hasSelection` computation. Selection count should only reflect per-record selection (ids + cluster); bounds is a filter, not a "selection" for display purposes |
| 903 | `_runListQuery` — `queryListPage` call | Remove `this._selectionBounds ?? null` as last arg |
| 920–931 | `_buildCurrentParams()` | Replace the ternary that writes `{ type: 'bounds', ...this._selectionBounds }` when `_selectionBounds && _paneState === 'list'`. Now: `buildParams` will write `bbox=` automatically from `filter.bounds`; the selection arg only handles ids/cluster: `this._selectedCluster ? { type: 'cluster', ... } : { type: 'ids', ids: this._selectedOccIds ?? [] }` |
| 1080 | `_onNearMeCleared` | Change `this._selectionBounds = null` to `this._filterState = { ...this._filterState, bounds: null }`. Keep the `_runFilterQuery()` / `_runTableQuery()` / `_replaceUrlState()` calls. Remove the `_paneState = 'collapsed'` force (D-04: bounds clearing no longer forces pane state) — or leave it only if user explicitly closes the pane via a non-filter mechanism (discuss: bounds cleared via near-me-cleared currently collapses pane; D-04 says bounds change doesn't touch pane — applies to applying bounds, but clearing might be a separate UX question. CONTEXT.md is silent on clear side-effects. Safest: follow D-04 literally, don't touch pane on clear) |
| 1108–1201 | `_onPopState` | (a) `_filterState` restore (lines 1122–1134): add `bounds: parsed.filter?.bounds ?? null`. (b) Selection restore (lines 1154–1171): remove the `parsedSel?.type === 'bounds'` branch (lines 1163–1165). (c) `hasSelection` computation (lines 1175–1178): remove `|| parsedSel?.type === 'bounds'`. (d) `isFilterActive` check (line 1192): now automatically includes bounds — no manual OR needed |
| 1217 | `_onOccurrenceClick` | Remove `this._selectionBounds = null` — D-05: record selection no longer clears bounds |
| 1280 | `_onRegionClick` else branch | Remove `this._selectionBounds = null` — D-05 |
| 1304 | `_onPlaceSelected` else branch | Remove `this._selectionBounds = null` — D-05 |
| 1313–1320 | `_openSidebarForFilter` | Remove `this._selectionBounds = null` — D-05 |
| 1325–1336 | `_applyBoundsSelection` | Rename to `_applyBoundsFilter`. Remove `this._selectedOccIds = null` and `this._selectedCluster = null` (D-05). Remove `this._paneState = 'list'` (D-04). Change `this._selectionBounds = bounds` to `this._filterState = { ...this._filterState, bounds }`. Increment `_selectionDrawnGeneration` (keep — guards stale selection-drawn events). Keep `_runFilterQuery()`, `_runListQuery()`, `_runTableQuery()`, `_replaceUrlState()` |
| 1338–1340 | `_onSelectionDrawn` | Update call from `_applyBoundsSelection` to `_applyBoundsFilter` |
| 1342–1367 | `_onMapClickEmpty` | D-06: remove `this._selectionBounds = null` from BOTH branches (lines 1352, 1363). Bounds is now a filter and is not cleared by clicking empty map. Only `_selectedOccIds = null` and `_selectedCluster = null` remain for the non-boundary-mode branch |
| 1369–1408 | `_onFilterChanged` | `_filterState` is built from `e.detail` (FilterChangedEvent). **FilterChangedEvent currently does not carry `bounds`** — this is the correct behavior: `bee-pane` emits `filter-changed` for taxon/year/counties/etc. only; bounds is applied via `_applyBoundsFilter` (shift-drag / near-me), not through `filter-changed`. Therefore, `_filterState.bounds` must be preserved through `_onFilterChanged`: `this._filterState = { ...this._filterState, bounds: this._filterState.bounds, taxonId: detail.taxonId, ... }` (retain existing bounds). Remove the `this._selectionBounds = null` line (line 1399, D-05). Note the current code resets bounds when any filter changes — that coupling is removed here |
| 1435–1441 | `_onClearSelection` | Remove `this._selectionBounds = null` (line 1437) — D-05: clear-selection clears per-record only, not bounds |
| 1485–1491 | `_onPaneCollapse` | Remove `this._selectionBounds = null` (line 1488) — D-05/D-06: collapsing pane does not clear bounds filter. Note: this changes behavior — currently collapsing pane clears bounds. Under D-07, bounds is only cleared via the 'where' input. The planner may want a UAT note about this behavior change |

**Line count of `_selectionBounds` uses (for planner confidence check):** 20 distinct assignments of `_selectionBounds = null` or `_selectionBounds = bounds` across bee-atlas.ts. Each must be evaluated against D-05/D-06/D-07:
- 12 sites that null `_selectionBounds` in response to record-selection events (occurrence click, cluster click, pane collapse, clear-selection) or filter events → REMOVE (D-05)
- 2 sites that null `_selectionBounds` in `_onMapClickEmpty` → REMOVE (D-06)
- 1 site that nulls `_selectionBounds` in `_onNearMeCleared` → CONVERT to `_filterState.bounds = null`
- 1 site that nulls `_selectionBounds` in `firstUpdated` bounds restore branch → REMOVE (branch itself is removed; restore now flows through `initFilter.bounds`)
- 3 sites that null in popstate bounds branch → REMOVE (branch removed; restore flows through filter)
- 1 site that sets `_selectionBounds = bounds` in `_applyBoundsSelection` → CONVERT to `_filterState.bounds = bounds`

### bee-pane.ts

| Line(s) | Symbol | What Changes |
|---------|--------|--------------|
| 88 | `selectionBoundsActive: boolean` @property | May be renamed (e.g. `boundsFilterActive`) — or kept as-is if the planner prefers minimal diff to bee-pane.ts. The existing name is somewhat accurate even under the new model |
| 90 | `selectionBoundsLabel: string` @property | May be renamed (e.g. `boundsFilterLabel`) |
| 1051 | `.value=` template binding | Reads `this.selectionBoundsActive` / `this.selectionBoundsLabel` — update names if renamed |
| 1052 | `?readonly=` binding | Same |
| 1063–1066 | Near-me-cleared button | Unchanged — `near-me-cleared` event name stays per D-07 |

**Recommendation (Claude's Discretion):** Rename the props to `boundsFilterActive` / `boundsFilterLabel` for semantic clarity, since they now represent a filter state, not a selection state. The test file checks for `selectionBoundsActive` and `selectionBoundsLabel` by name, so tests must update in tandem.

---

## FilterState Shape Change (Research Question 2)

### New field

```typescript
// In FilterState interface (filter.ts ~line 25):
bounds: { west: number; south: number; east: number; north: number } | null;
```

Recommended name: `bounds` — reads cleanly alongside `selectedCounties`, `selectedEcoregions`, `selectedPlace`, `months`. Short, unambiguous.

### Every site that constructs or spreads FilterState

All must add `bounds: null` (or preserve existing bounds):

| File | Location | Required change |
|------|----------|-----------------|
| `bee-atlas.ts:82–94` | Initial `_filterState` literal | Add `bounds: null` |
| `bee-atlas.ts:512–536` | `firstUpdated` `_filterState` restore from URL | Add `bounds: initFilter?.bounds ?? null` |
| `bee-atlas.ts:1122–1134` | `_onPopState` `_filterState` restore | Add `bounds: parsed.filter?.bounds ?? null` |
| `bee-atlas.ts:1369–1384` | `_onFilterChanged` new `_filterState` | Add `bounds: this._filterState.bounds` (PRESERVE — filter-changed must not reset bounds per D-05) |
| `bee-atlas.ts:1241–1249` | `_onRegionClick` single-select spreads | `{ ...this._filterState, selectedCounties: ... }` — automatically inherits `bounds` when spread |
| `bee-atlas.ts:1265–1268` | `_onRegionClick` multi-select | Same — spread inherits bounds |
| `bee-atlas.ts:1294–1297` | `_onPlaceSelected` | Same — spread inherits bounds |
| `bee-atlas.ts:1554–1556` | `_onBoundaryModeChanged` | Same |
| `url-state.ts:193–206` | `result.filter = { ... }` in `parseParams` | Add `bounds: parsedBbox ?? parsedSel ?? null` |
| `filter.test.ts` | `emptyFilter()` helper | Add `bounds: null` |
| `url-state.test.ts` | `emptyFilter()` helper | Add `bounds: null` |
| `bee-atlas.test.ts` | Any inline FilterState fixtures | Add `bounds: null` |

**Note on FilterChangedEvent:** The `FilterChangedEvent` interface (filter.ts:382–394) currently does NOT include `bounds`, and should NOT — bounds transitions go through `_applyBoundsFilter`, not through the filter panel event. This is an important invariant to preserve.

### isFilterActive change

Add one clause to the return expression (filter.ts:233–244):

```
return f.taxonId !== null
  || f.yearFrom !== null
  || f.yearTo !== null
  || f.months.size > 0
  || f.selectedCounties.size > 0
  || f.selectedEcoregions.size > 0
  || f.selectedCollectors.length > 0
  || f.elevMin !== null
  || f.elevMax !== null
  || f.selectedPlace !== null
  || f.bounds !== null;   // NEW
```

Once this is done, the following side-effects in `bee-atlas.ts` become automatic:
- `intendedFilterActive` getter: the explicit `|| this._selectionBounds !== null` is removed; `isFilterActive(this._filterState)` covers it
- `_onDataLoaded` filter guard (line 1525): `isFilterActive(this._filterState) || this._selectionBounds !== null` → `isFilterActive(this._filterState)` only
- `firstUpdated` filter query guard (line 543): same simplification
- `_onPopState` filter query guard (line 1192): same simplification

---

## URL Migration Mechanics (Research Question 3)

### buildParams — output side

Current code (url-state.ts:83–90):
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

After:
- Remove this `else if` branch from the `selection.type` cascade entirely.
- Add above the selection handling:
```typescript
if (filter.bounds !== null) {
  params.set('bbox', [
    filter.bounds.west.toFixed(4),
    filter.bounds.south.toFixed(4),
    filter.bounds.east.toFixed(4),
    filter.bounds.north.toFixed(4),
  ].join(','));
}
```
- `sel=` is never written again.

### parseParams — input side

Add a `bbox=` reader alongside the existing `sel=` reader. Both populate the same `boundsResult` local variable; `bbox=` takes precedence if both are present (edge case for manually crafted URLs):

```typescript
// New: bbox= reader (canonical post-156 format)
let boundsResult: { west: number; south: number; east: number; north: number } | null = null;
const bboxRaw = p.get('bbox') ?? '';
if (bboxRaw) { /* same 4-part parse + range validation as current sel= reader */ }

// Legacy: sel= reader (backward compat, maps to same filter field)
const selRaw = p.get('sel') ?? '';
if (selRaw && boundsResult === null) {
  /* same parse as current sel= reader; populates boundsResult */
}
```

Remove the current assignment `result.selection = { type: 'bounds', ... }` from the sel= reader. Instead set `boundsResult` and later:

```typescript
// hasFilter must include bounds
const hasFilter = resolvedTaxonId !== null || yearFrom !== null || ... || boundsResult !== null;
if (hasFilter) {
  result.filter = {
    taxonId: resolvedTaxonId,
    ...,
    bounds: boundsResult,
  };
}
```

**SelectionState independence confirmed:** The `o=` parser block (lines 210–229) is entirely independent of the `sel=` / `bbox=` paths. No entanglement. After this change, `AppState.selection` only ever carries `ids` or `cluster`.

**Legacy back-compat path:** An existing `?sel=-122.3456,47.1234,-122.1234,47.5678` link:
1. `parseParams` reads `sel=` → sets `boundsResult` → sets `result.filter.bounds`
2. `bee-atlas.ts` applies it as `_filterState.bounds`
3. On next URL write (`_replaceUrlState`), `buildParams` reads `filter.bounds` → writes `bbox=` → URL now shows `bbox=`
4. The `sel=` param is dropped from the URL on the first write. Old links work; they silently migrate to `bbox=` on interaction.

---

## Coexistence State Combinations (Research Question 4)

### The four state combinations

| Combination | `_filterState.bounds` | `_selectedOccIds` / `_selectedCluster` | Expected behavior |
|-------------|----------------------|-----------------------------------------|------------------|
| Neither | null | null / null | Normal unfiltered map |
| Bounds only | set | null / null | Map + list + table show only in-bounds records; no record detail pane |
| Selection only | null | set | Record detail visible in list; no spatial filter |
| Both (D-05) | set | set | Map + list filtered to bounds AND-composed; selected records highlighted within that filtered set |

### Current mutual-exclusivity code to remove

1. `_applyBoundsSelection` (bee-atlas.ts:1328–1329): clears `_selectedOccIds` and `_selectedCluster` → REMOVE (D-05 allows coexistence)
2. `_onOccurrenceClick` (bee-atlas.ts:1217): `this._selectionBounds = null` → REMOVE (D-05)
3. `_onFilterChanged` (bee-atlas.ts:1399): `this._selectionBounds = null` → REMOVE (D-05; preserve bounds through filter changes)
4. `_onClearSelection` (bee-atlas.ts:1437): `this._selectionBounds = null` → REMOVE (D-05)
5. `_openSidebarForFilter` (bee-atlas.ts:1316): `this._selectionBounds = null` → REMOVE (D-05)

### Style-cache bypass invariant (CLAUDE.md)

The invariant: "bypass cache when `filterState` is active OR `selectedOccIds` is non-empty."

With bounds in `FilterState`, `isFilterActive(this._filterState)` is `true` whenever bounds is set. The bypass condition was previously `isFilterActive(this._filterState) || this._selectionBounds !== null`. After the refactor it is simply `isFilterActive(this._filterState) || (this._selectedOccIds?.length ?? 0) > 0`. The bounds case is automatically covered by the filter branch. Verify the style cache bypass location in bee-map.ts does not reference `_selectionBounds` directly — it receives `intendedFilterActive` as a property, which is computed in bee-atlas.ts; that getter's change is the only fix needed.

### _filterGuard race guard (CLAUDE.md)

`makeStaleGuard` in `stale-guard.ts` handles the generation counter internally — it is the replacement for the old `_filterQueryGeneration` manual counter. The `_filterGuard` is already in place. Calling `_runFilterQuery()` in `_applyBoundsFilter` (as in `_applyBoundsSelection` today) correctly increments the guard's internal generation counter. No additional changes to the race guard needed.

### `_selectionDrawnGeneration` counter

This non-reactive field is still used for `_onSelectionDrawn` guard purposes (not the same as `_filterGuard`). It should be retained even though bounds moves to a filter — the shift-drag gesture still fires selection-drawn events and the generation guard still prevents stale draws.

### `hasSelection` in `_runListQuery` (bee-atlas.ts:897)

Currently: `const hasSelection = selEcdysisIds.length > 0 || selInatIds.length > 0 || selInatObsIds.length > 0 || selChecklistIds.length > 0 || this._selectionBounds !== null;`

After: Remove `|| this._selectionBounds !== null`. The `selectionCount` returned from `_runListQuery` drives the "N occurrences selected" banner in `bee-pane`. Under the new model, bounds is a filter (changes what's in the list), not a "selection" (which implies pinned records). The banner should reflect only per-record selection. This is a meaningful UX change: with bounds active and no record selection, `selectionCount` will be `null`, so the selection banner won't appear. The list will still show only in-bounds records (because `queryListPage` applies `f.bounds` via `buildFilterSQL`).

### `_buildCurrentParams` — URL composition

Current logic (bee-atlas.ts:920–931) selects the selection variant based on precedence: `_selectionBounds` wins over cluster over ids. After the refactor, bounds is no longer in `SelectionState` at all, so `_buildCurrentParams` simplifies to:

```typescript
return buildParams(
  this._currentView,
  this._filterState,
  this._selectedCluster
    ? { type: 'cluster' as const, ...this._selectedCluster }
    : { type: 'ids' as const, ids: this._selectedOccIds ?? [] },
  { boundaryMode: this._boundaryMode, paneState: this._paneState, hiddenSources: this._hiddenSources }
);
```

`buildParams` writes `bbox=` from `filter.bounds` automatically. The old `_selectionBounds && this._paneState === 'list'` guard on URL writing is removed — bounds is always written if set, regardless of pane state.

---

## Test Surface (Research Question 5)

### Tests that assert the OLD coupling — must be updated

**url-state.test.ts — `describe('bounds selection (SEL-06)')`** (~12 tests, lines 445–516):

All tests in this block test the old `sel=` serialization path via `SelectionState { type: 'bounds' }`. After the refactor:
- `type: 'bounds'` no longer exists in `SelectionState`
- `sel=` is no longer written by `buildParams`
- Bounds round-trips via `filter.bounds` + `bbox=`

Required updates:
- Rename the describe block (e.g. `describe('bounds filter (D-01/D-02/D-03)')`)
- Replace `selection: SelectionState = { type: 'bounds', ... }` with `filter: FilterState = { ...emptyFilter(), bounds: {...} }`
- Assert `params.get('bbox')` (not `sel`)
- Assert `result.filter?.bounds` (not `result.selection`)
- Add new tests: `bbox=` read, `sel=` legacy read into `filter.bounds`, both present (bbox takes precedence)
- Add test: `parseParams('sel=...')` sets `result.filter.bounds` (not `result.selection`)
- Add test: `parseParams('bbox=...')` sets `result.filter.bounds`
- Add test: `buildParams` with `filter.bounds` set emits `bbox=` and no `sel=`
- Add test: `buildParams` with `filter.bounds` null emits neither `bbox=` nor `sel=`

**bee-atlas.test.ts — `describe('SEL-06 + SEL-07 wiring')`** (lines 386–508):

Tests that will FAIL after refactor and must be updated:

| Test | Current assertion | Required update |
|------|------------------|-----------------|
| `SEL-06: _pushUrlState gives _selectionBounds precedence` | Checks for `this._selectionBounds && this._paneState === 'list'` in source | Remove — that code is deleted |
| `SEL-06: _pushUrlState emits bounds via buildParams` | Checks for `type: 'bounds' as const` | Remove or update — bounds now in filter |
| `SEL-06: firstUpdated routes bounds selection to _selectionBounds state` | Checks `initSel?.type === 'bounds'` and assignment to `_selectionBounds` | Remove — firstUpdated no longer has a bounds-selection restore branch |
| `SEL-06: _onPopState routes bounds selection to _selectionBounds state` | Checks `parsedSel?.type === 'bounds'` | Remove — popstate no longer has a bounds-selection branch |
| `NEAR-01: _onDataLoaded runs filter query for _selectionBounds` | Checks `|| this._selectionBounds !== null` in _onDataLoaded | Update — now just `isFilterActive(...)` is sufficient |
| `NEAR-01: intendedFilterActive treats bounds as filter` | Checks `this._selectionBounds !== null` in getter | Update — now covered by `isFilterActive(this._filterState)` |
| `SEL-07: _onPaneCollapse clears _selectionBounds` | Checks `_selectionBounds = null` in _onPaneCollapse | Remove — D-05: pane collapse no longer clears bounds |
| `SEL-07: _onMapClickEmpty clears _selectionBounds in both branches` | Checks `_selectionBounds = null` count >= 2 | Remove — D-06: empty click no longer clears bounds |
| `SEL-07: _onFilterChanged clears _selectionBounds` | Checks `_selectionBounds = null` | Remove — D-05: filter change no longer clears bounds |
| `SEL-07: _onPopState clears _selectionBounds in 3 branches` | Checks `_selectionBounds = null` count >= 3 | Remove — branches removed |
| `SEL-07: _onOccurrenceClick clears _selectionBounds` | Checks `_selectionBounds = null` | Remove — D-05 |
| `SEL-07: _applyBoundsSelection sets _selectionBounds` | Checks `this._selectionBounds = bounds` and `_runListQuery` | Update: check `this._filterState = { ...this._filterState, bounds }` and drop `_selectedOccIds = null` assertions |
| `SEL-07: _onRegionClick clears _selectionBounds` | Checks `_selectionBounds = null` | Remove — D-05 |
| `SEL-07: _onPlaceSelected clears _selectionBounds` | Checks `_selectionBounds = null` | Remove — D-05 |
| `SEL-07: _openSidebarForFilter clears _selectionBounds` | Checks `_selectionBounds = null` | Remove — D-05 |
| `SM-01: _onPaneCollapse clears three selection fields` (line 632–642) | Checks `this._selectionBounds = null` | Remove the bounds assertion |

New tests to add in bee-atlas.test.ts:
- `_filterState` initial literal includes `bounds: null`
- `_applyBoundsFilter` writes to `_filterState.bounds` (not to `_selectionBounds`)
- `_applyBoundsFilter` does NOT null out `_selectedOccIds` (D-05)
- `_applyBoundsFilter` does NOT set `_paneState = 'list'` (D-04)
- `_onMapClickEmpty` does NOT assign to `_filterState.bounds` / does not clear bounds (D-06)
- `_onFilterChanged` preserves `_filterState.bounds` (does not reset it)
- `intendedFilterActive` is true when `_filterState.bounds` is set (via `isFilterActive`)
- `_onDataLoaded` runs filter query when `isFilterActive(_filterState)` (which includes bounds)

**bee-pane.test.ts — `describe('NEAR-01/D-04/D-05')`** (lines 299–357):

Most tests in this block are about structural assertions (does bee-pane declare these props, render the button, emit the event). They need prop name updates if props are renamed:
- `selectionBoundsActive` → `boundsFilterActive` (if renamed)
- `selectionBoundsLabel` → `boundsFilterLabel` (if renamed)
- The functional behavior tests (near-me-cleared event, readonly input, no standalone chip) are unchanged

**Tests that PASS after refactor without changes (regression preservation):**

| Test | Status | Why |
|------|--------|-----|
| `filter.test.ts` — all `isFilterActive` tests | Green after adding bounds field to `emptyFilter()` | Existing behavior unchanged; new `bounds: null` defaults to false |
| `filter.test.ts` — `isFilterActive: emptyFilter returns false` | Green | `bounds: null` contributes false |
| `bee-atlas.test.ts` — `boundsFromLocation` pure function tests (NEAR block) | Green — no change to that function | Pure math function unaffected |
| `bee-atlas.test.ts` — near-me box ≡ shift-drag box URL equivalence test (line 1202) | Needs update: asserts `sel=` param, must assert `bbox=` param instead | The equivalence itself is preserved (both go through `_applyBoundsFilter`); only the URL param name changes |
| `bee-atlas.test.ts` — near-me `sel=` round-trip test (line 1228) | Needs update: legacy round-trip now via `parseParams` → `filter.bounds` path | Test the backward-compat path instead |
| `url-state.test.ts` — `combined params: bounds + filter coexist` (line 506) | Needs update | Was testing `selection.type === 'bounds'`; now tests `filter.bounds` |

**Test infrastructure note (from memory):** Tests that `appendChild('<bee-atlas>')` must mock `bee-map.ts` (mapbox mock is incomplete). The existing mocks in `bee-atlas.test.ts` cover this. New tests should follow the same pattern (source-text grep style, not DOM mount) where possible, matching the existing SEL-06/SEL-07 describe style.

### Baseline

Phase 153 shipped: **792 tests passing**. This refactor must stay green.

---

## Common Pitfalls

### Pitfall 1: `_onFilterChanged` resetting bounds
**What goes wrong:** Developer adds `bounds: null` to the `_filterState` spread in `_onFilterChanged` (following the pattern of `_selectedOccIds = null` in the same method), inadvertently clearing the bounds filter whenever any other filter changes.
**Why it happens:** `FilterChangedEvent` doesn't carry `bounds`, so when rebuilding `_filterState` from the event detail, it looks like `bounds` should be cleared.
**How to avoid:** Explicitly preserve existing bounds: `bounds: this._filterState.bounds` in the spread. The filter panel is not the source of truth for bounds; `_applyBoundsFilter` and `_onNearMeCleared` are the only two mutation points.
**Warning signs:** Test case: apply a bounds filter, then change taxon — bounds disappears.

### Pitfall 2: `hasFilter` in parseParams not covering bounds
**What goes wrong:** `parseParams` reads `bbox=` into `boundsResult` but the `hasFilter` predicate doesn't include `boundsResult !== null`, so `result.filter` is undefined even when bounds are present.
**Why it happens:** It's easy to forget to update the `hasFilter` predicate (url-state.ts:188–191) that gates the `result.filter` object creation.
**How to avoid:** Add `|| boundsResult !== null` to the predicate. Verify with a test: `parseParams('bbox=-122,47,-121,48')` should return `result.filter.bounds` set.

### Pitfall 3: `SelectionState { type: 'bounds' }` remnants in tests
**What goes wrong:** Tests continue to use `SelectionState = { type: 'bounds', ... }` which TypeScript now rejects.
**Why it happens:** The `SelectionState` type is imported in multiple test files; removing the `bounds` variant from the union breaks all such usages.
**How to avoid:** Search all test files for `type: 'bounds'` as a string; update each to use `filter.bounds` instead.

### Pitfall 4: `buildParams` signature still expects `SelectionState` with `bounds`
**What goes wrong:** `buildParams` is called with a `{ type: 'bounds' }` selection object from old call sites, which TypeScript accepts until the type is narrowed.
**Why it happens:** `_buildCurrentParams` in bee-atlas.ts still has the old ternary.
**How to avoid:** Update `_buildCurrentParams` first, before TypeScript catches usages. The TypeScript compiler (`tsc --noEmit`) will flag any remaining `type: 'bounds'` constructions once the union type is narrowed.

### Pitfall 5: `_paneState` behavior regression at bounds-clear time
**What goes wrong:** `_onNearMeCleared` previously set `_paneState = 'collapsed'`. Removing that line (D-04) means the pane stays open after clearing bounds. This may or may not be desirable — CONTEXT.md is silent on this sub-case.
**Why it happens:** D-04 says "bounds change does NOT touch `_paneState`" — this applies symmetrically to both applying and clearing bounds.
**How to avoid:** Confirm the intended behavior during plan review. The safest interpretation: bounds clear also does not touch pane state. If the user had the list open for a non-bounds reason, it stays open. If the list was opened *only because of bounds*, it stays open (the user can close it manually). UAT should verify.

### Pitfall 6: `_buildCurrentParams` pane-state gate removed
**What goes wrong:** Old code: `this._selectionBounds && this._paneState === 'list'` — bounds was only serialized to URL when the pane was in list mode. New code: bounds is always written to URL when set (it's a filter). This is the correct behavior per D-02, but it changes what gets written for some edge states.
**Why it happens:** The old gate existed because bounds was coupled to pane state; the new model decouples them.
**Impact:** Minor — a user with bounds active and pane collapsed will now have `bbox=` in the URL, which is correct and desired.

---

## Code Examples

### New `FilterState` interface (filter.ts)

```typescript
// [ASSUMED] — target state after refactor; not yet in codebase
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
  selectedPlace: string | null;
  bounds: { west: number; south: number; east: number; north: number } | null;
}
```

### New `buildFilterSQL` with bounds clause (filter.ts)

```typescript
// [ASSUMED] — moves boundsClause into buildFilterSQL
if (f.bounds !== null) {
  const { west, south, east, north } = f.bounds;
  occurrenceClauses.push(
    `lat BETWEEN ${south} AND ${north} AND lon BETWEEN ${west} AND ${east}`
  );
}
```

### `_applyBoundsFilter` replacement (bee-atlas.ts)

```typescript
// [ASSUMED] — renamed and simplified per D-04 and D-05
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
```

### `buildParams` bounds section (url-state.ts)

```typescript
// [ASSUMED] — bbox= written from filter, not from selection
if (filter.bounds !== null) {
  params.set('bbox', [
    filter.bounds.west.toFixed(4),
    filter.bounds.south.toFixed(4),
    filter.bounds.east.toFixed(4),
    filter.bounds.north.toFixed(4),
  ].join(','));
}
// The old `else if (selection.type === 'bounds')` branch is removed.
```

---

## Backward-Compat Verification (Research Question 6)

### Contract: existing `sel=`-bounds shared link still restores correctly

Test path (manual + automated):
1. Navigate to a URL with `sel=-122.3456,47.1234,-122.1234,47.5678` (no `bbox=`)
2. `parseParams` reads `sel=` → `boundsResult` → `result.filter.bounds` is set
3. `firstUpdated` applies `initFilter.bounds` to `_filterState`
4. `isFilterActive(_filterState)` returns `true` → `_runFilterQuery()` runs
5. Map shows only in-bounds occurrences; list shows filtered records
6. On any subsequent URL write (`_replaceUrlState`), `buildParams` writes `bbox=`; `sel=` is dropped
7. Result: old link works, silently migrates to new format on first interaction

Regression tests to add in `url-state.test.ts`:
- `parseParams('sel=-122.3456,47.1234,-122.1234,47.5678')` sets `result.filter.bounds` (not `result.selection`)
- `parseParams('sel=...')` does NOT set `result.selection`
- `parseParams('bbox=...')` sets `result.filter.bounds`
- `parseParams('bbox=...')` with invalid (malformed) bbox: `result.filter` is undefined or `bounds` is null
- `parseParams('sel=...')` with malformed sel: `bounds` is null (validation rules unchanged from current sel= reader)

---

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Vitest ^4.1.8 |
| Config file | vitest.config.ts (inferred from package.json) |
| Quick run command | `npm test` |
| Full suite command | `npm test` (= `vitest run`) |

### Phase Requirements → Test Map

| Behavior | Test Type | Automated Command | Notes |
|----------|-----------|-------------------|-------|
| `FilterState.bounds` field exists | unit | `npm test filter.test.ts` | emptyFilter() must include bounds |
| `isFilterActive` returns true when bounds set | unit | `npm test filter.test.ts` | New test case |
| `buildFilterSQL` includes bounds clause | unit | `npm test filter.test.ts` | New test case |
| `buildParams` writes `bbox=` from `filter.bounds` | unit | `npm test url-state.test.ts` | Updated SEL-06 tests |
| `parseParams` reads `bbox=` into `filter.bounds` | unit | `npm test url-state.test.ts` | New test cases |
| `parseParams` reads legacy `sel=` into `filter.bounds` | unit | `npm test url-state.test.ts` | Backward-compat test |
| `parseParams` does NOT set `selection.type === 'bounds'` | unit | `npm test url-state.test.ts` | Guard test |
| `_filterState.bounds` initialized to null | structural | `npm test bee-atlas.test.ts` | Source-text grep |
| `_applyBoundsFilter` writes `_filterState.bounds` (not `_selectionBounds`) | structural | `npm test bee-atlas.test.ts` | Source-text grep |
| D-04: `_applyBoundsFilter` does not set `_paneState = 'list'` | structural | `npm test bee-atlas.test.ts` | Source-text grep |
| D-05: `_applyBoundsFilter` does not null `_selectedOccIds` | structural | `npm test bee-atlas.test.ts` | Source-text grep |
| D-06: `_onMapClickEmpty` does not assign to `filter.bounds` | structural | `npm test bee-atlas.test.ts` | Source-text grep |
| `intendedFilterActive` true when `_filterState.bounds` set | structural | `npm test bee-atlas.test.ts` | via `isFilterActive` |
| `bee-pane.ts` prop names updated | structural | `npm test bee-pane.test.ts` | If props renamed |
| `near-me-cleared` still dispatched from bee-pane | structural | `npm test bee-pane.test.ts` | Unchanged — regression guard |
| 792 total tests green | regression suite | `npm test` | Baseline from Phase 153 |

### Sampling Rate

- Per task commit: `npm test`
- Per wave merge: `npm test`
- Phase gate: Full suite green before `/gsd-verify-work`

### Wave 0 Gaps

No new test files need to be created. All gaps are updates to existing test files:
- [ ] `src/tests/url-state.test.ts` — update SEL-06 describe block; add bbox/sel-compat tests
- [ ] `src/tests/bee-atlas.test.ts` — update SEL-06+SEL-07 describe block; add D-04/D-05/D-06 assertions
- [ ] `src/tests/filter.test.ts` — update `emptyFilter()` helper; add `isFilterActive` bounds test
- [ ] `src/tests/bee-pane.test.ts` — update prop name assertions if props renamed

---

## Architecture Patterns

### System Architecture Diagram

```
shift-drag gesture         near-me gesture
(bee-map.ts selection-drawn)  (bee-pane.ts near-me-requested)
          |                        |
          v                        v
   bee-atlas._applyBoundsFilter()   [renamed from _applyBoundsSelection]
          |
          v
   _filterState.bounds = { west, south, east, north }
          |
          +---> _runFilterQuery() ---> queryVisibleGeoJSON(_filterState)
          |     [filter.ts: buildFilterSQL now includes bounds clause]
          |
          +---> _runListQuery()  ---> queryListPage(_filterState, ...)
          |     [selectionBounds arg removed; f.bounds drives clause]
          |
          +---> _runTableQuery() ---> queryTablePage(_filterState, ...)
          |     [unchanged; table page uses buildFilterSQL]
          |
          +---> _replaceUrlState() ---> buildParams(view, _filterState, selection, ui)
                [filter.bounds -> bbox=; selection unchanged: ids/cluster only]

near-me-cleared event
(bee-pane.ts near-me-cleared)
          |
          v
   bee-atlas._onNearMeCleared()
          |
   _filterState = { ..._filterState, bounds: null }
          |---> _runFilterQuery(), _runTableQuery(), _replaceUrlState()

Legacy URL: ?sel=west,south,east,north
          |
   parseParams() reads sel= -> boundsResult -> result.filter.bounds
          |
   bee-atlas firstUpdated: _filterState.bounds = initFilter.bounds
          |
   Next _replaceUrlState() -> bbox= written; sel= dropped
```

### Recommended Project Structure

No structural file changes. All edits are within existing files:
```
src/
├── filter.ts        — FilterState interface, isFilterActive, buildFilterSQL, queryVisibleGeoJSON, queryListPage
├── url-state.ts     — buildParams (bbox= write), parseParams (bbox= + sel= read → filter.bounds)
├── bee-atlas.ts     — _filterState (owns bounds), _applyBoundsFilter, all _selectionBounds removals
└── bee-pane.ts      — prop rename only (if decided)
```

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Bounds SQL clause | A new SQL generation path | Move the existing `boundsClause` from inside `queryVisibleGeoJSON`/`queryListPage` into `buildFilterSQL` | The clause already exists and is tested; consolidation, not reinvention |
| URL backward compat | A redirect or server-side migration | `parseParams` silent migration (read `sel=`, write `bbox=`) | Static hosting; no server; client-side migration is the only option |
| Race guard for filter queries | A manual generation counter | `makeStaleGuard` already in use via `_filterGuard` | Already handles stale discard correctly |

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `_selectionBounds` side field + `SelectionState { type: 'bounds' }` | `FilterState.bounds` first-class field | This phase (156) | Bounds participates in `isFilterActive`, `buildFilterSQL`, and `buildParams` automatically |
| `sel=` URL param for bounds | `bbox=` URL param; `sel=` is legacy-read only | This phase (156) | Old shared links still work; new links use `bbox=` |
| Bounds clears per-record selection | Bounds and selection coexist (AND-compose) | This phase (156) | D-05 — applying a spatial box no longer dismisses record selection |
| Bounds forces `_paneState = 'list'` | Bounds does not touch pane state | This phase (156) | D-04 — bounds behaves like every other filter |

---

## Open Questions (RESOLVED)

> **RESOLVED 2026-06-21 (plan-phase):** All three resolve the same way from the locked "bounds = filter, independent of selection AND of pane state" model, and are baked into Plan 03 as explicit acceptance criteria: (1) `_onNearMeCleared` must NOT touch `_paneState` (symmetric with D-04); (2) `_onClearSelection` clears per-record selection only, never `bounds` (D-05); (3) pane collapse must NOT clear `bounds` — only `near-me-cleared` clears it (D-07). Recommendations below were accepted as-is.

1. **`_onNearMeCleared` pane state — leave open or close?** — RESOLVED: do not touch `_paneState`.
   - What we know: D-04 says "bounds change does NOT touch `_paneState`". The current code in `_onNearMeCleared` sets `_paneState = 'collapsed'`.
   - What's unclear: Whether D-04 applies symmetrically to clearing bounds. CONTEXT.md only mentions the apply path.
   - Recommendation: Follow D-04 literally — removing `_paneState = 'collapsed'` from `_onNearMeCleared`. If the pane was open for unrelated reasons, it stays open. Note for UAT.

2. **`_onClearSelection` bounds behavior**
   - What we know: Currently clears `_selectionBounds`. D-05 says selection and bounds coexist. D-08 says no global filter reset.
   - What's unclear: Should "clear selection" (`pane-clear-selection` event) also clear bounds? D-05 implies no (it clears per-record selection only).
   - Recommendation: Remove `_selectionBounds = null` from `_onClearSelection` (line 1437) per D-05. Bounds is dismissed only via `near-me-cleared`.

3. **`_onPaneCollapse` bounds behavior**
   - What we know: Currently clears `_selectionBounds`. D-07 says bounds is cleared only via the 'where' input.
   - What's unclear: If user collapses pane, should bounds persist?
   - Recommendation: Yes, bounds persists. Collapsing the pane is a UI action, not a filter action. Remove `_selectionBounds = null` from `_onPaneCollapse`. This is a visible behavior change — note for UAT.

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `boundsClause` moving into `buildFilterSQL` is the cleanest consolidation (vs. keeping it in each query function) | Touchpoint Inventory / filter.ts | If kept separate, `queryTablePage` won't apply bounds — but `queryTablePage` currently doesn't take `selectionBounds`, so moving to `buildFilterSQL` is required for table to respect bounds |
| A2 | Prop rename from `selectionBoundsActive` → `boundsFilterActive` in bee-pane.ts | bee-pane.ts section | If kept as-is, tests pass without rename; the existing name is slightly misleading but functional |
| A3 | `near-me-cleared` event name stays unchanged (D-07 reuse) | Throughout | Safe assumption; CONTEXT.md explicitly says "reusing the Phase-153 `near-me-cleared` mechanism" |
| A4 | `_onNearMeCleared` should NOT collapse pane (per D-04 literal interpretation) | Open Questions #1 | If wrong, UX regression: user applies near-me bounds, list opens, clears bounds, list stays open unexpectedly |

---

## Sources

### Primary (HIGH confidence — direct source file reads)

- `src/filter.ts` — Full read; all `FilterState` fields, `isFilterActive`, `buildFilterSQL`, `queryVisibleGeoJSON` (line 326–367), `queryListPage` (line 396–456) confirmed
- `src/url-state.ts` — Full read; `SelectionState` type (line 27–30), `buildParams` sel= write (lines 79–90), `parseParams` sel= read (lines 231–248), `hasFilter` predicate (lines 188–191) confirmed
- `src/bee-atlas.ts` — Key sections read: `_filterState` initial value (lines 82–94), `_selectionBounds` field (line 122), `intendedFilterActive` getter (lines 189–193), `_selectionBoundsLabel` getter (lines 197–201), bee-pane template bindings (lines 455–456), `firstUpdated` restore (lines 493–576), `_runFilterQuery` (lines 635–641), `_runListQuery` (lines 883–916), `_buildCurrentParams` (lines 920–931), `_onPopState` (lines 1108–1201), `_onOccurrenceClick` (lines 1215–1227), `_onRegionClick` (lines 1229–1288), `_onPlaceSelected` (lines 1290–1311), `_openSidebarForFilter` (lines 1313–1320), `_applyBoundsSelection` (lines 1322–1336), `_onMapClickEmpty` (lines 1342–1367), `_onFilterChanged` (lines 1369–1408), `_onClearSelection` (lines 1434–1442), `_onPaneCollapse` (lines 1485–1491), `_onNearMeCleared` (lines 1074–1087), `_onDataLoaded` (lines 1506–1538) confirmed
- `src/bee-pane.ts` — Props (lines 88–90), near-me-cleared emit (lines 1063–1073) confirmed
- `src/stale-guard.ts` — Full read; generation-counter mechanism confirmed
- `src/tests/bee-atlas.test.ts` — SEL-06/SEL-07 and NEAR describe blocks (lines 386–508, 1118–1290) confirmed
- `src/tests/url-state.test.ts` — SEL-06 describe block (lines 445–516) confirmed
- `src/tests/bee-pane.test.ts` — NEAR-01/D-04/D-05 describe block (lines 299–357) confirmed
- `src/tests/filter.test.ts` — `emptyFilter()` helper and `isFilterActive` tests confirmed
- `.planning/phases/156-separate-spatial-bounds-filter-from-per-record-selection/156-CONTEXT.md` — All 8 locked decisions confirmed
- `.planning/phases/153-occurrences-near-me/153-CONTEXT.md` and `153-VERIFICATION.md` — Baseline behavior confirmed

### Secondary (MEDIUM confidence)

- `.planning/config.json` — Nyquist validation confirmed enabled (`nyquist_validation: true`)

---

## Metadata

**Confidence breakdown:**
- Touchpoint inventory: HIGH — sourced from direct line-by-line reads of each affected file
- Test surface: HIGH — test files read directly; all SEL-06/SEL-07/NEAR describe blocks enumerated
- Migration mechanics: HIGH — `buildParams`/`parseParams` logic read in full
- Architecture: HIGH — state model is simple; no external services or packages

**Research date:** 2026-06-21
**Valid until:** Until any of the four source files are touched; this research is tied to specific line numbers that will shift if unrelated changes land first

---

## RESEARCH COMPLETE

**Phase:** 156 - Separate spatial-bounds FILTER from per-record SELECTION
**Confidence:** HIGH

### Key Findings

- The refactor is self-contained to 4 files and has zero external dependencies. The SQL `boundsClause` already exists; it moves from call-site to `buildFilterSQL`.
- Exactly 20 sites assign `_selectionBounds` in `bee-atlas.ts`: all must be addressed, with behavior classified per D-05/D-06/D-07.
- The `SelectionState { type: 'bounds' }` variant is the single most-referenced legacy artifact — removing it from the union type will cause TypeScript to surface all remaining usages as compile errors, which is useful as a completeness check.
- The test impact is concentrated in three describe blocks (SEL-06 in url-state.test.ts, SEL-06+SEL-07 in bee-atlas.test.ts, NEAR-01 in bee-pane.test.ts). Most existing tests must be updated; about 10 new tests should be added.
- The most subtle behavioral change: `_onFilterChanged`, `_onClearSelection`, and `_onPaneCollapse` currently clear bounds as a side-effect — under D-05/D-07 they must NOT. This requires explicitly preserving `bounds` through the `_filterState` spread in `_onFilterChanged`.

### File Created
`.planning/phases/156-separate-spatial-bounds-filter-from-per-record-selection/156-RESEARCH.md`

### Confidence Assessment
| Area | Level | Reason |
|------|-------|--------|
| Touchpoint inventory | HIGH | Direct source file reads at line level |
| URL migration | HIGH | `buildParams`/`parseParams` read in full |
| Test surface | HIGH | All test files enumerated; test bodies read |
| Architecture | HIGH | Simple state model, no external dependencies |

### Open Questions (RESOLVED)
> RESOLVED 2026-06-21 (plan-phase) — see the resolution note under the `## Open Questions (RESOLVED)` section above; all three are now Plan 03 acceptance criteria.
1. `_onNearMeCleared` — clearing bounds does NOT touch the pane (symmetric with D-04). RESOLVED.
2. `_onClearSelection` — clears per-record selection only; leaves bounds untouched (D-05). RESOLVED.
3. `_onPaneCollapse` — pane collapse leaves bounds active; only `near-me-cleared` clears bounds (D-07). RESOLVED.

### Ready for Planning
Research complete. Planner can now create PLAN.md files.
