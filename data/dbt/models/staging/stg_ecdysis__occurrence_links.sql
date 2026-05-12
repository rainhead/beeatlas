-- Wraps source('ecdysis_data', 'occurrence_links').
-- Used by int_ecdysis_base (Plan 03) via:
--   LEFT JOIN stg_ecdysis__occurrence_links links ON links.occurrence_id = o.occurrence_id
-- Key columns: occurrence_id (join key from occurrences side) and host_observation_id
-- (join key to inaturalist_data.observations for floral host lookup).
{{ config(materialized='view') }}

SELECT *
FROM {{ source('ecdysis_data', 'occurrence_links') }}
