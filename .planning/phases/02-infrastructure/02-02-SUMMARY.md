---
phase: 02-infrastructure
plan: 02
subsystem: infra
tags: [github-actions, aws, s3, cloudfront, oidc, ci-cd]

# Dependency graph
requires:
  - phase: 02-01
    provides: CDK stack with S3, CloudFront OAC, OIDC provider, deployer role
provides:
  - GitHub Actions workflow (.github/workflows/deploy.yml) building frontend on all pushes
  - Keyless OIDC-based deploy to S3 + CloudFront on push to main
affects: [03-data-pipeline, 04-ui, 05-polish]

# Tech tracking
tech-stack:
  added: [github-actions, aws-actions/configure-aws-credentials@v4]
  patterns: [keyless-oidc-deploy, workspace-scoped-npm-build, job-level-oidc-permissions]

key-files:
  created:
    - .github/workflows/deploy.yml
  modified: []

key-decisions:
  - "id-token: write permission placed on deploy job (not workflow level) to avoid 'Credentials could not be loaded' error"
  - "deploy job rebuilds frontend itself instead of consuming build job artifact — avoids artifact upload/download complexity"
  - "npm run build --workspace=frontend used (not bare npm run build) because root package.json has no build script"
  - "S3 sync uses --delete flag to remove stale files from bucket"
  - "CloudFront invalidation uses wildcard /* (one free invalidation unit)"

patterns-established:
  - "OIDC permissions scoped to the specific job that needs them, not at workflow level"
  - "Deploy job is self-contained: checkout + install + build + deploy in one job"

requirements-completed: [INFRA-03]

# Metrics
duration: partial (awaiting checkpoint)
completed: 2026-02-18
---

# Phase 02 Plan 02: GitHub Actions CI/CD Workflow Summary

**GitHub Actions deploy.yml with OIDC keyless auth: build on all pushes, S3 + CloudFront deploy on main**

## Performance

- **Duration:** ~5 min (Task 1 complete; paused at Task 2 human checkpoint)
- **Started:** 2026-02-18T23:16:23Z
- **Completed:** 2026-02-18 (partial — awaiting CDK deploy and GitHub secret setup)
- **Tasks:** 1 of 2 complete (Task 2 is human-verify checkpoint)
- **Files modified:** 1

## Accomplishments
- Created `.github/workflows/deploy.yml` with two-job structure
- `build` job runs on all branch pushes using `npm run build --workspace=frontend`
- `deploy` job uses `aws-actions/configure-aws-credentials@v4` with OIDC — no stored AWS credentials
- `id-token: write` scoped to deploy job level (critical for OIDC to work correctly)

## Task Commits

Each task was committed atomically:

1. **Task 1: Write GitHub Actions deploy workflow** - `b958f93` (feat)
2. **Task 2: Bootstrap CDK, deploy stack, set secrets, verify live site** - PENDING (human checkpoint)

## Files Created/Modified
- `.github/workflows/deploy.yml` - Two-job CI/CD workflow: build (all pushes) + deploy (main only, OIDC)

## Decisions Made
- `id-token: write` permission placed at job level on `deploy` job only — if placed at workflow level alone, the deploy job fails with "Credentials could not be loaded"
- Deploy job rebuilds frontend itself rather than consuming artifact from `build` job — avoids artifact upload/download complexity, keeps deploy job self-contained
- `npm run build --workspace=frontend` used because root `package.json` has no `build` script
- CloudFront invalidation uses `"/*"` wildcard path (one free invalidation unit, not per-file)

## Deviations from Plan

None — Task 1 executed exactly as specified in the plan.

## User Setup Required

**External services require manual configuration before deploy will function:**

### Step 1 — Bootstrap CDK (one-time per account/region)
```bash
cd infra
AWS_PROFILE=your-profile npx cdk bootstrap aws://YOUR_ACCOUNT_ID/us-east-1
```

### Step 2 — Deploy the CDK stack
```bash
cd infra
AWS_PROFILE=your-profile npx cdk deploy
```
Note outputs: `BeeAtlasStack.BucketName`, `BeeAtlasStack.DistributionId`, `BeeAtlasStack.DistributionDomain`, `BeeAtlasStack.DeployerRoleArn`

**If deploy fails with "GitHubOidcProvider already exists":** Edit `infra/lib/beeatlas-stack.ts` — replace the `new iam.OpenIdConnectProvider(...)` block with:
```typescript
const githubProvider = iam.OpenIdConnectProvider.fromOpenIdConnectProviderArn(
  this, 'GitHubOidcProvider',
  `arn:aws:iam::${this.account}:oidc-provider/token.actions.githubusercontent.com`
);
```

### Step 3 — Set GitHub repository secrets
Go to: https://github.com/rainhead/beeatlas/settings/secrets/actions

Set these three secrets (values from Step 2 outputs):
- `AWS_DEPLOYER_ROLE_ARN` = `BeeAtlasStack.DeployerRoleArn`
- `S3_BUCKET_NAME` = `BeeAtlasStack.BucketName`
- `CF_DISTRIBUTION_ID` = `BeeAtlasStack.DistributionId`

### Step 4 — Push to main and verify
Push to main. Watch: https://github.com/rainhead/beeatlas/actions
Expected: `build` job passes; `deploy` job completes successfully.

### Step 5 — Verify live site
Visit `https://dXXXXXXXXXXXXX.cloudfront.net` (`DistributionDomain` from Step 2).
Expected: Bee atlas frontend loads (HTTP 200).

## Next Phase Readiness
- Workflow file committed and ready to run once secrets are set
- Awaiting human to: (1) run `cdk deploy`, (2) set 3 GitHub secrets, (3) push to main, (4) verify site loads
- Once checkpoint complete, INFRA-03 is satisfied and Phase 02 is done

---
*Phase: 02-infrastructure*
*Completed: 2026-02-18 (partial — checkpoint pending)*
