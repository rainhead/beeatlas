# Phase 153: Occurrences Near Me - Pattern Map

**Mapped:** 2026-06-20
**Files analyzed:** 5 (all modified — no new files)
**Analogs found:** 5 / 5 (all in-file analogs — every change mirrors an existing idiom in the same file)

This phase adds a single boolean filter. There are no new files; every change is a small extension that should copy an existing same-file pattern verbatim. The strongest guidance is therefore "copy the adjacent sibling," not "find a remote analog."

## File Classification

| Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---------------|------|-----------|----------------|---------------|
| `src/filter.ts` | model + query builder | transform / CRUD-read | `selectedPlace` field + elevation clause (same file) | exact |
| `src/url-state.ts` | config / serializer | transform | `place` param (buildParams) + `selectedPlace` parse (same file) | exact |
| `src/bee-pane.ts` | component (presenter) | event-driven | `.chip` render in `_renderWhere` + `_emitFilter` (same file) | role-match (standalone, not nested) |
| `src/bee-atlas.ts` | provider (state owner) | event-driven | `_onUserLocationChanged` + `_runFilterQuery`/`_filterGuard` (same file) | exact |
| `src/bee-map.ts` | component (presenter) | request-response | geolocate auto-trigger block + `_emit` (same file) | exact |

## Pattern Assignments

### `src/filter.ts` (model + query builder)

Three sibling patterns to copy. The `selectedPlace` field is the closest analog throughout because it is the most recently-added singular FilterState field and threads through every spot the new field must.

**1. FilterState field** — copy the `selectedPlace` line idiom (`filter.ts:24`). Add a bare boolean:
```typescript
selectedPlace: string | null;   // existing
nearMe: boolean;                 // NEW — boolean (not nullable), default false
```
NOTE: every constructor / default-FilterState literal in the codebase must add `nearMe: false`. Grep for `selectedPlace:` to find them all.

**2. `isFilterActive`** — copy the OR-chain idiom (`filter.ts:233-244`). Add `|| f.nearMe`:
```typescript
export function isFilterActive(f: FilterState): boolean {
  return f.taxonId !== null
    // ...existing clauses...
    || f.selectedPlace !== null
    || f.nearMe;        // NEW
}
```
Pitfall (RESEARCH Pitfall 1): omitting this makes `queryVisibleGeoJSON` early-return null (`filter.ts:331`) → map shows ALL points despite an active chip.

**3. `buildFilterSQL` signature + proximity clause** — the existing clauses push bare-column comparisons (year/month/elevation use bare `lat`/`lon`-style unqualified columns). The elevation block (`filter.ts:313-320`) is the closest structural analog: a conditional block that pushes onto `occurrenceClauses`, AND-joined automatically at `filter.ts:322`.

Signature change (NEW optional second param, defaulting null — NOT on FilterState, per D-07):
```typescript
export function buildFilterSQL(
  f: FilterState,
  nearMeCenter: { lat: number; lon: number } | null = null
): { occurrenceWhere: string } {
```
Insert AFTER the elevation block (`filter.ts:320`), before the join at `:322`. Use bare `lat`/`lon` (matching the bounds clauses already in the file — `lat`/`lon` exist only in `occurrences`, so unqualified is unambiguous; RESEARCH note at line 152). Interpolate as bare numerics like `yearFrom`/`elevMin` do (numbers from GeolocationCoordinates, no string escaping). Guard with `isFinite()` first (RESEARCH V5 / Pitfall — same `isFinite` guard Phase 152 applies at `bee-atlas.ts:996`). Exact SQL given in RESEARCH Pattern 1 (`153-RESEARCH.md:131-150`).

**4. Thread `nearMeCenter` through all query callers.** `queryVisibleGeoJSON(f)` (`filter.ts:326`) and the sibling exported query functions (`queryListPage`, `queryTablePage`, `queryAllFiltered`, `queryOccurrencesByBounds`) each call `buildFilterSQL(f)` — add the optional `nearMeCenter` param and pass it down. Copy the existing `buildFilterSQL(f)` call-site idiom; just add the second arg.

### `src/url-state.ts` (config / serializer)

The `place` param is the exact analog — most-recent singular param, serialized only when set, parsed plainly.

