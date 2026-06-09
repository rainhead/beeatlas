---
phase: 140-checklist-taxonomy-fixture-distillation
plan: "02"
subsystem: data-tests
tags: [fixtures, test-infrastructure, duckdb, module-scope, performance]
dependency_graph:
  requires:
    - 140-01 (load_checklist(con=None) seam, TAXA_PATH constant, fixture files)
  provides:
    - data/tests/test_checklist_pipeline.py: module-scoped shared-connection fast tier
    - data/tests/test_resolve_checklist_names.py: TAXA_PATH fixture redirect
    - data/tests/fixtures/wa_bee_checklist_sample.tsv (6 species, 8 county rows)
    - data/tests/fixtures/checklist_records_sample.tsv (6 rows)
    - data/tests/fixtures/taxa_subset.csv.gz updated (3 rows: added subgenus 606634)
  affects:
    - data/tests/BASELINE.md (Phase 142 will update with after-numbers)
tech_stack:
  added: []
  patterns:
    - module-scoped shared in-memory DuckDB connection via request.addfinalizer
    - direct setattr + addfinalizer teardown (avoids monkeypatch scope mismatch)
    - taxa_subset.csv.gz redirect for all refresh=True resolver tests
key_files:
  created:
    - data/tests/fixtures/wa_bee_checklist_sample.tsv
    - data/tests/fixtures/checklist_records_sample.tsv
  modified:
    - data/tests/test_checklist_pipeline.py
    - data/tests/test_resolve_checklist_names.py
    - data/tests/fixtures/taxa_subset.csv.gz (added subgenus row 606634)
decisions:
  - "Also override CHECKLIST_PATH and CHECKLIST_RECORDS_PATH in checklist_sample_db
    (wa_bee_checklist_records.tsv has 50k rows like the full CSV; DuckDB executemany
    on 527 species + 2861 county rows takes ~8s defeating the module-scope goal)"
  - "n > 100 assertions relaxed to n >= 1 for species/species_counties since CHECKLIST_PATH
    is now overridden to the 6-row small fixture"
  - "taxa_subset.csv.gz updated to include subgenus row (606634, Agapostemon) so the
    secondary gz-scan in _slash_canonical_name can resolve the LCA name"
  - "test_checklist_records_full_slash_rows_get_lca_canonical_name now always asserts
    canon is not None (fixture always present in fast tier)"
metrics:
  duration: "~30 minutes"
  completed: "2026-06-06"
  tasks_completed: 2
  tasks_total: 2
  files_created: 2
  files_modified: 3
---

# Phase 140 Plan 02: Test Rewrite Summary

One-liner: Migrated ~20 checklist fast-tier tests to a module-scoped shared in-memory DuckDB connection (loaded once from 8-row sample), and added TAXA_PATH fixture redirect to the resolver tests — fast tier now runs in ~5-6s total, down from minutes.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Add module-scoped fixture + migrate fast-tier tests | d18c149 | data/tests/test_checklist_pipeline.py, data/tests/fixtures/taxa_subset.csv.gz, data/tests/fixtures/checklist_records_sample.tsv, data/tests/fixtures/wa_bee_checklist_sample.tsv |
| 2 | Wire TAXA_PATH redirect in checklist_resolver_db | d141e93 | data/tests/test_resolve_checklist_names.py |

## What Was Built

### Task 1: test_checklist_pipeline.py Rewrite

**New `checklist_sample_db` module-scoped fixture:**

- `scope="module"` with `request.addfinalizer` pattern (not function-scoped monkeypatch — avoids ScopeMismatch per RESEARCH Pitfall 1)
- Overrides `CHECKLIST_RECORDS_FULL_PATH`, `CHECKLIST_RECORDS_PATH`, `CHECKLIST_PATH`, and `TAXA_PATH` via direct `setattr`
- Resets `mod._TAXA_ANCESTRY = None` before `load_checklist(con=con)` (RESEARCH Pitfall 2 — stale cache guard)
- Bootstraps `ecdysis_data.occurrences` before `load_checklist()` (T-76-04 ordering invariant / RESEARCH Pattern D)
- Returns the shared `duckdb.connect(":memory:")` connection; teardown restores originals and closes

**~20 fast-tier tests migrated:** Each test now takes `checklist_sample_db`, binds `con = checklist_sample_db`, and queries the shared connection directly. No per-test `duckdb.connect()`, `importlib.reload()`, or `con.close()`.

**Two idempotency tests** (`test_load_checklist_is_idempotent`, `test_checklist_records_full_is_idempotent`) call `mod.load_checklist(con=con)` a second time — safe under `CREATE OR REPLACE` semantics.

**Count assertions rewritten (D-09):**
- `null_coord_count == 1` (was `> 1000`)
- `n_none == 3` (was `> 1000`)

**Integration tests unchanged:** `test_checklist_records_full_row_count` and `test_checklist_records_full_schema` keep the `checklist_db` fixture and read the real CSV.

