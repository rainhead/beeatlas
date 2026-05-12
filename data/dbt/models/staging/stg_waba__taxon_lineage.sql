-- Wraps source('inaturalist_waba_data', 'taxon_lineage').
-- Used by int_specimen_obs_base (Plan 03) via:
--   LEFT JOIN taxon_lineage tl ON tl.taxon_id = waba.taxon__id
-- Provides genus and family columns for the specimen_inat_genus / specimen_inat_family
-- fields of the specimen_obs_base CTE (export.py:114-115).
{{ config(materialized='view') }}

SELECT *
FROM {{ source('inaturalist_waba_data', 'taxon_lineage') }}
