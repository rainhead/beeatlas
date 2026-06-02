---
phase: 130-map-filter-cutover
reviewed: 2026-06-02T00:00:00Z
depth: standard
files_reviewed: 19
files_reviewed_list:
  - src/bee-atlas.ts
  - src/bee-filter-controls.ts
  - src/bee-map.ts
  - src/bee-occurrence-detail.ts
  - src/bee-pane.ts
  - src/features.ts
  - src/filter.ts
  - src/taxa.ts
  - src/tests/bee-atlas.test.ts
  - src/tests/bee-filter-controls.test.ts
  - src/tests/bee-pane.test.ts
  - src/tests/bee-sidebar.test.ts
  - src/tests/build-geojson.test.ts
  - src/tests/filter.test.ts
  - src/tests/occurrence.test.ts
  - src/tests/spa-link.test.ts
  - src/tests/url-state.test.ts
  - src/url-state.ts
findings:
  critical: 1
  warning: 8
  info: 5
  total: 14
status: issues_found
---

# Phase 130: Code Review Report

**Reviewed:** 2026-06-02T00:00:00Z
**Depth:** standard
**Files Reviewed:** 19
**Status:** issues_found

## Summary

Reviewed the map-filter-cutover surface: the `bee-atlas` coordinator, the `bee-map`
presenter, the `bee-filter-controls` / `bee-pane` filter UIs, the pure `filter.ts`
SQL builder, `url-state.ts`, `taxa.ts`, `features.ts`, and the associated test suite.

The SQL-injection surface is well handled — `taxonId` is a TypeScript `number`
interpolated directly, and all string-valued filters (`county`, `ecoregion_l3`,
`place_slug`, `recordedBy`, `host_inat_login`) are escaped via `replace(/'/g, "''")`.
The legacy-taxon path correctly keeps the raw URL name out of SQL.

One genuine correctness defect rises to BLOCKER: `getOccurrences` can emit a
malformed `WHERE` clause when every supplied ID is non-conforming, producing a SQL
syntax error on a code path reachable from cluster/point clicks and URL restore.
The remaining findings are robustness and consistency concerns — most notably a
dropped `inat_obs` selection-priority argument, fragile cross-property non-null
assertions in `bee-map`, and an incomplete `filterStatesEqual` comparison.

## Critical Issues

### CR-01: `getOccurrences` builds an empty `WHERE` clause for all-unparseable IDs

**File:** `src/filter.ts:479-498`
**Issue:** The function guards only the empty-array case (`occIds.length === 0`).
When `occIds` is non-empty but none of the IDs start with `ecdysis:`, `inat:`, or
`inat_obs:`, all three `filter()` passes yield empty arrays, `clauses` stays empty,
and the query becomes:

```
SELECT ... FROM occurrences WHERE
```

`clauses.join(' OR ')` returns `''`, so the trailing `WHERE` has no predicate — a
SQL syntax error that rejects the whole query. This is reachable: `occId` values
flow from map feature properties (`_handleClusterClick`, `_handlePointClick`) and
from URL `o=` restore. A single malformed/legacy ID set (e.g. an old bookmark, or a
feature whose `occId` was built before the prefix vocabulary) throws instead of
degrading to an empty result. Note `parseOccId` and the URL parser both *silently
drop* unknown prefixes elsewhere, so callers reasonably expect graceful handling here.

**Fix:** Short-circuit when no clauses were produced:
```ts
const selectCols = OCCURRENCE_COLUMNS.join(', ');
if (clauses.length === 0) return [];   // no parseable IDs — nothing to fetch
await tablesReady;
const { sqlite3, db } = await getDB();
// ... existing query using clauses.join(' OR ')
```

## Warnings

### WR-01: `_runTableQuery` silently drops `inat_obs` selection IDs

**File:** `src/bee-atlas.ts:513-538` (esp. 515, 525)
**Issue:** `_runTableQuery` parses selected IDs into three buckets
(`selEcdysisIds`, `selInatIds`, `selInatObsIds`) but passes only the first two to
`queryTablePage(... selEcdysisIds, selInatIds)`. `selInatObsIds` is computed and
then discarded. `queryTablePage` itself accepts only `selectedEcdysisIds` and
`selectedInatIds` (filter.ts:172-178), so any selection consisting of `inat_obs:`
specimens loses its selection-priority sort in table view (selected rows will not be
hoisted to the top). `_runListQuery` and `queryListPage` handle all three correctly,
so the table view is inconsistent with the list view.
**Fix:** Extend `queryTablePage` to accept `selectedInatObsIds` and add
`observation_id`/`specimen_observation_id IN (...)` to its `selParts` priority
expression, then pass `selInatObsIds` from `_runTableQuery`. At minimum, drop the
dead `selInatObsIds` computation in `_runTableQuery` if the omission is intentional,
and document why `inat_obs` selections don't get priority sorting.

