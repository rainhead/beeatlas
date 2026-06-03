---
title: Break out subgenera on large genus pages (species lists overwhelm the map)
priority: medium
source: phase-132-human-verify
created: 2026-06-03
---

During the Phase 132 (Page Rebuild & Subfamily Pages) human-verify checkpoint, the
user noted that `/species/Andrena/` lists **71 species** (108 total members), which
overwhelms the occurrence map and makes the page hard to scan.

Andrena (and other large genera) already have subgenera, and subgenus pages already
exist at `/species/{Genus}/{Subgenus}/` (`_pages/subgenus.njk`, `species.subgenusList`).
The enhancement: on the genus page, group the flat species list **by subgenus**
(headings → their `/species/{Genus}/{Subgenus}/` pages, mirroring the new
tribes→genera nesting on subfamily pages, D-04), so large genera read as a set of
smaller subgenus sections rather than one long list. Species with no subgenus render
flat (graceful degradation, cf. D-05).

Data is already available: `_data/species.js` builds `subgenusList` and each species
row carries `subgenus`. This is a genus-page (`_pages/genus.njk`) + `species.js`
presentation change only — no pipeline/rollup work. Out of Phase 132 scope (which
rebuilt genus-page TOTALS, not the species-list layout). Consider folding into a
future frontend/browse phase (possibly alongside Phase 133's `/species` browse tree).
