---
phase: 10
slug: build-integration-and-verification
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-10
---

# Phase 10 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | pytest 9.x |
| **Config file** | `data/pyproject.toml` |
| **Quick run command** | `cd data && uv run pytest tests/test_inat_download.py -q` |
| **Full suite command** | `cd data && uv run pytest tests/ -q` |
| **Estimated runtime** | ~1 second (unit tests); ~30s for live smoke |

---

## Sampling Rate

- **After every task commit:** Run `cd data && uv run pytest tests/test_inat_download.py -q`
- **After every plan wave:** Run `cd data && uv run pytest tests/ -q`
- **Before `/gsd:verify-work`:** Full suite must be green + CI must be green on main
- **Max feedback latency:** ~1 second (unit tests)

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 10-01-01 | 01 | 1 | INAT-03 | unit | `cd data && uv run pytest tests/test_inat_download.py -q` | ✅ | ⬜ pending |
| 10-01-02 | 01 | 1 | INAT-03 | smoke (live) | `npm run build && python -c "import pandas as pd; df=pd.read_parquet('data/samples.parquet'); assert len(df)>0; print('OK:', len(df), 'rows')"` | ❌ requires live run | ⬜ pending |
| 10-01-03 | 01 | 1 | INAT-03 | manual CI | Push branch, observe GitHub Actions build job S3 cache round-trip in logs | ❌ requires CI run | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

Existing infrastructure covers all phase requirements. No new test files needed — Phase 9 delivered 15 passing unit tests for the iNat download pipeline. Phase 10 success criteria are integration/CI-level and verified via live runs.

*If none: "Existing infrastructure covers all phase requirements."*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| S3 cache round-trip succeeds in CI | INAT-03 | Requires live CI run with S3 credentials | Push branch to origin; inspect GitHub Actions build job logs for "Restore S3 cache" and "Upload S3 cache" steps completing without error |
| CI passes on push to main | INAT-03 | Requires live CI run + deploy | Push to main; observe full workflow (build + deploy jobs) complete green |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 2s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
