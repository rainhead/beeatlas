-- Wraps source('inaturalist_waba_data', 'observations__ofvs').
-- No filter at this layer — field_id filtering happens downstream:
--   int_waba_link (Plan 03): field_id = 18116 (catalog number OFV)
--   int_provisional_waba_ids arm (Plan 03): field_id = 1718 (host observation URL OFV)
-- Key columns: _dlt_root_id (join to waba_observations._dlt_id), field_id, value
{{ config(materialized='view') }}

SELECT *
FROM {{ source('inaturalist_waba_data', 'observations__ofvs') }}
