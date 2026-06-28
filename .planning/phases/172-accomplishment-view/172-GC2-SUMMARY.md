---
phase: 172
plan: GC2
subsystem: frontend/data-pipeline
tags: [collector-pages, svg-maps, css-highlight, static-hosting]
dependency_graph:
  requires: [172-GC1, collectors_export]
  provides: [inline-coverage-maps]
  affects: [collector-detail.njk, places.css, data/run.py, data/nightly.sh]
tech_stack:
  added: []
  patterns: [committed-svg-partials, css-attribute-selector-highlight, aria-hidden-inline-svg]
key_files:
  created:
    - data/build_coverage_basemaps.py
    - _includes/maps/counties-base.svg
    - _includes/maps/ecoregions-base.svg
    - data/tests/test_build_coverage_basemaps.py
  modified:
    - _pages/collector-detail.njk
    - src/styles/places.css
    - data/run.py
    - data/nightly.sh
  deleted:
    - data/collector_maps.py
    - data/tests/test_collector_maps.py
decisions:
  - Committed base-map SVGs in _includes/maps/ (not public/data/) so Eleventy include resolves without S3 fetch
  - CSS [data-region=...] attribute selectors scope to .coverage-county/.coverage-eco wrappers to prevent cross-map highlighting
  - ECO_TOLERANCE=0.05 (5 km) achieves 16 KB ecoregion partial from 4 MB source (99.6% reduction)
  - aria-hidden="true" on inline SVG root; parent div carries role="img" aria-label="..." for a11y
  - Each ecoregion FEATURE rendered as a separate path (multiple paths per NA_L3NAME for island archipelagos)
metrics:
  duration: ~35 minutes
  completed: 2026-06-28
  tasks_completed: 5
  files_changed: 10
---

# Phase 172 GC2: Shared Coverage Base-Map Partials

Redesigned collector coverage maps: replaced 248 per-collector SVG files (~122 MB delivered via S3) with two committed SVG base-map partials highlighted per-collector via CSS.

## What was built

**`data/build_coverage_basemaps.py`** — Run-once committed generator (not in run.py STEPS or nightly.sh). Reads WA county polygons from `geographies.us_counties` (DuckDB, tolerance 0.005) and ecoregion polygons from `public/data/ecoregions.geojson` (aggressive tolerance 0.05). Outputs:

- **`_includes/maps/counties-base.svg`** — 39 county paths, 44,066 bytes. Each `<path class="region" data-region="<county_name>">`.
- **`_includes/maps/ecoregions-base.svg`** — 66 paths (9 unique NA_L3NAME values, multiple features for Puget Sound islands), 16,889 bytes. Each `<path class="region" data-region="<NA_L3NAME>">`.

Both SVGs have `aria-hidden="true"` on the root element.

**`_pages/collector-detail.njk`** — Two per-collector `<style>` blocks emit CSS attribute selectors:
```css
.coverage-county [data-region="King"], .coverage-county [data-region="Yakima"] { fill: #b0cfe8; }
.coverage-eco [data-region="Columbia Plateau"] { fill: #b0cfe8; }
```
The base SVG is included inline via `{% include "maps/counties-base.svg" %}`. The wrapping `<div role="img" aria-label="County coverage map for {name} — {N} counties">` provides accessibility. No JavaScript.

Also fixed: species list uses `sp.name` (cased scientificName, from Pass 1 data) instead of `sp.canonical_name`; per-species count removed per UAT round 1.

**`src/styles/places.css`** — Replaced dead `img[src*="/collector-maps/"]` rule with `.map-block svg { width:100%; height:auto; display:block; }`. Removed unused `.count` rule.

**Pipeline cleanup**: `data/collector_maps.py` deleted; `data/run.py` import and STEPS entry removed; `data/nightly.sh` S3 recursive copy and CloudFront invalidation path removed.

**`data/tests/test_build_coverage_basemaps.py`** — 15 tests replacing the old 8-test collector-maps suite. Includes a weight regression guard: ecoregions-base.svg must be < 200 KB when built from the real ecoregions.geojson (passes at 16,889 bytes).

## Emitted partial byte sizes

| Partial | Byte size | vs. per-collector SVG |
|---------|------------|----------------------|
| counties-base.svg | 44,066 bytes | 1 file replaces 124 per-collector county SVGs (~71 KB each) |
| ecoregions-base.svg | 16,889 bytes | 1 file replaces 124 per-collector ecoregion SVGs (~1.3 MB each) |

## Test and build results

```
pytest -m "not integration": 281 passed, 9 skipped (all expected skips)
npm test (Vitest): 897 passed
npm run build: 2174 files written, 0 errors
```

## Deviations from Plan

### Auto-fixed Issues

None — plan executed as specified with one deviation documented below.

### Local data note (not a code issue)

Local `public/data/collectors.json` had stale data (`county_names: null`) from before Pass 1. Regenerated locally with `uv run python collectors_export.py` to verify CSS highlight generation. In production, nightly pipeline regenerates with proper arrays.

## Known Stubs

None — both base maps contain full WA geometry and the per-collector CSS highlights are conditionally generated from `collector.county_names` / `collector.ecoregion_names` arrays in collectors.json.

## Threat Flags

None — no new network endpoints or auth paths introduced. The SVG partials are committed static files in `_includes/`, never user-supplied input.

## Self-Check: PASSED

- [x] `_includes/maps/counties-base.svg` exists — FOUND
- [x] `_includes/maps/ecoregions-base.svg` exists — FOUND
- [x] `data/build_coverage_basemaps.py` exists — FOUND
- [x] `data/tests/test_build_coverage_basemaps.py` exists — FOUND
- [x] Commit c09d4c02 (base map partials + generator) — FOUND
- [x] Commit 2def26e6 (template + CSS) — FOUND
- [x] Commit 46ea7ba9 (pipeline cleanup) — FOUND
- [x] Commit 927a187d (test replacement) — FOUND
- [x] Build GREEN (2174 files, 0 errors)
- [x] pytest 281 passed
- [x] Vitest 897 passed
