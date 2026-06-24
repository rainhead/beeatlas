# Phase 164: Sidebar occurrence list ignores `src=` source filter — Research

**Researched:** 2026-06-24
**Domain:** TypeScript / Lit web component state-model patch (`src/filter.ts`, `src/url-state.ts`, `src/bee-atlas.ts`)
**Confidence:** HIGH — all findings are grounded in direct source-file reads of the current codebase

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

- **D-01:** Fix **all count-bearing SQL views** — the list, the filtered result count (`_filteredRowCount`), CSV export, and table view all run through `buildFilterSQL`, so one predicate fixes all four. The all-time summary stats in `_loadSummaryFromSQLite` (`total_specimens`, earliest/latest year) are NOT source-filtered.
- **D-02:** Promote source into `FilterState` as a first-class field (parallel to how `bounds` became first-class in Phase 156). Fold the source predicate into `buildFilterSQL`, and add it to `isFilterActive`. URL contract unchanged: keep `src=` param name/format and its round-trip. Internal home moves to `FilterState`; serialization path stays as today's `ui.hiddenSources` channel.
- **D-03:** Leave the map as-is. The map's client-side `_visibleBySource` is structurally required (Mapbox clusters at the source level; a layer filter cannot hide cluster bubbles). Do not converge the map to SQL.
- **D-04 (derived constraint):** `<bee-map>` MUST keep its `hiddenSources` property and `_visibleBySource`. Do not remove them. With source in `FilterState`, the main dot layer gets a harmless idempotent double-filter (SQL + `_visibleBySource`). Ghost and selection sets still net to empty for hidden sources as today. Removing `_visibleBySource` reintroduces ghost-dot bug.
- **D-05:** All 4 sources deselected → SQL views show honest empty (zero). "All-off = show all" rejected.

### Claude's Discretion

- Exact SQL shape: `source IN (...)` over visible sources vs `source NOT IN (...)` over hidden (see research recommendation below). Where in `buildFilterSQL` the clause sits.

### Deferred Ideas (OUT OF SCOPE)

None. (Phase 165 separately tracks the duplicate occ_id list-rendering bug.)
</user_constraints>

---

## Summary

The root cause is a clean state-model gap: `hiddenSources` lives as `_hiddenSources: Set<SourceKey>` on `<bee-atlas>` (line 104) in parallel with `_filterState: FilterState` (line 82), but is never passed into `buildFilterSQL`. Every SQL query path — `queryVisibleGeoJSON`, `queryListPage`, `queryTablePage`, `queryAllFiltered` — is source-blind. The map applies source filtering separately via `bee-map._visibleBySource` over the in-memory full GeoJSON, which is why only the map respects the filter.

The fix follows the identical template Phase 156 used to promote `bounds` into `FilterState`: add a field (`hiddenSources: Set<SourceKey>`), add a predicate clause in `buildFilterSQL`, add it to `isFilterActive`, and rewire the state owner (`bee-atlas`) to write into `_filterState.hiddenSources` rather than a standalone `_hiddenSources`. The URL serialization channel (`ui.hiddenSources` → `src=`) does not change.

Three TypeScript files change: `src/filter.ts` (type + clause + isFilterActive), `src/url-state.ts` (move `hiddenSources` from being UI-state-only to also feeding FilterState in `parseParams`), and `src/bee-atlas.ts` (rewire `_onSourceFilterChanged` + two URL-restore sites + `_buildCurrentParams`). No new packages, no dbt/data-contract work.

**Primary recommendation:** One-wave implementation — the changes are tightly coupled and individually non-functional. Add `hiddenSources` to `FilterState`, emit the SQL clause, rewire `bee-atlas.ts`, then update tests. Target: `npm test` green after a single atomic commit per plan task.

