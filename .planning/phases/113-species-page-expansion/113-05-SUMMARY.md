---
phase: 113-species-page-expansion
plan: "05"
status: complete
nyquist_compliant: true
self_check: PASSED
key-files:
  created: []
  modified:
    - _pages/species.njk
    - _pages/species-detail.njk
    - _pages/genus.njk
    - _pages/subgenus.njk
---

# Plan 05 Summary: Nunjucks Template Changes + Human UAT

## What Was Built

Four Nunjucks templates updated to surface all data-layer work from Plans 02–04.

**Task 1: species.njk, genus.njk, subgenus.njk count slots**
- `_pages/species.njk`: three-branch count slot — `occurrence_count > 0` → `N records`; `on_checklist` → `<span class="count checklist-badge">checklist only</span>`; else → `0 records`
- `_pages/genus.njk`: identical branching but `on_checklist` branch shows `N checklist records` (no badge class per D-01)
- `_pages/subgenus.njk`: identical to genus.njk

**Task 2: species-detail.njk**
- SVG `<img>` condition broadened: `{%- if sp.occurrence_count > 0 or sp.on_checklist -%}`
- Attribution line inserted after metadata `<p>`: `N checklist records · Bartholomew et al. 2024` (linked to https://jhr.pensoft.net/article/129013/), gated on `on_checklist`
- Atlas link (`View N occurrences on the atlas →`) wrapped in `{%- if sp.occurrence_count > 0 -%}` guard
- Seasonality-viz `<script>` extended with `el.onChecklist = {{ sp.on_checklist | dump | safe }}`

**Task 3: Full build + test verification**
- `VITEST_SKIP_BUILD=0 npm test`: 507/507 tests passing
- All 5 Plan 01 RED gate assertions are now GREEN: speciesList count, genusList checklist-only, seasonality-viz onChecklist fallback, build-output checklist-only page, build-output species index badge

## Deviations

None from template changes. 5 pre-existing pytest failures in `test_dbt_diff.py` and `test_places_maps.py` from Wave 2 signature/schema propagation gaps — not introduced by this plan, noted for follow-up.

## Human UAT Results

**Approved.** Visual verification of:
- Species index "checklist only" badge
- Checklist-only species pages with county fills, attribution, no atlas link
- WABA+checklist species with both fills and dots
- Genus/subgenus pages listing checklist-only species with checklist record counts
- Seasonality-viz "Monthly phenology not recorded" fallback

## Self-Check

- [x] All four templates committed
- [x] Build succeeds; 507 Vitest tests pass
- [x] Human UAT approved
- [x] SUMMARY.md created
