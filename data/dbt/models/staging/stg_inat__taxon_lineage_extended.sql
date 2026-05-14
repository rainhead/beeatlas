-- Wraps source('inaturalist_data', 'taxon_lineage_extended').
-- Written by data/inaturalist_pipeline.enrich_taxon_lineage_extended (ingestion
-- step — iNat API calls). Columns: taxon_id (PK BIGINT), family, subfamily,
-- tribe, genus, subgenus (VARCHAR).
-- Used by:
--   int_species_universe: LEFT JOIN on taxon_id for lineage backfill
--   test_lin05_lineage_coverage: coverage ratio assertion (PORT-03)
{{ config(materialized='view') }}

SELECT *
FROM {{ source('inaturalist_data', 'taxon_lineage_extended') }}
