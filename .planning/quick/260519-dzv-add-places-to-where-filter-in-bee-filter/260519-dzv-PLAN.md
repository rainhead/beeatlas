---
quick_id: 260519-dzv
slug: add-places-to-where-filter-in-bee-filter
description: Add places to where filter in bee-filter-panel
date: 2026-05-19
status: complete
---

# Quick Task 260519-dzv: Add places to where filter in bee-filter-panel

## Task 1: Extend WhereSug type and load place options

**Files:** `src/bee-filter-panel.ts`
**Action:**
- Add `'place'` to `WhereSug.type` union
- Add `_placeOptions: { slug: string; name: string }[]` private field
- Update `_ensurePlaceNamesLoaded` to also populate `_placeOptions` (filtering to places with specimen_count > 0 or sample_count > 0)
- Call `_ensurePlaceNamesLoaded()` eagerly in `_togglePanel` and `setOpen` when opening

## Task 2: Generate and handle place suggestions

**Files:** `src/bee-filter-panel.ts`
**Action:**
- In `_onWhereInput`: add place suggestions from `_placeOptions` when `_selectedPlace === null`
- In `_selectWhere`: handle `type === 'place'` by setting `_selectedPlace`
- Update placeholder text from "County or ecoregion" to "County, ecoregion, or place"
- In backspace handler: also call `_removePlace()` when place is selected and input is empty
