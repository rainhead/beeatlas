---
phase: 076-data-foundation
plan: 05
subsystem: data-pipeline
tags: [duckdb, canonical-name, reconciliation, checklist, synonyms, taxonomy]

requires:
  - phase: 076-data-foundation/02
    provides: canonicalize() helper (5-step name canonicalization)
  - phase: 076-data-foundation/03
    provides: checklist_data.species table with canonical_name populated
provides:
  - ecdysis_data.occurrences.canonical_name materialized via _update_occurrences_canonical_name()
  - reconcile() function reading synonyms.csv and writing checklist_unmatched.csv
  - Synonym-override path that UPDATEs checklist_data.species.canonical_name
  - Initial header-only data/checklist_unmatched.csv snapshot
affects: [076-06, 077-species-aggregation]

tech-stack:
  added: []
  patterns:
    - "ALTER TABLE ... ADD COLUMN IF NOT EXISTS for idempotent column materialization across replace-mode loads"
    - "Reconcile-and-warn pattern: LEFT JOIN to detect unmatched, sidecar CSV writeback, never raise"
    - "Synonym-override-then-update pattern: rewrite checklist_data.species.canonical_name in place so downstream consumers don't need synonyms.csv awareness"

key-files:
  created:
    - data/checklist_unmatched.csv
    - data/tests/test_checklist_reconcile.py
  modified:
    - data/checklist_pipeline.py
    - data/tests/test_checklist_pipeline.py

key-decisions:
  - "Column name on ecdysis_data.occurrences is `scientific_name` (snake_case) — verified live; embedded as literal in SQL with no `scientificName` fallback"
  - "Synonym-override hits UPDATE checklist_data.species.canonical_name in place (researcher open-question-3 resolution) so Phase 77 species_export.py can FULL OUTER JOIN on canonical_name without re-reading synonyms.csv"
  - "Test fixture for load_checklist() now pre-creates a minimal ecdysis_data.occurrences (mirrors prod ordering invariant T-76-04 — ecdysis runs before checklist)"

patterns-established:
  - "Sidecar reviewer-output CSV: regenerated each pipeline run, header schema locked in code, never raises on non-empty output"
  - "Idempotent column materialization on dlt-replace tables via ALTER TABLE ... IF NOT EXISTS"

requirements-completed: [CHECK-05, CHECK-06]

duration: ~12min
completed: 2026-05-02
---

# Phase 076 Plan 05: Reconciliation Summary

**Materialized canonical_name on ecdysis_data.occurrences and shipped synonyms.csv-driven reconciliation with checklist_unmatched.csv writeback (D-04 + D-05).**

## Performance

- **Duration:** ~12 min
- **Tasks:** 2 (Task 1 TDD: RED + GREEN; Task 2: snapshot)
- **Files modified:** 4 (1 created code, 1 modified code, 1 created test, 1 modified test, 1 created data file)

## Accomplishments

- `_update_occurrences_canonical_name(con)` adds `canonical_name VARCHAR` to `ecdysis_data.occurrences` (idempotent via `ADD COLUMN IF NOT EXISTS`, safe under nightly dlt-replace) and bulk-updates from `canonicalize(scientific_name)` over distinct names
- `reconcile(con)` LEFT JOINs `checklist_data.species` against `ecdysis_data.occurrences` on `canonical_name`, applies synonyms.csv overrides (UPDATE path), and writes still-unmatched rows to `data/checklist_unmatched.csv` with locked header `checklist_name,canonical_name,reason`
- Both functions wired into `load_checklist()` AFTER the species inserts, BEFORE `con.close()`, so the export step (which runs after `load_checklist`) sees the populated column
- D-05 warn-only invariant enforced: `reconcile()` body contains zero `raise` statements; an empty unmatched.csv is the success state, a non-empty one is reviewer triage signal
- 8 new TDD tests in `tests/test_checklist_reconcile.py` covering: column add idempotency, NULL/empty handling, header-only success, unmatched recording, synonym override (hits + misses), and overwrite of stale unmatched.csv content

