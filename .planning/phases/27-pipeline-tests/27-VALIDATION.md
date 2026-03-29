---
phase: 27
slug: pipeline-tests
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-28
---

# Phase 27 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | pytest 9.0.2 |
| **Config file** | `data/pyproject.toml` ([tool.pytest.ini_options]) |
| **Quick run command** | `cd data && uv run pytest data/tests/ -x -q` |
| **Full suite command** | `cd data && uv run pytest data/tests/` |
| **Estimated runtime** | ~5 seconds |

---

## Sampling Rate

- **After every task commit:** Run `cd data && uv run pytest data/tests/ -x -q`
- **After every plan wave:** Run `cd data && uv run pytest data/tests/`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 10 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 27-01-01 | 01 | 1 | TEST-01 | infra | `cd data && uv run pytest --collect-only -q` | ❌ W0 | ⬜ pending |
| 27-01-02 | 01 | 1 | TEST-01 | unit | `cd data && uv run pytest data/tests/test_pipelines.py -x -q` | ❌ W0 | ⬜ pending |
| 27-01-03 | 01 | 2 | TEST-02 | integration | `cd data && uv run pytest data/tests/test_export.py -x -q` | ❌ W0 | ⬜ pending |
| 27-01-04 | 01 | 2 | TEST-03 | unit | `cd data && uv run pytest data/tests/test_pipelines.py -x -q` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `data/tests/conftest.py` — fixture DuckDB creation + env var setup
- [ ] `data/tests/test_export.py` — stubs for TEST-01 (export schema + GeoJSON)
- [ ] `data/tests/test_pipelines.py` — stubs for TEST-02/TEST-03 (pipeline transforms)

*pytest 9.0.2 already installed — no framework install needed.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| All tests pass without AWS credentials | TEST-01/02/03 | Environment check | Run `unset AWS_ACCESS_KEY_ID AWS_SECRET_ACCESS_KEY && cd data && uv run pytest` |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 10s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
