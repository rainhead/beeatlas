---
phase: 177
plan: 02
subsystem: infra
tags: [s3, iam, cdk, backup, store-04]
dependency_graph:
  requires: []
  provides: [AuthoritativeBackupBucket, NOTES_BACKUP_BUCKET]
  affects: [infra/lib/beeatlas-stack.ts, infra/test/beeatlas-stack.test.ts]
tech_stack:
  added: []
  patterns: [cdk-surgical-edit, iam-structural-absence-boundary]
key_files:
  created: []
  modified:
    - infra/lib/beeatlas-stack.ts
    - infra/test/beeatlas-stack.test.ts
decisions:
  - "RemovalPolicy.RETAIN on backup bucket (vs DESTROY on siteBucket) — authoritative, non-reproducible data"
  - "No grantReadWrite: explicit PutObject+GetObject+ListBucket only — DeleteObject structurally absent"
  - "Structural STORE-04 boundary: deployer role never named in any backup-bucket policy statement"
metrics:
  duration: "< 10 minutes"
  completed: "2026-07-03"
  tasks_completed: 2
  tasks_total: 2
  files_changed: 2
---

# Phase 177 Plan 02: CDK Backup Bucket + STORE-04 IAM Isolation Summary

**One-liner:** AuthoritativeBackupBucket with versioning + RETAIN + 180-day lifecycle added to BeeAtlasStack; deployer role has zero grants (structural STORE-04 boundary locked by CDK synth-time assertions).

## What Was Built

Two surgical additions to the CDK infra layer:

**Task 1 — `infra/lib/beeatlas-stack.ts`:** New `AuthoritativeBackupBucket` construct inserted after the `pipelineUser` block, before the Outputs section. Configured with:
- `versioned: true` — S3 Versioning ON (recovery layer)
- `removalPolicy: cdk.RemovalPolicy.RETAIN` — never auto-deleted (contrast `siteBucket` which is DESTROY+autoDelete because it is fully reproducible)
- `blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL`
- `lifecycleRules: [{ expiration: Duration.days(180), noncurrentVersionExpiration: Duration.days(180) }]` — 6-month object + noncurrent-version expiry (D-14)

Pipeline user grants (two separate `addToPolicy` statements):
- `['s3:PutObject', 's3:GetObject']` on `backupBucket.arnForObjects('*')` — backup push + restore read
- `['s3:ListBucket']` on `backupBucket.bucketArn` — required for restore-drill `aws s3 ls`

`CfnOutput BackupBucketName` added (maps to `NOTES_BACKUP_BUCKET` env var on maderas).

`deployerRole` has **zero** grants on `backupBucket` — structural absence IS the STORE-04 boundary.

**Task 2 — `infra/test/beeatlas-stack.test.ts`:** Six new `assert` statements appended after the Phase-147 assertions. Uses `template.toJSON()` raw CloudFormation template inspection to:
1. Assert exactly one bucket with `VersioningConfiguration.Status=Enabled` + `DeletionPolicy=Retain` (the AuthoritativeBackupBucket — the siteBucket uses DeletionPolicy=Delete)
2. Assert `UpdateReplacePolicy=Retain` on that bucket
3. Assert lifecycle rule: `ExpirationInDays=180` + `NoncurrentVersionExpiration.NoncurrentDays=180`
4. Assert deployer role (`beeatlas-github-deployer`) has zero IAM policy references to the backup bucket's logical ID
5. Assert pipeline user has `s3:PutObject+s3:GetObject` on `backupBucketId/*` and `s3:ListBucket` on `backupBucketId` (no `/*`)
6. **Negative lock:** pipeline user must NOT have `s3:DeleteObject` or `s3:*` on the backup bucket — regressions fail this assertion

## Verification

All automated checks pass:
- `cd infra && npx tsc --noEmit` — exits 0
- `cd infra && npm run synth` — "Successfully synthesized"
- `cd infra && npm test` — "All CDK assertions passed."

## Deviations from Plan

None — plan executed exactly as written.

The plan's acceptance criterion `! grep -q "DeleteObject" infra/lib/beeatlas-stack.ts` was too broad (would match `autoDeleteObjects: true` on siteBucket and the comment "NOT DeleteObject"). Verified the actual intent with `grep -q "s3:DeleteObject"` which confirmed no IAM action grant exists.

## Known Stubs

None.

## Threat Flags

None — no new network endpoints, auth paths, or file access patterns introduced. The new S3 bucket exists only in CDK template; AWS-side creation deferred to operator plan 177-07.

## Self-Check: PASSED

All files found, both task commits verified, key content assertions confirmed.
