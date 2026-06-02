---
phase: 123
slug: dbt-layer-occurrence-synonymy
status: draft
nyquist_compliant: true
wave_0_complete: false
created: 2026-05-29
---

# Phase 123 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | pytest (data/tests/) + vitest (npm test) |
| **Config file** | `data/pyproject.toml`, `vitest.config.ts` |
| **Quick run command** | `cd data && uv run pytest tests/test_canonical_name.py tests/test_checklist_pipeline.py tests/test_checklist_reconcile.py -q` |
| **Full suite command** | `cd data && uv run pytest -q && (cd "$(git rev-parse --show-toplevel)" && npm test)` |
| **Estimated runtime** | ~300 seconds (pytest) + ~15 seconds (vitest) |

---

## Sampling Rate

- **After every task commit:** Run quick pytest on affected test files
- **After every plan wave:** Run full suite
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 300 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 123-01-01 | 01 | 1 | SYN-01 | — | N/A | unit | `cd data && uv run pytest tests/test_canonical_name.py -q` | ✅ | ⬜ pending |
| 123-01-02 | 01 | 1 | SYN-01 | — | N/A | integration | `cd data && uv run pytest tests/test_inat_obs_pipeline.py -q` | ✅ | ⬜ pending |
| 123-01-03 | 01 | 1 | SYN-01 | — | N/A | integration | `cd data && uv run pytest tests/test_checklist_pipeline.py tests/test_checklist_reconcile.py -q` | ✅ | ⬜ pending |
| 123-02-01 | 02 | 2 (W0) | SYN-02 | — | N/A | collect-only | `cd data && uv run pytest tests/test_dbt_synonymy.py --collect-only -q` | ❌ W0 | ⬜ pending |
| 123-02-02 | 02 | 2 | SYN-02 | — | N/A | dbt build + pytest | `cd data && bash dbt/run.sh build 2>&1 \| tail -30 && uv run pytest tests/test_dbt_synonymy.py::test_occurrences_has_agapostemon_subtilior tests/test_dbt_synonymy.py::test_occurrences_has_no_agapostemon_texanus -q` | depends on W0 | ⬜ pending |
| 123-02-03 | 02 | 2 | SYN-02, SYN-03 | — | N/A | full suite | `cd data && bash dbt/run.sh build 2>&1 \| tail -10 && uv run pytest -q && (cd "$(git rev-parse --show-toplevel)" && npm test)` | depends on W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `data/tests/test_dbt_synonymy.py` — three skipif-guarded tests asserting texanus → subtilior mapping in occurrences.parquet (Plan 02 Task 1; must be created as RED before Tasks 2–3)

All other test infrastructure (pytest, conftest.py, existing test files) is already in place.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| `occurrences.parquet` contains `agapostemon subtilior` and no `agapostemon texanus` after dbt build | SYN-03 | Requires running full pipeline build against real DuckDB with live data | Run `bash data/dbt/run.sh build` then query parquet via duckdb CLI: `SELECT canonical_name, COUNT(*) FROM read_parquet('data/dbt/target/sandbox/occurrences.parquet') WHERE canonical_name LIKE 'agapostemon%' GROUP BY 1` — should show only `agapostemon subtilior`, not `agapostemon texanus` |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references (`test_dbt_synonymy.py` in Plan 02 Task 1)
- [x] No watch-mode flags
- [x] Feedback latency < 300s
- [ ] `nyquist_compliant: true` set in frontmatter — ✅ set above; Wave 0 completes during Plan 02 Task 1 execution

**Approval:** pending
