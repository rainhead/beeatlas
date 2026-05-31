---
phase: 126-taxon-ids
plan: "03"
subsystem: frontend-templates
tags: [taxon-id, species-pages, nunjucks, css, iNaturalist]
dependency_graph:
  requires: ["126-02"]
  provides: ["TID-03", "D-06"]
  affects: ["_data/species.js", "_pages/species-detail.njk", "_pages/genus.njk", "_pages/subgenus.njk", "_pages/tribe.njk", "src/styles/taxon-pages.css"]
tech_stack:
  added: []
  patterns: ["Eleventy data cascade (species.js)", "Nunjucks null-guard anchor pattern", "taxon-action CSS block display pattern"]
key_files:
  created: []
  modified:
    - _data/species.js
    - _pages/species-detail.njk
    - _pages/genus.njk
    - _pages/subgenus.njk
    - _pages/tribe.njk
    - src/styles/taxon-pages.css
decisions:
  - "taxon-action class uses display:block + width:fit-content to keep action links on separate lines without wrapping parent in a flex container"
  - "CSS rule placed in taxon-pages.css under the Phase 94/96 conventions; selects .taxon-page .taxon-action to stay scoped"
  - "class applied to iNat anchor on genus/subgenus/tribe for consistency even though those pages had no runaway-link bug"
metrics:
  duration: "~20 minutes (continuation after human-verify checkpoint)"
  completed: "2026-05-31"
  tasks_total: 3
  tasks_completed: 3
  files_modified: 6
---

# Phase 126 Plan 03: iNaturalist Taxon Links on Taxon Pages — Summary

Thread taxon_id through `_data/species.js` and render guarded "View on iNaturalist" links on all four taxon page templates, with a `.taxon-action` CSS class to keep the action links visually separated.

## Tasks Completed

| Task | Description | Commit | Files |
|------|-------------|--------|-------|
| 1 | Thread taxon_id through _data/species.js | 4c615c9 | _data/species.js |
| 2 | Add View on iNaturalist link to all four taxon templates | a54dc22 | _pages/species-detail.njk, genus.njk, subgenus.njk, tribe.njk |
| 3 (fix) | Separate species-page action links (post-verify fix) | 2a3386a | _pages/species-detail.njk, genus.njk, subgenus.njk, tribe.njk, src/styles/taxon-pages.css |

## What Was Built

- `_data/species.js` reads `public/data/higher_rank_taxon_ids.json` and attaches `taxon_id` (with `?? null` fallback) to every entry in `genusList`, `subgenusList`, and `tribeList`. `speciesList` already carried `taxon_id` from `species.json` and required no change.
- All four taxon templates now render a null-guarded `<a class="taxon-action" href="https://www.inaturalist.org/taxa/{taxon_id}">View on iNaturalist →</a>`.
- On `species-detail.njk` the iNat link is a separate `{%- if sp.taxon_id -%}` block from the `occurrence_count` guard, so checklist-only species with a `taxon_id` still get the link.
- `.taxon-page .taxon-action { display: block; width: fit-content; margin-top: 0.5rem; }` added to `src/styles/taxon-pages.css`, consistent with the existing `.taxon-page ...` selector conventions.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Post-verify fix: action links ran together on species page**

- **Found during:** Human-verify checkpoint (Task 3)
- **Issue:** The atlas-records `<a>` (line ~46) and the new iNaturalist `<a>` (line ~49) were adjacent inline elements; surrounding `{%- -%}` Nunjucks whitespace-control stripped the whitespace between them, causing them to concatenate as one run of text: "View 472 records on the atlas →View on iNaturalist →"
- **Fix:** Added `.taxon-action` class to both anchors and a `display: block; width: fit-content; margin-top: 0.5rem` rule in `taxon-pages.css`. Applied the same class to the single iNat anchor on genus/subgenus/tribe for consistency (those pages were already visually fine — single link, no collision).
- **Files modified:** `_pages/species-detail.njk`, `_pages/genus.njk`, `_pages/subgenus.njk`, `_pages/tribe.njk`, `src/styles/taxon-pages.css`
- **Commit:** 2a3386a

## Requirements Satisfied

- **TID-03**: Species pages link to `https://www.inaturalist.org/taxa/{taxon_id}` (already marked complete in REQUIREMENTS.md from Tasks 1+2)
- **D-06**: Genus, subgenus, and tribe pages carry the same link using each rank's own `taxon_id`

## Known Stubs

None. All action links are wired to real `taxon_id` values from the pipeline-produced JSON with null guards suppressing the link when the id is absent.

## Threat Flags

None. The `taxon_id` is a build-time integer from a contract-enforced parquet column; no user-controlled input enters the URL.

## Self-Check: PASSED

- [x] `_data/species.js` — modified (taxon_id wired)
- [x] `_pages/species-detail.njk` — modified (taxon-action class + iNat link)
- [x] `_pages/genus.njk` — modified (taxon-action class)
- [x] `_pages/subgenus.njk` — modified (taxon-action class)
- [x] `_pages/tribe.njk` — modified (taxon-action class)
- [x] `src/styles/taxon-pages.css` — modified (taxon-action rule)
- [x] Commit 4c615c9 exists
- [x] Commit a54dc22 exists
- [x] Commit 2a3386a exists
