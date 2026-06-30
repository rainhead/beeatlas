---
quick_id: 260629-tqw
status: complete
date: 2026-06-30
resolves_todo: .planning/todos/completed/checklist-count-zero-but-on-checklist.md
commits:
  - 2b7dccd6 feat(260629-tqw): add checklist_record_count (data layer)
  - e946cbfd feat(260629-tqw): render true checklist record total; drop "0 checklist records"
---

# Quick Task 260629-tqw — Summary

## Goal
Fix the self-contradictory "0 checklist records · Bartholomew et al. 2024" line that ~40
species pages rendered while being on the published checklist. Operator chose **both** the
deeper data fix and the display fallback.

## What shipped

**Data layer (commit 2b7dccd6):** new mart column `checklist_record_count` = count of ALL
checklist records for a species (every `coord_flag`, synonym-resolved), sourced from the raw
`source('checklist_data','checklist_records_full')` so it bypasses
`stg_checklist__records_full`'s `coord_flag='valid'` filter and its `../raw/taxa.csv.gz`
dependency. It is **distinct from** `checklist_count` (deduped, coord-bearing point records
that must equal `occurrences.parquet`) — that column is unchanged. The new column flows:
`int_species_universe.sql` (new `checklist_record_count_agg` CTE + join) →
`marts/species.sql` → enforced contract in `marts/schema.yml` →
`species_export.py` (`SPECIES_COLUMNS` + pyarrow schema). Species mart is now 22 SQL columns
(23 with the Python-added slug). Test fixture `species_fixture.csv` updated.

**Display layer (commit e946cbfd):** `_pages/species-detail.njk`, `genus.njk`, `subgenus.njk`
now render `checklist_record_count`; when a listed species still has 0 records of any kind,
the detail page shows "Listed on the WA Bee Atlas checklist · Bartholomew et al. 2024" and the
compact genus/subgenus count spans show "On checklist" instead of "0 checklist records".

## Blast radius (validated against species.json + live DB)
40 species rendered the bare line. After the fix: **27** show a real count (e.g. *Nomada
aldrichi* = 1, one `null_coord` record), **13** pure list-memberships show the "Listed …"
label. Zero pages site-wide render a standalone "0 checklist record(s)".

## Verification
- `cd data && uv run pytest -m "not integration"` → 284 passed.
- `npm test` → 902 passed.
- New CTE logic validated directly against `beeatlas.duckdb` (Nomada aldrichi raw count = 1).
- **End-to-end render UAT:** injected the column into a local (uncommitted) `species.json`,
  ran `npm run build` (exit 0), confirmed the three branches in generated HTML — real count
  (Bombus mixtus "4205 checklist records"; Megachile fidelis "10 checklist records"),
  fallback (Andrena cyanura "Listed on the WA Bee Atlas checklist"), compact "On checklist"
  on genus pages — then restored the committed `species.json`.

## Notes / limitations
- `dbt parse` / full `run.sh build` are **not runnable locally** (pre-existing
  dbt+mashumaro+Python 3.14 incompatibility; Ecdysis auth gate; absent raw files). The new SQL
  was therefore validated via direct DuckDB query of the source table rather than a dbt build.
  The enforced contract on `marts/species` is checked at the nightly `run.sh build` on maderas.
- `public/data/species.json` is **not** committed (pipeline-regenerated artifact). The real
  `checklist_record_count` values reach prod when the nightly pipeline rebuilds the species mart.
- `_data/species.js` genus-tile gating intentionally still uses `checklist_count`
  (georeferenced) — gating is separate from display and out of scope.