## Task Commits

1. **Task 1 RED:** `24a453b` (test) — failing tests for `_update_occurrences_canonical_name` and `reconcile`
2. **Task 1 GREEN:** `50be9ef` (feat) — implementation + test fixture update for ecdysis_data.occurrences bootstrap
3. **Task 2:** `bb3fad6` (feat) — seed header-only checklist_unmatched.csv

## Files Created/Modified

- `data/checklist_pipeline.py` — added `SYNONYMS_PATH`, `UNMATCHED_PATH` constants; `_update_occurrences_canonical_name()` and `reconcile()` functions; both wired into `load_checklist()`
- `data/tests/test_checklist_reconcile.py` — 8 new tests
- `data/tests/test_checklist_pipeline.py` — fixture extended to pre-create `ecdysis_data.occurrences` and monkeypatch `SYNONYMS_PATH`/`UNMATCHED_PATH` to tmp so tests don't clobber repo files
- `data/checklist_unmatched.csv` — header-only seed (regenerates each nightly run)

## Decisions Made

- **Header-only seed for checklist_unmatched.csv:** The Plan 02 fallback was used because `data/beeatlas.duckdb` is not present in the worktree (it lives in the main checkout, ~110 MB). The next nightly run on maderas (or the next local `python checklist_pipeline.py` against a populated DB) will write the live unresolved set. This is acceptable per the plan's Task 2 explicit allowance ("create a header-only file… and document this in the SUMMARY so a future maintainer regenerates it on the next nightly run").
- **Test fixture extension over production guard:** Rather than make `_update_occurrences_canonical_name` defensively check whether the table exists, I added the table to the test fixture. Production safety is provided by the run.py STEPS ordering invariant (ecdysis before checklist before export) which is already documented in T-76-04.
- **`mapping` guard in `_update_occurrences_canonical_name`:** Added `if mapping:` before the `executemany` call to handle the empty case (no non-null scientific_name rows). Not in the plan's literal action block but a no-op safety check that matches DuckDB's behavior on empty parameter lists. Rule 1 micro-fix.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Pre-existing checklist_pipeline test fixture missing ecdysis_data schema**
- **Found during:** Task 1 GREEN (after implementing `_update_occurrences_canonical_name`)
- **Issue:** `tests/test_checklist_pipeline.py::checklist_db` fixture only created the empty DuckDB file; `load_checklist()` now calls `_update_occurrences_canonical_name(con)` which requires `ecdysis_data.occurrences` to exist. All 8 existing tests started failing with `Catalog Error: Table with name occurrences does not exist!`.
- **Fix:** Extended the fixture to (a) pre-create `ecdysis_data.occurrences (scientific_name VARCHAR)` mirroring the production ordering invariant (ecdysis runs before checklist) and (b) monkeypatch `SYNONYMS_PATH`/`UNMATCHED_PATH` to tmp so test runs don't overwrite the committed `data/checklist_unmatched.csv` snapshot.
- **Files modified:** `data/tests/test_checklist_pipeline.py`
- **Verification:** All 16 checklist tests pass; full data suite (60 tests) green.
- **Committed in:** `50be9ef` (Task 1 GREEN commit)

**2. [Rule 1 - Bug] `executemany` on empty list edge case**
- **Found during:** Task 1 GREEN
- **Issue:** Plan's literal SQL would call `con.executemany(..., [])` when `ecdysis_data.occurrences` has no rows with non-null scientific_name. DuckDB happens to accept this, but defending against it costs nothing.
- **Fix:** Added `if mapping:` guard before the `executemany` call.
- **Files modified:** `data/checklist_pipeline.py`
- **Verification:** `test_update_occurrences_adds_canonical_name_column` covers the populated case; the guard is a no-op there.
- **Committed in:** `50be9ef`