### WR-02: `_applyVisibleIds` dereferences `visibleIds` under a `filteredGeoJSON`-only guard

**File:** `src/bee-map.ts:585-591`
**Issue:** The branch is gated on `this.filteredGeoJSON !== null`, but inside it calls
`this.visibleIds!.has(f.properties.occId)` with a non-null assertion. The two are
separate `@property` inputs. They happen to be assigned together in `bee-atlas`
(`_runFilterQuery`, popstate restore), so Lit batches them into one update today —
but nothing in `bee-map` enforces the invariant. A future caller that sets
`filteredGeoJSON` without `visibleIds` (or clears `visibleIds` to `null` while a
filtered collection lingers) crashes with `Cannot read properties of null`.
**Fix:** Guard explicitly instead of asserting:
```ts
if (this.filteredGeoJSON !== null && this.visibleIds !== null) {
  occSource.setData(this.filteredGeoJSON);
  const visible = this.visibleIds;
  const ghostFeatures = this._fullGeoJSON.features.filter(f => !visible.has(f.properties.occId));
  ghostSource.setData({ type: 'FeatureCollection', features: ghostFeatures });
} else { /* restore full data */ }
```

### WR-03: `filterStatesEqual` omits `selectedPlace` from the comparison

**File:** `src/bee-filter-controls.ts:83-94`
**Issue:** `filterStatesEqual` compares taxon, years, months, counties, ecoregions,
collectors, and elevation — but not `selectedPlace`. It is used in `updated()`
(line 340) to decide whether to re-sync `_tokens` from an externally-changed
`filterState`. Because `tokensToFilterState` always produces `selectedPlace: null`,
two states that differ *only* in `selectedPlace` are reported equal. In this
component place is not a token, so the practical impact is limited, but the helper is
named as a general filter-state equality and is a latent trap if reused. It also
omits `selectedPlace` while otherwise claiming completeness.
**Fix:** Add `&& a.selectedPlace === b.selectedPlace` to the boolean chain, or rename
the helper to make its token-only scope explicit (e.g. `tokenFilterStatesEqual`).

### WR-04: `queryListPage` bounds clause silently returns nothing for inverted/antimeridian boxes

**File:** `src/filter.ts:421-427`
**Issue:** `lon BETWEEN ${west} AND ${east}` assumes `west <= east`. A rectangle
gesture in `bee-map` (`_rectFinish`) computes `sw`/`ne` from screen min/max and
*usually* yields `west <= east`, but a box dragged across the antimeridian (or a
projection edge case) yields `west > east`, making the BETWEEN match zero rows with
no user-visible explanation. `parseParams` validates ranges and `south < north` but
imposes no `west < east` ordering, so a restored `sel=` URL can also carry
`west > east`.
**Fix:** Normalize before building the clause:
`const [lo, hi] = west <= east ? [west, east] : [east, west];` and use `lo`/`hi`, or
explicitly handle the wrap case. Document the chosen behavior.

### WR-05: CSV cell sanitization does not neutralize spreadsheet formula injection

**File:** `src/bee-atlas.ts:935-943`
**Issue:** `_onDownloadCsv` quotes cells containing `,`, `"`, `\n`, `\r`, but does not
guard cells beginning with `=`, `+`, `-`, or `@`. Values such as `recordedBy`,
`floralHost`, `scientificName`, `user_login` originate from external sources
(Ecdysis, iNaturalist) and are exported verbatim. A field like `=HYPERLINK(...)` or
`@SUM(...)` will execute as a formula when the CSV is opened in Excel/Sheets (CSV
injection / formula injection). The output is a user-initiated download, lowering
severity, but the data is third-party-controlled.
**Fix:** Prefix any cell whose first character is in `= + - @ \t \r` with a single
quote (or a leading tab) before applying the existing comma/quote escaping.

### WR-06: `_loadSummaryFromSQLite` mutates `@state` arrays in place across awaits

**File:** `src/bee-atlas.ts:411-422`
**Issue:** `_loadSummaryFromSQLite` does `this._countyOptions = []` then pushes into
it from the `exec` callback, and the same for `_ecoregionOptions`. These are `@state`
fields. Assigning a fresh array then mutating it via `.push()` does not re-trigger
Lit reactivity for the push mutations (Lit compares by reference; the reference was
already set to the new empty array before the pushes). Worse, `_loadCountyEcoregionOptions`
(lines 487-508) *also* populates the same two fields from `_onDataLoaded`, building
into a local array and assigning once — the correct pattern. The two code paths race
and the `_loadSummaryFromSQLite` versions may leave the rendered options stale until
the second loader assigns. The duplication (same two `SELECT DISTINCT` queries run
twice on every load) is also wasteful and a maintenance hazard.
**Fix:** Remove the county/ecoregion population from `_loadSummaryFromSQLite`
(the comment at lines 423-425 already acknowledges `_collectorOptions` is loaded
elsewhere — apply the same reasoning), leaving `_loadCountyEcoregionOptions` as the
single owner. If kept, build into a local array and assign once.

