---
phase: 129
slug: hierarchy-foundation
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-06-02
---

# Phase 129 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.
> Pipeline-only phase — validated via pytest assertions + SQL queries + the
> nightly-gate hard fail, not UI. Derived from 129-RESEARCH.md §Validation Architecture.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | pytest (existing) |
| **Config file** | `data/pyproject.toml` |
| **Quick run command** | `cd data && uv run pytest tests/test_sqlite_export.py -x` |
| **Full suite command** | `cd data && uv run pytest` |
| **Estimated runtime** | ~30 seconds (quick) / ~2 min (full) |

---

## Sampling Rate

- **After every task commit:** Run `cd data && uv run pytest tests/test_sqlite_export.py -x`
- **After every plan wave:** Run `cd data && uv run pytest`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** ~30 seconds

---

## Per-Task Verification Map

> Task IDs assigned during planning. Rows below are keyed by requirement and
> map directly to the test functions defined in Wave 0.

| Req | Behavior | Test Type | Automated Command | File Exists | Status |
|-----|----------|-----------|-------------------|-------------|--------|
| HIER-01 | Hierarchy table present in `occurrences.db` with expected columns | unit | `pytest tests/test_sqlite_export.py::test_taxa_table_exists -x` | ❌ W0 | ⬜ pending |
| HIER-01 | Every occurrence `taxon_id` has a hierarchy entry (zero orphans) | unit | `pytest tests/test_sqlite_export.py::test_zero_orphan_taxon_ids -x` | ❌ W0 | ⬜ pending |
| HIER-02 | Hierarchy rows have non-null `name` and `rank` for all referenced `taxon_id` | unit | `pytest tests/test_sqlite_export.py::test_taxa_name_rank_non_null -x` | ❌ W0 | ⬜ pending |
| HIER-03 | Descendant query for Apidae returns > 0 rows, all `is_anthophila = 1` | unit | `pytest tests/test_sqlite_export.py::test_apidae_descendant_query -x` | ❌ W0 | ⬜ pending |
| HIER-03 | wa-sqlite Apidae benchmark latency (~100ms perceptual bar per D-03) | manual | Firefox DevTools (see RESEARCH.md §Code Examples) | — | ⬜ pending |
| HIER-04 | Orphan assertion raises on missing `taxon_id`; fails nightly gate | unit | `pytest tests/test_sqlite_export.py::test_orphan_assertion_raises -x` | ❌ W0 | ⬜ pending |
| HIER-04 | Active-taxa / synonym bridge respected (v4.5 `auto_synonyms`) | unit | `pytest tests/test_sqlite_export.py::test_active_taxa_only -x` | ❌ W0 | ⬜ pending |
| HIER-05 | Bycatch taxa have `is_anthophila = 0`; bee taxa `is_anthophila = 1` | unit | `pytest tests/test_sqlite_export.py::test_is_anthophila_flag -x` | ❌ W0 | ⬜ pending |
| HIER-05 | Known bycatch taxon resolves at finest rank, present with `is_anthophila = 0` | unit | `pytest tests/test_sqlite_export.py::test_bycatch_present_in_taxa -x` | ❌ W0 | ⬜ pending |
| HIER-06 | Complex-rank and bycatch counts queryable for VERIFICATION.md | unit | `pytest tests/test_sqlite_export.py::test_complex_and_bycatch_counts -x` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `data/tests/test_sqlite_export.py` — add 9 hierarchy test functions listed above (extends existing file)
- [ ] Hierarchy fixture — a mini `taxa.csv.gz`-like CSV fixture with known Anthophila + bycatch rows for deterministic testing

*Existing infrastructure: `test_sqlite_export.py` already has a `src_parquet` fixture and 5 occurrences-table tests. No new conftest.py needed.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Apidae descendant-query latency in real wa-sqlite/Firefox | HIER-03 | WASM perf does not match server-side DuckDB; must run in browser on a mid-range device | Load `occurrences.db` in Firefox via wa-sqlite, run the Apidae `instr()` descendant query, record elapsed ms in DevTools; compare to ~100ms perceptual bar (D-03) |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
