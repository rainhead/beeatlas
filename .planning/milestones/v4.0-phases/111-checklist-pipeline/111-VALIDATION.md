---
phase: 111
slug: checklist-pipeline
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-05-23
---

# Phase 111 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | pytest |
| **Config file** | data/pyproject.toml |
| **Quick run command** | `cd data && uv run pytest` |
| **Full suite command** | `cd data && uv run pytest` |
| **Estimated runtime** | ~15 seconds |

---

## Sampling Rate

- **After every task commit:** Run `cd data && uv run pytest`
- **After every plan wave:** Run `cd data && uv run pytest`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 30 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 111-01-01 | 01 | 1 | CHECK-01, CHECK-02 | — | N/A | integration | `cd data && uv run pytest -k checklist` | ✅ | ⬜ pending |
| 111-01-02 | 01 | 1 | CHECK-04 | — | N/A | integration | `cd data && uv run pytest -k checklist` | ✅ | ⬜ pending |
| 111-01-03 | 01 | 1 | EXT-01 | — | N/A | integration | `cd data && uv run pytest -k checklist` | ✅ | ⬜ pending |
| 111-01-04 | 01 | 2 | CHECK-03 | — | N/A | integration | `cd data && uv run pytest` | ✅ | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `data/tests/test_checklist_mart.py` — pytest assertions: row count ≥ 2000, no null canonical_name, no null specific_epithet, TRIM(family) = family

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| checklist.parquet accessible at /data/ on CloudFront | CHECK-03 | Requires nightly.sh to run or manual S3 upload | After pipeline run: `curl -I https://d<CF-ID>.cloudfront.net/data/checklist.parquet` |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