---

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Source-filter SQL predicate | `filter.ts` (`buildFilterSQL`) | — | Single WHERE-clause builder consumed by all four SQL views — adding the predicate here is the one-change-fixes-four point |
| `isFilterActive` source check | `filter.ts` (`isFilterActive`) | — | Pure function over FilterState; controls style-cache bypass, chip visibility, CSV label |
| `FilterState.hiddenSources` field | `filter.ts` (type def) | `bee-atlas.ts` (owner) | Type lives in filter domain; `@state` instance lives in `bee-atlas` |
| URL `src=` serialization | `url-state.ts` (`buildParams`) | — | Unchanged — still writes visible-source list from `ui.hiddenSources`; source must also be returned from `parseParams` as `filter.hiddenSources` |
| State init from URL | `bee-atlas.ts` (`firstUpdated`, `_onPopState`) | `url-state.ts` | Both restoration paths must assign `_filterState.hiddenSources` from the parsed value |
| Source-change handler | `bee-atlas.ts` (`_onSourceFilterChanged`) | — | Must write `_filterState.hiddenSources` and trigger the three query methods |
| Map source filtering | `bee-map.ts` (`_visibleBySource`) | — | Unchanged — receives `hiddenSources` prop from `bee-atlas`, double-filters the GeoJSON for correct Mapbox cluster behavior (D-03/D-04) |
| `bee-map` prop feed | `bee-atlas.ts` render template | `bee-map.ts` | `.hiddenSources=${this._filterState.hiddenSources}` replaces `.hiddenSources=${this._hiddenSources}` |
| `bee-pane` prop feed | `bee-atlas.ts` render template | `bee-pane.ts` | `.hiddenSources=${this._filterState.hiddenSources}` replaces `.hiddenSources=${this._hiddenSources}` |

---

## Standard Stack

No new packages. Pure TypeScript refactor within the existing Lit + Vitest stack.

| Existing Library | Role | Notes |
|-----------------|------|-------|
| Lit `@state()` / `@property()` | Reactivity | No change to usage patterns |
| Vitest | Test runner — `npm test` | Source-assertion tests need updates; new SQL predicate tests go in `filter.test.ts` |
| TypeScript | Type checking | FilterState interface change requires type updates at all call sites |

---

## Package Legitimacy Audit

Not applicable — no new packages installed in this phase.

---

## Touchpoint Inventory

### 1. `src/filter.ts`

**A. `FilterState` interface (lines 13–26)**

Add `hiddenSources` field. Sources are a fixed 4-element enum; the field mirrors how `months: Set<number>` is modeled — an empty Set means "no source filter":

```typescript
// Before:
export interface FilterState {
  // ... existing fields
  bounds: { west: number; south: number; east: number; north: number } | null;
}

// After: add at end of interface
  hiddenSources: Set<SourceKey>; // empty Set = no source filter (show all)
}
```

`SourceKey` is already defined in `url-state.ts` (line 31). Import it into `filter.ts`:

```typescript
import type { SourceKey } from './url-state.ts';
```

**Important:** `SourceKey` is `'ecdysis' | 'waba_sample' | 'inat_obs' | 'checklist'` (url-state.ts line 31). The `VALID_SOURCES` set (url-state.ts line 33) is the authoritative allowlist.

**B. `isFilterActive(f)` (lines 246–258)**

Add `|| f.hiddenSources.size > 0` to the return chain. [VERIFIED: direct code read]

```typescript
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
    || f.selectedPlace !== null
    || f.bounds !== null
    || f.hiddenSources.size > 0;  // <-- add this
}
```

**C. `buildFilterSQL(f, hasPlacesBridge)` (lines 297–388) — SQL predicate**

Add after the bounds clause (before the final `occurrenceWhere` construction). Claude's Discretion: use `source IN (visibleSources)` over the visible set rather than `source NOT IN (hiddenSources)` over the hidden set — this correctly handles the D-05 all-off case (empty visible set → `source IN ()` → no rows match → honest zero) without requiring special-case logic. [VERIFIED: direct analysis of `VALID_SOURCES` enum and D-05 requirement]

