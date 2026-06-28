---
phase: 172-accomplishment-view
verified: 2026-06-28T11:35:00Z
status: passed
score: 5/5 must-haves verified
overrides_applied: 0
re_verification: false
---

# Phase 172: Accomplishment View — Verification Report

**Phase Goal:** The collector page shows a county coverage map, taxonomic-breadth species list, ecoregion breadth, and an "Active since YYYY (N seasons)" badge — all pre-aggregated in the pipeline, not computed in the browser.
**Verified:** 2026-06-28T11:35:00Z
**Status:** PASSED
**Re-verification:** No — initial verification

**Note on implementation divergence:** The shipped mechanism differs from the original plan-03/plan-04 prose, but was operator-approved in UAT round 2 (2026-06-28, status PASS). Coverage maps are delivered as two committed shared base-map SVG partials (`_includes/maps/counties-base.svg`, `_includes/maps/ecoregions-base.svg`) inlined into each collector page and highlighted by a per-collector CSS `<style>` block — not per-collector SVG files. All four aggregations use the Phase 170 `tier='atlas'` predicate. Verification is against the shipped, approved design.

---

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | County coverage SVG map on collector page, showing contributed counties | VERIFIED | `_includes/maps/counties-base.svg` (44 KB, 39 `data-region` attributes); template inlines it inside `.coverage-county` div with per-collector `<style>` CSS highlight block keyed on `county_names`; `county_count` caption rendered |
| 2 | Taxonomic-breadth species list, each species linked to its taxon page | VERIFIED | `collector-detail.njk` lines 75–93: `species_by_genus` renders genus headings (`<em>{{ genus_group.genus }}</em>`) + per-species `<a href="/species/{{ sp.slug }}/">{{ sp.name }}</a> — N specimens`; cased `scientificName` used (FIX B); per-species count restored (UAT round 2) |
| 3 | Ecoregion breadth displayed (distinct ecoregions, count and map) | VERIFIED | `_includes/maps/ecoregions-base.svg` (17 KB, 66 path elements for distinct ecoregions); template inlines inside `.coverage-eco` div with per-collector CSS highlight on `ecoregion_names`; `ecoregion_count` caption rendered |
| 4 | "Active since YYYY (N seasons)" badge, no streak/leaderboard wording | VERIFIED | Template line 35: `Active since {{ collector.active_since }} ({{ collector.seasons_count | quantify("season") }})`. Predicate is `tier='atlas'` COUNT(DISTINCT year) — includes uncatalogued atlas specimens (UAT FIX A). No streak or rank language present |
| 5 | All aggregations pre-computed in pipeline; no browser-side GROUP BY on collector page | VERIFIED | `collectors_export.py` runs three queries (`_QUERY`, `_ACCOM_QUERY`, `_SPECIES_QUERY`) at pipeline time and writes `collectors.json`; `collectors-export` step is in `run.py` STEPS list (line 135). Template reads from Eleventy static data file — no wa-sqlite, no browser SQL |

**Score:** 5/5 truths verified

---

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `data/collectors_export.py` | Pipeline export with ACCOM-01/02/03/04 fields | VERIFIED | `_ACCOM_QUERY` produces `active_since`, `seasons_count`, `county_names`, `county_count`, `ecoregion_names`, `ecoregion_count`; `_SPECIES_QUERY` produces `species_by_genus` with cased `name`, `slug`, `count`; predicate `tier='atlas'` throughout |
| `_includes/maps/counties-base.svg` | Committed shared county base map with `data-region` attributes | VERIFIED | 44 KB, single-line SVG; 39 path elements each with `data-region="<county name>"`; `aria-hidden="true"` on root; tracked in git |
| `_includes/maps/ecoregions-base.svg` | Committed shared ecoregion base map with `data-region` attributes | VERIFIED | 17 KB, single-line SVG; 66 path elements with `data-region` keyed on `NA_L3NAME`; `aria-hidden="true"` on root; tracked in git |
| `_pages/collector-detail.njk` | Template rendering all four accomplishment sections | VERIFIED | Lines 19–93: per-collector `<style>` CSS blocks for county/ecoregion highlight; coverage-section with two map-block divs; species-by-genus section; active-since badge |
| `data/build_coverage_basemaps.py` | Run-once generator for the committed base-map SVGs | VERIFIED | Exists; documented as NOT in run.py STEPS — re-run only when WA boundaries change |
| `src/styles/places.css` | Coverage section CSS | VERIFIED | Lines 157–219: `.coverage-section`, `.coverage-maps`, `.map-block svg`, `.species-section`, `.genus-section`, `.species-list` all defined |

---

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `collectors_export.py` | `collectors.json` | `_ACCOM_QUERY` + `_SPECIES_QUERY` → `ASSETS_DIR/collectors.json` | WIRED | `export_collectors_step()` called in `run.py` STEPS line 135; writes all ACCOM fields |
| `collector-detail.njk` | `_includes/maps/counties-base.svg` | `{% include "maps/counties-base.svg" %}` line 58 | WIRED | Eleventy `{% include %}` inlines SVG directly |
| `collector-detail.njk` | `_includes/maps/ecoregions-base.svg` | `{% include "maps/ecoregions-base.svg" %}` line 65 | WIRED | Eleventy `{% include %}` inlines SVG directly |
| `collector.county_names` | CSS highlight in page | `{% for c in collector.county_names %}` generating `.coverage-county [data-region="{{ c }}"]` style blocks | WIRED | Lines 19–24 of template |
| `collector.ecoregion_names` | CSS highlight in page | `{% for e in collector.ecoregion_names %}` generating `.coverage-eco [data-region="{{ e }}"]` style blocks | WIRED | Lines 25–30 of template |
| `collector.species_by_genus` | Species list with taxon links | `{%- for genus_group in collector.species_by_genus -%}` → `<a href="/species/{{ sp.slug }}/">` | WIRED | Lines 79–91 of template |
| `data/run.py` STEPS | `collectors-export` step | `("collectors-export", export_collectors_step)` line 135 | WIRED | No `collector-maps` step present; removed in Phase 172 GC2 |
| `data/nightly.sh` | collector-maps removal | Comment line 349: "collector-maps removed in Phase 172 GC2" | WIRED | Step is absent from nightly |

