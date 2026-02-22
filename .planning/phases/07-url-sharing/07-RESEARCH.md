# Phase 7: URL Sharing - Research

**Researched:** 2026-02-22
**Domain:** Browser History API + OpenLayers View State + Lit custom elements
**Confidence:** HIGH

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**URL format**
- Use query string params, NOT hash/fragment — required for future server-side link preview generation (hash is invisible to servers)
- Follow SalishSea.io's param conventions as a template: `x`, `y`, `z` for map center + zoom; `o` for selected occurrence

**Filter params**
- Encode filter state loosely following SalishSea style, adapted to BeeAtlas filter shape
- Example: `taxon=Bombus&yr0=2018&yr1=2022&months=3,4,5`
- Researcher should confirm exact param names that cleanly cover all filter dimensions (taxon text, year range, month checkboxes)

**Selected occurrence encoding**
- Param: `o` (matching SalishSea)
- Value format: `ecdysis:{id}` — the Ecdysis occurrence ID, namespaced with a `ecdysis:` prefix
- Namespace prefix is intentional for forward compatibility: future non-Ecdysis data sources can use their own prefix without collision
- Researcher should identify which Parquet column holds the Ecdysis occurrence ID

**History behavior**
- Match SalishSea exactly: `replaceState` during continuous interactions (panning, dragging, live filter changes)
- `pushState` after 500ms debounce on settle — back button navigates between settled views
- `popstate` event listener syncs browser back/forward navigation to app state
- Flag to prevent redundant URL updates when restoring from history

### Claude's Discretion
- Exact debounce implementation
- Default view coordinates (Washington state at full extent — pick sensible lat/lng/zoom)
- How to handle invalid/corrupted URL params on load (graceful fallback to default)

### Deferred Ideas (OUT OF SCOPE)
- Link preview server (OG meta tag generation via Lambda or CloudFront Function) — future phase; query string format is chosen now to enable this cleanly
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| NAV-01 | URL encodes current map view (center, zoom) and active filter state so collectors can share links | Implemented via Browser History API (pushState/replaceState) + OL `moveend` event + filter-changed event in BeeMap; restore via parseUrlParams on load + popstate listener |
</phase_requirements>

---

## Summary

Phase 7 adds URL state sync to a static, already-complete frontend. There are no new libraries to install — all required APIs are native browser (History API, URLSearchParams) and already-imported OpenLayers utilities (`toLonLat`, `fromLonLat`, `moveend` event). The SalishSea reference implementation has been studied and its approach maps directly to the BeeAtlas architecture.

The state to encode in URL params is fully known: map center (lon/lat), zoom level, taxon filter (name + rank), year range (from/to), active months (comma-separated integers), and optional selected occurrence ID. The Parquet column that holds the Ecdysis numeric occurrence ID is confirmed as `ecdysis_id` — feature IDs in the frontend are already set as the string `ecdysis:{ecdysis_id}`, meaning the `o` param value is already in the correct namespaced format.

All URL state sync logic belongs in `bee-map.ts` (the `BeeMap` Lit element). This component already owns the OL `Map` instance, handles filter changes via `_applyFilter`, and manages `selectedSamples`. Adding URL sync does not require changes to `filter.ts`, `parquet.ts`, `style.ts`, or `bee-sidebar.ts`.

**Primary recommendation:** Implement URL sync entirely in `bee-map.ts` as private methods alongside the existing map and filter logic — no new files, no new libraries.

---

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Browser History API | Native | `pushState`, `replaceState`, `popstate` event | Built into all browsers; no install |
| `URLSearchParams` | Native | Parse and construct query strings | Standard browser API since 2016, available in all targets |
| OpenLayers `ol/proj.js` | Already imported | `toLonLat` to convert EPSG:3857 center coords to lon/lat for URL | Already used in `parquet.ts` and `bee-map.ts` |
| OpenLayers `moveend` | Built-in OL event | Fires after pan/zoom settles | The canonical OL event for detecting view changes |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `setTimeout`/`clearTimeout` | Native | Debounce for 500ms pushState on settle | During map moveend and filter-changed events |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Native History API | A router library (React Router, Vaadin Router) | Routing libraries are far heavier than needed; this app has one view |
| Manual debounce | Lodash debounce | Not worth adding lodash for one 5-line function |
| Query string params | Hash/fragment | Locked decision: hash invisible to server, ruled out |

