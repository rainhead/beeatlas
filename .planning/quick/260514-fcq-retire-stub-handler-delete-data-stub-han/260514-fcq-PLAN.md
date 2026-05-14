---
id: 260514-fcq
title: Retire Lambda execution path (data/stub_handler.py + CDK + Dockerfile)
mode: quick
date: 2026-05-14
source: .planning/todos/pending/retire-stub-handler.md
---

# Quick Task: Retire Lambda execution path

## Goal

Remove the dormant-but-actively-failing Lambda execution path. `data/nightly.sh` on maderas remains the canonical pipeline runner. The shared CDK stack (S3 bucket + CloudFront + OIDC deployer role) is preserved — only the Lambda surface is removed.

## Verified state (pre-change)

- Lambda `BeeAtlasStack-PipelineFunction554661D1-2zTfOy2xE4ID` is invoked ~3×/day by EventBridge (NightlyInatSchedule + WeeklyFullSchedule + retries). Every invocation fails with `ConfigFieldMissingException: ECDYSIS__DATASET_ID` (per `infra/execution.log`). Last invocation: 2026-05-13.
- `data/nightly.sh` on maderas runs the canonical pipeline (per CLAUDE.md `## Known State`).
- `BeeAtlasStack` houses the production site — destroying the stack is **not** an option (would break GitHub Actions deploy via `AWS_DEPLOYER_ROLE_ARN`, `S3_BUCKET_NAME`, `CF_DISTRIBUTION_ID`).

## Tasks (atomic commits)

### T1 — Strip Lambda surface from `infra/lib/beeatlas-stack.ts`

Remove (all in `BeeAtlasStack`):
- `DockerImageFunction PipelineFunction` (lines 191–213)
- `siteBucket.grantReadWrite(pipelineFn, 'data/*')` + `db/*` (lines 215–217)
- Lambda CloudFront-invalidation IAM policy (lines 219–226)
- `NightlyInatSchedule` (lines 228–239)
- `WeeklyFullSchedule` (lines 241–253)
- `pipelineFn.addFunctionUrl(...)` (lines 255–258)
- `PipelineFunctionUrl` + `PipelineFunctionArn` `CfnOutput`s (lines 277–284)
- Now-unused imports: `lambda`, `Platform`, `Schedule`, `ScheduleExpression`, `ScheduleTargetInput`, `TimeZone`, `LambdaInvoke`, `path`

**Verify:** `cd infra && npx tsc --noEmit` clean.

### T2 — Delete `data/stub_handler.py` and `data/Dockerfile`

Both are Lambda-only consumers. No other entrypoint references `stub_handler` (verified earlier; only `infra/cdk.out/asset.<hash>/stub_handler.py` reference is a CDK build artifact and will vanish on next synth).

**Verify:** `grep -rn "stub_handler\|Dockerfile" data/ infra/lib/ infra/bin/ .github/ scripts/` returns no live refs.

### T3 — Update `CLAUDE.md ## Known State`

Drop the "Lambda CDK artifacts exist in AWS but the active execution path is `data/nightly.sh` on maderas (nightly cron)" line. Replace with the truthful one-liner about `data/nightly.sh` being the sole execution path.

### T4 — `cdk diff` (review gate — pause for user)

Generate `cd infra && npx cdk diff BeeAtlasStack` and surface it. Must show resource deletions for: 1 Lambda + 2 EventBridge schedules + 1 Function URL + Lambda IAM policy statements + 2 CfnOutputs. **No deletions for SiteBucket / Distribution / DeployerRole / OIDC provider / GlobalStack.**

### T5 — `cdk deploy` (destructive — user-authorized only)

After T4 review, `cd infra && npx cdk deploy BeeAtlasStack`. CloudFormation drops the Lambda surface; production site continues serving.

### T6 — Clean up `infra/execution.log`

Gitignored already (`infra/execution.log` in `.gitignore`). Delete the local file (no commit).

## Out of scope

- Stack rename / re-org
- Deployer role IAM tightening
- Removing the unused ECR image in AWS (will linger until ECR lifecycle policy or manual cleanup — note in SUMMARY)

## must_haves

1. `infra/lib/beeatlas-stack.ts` has zero `lambda.*` / `Schedule*` / `LambdaInvoke` references.
2. `data/stub_handler.py` + `data/Dockerfile` deleted.
3. `CLAUDE.md ## Known State` no longer mentions Lambda artifacts.
4. `cdk diff` shows only Lambda-surface deletions (preserves S3 / CloudFront / OIDC).
5. `cdk deploy` succeeds and the live site continues serving.
6. Todo retired (pending → done).
