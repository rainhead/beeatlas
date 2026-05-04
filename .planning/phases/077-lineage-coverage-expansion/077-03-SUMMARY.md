---
phase: 077-lineage-coverage-expansion
plan: 03
subsystem: data-pipeline

tags: [data-pipeline, duckdb, integration, run.py, lineage]

requires:
  - phase: 077-lineage-coverage-expansion
    plan: 01
    provides: bridge DDL, 20-row LIN-05 fixture (19/20 = 0.95)
  - phase: 077-lineage-coverage-expansion
    plan: 02
    provides: data/resolve_taxon_ids.py module (resolve_taxon_ids public entry)
provides:
  - data/run.py STEPS wired with resolve-taxon-ids → taxon-lineage-extended ordering
  - --refresh-lineage CLI flag detection via _REFRESH_LINEAGE module constant
  - data/inaturalist_pipeline.py::enrich_taxon_lineage_extended bridge UNION arm
  - data/tests/test_taxon_lineage_extended.py::test_enrich_includes_bridge_taxon_ids (Pitfall #2 regression guard)
  - data/tests/test_resolve_taxon_ids.py::test_lineage_coverage_threshold (LIN-05 ≥0.95 assertion)
affects:
  - 078-pipeline-outputs (now safe to consume — Phase 78 will see ≥95% non-NULL family)

tech-stack:
  added: []
  patterns:
    - "STEPS-list lambda capturing module-level _REFRESH_LINEAGE for zero-arg callable contract"
    - "Pipeline-step ordering as a load-bearing dependency (resolve-taxon-ids must precede taxon-lineage-extended)"
    - "Bridge UNION arm aliases column names to bridge the iNat v2 dlt double-underscore convention (taxon_id AS taxon__id)"
    - "Test fixture extension as Rule 3 blocking-fix when source schema gains a new dependency"

key-files:
  created: []
  modified:
    - data/run.py
    - data/inaturalist_pipeline.py
    - data/tests/test_taxon_lineage_extended.py
    - data/tests/test_taxon_lineage.py
    - data/tests/test_resolve_taxon_ids.py

key-decisions:
  - "Combined Task 2's source SQL change with the lineage_db fixture extension into a single commit (Rule 3 blocking-fix). Without the fixture extension all 12 prior tests in test_taxon_lineage_extended.py would fail with CatalogException on a missing bridge table."
  - "Extended test_taxon_lineage.py snapshot/restore/seed helpers to also handle the bridge table (Rule 1 bug-fix). The conftest fixture seeds 19 bridge rows; pre-Phase-77 tests assumed empty observations meant 'no taxon IDs', but the new third UNION arm now picks up the bridge seeds and breaks that assumption."
  - "Did NOT modify data/.gitignore — verified that *.csv is not covered and the checklist_unmatched.csv precedent already keeps regenerated CSVs tracked. data/lineage_unresolved.csv will land in git on first pipeline run."

requirements-completed: [LIN-01, LIN-03, LIN-05]

duration: 5min
completed: 2026-05-04
---

# Phase 077 Plan 03: Pipeline Wiring + Bridge UNION-Arm + LIN-05 Threshold Summary

**Wires `resolve_taxon_ids` into `data/run.py` STEPS (after `checklist`, before `taxon-lineage-extended`), adds the Phase 77 bridge as a third UNION arm in `enrich_taxon_lineage_extended`'s source SQL, and pins LIN-05 coverage at ≥0.95 with a deterministic pytest fixture. Both load-bearing edits land — without either, Phase 78 would still see ~70% NULL family (RESEARCH §Pitfall #2).**

## Performance

- **Duration:** ~5 min
- **Started:** 2026-05-04T04:56:41Z
- **Completed:** 2026-05-04T05:01:52Z
- **Tasks:** 5 (Task 5 verification-only, no commit)
- **Files modified:** 5
- **Files created:** 0

## Task Commits

1. **Task 1: Reorder run.py STEPS, add resolve-taxon-ids step, wire --refresh-lineage flag** — `39db690` (feat)
2. **Task 2: Extend enrich_taxon_lineage_extended source SQL with bridge UNION arm + lineage_db fixture extension** — `fd10973` (feat) [combined Task 2 source change with the test fixture DDL extension as Rule 3 blocking-fix]
3. **Task 3: Add test_enrich_includes_bridge_taxon_ids regression test** — `1a8aaf2` (test)
4. **Task 4: Add test_lineage_coverage_threshold + bridge-aware test_taxon_lineage.py helpers** — `636bb9f` (test) [combined LIN-05 threshold test with Rule 1 bug-fix in pre-existing test helpers]
5. **Task 5: Verify lineage_unresolved.csv is not gitignored** — verification-only, no commit

## Final STEPS list (data/run.py:38–48)

```python
STEPS: list[tuple[str, Callable]] = [
    ("ecdysis", load_ecdysis),
    ("ecdysis-links", load_links),
    ("inaturalist", load_inaturalist_observations),
    ("waba", load_waba_observations),
    ("projects", load_projects),
    ("anti-entropy", run_anti_entropy),
    ("checklist", load_checklist),
    ("resolve-taxon-ids", lambda: resolve_taxon_ids(refresh=_REFRESH_LINEAGE)),
    ("taxon-lineage-extended", enrich_taxon_lineage_extended),
    ("export", export_all),
    ("feeds", generate_feeds),
]
```

`taxon-lineage-extended` was MOVED from index 4 (between `waba` and `projects`) to index 8 (immediately after `resolve-taxon-ids`). It appears EXACTLY ONCE in the list — RESEARCH Pitfall #2 option (A), the only option that breaks the dependency cleanly.

## enrich_taxon_lineage_extended source SQL — before / after

**Before** (data/inaturalist_pipeline.py, two UNION arms):

```python
SELECT DISTINCT taxon__id FROM (
    SELECT taxon__id FROM inaturalist_data.observations
    WHERE taxon__id IS NOT NULL
    UNION
    SELECT taxon__id FROM inaturalist_waba_data.observations
    WHERE taxon__id IS NOT NULL
)
```

**After** (three UNION arms — third reads the Phase 77 bridge):

```python
SELECT DISTINCT taxon__id FROM (
    SELECT taxon__id FROM inaturalist_data.observations
    WHERE taxon__id IS NOT NULL
    UNION
    SELECT taxon__id FROM inaturalist_waba_data.observations
    WHERE taxon__id IS NOT NULL
    UNION
    SELECT taxon_id AS taxon__id
    FROM inaturalist_data.canonical_to_taxon_id
    WHERE taxon_id IS NOT NULL
)
```

The new arm aliases `taxon_id` (single underscore — bridge column name) to `taxon__id` (double underscore — iNat v2 dlt convention used by the outer SELECT and downstream Python).

The function docstring was updated to enumerate three source tables.

## .gitignore decision (Task 5 — verification only)

```
$ git ls-files data/checklist_unmatched.csv data/checklist_synonyms.csv
data/checklist_synonyms.csv
data/checklist_unmatched.csv

$ git check-ignore -v data/lineage_unresolved.csv
(no output)
$ echo $?
1   # exit 1 = NOT IGNORED

$ cat data/.gitignore
*.zip
*.pyc
__pycache__
last_fetch.txt
*.ndjson
beeatlas.duckdb
beeatlas.duckdb.wal
.geography_cache/
raw/ecdysis_cache/
```

`data/.gitignore` does NOT cover `*.csv`. The Phase 76 precedent (`data/checklist_unmatched.csv` is tracked) is preserved. **No changes to `data/.gitignore` were required.** When the user first runs `cd data && uv run python run.py`, `data/lineage_unresolved.csv` will be created and can be committed to git as a regenerated, auditable diff per Plan 02's Pattern F.

## New test names + pass status

| # | Test | Coverage | Status |
|---|------|----------|--------|
| 1 | `test_enrich_includes_bridge_taxon_ids` (in test_taxon_lineage_extended.py) | Pitfall #2 regression — bridge-only taxon_id walked | PASS |
| 2 | `test_lineage_coverage_threshold` (in test_resolve_taxon_ids.py) | LIN-05 ≥0.95 against Plan 01 fixture | PASS |

## Verification one-liner (copy-pasteable)

```bash
cd data && uv run pytest tests/ && \
  uv run python -c "import run; n=[s[0] for s in run.STEPS]; assert n.index('resolve-taxon-ids')==n.index('checklist')+1 and n.index('taxon-lineage-extended')==n.index('resolve-taxon-ids')+1 and n.count('taxon-lineage-extended')==1; print('STEPS:', n)" && \
  uv run python -c "import inaturalist_pipeline, inspect; assert 'canonical_to_taxon_id' in inspect.getsource(inaturalist_pipeline.enrich_taxon_lineage_extended); print('UNION arm present')" && \
  git check-ignore -v data/lineage_unresolved.csv; test $? -ne 0 && echo "lineage_unresolved.csv NOT gitignored"
# Expected: 103 passed, STEPS ok, UNION arm present, NOT gitignored
```

Re-running `pytest tests/` twice produces identical 103-passed results — no flake from time.sleep, file ordering, or DB state leakage.

## Files Created/Modified

- `data/run.py` — Added `import sys` and `from resolve_taxon_ids import resolve_taxon_ids`; added `_REFRESH_LINEAGE = "--refresh-lineage" in sys.argv`; reordered STEPS (moved `taxon-lineage-extended` from index 4 to 8; added `resolve-taxon-ids` at index 7 with lambda wrapper); updated docstring to list all 11 steps in order.
- `data/inaturalist_pipeline.py` — Added third UNION arm to `enrich_taxon_lineage_extended`'s source SQL (reads `inaturalist_data.canonical_to_taxon_id`); updated docstring to enumerate three source tables and reference Phase 77 LIN-05.
- `data/tests/test_taxon_lineage_extended.py` — Extended `lineage_db` fixture with bridge-table DDL; added `test_enrich_includes_bridge_taxon_ids` (Pitfall #2 regression guard).
- `data/tests/test_taxon_lineage.py` — Extended `_snapshot_obs_state`, `_restore_obs_state`, `_seed_observation_taxon_ids` to also handle the bridge table (Rule 1 bug-fix; the new UNION arm caused 2 pre-Phase-77 tests to fail because the conftest fixture seeds 19 bridge rows that the tests' "empty observations" precondition didn't account for).
- `data/tests/test_resolve_taxon_ids.py` — Appended `test_lineage_coverage_threshold` (LIN-05 ≥0.95 assertion against the Plan 01 fixture; uses the session-scoped `fixture_con`).

## Decisions Made

- **Task 2 + lineage_db fixture extension committed together (Rule 3 blocking-fix).** The plan tagged the fixture-extension portion under Task 3, but landing Task 2's source SQL change without the fixture would leave all 12 pre-existing tests in `test_taxon_lineage_extended.py` failing with `CatalogException: Table with name canonical_to_taxon_id does not exist`. To preserve atomic-commit semantics (each commit must leave the test suite green), the bridge-table DDL inside the fixture went into the Task 2 commit. Task 3's commit then adds the dedicated regression test only. This satisfies Task 2's own acceptance criterion that `pytest tests/test_taxon_lineage_extended.py -x` exits 0.
- **Task 4 + test_taxon_lineage.py helper extension committed together (Rule 1 bug-fix).** After Task 2's UNION-arm change, two tests in `test_taxon_lineage.py` (`test_enrich_handles_no_taxa`, `test_enrich_batches_at_30`) began failing because the conftest fixture seeds 19 rows into `inaturalist_data.canonical_to_taxon_id` (Plan 01 LIN-05 fixture) and the new bridge UNION arm now picks them up — invalidating the tests' "no taxon IDs found" precondition. The fix is Phase-77-specific test plumbing (the helpers must clear the bridge alongside the observations to genuinely produce an empty-source state); landing it together with the LIN-05 threshold test keeps the suite green within a single commit.
- **NO change to data/.gitignore (Task 5 → 5c branch).** Verified the precedent state matches the recommended state. `data/lineage_unresolved.csv` will follow `checklist_unmatched.csv` semantics — tracked, regenerated each run, auditable.
- **No second `taxon-lineage-extended` step added.** Pitfall #2 option (B) (run lineage twice) was explicitly REJECTED in RESEARCH; the move-and-reorder is option (A), the only choice that breaks the dependency cleanly.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 — Blocking] lineage_db fixture missing the bridge table after Task 2's UNION-arm change**
- **Found during:** Task 2 verification (`pytest tests/test_taxon_lineage_extended.py -x`).
- **Issue:** Adding `inaturalist_data.canonical_to_taxon_id` as a UNION arm in `enrich_taxon_lineage_extended` made the test fixture's omission of that table a hard failure. All 12 pre-existing tests began returning `CatalogException: Table with name canonical_to_taxon_id does not exist`.
- **Fix:** Added `CREATE TABLE inaturalist_data.canonical_to_taxon_id (canonical_name TEXT PRIMARY KEY, taxon_id INTEGER, resolved_at TIMESTAMP, source TEXT)` to the `lineage_db` fixture body. Same DDL as conftest.py and `data/resolve_taxon_ids.py::_ensure_bridge_table`.
- **Files modified:** `data/tests/test_taxon_lineage_extended.py`
- **Verification:** All 12 pre-existing tests + the new `test_enrich_includes_bridge_taxon_ids` pass.
- **Committed in:** `fd10973` (Task 2 commit).
- **Note:** The plan's Task 3 description includes the fixture extension as Step 3a; landing it with Task 2 (instead of Task 3) is a commit-grouping deviation, not a behavioral one.

**2. [Rule 1 — Bug] test_taxon_lineage.py helpers leak conftest bridge rows after Task 2's UNION-arm change**
- **Found during:** Full-suite run after Task 4.
- **Issue:** Two tests in `data/tests/test_taxon_lineage.py` (`test_enrich_handles_no_taxa`, `test_enrich_batches_at_30`) began failing. Both used `_seed_observation_taxon_ids(con, [], …)` to clear observation rows, then asserted that `enrich_taxon_lineage_extended` either skipped (no taxa) or hit exactly N batches. The Plan 01 conftest fixture seeds 19 rows into `inaturalist_data.canonical_to_taxon_id` (taxon_ids 200001..200019); the new third UNION arm in `enrich_taxon_lineage_extended` now reads those, producing 19 unexpected taxon IDs to walk and breaking both assertions.
- **Fix:** Extended `_snapshot_obs_state`, `_restore_obs_state`, and `_seed_observation_taxon_ids` to also snapshot, clear, and restore the bridge table alongside the observation tables. Now the helpers genuinely produce an empty-source state when called with empty ID lists.
- **Files modified:** `data/tests/test_taxon_lineage.py`
- **Verification:** All 6 tests in `test_taxon_lineage.py` pass; `pytest tests/` returns 103 passed (was 101 before Plan 03; +2 new tests added in this plan).
- **Committed in:** `636bb9f` (Task 4 commit).

---

**Total deviations:** 2 auto-fixed (1 Rule 3 blocking-fix, 1 Rule 1 bug-fix). Both are direct downstream consequences of Task 2's source-SQL change and are inseparable from it.

**Impact on plan:** Both deviations preserve the load-bearing outcomes (bridge UNION arm landed, LIN-05 ≥0.95 asserted, full suite green). The commit grouping deviates slightly from the plan's task-by-task structure but keeps every commit atomically green.

## Issues Encountered

None — all auto-fixes landed cleanly within the rule scope.

## User Setup Required

**Phase-gate manual verification (NOT performed by the executor):**

Before declaring Phase 77 complete and starting Phase 78, the user must run:

```bash
cd data && uv run python run.py
```

against the live DB. Expected outcomes:

1. The new `--- resolve-taxon-ids ---` step runs after `--- checklist ---` and before `--- taxon-lineage-extended ---`, paces at ≤1 req/sec (~12 minutes for ~700 unresolved names on a cold start), and produces a populated `inaturalist_data.canonical_to_taxon_id` bridge table.
2. `data/lineage_unresolved.csv` is regenerated; user reviews the contents (`canonical_name, reason, attempted_at`) and confirms the unresolved set is reasonable.
3. The LIN-05 coverage SQL (full SQL in RESEARCH line 59) returns ≥0.95 against the live DB:

```bash
cd data && uv run python -c "
import duckdb
con = duckdb.connect('beeatlas.duckdb')
print(con.execute('''
    SELECT count(*) FILTER (WHERE tle.family IS NOT NULL) * 1.0 / count(*)
    FROM (
        SELECT DISTINCT canonical_name FROM checklist_data.species WHERE canonical_name IS NOT NULL
        UNION
        SELECT DISTINCT canonical_name FROM ecdysis_data.occurrences WHERE canonical_name IS NOT NULL
    ) u
    LEFT JOIN inaturalist_data.canonical_to_taxon_id b USING (canonical_name)
    LEFT JOIN inaturalist_data.taxon_lineage_extended tle ON tle.taxon_id = b.taxon_id
''').fetchone()[0])
"
# Expected: ≥ 0.95
```

If coverage falls below 0.95, the user inspects `lineage_unresolved.csv` to identify which names need expert review (synonym-resolution, deletion from checklist, or additional iNat-side curation).

## Next Phase Readiness

- Phase 78 (Pipeline Outputs) can now safely consume `inaturalist_data.taxon_lineage_extended` with the assumption of ≥95% non-NULL family for FULL OUTER union species.
- Phase 78's COALESCE precedence (TAX-02) is now usable: `family = COALESCE(checklist.family, taxon_lineage_extended.family)`; genus fallback (`split_part(canonical_name, ' ', 1)`) only fires when both are NULL — which the LIN-05 threshold guarantees is ≤5% of species.
- Both regression guards (`test_enrich_includes_bridge_taxon_ids` for Pitfall #2, `test_lineage_coverage_threshold` for LIN-05) protect future plans from silently regressing the family-coverage invariant.

## Self-Check: PASSED

- File `.planning/phases/077-lineage-coverage-expansion/077-03-SUMMARY.md` exists (this file).
- Commits exist on main:
  - `39db690` — Task 1 STEPS reorder + --refresh-lineage flag
  - `fd10973` — Task 2 bridge UNION arm + fixture extension
  - `1a8aaf2` — Task 3 test_enrich_includes_bridge_taxon_ids
  - `636bb9f` — Task 4 LIN-05 threshold test + test_taxon_lineage.py helper extension
- `cd data && uv run pytest tests/` exits 0 (103/103 pass) — verified twice for flake-freeness.
- `data/run.py` STEPS: `resolve-taxon-ids` follows `checklist`, `taxon-lineage-extended` follows `resolve-taxon-ids`, `taxon-lineage-extended` appears exactly once.
- `data/inaturalist_pipeline.py::enrich_taxon_lineage_extended` source SQL has 3 UNION arms (verified via `inspect.getsource`).
- `data/lineage_unresolved.csv` is NOT gitignored (`git check-ignore` exits 1).
- `--refresh-lineage` in `sys.argv` toggles `_REFRESH_LINEAGE = True`; default is `False`.

---
*Phase: 077-lineage-coverage-expansion*
*Completed: 2026-05-04*
