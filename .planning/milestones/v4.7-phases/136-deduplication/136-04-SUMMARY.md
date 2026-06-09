---
phase: 136-deduplication
plan: "04"
subsystem: data-pipeline
status: complete
completed_date: "2026-06-08"
duration_minutes: 50
tags: [tdd, green, dedup, dbt, sql, python, checkpoint, human-review]
requirements_completed: [DUP-03]

dependency_graph:
  requires:
    - 136-03 (DUP-02 candidate generation + CSV writer)
  provides:
    - int_checklist_dedup_status.sql: DUP-03 joinable dedup_status view (Phase 137 consumes WHERE dedup_status IS DISTINCT FROM 'confirmed')
    - checklist_dedup.check_dedup_gate: orphaned-confirmed-pair_key build gate
    - run.py: dedup-candidates + dedup-gate STEPS between dbt-build and generate-sqlite
  affects:
    - data/dbt/models/intermediate/int_checklist_dedup_status.sql (placeholder replaced with real LEFT JOIN)
    - data/checklist_dedup.py (check_dedup_gate stub replaced with implementation)
    - data/run.py (two new STEPS wired)
    - data/tests/test_checklist_dedup.py (Rule 1 fix: wrong ref mapping in test_unreviewed_pair_not_suppressed)

tech_stack:
  added: []
  patterns:
    - "bool_or(dd.dedup_status = 'confirmed') OVER (PARTITION BY cl.ObjectID) — D-08 ANY confirmed suppresses whole ObjectID"
    - "DISTINCT ON (cl.ObjectID) collapses fan-out from multiple candidate pairs per ObjectID"
    - "sys.exit() fail-fast gate pattern mirroring check_resolution_gate() in resolve_taxon_ids.py"
    - "Header-only seed short-circuit in check_dedup_gate() — prints OK without reading candidates"

key_files:
  created: []
  modified:
    - data/dbt/models/intermediate/int_checklist_dedup_status.sql
    - data/checklist_dedup.py
    - data/run.py
    - data/tests/test_checklist_dedup.py

key_decisions:
  - "DISTINCT ON (cl.ObjectID) used in int_checklist_dedup_status to collapse fan-out from multiple candidate pairs per ObjectID — avoids duplicate rows without a CTE or subquery"
  - "check_dedup_gate() short-circuits on header-only (no confirmed) decisions without reading candidates — avoids requiring candidate CSV to exist when no decisions have been made yet"
  - "test_unreviewed_pair_not_suppressed rewritten as three-part test (no candidates, unreviewed candidate, confirmed decision) with all three refs explicitly passed — clearer test structure that matches the real SQL's LEFT JOIN dependencies"

metrics:
  tasks_completed: 2
  tasks_total: 2
  files_created: 0
  files_modified: 4
---

# Phase 136 Plan 04: DUP-03 Status View + Build Gate + HUMAN-REVIEW GATE Summary

Wave 4 (final) of Phase 136 deduplication: implement `int_checklist_dedup_status` LEFT JOIN view (the joinable dedup_status Phase 137 consumes), `check_dedup_gate()` Python gate (orphaned-confirmed-pair_key guard), run.py STEPS wiring, a full dbt build, and the blocking HUMAN-REVIEW GATE that prevents Phase 137 from starting until the curator reviews dedup_candidate_pairs.csv.

## What Was Built

### Task 1: int_checklist_dedup_status.sql + check_dedup_gate (commit 33ad237)

`data/dbt/models/intermediate/int_checklist_dedup_status.sql` — replaces the `CAST(NULL AS VARCHAR)` placeholder with a full LEFT JOIN view:

- **`materialized='view'`** — cheap LEFT JOIN over materialized tables, mirrors `int_synonyms.sql` pattern.
- **LEFT JOIN chain**: `int_checklist_collapsed cl` → `int_dedup_candidates cand ON cand.checklist_ObjectID = cl.ObjectID` → `dedup_decisions dd ON dd.pair_key = cand.pair_key`.
- **D-08 ANY confirmed suppresses**: `CASE WHEN bool_or(dd.dedup_status = 'confirmed') OVER (PARTITION BY cl.ObjectID) THEN 'confirmed' ELSE MAX(dd.dedup_status) OVER (PARTITION BY cl.ObjectID) END`.
- **Fan-out collapse**: `SELECT DISTINCT ON (cl.ObjectID)` — a record with multiple candidate pairs produces exactly one output row.
- **Phase 137 comment**: `WHERE dedup_status IS DISTINCT FROM 'confirmed'` documented in the file header.
- **NULL = unreviewed**: no candidate or unreviewed candidate yields NULL dedup_status (not suppressed).

