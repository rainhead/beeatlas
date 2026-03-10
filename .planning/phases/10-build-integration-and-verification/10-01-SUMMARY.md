---
phase: 10-build-integration-and-verification
plan: 01
subsystem: infra
tags: [github-actions, s3, aws, ci, cache]

# Dependency graph
requires:
  - phase: 09-inat-download-pipeline
    provides: cache_restore.sh, cache_upload.sh, build-data.sh, package.json scripts (cache-restore, cache-upload)
provides:
  - "CI build job wires S3 cache round-trip: cache-restore -> build -> cache-upload"
  - "S3_BUCKET_NAME env var available at job level in both build and deploy jobs"
  - "Deploy job credential ordering fixed (AWS creds configured before npm run build)"
affects: [ci, deploy, s3-cache]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Job-level env block for S3_BUCKET_NAME shared across all steps in a GitHub Actions job"
    - "Explicit named build steps (Restore S3 cache / Build / Upload S3 cache) instead of monolithic npm run build"

key-files:
  created: []
  modified:
    - .github/workflows/deploy.yml

key-decisions:
  - "Use job-level env: S3_BUCKET_NAME instead of step-level — cleaner and less repetitive"
  - "Apply same fix to both build and deploy jobs for consistency"
  - "Move Configure AWS credentials before Build in deploy job — was after Build (credential ordering bug)"

patterns-established:
  - "Cache round-trip pattern: restore -> build -> upload, all under same job-level env"

requirements-completed: [INAT-03]

# Metrics
duration: 5min
completed: 2026-03-10
---

# Phase 10 Plan 01: Build Integration and Verification Summary

**CI wired with S3 cache round-trip (cache-restore -> build -> cache-upload) and deploy job credential ordering fixed — S3_BUCKET_NAME available at job level in both jobs**

## Performance

- **Duration:** ~5 min
- **Started:** 2026-03-10T22:53:13Z
- **Completed:** 2026-03-10T22:58:00Z
- **Tasks:** 1 of 2 (Task 2 is human-verify checkpoint — awaiting CI verification)
- **Files modified:** 1

## Accomplishments
- Added job-level `env: S3_BUCKET_NAME` to both `build` and `deploy` jobs
- Split monolithic `npm run build` into three named steps in both jobs: Restore S3 cache / Build / Upload S3 cache
- Fixed credential ordering bug in `deploy` job: moved Configure AWS credentials step before Build

## Task Commits

Each task was committed atomically:

1. **Task 1: Update deploy.yml — wire cache scripts and fix credential ordering** - `0eca29b` (feat)

## Files Created/Modified
- `.github/workflows/deploy.yml` - Added S3 cache round-trip steps and fixed deploy job credential ordering

## Decisions Made
- Job-level `env:` for `S3_BUCKET_NAME` rather than per-step — avoids repetition across three steps per job
- Both `build` and `deploy` jobs get the same treatment (cache-restore/build/cache-upload) for consistency
- No other changes to the workflow — permissions blocks, action versions, `needs: build`, `if:` condition, sync and invalidate steps preserved exactly

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None. YAML structure verification passed immediately after writing the file.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- `deploy.yml` is updated and committed; push to origin and watch CI to confirm both jobs pass green
- On push to main: build job will run cache-restore (cold miss on first run, prints "not in cache"), do full iNat fetch, write samples.parquet, upload cache; deploy job will do incremental fetch (fast, cache just uploaded by build job)
- Awaiting Task 2 checkpoint: CI green verification before plan is fully complete

---
*Phase: 10-build-integration-and-verification*
*Completed: 2026-03-10*