**Installation:** None required. All APIs are already available.

---

## Architecture Patterns

### Recommended Project Structure

No new files needed. All changes go in:
```
frontend/src/
├── bee-map.ts     ← URL sync logic lives here (all additions)
├── bee-sidebar.ts ← No changes
├── filter.ts      ← No changes
├── parquet.ts     ← No changes
└── style.ts       ← No changes
```

### Pattern 1: Encoding URL Params

**What:** Helper functions to build a URLSearchParams from current app state.
**When to use:** Called from the debounce callback after moveend and from `_applyFilter`.

```typescript
// Source: SalishSea reference + MDN History API
function buildSearchParams(
  center: number[],  // [lon, lat] in degrees
  zoom: number,
  filterState: FilterState,
  selectedOccId: string | null  // e.g. "ecdysis:12345" or null
): URLSearchParams {
  const params = new URLSearchParams();
  params.set('x', center[0].toFixed(4));
  params.set('y', center[1].toFixed(4));
  params.set('z', zoom.toFixed(2));
  if (filterState.taxonName !== null) {
    params.set('taxon', filterState.taxonName);
    params.set('taxonRank', filterState.taxonRank!);
  }
  if (filterState.yearFrom !== null) params.set('yr0', String(filterState.yearFrom));
  if (filterState.yearTo   !== null) params.set('yr1', String(filterState.yearTo));
  if (filterState.months.size > 0)   params.set('months', [...filterState.months].sort((a,b) => a-b).join(','));
  if (selectedOccId !== null)        params.set('o', selectedOccId);
  return params;
}
```

### Pattern 2: Parsing URL Params on Load

**What:** Read `window.location.search` on startup, validate each param, fall back to defaults.
**When to use:** Called once in `firstUpdated` before the OL map is created.

```typescript
// Source: SalishSea parseUrlParams pattern + MDN URLSearchParams
const DEFAULT_LON = -120.5;
const DEFAULT_LAT = 47.5;
const DEFAULT_ZOOM = 7;

function parseUrlParams(search: string): ParsedParams {
  const p = new URLSearchParams(search);
  const x = parseFloat(p.get('x') ?? '');
  const y = parseFloat(p.get('y') ?? '');
  const z = parseFloat(p.get('z') ?? '');
  const lon = isFinite(x) && x >= -180 && x <= 180 ? x : DEFAULT_LON;
  const lat = isFinite(y) && y >= -90  && y <= 90  ? y : DEFAULT_LAT;
  const zoom = isFinite(z) && z >= 1   && z <= 22  ? z : DEFAULT_ZOOM;

  const taxonName = p.get('taxon') ?? null;
  const rawRank   = p.get('taxonRank') ?? null;
  const taxonRank = ['family','genus','species'].includes(rawRank ?? '')
    ? rawRank as 'family' | 'genus' | 'species' : null;
  const yearFrom = parseInt(p.get('yr0') ?? '') || null;
  const yearTo   = parseInt(p.get('yr1') ?? '') || null;
  const monthsStr = p.get('months') ?? '';
  const months = new Set(
    monthsStr.split(',').map(Number).filter(n => n >= 1 && n <= 12)
  );
  const occurrenceId = p.get('o') ?? null;

  return { lon, lat, zoom, taxonName, taxonRank, yearFrom, yearTo, months, occurrenceId };
}
```

### Pattern 3: moveend + debounced pushState

**What:** Listen to OL `moveend` event; use `replaceState` during movement, `pushState` after 500ms settle.
**When to use:** Wired in `firstUpdated` after map creation.

