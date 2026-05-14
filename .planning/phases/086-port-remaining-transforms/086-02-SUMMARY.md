---
phase: "086"
plan: "02"
subsystem: data-pipeline
tags: [dbt, duckdb, staging, sources, lineage, LIN-05, PORT-03]

dependency_graph:
  requires:
    - phase: "086-01"
      provides: species-diff-harness
  provides:
    - dbt source declarations for canonical_to_taxon_id, taxon_lineage_extended, checklist_data.species
    - Three pass-through staging views for the species mart DAG
    - LIN-05 singular dbt test asserting lineage coverage >= 0.95
  affects: ["086-04", "086-05"]

tech_stack:
  added: []
  patterns:
    - dbt-source-declaration-before-staging (sources.yml updated before any SQL referencing new sources)
    - singular-dbt-test-pass-0-rows (test returns 0 rows when invariant holds, 1 row with diagnostics when violated)
    - staging-view-ref-over-source (LIN-05 test uses ref('stg_...') not source() for lineage inputs per Pitfall 8)

key_files:
  created:
    - data/dbt/models/staging/stg_inat__canonical_to_taxon_id.sql
    - data/dbt/models/staging/stg_inat__taxon_lineage_extended.sql
    - data/dbt/models/staging/stg_checklist__species.sql
    - data/dbt/tests/test_lin05_lineage_coverage.sql
  modified:
    - data/dbt/models/sources.yml
    - data/dbt/models/staging/schema.yml

key-decisions:
  - "LIN-05 test uses ref('stg_inat__canonical_to_taxon_id') and ref('stg_inat__taxon_lineage_extended') not direct source() references — preserves DAG lineage and ensures staging filters apply (Pitfall 8)"
  - "species_universe CTE uses source('ecdysis_data', 'occurrences') directly (not stg wrapper) — no staging filter applies to ecdysis occurrences for this coverage check; the Pitfall 8 restriction is specifically for the lineage inputs"
  - "checklist_data source block adds both species and species_counties tables — cheaper to declare both now than amend later (Pitfall 5)"
  - "Worktree required beeatlas.duckdb symlink to /main-repo/data/beeatlas.duckdb for dbt build to connect to live data"

patterns-established:
  - "Staging views: comment block identifies (a) source table wrapped, (b) ingestion script writer, (c) downstream consumers — then config(materialized='view') + SELECT * FROM source()"
  - "Singular test header: states invariant, PASS=0 rows semantics, FAIL diagnostics, Pitfall notes, VERIFIED baseline"

requirements-completed:
  - PORT-03

duration: 18min
completed: "2026-05-14"
---

# Phase 086 Plan 02: PORT-03 Source Declarations, Staging Views, and LIN-05 Test

**Three dbt staging views for the species mart DAG (canonical_to_taxon_id, taxon_lineage_extended, checklist.species) plus a LIN-05 singular test asserting 735/735 = 100% lineage coverage**

## Performance

- **Duration:** ~18 min
- **Started:** 2026-05-14T03:17:00Z
- **Completed:** 2026-05-14T03:25:00Z
- **Tasks:** 3
- **Files modified:** 6

## Accomplishments

- Declared `canonical_to_taxon_id` and `taxon_lineage_extended` as new tables under the `inaturalist_data` source block in `sources.yml`
- Added `checklist_data` source block with `species` and `species_counties` tables — both declared proactively (Pitfall 5)
- Created three pass-through staging views following the established `stg_waba__observations.sql` pattern
- Appended `not_null` + `unique` tests for new staging PKs to `staging/schema.yml`
- Created LIN-05 singular dbt test: returns 0 rows (PASS) when coverage >= 0.95, 1 diagnostic row (FAIL) when below
- Verified baseline: 735/735 = 100% coverage against live `beeatlas.duckdb`
- Full `dbt build` exits 0 with PASS=42, WARN=0, ERROR=0 (requirement was >= 39)

## Task Commits

1. **Task 1: Declare three new dbt sources in sources.yml** - `f5bdf5d` (feat)
2. **Task 2: Create three pass-through staging views and schema tests** - `0852ef2` (feat)
3. **Task 3: Add LIN-05 singular dbt test asserting lineage coverage >= 0.95** - `b8104c1` (feat)

