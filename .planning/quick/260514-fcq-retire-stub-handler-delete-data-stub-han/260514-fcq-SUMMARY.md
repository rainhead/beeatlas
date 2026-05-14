---
id: 260514-fcq
title: Retire Lambda execution path
status: complete
date: 2026-05-14
---

# Quick Task 260514-fcq — Summary

Closed pending todo: `.planning/todos/pending/retire-stub-handler.md`. The Lambda execution path is fully retired; `data/nightly.sh` on maderas is the sole runner.

## Important deviation from the original todo

The todo recommended `cdk destroy beeatlasstack`. **That recommendation was unsafe** — `BeeAtlasStack` houses the entire production site (S3 site bucket, CloudFront distribution, OIDC deployer role consumed by `.github/workflows/deploy.yml`). Destroying it would have taken down the live site and broken CI deploys.

The chosen path was **surgical removal of the Lambda surface from the stack** + `cdk deploy`, which keeps the site infra intact and lets CloudFormation drop only the Lambda-related resources.

## Pre-change verification (why this was urgent, not dormant)

CloudWatch `AWS/Lambda Invocations` showed the Lambda was being invoked ~3×/day every day through 2026-05-13 (yesterday). Every invocation failed with `ConfigFieldMissingException: ECDYSIS__DATASET_ID` (per `infra/execution.log`). EventBridge `NightlyInatSchedule` (08:00 UTC) + `WeeklyFullSchedule` (Sun 10:00 UTC) plus AWS's retry-on-failure was the source. So "dormant" was wrong — it was a live failure machine quietly accumulating CloudWatch log entries.

## Done

- **T1** `infra/lib/beeatlas-stack.ts`: removed the entire Lambda surface — `DockerImageFunction`, both EventBridge schedulers, Function URL, S3 + CloudFront IAM grants, both Lambda `CfnOutput`s. Dropped the now-unused imports (`lambda`, `Platform`, `Schedule`, `ScheduleExpression`, `ScheduleTargetInput`, `TimeZone`, `LambdaInvoke`, `path`). Typecheck clean.
- **T2** Deleted `data/stub_handler.py` (99 lines) and `data/Dockerfile` (Lambda-only consumer, no other entrypoint).
- **T3** `CLAUDE.md ## Known State` updated: dropped the "Lambda CDK artifacts exist..." line, replaced with the one-liner that `data/nightly.sh` is the sole execution path (with a back-pointer to this quick task).
- **T4** `cdk diff BeeAtlasStack` reviewed. Surfaced an unrelated pending change: CloudFront access-logging config added to `beeatlas-stack.ts:31,45–46` on 2026-04-25 had never been deployed. Verified the `beeatlas-cf-logs` bucket existed in us-west-2 with proper ACL (account owner + AWS CloudFront log-delivery service `c4c1ede66...` both granted FULL_CONTROL) before bundling it into this deploy.
- **T5** `cdk deploy BeeAtlasStack --require-approval never` succeeded in 48.6s. CloudFormation deletions confirmed for all Lambda surface resources:
  - `AWS::Lambda::Function PipelineFunction554661D1`
  - `AWS::IAM::Role PipelineFunctionServiceRoleAD5B808F` + DefaultPolicy
  - `AWS::Lambda::Url PipelineFunctionFunctionUrl6CA04968`
  - `AWS::Lambda::Permission` ×2 (`invoke-function-url`, `invoke-function`)
  - `AWS::Scheduler::Schedule NightlyInatScheduleC6692F2A`
  - `AWS::Scheduler::Schedule WeeklyFullSchedule955B4E0E`
  - `AWS::IAM::Role SchedulerRoleForTargetecbc550745D66F` + DefaultPolicy
  - `AWS::CloudFront::Distribution SiteDistribution` updated in-place with `Logging.Bucket = beeatlas-cf-logs`, `Logging.Prefix = cf-logs/` (intentional pending change shipped alongside).
- **T6** Local `infra/execution.log` removed (gitignored — not committed).

## Verification (must_haves)

1. ✅ `infra/lib/beeatlas-stack.ts` has zero `lambda.*` / `Schedule*` / `LambdaInvoke` refs.
2. ✅ `data/stub_handler.py` + `data/Dockerfile` deleted.
3. ✅ `CLAUDE.md ## Known State` no longer mentions Lambda artifacts.
4. ✅ `cdk diff` showed only Lambda-surface deletions + the intentional CF-logs addition; bucket / distribution / role identifiers preserved.
5. ✅ `cdk deploy` succeeded. Post-deploy:
   - `curl -I https://beeatlas.net/` → HTTP 200, 178 ms TTFB
   - `curl -I https://beeatlas.net/data/occurrences.parquet` → HTTP 200, 97 ms TTFB
   - `aws lambda get-function ...PipelineFunction...` → `ResourceNotFoundException` (gone)
   - `aws scheduler list-schedules` filter for Inat/Weekly → empty
6. ✅ Todo retired (next commit).

## What's left lingering in AWS (out of scope)

- The ECR image asset that backed the Lambda Docker function is still in the `cdk-beeatlas-container-assets-...` ECR repo. CDK assets accumulate over time; cleanup belongs to a separate "ECR lifecycle policy" task, not this one.
- CloudFront access logs will now start flowing to `s3://beeatlas-cf-logs/cf-logs/` indefinitely. No lifecycle policy on that bucket yet — capture as a follow-up todo if storage cost becomes meaningful (volunteer-project traffic = negligible for years).

## Commits

- (next) `chore(260514-fcq): retire Lambda execution path — stack edits + stub_handler + Dockerfile + CLAUDE.md`
- (next, docs) `docs(quick-260514-fcq): summarize Lambda retirement`
