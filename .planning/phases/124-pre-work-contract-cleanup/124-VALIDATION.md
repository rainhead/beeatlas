---
phase: 124
slug: pre-work-contract-cleanup
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-05-29
---

# Phase 124 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | pytest |
| **Config file** | `data/pyproject.toml` |
| **Quick run command** | `cd data && uv run pytest tests/test_dbt_diff.py tests/test_resolve_taxon_ids.py -x` |
| **Full suite command** | `cd data && uv run pytest` |
| **Estimated runtime** | ~10 seconds |

---

## Sampling Rate

- **After every task commit:** Run `cd data && uv run pytest tests/test_dbt_diff.py tests/test_resolve_taxon_ids.py -x`
- **After every plan wave:** Run `cd data && uv run pytest`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 30 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 124-01-01 | 01 | 1 | PWK-01 | — | N/A | docstring edit | `cd data && uv run pytest tests/test_dbt_diff.py -x` | ✅ | ⬜ pending |
| 124-01-02 | 01 | 1 | PWK-02 | — | N/A | unit | `cd data && uv run pytest tests/test_resolve_taxon_ids.py -x` | ✅ | ⬜ pending |
| 124-01-03 | 01 | 2 | PWK-03 | — | N/A | manual | `cd data && uv run python resolve_taxon_ids.py --enumerate-inactive` (or inline query) | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `data/tests/test_resolve_taxon_ids.py` — add `inat_obs_data.observations` table to `resolver_db` fixture
- [ ] `data/tests/test_resolve_taxon_ids.py` — add test asserting inat_obs canonical names appear in `_names_to_resolve()` output

*PWK-01 docstring edit requires no new tests. PWK-03 enumeration is documentary output only.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Inactive taxon ID count documented | PWK-03 | Enumeration result is documentary (expected 0); no assertion needed | Run `cd data && uv run python resolve_taxon_ids.py --enumerate-inactive` or equivalent DuckDB query; record count in commit message or comment |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
