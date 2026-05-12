-- Wraps source('inaturalist_waba_data', 'observations').
-- Used by:
--   int_waba_link (Plan 03): JOIN on _dlt_id for waba_link CTE (export.py:46-55)
--   int_specimen_obs_base (Plan 03): main table for specimen_obs_base CTE
--     (export.py:104-119), joined with taxon_lineage on taxon__id
--   int_provisional_waba_ids (Plan 03): for provisional WABA rows not in matched set
{{ config(materialized='view') }}

SELECT *
FROM {{ source('inaturalist_waba_data', 'observations') }}
