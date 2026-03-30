---
phase: 26
slug: lambda-handler-dockerfile
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-28
---

# Phase 26 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | pytest (uv run pytest) |
| **Config file** | data/pyproject.toml |
| **Quick run command** | `cd data && uv run pytest data/tests/ -x -q 2>/dev/null \|\| true` |
| **Full suite command** | `cd data && uv run pytest data/tests/ -v` |
| **Estimated runtime** | ~10 seconds (unit tests only, no AWS) |

---

## Sampling Rate

- **After every task commit:** Run `cd data && uv run python -c "import stub_handler; print('import ok')"` or equivalent import check
- **After every plan wave:** Run `cd data && uv run pytest data/tests/ -v` (when tests exist)
- **Before `/gsd:verify-work`:** Full suite must be green; manual Lambda URL invocation required for PIPE-11 through PIPE-14
- **Max feedback latency:** ~30 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 26-01-01 | 01 | 1 | PIPE-11 | import | `cd data && uv run python -c "import handler"` | ❌ W0 | ⬜ pending |
| 26-01-02 | 01 | 1 | PIPE-11 | manual | `curl $LAMBDA_URL` + CloudWatch logs | n/a | ⬜ pending |
| 26-01-03 | 01 | 1 | PIPE-12 | manual | `aws s3 ls s3://BUCKET/data/` | n/a | ⬜ pending |
| 26-01-04 | 01 | 1 | PIPE-13 | manual | `aws s3 ls s3://BUCKET/db/` | n/a | ⬜ pending |
| 26-01-05 | 01 | 1 | PIPE-14 | manual | CloudFront invalidation history | n/a | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- Existing infrastructure covers all phase requirements for automated checks (import-level only).

*Manual AWS verification required for PIPE-11 through PIPE-14 — no substitute for live invocation.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Lambda completes all pipelines within 15 min | PIPE-11 | Requires live AWS Lambda + seeded S3 DuckDB | Seed S3, invoke Lambda URL, watch CloudWatch logs |
| Parquet/GeoJSON appear in S3 /data/ | PIPE-12 | Requires live AWS | `aws s3 ls s3://BUCKET/data/` after invocation |
| beeatlas.duckdb backed up to S3 /db/ | PIPE-13 | Requires live AWS | `aws s3 ls s3://BUCKET/db/` after invocation |
| CloudFront invalidation created for /data/* | PIPE-14 | Requires live AWS CloudFront | Check invalidation history in AWS console or CLI |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
