---
phase: 25
slug: cdk-infrastructure
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-27
---

# Phase 25 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | TypeScript compilation + CDK synth (no Jest suite in infra/) |
| **Config file** | `infra/tsconfig.json` |
| **Quick run command** | `cd infra && npm run build` |
| **Full suite command** | `cd infra && npx cdk synth` |
| **Estimated runtime** | ~10 seconds (build), ~30 seconds (synth with Docker asset hash) |

---

## Sampling Rate

- **After every task commit:** Run `cd infra && npm run build`
- **After every plan wave:** Run `cd infra && npx cdk synth`
- **Before `/gsd:verify-work`:** Full synth must be clean + `cdk deploy` + manual Lambda URL invocation
- **Max feedback latency:** ~10 seconds (TypeScript compile)

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 25-01-01 | 01 | 0 | LAMBDA-03 | file check | `test -f data/Dockerfile && echo OK` | ❌ W0 | ⬜ pending |
| 25-01-02 | 01 | 0 | LAMBDA-03 | file check | `test -f data/stub_handler.py && echo OK` | ❌ W0 | ⬜ pending |
| 25-01-03 | 01 | 1 | LAMBDA-03 | synth smoke | `cd infra && npx cdk synth 2>&1 \| grep -c PipelineFunction` | ❌ W0 | ⬜ pending |
| 25-01-04 | 01 | 1 | LAMBDA-04 | synth smoke | `cd infra && npx cdk synth 2>&1 \| grep -c AWS::Scheduler::Schedule` | ❌ W0 | ⬜ pending |
| 25-01-05 | 01 | 1 | LAMBDA-05 | synth smoke | `cd infra && npx cdk synth 2>&1 \| grep PipelineFunctionUrl` | ❌ W0 | ⬜ pending |
| 25-01-06 | 01 | 2 | LAMBDA-03,04,05 | deploy+manual | `cdk deploy` + `curl <URL>` returns 200 | N/A (manual) | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `data/Dockerfile` — must exist before `cdk synth` can hash the Docker asset
- [ ] `data/stub_handler.py` — required by Dockerfile CMD; performs S3 round-trip

*Wave 0 must complete before any CDK construct additions to beeatlas-stack.ts.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| `cdk deploy` completes | LAMBDA-03,04,05 | Requires live AWS credentials | `cd infra && npx cdk deploy` — must exit 0; CFN outputs include LambdaUrl |
| Lambda URL returns 200 | LAMBDA-03 | Live AWS invocation | `curl -s -o /dev/null -w "%{http_code}" <LambdaUrl>` must print `200` |
| CloudWatch shows S3 round-trip | LAMBDA-03 | Log inspection | AWS Console → Lambda → PipelineFunction → Monitor → View CloudWatch logs; last invocation log must contain "S3 round-trip complete" |
| EventBridge Scheduler has 2 rules | LAMBDA-04 | AWS Console | AWS Console → EventBridge → Scheduler → Schedules; must show `beeatlas-inat-nightly` and `beeatlas-pipeline-weekly` targeting PipelineFunction |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
