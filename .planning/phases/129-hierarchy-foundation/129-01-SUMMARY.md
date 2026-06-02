---
phase: 129-hierarchy-foundation
plan: 01
subsystem: testing
tags: [pytest, sqlite, duckdb, parquet, taxa, hierarchy, tdd]

# Dependency graph
requires: []
provides:
  - "9 RED hierarchy test functions defining the taxa table contract in test_sqlite_export.py"
  - "taxa_csv_gz fixture: deterministic mini taxa.csv.gz with Anthophila + bycatch rows"
  - "src_parquet_with_taxon fixture: parquet with taxon_id column (bee/bycatch/NULL)"
affects: [129-02, 129-03]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Wave 0 Nyquist scaffold: write all RED acceptance tests before any implementation"
    - "gzip TSV fixture via stdlib gzip+csv+io.StringIO for deterministic in-memory test data"
    - "Parameterized taxa_path injection pattern for testability (no monkeypatch needed for taxa)"

key-files:
  created: []
  modified:
    - data/tests/test_sqlite_export.py

key-decisions:
  - "Test functions call generate_sqlite with taxa_path kwarg even though the kwarg does not exist yet — this is the correct RED state that defines the Plan 02 contract"
  - "test_orphan_assertion_raises imports _assert_no_orphan_taxon_ids directly, establishing that symbol as a required public (module-level) function in sqlite_export.py"

patterns-established:
  - "Hierarchy test pattern: call generate_sqlite(src_parquet_with_taxon, dst, taxa_path=taxa_csv_gz), open sqlite3.connect(dst), query, assert, close"
  - "Bycatch fixture: Vespidae ancestry 48460/1/47120/372739/47158/184884/47157 (no /630955/ segment) — deterministic non-Anthophila marker"

requirements-completed: [HIER-01, HIER-02, HIER-03, HIER-04, HIER-05, HIER-06]

# Metrics
duration: 2min
completed: 2026-06-02
---

# Phase 129 Plan 01: Hierarchy Test Scaffold Summary

**9 RED pytest acceptance tests plus two deterministic fixtures defining the taxa table contract for the Wave 0 Nyquist scaffold — no implementation exists yet**

## Performance

- **Duration:** ~2 min
- **Started:** 2026-06-02T17:43:49Z
- **Completed:** 2026-06-02T17:45:38Z
- **Tasks:** 2
- **Files modified:** 1

## Accomplishments

- Added `taxa_csv_gz` fixture: deterministic gzip TSV with 4 Anthophila rows (superfamily 630955, family Apidae 47221, genus Apis 52775, species Apis mellifera 47219) and 1 bycatch row (Vespidae 52747 with ancestry that excludes `/630955/`)
- Added `src_parquet_with_taxon` fixture: parquet with 3 rows — one bee (47219), one bycatch (52747), one NULL taxon_id
- Added 9 RED hierarchy test functions covering HIER-01..HIER-06: taxa table existence, zero orphans, name/rank non-null, Apidae descendant query, active-taxa-only, orphan assertion raises ValueError, is_anthophila flag, bycatch presence, complex/bycatch counts
- Original 5 occurrences-table tests remain green throughout

## Task Commits

1. **Task 1: Add hierarchy fixtures** - `d2f5fe6` (test)
2. **Task 2: Add 9 RED hierarchy test functions** - `18c8f19` (test)

**Plan metadata:** (docs commit follows)

## Files Created/Modified

- `/home/peter/dev/beeatlas/data/tests/test_sqlite_export.py` - Extended with TAXA_ROWS, PARQUET_WITH_TAXON_ROWS constants, `taxa_csv_gz` fixture, `src_parquet_with_taxon` fixture, and 9 hierarchy test functions (all RED)

## Decisions Made

- Test functions call `generate_sqlite(..., taxa_path=taxa_csv_gz)` and `_assert_no_orphan_taxon_ids` even though these don't exist yet — the failing import/TypeError is the correct RED state that defines the Plan 02 contract exactly
- `test_orphan_assertion_raises` builds a bare sqlite db manually (no generate_sqlite) to test the assertion function in isolation — verifies the guard works independently of the full pipeline

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None. The RED test outcome (9 TypeError / ImportError failures, 5 passing) is the intended result and matches the plan's acceptance criteria exactly.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Plan 02 (implementation) can now begin: it must make `generate_sqlite` accept `taxa_path: Path | None = None` and implement `_build_taxon_hierarchy` + `_assert_no_orphan_taxon_ids`
- The taxa table contract is fully specified by the 9 test functions: schema columns (taxon_id, rank, name, lineage_path, is_anthophila), zero-orphan invariant, Apidae descendant query via `instr(lineage_path, '/47221/')`, bycatch at is_anthophila=0
- No blockers

---
*Phase: 129-hierarchy-foundation*
*Completed: 2026-06-02*
