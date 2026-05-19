---
phase: 103
slug: dbt-inat-field-id-constants-plantae-macro
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-05-18
---

# Phase 103 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | pytest 9.0.2 + `bash data/dbt/run.sh build` |
| **Config file** | `data/pyproject.toml` (`[tool.pytest.ini_options]`) |
| **Quick run command** | `bash data/dbt/run.sh build` |
| **Full suite command** | `bash data/dbt/run.sh build && uv run --project data pytest data/tests/test_dbt_diff.py` |
| **Estimated runtime** | ~60–90 seconds |

---

## Sampling Rate

- **After every task commit:** Run `bash data/dbt/run.sh build`
- **After every plan wave:** Run full suite (`dbt build` + `test_dbt_diff.py`)
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** ~90 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 103-01-01 | 01 | 1 | DBT-01 | — | N/A | static-grep + integration | `grep -rn 'field_id = [0-9]' data/dbt/models/intermediate/` → 0 results; `bash data/dbt/run.sh build` | ✅ | ⬜ pending |
| 103-01-02 | 01 | 1 | DBT-02 | — | N/A | static-grep + integration | `grep -rn "iconic_taxon_name" data/dbt/models/` → 1 result; `bash data/dbt/run.sh build` | ✅ | ⬜ pending |
| 103-01-03 | 01 | 1 | DBT-01, DBT-02 | — | N/A | integration | `uv run --project data pytest data/tests/test_dbt_diff.py -x` | ✅ | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

Existing infrastructure covers all phase requirements. No new test files needed.

---

## Manual-Only Verifications

*All phase behaviors have automated verification.*

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 90s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
