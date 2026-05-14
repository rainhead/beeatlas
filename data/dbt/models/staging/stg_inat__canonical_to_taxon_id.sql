-- Wraps source('inaturalist_data', 'canonical_to_taxon_id').
-- Written by data/resolve_taxon_ids.py (ingestion step — iNat API calls;
-- see ingestion-boundary.md). Columns: canonical_name (PK), taxon_id,
-- resolved_at, source.
-- Used by:
--   int_species_universe: LEFT JOIN to resolve canonical_name → taxon_id
--   test_lin05_lineage_coverage: coverage ratio assertion (PORT-03)
{{ config(materialized='view') }}

SELECT *
FROM {{ source('inaturalist_data', 'canonical_to_taxon_id') }}
