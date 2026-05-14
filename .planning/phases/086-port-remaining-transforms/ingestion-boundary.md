---
phase: 086-port-remaining-transforms
requirements: [PORT-02, PORT-04]
decision: keep both Python ingestion scripts in place; consume their output via dbt source() declarations
decided: 2026-05-14
---

# Ingestion vs. Transform Boundary — Phase 86 Decision Record

## Context

v3.4 cuts SQL transforms over to dbt. Two Python scripts — `data/ecdysis_pipeline.py::load_links`
and `data/resolve_taxon_ids.py` — raised the question: port to dbt or keep in Python? PORT-02
asked whether the occurrence-links derivation (the Ecdysis HTML-scraping post-step that populates
`specimen_observation_id`) should be expressed as a dbt model. PORT-04 asked the same question
about `resolve_taxon_ids.py`, which resolves canonical species names to iNaturalist taxon IDs.
This document records the decision for both requirements and establishes the criterion applied,
so that Phase 88 cutover work can identify exactly what is deletable versus what is a permanent
resident of the Python ingestion path.

## Decision Criterion

A script is **SQL-shaped** (pure transformation over tables already in the database) when it
contains no external I/O, no procedural policy, and no stateful side-effects beyond writing a
single output table. SQL-shaped scripts port to dbt. A script is **Python-shaped** (ingestion)
when it performs HTTP calls, applies procedural ambiguity-resolution logic, manages rate-limiting
or retry, or produces side-effect artifacts (CSV logs, disk cache) that require human review.
Python-shaped scripts stay in Python; the resulting database table is declared as a dbt `source()`
so the rest of the dbt DAG can consume it via `ref()` chains. This criterion matches the
architectural responsibility map documented in `086-RESEARCH.md`.

## PORT-02: Occurrence-Links Derivation

### What `data/ecdysis_pipeline.py::load_links` Does

`load_links()` (line 190) runs a dlt pipeline named `ecdysis` against `ecdysis_data` in
`beeatlas.duckdb`. It calls `ecdysis_links_source()` (line 106), which defines a dlt resource
`occurrence_links` (line 126-127) that:

1. Reads all rows from `ecdysis_data.occurrences` (fields: `id`, `occurrence_id`).
2. Skips any `occurrence_id` already present in `ecdysis_data.occurrence_links`.
3. For each remaining occurrence: fetches the Ecdysis specimen page at
   `https://ecdysis.org/...?occid=<ecdysis_id>&clid=0` (with an HTML disk cache under
   `html_cache_dir` to avoid re-fetching), parses the HTML to extract the iNaturalist
   observation link, and yields `{occurrence_id, host_observation_id}`.
4. Merges yielded rows into `ecdysis_data.occurrence_links` via dlt's `write_disposition="merge"`.

The `data/run.py` STEPS list registers this as `("ecdysis-links", load_links)`.

### Decision: KEEP in Python (Ingestion)

`load_links` is unambiguously ingestion: it makes HTTP requests to Ecdysis (scraping), applies
HTML parsing logic (`_extract_inat_id`), and manages a rate-limiting delay (`RATE_LIMIT_SECONDS`)
and an HTML disk cache. This is not SQL-shaped — it cannot be expressed as a dbt model.

### The Join + Projection Is Already in dbt

The join that REQUIREMENTS.md PORT-02 asked to "express as a dbt model" is already done. The dbt
DAG covers the full occurrence-links derivation through these four artifacts:

- **`data/dbt/models/sources.yml` line 8** — `ecdysis_data.occurrence_links` is already declared
  as a dbt source under the `ecdysis_data` source block.
- **`data/dbt/models/staging/stg_ecdysis__occurrence_links.sql`** — source wrapper view:
  `SELECT * FROM source('ecdysis_data', 'occurrence_links')`.
