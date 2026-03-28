---
phase: 26-lambda-handler-dockerfile
plan: 01
subsystem: infra
tags: [lambda, boto3, duckdb, cloudfront, dlt, dockerfile, uv, aws]

requires:
  - phase: 25-cdk-infrastructure
    provides: Lambda DockerImageFunction stub, CDK stack with S3 bucket and CloudFront distribution

provides:
  - Real Lambda handler with S3 DuckDB download, pipeline dispatch (nightly/full), export upload, DuckDB backup, CloudFront invalidation
  - Production multi-stage Dockerfile using uv with all geospatial and dlt dependencies
  - All five pipeline modules read DB_PATH, EXPORT_DIR, GEOGRAPHY_CACHE_DIR from env vars
  - CDK stack with DISTRIBUTION_ID, DB_PATH, EXPORT_DIR, GEOGRAPHY_CACHE_DIR env vars and cloudfront:CreateInvalidation IAM

affects: [deploy, ci, pipeline-execution]

tech-stack:
  added: [boto3]
  patterns:
    - os.environ.get('VAR', local_default) for all pipeline module paths — enables Lambda and local dev simultaneously
    - uv multi-stage Docker build using ghcr.io/astral-sh/uv image + public.ecr.aws/lambda/python:3.14 base
    - Handler dispatches pipeline steps from STEPS list in run.py via dict lookup

key-files:
  created: []
  modified:
    - data/stub_handler.py
    - data/Dockerfile
    - data/export.py
    - data/ecdysis_pipeline.py
    - data/inaturalist_pipeline.py
    - data/projects_pipeline.py
    - data/geographies_pipeline.py
    - data/pyproject.toml
    - data/uv.lock
    - infra/lib/beeatlas-stack.ts

key-decisions:
  - "Handler imports STEPS from run.py dynamically (inside handler function) to avoid circular import at module load time"
  - "FULL_STEPS (6) vs NIGHTLY_STEPS (5) dispatch — 'full' is the default for unknown modes"
  - "Both Function URL event shape (body field) and direct invocation (raw dict) handled in one parser"
  - "EXPORT_DIR constant in handler matches DB_PATH env var passed to all pipeline modules — single source of truth"

patterns-established:
  - "Env var pattern: os.environ.get('DB_PATH', str(Path(__file__).parent / 'beeatlas.duckdb'))"
  - "Dockerfile: multi-stage uv build with --mount=type=bind for lockfile-based reproducible install"

requirements-completed: [PIPE-11, PIPE-12, PIPE-13, PIPE-14]

duration: 3min
completed: 2026-03-28
---

# Phase 26 Plan 01: Lambda Handler + Dockerfile Summary

**Real Lambda handler replacing stub: S3 DuckDB download, dlt pipeline dispatch (nightly/full modes), four-file export upload, DuckDB backup, and CloudFront /data/* invalidation with production multi-stage uv Dockerfile**

## Performance

- **Duration:** ~3 min
- **Started:** 2026-03-28T18:05:24Z
- **Completed:** 2026-03-28T18:08:51Z
- **Tasks:** 2 auto + 1 checkpoint (auto-approved)
- **Files modified:** 10

## Accomplishments

- Replaced stub handler with real pipeline orchestrator supporting `inat` (5-step) and `full` (6-step) modes
- All five pipeline modules now read DB_PATH/EXPORT_DIR/GEOGRAPHY_CACHE_DIR from env vars with local-dev fallback
- Dockerfile expanded to multi-stage uv build — installs all geospatial and dlt dependencies via lockfile
- CDK stack updated with four new Lambda env vars and CloudFront invalidation IAM permission

## Task Commits

Each task was committed atomically:

1. **Task 1: Env-var-ize pipeline modules and expand Dockerfile** - `88b05eb` (feat)
2. **Task 2: Replace stub handler and update CDK stack** - `c233d18` (feat)
3. **Task 3: Deploy and verify** - checkpoint:human-verify (auto-approved; deploy requires operator)

## Files Created/Modified

- `data/stub_handler.py` - Real handler: S3 download, pipeline dispatch, export upload, DuckDB backup, CF invalidation
- `data/Dockerfile` - Multi-stage uv build with Python 3.14 Lambda base image; all deps via lockfile
- `data/export.py` - DB_PATH and EXPORT_DIR from env vars (was hardcoded to frontend/src/assets)
- `data/ecdysis_pipeline.py` - DB_PATH from env var; added `import os`
- `data/inaturalist_pipeline.py` - DB_PATH from env var; added `import os`
- `data/projects_pipeline.py` - DB_PATH from env var; added `import os`
- `data/geographies_pipeline.py` - DB_PATH and CACHE_DIR from env vars; added `import os`
- `data/pyproject.toml` - Added boto3 dependency
- `data/uv.lock` - Updated with boto3 and transitive deps
- `infra/lib/beeatlas-stack.ts` - DISTRIBUTION_ID, DB_PATH, EXPORT_DIR, GEOGRAPHY_CACHE_DIR env vars; CloudFront IAM policy

## Decisions Made

- Handler dispatches from `run.STEPS` list via dict lookup — reuses existing orchestration contract without duplication
- `from run import STEPS` placed inside handler function to avoid import-time side effects
- Default pipeline mode is `full` (safe fallback: runs all 6 steps if mode is unrecognized)
- Both Function URL (`body` field) and direct EventBridge invocation shapes handled in a single payload parser

## Deviations from Plan

None - plan executed exactly as written. Note: the merge of `dlt` branch into the worktree branch was needed to access the phase 26 files (worktree was based on an older commit).

## Issues Encountered

- Worktree was initialized from an older branch (pre-dlt), so the pipeline files (stub_handler.py, run.py, etc.) were absent. Resolved by merging the `dlt` branch into the worktree branch before executing tasks.

## User Setup Required

Task 3 (deploy and verify) is a blocking human-verify checkpoint. The operator must:

1. Run `cd infra && npx cdk deploy --require-approval never`
2. Seed DuckDB: `aws s3 cp data/beeatlas.duckdb s3://BUCKET/db/beeatlas.duckdb`
3. Invoke Lambda URL and verify S3 exports + CloudFront invalidation

See Task 3 in the plan for detailed verification steps.

## Next Phase Readiness

- Lambda handler is production-ready pending CDK deploy
- All pipeline modules are env-var-aware — can be tested locally with default paths
- After deploy and verification, v1.7 pipeline infrastructure is complete

---
*Phase: 26-lambda-handler-dockerfile*
*Completed: 2026-03-28*