---

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|---------------|--------|--------------------|--------|
| `collector-detail.njk` | `collector.county_names`, `collector.ecoregion_names` | `collectors_export.py` `_ACCOM_QUERY` over `occurrences.parquet` | Yes — `array_agg(DISTINCT o.county)` / `array_agg(DISTINCT o.ecoregion_l3)` from real parquet | FLOWING |
| `collector-detail.njk` | `collector.active_since`, `collector.seasons_count` | `collectors_export.py` `_ACCOM_QUERY` `MIN(o.year)`, `COUNT(DISTINCT o.year)` | Yes — real aggregation over `tier='atlas'` rows | FLOWING |
| `collector-detail.njk` | `collector.species_by_genus` | `collectors_export.py` `_SPECIES_QUERY` join on `occurrences.parquet` + `species.parquet` | Yes — grouped by genus, cased scientificName, real occurrence counts | FLOWING |

---

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| `export_collectors` produces ACCOM fields | `pytest tests/test_collectors_export.py -q` | 12/12 passed (all ACCOM-01..04 tests green) | PASS |
| Base-map SVG generator creates `data-region` paths | `pytest tests/test_build_coverage_basemaps.py -q` | 15/15 passed (county, ecoregion, aria-hidden, weight, determinism tests) | PASS |
| Ecoregion SVG weight under 200 KB | `test_ecoregions_base_weight_regression` | 17 KB committed SVG — well under 200 KB limit | PASS |
| 39 WA counties represented in counties-base.svg | Python regex count on committed file | 39 `data-region` attributes found | PASS |
| Species links use correct `/species/{slug}/` format | Template inspection + slug field in `_SPECIES_QUERY` | `sp.slug` comes from `species.parquet`; rendered `<a href="/species/{{ sp.slug }}/">` | PASS |
| No `collector_maps.py` in run.py | `grep collector_map data/run.py` | Only a comment noting its removal | PASS |
| No collector pipeline artifact committed to git | `git ls-files public/data/` | Only `places.geojson` and `places.json` tracked; `collectors.json` is gitignored | PASS |

---

### Probe Execution

No probe scripts declared for this phase. Step skipped.

---

### Requirements Coverage

| Requirement | Description | Status | Evidence |
|-------------|-------------|--------|----------|
| ACCOM-01 | County coverage map on collector page | SATISFIED | Shared `counties-base.svg` inlined + per-collector CSS `[data-region]` highlight; `county_count` caption; 39-county WA base |
| ACCOM-02 | Taxonomic-breadth species list linked to taxon pages | SATISFIED | `species_by_genus` field in collectors.json; template renders genus-grouped list with `/species/{slug}/` links and "N specimens" counts; cased binomials |
| ACCOM-03 | Ecoregion breadth | SATISFIED | Shared `ecoregions-base.svg` inlined + per-collector CSS highlight; `ecoregion_count` caption; keyed on `NA_L3NAME` |
| ACCOM-04 | Active-seasons badge, no streaks | SATISFIED | Badge: "Active since {{ active_since }} ({{ seasons_count | quantify('season') }})"; predicate `tier='atlas'` COUNT(DISTINCT year); no streak/rank/leaderboard terms anywhere |

---

### Anti-Patterns Found

No debt markers (TBD, FIXME, XXX) found in Phase 172 files. No stub implementations detected. No placeholder returns in the template or export.

---

### Human Verification Required

None — operator UAT PASS (round 2) was recorded in `172-HUMAN-UAT.md` on 2026-06-28. The operator verified `/collectors/rainhead/` rendered correctly:
- Badge "Active since 2024 (3 seasons)" correct (FIX A: tier='atlas' predicate)
- Cased binomials linked to `/species/Agapostemon/femoratus/`
- Shared base maps inlined with per-collector CSS highlight
- Per-species counts restored as "— N specimens" (UAT round 2 fix, commit `6c053e3a`)
- `npm run build` clean; 281 pytest + 897 vitest green at UAT time

---

### Test Suite Results

| Suite | Result |
|-------|--------|
| `pytest tests/test_collectors_export.py tests/test_build_coverage_basemaps.py` | 27/27 passed |
| `pytest -m "not integration" -q` (full fast tier) | 281 passed, 9 skipped |
| `npx vitest run src/tests/data-collectors.test.ts` | 18/18 passed (6 Phase 172 ACCOM tests green) |
| `npm test` (full frontend suite) | 897/897 passed |
| `npm run build` | Clean — 1623 files written, bundle size OK |

---

### Gaps Summary

No gaps. All 5 ROADMAP success criteria are fully met by the shipped implementation. The operator-approved GC2 rework (shared base maps + CSS highlight replacing per-collector SVG files) delivers a superior solution — 17 KB shared ecoregion partial vs the original ~1.3 MB per-collector SVGs — while preserving the static/no-JS/pre-aggregated invariants.

---

_Verified: 2026-06-28T11:35:00Z_
_Verifier: Claude (gsd-verifier)_
