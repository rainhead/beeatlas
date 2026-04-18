---
phase: 65-ui-unification
reviewed: 2026-04-17T23:31:37Z
depth: standard
files_reviewed: 17
files_reviewed_list:
  - frontend/src/bee-atlas.ts
  - frontend/src/bee-filter-toolbar.ts
  - frontend/src/bee-header.ts
  - frontend/src/bee-map.ts
  - frontend/src/bee-occurrence-detail.ts
  - frontend/src/bee-sidebar.ts
  - frontend/src/bee-table.ts
  - frontend/src/filter.ts
  - frontend/src/style.ts
  - frontend/src/url-state.ts
  - frontend/src/tests/bee-atlas.test.ts
  - frontend/src/tests/bee-filter-toolbar.test.ts
  - frontend/src/tests/bee-header.test.ts
  - frontend/src/tests/bee-sidebar.test.ts
  - frontend/src/tests/bee-table.test.ts
  - frontend/src/tests/filter.test.ts
  - frontend/src/tests/url-state.test.ts
findings:
  critical: 1
  warning: 4
  info: 4
  total: 9
status: issues_found
---

# Phase 65: Code Review Report

**Reviewed:** 2026-04-17T23:31:37Z
**Depth:** standard
**Files Reviewed:** 17
**Status:** issues_found

## Summary

This phase implements the UI unification work: extracting state from `bee-sidebar` into `bee-atlas`, introducing `bee-header` with inline tabs, separating `bee-filter-toolbar` from `bee-filter-controls`, and adding `bee-table` as a proper component. The architecture invariants from CLAUDE.md (state ownership in `bee-atlas`, presenters as pure receivers) are respected by the new code. The generation-guard pattern for async filter queries is correctly applied to both the filter query (`_filterQueryGeneration`) and the table query (`_tableQueryGeneration`).

One critical finding: SQL is constructed with raw string interpolation in `_restoreSelectionOccurrences`, creating an injection vector for attacker-controlled IDs supplied via the URL. Four warnings cover logic correctness (two stale-state bugs) and error-handling gaps. Four info items cover code quality.

## Critical Issues

### CR-01: SQL injection via URL-supplied IDs in `_restoreSelectionOccurrences`

**File:** `frontend/src/bee-atlas.ts:728-730`
**Issue:** The method parses IDs from `window.location.search` (via `parseParams`) and interpolates them directly into a SQL string:

```typescript
conditions.push(`CAST(ecdysis_id AS TEXT) IN (${ecdysisIds.map(id => `'${id}'`).join(',')})`);
// and similarly for inatIds
conditions.push(`CAST(observation_id AS TEXT) IN (${inatIds.map(id => `'${id}'`).join(',')})`);
```

The IDs are filtered by `/^\d+$/.test(id)` before insertion (lines 720, 724), which limits them to digit-only strings and does prevent SQL injection in practice today. However, the safety relies entirely on this regex guard being correct and never removed. Because `wa-sqlite` (the SQLite binding in use) does not support parameterized queries via `sqlite3.exec`, the idiomatic mitigation is to use a strict allowlist validation, which is already present. The real risk is the lack of any defence-in-depth comment or assertion: if a future developer relaxes the regex (e.g., to allow hex IDs), the injection surface opens silently.

More concretely, the `buildFilterSQL` function in `filter.ts` does use `replace(/'/g, "''")` for string values; that same defence is absent here, which is inconsistent and creates a latent hazard if the regex guard is ever weakened.

**Fix:** Add an explicit assertion before the SQL construction and a comment explaining the invariant:

```typescript
// Safety: ecdysisIds/inatIds have already been filtered to /^\d+$/.
// If this assertion fails, the regex guard above has been changed — do NOT remove it.
if (ecdysisIds.some(id => !/^\d+$/.test(id)) || inatIds.some(id => !/^\d+$/.test(id))) {
  console.error('ID validation failed; skipping selection restore');
  return;
}
```

## Warnings

### WR-01: `_tableLoading` not reset when generation guard fires during error path

