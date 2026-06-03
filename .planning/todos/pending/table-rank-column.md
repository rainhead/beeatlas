---
title: Add a rank column to the occurrences table view
priority: low
source: phase-131-human-verify
created: 2026-06-03
---

During the Phase 131 (Occurrence Normalization) human-verify checkpoint, the user
requested adding a **rank** column to the table view (alongside the Species
`display_name` column).

Now cheap to source: Phase 131 added a `LEFT JOIN taxa t ON t.taxon_id = o.taxon_id`
to `queryTablePage` / `queryListPage` / `queryAllFiltered` / `queryOccurrencesByBounds` /
`getOccurrences` in `src/filter.ts`, selecting `t.name AS display_name`. The `taxa`
table also carries a `rank` column (`taxon_id, rank, name, lineage_path, is_anthophila`),
so a rank column is just `t.rank AS display_rank` added to those same SELECTs plus a
new column def in `src/bee-table.ts` (mirror the `display_name` Species column at
`bee-table.ts:43`, including a `nullLabel` for `taxon_id IS NULL` rows).

Not in NORM scope — deferred as a follow-up table-UI enhancement. Consider folding
into a future frontend phase.
