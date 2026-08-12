-- iNat observation id -> occ_id linkage for identification attachment
-- (beeatlas-9sy; ADR 0033 item 1: sources join via specimen_observation_id).
--
-- An identification on observation N attaches to every occurrence row linked
-- to N:
--   • an Ecdysis specimen whose catalog row links the observation ->
--     'ecdysis:<ecdysis_id>' (the specimen IS the occurrence; the observation
--     is its photo record)
--   • a waba_specimen (ARM 3) or inat_obs (ARM 4) row -> 'inat_obs:<N>'
-- Sample rows ('inat:<N>') are deliberately absent: those observations are the
-- FLORAL HOST photos, and identifications on plants never bear on bee trust.
--
-- The prefixes and priority mirror the synthetic occ_id CASE shared by
-- occurrence_places.sql, test_no_duplicate_occ_ids.sql, and
-- src/occurrence.ts occIdFromRow — if that CASE changes, change this too.
{{ config(materialized='view') }}

SELECT
    'ecdysis:' || ecdysis_id                     AS occ_id,
    CAST(specimen_observation_id AS BIGINT)      AS observation_id
FROM {{ ref('int_combined') }}
WHERE ecdysis_id IS NOT NULL
  AND specimen_observation_id IS NOT NULL

UNION ALL

SELECT
    'inat_obs:' || specimen_observation_id       AS occ_id,
    CAST(specimen_observation_id AS BIGINT)      AS observation_id
FROM {{ ref('int_combined') }}
WHERE ecdysis_id IS NULL
  AND observation_id IS NULL
  AND specimen_observation_id IS NOT NULL
