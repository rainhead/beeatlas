---
phase: 172-accomplishment-view
plan: "04"
subsystem: frontend-template
tags: [accomplishments, collectors, template, css, pipeline, wave-2]
dependency_graph:
  requires: [172-02-collectors-export-extended, 172-03-collector-maps-generator]
  provides: [172-04-end-to-end-wired]
  affects: [_pages/collector-detail.njk, src/styles/places.css, data/run.py, data/nightly.sh]
tech_stack:
  added: []
  patterns: [nunjucks-guard-pattern, stable-url-s3-delivery, run-py-steps-registration]
key_files:
  created: []
  modified:
    - _pages/collector-detail.njk
    - src/styles/places.css
    - data/run.py
    - data/nightly.sh
decisions:
  - "Badge inserted after existing specimen/sample/species metadata line, before status-split — matches UI-SPEC page layout order"
  - "Coverage section placed after atlas link and before event feed comment — UI-SPEC insertion point"
  - "collector-maps/ S3 upload added alongside feeds/species-maps/place-maps with same --recursive --no-progress pattern"
  - "/data/collector-maps/* appended to existing CloudFront --paths list on one command (no new aws call)"
  - "No manifest.json or deploy.yml change — D-02 stable-URL delivery, not manifest pattern"
metrics:
  duration: "~3 minutes"
  completed: "2026-06-28"
  tasks_completed: 2
  tasks_total: 2
  files_changed: 4
---

# Phase 172 Plan 04: End-to-End Wire — Template, CSS, run.py, nightly.sh

Wired Phase 172 accomplishment data to the collector page: badge "Active since YYYY (N seasons)", two coverage SVG maps side-by-side, genus-grouped species list with /species/{slug}/ links, plus pipeline registration and S3 delivery.

## What Was Built

**Task 1: collector-detail.njk + places.css**

Extended `_pages/collector-detail.njk` with three new sections:

1. **Active-seasons badge** — `<p class="metadata">Active since {{ collector.active_since }} ({{ collector.seasons_count | quantify("season") }})</p>` guarded on `collector.active_since` truthy. Inserted after the existing specimen/sample/species metadata line and before the status-split paragraph (locked copy D-05 — "seasons" not "years").

2. **Coverage section** — `<section class="coverage-section">` containing `<div class="coverage-maps">` with two `<div class="map-block">` entries: county map `<img loading="lazy" src="/data/collector-maps/{{ collector.login }}.svg" alt="County coverage map for ...">` and ecoregion map `<img loading="lazy" src="/data/collector-maps/{{ collector.login }}-eco.svg" alt="Ecoregion coverage map for ...">`. Each map block includes a `<p class="metadata">` caption via `quantify`. Section guarded on `county_count > 0 or ecoregion_count > 0`; individual map blocks guarded on their respective counts. Alt text format locked by UI-SPEC.

3. **Species section** — `<section class="species-section">` with `<h2>Species collected</h2>` and a `<div class="species-by-genus">` loop over `collector.species_by_genus`. Each genus group renders `<h3 class="genus-heading"><em>{{ genus_group.genus }}</em></h3>` and a `<ul class="species-list">` of species links `<a href="/species/{{ sp.slug }}/">` with `<span class="count">({{ sp.count }})</span>`. Section guarded on `species_by_genus.length > 0`.

Added 9 selectors to `src/styles/places.css` (Phase 172 block, clearly commented):
- `.places-page img[src*="/collector-maps/"]` — aspect-ratio 15/8, width 100%, max-width 600px
- `.coverage-section` — margin-top 1.5rem
- `.coverage-maps` — flex column; grid 1fr 1fr at min-width 768px (with align-items: start)
- `.species-section` — margin-top 1.5rem
- `.genus-section` — margin-bottom 1rem
- `.genus-heading` — 1rem, weight 700, italic, --text-body
- `.species-section .species-list` — list-style none, margin/padding reset
- `.species-section .species-list li` — flex baseline, 0.5rem gap, 0.25rem padding, bottom border
- `.species-section .species-list .count` — margin-left auto, 0.85rem, --text-muted

**Task 2: run.py + nightly.sh**

Added `from collector_maps import generate_collector_maps_step` import to `data/run.py` alongside the other step imports. Inserted `("collector-maps", generate_collector_maps_step)` into STEPS immediately after `("collectors-events-export", ...)` and before `("places-maps", ...)`. Updated the module docstring pipeline order comment.

Added a recursive S3 upload to `data/nightly.sh`:
```
aws --profile "$AWS_PROFILE" s3 cp --recursive --no-progress "$EXPORT_DIR/collector-maps/" "s3://$BUCKET/data/collector-maps/"
```
Updated the comment from "Feeds, species-maps, and place-maps" to include "collector-maps". Appended `/data/collector-maps/*` to the existing CloudFront `create-invalidation --paths` list on the same command invocation.

No manifest.json change. No deploy.yml change. SVGs are stable-URL S3 runtime `<img>` sources, identical delivery mechanism to `species-maps/` and `place-maps/` (D-02).

## Verification

- `npm run build` GREEN (tsc --noEmit + Eleventy + Vite) — template + CSS compile, 2174 files written
- `npm test` GREEN — 896/896 passed (33 test files)
- `cd data && uv run pytest -m "not integration" -q` GREEN — 271 passed, 9 skipped
- Wave-2 gate: both suites GREEN per `feedback_run_tests_before_push`

## Deviations from Plan

None — plan executed exactly as written.

## Known Stubs

None. All four accomplishment elements are wired end-to-end from `collectors.json` fields to the HTML. The `collector-maps/` SVGs are generated by `collector_maps.py` (Plan 03) and will land in S3 on the first nightly run that includes the Phase 172 code. Browser renders `alt` text if SVG is absent (S3 delivery gap) — no additional error state needed (UI-SPEC).

## Threat Surface Scan

No new network endpoints, auth paths, or schema changes at trust boundaries. Template interpolation of `display_name`, `canonical_name`, `slug`, `login` is safe per T-172-XSS (Nunjucks auto-escapes; all values from trusted pipeline parquet). T-172-PATH mitigated upstream in `collector_maps.py` (Plan 03 `_LOGIN_RE`); template reuses the same `login` already used in the existing `permalink` `urlencode` route.

## Self-Check: PASSED

- `/Users/rainhead/dev/beeatlas/_pages/collector-detail.njk` — exists, contains `/data/collector-maps/{{ collector.login }}.svg` and `/species/{{ sp.slug }}/`
- `/Users/rainhead/dev/beeatlas/src/styles/places.css` — exists, contains `img[src*="/collector-maps/"]`
- `/Users/rainhead/dev/beeatlas/data/run.py` — exists, contains `generate_collector_maps_step`
- `/Users/rainhead/dev/beeatlas/data/nightly.sh` — exists, contains `collector-maps/` S3 cp + `/data/collector-maps/*` invalidation
- Commits: 895fe376 (Task 1), 8d3b298d (Task 2) — verified in git log