```typescript
// Source filter — restrict to user-visible sources; empty visible set = honest zero (D-05).
// Sources are a fixed 4-element enum from url-state.ts VALID_SOURCES — no string interpolation
// of unvalidated user input. The values match the o.source column values in marts/occurrences.
// o.-alias invariant: qualify as o.source.
if (f.hiddenSources.size > 0) {
  const VALID_SOURCES: SourceKey[] = ['ecdysis', 'waba_sample', 'inat_obs', 'checklist'];
  const visibleSources = VALID_SOURCES.filter(s => !f.hiddenSources.has(s));
  if (visibleSources.length === 0) {
    // All sources hidden — force a false clause (no rows can match).
    occurrenceClauses.push('1 = 0');
  } else {
    const list = visibleSources.map(s => `'${s}'`).join(',');
    occurrenceClauses.push(`o.source IN (${list})`);
  }
}
```

Note: `o.source` matches the existing column `source: 'ecdysis' | 'waba_sample' | 'inat_obs' | 'checklist' | null` in `OccurrenceRow` (filter.ts line 74) and the dbt mart column confirmed at `data/dbt/models/marts/occurrences.sql:86`. The `o.`-alias invariant is satisfied.

Security note: `VALID_SOURCES` is a hardcoded constant — values come from the local allowlist, never from user input. This is safe despite being string-interpolated into SQL.

### 2. `src/url-state.ts`

The serialization contract is already correct for this phase's purpose — no write-side changes needed. The only change is on the **read side** (`parseParams`): move `hiddenSources` from being returned exclusively as `result.ui.hiddenSources` to ALSO being returned as `result.filter.hiddenSources`, so `bee-atlas.ts` can populate `_filterState.hiddenSources` during URL restore.

**Current flow (lines 293–302):**
```typescript
const srcRaw = p.get('src');
let hiddenSources: Set<SourceKey> | undefined;
if (srcRaw) {
  const visible = new Set(srcRaw.split(',').filter(s => VALID_SOURCES.has(s as SourceKey)) as SourceKey[]);
  const hidden = new Set([...VALID_SOURCES].filter(s => !visible.has(s)));
  hiddenSources = hidden.size > 0 ? hidden : undefined;
}
// ... included in result.ui only
```

**After change:** Parse `hiddenSources` identically (no logic change), then include it in BOTH the UI result (preserving the existing `src=` round-trip tests) AND in the filter result.

The `hasFilter` guard (lines 234–237) must also be extended to recognize a source param as constituting a filter, so `result.filter` is populated when only `src=` is present:

```typescript
const hasFilter = resolvedTaxonId !== null || yearFrom !== null || yearTo !== null
  || months.size > 0 || selectedCounties.size > 0 || selectedEcoregions.size > 0
  || selectedCollectors.length > 0 || elevMin !== null || elevMax !== null
  || selectedPlace !== null || boundsResult !== null
  || (hiddenSources !== undefined && hiddenSources.size > 0); // <-- add this
```

And in the `result.filter = { ... }` object (lines 239–252), add:
```typescript
hiddenSources: hiddenSources ?? new Set(),
```

**Write side (`buildParams`, lines 94–96):** Unchanged. Still reads from `ui.hiddenSources`:
```typescript
if (ui.hiddenSources && ui.hiddenSources.size > 0) {
  const visibleSources = [...VALID_SOURCES].filter(s => !ui.hiddenSources!.has(s)).sort();
  if (visibleSources.length > 0) params.set('src', visibleSources.join(','));
}
```
This stays as-is. The call site in `_buildCurrentParams` (bee-atlas.ts:1089–1096) continues to pass `hiddenSources: this._filterState.hiddenSources` (was `this._hiddenSources`) to the `ui` argument — the serialization channel does not change, which keeps all existing `url-state.test.ts` round-trip tests green.

### 3. `src/bee-atlas.ts`

**A. `_filterState` initial value (lines 82–95)**

Add `hiddenSources: new Set()` to the inline `_filterState` declaration:

```typescript
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
  bounds: null,
  hiddenSources: new Set(),   // <-- add
};
```

**B. Delete `_hiddenSources` field (line 104)**