```typescript
// Source: SalishSea map-move handler pattern
private _mapMoveDebounce: ReturnType<typeof setTimeout> | null = null;

// After this.map = new OpenLayersMap({...}):
this.map.on('moveend', () => {
  if (this._isRestoringFromHistory) return;

  const view = this.map!.getView();
  const center = toLonLat(view.getCenter()!);
  const zoom = view.getZoom()!;

  // replaceState immediately for live URL bar update
  const params = buildSearchParams(center, zoom, filterState, this._selectedOccId);
  window.history.replaceState({}, '', '?' + params.toString());

  // pushState after 500ms settle for back-button navigation
  if (this._mapMoveDebounce) clearTimeout(this._mapMoveDebounce);
  this._mapMoveDebounce = setTimeout(() => {
    window.history.pushState({}, '', '?' + params.toString());
    this._mapMoveDebounce = null;
  }, 500);
});
```

### Pattern 4: popstate handler

**What:** When user hits browser back/forward, re-parse URL and restore app state.
**When to use:** Bound in `firstUpdated`, cleaned up in `disconnectedCallback`.

```typescript
// Source: SalishSea #handlePopState pattern
private _onPopState = () => {
  this._isRestoringFromHistory = true;
  if (this._mapMoveDebounce) {
    clearTimeout(this._mapMoveDebounce);
    this._mapMoveDebounce = null;
  }
  try {
    const parsed = parseUrlParams(window.location.search);
    const view = this.map!.getView();
    view.setCenter(fromLonLat([parsed.lon, parsed.lat]));
    view.setZoom(parsed.zoom);
    // Restore filter state + update sidebar
    this._restoreFilterState(parsed);
    // Restore selected occurrence if present
    if (parsed.occurrenceId) {
      this._restoreSelectedOccurrence(parsed.occurrenceId);
    } else {
      this.selectedSamples = null;
    }
  } finally {
    this._isRestoringFromHistory = false;
  }
};

// In firstUpdated:
window.addEventListener('popstate', this._onPopState);

// In disconnectedCallback:
disconnectedCallback() {
  super.disconnectedCallback();
  window.removeEventListener('popstate', this._onPopState);
}
```

### Pattern 5: Filter change URL sync

**What:** After `_applyFilter` mutates filterState, also update the URL.
**When to use:** At the end of `_applyFilter`.

```typescript
// Append to existing _applyFilter method:
private _applyFilter(detail: FilterChangedEvent) {
  // ... existing mutation + clusterSource.changed() ...

  // URL sync — use replaceState (filter changes are like map moves)
  if (!this._isRestoringFromHistory) {
    const view = this.map!.getView();
    const center = toLonLat(view.getCenter()!);
    const zoom = view.getZoom()!;
    const params = buildSearchParams(center, zoom, filterState, this._selectedOccId);
    window.history.replaceState({}, '', '?' + params.toString());
    // pushState after 500ms settle (same debounce timer as moveend)
    if (this._mapMoveDebounce) clearTimeout(this._mapMoveDebounce);
    this._mapMoveDebounce = setTimeout(() => {
      window.history.pushState({}, '', '?' + params.toString());
      this._mapMoveDebounce = null;
    }, 500);
  }
}
```

### Pattern 6: Restoring selected occurrence

**What:** On page load or popstate with `o` param, find the feature and open its sidebar panel.
**Note:** The `o` param value is the full namespaced ID like `ecdysis:12345`. Features are stored with that exact string ID (set in `parquet.ts`: `feature.setId(`ecdysis:${obj.ecdysis_id}`)`).

```typescript
private _restoreSelectedOccurrence(occId: string) {
  // specimenSource.getFeatureById() returns the feature by its setId string
  const feature = specimenSource.getFeatureById(occId) as Feature | null;
  if (feature) {
    const toShow = isFilterActive(filterState)
      ? [feature].filter(f => matchesFilter(f, filterState))
      : [feature];
    if (toShow.length > 0) {
      this.selectedSamples = buildSamples(toShow);
    }
  }
}
```

**Critical timing issue:** On initial page load, if `o` param is present, `specimenSource` may not have loaded yet. The existing `specimenSource.once('change', ...)` callback fires after features load — occurrence restoration must happen inside that callback, not immediately in `firstUpdated`.

### Pattern 7: Restoring filter state into sidebar

