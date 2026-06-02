---
status: passed
phase: 130-map-filter-cutover
source: [130-VERIFICATION.md]
started: 2026-06-02T16:00:00Z
updated: 2026-06-02T17:00:00Z
---

## Current Test

All tests passed — user approved 2026-06-02.

## Tests

### 1. Multi-rank autocomplete → map descendant filtering
expected: Type a taxon and select an entry at each rank (family / subfamily / tribe / genus / subgenus / complex / species); the map updates to show exactly the descendant occurrences for the selected taxon. Previously-absent ranks (subfamily, tribe, subgenus) now appear in the autocomplete and filter correctly.
result: passed

### 2. URL round-trip, clear-filters, selection-rectangle, region/boundary
expected: Apply a taxon filter, copy the URL (`taxon=<int>`), reload in a fresh tab — the same filter is restored. Clear filters resets. Selection-rectangle and region/boundary filtering still work.
result: passed (after fix)
note: On restore the map filtered correctly but the "Species or group" input rendered empty (only a clear "x"). Two bugs in series: (1) taxonDisplayName was never resolved from the cache on restore — fixed in 7c644a3 (`resolveTaxonDisplayName` backfill on both restore paths in bee-atlas); (2) bee-pane's taxon-input sync guard was taxonId-only, so the backfilled label (same taxonId) was ignored — fixed in 556dbb0. (An interim fix to bee-filter-controls, 929c663, was reverted in 3be02a5 — that component is dead code, not the live filter UI.)

### 3. Detail card taxon-name resolution
expected: Open detail cards for an identified Ecdysis specimen, an iNat observation, and an unidentified specimen. Identified cards show the correct taxon name resolved from the cache; unidentified (taxon_id NULL) shows "No determination"; never blank or "undefined".
result: passed

### 4. Boot-path timing + 'bomb' autocomplete ordering
expected: In devtools, the taxon-cache query fires AFTER tablesReady (~250 ms), not on the boot path (no boot regression). Typing `bomb` shows D-05 ordering: Bombini → Bombus (genus) → Bombus (subgenus) → Bombus fervidus complex → species — broader-rank-first then alphabetical, reading legibly.
result: passed

## Summary

total: 4
passed: 4
issues: 0
pending: 0
skipped: 0
blocked: 0

## Gaps