**3. [Rule 1 - Bug] False-positive `raise` grep match in reconcile docstring**
- **Found during:** Task 1 acceptance criteria check
- **Issue:** The plan's grep check (`grep -c "raise"` on the reconcile body) returned 1 because of the comment "warn-only, never raises". The check is meant to catch real `raise` statements.
- **Fix:** Reworded comment to "D-05 warn-only policy" — semantically equivalent, no false positive.
- **Files modified:** `data/checklist_pipeline.py`
- **Verification:** `awk '/^def reconcile/,/^def [^r]/' data/checklist_pipeline.py | grep -c "raise"` returns 0.
- **Committed in:** `50be9ef`

---

**Total deviations:** 3 auto-fixed (1 blocking, 2 bugs)
**Impact on plan:** All auto-fixes were necessary; no scope creep. The fixture fix was forced by the new cross-schema dependency that Plan 05 introduces (load_checklist now reads from ecdysis_data, not just writes to checklist_data).

## Issues Encountered

None beyond the deviations above.

## Verification Results

Per `<verification>` block in the plan, run against the test suite (production beeatlas.duckdb not available in worktree):

1. **Module imports** — `from checklist_pipeline import load_checklist, reconcile` succeeds: PASS
2. **Pipeline runs without raising** — Cannot exercise against production DB in worktree; covered by `test_reconcile_does_not_raise_on_unmatched`: PASS
3. **canonical_name column exists on occurrences after run** — covered by `test_update_occurrences_adds_canonical_name_column`: PASS
4. **No occurrence row with non-null scientific_name has null canonical_name** — covered by the same test (asserts mapping for both bee names): PASS
5. **`head -1 data/checklist_unmatched.csv` returns the locked header** — verified directly: PASS

## Output Spec Confirmations

Per the plan's `<output>` block:

- **Final row count of `ecdysis_data.occurrences` with non-null `canonical_name` after a real run:** N/A in worktree (no production DB present); next nightly run on maderas will compute. Test path verifies the algorithm against fixture data.
- **Number of unmatched rows in `checklist_unmatched.csv`:** 0 in committed seed (header-only); next nightly run computes the live count (expected <50 per VALIDATION.md).
- **SQL targets `scientific_name` (snake_case):** Confirmed — single occurrence in `data/checklist_pipeline.py`, no `scientificName` fallback.
- **Number of synonym overrides applied during the first reconcile:** 0 — synonyms.csv ships header-only.
- **`reconcile()` contains no `raise` statement:** Confirmed via `awk` (count = 0 after Deviation 3 fix).

## Threat Flags

None — Plan 05 introduces no new network endpoints, file-access patterns, or trust boundaries beyond those already enumerated in the plan's `<threat_model>`. The reconcile() reads only `data/checklist_synonyms.csv` (committed, reviewer-curated) and writes `data/checklist_unmatched.csv` (sidecar artifact for human triage).

## Next Phase Readiness

- **Plan 06 (Wave 4):** Integration testing of the reconcile flow against fixture data — ready. The new `tests/test_checklist_reconcile.py` provides the unit-test foundation; Plan 06 may extend with end-to-end fixtures or larger seed sets.
- **Phase 077 (species aggregation):** Both `checklist_data.species.canonical_name` (Plan 03) and `ecdysis_data.occurrences.canonical_name` (this plan) are populated and agree byte-for-byte for everything `canonicalize()` + synonyms.csv resolves. `species_export.py` can FULL OUTER JOIN on `canonical_name` directly.
- **Operational:** First production run on maderas will overwrite `data/checklist_unmatched.csv` with the live unresolved set; the file should be reviewed and any persistent unmatched rows curated into `data/checklist_synonyms.csv` (the standard D-05 reviewer loop).

## Self-Check: PASSED

- FOUND: data/checklist_pipeline.py (modified)
- FOUND: data/checklist_unmatched.csv
- FOUND: data/tests/test_checklist_reconcile.py
- FOUND: data/tests/test_checklist_pipeline.py (modified)
- FOUND commit: 24a453b (test RED)
- FOUND commit: 50be9ef (feat GREEN)
- FOUND commit: bb3fad6 (feat snapshot)

---
*Phase: 076-data-foundation*
*Completed: 2026-05-02*
