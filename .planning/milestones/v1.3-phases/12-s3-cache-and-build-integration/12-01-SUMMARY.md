---
phase: 12-s3-cache-and-build-integration
plan: "01"
subsystem: infra
tags: [aws, s3, bash, cache, ci]

# Dependency graph
requires:
  - phase: 11-links-pipeline
    provides: links.parquet and data/raw/ecdysis_cache/ HTML files to persist
provides:
  - S3 cache restore script for links pipeline (links.parquet + HTML cache)
  - S3 cache upload script for links pipeline (links.parquet + HTML cache)
affects: [ci, build-data.sh, links-pipeline]

# Tech tracking
tech-stack:
  added: []
  patterns: [aws s3 cp for single files with graceful miss, aws s3 sync for directories with --exclude/--include filtering]

key-files:
  created:
    - scripts/cache_restore_links.sh
    - scripts/cache_upload_links.sh
  modified: []

key-decisions:
  - "Used aws s3 sync with --exclude '*' --include '*.html' to sync only HTML files, not arbitrary cache directory contents"
  - "Restore uses graceful miss (|| echo) for both links.parquet and ecdysis_cache; upload fails fast if links.parquet missing"

patterns-established:
  - "Cache scripts follow existing pattern: set -euo pipefail, BUCKET from env, DATA_DIR from dirname"
  - "mkdir -p before aws s3 sync to ensure local target directory exists"

requirements-completed: [LCACHE-01, LCACHE-02]

# Metrics
duration: 3min
completed: 2026-03-11
---

# Phase 12 Plan 01: S3 Cache Scripts for Links Pipeline Summary

**Two bash scripts providing S3 cache persistence for links.parquet and ecdysis HTML files, enabling incremental CI runs for the links pipeline.**

## Performance

- **Duration:** 3 min
- **Started:** 2026-03-12T02:55:00Z
- **Completed:** 2026-03-12T02:56:27Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments
- cache_restore_links.sh restores links.parquet from S3 with graceful miss and syncs HTML cache directory from S3
- cache_upload_links.sh uploads links.parquet to S3 and syncs HTML cache directory to S3
- Both scripts follow identical patterns to existing cache_restore.sh and cache_upload.sh

## Task Commits

Each task was committed atomically:

1. **Task 1: Create cache_restore_links.sh** - `680f9d9` (feat)
2. **Task 2: Create cache_upload_links.sh** - `88060d0` (feat)

**Plan metadata:** (docs commit follows)

## Files Created/Modified
- `scripts/cache_restore_links.sh` - Restores links.parquet (graceful miss) and syncs ecdysis HTML cache from S3
- `scripts/cache_upload_links.sh` - Uploads links.parquet and syncs ecdysis HTML cache to S3

## Decisions Made
- Used `aws s3 sync --exclude '*' --include '*.html'` to filter only HTML files when syncing ecdysis_cache, consistent with the plan spec
- Restore includes `mkdir -p` before sync to ensure destination directory exists before aws s3 sync runs

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- Both cache scripts are executable and syntax-verified
- Ready for integration into CI workflow (plan 12-02)
- S3_BUCKET_NAME environment variable must be set in CI for scripts to function

---
*Phase: 12-s3-cache-and-build-integration*
*Completed: 2026-03-11*
