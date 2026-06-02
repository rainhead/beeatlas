---
phase: 129-hierarchy-foundation
plan: 03
subsystem: database
tags: [sqlite, wa-sqlite, duckdb, taxa, hierarchy, benchmark, materialized-path]

# Dependency graph
requires:
  - phase: 129-02
    provides: taxa table with materialized lineage_path built into occurrences.db
provides:
  - HIER-03 benchmark evidence: Apidae descendant query in wa-sqlite/Firefox measured at 2.0 ms
  - HIER-06 count report: complex-rank occurrences (0), bycatch (106 taxa / 2,020 rows), total taxa rows (940)
  - Structure decision: materialized path retained (D-02 default confirmed by benchmark)
  - PAGE-05 decision recorded as dropped per D-01
  - Zero-orphan confirmation on live data
  - 129-VERIFICATION.md: complete phase-gate artifact
affects: [129-130, phases-130-through-133]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "VERIFICATION.md pattern: phase-gate artifact recording benchmark evidence + count results + decisions"
    - "Temporary benchmark via getDB()/sqlite3.exec() in bee-atlas.ts firstUpdated, removed after recording"

key-files:
  created:
    - .planning/phases/129-hierarchy-foundation/129-VERIFICATION.md
  modified:
    - data/sqlite_export.py (subtribe rank fix — auto-fix applied in Task 1 / Plan 02)
    - src/bee-atlas.ts (TEMPORARY benchmark block added then removed)

key-decisions:
  - "Materialized path (lineage_path + instr() descendant queries) KEPT — D-02 default confirmed by 2.0 ms Firefox benchmark (well below ~100 ms perceptual bar per D-03)"
  - "Nested-set lft/rgt (RESEARCH.md Pattern 6) deferred — only if table grows substantially and future benchmark shows clear sluggishness"
  - "PAGE-05 (complex pages) dropped per D-01 — 0 complex-rank occurrences in current data confirms no occurrence-volume pressure to reconsider"
  - "D-04 scoping confirmed: 940 taxa rows shipped (observed+checklist+ancestors only), not full ~17K active-Anthophila set"

patterns-established:
  - "Benchmark code pattern: temporary getDB()/sqlite3.exec() block in firstUpdated, removed after recording result"
  - "VERIFICATION.md sections: (1) structure decision, (2) benchmark result, (3) complex count, (4) bycatch/PAGE-05, (5) zero-orphan, (6) db size + taxa row count + D-04 scoping"

requirements-completed: [HIER-03, HIER-06]

# Metrics
duration: 60min
completed: 2026-06-02
---

# Phase 129 Plan 03: Benchmark + Verification Summary

**Apidae descendant query measured at 2.0 ms in Firefox 151 (aarch64) on the 940-row D-04-scoped taxa table — materialized path retained; 129-VERIFICATION.md complete with all 6 required sections**

## Performance

- **Duration:** ~60 min (including human checkpoint for Firefox benchmark)
- **Started:** 2026-06-02
- **Completed:** 2026-06-02
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments

- Built real occurrences.db (26.72 MB) with taxa table and gathered all HIER-06 counts against live data
- Ran Apidae descendant benchmark in Firefox 151 — 2.0 ms, 239 rows; confirms materialized-path structure passes the ~100 ms D-03 bar with wide margin
- Produced complete 129-VERIFICATION.md documenting the structure decision, benchmark evidence, complex-rank counts, bycatch counts, zero-orphan confirmation, and D-04 scoping evidence

## Task Commits

1. **Task 1: Build real occurrences.db and gather HIER-06 counts** - `a14a432` (feat)
2. **Task 2: Finalize VERIFICATION.md with benchmark result; remove temp benchmark code** - `c9acaec` (docs)

## Files Created/Modified

- `.planning/phases/129-hierarchy-foundation/129-VERIFICATION.md` - Phase-gate artifact: all 6 required sections complete (structure decision, benchmark, complex count, bycatch/PAGE-05, zero-orphan, db size + taxa rows)
- `data/sqlite_export.py` - Subtribe rank auto-fix (Rule 1, Task 1): extended rank filter to include 'subtribe' to resolve 6 missing-parent assertion failures
- `src/bee-atlas.ts` - Temporary benchmark block added (Task 1) then removed (Task 2)

## Decisions Made

- **Structure: materialized path retained.** 2.0 ms Firefox benchmark is well below the ~100 ms perceptual bar. D-02 default confirmed. Nested-set deferred unless table grows substantially.
- **PAGE-05 dropped, confirmed.** 0 complex-rank occurrences. D-01 decision recorded with evidence.
- **D-04 scoping confirmed.** 940 taxa rows shipped (observed+checklist+ancestors). STACK.md ~110ms worst-case math (for ~17K rows) does not apply to this artifact.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Extended subtribe rank filter in sqlite_export.py**
- **Found during:** Task 1 (Build real occurrences.db)
- **Issue:** The missing-parent assertion fired for 6 subtribe taxon_ids (572163, 572165, 1597677, 1597678, 1597681, 1671673). These ancestor nodes appear in the lineage_path of observed species but were excluded by the PASS 1 rank filter.
- **Fix:** Extended the rank filter in `sqlite_export.py` to include `'subtribe'`. All 6 subtribes now in the taxa table.
- **Files modified:** `data/sqlite_export.py`
- **Verification:** Zero-orphan assertion passes; all 14 hierarchy + occurrences tests still green.
- **Committed in:** `a14a432` (Task 1 commit)

---

**Total deviations:** 1 auto-fixed (Rule 1 bug)
**Impact on plan:** Fix was necessary for correctness — the orphan assertion gate would have failed nightly without it. No scope creep.

## Issues Encountered

None beyond the auto-fixed subtribe rank issue above.

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness

- Phase 129 is complete. The `taxa` table ships in `occurrences.db` as an additive, zero-read-path change. Nothing reads it until Phase 130.
- Phase 130 (Map Filter Cutover) can begin: the taxa table provides the taxon_id-keyed hierarchy for frontend filter infrastructure.
- Phase 132 (Page Rebuild) can be planned independently (depends on Phase 129 only, not Phase 131).
- No blockers. The subtribe fix is committed and all tests pass.

## Known Stubs

None.

## Threat Flags

None — build-time pipeline only; no new network endpoints, auth paths, or file access patterns introduced.

## Self-Check

- [x] `.planning/phases/129-hierarchy-foundation/129-VERIFICATION.md` exists and contains all 6 sections
- [x] Commit `a14a432` exists (Task 1)
- [x] Commit `c9acaec` exists (Task 2)
- [x] `src/bee-atlas.ts` has no HIER-03 benchmark code remaining
- [x] `npm run typecheck` passes after benchmark removal

---
*Phase: 129-hierarchy-foundation*
*Completed: 2026-06-02*
