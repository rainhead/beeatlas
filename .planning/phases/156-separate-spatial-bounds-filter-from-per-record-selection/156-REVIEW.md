---
phase: 156-separate-spatial-bounds-filter-from-per-record-selection
reviewed: 2026-06-21T21:01:47Z
depth: standard
files_reviewed: 11
files_reviewed_list:
  - src/filter.ts
  - src/url-state.ts
  - src/bee-atlas.ts
  - src/bee-pane.ts
  - src/bee-map.ts
  - src/tests/filter.test.ts
  - src/tests/url-state.test.ts
  - src/tests/bee-atlas.test.ts
  - src/tests/bee-pane.test.ts
  - src/tests/filter-join-execution.test.ts
  - src/tests/bee-atlas-legacy-taxon.test.ts
findings:
  critical: 0
  warning: 2
  info: 2
  total: 4
status: issues_found
---

# Phase 156: Code Review Report

**Reviewed:** 2026-06-21T21:01:47Z
**Depth:** standard
**Files Reviewed:** 11
**Status:** issues_found

## Summary

The refactor correctly moves `_selectionBounds` / `{type:'bounds'}` SelectionState out of the system and promotes bounds into `FilterState.bounds` as a first-class field. The migration path is coherent: `buildParams` writes only `bbox=`, `parseParams` reads both `bbox=` and legacy `sel=` into `filter.bounds`, and `FilterChangedEvent` correctly omits `bounds` so `_onFilterChanged` must preserve it explicitly — which it does. The URL round-trip, SQL injection surface, style-cache bypass, and filter race guard all appear correct.

Two correctness gaps were found: one in `_onNearMeCleared` (list pane not refreshed) and one in `parseParams` (inverted longitude box accepted silently). Neither is a security issue. Two info-level items round out dead code and an undeclared assumption.

## Warnings

### WR-01: `_onNearMeCleared` omits `_runListQuery()` — stale list when bounds are cleared while pane is open

**File:** `src/bee-atlas.ts:1072-1080`

**Issue:** `_onNearMeCleared` calls `_runFilterQuery()` and `_runTableQuery()` but never calls `_runListQuery()`. If the list pane (`_paneState === 'list'`) is open when the user taps the "✕" near-me button, the list continues showing the bounded result set until the next interaction that triggers `_runListQuery`. The map and table correctly drop the bounds constraint; the list is the only consumer left stale. `_listPage` also goes unrest.

Compare with `_applyBoundsFilter` (line 1309-1316), which correctly calls all three — `_runFilterQuery`, `_runListQuery`, `_runTableQuery` — and resets `_listPage = 1`.

**Fix:**
```typescript
private _onNearMeCleared = () => {
  this._nearMePending = false;
  this._filterState = { ...this._filterState, bounds: null };
  this._listPage = 1;            // ← add
  this._runFilterQuery();
  this._runListQuery();          // ← add
  this._runTableQuery();
  this._replaceUrlState();
};
```

---

### WR-02: `parseParams` accepts inverted bbox (`west >= east`) without rejection — produces silently-empty query results

**File:** `src/url-state.ts:197-203` and `217-223`

**Issue:** Both the `bbox=` and legacy `sel=` parsing paths validate `south < north` but not `west < east`. A URL with `bbox=-121,47,-122,48` (west = −121, east = −122, which is inverted) passes all checks and produces `{ west: -121, south: 47, east: -122, north: 48 }`. This value is written directly into SQL as `lon BETWEEN -121 AND -122`, which returns zero rows in SQLite (BETWEEN is inclusive but requires low ≤ high). The result is a bounds filter that silently shows nothing — no error, no user feedback, no obvious failure mode.

The `boundsFromLocation` function (bee-atlas.ts:65-77) always produces `west < east` by construction (±offset from center), and the shift-drag gesture uses `Math.min`/`Math.max` normalization (bee-map.ts:266-275), so neither runtime path can produce an inverted box. The exposure is limited to crafted/stale URL manipulation. Still, the silent-zero behavior is inconsistent with how south >= north is handled.

**Fix:** Add `west < east` to both validation guards in `parseParams`:
```typescript
// in both the bbox= and sel= blocks:
if (isFinite(west)  && west  >= -180 && west  <= 180 &&
    isFinite(east)  && east  >= -180 && east  <= 180 &&
    isFinite(south) && south >= -90  && south <= 90  &&
    isFinite(north) && north >= -90  && north <= 90  &&
    south < north && west < east) {   // ← add west < east
```

---

## Info

### IN-01: `_selectionDrawnGeneration` counter is incremented but never read — dead state

**File:** `src/bee-atlas.ts:164` (declaration), `1310` (increment)

**Issue:** `private _selectionDrawnGeneration = 0` is incremented on every `_applyBoundsFilter` call but is never read anywhere in the file. It was presumably a stale-guard seed for a former async bounds-query path. With bounds now living in `FilterState` and the stale guards in `_filterGuard`/`_tableGuard`/`_listGuard`, this counter serves no purpose.

**Fix:** Remove the field declaration (line 164) and the `++this._selectionDrawnGeneration;` statement (line 1310).

---

### IN-02: `boundsFromLocation` can produce longitude values outside `[-180, 180]` that flow into SQL without clamping

**File:** `src/bee-atlas.ts:65-77`

**Issue:** When the user's longitude is near ±180° (e.g., lon = -178.0), `west = lon - dLon` can be −188.something. The function's guard only rejects non-finite values and cases where `dLon > 180`; it does not clamp the output edges to `[-180, 180]`. The computed bounds then flow through `_applyBoundsFilter` directly into `buildFilterSQL`, which interpolates them as numeric literals into SQL: `lon BETWEEN -188.xxx AND -168.xxx`.

This is not an injection risk (the values are computed `number`s, not user strings), and SQLite numeric comparison works correctly even with out-of-range bounds (records with `lon` in `[-180, -168]` would still match correctly because `lon >= -188`). However it is inconsistent with the URL-parsing validation that enforces `[-180, 180]`, and a user near the antimeridian would get asymmetric coverage (wrong geographic box).

**Fix:** Clamp west/east to `[-180, 180]` before returning:
```typescript
return {
  west:  Math.max(-180, loc.lon - dLon),
  east:  Math.min( 180, loc.lon + dLon),
  south: Math.max( -90, loc.lat - dLat),
  north: Math.min(  90, loc.lat + dLat),
};
```
(The south/north values from ±10 km are already well within `[-90, 90]` for any realistic location, but clamping is cheap and defensive.)

---

_Reviewed: 2026-06-21T21:01:47Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
