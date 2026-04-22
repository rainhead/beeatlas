---
quick_id: 260422-sc1
status: complete
---

# Quick Task 260422-sc1: Fix Specimen Count Mismatch

## What Was Done

Fixed a count discrepancy where the map filter panel showed a higher specimen count than the table view for the same filter.

**Root cause:** `queryVisibleIds` adds both `ecdysis:N` and `inat:N` to the ID Set for occurrence rows that have both IDs. So `_visibleIds.size` was 2× the row count for specimens with both IDs. The filter panel used `_visibleIds.size` as `specimenCount`; the table used `COUNT(*)`.

**Fix:**
1. `filter.ts`: Changed `queryVisibleIds` return type to `{ ids: Set<string>; rowCount: number } | null`. Added `rowCount++` inside the row callback to count rows (not IDs).
2. `bee-atlas.ts`: Added `_filteredRowCount` state. Updated `_runFilterQuery` to destructure `result?.ids`/`result?.rowCount`. Changed the `specimenCount` prop binding from `_visibleIds?.size` to `_filteredRowCount`. Added `_filteredRowCount = null` alongside all `_visibleIds = null` resets.

Both the filter panel count and the table total now use `COUNT(*)` — all rows matching the filter, including sample-only (provisional) records.

## Files Changed

- `frontend/src/filter.ts` — `queryVisibleIds` returns `{ ids, rowCount }`
- `frontend/src/bee-atlas.ts` — `_filteredRowCount` state threaded through
