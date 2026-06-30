---
title: "Detail page shows '0 checklist records' for species that are on the checklist"
priority: medium
source: incidental-find-2026-06-29 (Nomada aldrichi detail page)
created: 2026-06-29
area: data + species-detail template
---

## Symptom

`http://localhost:8080/species/Nomada/aldrichi/index.html` renders:

> 0 checklist records · Bartholomew et al. 2024

i.e. it cites the checklist (so `on_checklist` is true) but reports **0** records,
which reads as self-contradictory. The published checklist does list the species.

## Root cause

`on_checklist` and `checklist_count` are derived from **two different sources** in
`data/dbt/models/intermediate/int_species_universe.sql`:

- **`on_checklist`** (line ~104): `c.scientificName IS NOT NULL` — membership in the
  checklist *species list* (`stg_checklist__species`). Nomada aldrichi is present there
  with `status = 'verified'` (confirmed by querying `dbt_sandbox.stg_checklist__species`).
- **`checklist_count`** (`checklist_count_agg`, lines ~44-56): `COUNT(*)` from
  `int_checklist_dedup_status` WHERE `dedup_status IS DISTINCT FROM 'confirmed'`
  **AND `lat IS NOT NULL AND lon IS NOT NULL`** (coordinate-bearing point records only;
  re-sourced this way in Phase 137 / UIX-04 so the count matches points in
  `occurrences.parquet`).

For Nomada aldrichi, `int_checklist_dedup_status` has **zero rows** (verified by query),
so `checklist_count = 0` while `on_checklist = true`. It is a *listed* checklist species
with no georeferenced checklist point-records flowing through the dedup pipeline (its
checklist records are presumably county-level / coordinate-less and are filtered out by
the `lat/lon IS NOT NULL` requirement, or dropped upstream).

The species-detail template (`_pages/species-detail.njk`, the `{%- if sp.on_checklist -%}`
block) unconditionally renders `{{ sp.checklist_count | quantify("checklist record") }}`,
producing the "0 checklist records" string.

## Blast radius (from current species.json)

- 527 species are `on_checklist = true`.
- **80** of those have `checklist_count = 0`.
- **40** of those ALSO have `occurrence_count = 0` → they render the bare
  "0 checklist records · Bartholomew et al. 2024" line a visitor will notice.
  Examples: `andrena andrenoides`, `andrena cuneilabris`, `andrena cyanura`,
  `andrena nigrae`, `andrena salictaria`, `andrena shoshoni`, `bombus lapponicus`,
  `colletes delodontus`, `nomada aldrichi`.

## Fix options (decide later)

1. **Display-only (cheap):** in `species-detail.njk`, when `on_checklist` is true but
   `checklist_count` is 0, drop the count and show e.g. "Listed on the WA Bee Atlas
   checklist · Bartholomew et al. 2024" instead of "0 checklist records · …". Removes the
   contradiction without touching the data model. Same line also feeds the checklist
   attribution elsewhere — check genus/index usages.
2. **Data (deeper):** decide whether the *attribution* count should reflect ALL checklist
   records for the species (incl. non-georeferenced), while the map/point count keeps the
   coordinate-bearing subset. Would mean a second aggregate (count over
   `stg_checklist__records_full` / `int_checklist_collapsed` without the `lat/lon NOT NULL`
   filter) distinct from the point count. Relates to memory `feedback_checklist_synonymy_gap`
   and the Phase 137/UIX-04 re-sourcing rationale (count must equal points in
   occurrences.parquet — so a separate "listed records" count is needed, not a relaxation
   of `checklist_count`).

Diagnosed but intentionally deferred per operator on 2026-06-29.
