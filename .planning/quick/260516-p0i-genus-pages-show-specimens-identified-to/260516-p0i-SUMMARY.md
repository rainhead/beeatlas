---
quick_id: 260516-p0i
slug: genus-pages-show-specimens-identified-to
status: complete
date: 2026-05-17
commit: a260df7
---

# Quick Task 260516-p0i: Summary

## What was done

Added a grey "Genus sp." entry to the species key on genus and subgenus pages when genus-level occurrence records exist.

**Root cause:** `_data/species.js` filtered out `specific_epithet === null` records from the `species` array, so genus-level specimens appeared as grey dots in the SVG map but had no key entry.

**Changes:**
- `_data/species.js`: Appends a synthetic `{ scientificName: 'Genus sp.', hexColor: '#aaaaaa', occurrence_count, slug: null }` entry to the species list for each genus/subgenus with unresolved occurrences. Also fixed `genusList.totalOccurrences` to include unresolved occurrences (was inconsistent with `subgenusList`).
- `_pages/genus.njk`, `_pages/subgenus.njk`: Conditionally render `<a>` link or plain `<em>` based on whether `sp.slug` is present (synthetic entry has `slug: null`).
- `src/tests/data-species.test.ts`: Updated two hexColor-matching tests to skip synthetic "sp." entries (which have no `canonical_name`).

All 384 tests pass.
