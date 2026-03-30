---
phase: 29-ci-simplification
plan: 01
subsystem: infra
tags: [github-actions, ci, hyparquet, cloudfront, parquet]

# Dependency graph
requires:
  - phase: 28-frontend-runtime-fetch
    provides: CloudFront /data/ endpoint with CORS + Range header support
provides:
  - Frontend-only CI build job (no AWS credentials, no pipeline steps)
  - validate-schema.mjs fetching parquet schema via CloudFront Range requests
affects: []

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "validate-schema auto-detects local vs CloudFront parquet using existsSync"
    - "asyncBufferFromUrl({ url }) object form for hyparquet Range-based fetch"

key-files:
  created: []
  modified:
    - scripts/validate-schema.mjs
    - .github/workflows/deploy.yml
    - package.json
  deleted:
    - .github/workflows/fetch-data.yml

key-decisions:
  - "asyncBufferFromUrl requires object { url } arg, not string — hyparquet API quirk"
  - "Build job permissions: contents: read only (no id-token: write)"
  - "validate-schema CloudFront mode: no AWS credentials needed (public endpoint)"

patterns-established:
  - "CI build job: checkout -> setup-node -> npm ci -> validate-schema -> build frontend -> upload artifact"

requirements-completed: [CI-01, CI-02]

# Metrics
duration: 15min
completed: 2026-03-29
---

# Phase 29 Plan 01: CI Simplification Summary

**CI build job stripped of all AWS/pipeline steps; validate-schema.mjs fetches parquet schema via CloudFront Range requests when no local files present**

## Performance

- **Duration:** ~15 min
- **Started:** 2026-03-29
- **Completed:** 2026-03-29
- **Tasks:** 2
- **Files modified:** 3 (+ 1 deleted)

## Accomplishments

- `validate-schema.mjs` auto-detects local parquet; falls back to CloudFront Range requests using `asyncBufferFromUrl` — no AWS credentials required
- `deploy.yml` build job reduced to 6 steps: checkout, setup-node, npm ci, validate-schema, build frontend, upload artifact
- `fetch-data.yml` deleted (pipeline runs on maderas cron, not CI)
- Root `build` script changed to frontend-only (`npm run build --workspace=frontend`); `build:data` kept for local dev

## Task Commits

1. **Task 1: Update validate-schema.mjs** - `f2e654e` (feat)
2. **Task 2: Simplify deploy.yml, delete fetch-data.yml, update build script** - `1781d14` (feat)

## Files Created/Modified

- `scripts/validate-schema.mjs` - Added CloudFront Range-request fallback with local-file auto-detection
- `.github/workflows/deploy.yml` - Removed AWS credentials, S3_BUCKET_NAME, id-token:write, cache-restore from build job
- `package.json` - Root build script now frontend-only
- `.github/workflows/fetch-data.yml` - DELETED (pipeline moved to maderas cron)

## Decisions Made

- `asyncBufferFromUrl` requires `{ url: string }` object argument, not a bare string (hyparquet API) — discovered during verification
- Build job permissions set to `contents: read` only; no `id-token: write` needed without AWS steps
- CloudFront `/data/` endpoint is public; validate-schema needs no credentials

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] asyncBufferFromUrl requires object argument**
- **Found during:** Task 1 verification (`node scripts/validate-schema.mjs`)
- **Issue:** Plan's code template passed URL as bare string; hyparquet throws "missing url" when not given `{ url }` object
- **Fix:** Changed `asyncBufferFromUrl(CLOUDFRONT_BASE + filename)` to `asyncBufferFromUrl({ url: CLOUDFRONT_BASE + filename })`
- **Files modified:** `scripts/validate-schema.mjs`
- **Verification:** `node scripts/validate-schema.mjs` exits 0, prints `ok ecdysis.parquet` and `ok samples.parquet`
- **Committed in:** `f2e654e` (Task 1 commit)

---

**Total deviations:** 1 auto-fixed (1 bug — wrong argument type)
**Impact on plan:** Necessary fix; no scope creep.

## Issues Encountered

None beyond the auto-fixed API argument issue above.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

Phase 29 complete. All CI simplification goals achieved:
- Build job has no AWS dependencies
- Schema validation uses CloudFront (no S3 credentials needed)
- fetch-data.yml removed
- maderas cron owns pipeline execution

No blockers. v1.7 milestone CI simplification is done.

---
*Phase: 29-ci-simplification*
*Completed: 2026-03-29*