Remove: `@state() private _hiddenSources: Set<SourceKey> = new Set();`

The source of truth is now `_filterState.hiddenSources`.

**C. `firstUpdated` URL restore (line 627)**

Before:
```typescript
this._hiddenSources = initialParams.ui?.hiddenSources ?? new Set();
```
After: The `_filterState` restore block (lines 631–646) must be extended to include `hiddenSources`:
```typescript
this._filterState = {
  // ... existing fields from initFilter ...
  hiddenSources: initialParams.filter?.hiddenSources ?? initialParams.ui?.hiddenSources ?? new Set(),
};
```
The `?? initialParams.ui?.hiddenSources` fallback handles the edge case where `hasFilter` was false (no other filter params present) but `src=` was in the URL — though extending `hasFilter` to include hidden sources (url-state.ts change) makes this fallback unnecessary in practice.

Also update the initial URL write (line 686) — change the `ui` argument:
```typescript
buildParams(
  { lon: initLon, lat: initLat, zoom: initZoom },
  this._filterState,
  initSel ?? { type: 'ids' as const, ids: [] },
  { boundaryMode: initBoundaryMode, paneState, hiddenSources: this._filterState.hiddenSources }
);
```

**D. `_onPopState` URL restore (lines 1290–1318)**

Before (line 1318): `this._hiddenSources = parsed.ui?.hiddenSources ?? new Set();`

After: Include `hiddenSources` in the `_filterState` assignment (lines 1290–1303):
```typescript
this._filterState = {
  // ... existing fields ...
  hiddenSources: parsed.filter?.hiddenSources ?? parsed.ui?.hiddenSources ?? new Set(),
};
```
Remove the standalone `_hiddenSources` assignment line.

Also ensure `isFilterActive` check at line 1353 covers the source-only filter correctly — it will, because `isFilterActive` now includes `f.hiddenSources.size > 0`.

**E. `_onSourceFilterChanged` (lines 1699–1702)**

This is the critical handler. Before:
```typescript
private _onSourceFilterChanged(e: CustomEvent<{ hiddenSources: Set<SourceKey> }>) {
  this._hiddenSources = e.detail.hiddenSources;
  this._replaceUrlState();
}
```

After: Write into `_filterState`, then re-run all three query methods (matching the same pattern as `_applyBoundsFilter`):
```typescript
private _onSourceFilterChanged(e: CustomEvent<{ hiddenSources: Set<SourceKey> }>) {
  this._filterState = { ...this._filterState, hiddenSources: e.detail.hiddenSources };
  this._listPage = 1;
  this._runFilterQuery();  // map + filter-result count
  this._runListQuery();    // sidebar list
  this._runTableQuery();   // table view
  this._replaceUrlState(); // URL sync (now also triggers isFilterActive → style-cache bypass)
}
```
Note: `_runFilterQuery` (line 755) calls `queryVisibleGeoJSON(this._filterState)` which calls `buildFilterSQL` — the new source clause rides this automatically. Similarly for `_runListQuery` (line 1020) and `_runTableQuery` (line 988). CSV (`_onDownloadCsv`, line 1600) calls `queryAllFiltered(this._filterState, ...)` which also calls `buildFilterSQL` — fixed automatically. [VERIFIED: direct code trace]

**F. `_buildCurrentParams` (lines 1088–1097)**

Before:
```typescript
{ boundaryMode: this._boundaryMode, paneState: this._paneState, hiddenSources: this._hiddenSources }
```
After:
```typescript
{ boundaryMode: this._boundaryMode, paneState: this._paneState, hiddenSources: this._filterState.hiddenSources }
```

**G. Render template — `<bee-map>` and `<bee-pane>` prop bindings (lines 503, 558)**

Before:
```
.hiddenSources=${this._hiddenSources}   // both elements
```
After:
```
.hiddenSources=${this._filterState.hiddenSources}   // both elements
```

**H. `_onFilterChanged` (lines 1522–1561)**

