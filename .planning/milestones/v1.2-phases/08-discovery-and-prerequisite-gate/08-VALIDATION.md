---
phase: 8
slug: discovery-and-prerequisite-gate
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-10
---

# Phase 8 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | None — no test framework detected; inline `python -c` checks |
| **Config file** | None — Wave 0 installs |
| **Quick run command** | `cd data && uv run python -c "from inat.observations import SPECIMEN_COUNT_FIELD_ID; assert SPECIMEN_COUNT_FIELD_ID == 8338"` |
| **Full suite command** | Manual: CDK deploy + S3 smoke test + constant assertion |
| **Estimated runtime** | ~5 seconds (constant check); 2-5 min (CDK deploy) |

---

## Sampling Rate

- **After every task commit:** Run quick constant assertion command
- **After every plan wave:** Run full suite (CDK deploy + S3 smoke + constant check)
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** ~5 seconds (automated), 5 min (CDK deploy)

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 8-01-01 | 01 | 1 | INFRA-04 | unit | `cd data && uv run python -c "from inat.observations import SPECIMEN_COUNT_FIELD_ID; assert SPECIMEN_COUNT_FIELD_ID == 8338"` | ❌ W0 | ⬜ pending |
| 8-02-01 | 02 | 1 | INFRA-04 | unit | `python3 -c "import yaml; ..."` (YAML assertion) | ✅ exists | ⬜ pending |
| 8-02-02 | 02 | 1 | INFRA-04 | smoke (manual) | `aws s3 cp /dev/null s3://$S3_BUCKET_NAME/cache/test.txt && aws s3 rm s3://$S3_BUCKET_NAME/cache/test.txt` | Manual | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `data/inat/observations.py` — create with `SPECIMEN_COUNT_FIELD_ID = 8338` constant and `ofvs` behavior documentation

*No test framework installation needed — this phase's verification is primarily manual/operational. Existing infrastructure covers all phase requirements (inline python -c checks suffice).*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| OIDC role grants S3 cache access | INFRA-04 | Requires AWS credentials | `aws s3 cp /dev/null s3://$S3_BUCKET_NAME/cache/test.txt && aws s3 rm s3://$S3_BUCKET_NAME/cache/test.txt` |
| CI build job has AWS credentials | INFRA-04 | Requires CI pipeline execution | Push to feature branch, verify `build` job has `aws-actions/configure-aws-credentials` step |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 300s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
