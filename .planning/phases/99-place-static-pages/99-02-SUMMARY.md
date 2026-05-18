---
phase: 99-place-static-pages
plan: 2
subsystem: eleventy-templates, static-pages, places
tags: [eleventy, nunjucks, static-pages, places, vite-mpa, css]
requires: [99-01, Phase 98 completion for SVG maps]
provides: [_data/places.js data module, /places.html index page, /places/{slug}.html detail pages, src/styles/places.css]
affects:
  - _data/places.js
  - _pages/places.njk
  - _pages/place-detail.njk
  - src/styles/places.css
tech-stack:
  added: []
  patterns: [Eleventy data cascade, Nunjucks pagination size:1, Vite MPA CSS via link tag, base.njk layout for no-JS pages]
key-files:
  created:
    - _data/places.js
    - _pages/places.njk
    - _pages/place-detail.njk
    - src/styles/places.css
  modified: []
decisions:
  - "Used layout: base.njk (not default.njk) for place pages: default.njk injects <script type=\"module\"> for bee-header, violating D-09 — the test literally checks for 0 script[type=module] tags in the built output"
  - "SVG path is /data/place-maps/{slug}.svg (singular) — CONTEXT.md D-07 places-maps/ (plural with trailing s) is a typo confirmed by Phase 98 pipeline and RESEARCH.md Assumption A1"
  - "placesArray exported from _data/places.js in original pipeline order (no sort) — places.json is small and pipeline order is authoritative per plan spec"
  - "Comment in _data/places.js avoids the word 'parquet' (case-insensitive) since data-places.test.ts does a regex match on the source file"
metrics:
  duration_minutes: 4
  completed_date: "2026-05-18"
  tasks_completed: 3
  files_changed: 4
requirements-completed: [PPAGE-01, PPAGE-02]
---

# Phase 99 Plan 2: Implementation — Data Module, Templates, and CSS Summary

**One-liner:** Created `_data/places.js` JSON data module, `_pages/places.njk` index template, `_pages/place-detail.njk` detail template (Eleventy pagination size:1), and `src/styles/places.css` — turning all 11 RED tests from Plan 01 GREEN; `npm test` passes 395 tests.

## Tasks Completed

| # | Name | Commit | Files |
|---|------|--------|-------|
| 1 | Create _data/places.js data module | 7b84d95 | _data/places.js (new) |
| 2 | Create _pages/places.njk and _pages/place-detail.njk templates | 50d558e | _pages/places.njk (new), _pages/place-detail.njk (new) |
| 3 | Create src/styles/places.css and verify Vite MPA processes it | 66a41cd | src/styles/places.css (new) |

## What Was Built

**`_data/places.js`:** Minimal ESM module reading `public/data/places.json` via `readFileSync` at build time. Exports `{ placesArray }` as default. The Eleventy data cascade exposes this as the `places` global in all Nunjucks templates (`places.placesArray` for the array). Mirrors `_data/species.js` import pattern exactly. The comment avoids the word "parquet" (the `data-places.test.ts` test does a case-insensitive regex match against the source).

**`_pages/places.njk`:** Index page at `/places.html`. Uses `layout: base.njk` (see deviation below). Iterates `places.placesArray` to render a `<ul class="places-list">` with per-place `<li>` containing name link, owner span, and specimen count. References `src/styles/places.css` via `<link rel="stylesheet">` processed by Vite MPA. No `<script type="module">`.

**`_pages/place-detail.njk`:** Per-place detail at `/places/{slug}.html`. Uses Eleventy `pagination: { data: places.placesArray, size: 1, alias: place }` with `permalink: "/places/{{ place.slug }}.html"` (flat `.html` file, not trailing-slash directory). SVG map guarded by `{%- if place.specimen_count > 0 -%}` — current seed data has 0 specimens so no `<img>` is rendered. Deep-link: `<a href="/?place={{ place.slug }}">View occurrences on the atlas →</a>`. Dynamic title via `eleventyComputed`.

**`src/styles/places.css`:** CSS rules for both place pages. Vite MPA emits hashed `_site/assets/places-{hash}.css` and rewrites `<link>` URLs in both built pages. SVG img selector uses singular `/place-maps/` matching Phase 98 pipeline canonical path.

## Test Results

All 395 tests pass (`npm test`):
- 4 unit tests in `data-places.test.ts`: GREEN (was RED — `_data/places.js` did not exist)
- 7 build-output tests in `build-output.test.ts`: GREEN (was RED — templates did not exist)
- 22 pre-existing species/genus/subgenus/tribe tests: still GREEN (no regression)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Used base.njk instead of default.njk to satisfy D-09**
- **Found during:** Task 2 build verification
- **Issue:** The plan specified `layout: default.njk` for both templates, but `default.njk` injects `<script type="module" src="/src/entries/bee-header.ts">` into every page. Vite MPA processes this into 2 `<script type="module">` tags in the built output. The `build-output.test.ts` test from Plan 01 asserts `expect(html).not.toMatch(/<script\s+type="module"/)` — this would fail with `default.njk`.
- **Fix:** Switched both templates to `layout: base.njk`. `base.njk` is a pure HTML skeleton with `<head>` and `<body>` but no JavaScript injection. The place pages have no `bee-header` navigation chrome, which is consistent with D-09 ("Both places pages are fully static Nunjucks — no TypeScript entry point, no Vite bundle. No `<script type="module">` tag on either page").
- **Files modified:** `_pages/places.njk`, `_pages/place-detail.njk`
- **Commit:** 50d558e

### Canonical SVG Path Resolution

The plan and CONTEXT.md D-07 mention `/data/places-maps/` (plural "maps"). RESEARCH.md Assumption A1 and Pitfall 1 resolve this: Phase 98 pipeline writes to `public/data/place-maps/` (singular). Both templates and the CSS selector use the canonical singular path `/data/place-maps/`. The Plan 01 build-output test explicitly checks that neither `place-maps` nor `places-maps` appears in the HTML when `specimen_count == 0`, ensuring the typo cannot silently reintroduce itself.

## Forward Pointer

Phase 100 (Map & Filter Integration) will activate the `/?place={slug}` deep-link parameter in `bee-atlas.ts`. The `<a href="/?place={{ place.slug }}">` anchor written here is the entry point for that integration — currently a valid URL with no frontend handler.

## Known Stubs

None — all four files are fully wired. The SVG `<img>` guard (`specimen_count > 0`) is intentional behavior, not a stub: seed data has 0 specimens, and maps will appear once Phase 98 pipeline outputs SVG files and specimens are collected.

## Threat Flags

None — no new network endpoints, auth paths, file access patterns, or schema changes. Fully static HTML served from CDN.

## Self-Check: PASSED

Files confirmed present:
- _data/places.js: created ✓
- _pages/places.njk: created ✓
- _pages/place-detail.njk: created ✓
- src/styles/places.css: created ✓

Commits confirmed:
- 7b84d95: feat(99-02): create _data/places.js data module ✓
- 50d558e: feat(99-02): create _pages/places.njk and _pages/place-detail.njk templates ✓
- 66a41cd: feat(99-02): create src/styles/places.css stylesheet ✓

npm test: 395 tests passed, 0 failed ✓
