---
slug: inat-obs-show-species-in-sidebar
date: 2026-05-26
status: complete
---

# Summary

Added species name and quality grade badge to the iNat expert observation sidebar renderer (`_renderInatObs`).

## What changed

`src/bee-occurrence-detail.ts` — `_renderInatObs` now shows a species name row (italic, same `inat-id-label` style used by `_renderProvisional`) at the top of the panel, with `_renderQualityBadge(row.inat_quality_grade)` beside it. Falls back to "identification unknown" if `scientificName` is null.

## Audit result

| Occurrence type | Species | Quality grade |
|---|---|---|
| Ecdysis-backed | ✅ | ✅ |
| Provisional (WABA) | ✅ | ✅ |
| Sample-only | — (correct) | — |
| inat_obs | ✅ (fixed) | ✅ (fixed) |

All 525 tests pass.
