---
phase: 11
slug: links-pipeline
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-11
---

# Phase 11 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | pytest 9.0.2 |
| **Config file** | none (no pytest.ini; uses defaults) |
| **Quick run command** | `cd data && uv run pytest tests/test_links_fetch.py -q` |
| **Full suite command** | `cd data && uv run pytest tests/ -q` |
| **Estimated runtime** | ~5 seconds |

---

## Sampling Rate

- **After every task commit:** Run `cd data && uv run pytest tests/test_links_fetch.py -q`
- **After every plan wave:** Run `cd data && uv run pytest tests/ -q`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** ~5 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 11-01-01 | 01 | 0 | LINK-01..04 | unit stubs | `cd data && uv run pytest tests/test_links_fetch.py -q` | ❌ W0 | ⬜ pending |
| 11-01-02 | 01 | 1 | LINK-01,02 | unit | `cd data && uv run pytest tests/test_links_fetch.py::TestFetchPage tests/test_links_fetch.py::TestRateLimit -q` | ❌ W0 | ⬜ pending |
| 11-01-03 | 01 | 1 | LINK-03 | unit | `cd data && uv run pytest tests/test_links_fetch.py::TestExtractObservationId -q` | ❌ W0 | ⬜ pending |
| 11-01-04 | 01 | 1 | LINK-02 | unit | `cd data && uv run pytest tests/test_links_fetch.py::TestFirstLevelSkip tests/test_links_fetch.py::TestSecondLevelSkip -q` | ❌ W0 | ⬜ pending |
| 11-01-05 | 01 | 1 | LINK-04 | unit | `cd data && uv run pytest tests/test_links_fetch.py::TestOutput -q` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `data/tests/test_links_fetch.py` — stubs covering LINK-01 through LINK-04 (TestFetchPage, TestRateLimit, TestFirstLevelSkip, TestSecondLevelSkip, TestExtractObservationId, TestOutput)
- [ ] `data/links/__init__.py` — empty module init (allows `python -m links.fetch`)

*`data/tests/test_inat_download.py` exists — follow its mock-based unit test pattern.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Rate limiting does not exceed 20 req/sec against live Ecdysis | LINK-01 | Live HTTP timing | Run `cd data && uv run python -m links.fetch` on a small sample; confirm request interval ≥ 0.05s in logs |
| HTML cache files are written with integer ecdysis_id as filename | LINK-01 | Filesystem check | Inspect `data/raw/ecdysis_cache/` — files should be named `{integer}.html`, not UUID |
| First-level skip fires for known-linked occurrenceIDs | LINK-02 | End-to-end run | Seed links.parquet with one row; re-run; confirm row count unchanged and no HTTP request logged for that ID |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 10s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
