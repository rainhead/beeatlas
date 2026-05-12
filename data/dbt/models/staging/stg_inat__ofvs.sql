-- Wraps source('inaturalist_data', 'observations__ofvs').
-- No filter at this layer — field_id filtering happens in int_samples_base:
--   field_id = 8338 for specimen_count (sc.value)
--   field_id = 9963 for sample_id (sid.value)
-- Key columns: _dlt_root_id (join to observations._dlt_id), field_id, value
{{ config(materialized='view') }}

SELECT *
FROM {{ source('inaturalist_data', 'observations__ofvs') }}
