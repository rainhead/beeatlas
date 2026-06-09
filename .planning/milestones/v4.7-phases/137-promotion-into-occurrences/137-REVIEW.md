---
phase: 137-promotion-into-occurrences
reviewed: 2026-06-08T00:00:00Z
depth: standard
files_reviewed: 9
files_reviewed_list:
  - data/dbt/models/intermediate/int_combined.sql
  - data/dbt/models/intermediate/int_checklist_dedup_status.sql
  - data/dbt/models/marts/occurrences.sql
  - data/dbt/models/marts/schema.yml
  - data/dbt/dbt_project.yml
  - data/sqlite_export.py
  - data/tests/test_dbt_scaffold.py
  - src/features.ts
  - src/tests/build-geojson.test.ts
findings:
  critical: 3
  warning: 4
  info: 1
  total: 8
status: issues_found
---

# Phase 137: Code Review Report

**Reviewed:** 2026-06-08
**Depth:** standard
**Files Reviewed:** 9
**Status:** issues_found

## Summary

Phase 137 promotes deduplicated checklist records into `occurrences.parquet` as ARM 4 of `int_combined`, bumps the dbt contract from 33 to 34 columns (`checklist_id INTEGER`), and wires the positional `_GEO_COLS` ↔ `features.ts row[7]` coupling for the `checklist:N` occId prefix.

The dbt/SQL layer is largely correct: UNION ALL column order and types are aligned across all four arms, the `dedup_status IS DISTINCT FROM 'confirmed'` suppression filter is semantically correct (NULL passes, 'confirmed' is suppressed), and the belt-and-suspenders `lat IS NOT NULL AND lon IS NOT NULL` guard is appropriate. The `_GEO_COLS` positional coupling at index 7 is correctly reflected in `features.ts` and the test suite.

Three critical bugs exist entirely on the TypeScript side: the `checklist:` occId prefix was not propagated into `url-state.ts`, `filter.ts`, or `occurrence.ts`. These files were authored before the checklist ARM existed and were not updated as part of this phase. The result is that checklist occurrence dots on the map (1) lose their selection on URL reload, (2) cause an unhandled SQL error when clicked, and (3) are incorrectly treated as "not matching" any active filter and therefore rendered as if they are filtered in even when the filter should hide them.

---

## Critical Issues

### CR-01: `url-state.ts` strips `checklist:` IDs — selection lost on URL reload

**File:** `src/url-state.ts:226`
**Issue:** The URL-decode filter only permits `ecdysis:`, `inat:`, and `inat_obs:` prefixes. Any `checklist:N` ID placed into the `o=` URL parameter is silently discarded when the page is reloaded or the URL is shared, causing the selection to vanish. The encode path (writing the URL) is not gated the same way, so the roundtrip is asymmetric.

```typescript
// Current (line 226):
.filter(s => (s.startsWith('ecdysis:') || s.startsWith('inat:') || s.startsWith('inat_obs:')) && s.length > 5);

// Fix — add checklist: to the accepted prefixes:
.filter(s => (
  s.startsWith('ecdysis:') ||
  s.startsWith('inat:') ||
  s.startsWith('inat_obs:') ||
  s.startsWith('checklist:')
) && s.length > 5);
```

Also update `SourceKey` in the same file if `checklist` is a first-class source value for URL purposes, and update `VALID_SOURCES` accordingly.

---

### CR-02: `filter.ts getOccurrences` — SQL syntax error when called with only `checklist:` IDs

**File:** `src/filter.ts:444-463` (specifically lines 446-458)
**Issue:** `getOccurrences` dispatches incoming IDs into three clauses (`ecdysis_id IN`, `observation_id IN`, `specimen_observation_id IN`). There is no clause for `checklist:` IDs. When the array contains only `checklist:N` entries, all three id arrays are empty, `clauses` is empty, and the generated SQL becomes `WHERE ` (nothing after WHERE), which is a syntax error thrown as an unhandled Promise rejection.

The call path that reaches this function with a `checklist:` ID is: map click on a checklist dot → `bee-map.ts:854` calls `getOccurrences([occId])` where `occId = 'checklist:123'` → crash.

```typescript
// Fix — add checklist dispatch alongside existing id types in getOccurrences:
const checklistIds = occIds.filter(id => id.startsWith('checklist:')).map(id => id.slice('checklist:'.length));
// ...
if (checklistIds.length > 0) clauses.push(`checklist_id IN (${checklistIds.join(',')})`);
```

Note: `checklist_id` must also be added to `OCCURRENCE_COLUMNS` and `OccurrenceRow` (see CR-03) for the fetched row to be usable by `occIdFromRow`.

---

### CR-03: `queryVisibleGeoJSON` drops all checklist matches — filter incorrectly treats them as non-matching

**File:** `src/filter.ts:321-336`
**Issue:** `queryVisibleGeoJSON` (used by the filter race guard in `bee-atlas.ts`) selects only `ecdysis_id, observation_id, specimen_observation_id` — not `checklist_id`. It then calls `occIdFromRow`, which returns `null` for any row where all three of those columns are null (all checklist rows). The null check on line 327 drops the row from the result `ids` Set.

