---
phase: 25-cdk-infrastructure
plan: 01
subsystem: infra
tags: [aws-cdk, lambda, docker, eventbridge-scheduler, s3, cloudformation]

# Dependency graph
requires:
  - phase: 24-tech-debt-audit
    provides: DuckDB persistence decision (S3-backed, not EFS) and updated tech debt inventory
provides:
  - DockerImageFunction (Python 3.14 stub) proving S3 round-trip from Lambda /tmp
  - Two EventBridge Scheduler rules (nightly iNat, weekly full pipeline)
  - Lambda Function URL for manual invocation
  - Scoped S3 IAM grants on data/* and db/* prefixes
affects: [26-pipeline-wiring, 27-frontend-runtime-fetching, 28-cors-configuration]

# Tech tracking
tech-stack:
  added:
    - aws-cdk-lib/aws-lambda (DockerImageFunction, DockerImageCode, FunctionUrlAuthType, Architecture)
    - aws-cdk-lib/aws-ecr-assets (Platform.LINUX_AMD64)
    - aws-cdk-lib/aws-scheduler (Schedule, ScheduleExpression, ScheduleTargetInput)
    - aws-cdk-lib/aws-scheduler-targets (LambdaInvoke)
  patterns:
    - DockerImageCode.fromImageAsset with platform: Platform.LINUX_AMD64 for ARM Mac cross-compilation
    - bucket.grantReadWrite(fn, 'prefix/*') for scoped S3 permissions (two separate calls per prefix)
    - TimeZone imported from aws-cdk-lib (not aws-scheduler) in CDK 2.238.0
    - EventBridge Scheduler uses schedule: property (not expression:) in ScheduleProps

key-files:
  created:
    - data/Dockerfile
    - data/stub_handler.py
  modified:
    - infra/lib/beeatlas-stack.ts

key-decisions:
  - "TimeZone must be imported from aws-cdk-lib core, not aws-cdk-lib/aws-scheduler — confirmed against installed 2.238.0 types"
  - "Lambda Function URL auth type NONE — volunteer project, manual invocation only, no sensitive data"
  - "Nightly iNat at 08:00 UTC (midnight Pacific Standard), weekly full at Sunday 10:00 UTC"

patterns-established:
  - "Pattern: Use Platform.LINUX_AMD64 in fromImageAsset when deploying Lambda from ARM Mac"
  - "Pattern: Two separate grantReadWrite calls for prefix-scoped S3 permissions"
  - "Pattern: LambdaInvoke auto-creates the scheduler IAM role — no manual policy needed"

requirements-completed: [LAMBDA-03, LAMBDA-04, LAMBDA-05]

# Metrics
duration: 3min
completed: 2026-03-28
---

# Phase 25 Plan 01: CDK Infrastructure Summary

**CDK DockerImageFunction with S3-backed stub handler, two EventBridge Scheduler rules, and Lambda Function URL added to BeeAtlasStack; cdk synth passes with all required CloudFormation resources**

## Performance

- **Duration:** 3 min
- **Started:** 2026-03-28T15:39:23Z
- **Completed:** 2026-03-28T15:42:29Z
- **Tasks:** 3 (2 auto + 1 checkpoint auto-approved)
- **Files modified:** 3

## Accomplishments
- Created minimal Python 3.14 Dockerfile and stub handler in data/ for Lambda container build
- Added DockerImageFunction to BeeAtlasStack (15-min timeout, 1024 MB, 4 GB /tmp, reservedConcurrency=1)
- Wired prefix-scoped S3 grants (data/* and db/*) to Lambda execution role
- Added NightlyInatSchedule (08:00 UTC daily) and WeeklyFullSchedule (Sunday 10:00 UTC) via EventBridge Scheduler
- Added Lambda Function URL with NONE auth and CfnOutputs for URL and ARN
- cdk synth produces valid CloudFormation template with all required resources

## Task Commits

Each task was committed atomically:

1. **Task 1: Create Dockerfile and stub handler in data/** - `e7167b2` (feat)
2. **Task 2: Add Lambda, EventBridge Scheduler, and Function URL to BeeAtlasStack** - `cc6b3e2` (feat)
3. **Task 3: Verify CDK deploy and Lambda stub** - auto-approved checkpoint (no commit)

**Plan metadata:** (docs commit follows)

## Files Created/Modified
- `data/Dockerfile` - Minimal Python 3.14 Lambda container; COPY stub_handler.py, CMD stub_handler.handler
- `data/stub_handler.py` - S3 round-trip stub: download db/beeatlas.duckdb (graceful miss), verify /tmp/dlt write, upload db/stub-sentinel.txt
- `infra/lib/beeatlas-stack.ts` - Added 5 imports + Pipeline Lambda section with DockerImageFunction, S3 grants, two Schedules, Function URL, and two CfnOutputs

## Decisions Made
- TimeZone is imported from `aws-cdk-lib` (core), not `aws-cdk-lib/aws-scheduler` — the research file listed it in the scheduler module but the installed 2.238.0 type declarations confirm it lives in core. Fixed as deviation.
- Lambda Function URL auth type NONE — volunteer project, no sensitive data, simpler manual invocation
- Schedules set to nightly 08:00 UTC and weekly Sunday 10:00 UTC per research recommendations

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed incorrect TimeZone import path**
- **Found during:** Task 2 (BeeAtlasStack Lambda constructs)
- **Issue:** Plan and research listed `TimeZone` in the `aws-cdk-lib/aws-scheduler` import. TypeScript compiler error: "Module 'aws-cdk-lib/aws-scheduler' has no exported member 'TimeZone'"
- **Fix:** Moved `TimeZone` to separate import from `aws-cdk-lib` (the core module) — verified correct per installed node_modules/aws-cdk-lib/aws-scheduler/lib/schedule-expression.d.ts which imports it from '../../core'
- **Files modified:** infra/lib/beeatlas-stack.ts
- **Verification:** `npm run build` exits 0 after fix
- **Committed in:** cc6b3e2 (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (Rule 1 - Bug)
**Impact on plan:** Required for TypeScript compilation. No scope creep.

## Issues Encountered
- TypeScript import path for TimeZone was wrong in plan (research cross-checked at source declaration level). Fixed in < 1 min by checking node_modules type declarations.

## User Setup Required
**cdk deploy and Lambda invocation verification require AWS credentials.** The Task 3 checkpoint was auto-approved in auto mode. To complete the final verification:
1. `cd infra && npx cdk deploy` — deploys Lambda, Schedules, and Function URL to AWS
2. `curl -s -o /dev/null -w "%{http_code}" <PipelineFunctionUrl>` — must return 200
3. CloudWatch logs must contain "S3 round-trip complete"
4. EventBridge Scheduler console must show NightlyInatSchedule and WeeklyFullSchedule

## Next Phase Readiness
- Lambda infrastructure deployed; stub proves IAM permissions and /tmp access end-to-end
- Phase 26 will replace stub_handler.py with real pipeline code (data/run.py as handler)
- Phase 26 will expand Dockerfile with full pip install of pipeline dependencies
- CloudFront invalidation on data/* will be added in Phase 26 after export

---
*Phase: 25-cdk-infrastructure*
*Completed: 2026-03-28*
