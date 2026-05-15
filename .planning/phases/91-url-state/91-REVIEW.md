---
phase: 91-url-state
reviewed: 2026-05-15T12:30:00Z
depth: standard
files_reviewed: 4
files_reviewed_list:
  - src/url-state.ts
  - src/tests/url-state.test.ts
  - src/bee-atlas.ts
  - src/tests/bee-atlas.test.ts
findings:
  critical: 2
  warning: 3
  info: 3
  total: 8
status: issues_found
---

# Phase 91: Code Review Report

**Reviewed:** 2026-05-15T12:30:00Z
**Depth:** standard
**Files Reviewed:** 4
**Status:** issues_found

## Summary

Reviewed the URL-state serialization/parsing module (`src/url-state.ts`), its test suite, and the `bee-atlas.ts` coordinator that consumes the restored state. The `buildParams`/`parseParams` round-trip logic is well-structured and the primary cases are well-tested. Two BLOCKERs were found: `_onPopState` fails to clear `_selectionBounds` in the `ids` and `cluster` selection branches, causing stale bounds to corrupt the URL on the next navigation; and `_restoreBoundsSelection` opens the sidebar before the async query, leaving it open and empty when the query returns zero rows. Three warnings cover integer-zero parsing loss (real for `elev_min=0`), the same stale-bounds risk in `_onOccurrenceClick`, and a non-null assertion on `taxonRank` that can silently write `taxonRank=null` to the URL. Three info items flag a stale test property, an undocumented `sel=` vs `o=` precedence rule, and a weak ID-filter predicate in `parseParams` that admits bare-prefix IDs like `ecdysis:`.

## Critical Issues

### CR-01: `_onPopState` does not clear `_selectionBounds` in the `ids` and `cluster` branches — stale bounds corrupt subsequent URL writes

**File:** `src/bee-atlas.ts:558-569`

**Issue:** The `ids` branch (lines 558–563) and `cluster` branch (lines 564–569) of `_onPopState` assign `_selectedCluster = null` and `_selectedOccIds = null` respectively, but neither clears `_selectionBounds`. The `else` branch (line 577) does clear it, but the `ids`/`cluster` branches do not.

Sequence that triggers the bug:
1. User draws a rectangle selection — `_selectionBounds` is set (line 674), `_sidebarOpen = true`.
2. User bookmarks or shares the URL; later presses **Back** to a URL with `o=ecdysis:123` (an ids selection).
3. `_onPopState` enters the `ids` branch: sets `_selectedOccIds`, clears `_selectedCluster`, sets `_sidebarOpen = true`. `_selectionBounds` still holds the old bounds.
4. Any subsequent call to `_pushUrlState` evaluates `this._selectionBounds && this._sidebarOpen`, which is `true` — it emits `sel=<stale bounds>` instead of `o=ecdysis:123`. The occurrence selection is silently dropped from the URL.

The test `SEL-07: _onPopState clears _selectionBounds in fallback else branch — exactly 5 total null clears` validates count but not placement; the two missing clears in the `ids` and `cluster` branches are not caught.

**Fix:** Add `this._selectionBounds = null` to both branches:
```typescript
if (parsedSel?.type === 'ids' && parsedSel.ids.length > 0) {
  this._selectedOccIds = parsedSel.ids;
  this._selectedCluster = null;
  this._selectionBounds = null;   // add this line
  this._sidebarOpen = true;
  this._selectedOccurrences = null;
  this._restoreSelectionOccurrences(parsedSel.ids);
} else if (parsedSel?.type === 'cluster') {
  this._selectedCluster = { lon: parsedSel.lon, lat: parsedSel.lat, radiusM: parsedSel.radiusM };
  this._selectedOccIds = null;
  this._selectionBounds = null;   // add this line
  this._sidebarOpen = true;
  this._selectedOccurrences = null;
  this._restoreClusterSelection(this._selectedCluster);
}
```

The test assertion `expect(allClears).toBe(5)` must be updated to `toBe(7)` after this fix.

---

### CR-02: `_restoreBoundsSelection` opens the sidebar synchronously before the async query; never closes it when the query returns zero rows

**File:** `src/bee-atlas.ts:956-972`

