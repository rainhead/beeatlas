-- Wraps source('inaturalist_data', 'observations').
-- Used by:
--   int_ecdysis_base (Plan 03): LEFT JOIN on id = links.host_observation_id
--     for inat_host (taxon__name when Plantae) and inat_quality_grade
--   int_samples_base (Plan 03): main table in the specimen-count JOIN, provides
--     observation_id, user__login, observed_on, longitude/latitude, taxon__*
{{ config(materialized='view') }}

SELECT *
FROM {{ source('inaturalist_data', 'observations') }}
