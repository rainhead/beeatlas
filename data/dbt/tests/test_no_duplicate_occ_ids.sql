{{ config(severity='warn') }}

-- Singular dbt test: no synthetic occ_id may appear more than once in int_combined.
--
-- PASS semantics: this query returns 0 rows (no duplicate occ_ids).
--
-- occ_id is not a stored column in int_combined; it is computed here using the
-- same CASE expression as occurrence_places.sql (lines 43-48) and
-- src/occurrence.ts occIdFromRow (lines 23-30). These three must move together —
-- if the priority order or prefixes change in any one place, update all three.
--
-- Priority order: ecdysis → inat → inat_obs → checklist
--
-- Shape C note: the OFV fan-out bug (obs 288589692 in inaturalist_data.observations__ofvs
-- has a duplicate field_id=9963 / sample_id row) produces ecdysis:6317352 and ecdysis:6317353
-- as apparent duplicates. This is a separate data quality issue (not an arm collision) and
-- is out of scope for Phase 165. The test is set to severity:warn so Shape C does not block
-- the build. Once Shape C is separately fixed, escalate this test to severity:error.

WITH occ_ids AS (
    SELECT
        CASE
            WHEN ecdysis_id IS NOT NULL THEN 'ecdysis:' || ecdysis_id
            WHEN observation_id IS NOT NULL THEN 'inat:' || observation_id
            WHEN specimen_observation_id IS NOT NULL THEN 'inat_obs:' || specimen_observation_id
            WHEN checklist_id IS NOT NULL THEN 'checklist:' || checklist_id
        END AS occ_id
    FROM {{ ref('int_combined') }}
)
SELECT occ_id, COUNT(*) AS dup_count
FROM occ_ids
WHERE occ_id IS NOT NULL
GROUP BY occ_id
HAVING COUNT(*) > 1
