---
phase: 92-slug-migration-pipeline-prep
plan: "01"
subsystem: testing
tags: [pytest, dbt, duckdb, parquet, species-export, species-maps, vitest]

requires:
  - phase: 86-port-remaining-transforms
    provides: species_export.py and species_maps.py production modules under test

provides:
  - "Failing pytest tests for PIPE-03a/b (slug format: Genus/epithet) in test_species_export.py"
  - "Failing pytest test for PIPE-03c (subdir write) in test_species_maps.py"
  - "Updated validate-species.test.ts fixture slug to Osmia/lignaria for consistency"

affects:
  - 92-02 (Plan 02 will edit species_export.py and species_maps.py; these tests provide the GREEN gate signal)

tech-stack:
  added: []
  patterns:
    - "_SANDBOX_GUARD = pytest.mark.skipif(not (SANDBOX / 'species.parquet').exists(), ...) — skip guard for dbt sandbox tests"
    - "monkeypatch.setattr(se_mod, 'ASSETS_DIR', tmp_path) — module-attr override for isolation (no env var)"
    - "monkeypatch.setenv('DBT_SANDBOX_DIR', str(SANDBOX)) — env override for read path in export tests"

key-files:
  created:
    - data/tests/test_species_export.py
    - data/tests/test_species_maps.py
  modified:
    - src/tests/validate-species.test.ts

key-decisions:
  - "No production code touched in Plan 01 — all three files are test-only changes ensuring RED gate before Plan 02 edits"
  - "SANDBOX guard used for test_species_export.py (reads real parquet); test_species_maps.py is guard-free (pure function, no parquet needed)"

patterns-established:
  - "Test scaffolding before production edits: Wave 0 creates the RED-gate tests; Wave 1 (Plan 02) makes them GREEN"

requirements-completed:
  - PIPE-03

duration: 8min
completed: 2026-05-15
---

# Phase 92 Plan 01: Slug Migration Test Scaffolding Summary

**Two failing pytest tests and one fixture update establish the RED gate for Plan 02's Genus/epithet slug migration: test_species_export.py (PIPE-03a/b) SKIPs on sandbox absence, test_species_maps.py (PIPE-03c) FAILs with FileNotFoundError, validate-species.test.ts updated to 'Osmia/lignaria' fixture**

## Performance

- **Duration:** ~8 min
- **Started:** 2026-05-15T21:39:00Z
- **Completed:** 2026-05-15T21:47:20Z
- **Tasks:** 3
- **Files modified:** 3

## Accomplishments

- Created `data/tests/test_species_export.py` with 2 tests guarded by `_SANDBOX_GUARD` — tests will FAIL against current `_slugify`-based slug assignment when sandbox exists, SKIP when absent
- Created `data/tests/test_species_maps.py` with 1 test — FAILS in RED state with `FileNotFoundError` because `_write_species_svg` does not call `out_path.parent.mkdir()` before writing when slug contains `/`
- Updated line 14 of `src/tests/validate-species.test.ts` to use `slug: 'Osmia/lignaria'` for conceptual consistency; all 16 existing tests continue to pass

## RED State Evidence

**test_species_export.py:** Both tests SKIPPED (sandbox absent — `data/dbt/target/sandbox/species.parquet` not present in this environment). Skip is correct behavior per the plan's done criteria.

**test_species_maps.py:** Test FAILED with:
```
FileNotFoundError: [Errno 2] No such file or directory:
  '.../Andrena/milwaukeensis.svg'
```
This confirms the RED state: `_write_species_svg` at line 167 of `species_maps.py` does `out_dir / f"{slug}.svg"` (where slug is `"Andrena/milwaukeensis"`) without creating the `Andrena/` parent directory.

**validate-species.test.ts:** All 16 tests passed after the slug fixture value change (slug is not format-validated in any assertion).

## Task Commits

Each task was committed atomically:

1. **Task 1: test_species_export.py (PIPE-03a/b)** - `505c54c` (test)
2. **Task 2: test_species_maps.py (PIPE-03c)** - `6dd76ef` (test)
3. **Task 3: validate-species.test.ts fixture update** - `ee3dbc4` (chore)

**Plan metadata:** (committed after SUMMARY)

## Files Created/Modified

- `data/tests/test_species_export.py` — 2 pytest tests with `_SANDBOX_GUARD`, `monkeypatch.setattr(se_mod, 'ASSETS_DIR', tmp_path)`, and `monkeypatch.setenv('DBT_SANDBOX_DIR', ...)` patterns
- `data/tests/test_species_maps.py` — 1 pure-function pytest test asserting subdir creation for hierarchical slug paths
- `src/tests/validate-species.test.ts` — Line 14: `slug: 'osmia-lignaria'` → `slug: 'Osmia/lignaria'`

## Decisions Made

- Used `_SANDBOX_GUARD` only for `test_species_export.py` (reads real dbt-produced parquet); `test_species_maps.py` needs no guard since it is a pure-function test with no parquet dependency
- Used `monkeypatch.setattr(se_mod, 'ASSETS_DIR', tmp_path)` (not env var) per established Phase 27 pattern — module-level globals set at import time are unreliable via env override after first import

## Deviations from Plan

None - plan executed exactly as written. No production code was modified.

## Issues Encountered

None. The sandbox parquet being absent caused the export tests to SKIP rather than FAIL, which is explicitly acceptable per the plan's done criteria.

## Known Stubs

None - all files are test-only. No data sources, UI rendering, or placeholder values.

## Next Phase Readiness

- `data/tests/test_species_export.py` and `data/tests/test_species_maps.py` provide the automated RED gate for Plan 02's production code edits
- Plan 02 executor will edit `data/species_export.py` (slug assignment line 141) and `data/species_maps.py` (add `mkdir`, change `glob` to `rglob`)
- When sandbox parquet is available: `test_slug_hierarchical` and `test_no_old_slug_format` must fail RED against current code, then pass GREEN after Plan 02 edits
- `test_write_species_svg_creates_subdir` is already confirmed RED and will pass GREEN immediately after Plan 02 adds the `mkdir` line

---
*Phase: 92-slug-migration-pipeline-prep*
*Completed: 2026-05-15*
