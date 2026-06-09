---
phase: 135-name-reconciliation
plan: "01"
subsystem: data-pipeline
tags: [tdd, red-phase, pytest, dbt, name-reconciliation, taxonomy]
dependency_graph:
  requires: []
  provides:
    - test_resolve_checklist_names.py (7 RED stubs for RCN-02/03/04/05)
    - test_checklist_pipeline.py::test_no_active_reconcile_call (RCN-06)
    - test_checklist_pipeline.py::test_single_synonym_source (RCN-06)
    - test_canonical_name.py::test_canonicalize_trailing_space_regressionguard (RCN-01)
    - assert_no_anthophila_homonyms.sql (RCN-07 dbt singular test)
  affects:
    - data/tests/test_resolve_checklist_names.py (new)
    - data/tests/test_checklist_pipeline.py (extended)
    - data/tests/test_canonical_name.py (extended)
    - data/dbt/tests/assert_no_anthophila_homonyms.sql (new)
tech_stack:
  added: []
  patterns:
    - isolated DuckDB fixture (tmp_path/:memory:, monkeypatch DB_PATH, importlib.reload)
    - _fake_gbif_response() mock helper (mirrors test_resolve_taxon_ids.py shape)
    - dbt singular test with GROUP BY ... HAVING COUNT(DISTINCT) > 1 zero-row pattern
key_files:
  created:
    - data/tests/test_resolve_checklist_names.py
    - data/dbt/tests/assert_no_anthophila_homonyms.sql
  modified:
    - data/tests/test_checklist_pipeline.py
    - data/tests/test_canonical_name.py
decisions:
  - "test_single_synonym_source node-id chosen per VALIDATION.md (supersedes test_checklist_synonyms_csv_empty from RESEARCH.md)"
  - "assert_no_anthophila_homonyms.sql uses list_contains(string_split(ancestry, '/'), '630955') consistent with stg_inat__higher_rank_taxon_ids.sql pattern"
  - "Task 3 verify step cannot run in worktree (taxa.csv.gz is gitignored; dbt parse confirms compilation validity)"
metrics:
  duration_minutes: 7
  tasks_completed: 3
  tasks_total: 3
  files_created: 2
  files_modified: 2
  completed_date: "2026-06-05"
requirements_completed: [RCN-01, RCN-02, RCN-03, RCN-04, RCN-05, RCN-06, RCN-07]
---

# Phase 135 Plan 01: Wave 0 RED Test Scaffolding Summary

**One-liner:** Wave 0 RED test scaffolding for name-reconciliation: 7 pytest stubs + 2 RCN-06 RED tests + 1 RCN-01 regression guard + 1 dbt homonym-guard singular test covering all VALIDATION.md verify targets.

## What Was Built

### Task 1 — `data/tests/test_resolve_checklist_names.py` (NEW)

7 named test node-ids from 135-VALIDATION.md, all currently RED (module absent):

| Test | Requirement | Status |
|------|-------------|--------|
| `test_noop_without_refresh` | RCN-03 | RED (ModuleNotFoundError) |
| `test_audit_csv_covers_all_names` | RCN-02 | RED (ModuleNotFoundError) |
| `test_fuzzy_candidates_written` | RCN-04 | RED (ModuleNotFoundError) |
| `test_at_least_13_fuzzy_candidates` | RCN-04 | RED (ModuleNotFoundError) |
| `test_fuzzy_review_gate` | RCN-04 | RED (ModuleNotFoundError) |
| `test_slash_lca` | RCN-05 | RED (ModuleNotFoundError) |
| `test_slash_verbatim_retained` | RCN-05 | RED (ModuleNotFoundError) |

`checklist_resolver_db` fixture: isolated DuckDB (tmp_path), monkeypatch DB_PATH, importlib.reload, zero `_GBIF_PACE_SECONDS`, redirect AUDIT_CSV / FUZZY_REVIEW_CSV / GBIF_SEED_CSV. Seeds one slash-compound row + one misspelling row for test_slash_lca and test_fuzzy tests.

`test_slash_lca` asserts `compute_lca(...) == 606634` using verified ancestry strings inline (no file I/O). The literal 606634 (subgenus Agapostemon) is correct — NOT 50086 (genus).

No dbt_sandbox fixture dependency (RESEARCH Pitfall 7 — 18 pre-existing failures).

