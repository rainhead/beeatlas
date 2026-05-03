---
name: iNat taxonomy via Darwin Core Archive
description: Replace both live iNat /v2/taxa enrichers with a monthly Darwin Core Archive download; consolidates taxon_lineage tables and removes rate-limit risk
type: project
trigger_condition: v3.3+ — when consolidating the two lineage tables (already deferred from Phase 76 CONTEXT.md)
planted_date: 2026-05-02
---

## Problem

The data pipeline has two functions that walk iNat ancestor chains via the live
`/v2/taxa/{ids}` endpoint:

- `data/waba_pipeline.py::enrich_taxon_lineage` → `inaturalist_waba_data.taxon_lineage(taxon_id, genus, family)`
- `data/inaturalist_pipeline.py::enrich_taxon_lineage_extended` → `inaturalist_data.taxon_lineage_extended(taxon_id, family, subfamily, tribe, genus, subgenus)`

Both are subject to iNat's ~60 req/min rate limit. The Phase 76 enricher
tripped 429 throttling on a clean DB and required adding a retry-with-backoff
helper as a band-aid (Phase 76 UAT, 2026-05-02).

## Proposal

iNat publishes its complete taxonomy as a Darwin Core Archive once a month at
`https://www.inaturalist.org/taxa/inaturalist-taxonomy.dwca.zip`. The archive
contains `Taxon.tsv` with `taxonID`, `parentNameUsageID`, `scientificName`,
`taxonRank` for ~1.5M+ taxa across all of life.

Replace both enrichers with one offline lookup:

1. New `data/inat_taxonomy_pipeline.py` step downloads the DwC-A (cached by
   ETag/Last-Modified to avoid re-downloading unchanged archives).
2. Filter to taxa we observe (UNION of inat + waba taxon IDs) plus their
   ancestors, walking the parent chain in DuckDB after a single bulk load.
3. Materialize one wider table that supersedes both existing lineage tables.
4. Update `export.py:116` (current `LEFT JOIN inaturalist_waba_data.taxon_lineage`)
   to read from the new table.
5. Delete `enrich_taxon_lineage`, `enrich_taxon_lineage_extended`, and the
   retry helper they share.
6. Drop `inaturalist_waba_data.taxon_lineage` once nothing reads it.

## Wins

- **Zero rate-limit risk.** No live API calls in the hot pipeline path.
- **Faster.** One bulk download replaces hundreds of HTTP round trips.
- **Deterministic.** Reproducible — pin the archive snapshot date if needed.
- **Consolidates the two-table situation** that Phase 76 CONTEXT.md already
  flagged as a v3.3+ candidate.
- **Less code to test.** No mocked HTTP, no retry edge cases, no batch sizing.

## Costs

- Archive is ~150MB compressed / ~1GB+ uncompressed (full tree of life).
- Adds a download/cache step. Decisions: where the cache lives (`data/cache/`?
  outside the repo?), refresh cadence (every pipeline run? weekly? on ETag
  change?), CI implications (does the schema gate need it?).
- Less timely than live API. For bee taxonomy this is essentially never an
  issue — bee taxonomy churns slowly. Cadence concern only matters for taxa
  added to iNat in the past few weeks.

## Open questions to settle in plan-phase

- Cache location and lifecycle (in-repo gitignored vs external).
- ETag / Last-Modified handling vs unconditional re-download.
- Pin to a snapshot date for reproducibility, or always pull latest?
- Migration: ship side-by-side first (v3.3 milestone) and cut over after one
  successful nightly run, or do it in one cutover commit?
- Test fixtures: ship a tiny synthetic Taxon.tsv subset, or generate it from
  the real archive once and freeze?

## Related artifacts

- `.planning/phases/076-data-foundation/076-UAT.md` — the 429 incident that
  prompted this seed.
- `.planning/phases/076-data-foundation/076-CONTEXT.md` § Deferred Ideas —
  "Consolidate the two lineage tables" already captured this direction.
- `data/inaturalist_pipeline.py::_inat_get_with_retry` — the band-aid retry
  helper that this work would delete along with both enrichers.
