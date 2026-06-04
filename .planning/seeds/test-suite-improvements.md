---
name: Test suite improvements milestone
description: Dedicated milestone to fix data-pipeline test suite runtime, fixture design, and pre-existing failures
type: project
trigger_condition: Before the data pipeline test suite blocks routine development (or whenever a milestone slot opens)
planted_date: 2026-06-04
---

The `data/` pytest suite has accumulated structural problems that warrant a whole milestone, not incremental patches. Surfaced concretely during Phase 134 execution (the full-fidelity ingest loader), where the executor's self-check stalled for ~35 minutes and a developer asked for a dedicated milestone.

## Problems found

1. **~35-minute suite runtime.** Integration tests use **function-scoped** fixtures (e.g. `checklist_db` in `tests/test_checklist_pipeline.py`) that re-run the entire `load_checklist()` pipeline per test. The 11 new Phase-134 `checklist_records_full` tests each do a full 50k-row load (~3 min each). No fast/slow split exists.

2. **Slow DuckDB inserts.** The loaders use row-by-row `con.executemany(...)` for ~50k rows (~3 min per load). Bulk paths (Arrow `con.register` + `INSERT INTO ... SELECT`, or DuckDB `COPY`/`read_csv`) would cut this by orders of magnitude — and would also speed production pipeline runs, not just tests.

3. **18 pre-existing failures** in `tests/test_dbt_diff.py` and `tests/test_resolve_taxon_ids.py`. They fail in isolation with `Catalog Error: schema "dbt_sandbox" does not exist` — the SQL in `resolve_taxon_ids.py` (and the dbt-diff tests) reference `dbt_sandbox.occurrence_synonyms`, which the test fixture DB never builds. Introduced in phases 126/127 (`0fa83c3` added the `dbt_sandbox.occurrence_synonyms` reference). These tests effectively require a prior `dbt build` and silently rot otherwise.

4. **No CI gate / green baseline.** Because the suite is slow and partly red, there is no enforced "all green in <N minutes" contract. Regressions and bit-rot go unnoticed until a phase execution trips over them.

5. **Tooling gap: `ruff` not installed.** Multiple plans specify `uv run ruff check` as an acceptance step, but `ruff` is not a project dependency — the check silently no-ops. Either add `ruff` to `data/pyproject.toml` dev deps or stop referencing it in plans.

## Suggested milestone scope

- **Fast/slow split:** mark expensive integration tests (`@pytest.mark.slow`), keep a fast default suite; run slow tests in nightly/CI only.
- **Shared seeded fixture:** build the pipeline DB once (session/module scope) and run read-only assertions against it, instead of N full loads. Reconcile with the `monkeypatch`-based per-function setup (monkeypatch is function-scoped — may need a session fixture that sets `DB_PATH` differently).
- **Bulk-insert the loaders:** replace `executemany` 50k-row inserts with Arrow/`COPY`/`read_csv_auto` — speeds tests and the nightly pipeline.
- **Fix or quarantine the dbt-dependent tests:** either build a minimal `dbt_sandbox.occurrence_synonyms` in the fixture, or mark them as requiring a dbt build and skip-with-reason when absent. Restore a green baseline.
- **Add `ruff`** (or remove it from plan acceptance criteria) so lint gates mean something.
- **CI:** wire a GitHub Actions job that runs the fast suite on push and the full suite nightly, enforcing green.

**Why a whole milestone:** these are coupled (fixture redesign + bulk inserts + green baseline + CI) and touch shared test infrastructure; piecemeal fixes inside feature phases keep getting deferred (as Phase 134 showed). v4.7 (Phases 134–138) is in flight — slot this after, or before Phase 137's "Phase 111 test retirement" if test debt starts blocking.