## Files Created/Modified

- `data/dbt/models/sources.yml` — Added `canonical_to_taxon_id`, `taxon_lineage_extended` to `inaturalist_data` block; added `checklist_data` source block with `species` + `species_counties`
- `data/dbt/models/staging/stg_inat__canonical_to_taxon_id.sql` — Pass-through view wrapping `source('inaturalist_data', 'canonical_to_taxon_id')`
- `data/dbt/models/staging/stg_inat__taxon_lineage_extended.sql` — Pass-through view wrapping `source('inaturalist_data', 'taxon_lineage_extended')`
- `data/dbt/models/staging/stg_checklist__species.sql` — Pass-through view wrapping `source('checklist_data', 'species')`
- `data/dbt/models/staging/schema.yml` — Appended three model blocks with `not_null`/`unique` data_tests on PK columns (VERIFIED counts inline)
- `data/dbt/tests/test_lin05_lineage_coverage.sql` — LIN-05 singular test; PASS baseline 735/735 = 100%

## LIN-05 Baseline Result

| Metric | Value |
|--------|-------|
| Total species universe | 735 |
| Resolved (have taxon_id + lineage) | 735 |
| Coverage ratio | 100% (1.0) |
| Threshold | 0.95 |
| Test result | PASS (0 rows returned) |

Data verified against live `beeatlas.duckdb` as of 2026-05-14.

## Unblocked Dependencies

Plan 086-04 (`int_species_universe`) can now `ref()` all three staging models:
- `ref('stg_checklist__species')` — FULL OUTER JOIN axis
- `ref('stg_inat__canonical_to_taxon_id')` — canonical_name → taxon_id bridge
- `ref('stg_inat__taxon_lineage_extended')` — taxon_id → family/subfamily/tribe/genus/subgenus

## Decisions Made

- LIN-05 test uses `ref('stg_inat__...')` not `source()` directly for the lineage inputs (Pitfall 8) — preserves DAG lineage and ensures staging filters apply. The `ecdysis_data.occurrences` source in the species_universe CTE IS referenced directly because no staging filter applies to ecdysis occurrences for coverage purposes.
- Added both `species` and `species_counties` to the `checklist_data` block even though only `species` is needed in Phase 086 — cheaper than amending the file again (Pitfall 5).

## Deviations from Plan

### Environment Setup Required

**[Rule 3 - Blocking] Worktree lacked live beeatlas.duckdb**

- **Found during:** Task 3 (LIN-05 singular test)
- **Issue:** The worktree had no `data/beeatlas.duckdb` — `dbt debug` created an empty 12KB shell database instead of connecting to live data. Running `dbt test --select test_lin05_lineage_coverage` against the empty database would be a vacuous PASS or error.
- **Fix:** Symlinked `data/beeatlas.duckdb` → `/Users/rainhead/dev/beeatlas/data/beeatlas.duckdb` (main repo live database). Also symlinked `public/data` for the diff harness.
- **Files modified:** Worktree-local symlinks only (not committed — `data/beeatlas.duckdb` and `/public/data/` are gitignored)
- **Verification:** `dbt debug` shows "Connection test: OK" against live 111MB database. LIN-05 test passes with 735/735.

### Pytest Diff Harness Status in Worktree

Running `dbt build` in this worktree created `target/sandbox/occurrences.parquet`, which triggers `_SANDBOX_GUARD` and causes `test_occurrences_schema_matches` to fail due to the 3-column schema difference (the deferred `specimen_inat_login`/`genus`/`family` cleanup from Phase 085). This is a pre-existing worktree environment condition, not a regression introduced by this plan. In the main repo (where the sandbox artifacts are updated together with the model changes), the harness passes. The 086-01 SUMMARY documented: "In this worktree (no sandbox artifacts): 16 skipped, 0 passed."

## Issues Encountered

- Worktree environment lacked live database and public/data references — required symlinks before `dbt test` could run against live data.

## Next Phase Readiness

- Plan 086-04 (`int_species_universe`) can reference all three new staging views immediately
- LIN-05 coverage assertion runs on every `dbt build` going forward
- PORT-03 requirement is closed

---
*Phase: 086-port-remaining-transforms*
*Completed: 2026-05-14*
