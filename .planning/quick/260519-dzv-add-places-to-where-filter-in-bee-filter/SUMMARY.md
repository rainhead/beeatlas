---
quick_id: 260519-dzv
slug: add-places-to-where-filter-in-bee-filter
status: complete
date: 2026-05-19
commit: 76bca27
---

# Quick Task 260519-dzv: Summary

## What was done

Extended the where filter in `bee-filter-panel.ts` to include places alongside counties and ecoregions.

**Changes in `src/bee-filter-panel.ts`:**
- Added `'place'` to `WhereSug.type` union
- Added `_placeOptions: { slug: string; name: string }[]` private field (places with data)
- Updated `_ensurePlaceNamesLoaded` to also populate `_placeOptions`, filtering to places with `specimen_count > 0 || sample_count > 0`
- `_togglePanel` and `setOpen` now call `_ensurePlaceNamesLoaded()` eagerly when the panel opens
- `_onWhereInput` now generates place suggestions from `_placeOptions` (up to 8 total suggestions)
- `_selectWhere` handles `type === 'place'` by setting `_selectedPlace`
- Placeholder updated to "County, ecoregion, or place"
- Backspace handler now removes the selected place chip when the input is empty

## Tests

All 442 tests pass.