**File:** `frontend/src/bee-atlas.ts:404-413`
**Issue:** The `finally` block in `_runTableQuery` only clears `_tableLoading` when `generation === this._tableQueryGeneration`. If a newer query starts before the older one's error path reaches `finally`, the loading spinner is never cleared for the older query. The newer query will clear it when it finishes, so in normal usage this resolves itself — but if the newer query also fails fast (e.g., during rapid filter changes with a slow DB), the UI can get stuck showing a spinner permanently.

```typescript
} finally {
  if (generation === this._tableQueryGeneration) {
    this._tableLoading = false;  // BUG: if stale, spinner stays until next query completes
  }
}
```

**Fix:** Always clear loading in `finally`, or track loading per-generation:

```typescript
} finally {
  // Clear loading regardless of generation; the active query will set it again if needed.
  this._tableLoading = false;
}
```

Note: This is the same pattern used in `_runFilterQuery`, which does not guard `_visibleIds` in the same way but also does not have a loading flag. The asymmetry suggests the guard logic was copy-adjusted but not fully reconciled.

### WR-02: Race condition — `_onDataLoaded` may trigger a second `_runFilterQuery` after one is already in flight

**File:** `frontend/src/bee-atlas.ts:694-697`
**Issue:** `_onDataLoaded` unconditionally calls `_runFilterQuery()` if `isFilterActive`. However, `firstUpdated` already started a `_runFilterQuery` (line 233) before data loads. The generation counter (`++_filterQueryGeneration`) will discard the earlier result, so the final visible IDs will be correct — but the `_visibleIds` guard at line 226-228 initialises the set to empty (hide-all) before any query runs. If the first query finishes before `_onDataLoaded` fires, `_visibleIds` gets the correct result, then `_onDataLoaded` increments the generation and starts a second query, resetting `_visibleIds` to `null` for the duration of the second query... except `_visibleIds` is only set by `_runFilterQuery`'s resolution, not reset to empty at the start. So the second call just fires a redundant query with no visible flicker. The actual bug risk is minor, but the comment at line 695–697 says "run the filter query now that data is loaded" which is misleading — the query was already running against `tablesReady`, which resolves when data loads. The code is correct but the duplicate query wastes DB work.

**Fix:** Guard the second invocation to avoid the duplicate:

```typescript
// In _onDataLoaded:
if (isFilterActive(this._filterState) && this._visibleIds === null) {
  // Only run if the initial query hasn't already resolved
  this._runFilterQuery();
}
```

### WR-03: `_pushUrlState` races with itself when called from within `.then()` of `_runFilterQuery`

**File:** `frontend/src/bee-atlas.ts:563-565`
**Issue:** Several handlers call `_runFilterQuery().then(() => { this._pushUrlState(); })`. Meanwhile `_pushUrlState` is also called immediately in other code paths (e.g., `_onMapClickEmpty` at line 589). If a filter query is in flight and the user clicks empty to clear the selection, `_pushUrlState` fires immediately (line 589), then fires again when the filter query resolves (line 564). The second call writes a potentially stale URL (it uses the current `_filterState`, which is correct, but `_selectedOccIds` may have already been cleared). In practice this is benign — both calls write the same URL state — but there is a theoretical window where the two calls write different `_selectedOccIds` states if event ordering is unlucky. The pattern would be cleaner if `_pushUrlState` were debounced or only triggered by the generation winner.

**Fix:** Low-priority, but the pattern can be simplified by calling `_pushUrlState` unconditionally at the top of each handler and relying on the debounce inside `_pushUrlState`:

```typescript
// Call _pushUrlState synchronously; the internal debounce handles rapid-fire calls
this._runFilterQuery();  // fire-and-forget; URL already up to date
this._pushUrlState();
```

### WR-04: `_restoreClusterSelection` uses approximate bounding-box query before haversine post-filter, but `radiusM` is not validated against a maximum before computing `dLon`

