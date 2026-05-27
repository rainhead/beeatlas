---
slug: inat-obs-show-species-in-sidebar
date: 2026-05-26
status: in_progress
---

# iNat Expert Obs: Show Species Name in Sidebar

## Goal

`_renderInatObs` (the sidebar renderer for `source='inat_obs'` rows) never displays the observed species or quality grade. The `scientificName` and `inat_quality_grade` columns are both populated in the data (ARM 3 of int_combined.sql maps `io.scientific_name → scientificName`). Add them for consistency with the other occurrence type renderers.

## Audit

| Occurrence type | Species shown | Quality grade |
|---|---|---|
| Ecdysis-backed | ✅ `scientificName` (Ecdysis link) | ✅ on host badge |
| Provisional (WABA) | ✅ `specimen_inat_taxon_name` | ✅ via `_renderQualityBadge` |
| Sample-only | — (correct: none yet) | — |
| **inat_obs** | ❌ missing | ❌ missing |

## Task

1. In `src/bee-occurrence-detail.ts`, add species name + quality badge to `_renderInatObs`:
   - Use `row.scientificName` (italic) or a "identification unknown" hint
   - Use `this._renderQualityBadge(row.inat_quality_grade)` 
   - Render in a `<div class="inat-id-label">` at the top of the panel, matching `_renderProvisional` layout
2. Commit atomically
