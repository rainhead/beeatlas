---
status: partial
phase: 130-map-filter-cutover
source: [130-VERIFICATION.md]
started: 2026-06-02T16:00:00Z
updated: 2026-06-02T16:35:00Z
---

## Current Test

Test 2 (URL round-trip) — re-test after fix 7c644a3.

## Tests

### 1. Multi-rank autocomplete → map descendant filtering
expected: Type a taxon and select an entry at each rank (family / subfamily / tribe / genus / subgenus / complex / species); the map updates to show exactly the descendant occurrences for the selected taxon. Previously-absent ranks (subfamily, tribe, subgenus) now appear in the autocomplete and filter correctly.
result: [pending]

### 2. URL round-trip, clear-filters, selection-rectangle, region/boundary
expected: Apply a taxon filter, copy the URL (`taxon=<int>`), reload in a fresh tab — the same filter is restored. Clear filters resets. Selection-rectangle and region/boundary filtering still work.
result: issue → fixed, awaiting re-test
note: On restore the map filtered correctly but the "Species or group" input rendered empty (only a clear "x"). Root cause: URL encodes only the integer taxon_id; taxonDisplayName was never resolved from the cache on restore (legacy-name path had the same gap). Fixed in commit 7c644a3 (`resolveTaxonDisplayName` backfill on both restore paths). Re-test: reload a `taxon=<int>` URL and confirm the input now shows the taxon label (e.g. "Bombus (genus)").

### 3. Detail card taxon-name resolution
expected: Open detail cards for an identified Ecdysis specimen, an iNat observation, and an unidentified specimen. Identified cards show the correct taxon name resolved from the cache; unidentified (taxon_id NULL) shows "No determination"; never blank or "undefined".
result: [pending]

### 4. Boot-path timing + 'bomb' autocomplete ordering
expected: In devtools, the taxon-cache query fires AFTER tablesReady (~250 ms), not on the boot path (no boot regression). Typing `bomb` shows D-05 ordering: Bombini → Bombus (genus) → Bombus (subgenus) → Bombus fervidus complex → species — broader-rank-first then alphabetical, reading legibly.
result: [pending]

## Summary

total: 4
passed: 0
issues: 1
pending: 4
skipped: 0
blocked: 0

## Gaps
