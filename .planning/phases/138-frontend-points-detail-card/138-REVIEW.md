---
phase: 138-frontend-points-detail-card
reviewed: 2026-06-08T00:00:00Z
depth: standard
files_reviewed: 13
files_reviewed_list:
  - src/bee-atlas.ts
  - src/bee-map.ts
  - src/bee-occurrence-detail.ts
  - src/bee-pane.ts
  - src/filter.ts
  - src/occurrence.ts
  - src/style.ts
  - src/url-state.ts
  - data/dbt/models/intermediate/int_combined.sql
  - data/dbt/models/intermediate/int_species_universe.sql
  - data/dbt/models/marts/occurrences.sql
  - data/dbt/models/marts/schema.yml
  - data/tests/test_species_checklist_count.py
findings:
  critical: 1
  warning: 4
  info: 3
  total: 8
status: issues_found
---

# Phase 138: Code Review Report

**Reviewed:** 2026-06-08
**Depth:** standard
**Files Reviewed:** 13
**Status:** issues_found

## Summary

Phase 138 promotes checklist records into real clickable map points and folds them
into the standard source-selection and detail-card paths. The SQL string-interpolation
surface in `filter.ts` is sound for this phase: every checklist/selection id is routed
through `parseOccId`, which `parseInt`s the numeric suffix, so only validated integers
reach the `IN (...)` builders. The new `_renderChecklist` correctly uses Lit
auto-escaping interpolation (no `unsafeHTML`) for `verbatim_name` / `locality` /
`recordedBy`. The dbt contract is internally consistent: all four ARMs of
`int_combined.sql` emit 36 columns, the `occurrences` mart final SELECT and `schema.yml`
both carry 37 columns, and `checklist_count_agg` re-sourcing in `int_species_universe.sql`
uses the same dedup/coord filter as ARM 4.

The phase nonetheless ships **one BLOCKER**: checklist (and iNat-obs) rows can carry a
NULL `date`, and the non-specimen render path calls `.localeCompare` on it
unconditionally, which throws and breaks the detail card. There are also several
correctness/maintainability warnings around silently-dropped `inat_obs` selections in
the table query and an unvalidated month index in `formatRomanDate`.

## Critical Issues

### CR-01: NULL `date` on checklist/iNat rows crashes the occurrence detail render

**File:** `src/bee-occurrence-detail.ts:334-335` (also affects `formatRomanDate` callers indirectly)
**Issue:** In `render()`, non-specimen rows are sorted with
`nonSpecimen.sort((a, b) => b.date.localeCompare(a.date))`. `OccurrenceRow.date` is
typed `string`, but the dbt pipeline emits `date = NULL` for checklist rows whose
`date_quality` is `'none'`:

```sql
-- int_combined.sql ARM 4
CASE cl.date_quality
    WHEN 'full'      THEN printf('%04d-%02d-%02d', cl.year, cl.month, cl.day)
    WHEN 'year_only' THEN printf('%04d', cl.year)
    ELSE NULL            -- 'none' → NULL date
END
```

`data/checklist_pipeline.py` confirms `date_quality` can be `'none'` (empty/NULL source
date). ARM 4 filters only on `dedup_status` and `lat/lon NOT NULL` — date nullness is not
excluded — and `queryListPage` has no `date IS NOT NULL` guard, so a checklist point with
a NULL date renders into the detail card as a non-specimen row. When at least one such
row is present, `b.date.localeCompare(...)` throws `TypeError: Cannot read properties of
null (reading 'localeCompare')`, blanking the entire detail pane. Because checklist points
are now individually clickable (the whole point of this phase), this is readily reachable
by clicking a green checklist dot whose source date was blank. (ARM 3 iNat-obs rows are
also theoretically affected since `observed_on` is not NULL-guarded, but checklist makes
it common.)

**Fix:** Null-guard the sort comparator (and keep the SQL NULL-last semantics):
```ts
const nonSpecimen = this.occurrences.filter(r => !isSpecimenBacked(r))
  .sort((a, b) => (b.date ?? '').localeCompare(a.date ?? ''));
```
Also tighten the type to `date: string | null` in `OccurrenceRow` (filter.ts:43) so the
compiler surfaces every other unguarded `.date` access (e.g. `groupOccurrences`' map key
is fine, but future callers should be forced to handle null).

## Warnings

### WR-01: `_runTableQuery` collects `inat_obs` selection ids but never passes them to the query

**File:** `src/bee-atlas.ts:522-539`
**Issue:** `_runTableQuery` buckets selected ids into `selEcdysisIds`, `selInatIds`,
`selInatObsIds`, and `selChecklistIds`, but the call passes only three:
```ts
return await queryTablePage(
  this._filterState, this._tablePage, this._tableSortBy,
  selEcdysisIds, selInatIds, selChecklistIds   // selInatObsIds dropped
);
```
`queryTablePage`'s signature (filter.ts:182-188) has no `inat_obs` parameter at all, so
when the user selects a provisional / WABA (`inat_obs:`) point and opens the table, those
rows lose their selection-priority sort prefix and are not pinned to the top. This is a
pre-existing gap, but the phase edited this exact function (adding the checklist bucket)
and left the inconsistency in place — `_runListQuery` (which threads all four buckets) and
`queryTablePage` now disagree about which sources can be prioritized.

