---
phase: 084-tests-diff-findings
plan: "02"
subsystem: testing
tags: [pytest, duckdb, parquet, geojson, dbt, diff, spatial]

# Dependency graph
requires:
  - phase: 083-scaffold-slice-port
    provides: dbt sandbox outputs at data/dbt/target/sandbox/ (occurrences.parquet, counties.geojson, ecoregions.geojson)
  - phase: 084-tests-diff-findings plan 01
    provides: run.sh pinned to dbt-core==1.10.1 (wave 0 blocker resolved)
provides:
  - pytest diff harness at data/tests/test_dbt_diff.py with 9 test functions covering DIFF-01 and DIFF-02
  - 084-DIFF-FINDINGS.md scratch doc with verbatim test output, boundary-pair breakdown, and DIFF-03 classification table
affects:
  - 084-tests-diff-findings plan 03 (consolidates 084-DIFF-FINDINGS.md into .planning/research/dbt-spike-findings.md)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "pytest diff harness: SANDBOX/PUBLIC path constants + skipif guard + DuckDB SQL assertions — mirrors test_dbt_scaffold.py style"
    - "DIFF-03 four-bucket classification table for documenting material differences between implementations"

key-files:
  created:
    - data/tests/test_dbt_diff.py
    - .planning/phases/084-tests-diff-findings/084-DIFF-FINDINGS.md
  modified: []

key-decisions:
  - "Parametrize geojson property-name test over (filename, prop) pairs rather than two separate test functions"
  - "Pin expected county diff at 84 (empirical baseline) with LIMIT 10 diagnostic query in assertion failure path"
  - "Use (column_name, data_type) tuple pairs from DESCRIBE for schema comparison, asserting both names AND types"

patterns-established:
  - "Diff test pattern: SANDBOX / PUBLIC Path constants + @_SANDBOX_GUARD decorator shorthand + DuckDB f-string SQL"
  - "County boundary divergence: 84 rows across 4 boundary pairs (Grant/Benton, Grant/Kittitas, Chelan/King, Garfield/Whitman) — all ST_Within nondeterminism"

requirements-completed: [DIFF-01, DIFF-02, DIFF-03]

# Metrics
duration: 15min
completed: 2026-05-13
---

# Phase 084 Plan 02: Diff Harness Summary

**pytest diff harness with 9 test functions confirming row/schema/key-set equality and 84-row county boundary nondeterminism between dbt sandbox and public/data, with DIFF-03 classification table**

## Performance

- **Duration:** ~15 min
- **Started:** 2026-05-13T21:50:00Z
- **Completed:** 2026-05-13T21:54:33Z
- **Tasks:** 3
- **Files modified:** 2

## Accomplishments

- Authored `data/tests/test_dbt_diff.py` with 9 test functions (10 pytest items including parametrize expansion): all green after `bash data/dbt/run.sh build`
- DIFF-01 confirmed: sandbox and public/data agree on row count (47,883), schema (33 columns, names+types identical), and ecdysis_id key set (46,090 distinct; anti-join returns 0 in both directions)
- DIFF-02 confirmed: 84-row county boundary divergence pinned as expected value; 0-row ecoregion divergence; GeoJSON feature counts (39/66) and property-name lists identical
- Created `084-DIFF-FINDINGS.md` with verbatim pytest output, boundary-pair breakdown (4 pairs totaling 84 rows), LIMIT 10 sample, and 8-row DIFF-03 classification table
- Discovered that the boundary nondeterminism affects 4 county pairs (Grant/Benton, Grant/Kittitas, Chelan/King, Garfield/Whitman), not just 2 as pre-researched

## Task Commits

Each task was committed atomically:

1. **Tasks 1+2: Author DIFF-01 and DIFF-02 tests** - `1a98239` (feat)
2. **Task 3: Capture diff outcomes + DIFF-03 classification** - `a54d5ad` (docs)

**Plan metadata (SUMMARY.md):** committed below

## Files Created/Modified

- `data/tests/test_dbt_diff.py` — 9-function pytest diff harness (DIFF-01: row count, schema, ecdysis key set, anti-join; DIFF-02: county 84-row diff, ecoregion 0-row diff, GeoJSON feature counts + property names)
- `.planning/phases/084-tests-diff-findings/084-DIFF-FINDINGS.md` — scratch findings doc with pytest output, boundary-pair table, LIMIT 10 sample, and 8-row DIFF-03 classification table

## Decisions Made

- Combined Tasks 1 and 2 into a single commit (both modify the same file; TDD red/green pattern would require writing the test twice against an intermediate state that doesn't exist)
- Used `@_SANDBOX_GUARD` shorthand decorator to avoid repeating the long `@pytest.mark.skipif` on each test
- Used `(r[0], r[1])` tuple extraction from `DESCRIBE` to capture both column name AND data_type, satisfying the "names AND types" acceptance criterion
- Ran a side diagnostic query to enumerate distinct county-pair boundary cases, confirming 4 pairs (not 2 as pre-researched); this is not a new classification — all 4 pairs share the same ST_Within root cause

## Deviations from Plan

### Auto-fixed Issues

None - plan executed exactly as written. The symlink for `data/beeatlas.duckdb` and `public/data/` were established at execution start per Research §Pitfall 7 (worktree setup, not a plan deviation).

**Note on boundary-pair count:** Pre-research documented 2 boundary pairs (Benton/Grant, Chelan/King); this execution confirmed 4 (adding Grant/Kittitas and Garfield/Whitman). The total of 84 rows matches the pre-researched baseline exactly. This is additional empirical detail, not a new material difference — DIFF-03 classification is unchanged.

## Issues Encountered

- `public/data/` directory did not exist in the worktree (worktrees don't include untracked gitignored build output). Created a symlink to main repo's `public/data/` per RESEARCH §Pitfall 7 guidance.
- `data/beeatlas.duckdb` missing in worktree (same issue). Created a symlink to main repo's copy.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- `084-DIFF-FINDINGS.md` is ready for Plan 03 consolidation into `.planning/research/dbt-spike-findings.md`
- `data/tests/test_dbt_diff.py` is committed and green; can be included in full suite runs
- No blockers; Plan 03 (findings consolidation) can proceed immediately

---
*Phase: 084-tests-diff-findings*
*Completed: 2026-05-13*