**What:** When restoring from URL or popstate, the `BeeSidebar` internal Lit reactive state (`_taxonInput`, `_yearFrom`, etc.) must be updated to match the restored filter. Since these are private `@state()` properties, the only way to drive them externally is to either: (a) pass them down as `@property` from `BeeMap`, or (b) call `_dispatchFilterChanged` from sidebar after updating its own state.

**Recommended approach:** Keep `BeeSidebar`'s filter state properties private but promote the relevant ones to `@property({ attribute: false })` so `BeeMap` can push initial values down. This is the standard Lit data-down pattern.

**Alternative:** Add a public method `restoreFilter(state: FilterChangedEvent)` on `BeeSidebar` that sets internal `@state` fields and dispatches. Less Lit-idiomatic but simpler.

**Most practical approach given existing architecture:** Expose filter state as `@property` on `BeeSidebar` for each dimension, set from `BeeMap` when restoring. `BeeMap` already passes `summary`, `taxaOptions`, and `filteredSummary` as properties — this follows the same pattern.

### Anti-Patterns to Avoid

- **Updating URL on every keypress:** Both `moveend` and filter changes should use the replaceState + debounced pushState pattern; never pushState on every individual event.
- **Using hash/fragment:** Locked out by user decision; server cannot read it.
- **Using `window.location.href = url`:** Causes page reload; use `history.replaceState` or `history.pushState`.
- **Forgetting `_isRestoringFromHistory` flag:** Restoring view state triggers `moveend`, which would write URL, which is fine (idempotent), but the flag prevents the debounce timer from re-pushing an entry that was just popped.
- **Restoring occurrence before data loads:** `specimenSource.getFeatureById()` returns null before `once('change')` fires. Queue occurrence restoration in the change callback.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Query string parsing | Manual string split/regex | `URLSearchParams` | Handles encoding, edge cases, duplicate keys |
| Coordinate encoding | Custom serialization | `toLonLat()` + `toFixed(4)` | OL already handles EPSG:3857 → lon/lat |
| Debounce | Custom promise-based timer | `setTimeout`/`clearTimeout` | 5 lines; this is the SalishSea exact pattern |

**Key insight:** Every problem in this phase has a native browser or already-imported OL solution. Resist the urge to pull in a URL state management library — they add complexity without benefit here.

---

## Confirmed Specifics

### Occurrence ID column

**Confirmed:** The Parquet column is `ecdysis_id` (see `data/ecdysis/occurrences.py` line 113: `'id': 'ecdysis_id'`). The frontend sets feature IDs as `ecdysis:${obj.ecdysis_id}` (see `parquet.ts` line 31). The `o` URL param should store the full `ecdysis:{id}` string. `specimenSource.getFeatureById('ecdysis:12345')` will work.

### Filter param names

Confirmed mapping from `FilterState` interface to URL params:

| FilterState field | URL param | Format | Example |
|-------------------|-----------|--------|---------|
| `taxonName` | `taxon` | String | `taxon=Bombus` |
| `taxonRank` | `taxonRank` | `family\|genus\|species` | `taxonRank=genus` |
| `yearFrom` | `yr0` | Integer | `yr0=2018` |
| `yearTo` | `yr1` | Integer | `yr1=2022` |
| `months` (Set) | `months` | Comma-separated 1–12 | `months=3,4,5` |
| selected occurrence | `o` | namespaced ID | `o=ecdysis:12345` |

Note: `taxon` and `taxonRank` must be stored together — a taxon name alone is ambiguous without its rank. On restore, if only one is present, treat both as absent (graceful fallback).

### Default view coordinates

Washington State at full extent: **lon = -120.5, lat = 47.5, zoom = 7**. The existing `bee-map.ts` uses `-120.32, 47.47` at zoom 6–8 depending on screen width. For URL sharing, a single default is needed; use lon=-120.5, lat=47.5, zoom=7 as reasonable center-of-state defaults (covers the Cascades-to-coast range well).

### OL `moveend` event

Confirmed: `this.map.on('moveend', handler)` fires after pan/zoom completes. Inside the handler, `this.map.getView().getCenter()` returns the center in EPSG:3857 (Web Mercator). Convert with `import { toLonLat } from 'ol/proj.js'` — already imported in parquet.ts but needs adding to bee-map.ts imports.

