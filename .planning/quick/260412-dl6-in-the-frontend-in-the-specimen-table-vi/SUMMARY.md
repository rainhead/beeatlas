---
status: complete
phase: quick
plan: 260412-dl6
subsystem: frontend/data
---

# Summary: Modified column in specimen table

Shipped. The specimen table gained a "Modified" column equal to the maximum of the
occurrence's `modified` timestamp and all its identifications' `modified` timestamps
(`GREATEST(...)` in `data/export.py`), surfaced through `SpecimenRow`/`SPECIMEN_COLUMNS`
in `src/filter.ts` and `SPECIMEN_COLUMN_DEFS` in `src/bee-table.ts`.

Delivered by commits `8dddbe9` (export `modified` column) and `d99bd54` (frontend column).
This SUMMARY was added retroactively at the v4.7 close — the task predated the
`status:` frontmatter convention and never got one. See `260412-dl6-PLAN.md` for the plan.
