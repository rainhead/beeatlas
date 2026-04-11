---
phase: 44
slug: pipeline-wiring-and-discovery
status: verified
nyquist_compliant: true
wave_0_complete: true
created: 2026-04-11
---

# Phase 44 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework (data)** | pytest 9.x |
| **Config file (data)** | `data/pyproject.toml` (`[tool.pytest.ini_options]`) |
| **Quick run command** | `cd data && uv run pytest` |
| **Full suite command** | `cd data && uv run pytest` |
| **Estimated runtime** | ~5 seconds |
| **Framework (frontend)** | vitest |
| **Config file (frontend)** | `frontend/vitest.config.*` |
| **Frontend run command** | `cd frontend && npm test` |

> Note: Phase 44 modified `data/nightly.sh` (shell script) and `frontend/index.html` (static HTML). Neither file has a pytest/vitest unit test suite — automated verification uses shell grep and bash syntax checks, which is the appropriate form for infrastructure-level changes.

---

## Sampling Rate

- **After every task commit:** Run quick grep verify commands (see Per-Task map)
- **After every plan wave:** Run `cd data && uv run pytest`
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** ~10 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 44-01-01 | 01 | 1 | PIPE-02 | T-44-01, T-44-05 | nightly.sh runs as trusted cron user; no heredoc injection surface | shell | `bash -n data/nightly.sh && grep -q 'uv run python run.py' data/nightly.sh && grep -q 's3 sync.*feeds' data/nightly.sh && ! grep -q 'python -' data/nightly.sh && echo PASS` | ✅ | ✅ green |
| 44-01-02 | 01 | 1 | DISC-01 | T-44-03 | Same-origin relative href; served via HTTPS/CloudFront | shell | `grep -q 'rel="alternate" type="application/atom+xml".*href="/data/feeds/determinations.xml"' frontend/index.html && echo PASS` | ✅ | ✅ green |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

Existing infrastructure covers all phase requirements. No new test files needed — both tasks modify infrastructure files (shell script + static HTML) where grep/bash verification is canonical.

---

## Manual-Only Verifications

All phase behaviors have automated verification (shell grep + bash syntax check).

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references (none — no gaps)
- [x] No watch-mode flags
- [x] Feedback latency < 10s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** approved 2026-04-11