**Issue:** `this._sidebarOpen = true` is set at line 957, before `await tablesReady` and before `queryOccurrencesByBounds`. If the bounds query returns zero rows (data changed since the URL was saved, or the bounds are in an empty area), the method returns at line 963 without resetting `_sidebarOpen`. The sidebar renders open with `_selectedOccurrences = null`, showing an empty or indefinitely-loading state that cannot be dismissed by the user (the close button is only rendered when the sidebar is visible, but `_selectedOccurrences` being `null` may leave the sidebar in a broken intermediate render).

This is inconsistent with `_onSelectionDrawn` (line 687), which only calls `import('./bee-sidebar.ts')` and sets `_sidebarOpen = true` after confirming `rows.length > 0`.

**Fix:** Move the `_sidebarOpen = true` assignment to after the empty-row guard:
```typescript
private async _restoreBoundsSelection(bounds: { west: number; south: number; east: number; north: number }) {
  const generation = ++this._selectionDrawnGeneration;
  try {
    await tablesReady;
    const rows = await queryOccurrencesByBounds(this._filterState, bounds);
    if (generation !== this._selectionDrawnGeneration) return;
    if (rows.length === 0) return;   // sidebar stays closed; no empty state shown
    import('./bee-sidebar.ts');
    this._sidebarOpen = true;        // moved here, after confirming non-empty result
    this._selectedOccurrences = rows.sort((a, b) => b.date.localeCompare(a.date));
    this._selectedOccIds = rows.map(r =>
      r.ecdysis_id != null ? `ecdysis:${r.ecdysis_id}` : `inat:${Number(r.observation_id)}`
    );
  } catch (err) {
    console.error('Failed to restore bounds selection from URL:', err);
  }
}
```

## Warnings

### WR-01: `_onOccurrenceClick` does not clear `_selectionBounds` — same stale-bounds corruption as CR-01 on a different code path

**File:** `src/bee-atlas.ts:606-621`

**Issue:** Same root cause as CR-01 but triggered from a user click rather than browser navigation. If the user draws a zero-result rectangle (line 674 sets `_selectionBounds`; line 686 returns early without clearing it), then clicks a map occurrence, `_onOccurrenceClick` sets `_sidebarOpen = true` (line 615) and calls `_pushUrlState()`. Because `_selectionBounds` is still set, `_pushUrlState` emits `sel=<stale bounds>` rather than `o=<occurrence IDs>`. The occurrence IDs are dropped from the URL.

**Fix:**
```typescript
private _onOccurrenceClick(e: CustomEvent<...>) {
  import('./bee-sidebar.ts');
  this._selectedOccurrences = e.detail.occurrences.sort(...);
  this._selectedOccIds = e.detail.occIds;
  this._selectionBounds = null;   // clear any stale zero-result draw
  if (e.detail.centroid && e.detail.radiusM != null) {
    this._selectedCluster = { ... };
  } else {
    this._selectedCluster = null;
  }
  this._sidebarOpen = true;
  ...
}
```

Also add the symmetric guard in `_onSelectionDrawn` to clear `_selectionBounds` before the early return:
```typescript
if (rows.length === 0) {
  this._selectionBounds = null;   // prevent stale bounds for next occurrence click
  return;
}
```

---

### WR-02: `parseInt(...) || null` silently discards the value `0` for `elev_min` / `elev_max`

**File:** `src/url-state.ts:116-117`

**Issue:** The `|| null` idiom is falsy for `0`: `parseInt('0') || null === null`. For elevation, `0` (sea level) is a meaningful, practical filter value. A URL with `?elev_min=0` silently loses the filter on round-trip through `parseParams` — the filter is dropped and no error is reported. The same issue exists for `yr0`/`yr1` (lines 114–115), but year 0 CE is not a real observation year.

**Fix:**
```typescript
// Replace lines 116-117 with:
const elevMinRaw = parseInt(p.get('elev_min') ?? '', 10);
const elevMin = isNaN(elevMinRaw) ? null : elevMinRaw;
const elevMaxRaw = parseInt(p.get('elev_max') ?? '', 10);
const elevMax = isNaN(elevMaxRaw) ? null : elevMaxRaw;
```

Apply the same pattern to `yr0`/`yr1` for consistency:
```typescript
const yearFromRaw = parseInt(p.get('yr0') ?? '', 10);
const yearFrom = isNaN(yearFromRaw) ? null : yearFromRaw;
const yearToRaw = parseInt(p.get('yr1') ?? '', 10);
const yearTo = isNaN(yearToRaw) ? null : yearToRaw;
```