`data/checklist_dedup.py` — `NotImplementedError` stub replaced with implementation:

- If `DEDUP_DECISIONS_CSV` missing → print `"dedup-gate: OK (no decisions seed)"` and return.
- If decisions exist and none are confirmed → print `"dedup-gate: OK (0 confirmed, N rejected)"` and return.
- If confirmed decisions exist but `DEDUP_CANDIDATE_CSV` missing → `sys.exit()` with actionable message.
- Reads both CSVs; finds confirmed decisions whose `pair_key` is absent from regenerated candidates (orphans); `sys.exit(f"dedup-gate: {N} confirmed suppression(s) reference pair_keys not in current candidates: ...")` naming the orphans.
- Clean path prints `f"dedup-gate: OK ({confirmed} confirmed, {rejected} rejected)"`.

All 11 dedup tests GREEN.

### Task 2: Wire run.py STEPS + full dbt build (commit 5f4ec43)

`data/run.py`:

- `from checklist_dedup import write_dedup_candidates, check_dedup_gate` added to import block.
- `("dedup-candidates", write_dedup_candidates)` and `("dedup-gate", check_dedup_gate)` inserted between `("dbt-build", _run_dbt_build)` and `("generate-sqlite", generate_sqlite_export)`.
- Module docstring step chain updated to include the two new steps.

Full dbt build result: **87 PASS / 1 WARN (pre-existing test_lin05_lineage_coverage, unrelated to dedup) / 0 ERROR**.

- `int_checklist_collapsed`: built in 24.66s
- `int_dedup_candidates`: built in 0.28s
- `int_checklist_dedup_status`: built as view in 0.03s
- `dedup_decisions` seed: built

occurrences contract: still **33 columns** — unchanged from pre-dedup state. Phase 137 will bump to 34 (`checklist_id`).

dedup_candidate_pairs.csv: generated with header + **0 candidate pairs** (the current data set has no cross-source matches meeting all four AND criteria: exact accepted name + full date + 1 km + matching collector). The curator can review the empty CSV and approve Phase 137 to proceed.

dedup-gate: prints `"dedup-gate: OK (0 confirmed, 0 rejected)"`.

## Test Results

| Test | Status | Notes |
|------|--------|-------|
| test_unreviewed_pair_not_suppressed | GREEN | Rule 1 fix applied — three-part test with all refs |
| test_confirmed_pair_suppressed | GREEN | LEFT JOIN propagates confirmed status |
| test_dedup_gate | GREEN | sys.exit on orphaned pair_key; OK on clean |
| (all 8 DUP-01/02 tests) | GREEN | Unchanged from waves 2-3 |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] test_unreviewed_pair_not_suppressed used incomplete refs dict**
- **Found during:** Task 1 (first test run)
- **Issue:** The test called `_load_model_sql("int_checklist_dedup_status", refs={"int_checklist_collapsed": "int_checklist_collapsed"})` — only one of three needed refs. The `_load_model_sql` helper strips unmapped `{{ ref('...') }}` Jinja blocks to empty strings, causing `FROM  cand` (bare alias without table) — DuckDB CatalogException.
- **Fix:** Rewrote test_unreviewed_pair_not_suppressed as a three-part test: (1) no candidates → NULL, (2) unreviewed candidate → NULL, (3) confirmed decision → 'confirmed'. All three SQL loads pass the full `all_refs` dict; empty tables are created before the first query to model the "no candidates" state. Test structure now more clearly documents the three semantically distinct cases.
- **Files modified:** `data/tests/test_checklist_dedup.py`
- **Commit:** 33ad237

## HUMAN-REVIEW GATE (Task 3 — NOT executed)

The curator HUMAN-REVIEW GATE (Task 3) was reached. This gate is `type="checkpoint:human-verify"` with `gate="blocking-human"` — it requires explicit human approval before Phase 137 may proceed. It was NOT auto-approved.

See checkpoint message below for curator instructions.

## Known Stubs

None. All DUP-01/02/03 stubs from wave 1 are now implemented.

## Threat Flags

None. T-136-02 (stale seed silently suppressing points) mitigated by `check_dedup_gate()` — fails build on any confirmed pair_key absent from regenerated candidates. T-136-08 (nightly clobbering human decisions) mitigated by the two-file split: `dedup_candidate_pairs.csv` is regenerated every build; `dedup_decisions.csv` is committed and never auto-written. T-136-07 (no-rationale suppression) mitigated by `note` column required by accepted curator workflow.

## Self-Check: PASSED
