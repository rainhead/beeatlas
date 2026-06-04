---
phase: 131-occurrence-normalization
plan: "02"
subsystem: frontend-query-layer
tags: [norm-03, display_name, left-join, bee-table, bee-occurrence-detail, filter]
dependency_graph:
  requires: ["131-01"]
  provides: ["NORM-03-query-display-layer"]
  affects: ["src/filter.ts", "src/bee-table.ts", "src/bee-occurrence-detail.ts"]
tech_stack:
  added: []
  patterns:
    - "LEFT JOIN taxa t ON t.taxon_id = o.taxon_id in SELECT queries (Option A from RESEARCH.md)"
    - "o. prefix for occurrence columns to avoid JOIN ambiguity (RESEARCH.md Pitfall 4)"
key_files:
  created: []
  modified:
    - src/filter.ts
    - src/bee-table.ts
    - src/bee-occurrence-detail.ts
    - src/tests/occurrence.test.ts
decisions:
  - "D-07 Option A (SQL JOIN): display_name resolved in the query layer, not via taxonCache threading"
  - "display_name is a JOIN alias on OccurrenceRow — not added to OCCURRENCE_COLUMNS (not a mart column)"
  - "32 entries remain in OCCURRENCE_COLUMNS after dropping 4 denormalized columns"
metrics:
  duration: "~8 minutes"
  completed: "2026-06-03"
  tasks_completed: 2
  tasks_total: 2
  files_modified: 4
---

# Phase 131 Plan 02: NORM-03 Query + Display Layer Summary

NORM-03 query and display migration: taxa.name resolved via LEFT JOIN in all three page queries; 4 denormalized columns dropped from OccurrenceRow and OCCURRENCE_COLUMNS; bee-table Species column and bee-occurrence-detail._renderProvisional both read display_name with correct null fallback.

## Tasks Completed

| # | Name | Commit | Files |
|---|------|--------|-------|
| 1 | Add LEFT JOIN + display_name; drop 4 columns from OccurrenceRow/OCCURRENCE_COLUMNS | 374f7c6 | src/filter.ts |
| 2 | Point bee-table Species column and _renderProvisional at display_name | 1503785 | src/bee-table.ts, src/bee-occurrence-detail.ts, src/tests/occurrence.test.ts |

## What Was Built

**Task 1 — filter.ts restructure:**
- Dropped `scientificName`, `genus`, `family`, `specimen_inat_taxon_name` from `OccurrenceRow` interface
- Added `display_name: string | null` as a JOIN-resolved alias (documented as not a mart column)
- Removed the 4 columns from `OCCURRENCE_COLUMNS` (36 → 32 entries)
- In `queryTablePage`, `queryListPage`, and `queryAllFiltered`: replaced `OCCURRENCE_COLUMNS.join(', ')` with `OCCURRENCE_COLUMNS.map(c => 'o.' + c).join(', ') + ', t.name AS display_name'` and added `LEFT JOIN taxa t ON t.taxon_id = o.taxon_id` to all three FROM clauses (satisfying the `o.` prefix requirement for JOIN ambiguity avoidance, Pitfall 4)

**Task 2 — presenter migrations:**
- `bee-table.ts`: Species column `dataField` changed from `'scientificName'` to `'display_name'`; `nullLabel: 'No Determination'` unchanged — null display_name correctly renders the null label
- `bee-occurrence-detail.ts` `_renderProvisional`: changed `row.specimen_inat_taxon_name` to `row.display_name` in both the truthy check and the `<em>` interpolation; null branch (`identification pending`) unchanged — LEFT JOIN NULL semantics ensure null when taxon_id IS NULL (Pitfall 5 verified)
- `occurrence.test.ts` `BASE_ROW` fixture: removed 4 dropped fields, added `display_name: null`

## Verification

```
npx vitest run src/tests/filter.test.ts src/tests/bee-table.test.ts
  Test Files  2 passed (2)
  Tests  78 passed (78)

npm run typecheck: clean (0 errors)

npm test: 1 file failed (build-geojson.test.ts — EXPECTED, Wave 2 scope)
          22 files passed, 567 tests passed
```

The 3 failing tests in build-geojson.test.ts are the Wave 2 RED tests that pin the 7-field geo_blob layout — left RED intentionally per wave scoping note.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed occurrence.test.ts BASE_ROW fixture**
- **Found during:** Task 2 (typecheck after Task 1)
- **Issue:** `src/tests/occurrence.test.ts` BASE_ROW still referenced `scientificName`, `genus`, `family`, `specimen_inat_taxon_name` (TypeScript error TS2353 — excess property)
- **Fix:** Removed the 4 dropped fields from BASE_ROW; added `display_name: null` to satisfy the updated OccurrenceRow shape
- **Files modified:** src/tests/occurrence.test.ts
- **Commit:** 1503785

None of the in-scope changes deviated from the plan. The occurrence.test.ts fix was an expected mechanical update (RESEARCH.md §Mechanical in Tests) that was not listed in the plan's file scope but was necessary to achieve a clean typecheck.

## Known Stubs

None — display_name is wired to the JOIN result; null renders the correct fallback label in both consumers.

## Threat Flags

No new trust-boundary surfaces introduced. The JOIN ON clause (`t.taxon_id = o.taxon_id`) uses DB-origin integers on both sides — no user-controlled strings (T-131-02 disposition: accept). No new network endpoints, auth paths, file access patterns, or schema changes at trust boundaries.

## Self-Check

Files exist:
- src/filter.ts — FOUND (modified)
- src/bee-table.ts — FOUND (modified)
- src/bee-occurrence-detail.ts — FOUND (modified)

Commits exist:
- 374f7c6 — FOUND (feat(131-02): LEFT JOIN taxa...)
- 1503785 — FOUND (feat(131-02): point bee-table Species column...)

Acceptance criteria:
- `grep -c "LEFT JOIN taxa t ON t.taxon_id = o.taxon_id" src/filter.ts` → 3 PASS
- `grep -q "display_name: string | null" src/filter.ts` → PASS
- `grep -nE "'scientificName'|'genus'|'family'|'specimen_inat_taxon_name'" src/filter.ts` → 0 matches in OCCURRENCE_COLUMNS PASS
- `npx vitest run src/tests/filter.test.ts` → 0 PASS
- `npx vitest run src/tests/bee-table.test.ts` → 0 PASS
- `npm run typecheck` → clean PASS

## Self-Check: PASSED
