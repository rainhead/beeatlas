---
phase: 113-species-page-expansion
plan: "01"
subsystem: test-infrastructure
tags: [tdd, red-tests, wave-0, vitest, pytest, species-pages, checklist]
nyquist_compliant: true
wave_0_complete: true

dependency_graph:
  requires: []
  provides:
    - "RED test gate: speciesList.length > 560 (SPEC-01)"
    - "RED test gate: genusList contains checklist-only species (D-03)"
    - "RED test gate: subgenusList checklistCount field (Pitfall 7)"
    - "RED test gate: seasonality-viz onChecklist=true renders 'Monthly phenology not recorded' (D-13, SPEC-05)"
    - "RED test gate: _write_species_svg extended signature with checklist_counties (SPEC-03)"
    - "RED test gate: STYLE_CSS contains .checklist-county class (D-04)"
    - "RED test gate: checklist-only species page has no atlas link, has Bartholomew attribution (D-08, D-15)"
    - "RED test gate: species index has 'checklist only' badge (D-14)"
  affects:
    - "src/tests/data-species.test.ts"
    - "src/tests/seasonality-viz.test.ts"
    - "src/tests/build-output.test.ts"
    - "data/tests/test_species_maps.py"

tech_stack:
  added: []
  patterns:
    - "Vitest async Lit component testing with updateComplete await"
    - "pytest tmp_path fixture for SVG file assertion"
    - "SKIP_BUILD guard for Eleventy build-output tests"

key_files:
  created: []
  modified:
    - path: "src/tests/data-species.test.ts"
      changes: "Updated speciesList count assertion (500→560); added genusList checklist-only test; replaced subgenusList.every test"
    - path: "src/tests/seasonality-viz.test.ts"
      changes: "Added two VIZ-02 checklist fallback tests (onChecklist=true and onChecklist=false)"
    - path: "data/tests/test_species_maps.py"
      changes: "Added three new tests: county fill render, no-fill when absent, STYLE_CSS checklist-county assertion"
    - path: "src/tests/build-output.test.ts"
      changes: "Added two tests inside SKIP_BUILD block: checklist-only species page assertions, species index badge"

decisions:
  - "Used Agapostemon/texanus as the stable known checklist-only slug (alphabetically first in current species.json pipeline output, 178 such species exist)"
  - "subgenusList test replaced (not added): old test locked incorrect behavior; new test is load-bearing once Plan 04 adds checklistCount"
  - "VIZ-02 negative test (onChecklist=false → '0 records') passes today — documents existing behavior as a guard"

metrics:
  duration: "~18 minutes"
  completed_date: "2026-05-25"
  tasks_completed: 2
  files_modified: 4
  commits: 2
---

# Phase 113 Plan 01: RED Test Gates Summary

Wave 0 RED test gates established for all five SPEC-01..SPEC-05 requirements. No production code modified.

**One-liner:** Five RED test gates written across JS, Python, and build-output test suites — each names the exact missing behavior that Plans 02–05 will implement.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | RED tests for JS data layer and seasonality-viz | 02b823e | src/tests/data-species.test.ts, src/tests/seasonality-viz.test.ts |
| 2 | RED tests for Python SVG county fills and Eleventy build output | d8983fa | data/tests/test_species_maps.py, src/tests/build-output.test.ts |

## RED State Summary

| Test | File | Failure Reason | Plan That Fixes It |
|------|------|----------------|--------------------|
| speciesList.length > 560 | data-species.test.ts | species.json not in worktree (pipeline output) | Plan 02 (dbt rebuild) |
| genusList checklist-only species (D-03) | data-species.test.ts | genusList filters occurrence_count > 0 | Plan 04 |
| subgenusList.every(g => ...checklistCount > 0) | data-species.test.ts | no checklistCount field in subgenusList | Plan 04 |
| VIZ-02 onChecklist=true → 'Monthly phenology not recorded' | seasonality-viz.test.ts | onChecklist @property does not exist | Plan 04 |
| test_write_species_svg_renders_checklist_county_fill | test_species_maps.py | _write_species_svg takes 4 args, test passes 6 (TypeError) | Plan 03 |
| test_write_species_svg_no_checklist_fill_when_county_absent | test_species_maps.py | same TypeError on signature mismatch | Plan 03 |
| test_style_css_contains_checklist_county_class | test_species_maps.py | STYLE_CSS lacks .checklist-county rule | Plan 03 |
| checklist-only species page (no atlas link, Bartholomew attribution) | build-output.test.ts | gated by SKIP_BUILD; will fail when build runs | Plan 05 |
| species index 'checklist only' badge | build-output.test.ts | gated by SKIP_BUILD; will fail when build runs | Plan 05 |

## Deviations from Plan

None — plan executed exactly as written. The `subgenusList` test was a replacement (not an addition) as specified in PATTERNS.md. The `KNOWN_CHECKLIST_ONLY_SLUG` was populated from the main repo's `public/data/species.json` (not a placeholder), using `Agapostemon/texanus` which is alphabetically first among 178 checklist-only species.

## Self-Check

Files exist:
- `src/tests/data-species.test.ts` — FOUND (modified)
- `src/tests/seasonality-viz.test.ts` — FOUND (modified)
- `data/tests/test_species_maps.py` — FOUND (modified)
- `src/tests/build-output.test.ts` — FOUND (modified)

Commits exist:
- `02b823e` — FOUND (Task 1)
- `d8983fa` — FOUND (Task 2)

Production files unchanged:
- `data/species_maps.py` — CONFIRMED no changes
- `_data/species.js` — CONFIRMED no changes
- `src/species/seasonality-viz.ts` — CONFIRMED no changes

## Self-Check: PASSED