Note: the existing test for `invalid elev_min (non-numeric): parses to null` (line 246–249) passes with the current `|| null` idiom and would also pass with the `isNaN` fix — no test change needed there. Add a new test for the zero case:
```typescript
test('elevMin=0 (sea level): round-trips as 0 not null', () => {
  const result = parseParams('elev_min=0');
  expect(result.filter?.elevMin).toBe(0);
});
```

---

### WR-03: Non-null assertion on `filter.taxonRank` can produce `taxonRank=null` in the URL

**File:** `src/url-state.ts:53`

**Issue:** `buildParams` guards the taxon block with `if (filter.taxonName !== null)` (line 51), then uses `filter.taxonRank!` (non-null assertion) at line 53. `FilterState` permits `taxonRank: null` independently of `taxonName` — no runtime contract prevents `{ taxonName: 'Bombus', taxonRank: null }`. With that state, `params.set('taxonRank', null!)` serializes the JavaScript string `"null"` to the URL as `taxonRank=null`. `parseParams` then rejects `"null"` as not in `['family', 'genus', 'species']`, causing `resolvedTaxonName` and `resolvedTaxonRank` to both be set to `null`, silently dropping the taxon filter through any URL round-trip.

**Fix:**
```typescript
// Line 51-54 — guard both fields together:
if (filter.taxonName !== null && filter.taxonRank !== null) {
  params.set('taxon', filter.taxonName);
  params.set('taxonRank', filter.taxonRank);  // no non-null assertion needed
}
```

## Info

### IN-01: Stale `layerMode` property in `url-state.test.ts`

**File:** `src/tests/url-state.test.ts:92`

**Issue:** The `viewMode=table` round-trip test constructs `ui` with `{ layerMode: 'specimens' as const, boundaryMode: 'off' as const, viewMode: 'table' as const }`. `UiState` has no `layerMode` field; the property is silently ignored by `buildParams`. TypeScript does not flag this because the object literal is assigned to a typed-widened local before being passed to `buildParams`. The test proves correct behavior despite the dead property, but the extra field signals an incomplete cleanup of an earlier feature.

**Fix:** Remove the stale field:
```typescript
const ui = { boundaryMode: 'off' as const, viewMode: 'table' as const };
```

---

### IN-02: `o=` and `sel=` can coexist in a crafted URL; `sel=` silently wins with no test or comment

**File:** `src/url-state.ts:165-204`

**Issue:** `parseParams` processes `o=` first (lines 166–185), then processes `sel=` (lines 187–204) and unconditionally overwrites `result.selection` if valid. A URL with both params (from manual editing or a future bug) silently discards the `o=` selection. `buildParams` never emits both simultaneously, so the behavior is benign today, but it is undocumented and untested.

**Fix:** Add a comment documenting the precedence and add a test:
```typescript
// Bounds selection (SEL-06) — takes precedence over o= if both are present.
// buildParams never emits both; this is a defensive tie-break only.
const selRaw = p.get('sel') ?? '';
```
```typescript
test('sel= takes precedence over o= when both present', () => {
  const result = parseParams('o=ecdysis:123&sel=-122,47,-121,48');
  expect(result.selection?.type).toBe('bounds');
});
```

---

### IN-03: ID filter predicate in `parseParams` admits bare-prefix IDs such as `ecdysis:`

**File:** `src/url-state.ts:181`

**Issue:** The filter `s.length > 5` is intended to reject empty IDs, but `'ecdysis:'` has length 8 and passes both the prefix check and the length check. It is then accepted into `result.selection.ids`. The downstream guard in `_restoreSelectionOccurrences` (line 876–878) correctly rejects it via `/^\d+$/`, so no SQL injection or incorrect query occurs. However `parseParams` itself returns a `SelectionState` with an ID like `'ecdysis:'` included, which is semantically invalid and inconsistent.

**Fix:** Tighten the predicate to validate the integer suffix directly:
```typescript
.filter(s => /^(ecdysis|inat):\d+$/.test(s));
```

This replaces both the prefix check and the length check with a single regex that requires at least one digit after the colon.

---

_Reviewed: 2026-05-15T12:30:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