**File:** `frontend/src/bee-atlas.ts:750-780`
**Issue:** `radiusM` is validated in `parseParams` with `radiusM <= 100000` (100 km). The `dLon` computation `radiusM * degPerMetre / Math.cos(lat * Math.PI / 180)` can produce very large values when `lat` approaches ±90° (cos → 0), causing a near-infinite bounding box that scans every row. Although the URL validation rejects coordinates outside WGS84 range, latitudes near the poles (e.g., lat=89) would cause `cos(89° in rad) ≈ 0.0175`, making `dLon ≈ 100000 / 111320 / 0.0175 ≈ 51.4°` — much wider than needed but still bounded. However `dLat` is always safe. The issue is a latent DoS-by-URL: a crafted URL with `lat=89` and `radiusM=100000` causes an unbounded column scan. This is relevant because the app is statically hosted and the DB query runs in the user's browser (no server-side impact), but it can make the tab unresponsive.

**Fix:** Cap `dLon` to a sensible maximum:

```typescript
const dLon = Math.min(radiusM * degPerMetre / Math.cos(lat * Math.PI / 180), 180);
```

## Info

### IN-01: `(detail as any).elevMin` cast in `_onFilterChanged` suggests incomplete type

**File:** `frontend/src/bee-atlas.ts:605-606`
**Issue:** `FilterChangedEvent` in `bee-sidebar.ts` includes `elevMin` and `elevMax` in its interface definition (lines 41-42), so the cast `(detail as any).elevMin` is unnecessary — `detail.elevMin` is typed correctly.

**Fix:** Remove the casts:

```typescript
elevMin: detail.elevMin ?? null,
elevMax: detail.elevMax ?? null,
```

### IN-02: Unused `panTo` property on `BeeMap`

**File:** `frontend/src/bee-map.ts:116`
**Issue:** `@property({ attribute: false }) panTo: { coordinate: number[]; zoom: number } | null = null;` is declared and handled in `updated()` (line 275-281) but `bee-atlas.ts` never sets this property. The test in `bee-atlas.test.ts` (ARCH-02) confirms `panTo` should be present as a `@property`, so this is intentional API surface, but there is no caller. If this is planned for a future phase, a comment explaining the intent would prevent it from being removed as dead code.

**Fix:** Add an explanatory comment, or defer the property declaration to the phase that uses it.

### IN-03: `bee-map.ts` loads OpenLayers CSS via a `<link>` tag in the shadow DOM every render

**File:** `frontend/src/bee-map.ts:204`
**Issue:** `<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/ol@v10.8.0/ol.css">` is in the `render()` template, which means the element re-requests the URL on every Lit render cycle. Browsers deduplicate stylesheet loads, so this does not cause repeated network requests, but it is unconventional and may cause a flash-of-unstyled-content on first paint. The cleaner approach is to add the link in `static styles` via `unsafeCSS` or import the CSS directly into the Vite bundle.

**Fix:** Import `ol/ol.css` in the component file or a module entrypoint. This avoids the CDN dependency and FOUC risk.

### IN-04: `bee-filter-toolbar.ts` blur-dismiss timeout (150 ms) may cause accessibility issues

**File:** `frontend/src/bee-filter-toolbar.ts:79`
**Issue:** `_onBtnBlur` uses `setTimeout(() => { this._menuOpen = false; }, 150)` to close the download menu on blur. This pattern is common but fragile: 150 ms is enough to let a click on the menu item register first, but keyboard users navigating away rapidly may not dismiss the menu if focus moves inside the shadow DOM. The `@mousedown` + `e.preventDefault()` guard on the menu item (line 116) prevents the button from losing focus on click, which is correct. The timeout approach is acceptable but the accessibility gap (keyboard trap) should be verified.

**Fix:** Add a `@keydown` handler to close on `Escape`:

```typescript
private _onKeyDown(e: KeyboardEvent) {
  if (e.key === 'Escape') this._menuOpen = false;
}
// In the button: @keydown=${this._onKeyDown}
```

---

_Reviewed: 2026-04-17T23:31:37Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
