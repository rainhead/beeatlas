---
phase: 91-url-state
reviewed: 2026-05-15T11:45:00Z
depth: standard
files_reviewed: 4
files_reviewed_list:
  - src/url-state.ts
  - src/tests/url-state.test.ts
  - src/bee-atlas.ts
  - src/tests/bee-atlas.test.ts
findings:
  critical: 1
  warning: 3
  info: 2
  total: 6
status: issues_found
---

# Phase 91: Code Review Report

**Reviewed:** 2026-05-15T11:45:00Z
**Depth:** standard
**Files Reviewed:** 4
**Status:** issues_found

## Summary

Reviewed the url-state serialization/parsing module (`src/url-state.ts`), its test suite, and the `bee-atlas.ts` coordinator that applies the restored state. The `buildParams`/`parseParams` round-trip is well-tested and correct for the primary cases. One BLOCKER was found: `_onOccurrenceClick` does not clear `_selectionBounds`, which means a prior zero-result box draw leaves stale bounds that subsequently corrupt the URL when a user clicks a map occurrence. Three warnings cover integer-zero parsing loss (realistic for `elev_min=0`), a sidebar that opens empty on bounds-restore-with-no-results, and a non-null assertion on `taxonRank` that can silently write `taxonRank=null` to the URL. Two info items flag a stale dead property in a test and an undocumented silent precedence rule when both `o=` and `sel=` appear in the same URL.

## Critical Issues

### CR-01: `_onOccurrenceClick` does not clear `_selectionBounds` — stale bounds corrupt URL

**File:** `src/bee-atlas.ts:606-621`

**Issue:** `_selectionBounds` is never set to `null` inside `_onOccurrenceClick`. If the user shift-drags a rectangle that returns zero results, `_selectionBounds` is set (line 674) and `_sidebarOpen` is set to `false` (line 679) but `_selectionBounds` is never cleared (the early-return at line 686 skips `_pushUrlState` and leaves `_selectionBounds` dirty). When the user subsequently clicks a map occurrence, `_onOccurrenceClick` sets `_sidebarOpen = true` (line 615) and calls `_pushUrlState()`. At that point `_selectionBounds && _sidebarOpen` is `true`, so `_pushUrlState` emits `sel=<stale empty-draw bounds>` instead of `o=<occurrence IDs>`. The occurrence IDs are silently discarded from the URL — the occurrence selection cannot be bookmarked or shared, and back-navigation restores the wrong state.

**Fix:**
```typescript
private _onOccurrenceClick(e: CustomEvent<{ occurrences: OccurrenceRow[]; occIds: string[]; centroid?: { lon: number; lat: number }; radiusM?: number }>) {
  import('./bee-sidebar.ts');
  this._selectedOccurrences = e.detail.occurrences.sort((a, b) => b.date.localeCompare(a.date));
  this._selectedOccIds = e.detail.occIds;
+ this._selectionBounds = null;   // clear any stale zero-result box draw
  if (e.detail.centroid && e.detail.radiusM != null) {
    this._selectedCluster = { lon: e.detail.centroid.lon, lat: e.detail.centroid.lat, radiusM: e.detail.radiusM };
  } else {
    this._selectedCluster = null;
  }
  this._sidebarOpen = true;
  // ...
}
```

Also add the symmetric fix in `_onSelectionDrawn`: when `rows.length === 0`, clear `_selectionBounds` before returning so it can never be left dirty:
```typescript
if (rows.length === 0) {
  this._selectionBounds = null;   // don't leave stale bounds for next occurrence click
  return;
}
```

## Warnings

### WR-01: `parseInt(...) || null` silently discards the value `0` for `elev_min` / `elev_max`

**File:** `src/url-state.ts:114-117`

**Issue:** The `|| null` idiom treats `0` as falsy, mapping it to `null`. For year filters (`yr0`, `yr1`) this is harmless in practice — year 0 CE is not a real observation date. For elevation (`elev_min`, `elev_max`), `0` is a realistic and meaningful value: a collector filtering for "sea level and above" would set `elev_min=0`. Navigating to `?elev_min=0` silently drops the parameter and the filter is lost after a round-trip.

```typescript
// Current — broken for zero:
const elevMin = parseInt(p.get('elev_min') ?? '') || null;
const elevMax = parseInt(p.get('elev_max') ?? '') || null;

// Fix — use isNaN guard:
const elevMinRaw = parseInt(p.get('elev_min') ?? '', 10);
const elevMin = isNaN(elevMinRaw) ? null : elevMinRaw;
const elevMaxRaw = parseInt(p.get('elev_max') ?? '', 10);
const elevMax = isNaN(elevMaxRaw) ? null : elevMaxRaw;
```

