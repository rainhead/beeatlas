---
phase: 082-hardening
plan: "05"
subsystem: infra
tags: [github-actions, cron, inat, toml, fetch, photo-manifest]

requires:
  - phase: 079-photos
    provides: content/species-photos.toml manifest with photo URLs

provides:
  - scripts/check-photo-availability.mjs — HEAD-checker for every photo URL in the manifest
  - .github/workflows/photo-availability.yml — weekly cron that runs the checker and commits the drift report

affects: [082-hardening, photo-manifest, deploy]

tech-stack:
  added: []
  patterns:
    - "PHOTO-07-style isolation: operational scripts not wired into any package.json build/prebuild step"
    - "D-10 informational cron: always exit 0, write report, commit via bot token, skip CI on bot push"

key-files:
  created:
    - scripts/check-photo-availability.mjs
    - .github/workflows/photo-availability.yml
  modified: []

key-decisions:
  - "Report-only exit semantics: script and workflow both exit 0 regardless of failure count (D-10)"
  - "Rate pacing: 1000ms sleep between requests matches seed-species-photos.mjs (D-10)"
  - "Single retry on 5xx or network error with 2s backoff before recording failure (D-10)"
  - "Workflow commits with [skip ci] to avoid triggering deploy.yml rebuild"
  - "concurrency: cancel-in-progress: false — overlapping runs are queued, not cancelled"

patterns-established:
  - "Operational cron scripts live in scripts/ and are invoked by path from GH Actions, never via npm run"

requirements-completed: [PERF-04]

duration: 10min
completed: 2026-05-04
---

# Phase 82 Plan 05: Photo Availability Checker Summary

**Weekly GH Actions cron HEAD-checks every iNat photo URL in the manifest, writes data/manifest_drift_report.json, and always exits 0 — never blocks deploys (PERF-04/D-10)**

## Performance

- **Duration:** ~10 min
- **Started:** 2026-05-04T00:00:00Z
- **Completed:** 2026-05-04T00:10:00Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments

- Implemented `scripts/check-photo-availability.mjs`: reads `content/species-photos.toml` via `@iarna/toml`, HEADs each photo URL at <=1 req/sec, retries once on 5xx/network error with 2s backoff, writes `data/manifest_drift_report.json` with `{checked_at, total, failures}` shape, exits 0 unconditionally
- Implemented `.github/workflows/photo-availability.yml`: weekly Monday 13:00 UTC cron + `workflow_dispatch`, `concurrency: cancel-in-progress: false`, commits drift report if changed with `[skip ci]`, `permissions: contents: write`
- Script is not referenced in any `package.json` script (mirrors PHOTO-07 isolation invariant)

## Task Commits

1. **Task 1: Implement check-photo-availability.mjs** - `232a64d` (feat)
2. **Task 2: Add photo-availability.yml workflow** - `3888716` (feat)

## Files Created/Modified

- `scripts/check-photo-availability.mjs` - Rate-limited HEAD checker with retry, writes drift report, always exits 0
- `.github/workflows/photo-availability.yml` - Weekly cron workflow, commits drift report, no notifications

## Decisions Made

- Script exits 0 even on fatal error (TOML parse failure logged to stderr but does not fail the workflow) — single bad cron run is self-recovering given the weekly cadence
- `cancel-in-progress: false` chosen over `true` — informational runs should complete rather than be cancelled by a later trigger

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required. The workflow uses the built-in `GITHUB_TOKEN` for pushing the drift report commit.

## Next Phase Readiness

PERF-04 satisfied. The drift report will be populated on first Monday cron run. All other Phase 82 hardening plans are independent of this one.

---
*Phase: 082-hardening*
*Completed: 2026-05-04*