- **`data/dbt/models/intermediate/int_ecdysis_base.sql` line 28** —
  `LEFT JOIN {{ ref('stg_ecdysis__occurrence_links') }} links ON links.occurrence_id = o.occurrence_id`
  computes `host_observation_id` for every ecdysis occurrence.
- **`data/dbt/models/intermediate/int_waba_link.sql`** — computes `specimen_observation_id` via
  `MIN(waba.id)` grouped by `catalog_suffix` from WABA OFV field_id=18116. This is the dbt
  equivalent of the `waba_link` CTE in `data/export.py` lines 46-55.

### The Seam

```
load_links() → ecdysis_data.occurrence_links
            → source('ecdysis_data', 'occurrence_links')
            → stg_ecdysis__occurrence_links
            → int_ecdysis_base (host_observation_id LEFT JOIN)
            → int_combined → occurrences mart
```

`int_waba_link` feeds `specimen_observation_id` into `int_ecdysis_base` via
`ref('int_waba_link')`, completing the occurrence-links derivation on the dbt side.

### Phase 88 Cutover Scope for PORT-02

**Stays in Python (permanent):** `ecdysis_pipeline.py::load_links` — the HTML scraping is
ingestion and cannot be ported to dbt.

**Becomes deletable in Phase 88:** `data/export.py` lines 46-55 (`waba_link` CTE) and the
`occurrence_links` LEFT JOIN in the `ecdysis_base` CTE (approximately line 80). These are
duplicates of `int_waba_link` and `int_ecdysis_base` respectively, and once `data/run.py` runs
`dbt build` instead of `export.py`, they become dead code.

## PORT-04: resolve_taxon_ids.py

### What `data/resolve_taxon_ids.py` Does

`resolve_taxon_ids.py` (213 lines) is the Phase 77 canonical-name resolution step:

1. **Queries unresolved names** (lines 36-88): runs a FULL OUTER UNION of
   `checklist_data.species.canonical_name` and `ecdysis_data.occurrences.canonical_name`,
   LEFT JOINs against `inaturalist_data.canonical_to_taxon_id`, and returns names where the
   bridge row is absent. With `--refresh-lineage`, also re-attempts names logged in
   `data/lineage_unresolved.csv`.

2. **Calls the iNat API** (lines 125-189): for each unresolved name, walks a rank ladder
   (1-token → unconstrained rank; 2-token → species then unconstrained genus; 3+-token →
   species on first two tokens), GETs `https://api.inaturalist.org/v1/taxa`, and applies
   `_pick_match` (lines 91-122) — the D-02 ambiguity-resolution policy. `_pick_match` runs a
   multi-step filter ladder: exact lower-case name match → active taxon → iconic_taxon_name ==
   'Insecta' → rank constraint. A survivor is accepted only when exactly one candidate remains
   after each filter.

3. **UPSERTs resolved names** (lines 170-181): writes
   `(canonical_name, taxon_id, resolved_at, source)` into
   `inaturalist_data.canonical_to_taxon_id` using an `ON CONFLICT ... DO UPDATE` UPSERT.

4. **Logs unresolved names** (lines 183-189): appends
   `(canonical_name, reason, attempted_at)` to `data/lineage_unresolved.csv` for human review.

5. **Rate-limits and retries**: imports `_INAT_PACE_SECONDS` and `_inat_get_with_retry` from
   `data/inaturalist_pipeline.py`; `time.sleep(_INAT_PACE_SECONDS)` precedes each API call.

The `data/run.py` STEPS list registers this as `("resolve-taxon-ids", resolve_taxon_ids)`.

### Why It Is Unambiguously Python-Shaped (Ingestion)

`resolve_taxon_ids.py` exhibits every marker of an ingestion script:

- **HTTP requests** to an external API (`api.inaturalist.org/v1/taxa`) — not expressible in SQL.
- **Procedural ambiguity-resolution policy** (`_pick_match` filter ladder) — has branch logic
  that terminates on the first step that narrows to exactly one candidate; this is not a SQL
  transform.
