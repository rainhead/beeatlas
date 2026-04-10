---
phase: 43
slug: feed-variants
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-04-10
---

# Phase 43 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | pytest 9.0.2 |
| **Config file** | `data/pyproject.toml` |
| **Quick run command** | `cd data && uv run pytest tests/test_feeds.py -x -q` |
| **Full suite command** | `cd data && uv run pytest -x -q` |
| **Estimated runtime** | ~5 seconds |

---

## Sampling Rate

- **After every task commit:** Run `cd data && uv run pytest tests/test_feeds.py -x -q`
- **After every plan wave:** Run `cd data && uv run pytest -x -q`
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 10 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 43-01-01 | 01 | 0 | FEED-05, FEED-06, FEED-07, FEED-08, PIPE-03 | — | N/A | unit stubs | `cd data && uv run pytest tests/test_feeds.py -x -q` | ❌ W0 | ⬜ pending |
| 43-01-02 | 01 | 1 | FEED-05 | T-43-01 | Slug strips `../` and non-alphanumeric chars — no path traversal | unit | `cd data && uv run pytest tests/test_feeds.py -k collector -x` | ❌ W0 | ⬜ pending |
| 43-01-03 | 01 | 1 | FEED-06 | — | N/A | unit | `cd data && uv run pytest tests/test_feeds.py -k genus -x` | ❌ W0 | ⬜ pending |
| 43-01-04 | 01 | 1 | FEED-07 | — | N/A | unit | `cd data && uv run pytest tests/test_feeds.py -k county -x` | ❌ W0 | ⬜ pending |
| 43-01-05 | 01 | 1 | FEED-08 | — | N/A | unit | `cd data && uv run pytest tests/test_feeds.py -k ecoregion -x` | ❌ W0 | ⬜ pending |
| 43-01-06 | 01 | 1 | PIPE-03 | — | N/A | unit | `cd data && uv run pytest tests/test_feeds.py -k index -x` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `data/tests/test_feeds.py` — extend with variant feed tests (collector, genus, county, ecoregion, index.json, empty feed behavior)
- [ ] Fixture coverage note: existing `fixture_con` has one occurrence with `recorded_by='Test Collector'`, `genus='Eucera'`, coordinates inside Chelan county and North Cascades ecoregion — sufficient for all four variant types without schema changes
- [ ] Empty feed test: use `tmp_path` + minimal DuckDB with zero rows (pattern from existing `test_empty_window`)

---

## Manual-Only Verifications

All phase behaviors have automated verification.

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 10s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
