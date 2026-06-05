---
title: Data test suite has environmental dependencies (dbt build + slow checklist test)
priority: medium
source: phase-129-regression-gate
created: 2026-06-02
resolves_phase: 141
---

> **v4.8 note (2026-06-05):** This todo is fully addressed by milestone v4.8. Problem 2 (slow
> checklist test) → Phase 140 (TFIXTURE-01, sample + session-scope). Problem 1 (dbt-schema
> failures) → Phase 141 (TFIX-01, `resolver_db` provides `dbt_sandbox.occurrence_synonyms`).
> Tagged to 141 as the phase where the suite becomes green; close after Phase 141 verifies.

While running the phase 129 regression gate (`cd data && uv run pytest`), two pre-existing
problems surfaced in the data test suite. Neither is caused by phase 129 — all phase-129
code lives in `data/sqlite_export.py` and its test passes (14/14) — but both make the full
data suite un-runnable from a clean checkout without prior setup.

## 1. `tests/test_resolve_taxon_ids.py` — 16 failures, missing dbt schema

All 16 tests fail with:

```
_duckdb.CatalogException: Catalog Error: Table with name "dbt_sandbox.occurrence_synonyms"
does not exist because schema "dbt_sandbox" does not exist.
```

The failure is in `resolve_taxon_ids.py:370`. The test (and module) query `dbt_sandbox.*`
tables that only exist after `bash data/dbt/run.sh build`. The test does not bootstrap that
schema itself — it depends on external dbt-build state in the `DB_PATH` it points at. Raw
`uv run pytest` without a preceding dbt build fails these regardless of git state. Last
touched by phases 127/124/077, not 129.

**Options:** (a) add a fixture/conftest that builds the minimal `dbt_sandbox.occurrence_synonyms`
table (mirroring the `checklist_db` fixture's bootstrap pattern), (b) mark these tests with a
`@pytest.mark.requires_dbt` marker and skip when the schema is absent, or (c) document that the
data suite requires `bash data/dbt/run.sh build` first and wire that into the test entrypoint/CI.

## 2. `tests/test_checklist_pipeline.py::test_load_checklist_is_idempotent` — extremely slow

This test calls `load_checklist()` twice and ran for **12+ minutes** at ~75% CPU before being
killed (no network involved — it's a heavy local DuckDB / fuzzy-synonym-match operation run
twice). It makes the full suite impractical to run interactively. Investigate whether
`load_checklist()` has a pathological cost (e.g., O(n²) synonym matching) or whether the test
should use a smaller fixture dataset / be marked slow.

## Why this matters
The nightly pipeline (`data/nightly.sh`) is the real execution path and presumably builds dbt
before any data work, so production is unaffected. But the test suite can't serve as a reliable
local/CI regression gate until (1) the dbt-build dependency is made explicit or self-contained
and (2) the slow checklist test is bounded. Worth resolving before relying on `uv run pytest`
as the cross-phase regression signal for later v4.6 phases (130–133).