### WR-07: `_resolveLegacyTaxon` can leave `_filterState` active but `_visibleIds` showing all dots

**File:** `src/bee-atlas.ts:441-459`
**Issue:** When a legacy taxon name resolves *after* the cache loads, the method sets
`this._filterState = { ...this._filterState, taxonId: id }` and calls
`_runFilterQuery()`. But it does not first set `_visibleIds = new Set()` /
`_filteredGeoJSON = { features: [] }` the way `firstUpdated` (lines 269-274) and
`_onPopState` (lines 684-687) do. Between the synchronous state change and the async
`_runFilterQuery` resolution, the map shows the full unfiltered dot set (because
`_visibleIds`/`_filteredGeoJSON` are still `null`), causing a flash of all-dots for a
filter the user expected to already be applied from their bookmark.
**Fix:** Mirror the popstate guard before calling `_runFilterQuery`:
```ts
this._filterState = { ...this._filterState, taxonId: id };
if (isFilterActive(this._filterState)) {
  this._visibleIds = new Set();
  this._filteredGeoJSON = { type: 'FeatureCollection', features: [] };
  this._runFilterQuery();
}
```

### WR-08: `_buildGeoJSONFromRaw` treats a missing/0 `year` as a valid recency input

**File:** `src/features.ts:35, 51-52, 58` and `src/filter.ts:355`
**Issue:** `year` is read with `Number(row[5])`. For a row with `year == null`,
`Number(null)` is `0`; for a non-numeric value it is `NaN`. The `if (year < minYear)`
/ `if (year > maxYear)` checks then run only for `ecdysis_id != null` rows so the
summary is mostly protected — but `_recencyTier(year)` is still called with `0`/`NaN`
for *every* feature including sample-only rows, classifying them as `'earlier'`
(for `0`) or producing `NaN` comparisons that fall through to `'earlier'`. The same
`Number(row.year)` pattern appears in `filter.ts:355` (`queryVisibleGeoJSON`). Dots
for year-less sample rows are silently bucketed as old, which may mis-color the map.
**Fix:** Coerce explicitly and branch on validity:
`const yr = row[5] == null ? null : Number(row[5]);` and have `_recencyTier` accept
`number | null`, returning a defined default (e.g. `'earlier'`) only when intended.

## Info

### IN-01: `_recencyTier` is duplicated verbatim in two modules

**File:** `src/features.ts:7-12` and `src/filter.ts:33-38`
**Issue:** Identical function bodies (and `OccurrenceProperties` recency-tier logic)
exist in both files. Divergence risk if one is edited.
**Fix:** Export `_recencyTier` from one module (it is already a pure helper) and
import it in the other, or hoist to a shared `occurrence.ts`/`recency.ts`.

### IN-02: Benchmark `console.log` left in production data path

**File:** `src/bee-atlas.ts:997-998`, `src/features.ts:90, 97`
**Issue:** `[BENCHMARK]` `console.log` calls run on every load (boot, buffer transfer,
decode). These are intentional-looking instrumentation but ship to production and
expose timing/heap details in the console.
**Fix:** Gate behind `import.meta.env.DEV` or a debug flag, or downgrade to
`console.debug`.

### IN-03: Dead `void isFilterActive;` and stale "Plan 02" comment

**File:** `src/bee-pane.ts:1246-1247`
**Issue:** `import { isFilterActive }` (line 3) is used only to satisfy
`void isFilterActive;` at the bottom, with the comment "used in Plan 02." Plan 02 is
complete; the import and the `void` suppression are now dead code.
**Fix:** Remove the unused `isFilterActive` import and the trailing
`void isFilterActive;` statement.

### IN-04: `parseOccId` doc comment understates the return union

**File:** `src/occurrence.ts:30-37`
**Issue:** The JSDoc says it returns `{ source: 'ecdysis' | 'inat', numericId }` but
the implementation and signature include `'inat_obs'`. Misleading documentation for a
load-bearing ID parser.
**Fix:** Update the doc comment to list all three sources.

### IN-05: `host_inat_login` violates the project camelCase naming convention

**File:** `src/filter.ts:10, 65, 469-478`; `src/url-state.ts:181`
**Issue:** `CollectorEntry.host_inat_login` (and the `OccurrenceRow` column) uses
snake_case in TypeScript interfaces where neighboring fields are camelCase
(`displayName`, `recordedBy`, `floralHost`). This mirrors the DB column name, which
is a reasonable rationale, but it is inconsistent and easy to typo against the
camelCase siblings.
**Fix:** Either document that DB-sourced field names are intentionally preserved
verbatim (add a comment on the interface), or alias to `hostInatLogin` at the query
boundary. Low priority — consistency only.

---

_Reviewed: 2026-06-02T00:00:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