This handler processes the filter-chip form. It does NOT currently carry `hiddenSources` (by design — the source checkboxes emit their own `source-filter-changed` event). After this phase, `_onFilterChanged` must **preserve** `_filterState.hiddenSources` when rewriting `_filterState`:

```typescript
this._filterState = {
  taxonId: detail.taxonId,
  // ... all existing fields ...
  bounds: this._filterState.bounds,         // already preserved (D-05 comment)
  hiddenSources: this._filterState.hiddenSources,  // <-- add: preserve source filter across filter-chip changes
};
```

This parallels the existing `bounds` preservation pattern at line 1539.

**I. `_filterState` in `firstUpdated` `isFilterActive` guard (line 663)**

```typescript
if (isFilterActive(this._filterState)) {
  this._runFilterQuery();
}
```
No change needed — `isFilterActive` will now return true for source-only filter, so a source-filtered URL will correctly trigger the filter query on load.

---

## Four Consumer Confirmation

| Consumer | Call Site | How `buildFilterSQL` feeds it | Fixed by predicate? |
|----------|-----------|-------------------------------|---------------------|
| `queryVisibleGeoJSON` | `_runFilterQuery` (bee-atlas:756) | `buildFilterSQL(f, ...)` at filter.ts:400 | Yes |
| `queryListPage` | `_runListQuery` (bee-atlas:1020) | `buildFilterSQL(f, ...)` at filter.ts:463 | Yes |
| `queryTablePage` | `_runTableQuery` (bee-atlas:988) | `buildFilterSQL(f, ...)` at filter.ts:222 | Yes |
| `queryAllFiltered` (CSV) | `_onDownloadCsv` (bee-atlas:1600) | `buildFilterSQL(f, ...)` at filter.ts:177 | Yes |
| `_loadSummaryFromSQLite` | boot sequence (bee-atlas:763) | **Does NOT use `buildFilterSQL`** — raw SQL `WHERE ecdysis_id IS NOT NULL` | Correctly NOT fixed (D-01 note) |

`queryOccurrencesByBounds` (filter.ts:508) also calls `buildFilterSQL` and will receive the source predicate. This function is no longer called from `bee-atlas.ts` (replaced by `_runListQuery` per bee-atlas.test.ts:367 comment), and only appears in test utilities. The source predicate there is harmless and consistent.

---

## `intendedFilterActive` / Style-Cache Bypass Analysis

After this change, `intendedFilterActive` (bee-atlas.ts:200) will return `true` when `_filterState.hiddenSources.size > 0` (because `isFilterActive` now includes that check). This means:

1. **Map enters filter-active branch** (`_applyVisibleIds`, bee-map.ts:601–628): renders `filteredGeoJSON ?? empty`. `filteredGeoJSON` comes from `queryVisibleGeoJSON` which now includes the source predicate — so filtered features are already source-correct. Then `_visibleBySource` strips hidden sources again (idempotent double-filter, D-04). Main dot layer: correct. Ghost layer: `_visibleBySource` is applied at bee-map.ts:613 to the ghost set, stripping hidden-source features — so no ghost-dot regression. Selection overlay: `_visibleBySource` at bee-map.ts:658 — same, no regression.

2. **Style-cache bypass** (CLAUDE.md invariant): "bypass cache when `filterState` is active." `intendedFilterActive = true` on a source-only toggle is the safe direction — it causes MORE bypasses, never fewer. There is no cache-validity regression.

3. **`_runFilterQuery` is now called by `_onSourceFilterChanged`**: Previously a source toggle only set `_hiddenSources` and called `_replaceUrlState`. Now it also runs the full filter query pipeline. This is required for D-01 (count, list, table, CSV). The existing `_filterGuard` stale-discard mechanism (bee-atlas.ts:182) handles rapid toggles correctly without a new guard.

---

## URL Round-Trip Preservation

The `src=` parameter is written by `buildParams` (url-state.ts:94–96) reading from `ui.hiddenSources`. After this phase, `_buildCurrentParams` passes `hiddenSources: this._filterState.hiddenSources` to the `ui` argument. The write logic is unchanged — the `src=` param still encodes the **visible** sources (complement of hidden). [VERIFIED: direct code read]