**buildParams** — copy `filter.ts`-style guarded `params.set` (`url-state.ts:104-106`):
```typescript
if (filter.selectedPlace !== null) {
  params.set('place', filter.selectedPlace);     // existing analog
}
if (filter.nearMe) {
  params.set('near', '1');                        // NEW — only when active (D-07)
}
```

**parseParams** — copy the plain `selectedPlace` parse (`url-state.ts:172`) and the boolean-from-presence idiom:
```typescript
const selectedPlace = p.get('place') ?? null;     // existing analog
const nearMe = p.get('near') === '1';             // NEW
```
Then add `nearMe` to BOTH the `hasFilter` guard (`url-state.ts:188-191` — add `|| nearMe`) AND the `result.filter` object literal (`url-state.ts:193-205` — add `nearMe,`). Pitfall 1 (RESEARCH): the `hasFilter` OR-chain is a parallel copy of `isFilterActive` and must also learn `near`. Coordinates are NEVER serialized (D-07 / Pitfall 5) — only the boolean.

### `src/bee-pane.ts` (component — standalone chip)

D-06: standalone chip on its own line, NOT inside `_renderWhere`. But it copies the `.chip` / `.chip-remove` render mechanics verbatim.

**Chip render** — copy the single-value chip pattern from `_renderWhere` (`bee-pane.ts:1004-1010`, the `selectedPlace` chip — closest because it is a singular conditional chip, not a `.map()` list):
```typescript
${this._nearMe ? html`
  <span class="chip">
    Near me &middot; 10&nbsp;km
    <button class="chip-remove" @click=${() => this._removeNearMe()}
      aria-label="Remove near me filter">&#x2715;</button>
  </span>
` : nothing}
```
Render this in a NEW standalone render method (e.g. `_renderNearMe()`) on its own row, sibling to `_renderWho`/`_renderWhere`/`_renderWhen`, NOT nested inside `_renderWhere`. Reuse `.chip` / `.chip-remove` CSS (`bee-pane.ts:303-325`) unchanged.

**Event emit** — RESEARCH Q3 recommends a DEDICATED `near-me-changed` (boolean) event rather than threading `nearMe` through `_emitFilter` (`bee-pane.ts:569-588`), because chip activation triggers geolocation (a side effect), not just a SQL clause. Copy the `dispatchEvent(new CustomEvent(..., { bubbles: true, composed: true, detail }))` shape from `_emitFilter`:
```typescript
private _emitNearMe(active: boolean) {
  this.dispatchEvent(new CustomEvent<boolean>('near-me-changed', {
    bubbles: true, composed: true, detail: active,
  }));
}
```
bee-pane mirrors `nearMe` as a local `@state() private _nearMe` (like `_selectedPlace`), updated from the incoming filter prop in the same sync method that updates the other mirrors.

### `src/bee-atlas.ts` (provider — state owner, activation + deferral)

Three same-file analogs combine here.

**1. State fields** — copy the `_userLocation` `@state` declaration (`bee-atlas.ts:122`) for reactive state, and the non-reactive private-field style (`bee-atlas.ts:140`) for the ephemeral center + one-shot flag:
```typescript
// _nearMeCenter is the FROZEN snapshot (D-04) — NOT @state, NOT on FilterState (D-07)
private _nearMeCenter: { lat: number; lon: number } | null = null;
private _nearMePending = false;   // one-shot GPS-fix barrier (RESEARCH Pattern 3)
```

**2. Activation handler** — new `_onNearMeToggle(e: CustomEvent<boolean>)` wired in the `<bee-map>`/`<bee-pane>` template the same way `@user-location-changed=${this._onUserLocationChanged}` is wired (`bee-atlas.ts:376`). Flow (RESEARCH diagram `153-RESEARCH.md:90-105`): set `_filterState.nearMe`, set `_nearMePending = true`, command `<bee-map>` to trigger the control; fast-path query immediately if `_userLocation` already non-null.

**3. Reach `<bee-map>` to trigger the control** — bee-atlas has NO element-ref pattern today. Add `@query('bee-map')` (mirror `bee-map.ts:32` `@query('#map')` decorator usage) to get a handle, then call a new public `triggerGeolocate()` method (see bee-map below).