Apply the same fix to `yearFrom` / `yearTo` for consistency, even though year-0 is not a practical risk.

### WR-02: `_restoreBoundsSelection` opens the sidebar before the async query, never closes it on empty result

**File:** `src/bee-atlas.ts:956-972`

**Issue:** `_sidebarOpen = true` is set synchronously at line 957 before awaiting the query. If the query returns zero rows (e.g., data has changed since the URL was bookmarked), the method returns early at line 963 without resetting `_sidebarOpen`. The sidebar renders in the open state with `_selectedOccurrences = null`, displaying an empty or loading indicator that never resolves.

**Fix:** Move `_sidebarOpen = true` to after the empty-check, consistent with `_onSelectionDrawn`:
```typescript
private async _restoreBoundsSelection(bounds: { ... }) {
  const generation = ++this._selectionDrawnGeneration;
  try {
    await tablesReady;
    const rows = await queryOccurrencesByBounds(this._filterState, bounds);
    if (generation !== this._selectionDrawnGeneration) return;
    if (rows.length === 0) return;   // sidebar stays closed
    import('./bee-sidebar.ts');
    this._sidebarOpen = true;        // moved here
    this._selectedOccurrences = rows.sort((a, b) => b.date.localeCompare(a.date));
    this._selectedOccIds = rows.map(r =>
      r.ecdysis_id != null ? `ecdysis:${r.ecdysis_id}` : `inat:${Number(r.observation_id)}`
    );
  } catch (err) {
    console.error('Failed to restore bounds selection from URL:', err);
  }
}
```

### WR-03: Non-null assertion on `filter.taxonRank` can produce `taxonRank=null` in URL

**File:** `src/url-state.ts:53`

**Issue:** `buildParams` guards the taxon block with `if (filter.taxonName !== null)` (line 51), then uses `filter.taxonRank!` (non-null assertion, line 53). `FilterState` allows `taxonRank: null` independently of `taxonName`, so a caller with `{ taxonName: 'Bombus', taxonRank: null }` would produce `taxonRank=null` in the URL (JavaScript `String(null)` is the string `"null"`). `parseParams` then rejects `"null"` as not in `['family', 'genus', 'species']`, causing both `taxonName` and `taxonRank` to be silently dropped on parse. The filter is lost after any round-trip through the URL.

**Fix:** Guard both fields together:
```typescript
if (filter.taxonName !== null && filter.taxonRank !== null) {
  params.set('taxon', filter.taxonName);
  params.set('taxonRank', filter.taxonRank);  // no non-null assertion needed
}
```

## Info

### IN-01: Stale `layerMode` property in `url-state.test.ts` test

**File:** `src/tests/url-state.test.ts:92`

**Issue:** The `ui` object literal in the `viewMode=table` round-trip test includes `layerMode: 'specimens' as const`, which is not a field of `UiState` (the interface has only `boundaryMode` and `viewMode`). The property is silently ignored by `buildParams` at runtime. TypeScript does not catch this because excess property checking is not applied when an object literal is first assigned to an untyped local variable and then passed to a function. The test proves correct behavior despite the dead property, but the dead property obscures which fields are actually being tested and signals an incomplete cleanup of a prior `layerMode` feature.

**Fix:**
```typescript
// Line 92 — remove the stale layerMode field:
const ui = { boundaryMode: 'off' as const, viewMode: 'table' as const };
```

### IN-02: `o=` and `sel=` can coexist in a URL; `sel=` silently wins with no test coverage

**File:** `src/url-state.ts:165-204`

**Issue:** `parseParams` processes `o=` first (lines 166-185), potentially setting `result.selection`, then processes `sel=` (lines 187-204) and overwrites `result.selection` unconditionally if valid. A URL crafted with both params (e.g., from manual editing or a bug) silently discards the `o=` selection. The current `buildParams` never emits both simultaneously, but the behavior is undocumented and has no test. If a future code path inadvertently writes both params, the silent overwrite could be surprising.

**Fix (documentation only, no code change required):** Add a comment at the top of the `sel=` block in `parseParams`:
```typescript
// Bounds selection (SEL-06) — takes precedence over o= if both are present.
// buildParams never emits both; this ordering is a defensive fallback only.
const selRaw = p.get('sel') ?? '';
```

Optionally add a test:
```typescript
test('sel= takes precedence over o= when both present', () => {
  const result = parseParams('o=ecdysis:123&sel=-122,47,-121,48');
  expect(result.selection?.type).toBe('bounds');
});
```

---

_Reviewed: 2026-05-15T11:45:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
