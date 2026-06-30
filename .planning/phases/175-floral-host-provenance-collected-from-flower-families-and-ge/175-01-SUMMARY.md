---
phase: 175-floral-host-provenance
plan: "01"
subsystem: data-pipeline
tags: [plant-taxonomy, lineage-walk, dbt-intermediate, sidecar-json, tdd]
dependency_graph:
  requires:
    - data/raw/taxa.csv.gz (nightly download-taxa step)
    - ecdysis_data.occurrence_links (nightly ecdysis step)
    - inaturalist_data.observations (nightly inaturalist step)
  provides:
    - inaturalist_data.host_plant_lineage (DuckDB table)
    - target/sandbox/species_host_plants.parquet (dbt external intermediate)
    - public/data/species_hosts.json (sidecar, produced by species_export.py)
  affects:
    - data/run.py (new step inserted)
    - data/species_export.py (7th sidecar producer added)
tech_stack:
  added: []
  patterns:
    - ancestry walk + PIVOT over taxa.csv.gz (mirrors taxa_pipeline.load_taxon_lineage_extended)
    - seed-set restriction (occurrence_links JOIN observations) bounds walk to ~915 host taxa
    - dbt external materialized parquet (mirrors higher_taxa.sql config)
    - absence-tolerant sidecar producer (mirrors species_traits.parquet branch)
key_files:
  created:
    - data/host_plant_lineage.py
    - data/dbt/models/staging/stg_inat__host_plant_lineage.sql
    - data/dbt/models/intermediate/int_species_host_plants.sql
    - data/tests/test_host_plant_lineage.py
    - data/tests/test_species_hosts_export.py
  modified:
    - data/run.py (import + STEPS entry)
    - data/dbt/models/sources.yml (host_plant_lineage table under inaturalist_data)
    - data/species_export.py (species_hosts.json producer + docstring update)
decisions:
  - Output columns narrowed to (taxon_id, family, genus) — only columns needed by int_species_host_plants
  - Seed-set restriction in ancestor_ids CTE (not just final WHERE) for efficiency
  - genus fallback via COALESCE(tle.genus, split_part(obs.taxon__name, ' ', 1)) in int_species_host_plants
  - Absence-tolerant producer: missing parquet writes empty object (not hard-fail)
  - sort_keys=True + indent=2 for byte-stable idempotency across nightly runs
metrics:
  duration: "~25 minutes"
  completed: "2026-06-30"
  tasks_completed: 3
  files_changed: 8
---

# Phase 175 Plan 01: Plant-Host Lineage + species_hosts.json Pipeline

Resolve every observed host-plant taxon to its botanical FAMILY and GENUS, aggregate per bee species into distinct-sample-counted family/genus hosts, and emit a species_hosts.json sidecar — without touching any enforced dbt mart contract.

## Tasks Completed

| Task | Name | Commit | Key Files |
|------|------|--------|-----------|
| 1 (RED) | Failing tests for plant-host lineage | 5154eb6c | data/tests/test_host_plant_lineage.py |
| 1 (GREEN) | Plant-host lineage build + run.py step | 4cf23867 | data/host_plant_lineage.py, data/run.py |
| 2 | dbt source + staging view + int_species_host_plants | 946ef1b7 | sources.yml, stg_inat__host_plant_lineage.sql, int_species_host_plants.sql |
| 3 | species_hosts.json sidecar producer + tests | 482b9fac | data/species_export.py, data/tests/test_species_hosts_export.py |

## What Was Built

**`data/host_plant_lineage.py`** — `load_host_plant_lineage()` mirrors `taxa_pipeline.load_taxon_lineage_extended` with one key change: the Anthophila ancestry filter (`LIKE '%/630955/%'`) is replaced by a seed-set restriction that computes `DISTINCT o.taxon__id` from `inaturalist_data.observations JOIN ecdysis_data.occurrence_links`. The walk processes only ~915 observed host taxa, not all of Plantae. UNION ALL `self_rows` arm captures genus/family taxa absent from their own ancestry. Output: `inaturalist_data.host_plant_lineage (taxon_id, family, genus)`.

**`data/run.py`** — new step `("host-plant-lineage", load_host_plant_lineage)` inserted after `taxon-lineage-extended` and before `dbt-build`, so the staging view has its source when dbt runs.

**dbt models** — `stg_inat__host_plant_lineage.sql` is a one-line view. `int_species_host_plants.sql` is a private external-parquet intermediate (NOT a mart contract): joins `int_ecdysis_base` → `stg_inat__observations` → `stg_inat__host_plant_lineage`, applies synonymy via `LEFT JOIN int_synonyms`, counts `DISTINCT host_observation_id` as `sample_count` (the sample proxy, not raw specimen rows).

**`data/species_export.py`** — `species_hosts.json` producer added after the `photos.json` block. Reads `DBT_SANDBOX_DIR/species_host_plants.parquet`. Builds `{canonical_name: [{family, sample_count, genera:[{genus, sample_count}]}]}` with families and genera ordered by `sample_count` desc. Null-genus rows contribute to family `sample_count` but emit no genus object. Missing parquet writes empty object with a WARNING (absence-tolerant, mirrors `species_traits.parquet` branch). `json.dumps(sort_keys=True, indent=2)` for byte-stable idempotency.

## Verification

Fast tier passes locally:
```
cd data && uv run pytest tests/test_host_plant_lineage.py tests/test_species_hosts_export.py -m "not integration" -q
9 passed, 1 deselected in 0.65s
```

FAMILY-arm coverage deferred to nightly `bash data/dbt/run.sh build` (taxa.csv.gz absent locally, per `project_local_dbt_build_not_runnable`).

No file under `data/dbt/models/marts/` modified — dbt contracts on `marts/occurrences` and `marts/species` are untouched.

## Deviations from Plan

None — plan executed exactly as written. The TDD RED/GREEN/REFACTOR cycle was followed for Task 1; Tasks 2 and 3 had no TDD attribute and were committed as standard `feat(...)` commits.

## Known Stubs

None. The `species_hosts.json` producer writes an empty object when `species_host_plants.parquet` is absent (local dev without dbt build). This is documented as intentional graceful degradation, not a stub — the nightly build will populate it.

## Threat Flags

No new network endpoints, auth paths, file access patterns, or schema changes at trust boundaries beyond those enumerated in the plan's `<threat_model>`. T-175-01 (ancestry walk uses proven typed-column + active='true' parse) and T-175-03 (seed-set filter bounds walk) are mitigated as planned.

## TDD Gate Compliance

- RED gate: `test(175-01): add failing tests for plant-host lineage` (5154eb6c) ✓
- GREEN gate: `feat(175-01): implement plant-host lineage build and run.py step` (4cf23867) ✓
- REFACTOR gate: not needed (code was clean on first pass)

## Self-Check

Files exist:
- data/host_plant_lineage.py: FOUND
- data/dbt/models/staging/stg_inat__host_plant_lineage.sql: FOUND
- data/dbt/models/intermediate/int_species_host_plants.sql: FOUND
- data/tests/test_host_plant_lineage.py: FOUND
- data/tests/test_species_hosts_export.py: FOUND

Commits:
- 5154eb6c test(175-01): add failing tests for plant-host lineage
- 4cf23867 feat(175-01): implement plant-host lineage build and run.py step
- 946ef1b7 feat(175-01): add dbt source, staging view, and int_species_host_plants aggregate
- 482b9fac feat(175-01): add species_hosts.json sidecar producer and tests

## Self-Check: PASSED
