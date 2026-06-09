---
phase: 137-promotion-into-occurrences
plan: 01
subsystem: database
tags: [dbt, duckdb, parquet, sql, pipeline, checklist, occurrences, union-all]

# Dependency graph
requires:
  - phase: 136-deduplication
    provides: int_checklist_dedup_status view with dedup_status column; Phase 137 consumes with WHERE dedup_status IS DISTINCT FROM 'confirmed'
provides:
  - ARM 4 (source='checklist') in int_combined.sql, adding 19,929 deduplicated coord-bearing checklist records to occurrences.parquet
  - checklist_id INTEGER column in the enforced 34-column occurrences dbt contract (schema.yml)
  - NULL::INTEGER AS checklist_id appended to ARMs 1-3 of int_combined for UNION ALL type alignment
  - Retired Phase 111 isolation test with re-baselined ceiling + positive source='checklist' assertion + v4.7 comment
  - dedup_decisions seed column_types fix (dbt_project.yml + view-level VARCHAR cast) for empty-CSV DuckDB type inference bug
affects:
  - 137-02 (geo_blob + features.ts atomic change — depends on checklist_id in occurrences.parquet)
  - 138-frontend-points (reads source='checklist' + checklist_id from occurrences.parquet)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "UNION ALL NULL cast: NULL::INTEGER AS checklist_id in all non-checklist ARMs; untyped NULL forbidden in DuckDB UNION ALL"
    - "Empty CSV seed type inference: dbt_project.yml +column_types + view-level CAST AS VARCHAR guards against INTEGER inference on empty seeds"
    - "date VARCHAR construction for partial-precision records: CAST(CASE date_quality WHEN 'full' THEN printf WHEN 'year_only' THEN printf ELSE NULL END AS VARCHAR)"

key-files:
  created: []
  modified:
    - data/dbt/models/intermediate/int_combined.sql
    - data/dbt/models/intermediate/int_checklist_dedup_status.sql
    - data/dbt/models/marts/occurrences.sql
    - data/dbt/models/marts/schema.yml
    - data/dbt/dbt_project.yml
    - data/tests/test_dbt_scaffold.py

key-decisions:
  - "dedup_decisions empty-CSV type inference fixed in the view (CAST AS VARCHAR on CASE expression) rather than only in dbt_project.yml, because dbt-duckdb 1.10.1 does not apply +column_types to zero-row seeds"
  - "test_source_no_nulls updated to allow 'checklist' as valid source (Rule 1 auto-fix — broke when ARM 4 correctly added 19,929 rows)"
  - "Ceiling in test_occurrences_row_count_not_inflated_by_checklist set to 160,000 (generous absorbs current ~86K total + growth headroom)"

requirements-completed: [PRO-01, PRO-02, PRO-03]

# Metrics
duration: 10min
completed: 2026-06-08
---

# Phase 137 Plan 01: Promote Checklist into Occurrences Summary

**ARM 4 (source='checklist') added to int_combined UNION ALL, 19,929 deduplicated coord-bearing checklist records now in occurrences.parquet with checklist_id INTEGER, enforced 34-column dbt contract green**

## Performance

- **Duration:** ~10 min
- **Started:** 2026-06-08T20:11Z
- **Completed:** 2026-06-08T20:21Z
- **Tasks:** 2
- **Files modified:** 6

## Accomplishments

- 19,929 deduplicated, coord-bearing checklist records now appear in occurrences.parquet as source='checklist' with non-NULL checklist_id (= ObjectID from int_checklist_collapsed)
- Enforced dbt occurrences contract bumped 33 → 34 columns (added checklist_id INTEGER); dbt build exits 0 with no type errors
- ARMs 1-3 each emit NULL::INTEGER AS checklist_id ensuring UNION ALL type alignment
- Phase 111 isolation test (checklist exclusion invariant) explicitly retired with re-baselined ceiling (160,000), positive source='checklist' existence assertion, and greppable v4.7/Phase 137 reversal comment
- Fixed pre-existing blocking bug: DuckDB infers INTEGER type for all columns in empty CSV seeds; added CAST AS VARCHAR to int_checklist_dedup_status view so dedup_status correctly handles the empty dedup_decisions.csv state

## Task Commits

Each task was committed atomically:

1. **Task 1: ARM 4 + NULL casts + schema contract** - `ea0b82b` (feat)
2. **Task 2: Retire Phase 111 test + fix source_no_nulls** - `0e8147d` (feat)

**Plan metadata:** (final commit below)

## Files Created/Modified