Consequence: when a filter is active, `_visibleIds` never contains any `checklist:N` ID. `bee-map.ts:646` then hides all checklist dots because their occId is absent from `visibleIds`. Checklist occurrences that *match* the active filter are rendered as "filtered out" (ghost dots or hidden entirely, depending on the style logic), while in reality they should be visible.

```typescript
// Fix — in queryVisibleGeoJSON, add checklist_id to the SELECT and to the occId derivation:
`SELECT lat, lon, ecdysis_id, observation_id, specimen_observation_id, checklist_id, year, source
 FROM occurrences o WHERE ...`

// Then in the callback, derive occId with the same priority chain as features.ts:
const occId = occIdFromRow(...) ??
  (row.checklist_id != null ? `checklist:${row.checklist_id}` : null);
```

Alternatively, extend `occIdFromRow` in `occurrence.ts` to accept `checklist_id` and unify the derivation logic.

---

## Warnings

### WR-01: `OccurrenceRow.source` type excludes `'checklist'` — runtime value never matches declared type

**File:** `src/filter.ts:68`
**Issue:** `OccurrenceRow.source` is typed as `'ecdysis' | 'waba_sample' | 'inat_obs' | null`. When a checklist row is fetched from SQLite, its `source` column is `'checklist'` at runtime, which falls outside the union type. Any TypeScript code that exhaustively switches on `source` (e.g. display labels, icon selection) will hit the unexpected branch silently. TypeScript cannot catch this because the row is cast through `as unknown as OccurrenceRow` at fetch time.

```typescript
// Fix:
source: 'ecdysis' | 'waba_sample' | 'inat_obs' | 'checklist' | null;
```

---

### WR-02: `occurrence.ts occIdFromRow` does not handle `checklist_id` — returns `null` for checklist rows

**File:** `src/occurrence.ts:23-28`
**Issue:** `occIdFromRow` is documented as the single owner of the occId vocabulary, but it has no knowledge of `checklist_id`. Any caller that uses `occIdFromRow` to construct an ID for a checklist `OccurrenceRow` gets `null`. This is currently masked because checklist rows aren't reachable from the table/list query path (itself a bug per CR-02/CR-03), but once those are fixed, `occIdFromRow` being wrong will cause silent data loss in list and table rendering.

```typescript
// Fix — add checklist_id to OccurrenceRow (and to OCCURRENCE_COLUMNS), then:
export function occIdFromRow(row: OccurrenceRow): string | null {
  if (row.ecdysis_id != null) return `ecdysis:${row.ecdysis_id}`;
  if (row.observation_id != null) return `inat:${row.observation_id}`;
  if (row.specimen_observation_id != null) return `inat_obs:${row.specimen_observation_id}`;
  if (row.checklist_id != null) return `checklist:${row.checklist_id}`;
  return null;
}
```

---

### WR-03: Re-baselined regression test has no meaningful floor for checklist row count

**File:** `data/tests/test_dbt_scaffold.py:206-234`
**Issue:** `test_occurrences_row_count_not_inflated_by_checklist` replaces the Phase 111 "must be zero" assertion with `checklist_count > 0`. The phase context states "~20K checklist rows" are expected, but `1` row would satisfy `> 0`. A future regression that silently suppresses nearly all checklist records (e.g. an over-aggressive dedup seed, a filter condition inversion) would pass this test undetected.

```python
# Fix — add a floor reflecting the known data volume, e.g.:
assert checklist_count >= 1_000, (
    f"occurrences.parquet has only {checklist_count} source='checklist' rows "
    "— unexpectedly few; verify dedup suppression and ARM 4 filter"
)
```

The ceiling (160,000) is appropriately generous; it's the floor that is missing.

---

### WR-04: `bee-map.ts` source-toggle cannot hide checklist dots — `SourceKey` and `hiddenSources` do not include `'checklist'`

**File:** `src/url-state.ts:32-34`, `src/bee-pane.ts:1116-1128`
**Issue:** `SourceKey` is `'ecdysis' | 'waba_sample' | 'inat_obs'`. `bee-pane.ts` renders toggles for exactly those three sources. `bee-map.ts:585` uses `hiddenSources.has(f.properties.source)` to filter client-side features, but since `hiddenSources` can never contain `'checklist'`, checklist dots are permanently visible regardless of source-toggle state. Whether this is intentional (checklist dots should always appear) or an omission is not documented in the phase notes or a code comment.

If intentional, add a comment to `SourceKey` explaining why `checklist` is excluded. If not, add a fourth toggle for `'checklist'`.

---

## Info

### IN-01: `[BENCHMARK]` `console.log` statements ship in production bundle

**File:** `src/features.ts:59,66`
**Issue:** Two `console.log` calls with `[BENCHMARK]` labels are present in the production `loadOccurrenceGeoJSON` code path. They are not gated on a dev/debug flag. Every page load logs two timing messages to the browser console.

**Fix:** Either gate on `import.meta.env.DEV`, remove, or promote to a structured performance-mark call (`performance.mark`) that does not pollute the console.

---

_Reviewed: 2026-06-08_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
