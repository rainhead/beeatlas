---
phase: 082-hardening
plan: 03
subsystem: ui
tags: [eleventy, nunjucks, photos, srcset, responsive-images, perf]

# Dependency graph
requires:
  - phase: 079-photo-manifest
    provides: content/species-photos.toml with iNat photo URLs per species
  - phase: 080-species-page
    provides: _pages/species.njk hero img template, _data/photos.js loader
provides:
  - deriveSrcset(url) helper in _data/photos.js converting iNat size tokens to srcset
  - Photo decoration loop attaching src + srcset to every photo entry at build time
  - Species page hero img consuming srcset + sizes attributes for responsive delivery
affects:
  - 082-04 (Lighthouse runner — LCP budget depends on medium hero being selected)
  - 082-08 (UAT — will visually verify photo srcset behavior in DevTools)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "iNat URL size-token swap: SIZE_RE regex replaces /square|small|medium|large|original/ suffix for srcset generation without manifest schema change"
    - "Eleventy data decoration: photo entries enriched at build time with derived fields; templates read p.src/p.srcset without knowing the derivation source"

key-files:
  created: []
  modified:
    - _data/photos.js
    - _pages/species.njk
    - src/tests/data-photos.test.ts

key-decisions:
  - "deriveSrcset lives in _data/photos.js (not a Nunjucks filter) so the logic is testable in Vitest and the template stays declarative"
  - "p.url preserved alongside p.src on each photo object so templates have the canonical URL if needed"
  - "p.src or p.url fallback in template guards against any future loading order where decoration has not run"
  - "sizes='(min-width: 768px) 500px, 100vw' matches plan-02 layout spec (500px desktop hero, full viewport on mobile)"
  - "alt prefers p.caption over sp.scientificName for screen reader informativeness (PERF-05 partial)"

patterns-established:
  - "SIZE_RE pattern: /(square|small|medium|large|original)(\\.[a-zA-Z0-9]+)$ — safe size-token swap that preserves extension and handles all iNat variants"

requirements-completed: [PERF-03]

# Metrics
duration: 20min
completed: 2026-05-04
---

# Phase 82 Plan 03: Photo srcset (PERF-03 / D-09) Summary

**iNat photo srcset generation via URL size-token swap in _data/photos.js — medium hero default (500w) + square/small/medium descriptors; non-iNat URLs pass through without srcset**

## Performance

- **Duration:** ~20 min
- **Started:** 2026-05-04T23:40:00Z
- **Completed:** 2026-05-04T23:58:00Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments

- `deriveSrcset(url)` exported from `_data/photos.js`: regex-based iNat size-token swap producing `square 75w, small 240w, medium 500w` srcset; non-iNat URLs return `srcset: ''`
- Photo decoration loop in `_data/photos.js` maps every photo to attach `src` (medium) and `srcset` alongside the original `url`; handles large/original URLs by downgrading hero src to medium per D-09
- `_pages/species.njk` hero `<img>` updated to use `p.src or p.url` with conditional `srcset`/`sizes` emission; `alt` prefers `p.caption` over `sp.scientificName`
- Six `deriveSrcset` unit tests added to `src/tests/data-photos.test.ts` covering all behavior cases; all 9 tests in the file pass

## Task Commits

1. **Task 1: Add iNat-URL srcset helper to _data/photos.js and decorate every photo entry** - `e3db675` (feat + test)
2. **Task 2: Update _pages/species.njk hero img to consume srcset; audit alt + loading="lazy" coverage** - `33df36f` (feat)

## Files Created/Modified

- `_data/photos.js` — Added `deriveSrcset` export and photo decoration map step
- `_pages/species.njk` — Hero `<img>` now emits srcset/sizes; alt uses caption fallback
- `src/tests/data-photos.test.ts` — Six new deriveSrcset unit tests + one decoration integration test

## Decisions Made

- deriveSrcset is a named export so Vitest can import and unit-test it directly (avoids testing through Eleventy's data-module loader)
- `p.url` preserved alongside `p.src` — templates can still access the canonical URL; decoration is additive, not replacing
- Build verification was partial: `_data/photos.js` loaded successfully per Eleventy's import benchmark (149ms), but full `npm run build` cannot complete in the worktree due to missing `public/data/species.json` (pipeline artifact not in git). The build-output and data-species test failures are pre-existing worktree environment constraints, not regressions from this plan.

## Deviations from Plan

None — plan executed exactly as written. The TDD task wrote implementation and tests together (the test file already existed; tests were added to it). All `deriveSrcset` behavior cases from the plan's `<behavior>` spec are covered by tests.

## Issues Encountered

- `npm run build` cannot be fully verified in the worktree: `public/data/species.json` (a pipeline artifact) is absent, causing `_data/species.js` to fail. This is a pre-existing worktree constraint. Eleventy's output confirmed `_data/photos.js` imports successfully (149ms benchmark line). The `build-output.test.ts` and `data-species.test.ts` failures pre-date this plan and are not caused by these changes.
- Stub scan: no stubs introduced. `p.src or p.url` fallback is a safety guard, not a placeholder — `p.src` will always be set for any photo loaded through the decorated path.

## Known Stubs

None. The srcset derivation runs at Eleventy startup for all photos in the manifest.

## Threat Flags

None. No new network endpoints, auth paths, or schema changes. `_data/photos.js` reads a local TOML file and is build-time only.

## Next Phase Readiness

- PERF-03 satisfied: medium hero + srcset for iNat photos; loading="lazy" + non-empty alt on all photo `<img>` elements confirmed
- Lighthouse runner (plan 04) can now expect the correct-sized hero image to be selected by the browser on mobile, enabling LCP budget validation
- UAT plan 08 should verify in DevTools that the browser fetches medium (500px) on desktop and small (240px) on mobile viewport

## Self-Check

- `_data/photos.js` — FOUND (modified in place)
- `_pages/species.njk` — FOUND (modified in place)
- `src/tests/data-photos.test.ts` — FOUND (modified in place)
- Commit e3db675 — FOUND (verified via git log)
- Commit 33df36f — FOUND (verified via git log)

## Self-Check: PASSED

---
*Phase: 082-hardening*
*Completed: 2026-05-04*