- `data/dbt/models/intermediate/int_combined.sql` - Added ARM 4 (checklist UNION ALL arm); NULL::INTEGER AS checklist_id appended to ARMs 1-3
- `data/dbt/models/intermediate/int_checklist_dedup_status.sql` - Added CAST AS VARCHAR to dedup_status CASE expression (empty-seed type fix)
- `data/dbt/models/marts/occurrences.sql` - Added j.checklist_id to final SELECT so it flows through the spatial join
- `data/dbt/models/marts/schema.yml` - Added checklist_id (data_type: integer) to occurrences contract → 34 columns
- `data/dbt/dbt_project.yml` - Added dedup_decisions +column_types (pair_key/dedup_status/note: varchar)
- `data/tests/test_dbt_scaffold.py` - Retired Phase 111 isolation test body; fixed test_source_no_nulls to allow 'checklist'

## Decisions Made

- Fixed the empty-seed type inference issue at the view level (CAST AS VARCHAR in int_checklist_dedup_status) rather than relying solely on dbt_project.yml column_types, because dbt-duckdb 1.10.1 does not apply +column_types to seeds with zero data rows. Both fixes are committed for belt-and-suspenders when the seed eventually has rows.
- Set Phase 111 test ceiling to 160,000 (current total is ~86,343 = 48,836 ecdysis + 19,929 checklist + 17,545 inat_obs + 33 waba_sample) — generous headroom for data growth while catching runaway JOIN explosions.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] dedup_decisions empty-CSV DuckDB type inference produced INTEGER dedup_status**
- **Found during:** Task 1 (dbt build — int_combined build failed with "Could not convert string 'confirmed' to INT32")
- **Issue:** DuckDB infers INTEGER for all columns in a CSV with only a header row and no data. `dedup_decisions.csv` has zero data rows. The view's `BOOL_OR(dd.dedup_status = 'confirmed')` comparison then tried to cast the string literal 'confirmed' to INT32, raising a conversion error. The view was created successfully (syntactically valid) but failed at query time.
- **Fix:** Added `CAST(... AS VARCHAR)` to the dedup_status CASE expression in `int_checklist_dedup_status.sql`; also added `+column_types` for dedup_decisions in `dbt_project.yml` as belt-and-suspenders for when the seed has data.
- **Files modified:** data/dbt/models/intermediate/int_checklist_dedup_status.sql, data/dbt/dbt_project.yml
- **Verification:** `SELECT * FROM beeatlas.dbt_sandbox.int_checklist_dedup_status LIMIT 5` returned 5 rows after fix; dbt build succeeded.
- **Committed in:** ea0b82b (Task 1 commit)

**2. [Rule 1 - Bug] test_source_no_nulls failed with 19,929 unexpected source values**
- **Found during:** Task 2 (pytest -m integration revealed pre-existing test broke when ARM 4 correctly added checklist rows)
- **Issue:** `test_source_no_nulls` asserted `WHERE source NOT IN ('ecdysis', 'waba_sample', 'inat_obs')` = 0 rows, but now correctly has 19,929 rows with source='checklist'. This test reflected the old Phase 111 invariant (checklist exclusion).
- **Fix:** Added 'checklist' to the allowed source values list in the test; updated docstring to reference Phase 137 and PRO-01.
- **Files modified:** data/tests/test_dbt_scaffold.py
- **Verification:** All 19 integration tests pass green.
- **Committed in:** 0e8147d (Task 2 commit)

---

**Total deviations:** 2 auto-fixed (1 blocking, 1 bug)
**Impact on plan:** Both fixes necessary for correctness. The empty-seed type inference bug was a pre-existing time bomb in Phase 136's model that would have blocked any Phase 137 build. The source list test was a stale guard from Phase 111's exclusion invariant.

## Issues Encountered

- DuckDB 1.10.1 behavior: empty CSV seeds produce INTEGER-typed columns regardless of `+column_types` in dbt_project.yml. This is a DuckDB/dbt-duckdb interaction bug — `+column_types` only takes effect when the CSV has data rows that override type inference. The view-level CAST is the durable fix.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- occurrences.parquet now contains 19,929 source='checklist' rows with non-NULL checklist_id
- checklist_id is NULL for all non-checklist rows (verified by spot-check query)
- Plan 02 (geo_blob ↔ features.ts atomic change) can now proceed: it reads checklist_id from occurrences.parquet/occurrences.db

## Known Stubs

None — ARM 4 data is real (Phase 136 deduplicated records); no placeholder values.

## Threat Flags

None — no new network endpoints, auth paths, or file access patterns introduced.

---
*Phase: 137-promotion-into-occurrences*
*Completed: 2026-06-08*
