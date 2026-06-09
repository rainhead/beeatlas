---
phase: 145-add-npm-and-python-deps-to-dependabot
plan: 01
subsystem: infra
tags: [dependabot, npm, uv, github-actions, dependency-management]

# Dependency graph
requires: []
provides:
  - Dependabot v2 config tracking npm (root), uv (data/), and github-actions, all weekly with minor+patch grouping
affects: []

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Dependabot grouped updates: minor+patch per ecosystem, major bumps ungrouped for isolated review"

key-files:
  created: []
  modified:
    - ".github/dependabot.yml"

key-decisions:
  - "uv ecosystem identifier (not legacy pip) for data/uv.lock project"
  - "Group names: actions-minor-patch, npm-minor-patch, python-minor-patch"
  - "All three ecosystems weekly; major bumps intentionally ungrouped for individual PRs"

patterns-established: []

requirements-completed: []

# Metrics
duration: 1min
completed: 2026-06-09
---

# Phase 145 Plan 01: Add npm + uv Dependabot entries Summary

**Dependabot v2 config extended with npm (root) and uv (data/) weekly update entries, each grouping minor+patch into one PR, with major bumps ungrouped; github-actions entry retrofitted with the same grouping.**

## Performance

- **Duration:** ~1 min
- **Started:** 2026-06-09T17:46:45Z
- **Completed:** 2026-06-09T17:47:30Z
- **Tasks:** 1 of 1
- **Files modified:** 1

## Accomplishments

- Added npm entry (`directory: "/"`) with weekly schedule and `npm-minor-patch` group covering `minor` + `patch` updates
- Added uv entry (`directory: "/data"`) with weekly schedule and `python-minor-patch` group covering `minor` + `patch` updates
- Retrofitted existing github-actions entry with `actions-minor-patch` group (D-05)
- All three entries leave major version bumps ungrouped for individually-reviewable PRs (D-03)
- `verify-dependabot.py` prints `ALL CHECKS PASS` — D-01..D-05 all satisfied

## Task Commits

Each task was committed atomically:

1. **Task 1: Add npm + uv entries and retrofit github-actions grouping** - `2a8bf1a` (chore)

**Plan metadata:** (docs commit below)

## Files Created/Modified

- `.github/dependabot.yml` - Extended from single github-actions entry to three entries (github-actions, npm, uv), each weekly with minor+patch grouping

## Decisions Made

- Used `uv` ecosystem identifier (not legacy `pip`) per D-02 — correct for a `uv.lock` project
- Group names chosen: `actions-minor-patch`, `npm-minor-patch`, `python-minor-patch` — descriptive and consistent
- Did not add `open-pull-requests-limit` — default 5 is sufficient
- Ordered entries: github-actions first (pre-existing), then npm, then uv — logical progression

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required. Dependabot runs on GitHub and will pick up the config automatically on next scheduled check.

## Next Phase Readiness

Phase 145 complete. Phase 146 (debounce URL/history writes during map zoom/pan) is the remaining phase in the v4.10 Housekeeping milestone.

---
*Phase: 145-add-npm-and-python-deps-to-dependabot*
*Completed: 2026-06-09*
