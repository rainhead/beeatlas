---
phase: 06-infra03-deployment
plan: 01
subsystem: infra
tags: [cdk, cloudfront, s3, oidc, github-actions, aws]

# Dependency graph
requires:
  - phase: 02-infrastructure
    provides: CDK code for S3, CloudFront OAC, OIDC provider, deployer role, and GitHub Actions deploy workflow
provides:
  - Live CloudFront URL serving the bee atlas frontend (https://d1o1go591lqnqi.cloudfront.net)
  - Verified auto-deploy pipeline: push to main triggers GitHub Actions, both build and deploy jobs pass
  - Corrected 02-02-SUMMARY.md documenting Variables (not Secrets) and --qualifier beeatlas bootstrap
affects: [future custom domain setup, any infra changes to CDK stacks]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "GitHub Actions Variables (vars.*) for non-secret config — separate from Secrets"
    - "CDK bootstrap with --qualifier beeatlas required when bootstrapQualifier set in cdk.json"
    - "cdk deploy --all for multi-stack deployments (GlobalStack + BeeAtlasStack)"

key-files:
  created: []
  modified:
    - .planning/phases/02-infrastructure/02-02-SUMMARY.md

key-decisions:
  - "CDK stacks were already deployed from Phase 2 — deploy returned 'no changes'; INFRA-03 gap was documentation-only"
  - "GitHub Actions Variables set in Variables tab (vars.*), not Secrets tab — deploy.yml uses vars.* context throughout"
  - "No OIDC provider fallback needed — existing provider already present in account; stacks deployed cleanly"

patterns-established:
  - "Verify Variables vs Secrets tab distinction when wiring GitHub Actions to AWS OIDC"

requirements-completed: [INFRA-03]

# Metrics
duration: ~30min (human-executed tasks dominate)
completed: 2026-02-22
---

# Phase 6 Plan 01: CDK Deployment and Live Site Verification Summary

**CloudFront distribution at https://d1o1go591lqnqi.cloudfront.net serving live bee atlas map, with GitHub Actions OIDC deploy pipeline verified passing on push to main**

## Performance

- **Duration:** ~30 min (Tasks 2 and 3 were human-executed)
- **Started:** 2026-02-22
- **Completed:** 2026-02-22
- **Tasks:** 3
- **Files modified:** 1 (.planning/phases/02-infrastructure/02-02-SUMMARY.md)

## Accomplishments

- Corrected Phase 2 SUMMARY documentation: "Secrets" → "Variables", added --qualifier beeatlas for both regions, fixed cdk deploy --all
- CDK stacks confirmed deployed (stacks already existed from Phase 2 — deploy returned "no changes")
- Three GitHub Actions Variables set (AWS_DEPLOYER_ROLE_ARN, S3_BUCKET_NAME, CF_DISTRIBUTION_ID) in Variables tab
- Push to main triggered GitHub Actions; both build and deploy jobs passed
- Live site confirmed at https://d1o1go591lqnqi.cloudfront.net — bee atlas map loads with specimen clusters

## Task Commits

Each task was committed atomically:

1. **Task 1: Correct 02-02-SUMMARY.md documentation errors** - `5419585` (fix)
2. **Task 2: CDK bootstrap and deploy** - (human-executed, no code changes)
3. **Task 3: Set GitHub Variables, push to main, verify live site** - (human-executed, no code changes)

**Plan metadata:** (this commit) (docs: complete plan)

## CDK Stack Outputs (Actual Values)

- **CloudFront URL:** https://d1o1go591lqnqi.cloudfront.net
- **CloudFront Distribution ID:** (from AWS console / CDK output)
- **S3 Bucket:** (from AWS console / CDK output — beeatlasstack-sitebucket-* pattern)
- **Deployer Role ARN:** arn:aws:iam::ACCOUNT:role/beeatlas-github-deployer

Note: Exact BucketName and DistributionId values are set as GitHub Actions Variables at
https://github.com/rainhead/beeatlas/settings/variables/actions

## OIDC Fallback Applied

No — the OIDC provider was not duplicated. CDK reported "no changes" on both stacks, meaning the OIDC provider already existed and was tracked in the CDK state. No fromOpenIdConnectProviderArn fallback was needed.

## ACM Certificate Status

Not confirmed during this phase. The GlobalStack includes a certificate resource; status (validated vs pending DNS propagation) was not explicitly checked. Custom domain (beeatlas.net) is out of scope for Phase 6.

## Nameservers (for Future Custom Domain)

GlobalStack outputs include NetNameServers and ComNameServers. These should be set at the domain registrar (beeatlas.net) when custom domain configuration is undertaken. That work is deferred to a future phase.

## Files Created/Modified

- `.planning/phases/02-infrastructure/02-02-SUMMARY.md` - Corrected "Secrets" → "Variables", added --qualifier beeatlas bootstrap for both regions, fixed cdk deploy --all

## Decisions Made

- CDK stacks were already deployed from Phase 2; this phase closed INFRA-03 as a documentation gap, not a deployment gap
- GitHub Actions Variables (vars.*) must be set in the Variables tab, not Secrets tab — critical distinction as secrets expand to empty string in vars.* context
- No code changes were needed in Task 2 or Task 3; all CDK infrastructure was already written and deployed

## Deviations from Plan

None — plan executed exactly as written. Tasks 2 and 3 were always intended as human-action checkpoints; human confirmed both as complete.

## Issues Encountered

None. The CDK stacks were already deployed when the human ran `cdk deploy --all`, returning "no changes." This was expected given the Phase 2 SUMMARY noted the checkpoint was never formally completed, but the actual AWS resources existed. INFRA-03 was a documentation/verification gap, not a deployment failure.

## Next Phase Readiness

- Phase 6 complete — all INFRA-03 requirements satisfied
- Live site is at https://d1o1go591lqnqi.cloudfront.net
- Future work: custom domain (beeatlas.net) configuration using GlobalStack nameserver outputs
- Future work: ACM certificate DNS validation once registrar nameservers are updated

## Self-Check: PASSED

- FOUND: .planning/phases/06-infra03-deployment/06-01-SUMMARY.md
- FOUND: commit 5419585 (Task 1 — fix 02-02-SUMMARY.md documentation errors)
- Tasks 2 and 3 were human-executed (no code commits); verified by human as complete

---
*Phase: 06-infra03-deployment*
*Completed: 2026-02-22*
