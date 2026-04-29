---
phase: 074-eleventy-build-wrapper
plan: 02
subsystem: infra
tags: [ci, github-actions, deploy, eleventy, vite, s3]

# Dependency graph
requires:
  - phase: 074-eleventy-build-wrapper
    provides: 074-01 hoist (single-package layout, `_site/` build output)
provides:
  - CI build job runs root `npm test` and `npm run build` (no workspace flag)
  - Build artifact uploaded from `_site/` as `site` (renamed from `frontend-dist`)
  - Deploy job downloads artifact to `_site/` and runs both `aws s3 sync` commands from there
affects: [074-03 (UAT confirms green CI run on push)]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Single-package CI invocations (no `--workspace=` flags) after the v3.1 collapse"

key-files:
  created: []
  modified:
    - ".github/workflows/deploy.yml (8 string edits, 10 lines changed)"

key-decisions:
  - "Renamed artifact from `frontend-dist` to `site` for layout coherence (matches the new `_site/` output dir; `frontend-dist` referenced a directory that no longer exists)."
  - "Renamed build job + step labels from `Build frontend` to `Build site` so the workflow contains zero `frontend` references — the strict `! grep frontend` post-condition catches any reintroduction."

patterns-established:
  - "deploy.yml is single-source for build/deploy paths; future output-dir changes require synchronized edits at four `_site/` references (upload path, download path, two sync sources)."

requirements-completed: [ELEV-04]

# Metrics
duration: ~5 min
completed: 2026-04-29
---

# Phase 74 Plan 02: Update CI deploy.yml for `_site/` build output — Summary

**CI build/deploy paths shifted from `frontend/dist/` to `_site/`; `--workspace=frontend` flags dropped; artifact renamed `frontend-dist` → `site`; cache-control rules and OIDC/CloudFront/Lighthouse blocks byte-identical to before.**

## Performance

- **Duration:** ~5 min
- **Tasks:** 1 (8 string edits in one file)
- **Files modified:** 1

## Accomplishments

- Build job and step labels renamed from `Build frontend` to `Build site`.
- `npm test` and `npm run build` invocations no longer use `--workspace=frontend`.
- Upload artifact `name`/`path`: `frontend-dist`/`frontend/dist/` → `site`/`_site/`.
- Download artifact `name`/`path`: `frontend-dist`/`frontend/dist/` → `site`/`_site/`.
- Both `aws s3 sync` source paths updated: `frontend/dist/...` → `_site/...`.
- `VITE_MAPBOX_TOKEN` env block, cache-control rules, exclude lists, OIDC config, CloudFront invalidation, and Lighthouse audit job all unchanged.

## Task Commits

1. **Task 1: Edit deploy.yml for new layout** — `90ee2f5` (ci)

## Files Created/Modified

- `.github/workflows/deploy.yml` — 10 insertions, 10 deletions; 8 logical edits.

## Diff Summary (BEFORE → AFTER)

| # | BEFORE | AFTER |
|---|--------|-------|
| 1 | `name: Build frontend` (job-level) | `name: Build site` |
| 2 | `run: npm test --workspace=frontend` | `run: npm test` |
| 3 | `- name: Build frontend` (step) | `- name: Build site` |
| 4 | `run: npm run build --workspace=frontend` | `run: npm run build` |
| 5 | `name: frontend-dist` / `path: frontend/dist/` (upload) | `name: site` / `path: _site/` |
| 6 | `name: frontend-dist` / `path: frontend/dist/` (download) | `name: site` / `path: _site/` |
| 7 | `aws s3 sync frontend/dist/assets/ ...` | `aws s3 sync _site/assets/ ...` |
| 8 | `aws s3 sync frontend/dist/ ...` | `aws s3 sync _site/ ...` |

## Decisions Made

None beyond the planned 8 edits.

## Deviations from Plan

None — plan executed exactly as written.

## Issues Encountered

None.

## Next Phase Readiness

- CI workflow is structurally consistent with the new `_site/` layout. The push-to-branch UAT (does the build job actually run green on GitHub Actions?) is plan 03's responsibility.
- Plan 03 also handles the remaining doc updates (`CLAUDE.md`, `.planning/PROJECT.md` references to `cd frontend`) and the manual `npm run dev` SPA-renders-with-Mapbox-tiles UAT.

---

*Phase: 074-eleventy-build-wrapper*
*Completed: 2026-04-29*
