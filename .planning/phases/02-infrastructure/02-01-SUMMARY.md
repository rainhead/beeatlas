---
phase: 02-infrastructure
plan: 01
subsystem: infra
tags: [aws-cdk, s3, cloudfront, iam, oidc, typescript, github-actions]

# Dependency graph
requires: []
provides:
  - CDK TypeScript project in infra/ that synthesizes a full CloudFormation template
  - S3 bucket (private, BlockPublicAccess.BLOCK_ALL) for static site hosting
  - CloudFront distribution with OAC (S3BucketOrigin.withOriginAccessControl)
  - GitHub OIDC provider for token.actions.githubusercontent.com
  - Deployer IAM role (beeatlas-github-deployer) scoped to repo:rainhead/beeatlas:*
  - CfnOutputs: BucketName, DistributionId, DistributionDomain, DeployerRoleArn
affects: [02-02, deploy, ci-cd]

# Tech tracking
tech-stack:
  added:
    - aws-cdk-lib ^2.238.0
    - constructs ^10.0.0
    - source-map-support ^0.5.21
    - aws-cdk ^2.1106.1 (CLI)
    - typescript ~5.7.0
    - ts-node ^10.9.2
    - "@types/node ^22.0.0"
  patterns:
    - CDK single-stack pattern (S3 + CloudFront + OIDC + IAM role in one stack)
    - OAC pattern using S3BucketOrigin.withOriginAccessControl() (not deprecated S3Origin/OAI)
    - WebIdentityPrincipal with StringLike/StringEquals conditions for OIDC trust policy
    - CfnOutputs consumed by CI/CD as GitHub Actions secrets

key-files:
  created:
    - infra/package.json
    - infra/tsconfig.json
    - infra/cdk.json
    - infra/bin/infra.ts
    - infra/lib/beeatlas-stack.ts
  modified: []

key-decisions:
  - "Use S3BucketOrigin.withOriginAccessControl() (OAC) not deprecated S3Origin (OAI) — OAC is more secure (SigV4, SSE-KMS support) and CDK stable since v2.156.0"
  - "No thumbprints in OIDC provider — AWS added GitHub to root CAs in late 2024, thumbprints no longer required"
  - "OIDC sub claim uses StringLike with repo:rainhead/beeatlas:* — scoped to repo, allows any branch/tag/environment"
  - "No websiteIndexDocument on S3 bucket — use defaultRootObject: index.html on CloudFront Distribution instead (required for OAC compatibility)"
  - "Deployer role grants direct S3 + CloudFront permissions plus sts:AssumeRole on cdk-* (needed for future cdk deploy from CI)"

patterns-established:
  - "CDK stack structure: infra/bin/infra.ts (entry) -> infra/lib/beeatlas-stack.ts (stack)"
  - "OIDC fallback documented in code comment: fromOpenIdConnectProviderArn() if provider already exists"

requirements-completed: [INFRA-01, INFRA-02]

# Metrics
duration: 4min
completed: 2026-02-18
---

# Phase 02 Plan 01: Scaffold CDK Infrastructure Stack Summary

**CDK TypeScript stack in infra/ defining S3 private bucket, CloudFront OAC distribution, GitHub OIDC provider, and deployer IAM role scoped to repo:rainhead/beeatlas — synthesizes clean CloudFormation with four deployment outputs**

## Performance

- **Duration:** 4 min
- **Started:** 2026-02-18T23:20:59Z
- **Completed:** 2026-02-18T23:25:00Z
- **Tasks:** 2
- **Files modified:** 5

## Accomplishments

- Scaffolded CDK TypeScript project in `infra/` with correct package.json, tsconfig.json, cdk.json, and bin/infra.ts entry point
- Implemented full `BeeAtlasStack` using `S3BucketOrigin.withOriginAccessControl()` (modern OAC pattern, not deprecated OAI)
- Wired GitHub OIDC provider and deployer IAM role scoped to `repo:rainhead/beeatlas:*` with no stored credentials
- Verified: `npx tsc --noEmit` exits 0, `npx cdk synth` produces valid CloudFormation with all required resource types and outputs

## Task Commits

Each task was committed atomically:

1. **Task 1: Scaffold CDK TypeScript project in infra/** - `9dace47` (chore)
2. **Task 2: Implement BeeAtlasStack** - `52cfe3c` (feat)

**Plan metadata:** (pending final commit)

## Files Created/Modified

- `infra/package.json` - CDK dependencies (aws-cdk-lib ^2.238.0, constructs, ts-node, typescript)
- `infra/tsconfig.json` - TypeScript config with ES2020 target and strict mode
- `infra/cdk.json` - CDK CLI config with ts-node app entry and context flags
- `infra/bin/infra.ts` - CDK App entry point instantiating BeeAtlasStack
- `infra/lib/beeatlas-stack.ts` - Full CDK stack: S3 bucket, CloudFront OAC distribution, OIDC provider, deployer role, CfnOutputs

## Decisions Made

- Used `S3BucketOrigin.withOriginAccessControl()` — the stable OAC L2 construct added in CDK v2.156.0. Avoids deprecated `S3Origin` (OAI). OAC supports SigV4 and SSE-KMS, required for modern secure setups.
- No `thumbprints` on the OIDC provider — AWS added GitHub's root CA in late 2024 so this is no longer needed and simplifies the stack.
- OIDC trust uses `StringLike` with `repo:rainhead/beeatlas:*` rather than exact match — allows any branch, tag, or environment while scoping to this specific repo.
- `defaultRootObject: 'index.html'` set on the Distribution, not `websiteIndexDocument` on the bucket — the latter enables website hosting mode which is incompatible with OAC.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

Before running `cdk deploy` for the first time:

1. Run CDK bootstrap once per account/region (requires admin credentials):
   ```bash
   cd infra && cdk bootstrap aws://ACCOUNT_ID/us-east-1
   ```
2. If the GitHub OIDC provider already exists in the account, replace `new iam.OpenIdConnectProvider(...)` in `beeatlas-stack.ts` with `iam.OpenIdConnectProvider.fromOpenIdConnectProviderArn(...)` (fallback is documented in a code comment).

## Next Phase Readiness

- CDK stack is synthesizable and ready for `cdk deploy` (Plan 02-02 checkpoint)
- All four CfnOutputs (BucketName, DistributionId, DistributionDomain, DeployerRoleArn) are defined — needed as GitHub Actions secrets in Plan 02-02
- INFRA-01 and INFRA-02 requirements satisfied

## Self-Check: PASSED

- infra/package.json: FOUND
- infra/tsconfig.json: FOUND
- infra/cdk.json: FOUND
- infra/bin/infra.ts: FOUND
- infra/lib/beeatlas-stack.ts: FOUND
- infra/node_modules/: FOUND
- .planning/phases/02-infrastructure/02-01-SUMMARY.md: FOUND
- commit 9dace47 (chore scaffold): FOUND
- commit 52cfe3c (feat BeeAtlasStack): FOUND

---
*Phase: 02-infrastructure*
*Completed: 2026-02-18*
