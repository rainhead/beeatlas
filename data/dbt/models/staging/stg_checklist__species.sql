-- Wraps source('checklist_data', 'species').
-- Contains the authoritative bee species checklist: scientificName, canonical_name,
-- family, subfamily, tribe, genus, subgenus, specific_epithet, status columns.
-- Used by:
--   int_species_universe: FULL OUTER JOIN axis (checklist half)
--   test_lin05_lineage_coverage: species_universe CTE
{{ config(materialized='view') }}

SELECT *
FROM {{ source('checklist_data', 'species') }}
