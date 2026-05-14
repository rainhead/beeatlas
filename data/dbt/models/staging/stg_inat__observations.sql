-- Wraps source('inaturalist_data', 'observations').
-- Used by:
--   int_ecdysis_base (Plan 03): LEFT JOIN on id = links.host_observation_id
--     for inat_host (taxon__name when Plantae) and inat_quality_grade
--   int_samples_base (Plan 03): main table in the specimen-count JOIN, provides
--     observation_id, user__login, observed_on, longitude/latitude, taxon__*
--
-- WHERE filter is load-bearing: the dlt soft-delete tombstone row (id=NULL,
-- is_deleted=True, all domain fields NULL) must be excluded here. The tombstone
-- is preserved in the raw inaturalist_data.observations schema for dlt merge
-- bookkeeping and must NOT be removed at the source. Filtering at the staging
-- layer is safe: NULL never equi-joins downstream (int_ecdysis_base LEFT JOIN
-- uses inat.id = links.host_observation_id; NULL = anything is always false).
-- Post-filter row count: 10,845 (from 10,846). See TEST-01 / Plan 085-01.
{{ config(materialized='view') }}

SELECT *
FROM {{ source('inaturalist_data', 'observations') }}
WHERE id IS NOT NULL