**Fix:** Add a `selectedInatObsIds: number[] = []` parameter to `queryTablePage`, push
`specimen_observation_id IN (...)` into `selParts`, and pass `selInatObsIds` from
`_runTableQuery` — mirroring `queryListPage`/`_runListQuery`.

### WR-02: `formatRomanDate` does not bound-check the month index for `YYYY-MM` input

**File:** `src/bee-occurrence-detail.ts:17-23`
**Issue:** The length-7 branch does `ROMAN_MONTHS[month - 1]` with no validation. An input
like `"2020-13"` or `"2020-00"` yields `ROMAN_MONTHS[12]`/`ROMAN_MONTHS[-1]` →
`undefined`, rendering literally as `"undefined 2020"`. The length-7 branch also never
verifies the string actually parses, unlike the length-10 branch's `isNaN(d.getTime())`
guard. Checklist rows never hit this branch (ARM 4 emits only length-4, length-10, or
NULL), but iNat/sample dates flow through the same function and a malformed
`observed_on`/`modified` substring of length 7 would surface garbage.

**Fix:** Guard the index and fall back to the raw string:
```ts
if (dateStr.length === 7) {
  const [y, m] = dateStr.split('-').map(Number);
  if (!Number.isInteger(m) || m < 1 || m > 12) return dateStr;
  return `${ROMAN_MONTHS[m - 1]} ${y}`;
}
```

### WR-03: `getOccurrences` builds an empty `WHERE` clause for unrecognized id prefixes

**File:** `src/filter.ts:460-483`
**Issue:** `getOccurrences` partitions `occIds` by prefix; if every id has an unknown
prefix (or the array is non-empty but none match `ecdysis:`/`inat:`/`inat_obs:`/
`checklist:`), `clauses` stays empty and the query becomes
`... WHERE ` + `clauses.join(' OR ')` = `... WHERE `, a SQL syntax error that rejects the
whole batch. The early `if (occIds.length === 0) return []` does not cover the
"non-empty but all-unrecognized" case. Today all ids originate from `occIdFromRow` so this
is latent, but URL-restored selections (`?o=...`) are user-controllable and only loosely
validated in `url-state.ts` (prefix + `length > 5`), so a crafted id such as
`checklist:` (suffix empty) survives URL parsing, is bucketed by the
`startsWith('checklist:')` filter, and produces `checklist_id IN ()` — also a syntax
error.

**Fix:** Bail out when no clause was produced:
```ts
if (clauses.length === 0) return [];
```
and/or tighten `url-state.ts:223-225` to require a numeric suffix after each prefix.

### WR-04: `inat:N` vs `inat_obs:N` ordering in `parseOccId` is prefix-fragile

**File:** `src/occurrence.ts:39-58`
**Issue:** `parseOccId` checks `startsWith('inat_obs:')` before `startsWith('inat:')`,
which is correct only because of the explicit ordering — `'inat_obs:5'` also starts with
`'inat:'` is false (it starts with `'inat_'`), so this happens to be safe, but the
correctness depends entirely on the two `if`s being kept in this order and on no future
`inat...:` prefix being added between them. There is no test pinning the ordering and a
naive reorder (e.g. alphabetizing the branches) would silently misroute every
`inat_obs:` id into the `inat` bucket (`observation_id` instead of
`specimen_observation_id`), corrupting selection queries with no error.

**Fix:** Make the discrimination order-independent by matching on the full prefix set via
a lookup table, or add a regression test asserting `parseOccId('inat_obs:5').source ===
'inat_obs'` and a comment marking the ordering as load-bearing.

## Info

### IN-01: Hardcoded source count `=== 4` is brittle

**File:** `src/bee-pane.ts:1173`
**Issue:** `this._hiddenSources.size === 4` encodes "all sources hidden" as a magic
number. Adding a fifth `SourceKey` would silently break the "No sources selected"
empty-state. The canonical count already exists as `VALID_SOURCES` in `url-state.ts`.
**Fix:** Compare against `VALID_SOURCES.size` (export it) instead of the literal `4`.

### IN-02: `ARM 4` emits `cl.year` / `cl.month` without the explicit casts the other arms use

**File:** `data/dbt/models/intermediate/int_combined.sql:222-223`
**Issue:** ARMs 1-3 wrap year/month in `COALESCE(...)` / `YEAR(...)`/`MONTH(...)`, while
ARM 4 passes `cl.year` / `cl.month` bare. The `UNION ALL` will promote to the widest type
so the contract still resolves, but the asymmetry is easy to misread when reasoning about
the `bigint` contract declaration in `schema.yml`. Cosmetic — add `::BIGINT` for parity
or a comment noting the upstream type is already wide.

### IN-03: `void isFilterActive;` dead-code suppressor left in `bee-pane.ts`

**File:** `src/bee-pane.ts:1239-1240`
**Issue:** The trailing `// Suppress unused variable warnings ... void isFilterActive;`
references a "Plan 02" that is long past. `isFilterActive` is imported but only used via
this no-op statement. Either use it or drop the import and the suppressor.
**Fix:** Remove the unused `isFilterActive` import and the `void` statement.

---

_Reviewed: 2026-06-08_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
