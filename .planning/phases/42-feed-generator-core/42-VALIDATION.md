---
phase: 42
slug: feed-generator-core
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-04-09
---

# Phase 42 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | pytest (existing in data/) |
| **Config file** | `data/pyproject.toml` |
| **Quick run command** | `cd data && uv run pytest tests/test_feeds.py -q` |
| **Full suite command** | `cd data && uv run pytest -q` |
| **Estimated runtime** | ~5 seconds |

---

## Sampling Rate

- **After every task commit:** Run `cd data && uv run pytest tests/test_feeds.py -q`
- **After every plan wave:** Run `cd data && uv run pytest -q`
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 10 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 42-01-01 | 01 | 0 | FEED-01 | — | N/A | unit stub | `cd data && uv run pytest tests/test_feeds.py -q` | ❌ W0 | ⬜ pending |
| 42-01-02 | 01 | 1 | FEED-01,FEED-02 | — | N/A | unit | `cd data && uv run pytest tests/test_feeds.py::test_entry_fields -q` | ✅ | ⬜ pending |
| 42-01-03 | 01 | 1 | FEED-02,FEED-03 | — | N/A | unit | `cd data && uv run pytest tests/test_feeds.py::test_feed_metadata -q` | ✅ | ⬜ pending |
| 42-01-04 | 01 | 1 | FEED-04 | — | N/A | integration | `cd data && uv run pytest tests/test_feeds.py::test_output_file -q` | ✅ | ⬜ pending |
| 42-01-05 | 01 | 2 | PIPE-01 | — | N/A | integration | `cd data && uv run pytest tests/test_feeds.py::test_run_py_integration -q` | ✅ | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `data/tests/test_feeds.py` — stubs for FEED-01, FEED-02, FEED-03, FEED-04, PIPE-01
- [ ] No new framework install needed — pytest already installed via `uv`

*Existing infrastructure (conftest.py, pytest) covers the test runner. Wave 0 only needs to create test_feeds.py stubs.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Valid Atom XML parses in feed reader | FEED-01 | Requires real beeatlas.duckdb with 90-day data | Run `python -m feeds` and open `frontend/public/data/feeds/determinations.xml` in a browser or validate with `xmllint --noout` |
| Ecdysis URL links resolve | FEED-01 | Requires network access | Open one `<link>` from the XML in a browser |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 10s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
