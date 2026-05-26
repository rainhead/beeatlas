---
phase: 118
slug: occurrence-model-extension
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-05-25
---

# Phase 118 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | pytest |
| **Config file** | `data/pyproject.toml` |
| **Quick run command** | `cd data && uv run pytest tests/test_dbt_scaffold.py tests/test_species_export.py -x -q` |
| **Full suite command** | `cd data && uv run pytest` |
| **Estimated runtime** | ~30 seconds |

---

## Sampling Rate

- **After every task commit:** Run `cd data && uv run pytest tests/test_dbt_scaffold.py tests/test_species_export.py -x -q`
- **After every plan wave:** Run `cd data && uv run pytest`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 30 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 118-01-01 | 01 | 0 | OCC-01 | — | N/A | unit | `cd data && uv run pytest tests/test_dbt_scaffold.py -x -q -k "test_int_combined_source_column"` | ❌ W0 | ⬜ pending |
| 118-01-02 | 01 | 0 | OCC-01 | — | N/A | unit | `cd data && uv run pytest tests/test_dbt_scaffold.py -x -q -k "test_occurrences_inat_columns"` | ❌ W0 | ⬜ pending |
| 118-01-03 | 01 | 0 | OCC-02 | — | N/A | unit | `cd data && uv run pytest tests/test_dbt_scaffold.py -x -q -k "test_species_universe_inat_obs_count"` | ❌ W0 | ⬜ pending |
| 118-01-04 | 01 | 0 | OCC-03 | — | N/A | unit | `cd data && uv run pytest tests/test_species_export.py -x -q -k "test_inat_obs_count_in_export"` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `data/tests/test_dbt_scaffold.py` — stubs for OCC-01, OCC-02 (int_combined ARM 3, occurrences schema, int_species_universe inat_obs_count)
- [ ] `data/tests/test_species_export.py` — stubs for OCC-03 (inat_obs_count in species export)

*Existing pytest infrastructure covers all phase requirements — no new framework install needed.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Row count in occurrences.parquet matches deduplicated inat_obs_data.observations | OCC-01 | Requires live DuckDB query against pipeline output | `cd data && uv run python -c "import duckdb; con=duckdb.connect('beeatlas.duckdb'); print(con.execute(\"SELECT COUNT(*) FROM inat_obs_data.observations WHERE lat IS NOT NULL AND lon IS NOT NULL\").fetchone(), con.execute(\"SELECT COUNT(*) FROM read_parquet('public/data/occurrences.parquet') WHERE source='inat_obs'\").fetchone())"` |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