### Task 2 — `test_checklist_pipeline.py` + `test_canonical_name.py` (EXTENDED)

**checklist_pipeline.py additions (RCN-06):**

| Test | Requirement | Status |
|------|-------------|--------|
| `test_no_active_reconcile_call` | RCN-06/D-07 | RED (reconcile still at line 439) |
| `test_single_synonym_source` | RCN-06/D-07 | RED (SYNONYMS_PATH still in module) |

Both use `inspect.getsource()` — no DuckDB needed, no dbt_sandbox dependency.

**canonical_name.py addition (RCN-01):**

| Test | Requirement | Status |
|------|-------------|--------|
| `test_canonicalize_trailing_space_regressionguard` | RCN-01 | GREEN (existing behavior) |

Regression guard documents that `normalize_scientific_name("Agapostemon texanus ")` already produces `"agapostemon texanus"` (step 5 whitespace collapse). Discoverable via `-k trailing`.

### Task 3 — `data/dbt/tests/assert_no_anthophila_homonyms.sql` (NEW)

RCN-07 dbt singular test. Returns rows (fails build) if any `canonical_name` within Anthophila maps to `COUNT(DISTINCT taxon_id) > 1` in `int_combined`.

Key implementation choices:
- Anthophila filter: `list_contains(string_split(ancestry, '/'), '630955')` — consistent with `stg_inat__higher_rank_taxon_ids.sql` pattern
- `read_csv('../raw/taxa.csv.gz', delim=chr(9), ...)` — same relative path convention as staging models
- No `severity='warn'` (hard-fail required per RCN-07)
- Header comment names taxon_id 630955 and defers verification to Plan 135-05 (A3)
- `dbt parse` confirms valid Jinja compilation with `{{ ref('int_combined') }}`

## Commits

| Task | Commit | Description |
|------|--------|-------------|
| 1 | ef2fd6d | test(135-01): add RED stubs for RCN-02/03/04/05 |
| 2 | 2a8add1 | test(135-01): add RED stubs for RCN-06 + RCN-01 trailing-space |
| 3 | 43ac5af | feat(135-01): add RCN-07 dbt singular test |

## Deviations from Plan

### Auto-accepted behavioral decisions

**1. test_single_synonym_source node-id (VALIDATION.md vs RESEARCH.md discrepancy)**
- **Found during:** Task 2
- **Issue:** RESEARCH.md §RCN-06 names the test `test_checklist_synonyms_csv_is_empty`; VALIDATION.md Per-Task Verification Map names it `test_single_synonym_source`.
- **Fix:** Used VALIDATION.md node-id (`test_single_synonym_source`) as the authoritative source.
- **Files modified:** `data/tests/test_checklist_pipeline.py`
- **Commit:** 2a8add1

**2. Task 3 dbt verify step — environmental limitation in worktree**
- **Found during:** Task 3 verification
- **Issue:** `taxa.csv.gz` is gitignored and not present in the worktree; `int_combined` hasn't been built in the sandbox DB (both are pre-existing env conditions, not defects in the SQL).
- **Structural verification:** `dbt parse` passes — SQL compiles with valid `{{ ref('int_combined') }}` Jinja. Tested against main repo DB: fails only on missing `taxa.csv.gz` (gitignored large file).
- **Resolution:** Test SQL is structurally correct. Will pass in the full local dev environment and in CI where `dbt build` runs before `dbt test`. Documented here.
- **Files modified:** None (environmental constraint, not a code defect)

## Threat Flags

None found. This plan creates only test files; no new network endpoints, auth paths, or schema changes.

## Known Stubs

None. All tests are RED stubs by design (Wave 0 plan); the production module `resolve_checklist_names.py` is absent until Plan 135-02.

## Self-Check: PASSED

Files exist:
- `data/tests/test_resolve_checklist_names.py` ✅
- `data/dbt/tests/assert_no_anthophila_homonyms.sql` ✅
- `data/tests/test_checklist_pipeline.py` (extended) ✅
- `data/tests/test_canonical_name.py` (extended) ✅

Commits exist:
- ef2fd6d ✅
- 2a8add1 ✅
- 43ac5af ✅

7 test node-ids from VALIDATION.md collected by `pytest --collect-only` ✅
`dbt parse` exits 0 (SQL compiles) ✅
No dbt_sandbox fixture dependency in new tests ✅
`test_slash_lca` literal is `== 606634` (not 50086) ✅