### `history.replaceState` vs `history.pushState` state object

The state object (first argument) can be `{}` — BeeAtlas restores from `window.location.search` on `popstate`, not from `event.state`. This keeps the implementation simpler and avoids any state size limits.

---

## Common Pitfalls

### Pitfall 1: moveend fires during programmatic view restoration
**What goes wrong:** When `popstate` fires and you call `view.setCenter()` + `view.setZoom()`, OL fires `moveend`, which updates the URL, which may interfere.
**Why it happens:** `setCenter`/`setZoom` are not atomic from OL's perspective.
**How to avoid:** Set `this._isRestoringFromHistory = true` before restoration, check this flag at the top of the `moveend` handler, set back to `false` in a `finally` block.
**Warning signs:** Back button triggers two pushState entries instead of one.

### Pitfall 2: Occurrence restore races data load
**What goes wrong:** On fresh page load with `?o=ecdysis:12345`, calling `specimenSource.getFeatureById()` before features are loaded returns `null`, and the selection is silently lost.
**Why it happens:** `specimenSource` (ParquetSource) loads asynchronously; `firstUpdated` runs before data arrives.
**How to avoid:** Inside `specimenSource.once('change', () => { ... })`, check for the `o` param and call `_restoreSelectedOccurrence` there.
**Warning signs:** Shared links with `o` param don't open the specimen detail panel.

### Pitfall 3: BeeSidebar internal state not reflecting URL-restored filter
**What goes wrong:** `filterState` singleton is updated and map repaints correctly, but the sidebar filter controls still show blank inputs.
**Why it happens:** `BeeSidebar`'s `_taxonInput`, `_yearFrom`, `_yearTo`, `_months` are Lit `@state()` — they don't update when the parent writes to `filterState`.
**How to avoid:** Pass filter values as properties from `BeeMap` to `BeeSidebar`, or add a public method on `BeeSidebar` that sets internal state. Must update sidebar UI, not just `filterState`.
**Warning signs:** After using back button, map shows filtered results but filter controls appear blank.

### Pitfall 4: `toLonLat` not imported in bee-map.ts
**What goes wrong:** TypeScript compile error — `toLonLat` is currently only imported in `parquet.ts`.
**Why it happens:** `bee-map.ts` only imports `fromLonLat` currently.
**How to avoid:** Add `toLonLat` to the `ol/proj.js` import in `bee-map.ts`.

### Pitfall 5: Decimal precision causing URL drift
**What goes wrong:** Storing center as raw floating-point causes URL to change on every render even without user movement (IEEE 754 rounding).
**Why it happens:** `getCenter()` may return slightly different values each call.
**How to avoid:** Round lon/lat to 4 decimal places (≈11m precision), zoom to 2 decimal places. Use `.toFixed(4)` / `.toFixed(2)`.

### Pitfall 6: `months` param with empty string
**What goes wrong:** Splitting empty string `""` by comma gives `[""]`, and `Number("")` is `0`, which passes `n >= 1 && n <= 12` check? No, 0 fails. But `Number("")` is `0` so `0 >= 1` is false — this is safe.
**How to avoid:** Guard: `if (monthsStr) { ... }` or filter `n >= 1 && n <= 12` as above.

---

## Code Examples

Verified patterns from official sources:

### Get center in lon/lat from OL View
```typescript
// Source: OpenLayers official moveend example + ol/proj docs
import { toLonLat } from 'ol/proj.js';

this.map.on('moveend', () => {
  const view = this.map!.getView();
  const center3857 = view.getCenter()!;     // [x, y] in EPSG:3857
  const [lon, lat] = toLonLat(center3857);  // [lon, lat] in degrees
  const zoom = view.getZoom()!;
});
```

### Set view from lon/lat
```typescript
// Source: OpenLayers View API docs
import { fromLonLat } from 'ol/proj.js';

const view = this.map!.getView();
view.setCenter(fromLonLat([lon, lat]));
view.setZoom(zoom);
```

### URLSearchParams construction and reading
```typescript
// Source: MDN Web Docs — URLSearchParams
const params = new URLSearchParams(window.location.search);
const x = parseFloat(params.get('x') ?? '');   // NaN if missing
params.set('x', lon.toFixed(4));
window.history.replaceState({}, '', '?' + params.toString());
```

