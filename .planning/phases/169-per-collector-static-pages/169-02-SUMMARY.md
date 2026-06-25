---
phase: 169-per-collector-static-pages
plan: 02
subsystem: frontend-eleventy
tags: [collectors, eleventy, nunjucks, vitest, static-pages, deep-link]
dependency_graph:
  requires:
    - public/data/collectors.json (Phase 169 Plan 01: committed artifact)
    - src/url-state.ts collectors= param (existing shipped filter)
    - src/styles/places.css (reused stylesheet)
    - src/lib/quantify.js (existing quantify filter)
  provides:
    - _data/collectors.js (Eleventy data loader)
    - _pages/collector-detail.njk (per-collector detail page)
    - _pages/collectors.njk (index roster at /collectors.html)
    - src/tests/data-collectors.test.ts (Vitest floor test)
  affects:
    - _site/collectors.html (generated)
    - _site/collectors/{login}/index.html (generated, 124 pages)
tech_stack:
  added: []
  patterns:
    - Eleventy pagination over JSON data (places pattern)
    - Nunjucks urlencode filter for URL param construction
    - Vitest floor test for build artifact shape
key_files:
  created:
    - _data/collectors.js
    - _pages/collector-detail.njk
    - _pages/collectors.njk
    - src/tests/data-collectors.test.ts
  modified: []
decisions:
  - "Reused places.css stylesheet (no new CSS needed — same visual structure)"
  - "species quantify uses explicit plural 'species' to prevent 'speciess' double-s regression"
  - "urlencode applied to both recordedBy and host_inat_login halves (Pitfall 5 / T-169-04 mitigation)"
  - "status split section hidden when status_denominator == 0 (sample-host-only collectors)"
metrics:
  duration_seconds: 180
  completed_date: "2026-06-25"
  tasks_completed: 3
  files_changed: 4
---

# Phase 169 Plan 02: Per-Collector Static Pages Summary

**One-liner:** Eleventy frontend over `collectors.json` — 124 bookmarkable `/collectors/{login}/` pages with headline stats, species-level ID status split, and `?collectors=` deep-link, plus a `/collectors.html` index roster and Vitest floor test.

## What Was Built

Four files deliver PAGE-01 through PAGE-04:

- `src/tests/data-collectors.test.ts` — Wave-0 RED test (5 assertions: array shape, length >= 100, field types, split invariant, no-parquet). Committed RED, turned GREEN after Task 2.
- `_data/collectors.js` — Eleventy data loader mirroring `_data/places.js` exactly: reads `public/data/collectors.json` (JSON only, never parquet), exports `{ collectorsArray }` for the cascade.
- `_pages/collector-detail.njk` — Per-collector detail page with trailing-slash permalink (`/collectors/{login}/`), H1 = `collector.display_name`, specimen/sample/species counts via `quantify`, status split (identified/awaiting, shown when denominator > 0), and `?collectors=<recordedBy>:<host_inat_login>` deep-link with `urlencode` on both halves.
- `_pages/collectors.njk` — Index roster at `/collectors.html` listing all 124 collectors with display name and specimen count, linking to each detail page.

## Tasks Completed

| Task | Name | Commit | Key Files |
|------|------|--------|-----------|
| 1 | Vitest data-shape + floor test (RED) | 55a9b6c4 | src/tests/data-collectors.test.ts |
| 2 | _data/collectors.js loader (GREEN) | b6d70841 | _data/collectors.js |
| 3 | collector-detail.njk + collectors.njk pages | 2142aec1 | _pages/collector-detail.njk, _pages/collectors.njk |

## Verification Results

- `npm test -- src/tests/data-collectors.test.ts`: 5/5 PASSED
- `npm test` full suite: 870/870 PASSED (33 test files)
- `npm run build`: succeeded, produced `_site/collectors.html` and 124 `_site/collectors/{login}/index.html` pages
- Built pages contain `?collectors=` deep-link: confirmed (`grep -rl "collectors=" _site/collectors/ | head -1`)
- Sample-host-only collectors (null recordedBy): produce valid `?collectors=:login` deep-link; status split hidden (denominator = 0)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed species pluralization producing "speciess"**
- **Found during:** Task 3 build verification
- **Issue:** `{{ collector.species_count | quantify("species") }}` rendered "108 speciess" because the `quantify` filter appends "s" by default and "species" is its own plural
- **Fix:** Changed to `{{ collector.species_count | quantify("species", "species") }}` passing the explicit plural form — matching the documented filter signature in `src/lib/quantify.js`
- **Files modified:** `_pages/collector-detail.njk`
- **Commit:** included in 2142aec1

## Known Stubs

None. All pages fully wired to real collectors.json data (committed in Plan 01).

## Threat Flags

No new security-relevant surface beyond the plan's threat model. T-169-04 mitigation applied: `urlencode` on both `recordedBy` and `host_inat_login` in the deep-link template.

## Self-Check

PASSED

- `_data/collectors.js` exists: YES (committed b6d70841)
- `_pages/collector-detail.njk` exists: YES (committed 2142aec1)
- `_pages/collectors.njk` exists: YES (committed 2142aec1)
- `src/tests/data-collectors.test.ts` exists: YES (committed 55a9b6c4)
- All 5 Vitest assertions GREEN: CONFIRMED (5/5 passed)
- Full test suite GREEN: CONFIRMED (870/870)
- Build produces `_site/collectors.html`: CONFIRMED
- Build produces 124 `_site/collectors/{login}/index.html` pages: CONFIRMED
- Built pages contain `?collectors=` deep-link: CONFIRMED