The existing `url-state.test.ts` MAP-03 describe block (lines 381–445) tests `hiddenSources` as part of the `ui` argument to `buildParams` — these tests pass unchanged because `buildParams` signature and implementation are not modified.

The `hasFilter` extension in `parseParams` (adding `hiddenSources` to the filter result object) adds NEW behavior that does not conflict with any existing test: existing tests check `result.ui?.hiddenSources` (still populated identically) and do not assert on `result.filter?.hiddenSources` (new).

---

## SQL Shape Rationale (Claude's Discretion Resolution)

Use `source IN (visibleSources)` rather than `source NOT IN (hiddenSources)` because:

1. **D-05 "all-off → empty" is automatic**: when `hiddenSources.size === 4` (all hidden), `visibleSources` is empty and the clause becomes `1 = 0` (explicit false) — correct empty result without special-casing.
2. **The `NOT IN` form with 4 hidden sources would be `source NOT IN ('ecdysis','waba_sample','inat_obs','checklist')` — which also correctly returns zero rows**, but requires checking that null sources don't accidentally match. `source` can be `null` (OccurrenceRow line 74: `source: 'ecdysis' | 'waba_sample' | 'inat_obs' | 'checklist' | null`). With `IN`, null rows never match (SQL null-in-list semantics), which is correct — null-source rows are anomalous and should be excluded when any source filter is active. With `NOT IN`, null rows also do not match `NOT IN (...)` in SQL (three-valued logic), so both forms are consistent on null. The `IN` form is simpler to read.
3. **No SQL injection risk**: `visibleSources` values come from a hardcoded `VALID_SOURCES` local array, not from user input. The `o.`-alias invariant is satisfied by qualifying as `o.source`.

---

## Pipeline / Contract Check

This is a **pure frontend TypeScript change**. The `source` column already exists in `marts/occurrences` (confirmed at `data/dbt/models/marts/occurrences.sql:86` — `j.source`). No dbt model changes, no schema contract changes, no migration required. [VERIFIED: direct file read]

---

## Common Pitfalls

### Pitfall 1: Forgetting `hiddenSources` preservation in `_onFilterChanged`
**What goes wrong:** A user sets a source filter, then changes the taxon filter. `_onFilterChanged` rewrites `_filterState` from `FilterChangedEvent` (which carries no `hiddenSources`). Without explicit preservation, `hiddenSources` reverts to `new Set()`.
**How to avoid:** Parallel to the `bounds` preservation at bee-atlas.ts:1539, add `hiddenSources: this._filterState.hiddenSources` in the `_onFilterChanged` state object.

### Pitfall 2: Deleting `_hiddenSources` without updating the `bee-atlas.test.ts` source-assertion tests
**What goes wrong:** Tests at bee-atlas.test.ts:861–863 assert `_hiddenSources = e.detail.hiddenSources` — this pattern will change (now writes `_filterState = { ...this._filterState, hiddenSources: ... }`).
**How to avoid:** Update the source-assertion tests to match the new write pattern for `_onSourceFilterChanged`.

### Pitfall 3: `emptyFilter()` helper in filter.test.ts missing `hiddenSources`
**What goes wrong:** `emptyFilter()` (filter.test.ts:16–31) constructs a bare `FilterState` object inline. After the interface adds `hiddenSources`, TypeScript will catch this at `tsc --noEmit` — but unit tests that bypass type-checking could see runtime issues.
**How to avoid:** Update `emptyFilter()` to include `hiddenSources: new Set()`. Same for any other `FilterState` construction sites in tests.

