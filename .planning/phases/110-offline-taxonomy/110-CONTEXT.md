# Phase 110: Offline Taxonomy - Context

**Gathered:** 2026-05-23
**Status:** Ready for planning

<domain>
## Phase Boundary

Replace the two live iNaturalist API enrichers (`enrich_taxon_lineage_extended` in `inaturalist_pipeline.py` and `enrich_taxon_lineage` in `waba_pipeline.py`) with a local taxa.csv.gz ancestry walk. The archive is downloaded from iNat AWS Open Data with ETag/Last-Modified caching, cached at `data/raw/taxa.csv.gz`, synced to/from S3 by `nightly.sh`, and used to populate `inaturalist_data.taxon_lineage_extended` via a DuckDB `unnest(string_split(ancestry,'/'))` walk. After deletion of both enrichers, `dbt build` and `npm test` must still pass.

</domain>

<decisions>
## Implementation Decisions

### WABA Lineage Migration
- **D-01:** `stg_waba__taxon_lineage` is rewritten as a dbt view on `stg_inat__taxon_lineage_extended`, selecting `taxon_id, genus, family`. No new Python step; `int_specimen_obs_base` is unchanged — it still JOINs `stg_waba__taxon_lineage`, which now sources from `taxon_lineage_extended`.
- **D-02:** The `inaturalist_waba_data.taxon_lineage` source declaration in `data/dbt/models/sources.yml` must be removed (the table will no longer exist in DuckDB after `enrich_taxon_lineage` is deleted).

### Claude's Discretion
- **Exact dbt ref pattern** for the rewritten `stg_waba__taxon_lineage` — use `{{ ref('stg_inat__taxon_lineage_extended') }}` or another clean approach; planner decides what's idiomatic.
- **Taxon scope** in the new `taxon_lineage_extended` — the enricher currently filters to observed taxon IDs; with taxa.csv.gz, the planner should determine whether to load all active bees (Anthophila) or all active taxa. Phase 111 (Checklist) needs lineage for species not yet in observations, so scope must be at least all WA bee species.
- **Module placement** for the taxa.csv.gz downloader + DuckDB loader — new module vs. extension of `inaturalist_pipeline.py`; follow existing pipeline patterns.
- **Test migration** — `data/tests/test_taxon_lineage_extended.py` mocks HTTP requests to the live API; these tests become dead after Phase 110. Planner decides whether to delete them (rely on dbt schema tests for contract coverage) or port to a CSV-fixture approach.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Requirements and Roadmap
- `.planning/REQUIREMENTS.md` §TAX — TAX-01 through TAX-04: download with ETag/Last-Modified, DuckDB ancestry walk, enricher deletion, S3 sync
- `.planning/ROADMAP.md` §Phase 110 — success criteria (4 items)

### Enrichers to Delete
- `data/inaturalist_pipeline.py` — `enrich_taxon_lineage_extended` at line 184; populates `inaturalist_data.taxon_lineage_extended`; also reads `inaturalist_data.canonical_to_taxon_id` for the third UNION arm (bridge taxon IDs)
- `data/waba_pipeline.py` — `enrich_taxon_lineage` at line 109; populates `inaturalist_waba_data.taxon_lineage` (3 cols)
- `data/run.py` — `taxon-lineage-extended` STEPS entry at line 88; must be updated to call the new CSV-based loader

### dbt Models Affected
- `data/dbt/models/staging/stg_inat__taxon_lineage_extended.sql` — view on `inaturalist_data.taxon_lineage_extended`; unchanged after Phase 110 (new Python step populates the same source table)
- `data/dbt/models/staging/stg_waba__taxon_lineage.sql` — MUST be rewritten (D-01): currently views `inaturalist_waba_data.taxon_lineage`; becomes a view on `stg_inat__taxon_lineage_extended`
- `data/dbt/models/intermediate/int_specimen_obs_base.sql` — unchanged (still JOINs `stg_waba__taxon_lineage`)
- `data/dbt/models/intermediate/int_species_universe.sql` — unchanged (still JOINs `stg_inat__taxon_lineage_extended`)
- `data/dbt/models/sources.yml` — `inaturalist_waba_data.taxon_lineage` source entry must be removed (D-02)

### S3 Sync Patterns
- `data/nightly.sh` — existing `aws s3 cp` pattern (lines 83–87 for DuckDB pull); TAX-04 requires analogous pull/push for `data/raw/taxa.csv.gz`

### Existing Tests
- `data/tests/test_taxon_lineage_extended.py` — 300-line HTTP-mock suite for the enricher being deleted; planner must decide disposition
- `data/tests/test_taxon_lineage.py` — related taxon lineage tests; check for overlap

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- ETag/Last-Modified caching pattern: look at how `inaturalist_pipeline.py` handles `last_fetch.txt` for delta fetching — analogous approach for taxa.csv.gz
- `aws s3 cp --no-progress` in `nightly.sh` — copy this verbatim for taxa.csv.gz pull/push; follow the same pull-at-start / push-at-end structure

### Established Patterns
- Pipeline steps in `run.py` are `(name, callable)` tuples in `STEPS`; new taxa download step inserts before the `taxon-lineage-extended` step
- DuckDB schema naming: `inaturalist_data` (iNat project data), `inaturalist_waba_data` (WABA-specific iNat data); the new `taxon_lineage_extended` stays in `inaturalist_data`
- dbt staging views use `{{ source('schema', 'table') }}` for DuckDB-backed tables; after D-01, `stg_waba__taxon_lineage` switches from a `source()` to a `ref()` call

### Integration Points
- `inaturalist_data.taxon_lineage_extended` is the table both enricher (to be deleted) and dbt view read from — the new CSV loader must produce the same table name in the same schema
- `data/raw/` is the local cache directory for pipeline raw inputs (check existing structure for conventions)

</code_context>

<specifics>
## Specific Ideas

- Watch: the STATE.md blocker notes "taxa.csv.gz structure (delimiter, ancestry column, active field type) should be verified with smoke test before implementation: `curl --range 0-512 <url> | gzip -dc | head -2`" — researcher should run this and document the actual CSV schema before planning
- Watch: `inactive/synonym rows in taxa.csv.gz — filter WHERE active = true` (from STATE.md)
- The DuckDB ancestry walk uses `unnest(string_split(ancestry,'/'))` per REQUIREMENTS.md TAX-02; the `ancestry` column in taxa.csv.gz is a `/`-separated path of ancestor taxon IDs (e.g., `48460/1/47120/372739/47158/...`)

</specifics>

<deferred>
## Deferred Ideas

- **Test migration strategy** (test_taxon_lineage_extended.py) — left to planner discretion; not a user decision
- **Cluster blobs selection visual feedback** (open todo, score 0.2) — unrelated to Phase 110; not folded

</deferred>

---

*Phase: 110-Offline Taxonomy*
*Context gathered: 2026-05-23*
