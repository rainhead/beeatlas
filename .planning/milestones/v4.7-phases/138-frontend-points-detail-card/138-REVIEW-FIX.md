---
phase: 138-frontend-points-detail-card
fixed_at: 2026-06-08T17:06:00Z
review_path: .planning/phases/138-frontend-points-detail-card/138-REVIEW.md
iteration: 1
findings_in_scope: 5
fixed: 3
skipped: 2
status: all_fixed
---

# Phase 138: Code Review Fix Report

**Fixed at:** 2026-06-08T17:06:00Z
**Source review:** .planning/phases/138-frontend-points-detail-card/138-REVIEW.md
**Iteration:** 1

**Summary:**
- Findings in scope (critical + warning): 5
- Fixed: 3
- Skipped: 2 (both already fixed manually before this run)

All in-scope findings are now resolved: 3 fixed in this run, 2 confirmed already
fixed in commit `cb16436`. The 3 Info findings (IN-01, IN-02, IN-03) were out of
scope (no `--all` flag) and were not touched.

## Fixed Issues

### WR-01: `_runTableQuery` collects `inat_obs` selection ids but never passes them to the query

**Files modified:** `src/filter.ts`, `src/bee-atlas.ts`
**Commit:** 92ca96b
**Applied fix:** Added a `selectedInatObsIds: number[] = []` parameter to
`queryTablePage` and pushed `specimen_observation_id IN (...)` into its `selParts`
priority list, mirroring the existing checklist/inat/ecdysis handling. Updated the
`_runTableQuery` call site in `bee-atlas.ts` to pass the already-collected
`selInatObsIds` bucket as the fourth selection argument. Provisional/WABA
(`inat_obs:`) selections now retain their table-view sort priority instead of being
silently dropped. `tsc --noEmit` clean.

### WR-02: `formatRomanDate` does not bound-check the month index for `YYYY-MM` input

**Files modified:** `src/bee-occurrence-detail.ts`
**Commit:** 4ea3871
**Applied fix:** Added a guard in the length-7 (`YYYY-MM`) branch:
`if (!Number.isInteger(month) || month < 1 || month > 12) return dateStr;` before
indexing `ROMAN_MONTHS[month - 1]`. An out-of-range or NaN month now falls back to
the raw string instead of rendering `"undefined YYYY"`, consistent with the
length-10 branch's existing `isNaN(d.getTime())` guard. Defensive hardening — live
checklist data (ARM 4) never reaches this branch. `tsc --noEmit` clean.

### WR-04: `inat:N` vs `inat_obs:N` ordering in `parseOccId` is prefix-fragile

**Files modified:** `src/tests/occurrence.test.ts`
**Commit:** 774e892
**Applied fix:** Added a pinning regression test asserting
`parseOccId('inat_obs:42')` returns `{ source: 'inat_obs', numericId: 42 }` rather
than being misrouted into the `inat` bucket. The test comment documents that the
`inat_obs:`-before-`inat:` branch ordering is load-bearing, so a future reorder
(e.g. alphabetizing the branches) is caught. Chose the regression-test option from
the review's two suggestions (test vs. lookup-table refactor) as the lower-risk,
behavior-preserving change. New test passes; full `occurrence.test.ts` suite green
(27/27). `tsc --noEmit` clean.

## Skipped Issues

### CR-01: NULL `date` on checklist/iNat rows crashes the occurrence detail render

**File:** `src/bee-occurrence-detail.ts:334-335`
**Reason:** skipped — already fixed (commit cb16436). Confirmed present in current
code: the non-specimen sort is `(b.date ?? '').localeCompare(a.date ?? '')`, which
null-guards both operands and preserves NULL-last semantics. No re-application
needed.
**Original issue:** Non-specimen rows were sorted with `b.date.localeCompare(a.date)`;
checklist rows with `date_quality='none'` carry `date = NULL`, so `localeCompare` on
a null threw `TypeError` and blanked the detail pane.

### WR-03: `getOccurrences` builds an empty `WHERE` clause for unrecognized id prefixes

**File:** `src/filter.ts:460-483`
**Reason:** skipped — already fixed (commit cb16436). Confirmed present in current
code: `getOccurrences` has the early `if (occIds.length === 0) return [];` plus the
post-partition `if (clauses.length === 0) return [];` guard before building the
query, covering the "non-empty but all-unrecognized" case. No re-application needed.
**Original issue:** When every id had an unknown prefix (or a crafted URL-restored id
like `checklist:` with an empty suffix), `clauses` stayed empty and the query became
`... WHERE ` — a SQL syntax error rejecting the whole batch.

---

_Fixed: 2026-06-08T17:06:00Z_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 1_