### Pitfall 4: `_onSourceFilterChanged` calling queries before `_filterState` is written
**What goes wrong:** `_runFilterQuery()` captures `this._filterState` at invocation time. If `_filterState` is assigned and then queries are called synchronously after, the ordering is fine (Lit's `@state` mutation is synchronous in the assignment; the query reads the field later in an async callback). No issue.
**How to avoid:** Keep the `_filterState =` assignment as the FIRST line in `_onSourceFilterChanged`, then call queries.

### Pitfall 5: `queryVisibleGeoJSON` returns `null` when `!isFilterActive(f)` — source-only restore
**What goes wrong:** On page load with `src=ecdysis` in the URL (source filter only, no other filter), `isFilterActive(_filterState)` now returns `true`, so `queryVisibleGeoJSON` fires and returns a result instead of `null`. The map correctly enters filter-active mode. This is the desired behavior — but verify `_runFilterQuery` is called in `firstUpdated` for this case.
**How to avoid:** Already handled: `firstUpdated` at line 663 calls `_runFilterQuery()` when `isFilterActive(this._filterState)` — which now returns `true` for source-only filters.

---

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Vitest (project-configured) |
| Config file | `vitest.config.ts` at project root |
| Quick run command | `npm test` |
| Full suite command | `npm test` (single suite, no split) |

### Phase Requirements → Test Map

| Requirement | Behavior | Test Type | File | Notes |
|-------------|----------|-----------|------|-------|
| D-01 source predicate in SQL | `buildFilterSQL` with `hiddenSources={ecdysis}` emits `o.source IN ('waba_sample','inat_obs','checklist')` | unit | `filter.test.ts` | New test |
| D-01 all-off clause | `hiddenSources=all 4` → clause is `1 = 0` or empty-IN | unit | `filter.test.ts` | New test |
| D-02 `isFilterActive` | `isFilterActive({ ...emptyFilter(), hiddenSources: new Set(['ecdysis']) })` returns `true` | unit | `filter.test.ts` | New test |
| D-02 `isFilterActive` empty | `isFilterActive({ ...emptyFilter(), hiddenSources: new Set() })` returns `false` | unit | `filter.test.ts` | New test |
| D-02 `FilterState` type shape | `emptyFilter()` helper includes `hiddenSources: new Set()` | type check | `filter.test.ts` | Update existing |
| D-02 URL round-trip | `src=ecdysis` → `parseParams` → `result.filter?.hiddenSources` equals `{waba_sample, inat_obs, checklist}` | unit | `url-state.test.ts` | New test |
| D-03/D-04 map unchanged | `bee-atlas.ts` passes `.hiddenSources=${this._filterState.hiddenSources}` to both `<bee-map>` and `<bee-pane>` | source assertion | `bee-atlas.test.ts` | Update MAP-02 tests |
| `_onSourceFilterChanged` wiring | Handler writes `_filterState.hiddenSources` and calls query methods | source assertion | `bee-atlas.test.ts` | Update existing MAP-02 |
| `_buildCurrentParams` feed | `_buildCurrentParams` passes `this._filterState.hiddenSources` to `ui` arg | source assertion | `bee-atlas.test.ts` | New or updated |
| D-05 all-off → 0 rows | Combined: `buildFilterSQL` `1 = 0` clause produces no rows | unit (SQL) | `filter.test.ts` | New test |

### Sampling Rate

- Per task commit: `npm test` (full suite, ~30 s)
- Per wave merge: `npm test`
- Phase gate: Full suite green before `/gsd-verify-work`

### Wave 0 Gaps

- Update `emptyFilter()` in `filter.test.ts` to include `hiddenSources: new Set()` before any new tests are added (TypeScript will error on construction without it after the interface change).
- `filter.test.ts` needs a new `describe('isFilterActive — hiddenSources')` block (parallel to the existing `isFilterActive — bounds` block at line 192).
- `filter.test.ts` needs a new `describe('buildFilterSQL — source filter (D-01)')` block.
- `url-state.test.ts` MAP-03 tests currently assert only `result.ui?.hiddenSources` — add new assertions for `result.filter?.hiddenSources`.
- `bee-atlas.test.ts` MAP-02 source assertions at lines 861–863 need updating for the new `_onSourceFilterChanged` pattern.

---

## Security Domain

No new ASVS categories introduced. The source predicate uses a hardcoded allowlist (`VALID_SOURCES`) — no user-controlled string is interpolated into SQL. The `o.source` values in the database come from the data pipeline and are already constrained to the same 4-value enum. No authentication, session, or cryptography changes.

| ASVS Category | Applies | Control |
|---------------|---------|---------|
| V5 Input Validation | Yes (existing) | `VALID_SOURCES` allowlist; values are hardcoded constants, not user input |
| All others | No | Not relevant to this TypeScript state-model patch |

---

## Assumptions Log

All claims in this research were verified against the current codebase by direct file reads. No `[ASSUMED]` claims.

| # | Claim | Verified By |
|---|-------|-------------|
| — | `source` column exists in `marts/occurrences` | `data/dbt/models/marts/occurrences.sql:86` — `j.source` |
| — | Four SQL consumers all use `buildFilterSQL` | Direct trace: filter.ts:177, 222, 400, 463 |
| — | `_loadSummaryFromSQLite` does NOT use `buildFilterSQL` | bee-atlas.ts:763–786 — raw SQL with `WHERE ecdysis_id IS NOT NULL` |
| — | `SourceKey` enum is `'ecdysis' \| 'waba_sample' \| 'inat_obs' \| 'checklist'` | url-state.ts:31 |
| — | `_onSourceFilterChanged` currently does NOT call `_runFilterQuery` | bee-atlas.ts:1699–1702 |

---

## Open Questions

None. The CONTEXT.md decisions and canonical code references fully constrain the implementation.

---

## Sources

### Primary (HIGH confidence — direct codebase reads)

- `src/filter.ts` — `FilterState` interface (13–26), `isFilterActive` (246–258), `buildFilterSQL` (297–388), all four query consumers
- `src/url-state.ts` — `SourceKey`/`VALID_SOURCES` (31–33), `buildParams` (59–114), `parseParams` src= handling (293–302)
- `src/bee-atlas.ts` — `_hiddenSources` (104), `intendedFilterActive` (200–204), `_runFilterQuery` (755–761), `_loadSummaryFromSQLite` (763–786), `_buildCurrentParams` (1088–1097), `_onFilterChanged` (1522–1561), `_onDownloadCsv` (1598–1630), `_onSourceFilterChanged` (1699–1702), `firstUpdated` (612–700), `_onPopState` (1280–1359)
- `src/bee-map.ts` — `hiddenSources` property (59), `_visibleBySource` (587–592), `_applySourceFilter` (666–673), `_applyVisibleIds` (594–630), `updated` handler (277–280)
- `src/bee-pane.ts` — `hiddenSources` property (89), `_hiddenSources` mirror (125), `updated` sync (544–547)
- `src/tests/filter.test.ts` — `emptyFilter()` shape (16–31), `isFilterActive — bounds` block (192–199), `buildFilterSQL — bounds` block (291–311)
- `src/tests/url-state.test.ts` — MAP-03 source filter describe block (381–445)
- `src/tests/bee-atlas.test.ts` — MAP-02 block (889–895), source-assertion patterns
- `data/dbt/models/marts/occurrences.sql` — `source` column at line 86
- `.planning/phases/156-*` — Phase 156 RESEARCH.md (bounds-as-FilterState template), CONTEXT.md

### Secondary (MEDIUM confidence)

- `.planning/phases/164-sidebar-list-ignores-src-source-filter/164-CONTEXT.md` — canonical decisions and code line references (self-referential but authoritative for locked decisions)

---

## Metadata

**Confidence breakdown:**
- Touchpoint inventory: HIGH — every line number verified by direct code read
- SQL predicate shape: HIGH — analyzed against actual column type and D-05 requirement
- Test surface: HIGH — existing test files read; gaps identified by inspection
- URL round-trip: HIGH — both `buildParams` and `parseParams` read in full

**Research date:** 2026-06-24
**Valid until:** This is a codebase read, not ecosystem research — valid until the named files change.