**Integration test schema updated:** Added `canonical_name` to the required column set in `test_checklist_records_full_schema` (Open Question #2 — column added in Phase 135 but missing from assertion).

### Task 2: test_resolve_checklist_names.py Wiring

Added `FIXTURES_DIR = Path(__file__).parent / "fixtures"` constant and one `monkeypatch.setattr(resolve_checklist_names, "TAXA_PATH", str(FIXTURES_DIR / "taxa_subset.csv.gz"))` inside `checklist_resolver_db`. All `refresh=True` tests now read the 3-row fixture gz instead of 39 MB `raw/taxa.csv.gz`.

D-07 verified: fast tier passes with `raw/taxa.csv.gz` absent (6 passed, 1 deselected pre-existing red).

## Verification Results

```
Fast-tier checks (all pass):
  grep -q 'scope="module"' tests/test_checklist_pipeline.py          OK
  grep -q "load_checklist(con=con)" tests/test_checklist_pipeline.py  OK
  grep -q "null_coord_count == 1" tests/test_checklist_pipeline.py    OK
  grep -q "n_none == 3" tests/test_checklist_pipeline.py             OK
  no "> 1000" in non-comment lines                                    OK
  grep -q "taxa_subset.csv.gz" tests/test_resolve_checklist_names.py OK
  grep -q 'setattr(resolve_checklist_names, "TAXA_PATH"' ...         OK
  integration tests collect test_checklist_records_full_row_count     OK

Test run results:
  test_checklist_pipeline.py -m 'not integration':  38 passed, 3 skipped in ~5s
  test_resolve_checklist_names.py -m 'not integration' (with taxa.csv.gz absent,
    --deselect test_at_least_13_fuzzy_candidates):  6 passed in ~6s
```

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] CHECKLIST_RECORDS_PATH also needed overriding**

- **Found during:** Task 1 initial test run (fixture hung for >20s)
- **Issue:** `wa_bee_checklist_records.tsv` has ~50,646 rows (same as the full CSV). The plan said "both TSVs are small" but only checked `wa_bee_checklist.tsv`; `wa_bee_checklist_records.tsv` is the per-record occurrence file and is equally large.
- **Fix:** Override `CHECKLIST_RECORDS_PATH` to `checklist_records_sample.tsv` (6 rows) in `checklist_sample_db`.
- **Files modified:** data/tests/test_checklist_pipeline.py, data/tests/fixtures/checklist_records_sample.tsv (created)

**2. [Rule 1 - Bug] DuckDB executemany on 527 species rows is slow (~3s)**

- **Found during:** Task 1 after overriding CHECKLIST_RECORDS_PATH (still ~9s)
- **Issue:** DuckDB's parametrized `executemany` on 527 species rows and 2861 county rows takes ~8s total with an in-memory connection — too slow for module scope goal.
- **Fix:** Also override `CHECKLIST_PATH` to `wa_bee_checklist_sample.tsv` (6 species, 8 county rows). Load time drops to ~0.2s.
- **Consequence:** Species/county count assertions relaxed from `n > 100` to `n >= 1`. Structural and quality invariants (`n_null == 0`, `n_status == 0`) preserved unchanged.
- **Files modified:** data/tests/test_checklist_pipeline.py, data/tests/fixtures/wa_bee_checklist_sample.tsv (created)

**3. [Rule 1 - Bug] taxa_subset.csv.gz missing the subgenus LCA row (606634)**

- **Found during:** Task 1 after all path overrides applied
- **Issue:** `_slash_canonical_name()` resolves the LCA to taxon_id 606634 (subgenus Agapostemon), then tries to find its name in the taxa gz. The 2-row fixture (species only) doesn't contain the subgenus row; gz scan returns None. The slash-row test expected non-null canonical_name with fixture present.
- **Fix:** Added subgenus row (taxon_id=606634, rank=subgenus, name=Agapostemon) to `taxa_subset.csv.gz`. LCA name lookup now succeeds: `'agapostemon'`.
- **Files modified:** data/tests/fixtures/taxa_subset.csv.gz (now 3 data rows)
- **Commit:** d18c149

**4. [Rule 2 - Missing] test_checklist_records_full_slash_rows_get_lca_canonical_name strengthened**

- **Found during:** Task 1 after adding subgenus row to fixture
- **Issue:** The original test had a conditional `if taxa_available` guard that made the LCA assertion environment-dependent. With the fixture always present in the fast tier, the condition is always true. The test was rewritten to always assert `canon is not None`.
- **Fix:** Removed the environment-limited guard; now unconditionally asserts `canon is not None` (fixture always present).
- **Files modified:** data/tests/test_checklist_pipeline.py

## Scope Fence Compliance

- No production code changes (checklist_pipeline.py, resolve_checklist_names.py untouched)
- `test_at_least_13_fuzzy_candidates` assertion unchanged; remains red (Phase 141)
- The two `@pytest.mark.integration` tests unchanged; still read real CSV via `checklist_db`
- No dbt/nightly/run.py changes
- No other test files touched

## Known Stubs

None. All fixture files are complete committed data.

## Threat Flags

None. Test-only changes; no new trust boundaries.

## Self-Check: PASSED

- [x] `data/tests/test_checklist_pipeline.py` contains `scope="module"` — FOUND (commit d18c149)
- [x] `data/tests/test_checklist_pipeline.py` contains `load_checklist(con=con)` — FOUND
- [x] `data/tests/test_checklist_pipeline.py` contains `null_coord_count == 1` — FOUND
- [x] `data/tests/test_checklist_pipeline.py` contains `n_none == 3` — FOUND
- [x] No `> 1000` assertions in non-comment lines — VERIFIED (0 matches)
- [x] `data/tests/test_resolve_checklist_names.py` contains `taxa_subset.csv.gz` — FOUND (commit d141e93)
- [x] `data/tests/fixtures/wa_bee_checklist_sample.tsv` — FOUND (commit d18c149)
- [x] `data/tests/fixtures/checklist_records_sample.tsv` — FOUND (commit d18c149)
- [x] `data/tests/fixtures/taxa_subset.csv.gz` updated (3 rows) — FOUND
- [x] Fast tier 38 passed in ~5s — VERIFIED
- [x] D-07 (fast tier with taxa.csv.gz absent): 6 passed — VERIFIED
- [x] Commits verified: d18c149, d141e93