### popstate listener with arrow function for removeEventListener
```typescript
// Source: MDN Working with the History API
// Arrow function stored as property so removeEventListener works
private _onPopState = () => { ... };

// In firstUpdated:
window.addEventListener('popstate', this._onPopState);

// In disconnectedCallback (important! prevents memory leak):
window.removeEventListener('popstate', this._onPopState);
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `location.hash` for SPA state | `history.pushState` + query string | 2012 (HTML5 History API) | Server can read query string for SSR previews |
| Router libraries for state sync | Native `URLSearchParams` + History API | Established pattern | Zero dependencies |

**Deprecated/outdated:**
- Hash routing (`#/path`): Still works but hash is opaque to servers — ruled out by user decision for OG preview compatibility.

---

## Open Questions

1. **Should filter changes use replaceState-only or the same debounced pushState?**
   - What we know: SalishSea uses replaceState for map moves. Filter changes are discrete (user clicks checkbox or selects taxon), not continuous.
   - What's unclear: User decision says "replaceState during continuous interactions, pushState after 500ms debounce on settle." Filter changes by checkbox are not continuous — they could immediately pushState.
   - Recommendation: Use the same 500ms debounced pushState for all state changes (map + filter). Simpler; single debounce timer covers everything.

2. **How to restore BeeSidebar filter controls when navigating history?**
   - What we know: `BeeSidebar` uses private `@state()` for filter fields. `BeeMap` already passes `summary`, `taxaOptions`, `filteredSummary` as properties.
   - Recommendation: Convert `BeeSidebar`'s `_taxonInput`, `_taxonRank`, `_taxonName`, `_yearFrom`, `_yearTo`, `_months` to `@property({ attribute: false })` driven from `BeeMap`. This is more Lit-idiomatic than a public method and avoids imperative coupling. `BeeMap` then tracks these as its own `@state` fields and passes them down.

3. **Initial page load with no params: should `replaceState` be called?**
   - Recommendation: Yes — call `replaceState` with default params on `firstUpdated` so the initial entry has state. Follows MDN recommendation. This also makes the URL bar immediately show params, hinting to users that the URL is shareable.

---

## Sources

### Primary (HIGH confidence)
- OpenLayers v10.8.0 API — View class: `getCenter()`, `getZoom()`, `setCenter()`, `setZoom()` — https://openlayers.org/en/latest/apidoc/module-ol_View-View.html
- OpenLayers moveend example — `map.on('moveend', handler)`, `toLonLat(center)` pattern — https://openlayers.org/en/latest/examples/moveend.html
- MDN History API — `pushState`, `replaceState`, `popstate` — https://developer.mozilla.org/en-US/docs/Web/API/History_API/Working_with_the_History_API
- Project source `frontend/src/parquet.ts` — confirms `feature.setId('ecdysis:${obj.ecdysis_id}')` (line 31)
- Project source `data/ecdysis/occurrences.py` — confirms `ecdysis_id` Parquet column (line 113)
- Project source `frontend/src/filter.ts` — confirms `FilterState` interface shape (all fields)
- Project source `frontend/src/bee-map.ts` — confirms existing map/view setup, import patterns, `_applyFilter` signature

### Secondary (MEDIUM confidence)
- SalishSea reference implementation (via WebFetch of raw GitHub source) — confirmed exact `x`, `y`, `z`, `o` param names; `replaceState` during movement; `pushState` on 500ms debounce; `#isRestoringFromHistory` flag; `#handlePopState` with `clearTimeout` before restoration — https://github.com/salish-sea/salishsea-io/blob/main/src/salish-sea.ts

### Tertiary (LOW confidence)
- None

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all APIs are native browser or already-imported OL; no new libraries
- Architecture: HIGH — source code read directly; SalishSea reference fetched directly
- Pitfalls: HIGH — derived from actual codebase analysis (race condition with data load, missing toLonLat import, sidebar state disconnect)

**Research date:** 2026-02-22
**Valid until:** 2026-03-22 (stable APIs — History API and OL View are extremely stable)