- **Rate-limiting** (`_INAT_PACE_SECONDS`, `time.sleep`) — impossible in dbt models.
- **Retry logic** (`_inat_get_with_retry`) — network resilience code inappropriate for SQL.
- **Stateful UPSERT with skip-already-resolved logic** — idempotent but stateful; the "skip
  already-resolved names" guard (`LEFT JOIN ... WHERE b.canonical_name IS NULL`) is a
  correctness property of the ingestion step, not a transform.
- **CSV side-effect** (`data/lineage_unresolved.csv`) — human-review artifact, not a DB table.

Porting this into the dbt DAG (including via any adapter-level scripting) would require `pandas`
(a heavy dependency rejected in `086-RESEARCH.md §Don't Hand-Roll`), would not isolate
rate-limiting from the dbt DAG runner, and would not be testable in the same way. The dbt DAG
is not an appropriate tier for network-bound ingestion with per-row policy.

### Decision: KEEP in Python

`data/resolve_taxon_ids.py` stays in Python permanently. The resulting table,
`inaturalist_data.canonical_to_taxon_id`, is declared as a dbt `source()` (added in Plan
086-02 to `data/dbt/models/sources.yml`), and a staging view
`data/dbt/models/staging/stg_inat__canonical_to_taxon_id.sql` wraps it for consumption by the
dbt DAG.

### The Seam

```
resolve_taxon_ids.py → inaturalist_data.canonical_to_taxon_id
                     → source('inaturalist_data', 'canonical_to_taxon_id')
                     → stg_inat__canonical_to_taxon_id
                     → int_species_universe (Plan 086-04)
                     → test_lin05_lineage_coverage (Plan 086-02)
```

### Phase 88 Cutover Scope for PORT-04

**Stays in Python (permanent):** `data/resolve_taxon_ids.py` — iNat API caller; not a
candidate for dbt in any future phase.

**No Phase 88 deletion:** `data/run.py` STEPS keeps `("resolve-taxon-ids", resolve_taxon_ids)`
indefinitely.

## Companion Note: enrich_taxon_lineage_extended

The same ingestion-boundary logic applies to `data/inaturalist_pipeline.py::enrich_taxon_lineage_extended`
(lines 184-270 per RESEARCH §PORT-03). This function calls the iNat API in batches of 30 to
retrieve ancestor chains for all taxon IDs in the union of iNat and WABA observations, writing
the results to `inaturalist_data.taxon_lineage_extended`. It stays in Python for the same
reasons as `resolve_taxon_ids.py`: HTTP batch requests, stateful CREATE OR REPLACE TABLE,
no SQL-only equivalent. The resulting table is a dbt `source()` (declared in Plan 086-02),
wrapped by `stg_inat__taxon_lineage_extended`. PORT-03 is closed by these source declarations
plus the `test_lin05_lineage_coverage` dbt singular test (Plan 086-02); the Python enrichment
function itself is out of scope for porting.

## Consequences for Phase 88 Cutover

The `data/run.py` STEPS list after the Phase 86 + 87 rewrite:

**Keeps (permanent Python ingestion):**
- `("ecdysis-links", load_links)` — HTML scraping stays
- `("resolve-taxon-ids", resolve_taxon_ids)` — iNat API resolution stays
- `("taxon-lineage-extended", enrich_taxon_lineage_extended)` — iNat API lineage stays

**Loses (replaced by dbt):**
- `("export", export_occurrences)` — replaced by `dbt build` producing `occurrences.parquet`
- `("species-export", species_export)` — replaced by dbt species mart (Plan 086-04) +
  Python JSON post-step (Plan 086-05) consuming the mart output

**Becomes deletable in Phase 88:**
- `data/export.py` — the waba_link CTE (lines 46-55), the ecdysis_base occurrence_links LEFT
  JOIN (~line 80), and all downstream aggregation CTEs are dead code once `dbt build` replaces
  the export step. Phase 88 audits any remaining one-shot or anti-entropy helpers before
  deleting the file.