**4. Deferred query in `_onUserLocationChanged`** — copy the EXISTING handler (`bee-atlas.ts:986-1000`), which deliberately does NOT re-query (D-04 keeps it that way). Add a one-shot block in the success branch only:
```typescript
this._userLocation = { lat, lon, accuracy };
this._locationError = false;
if (this._nearMePending) {                 // NEW — one-shot (RESEARCH Pattern 3 / Pitfall 3)
  this._nearMeCenter = { lat, lon };       // FROZEN snapshot (D-04)
  this._nearMePending = false;             // subsequent fixes do NOT re-query
  this._runFilterQuery();
}
```

**5. Guarded query** — copy `_runFilterQuery` (`bee-atlas.ts:591-597`) which already wraps `queryVisibleGeoJSON(this._filterState)` in `this._filterGuard`. Change the inner call to pass the ephemeral center:
```typescript
const guarded = await this._filterGuard(
  () => queryVisibleGeoJSON(this._filterState, this._nearMeCenter)   // NEW arg
);
```
The deferred near-me query slots into the SAME `_filterGuard` (makeStaleGuard, `stale-guard.ts`) unchanged — a re-tap or filter change discards a stale in-flight result (CLAUDE.md filter race guard invariant).

### `src/bee-map.ts` (component — programmatic GeolocateControl trigger)

Today the `geolocate` control is a local `const` inside `firstUpdated` (`bee-map.ts:396`). RESEARCH Q2/A2: lift it to an instance field and add a public method. Copy the existing auto-trigger robustness (`bee-map.ts:418-426`) — `.trigger()` must tolerate the not-yet-`_setup` case (Pitfall 4):
```typescript
private _geolocate?: mapboxgl.GeolocateControl;   // lifted from local const at :396

// Public command (pure-presenter: command in, no upward state). Called by <bee-atlas>.
triggerGeolocate() {
  this._geolocate?.trigger();
}
```
Keep the geolocate `'geolocate'`/`'error'` → `this._emit('user-location-changed', ...)` relay (`bee-map.ts:406-416`) unchanged — near-me consumes that existing relay; it does not open its own `getCurrentPosition` (D-03). `_emit` helper is at `bee-map.ts:165`.

## Shared Patterns

### Filter-active signal (style-cache bypass)
**Source:** `isFilterActive` (`filter.ts:233`)
**Apply to:** `filter.ts`, `url-state.ts` (`hasFilter`)
`nearMe` flows through `isFilterActive`, which is the single active-filter signal gating both `queryVisibleGeoJSON`'s early-return AND the mapbox-gl style-cache bypass (CLAUDE.md Architecture Invariant). Adding `|| f.nearMe` to `isFilterActive` makes near-me participate in cache bypass automatically — verify, do not add a parallel check.

### Stale-query race guard
**Source:** `makeStaleGuard` (`stale-guard.ts`) via `_filterGuard` (`bee-atlas.ts:144`, used at `:592`)
**Apply to:** the deferred near-me query
The GPS-fix-deferred query MUST go through the existing `_filterGuard` so re-tap / filter-change discards stale results. No new generation counter (RESEARCH "Don't Hand-Roll").

### Numeric SQL interpolation + isFinite guard
**Source:** elevation clauses (`filter.ts:313-320`) + Phase 152 accuracy guard (`bee-atlas.ts:996`)
**Apply to:** the haversine/bbox clause
lat/lon are JS numbers from `GeolocationCoordinates`, interpolated bare like `elevMin`/`yearFrom`; guard with `isFinite()` before building SQL (V5 / SQL-injection mitigation — RESEARCH Security Domain).

### Custom-event emit shape
**Source:** `_emitFilter` (`bee-pane.ts:573`) / `_emit` (`bee-map.ts:165`)
**Apply to:** the new `near-me-changed` event (bee-pane) and any bee-map emits
Always `{ bubbles: true, composed: true, detail }`.

## No Analog Found

None. Every change has an exact or near-exact same-file sibling. The only genuinely new construct is the `<bee-atlas>`→`<bee-map>` imperative command (`triggerGeolocate()` via `@query`), and even that mirrors the `@query('#map')` decorator usage and the existing `.trigger()` robustness block in bee-map.

## Metadata

**Analog search scope:** `src/filter.ts`, `src/url-state.ts`, `src/bee-pane.ts`, `src/bee-atlas.ts`, `src/bee-map.ts`, `src/stale-guard.ts`
**Files scanned:** 6
**Pattern extraction date:** 2026-06-20
