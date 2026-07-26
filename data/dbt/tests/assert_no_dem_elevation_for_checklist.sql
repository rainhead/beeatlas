{{ config(severity='error') }}
-- Singular dbt test (beeatlas-sn8): no checklist occurrence may carry a DEM-derived
-- elevation. Returns the offending rows, so a failure names them.
--
-- ERROR, unlike its sibling test_dem_elevation_coverage. Missing coverage is a
-- degraded answer; a checklist row WITH an elevation is a FABRICATED one. 31% of
-- checklist rows (6,090 of 19,929) sit on 45 shared placeholder points — 683 King
-- County records are parked on a single coordinate in downtown Seattle. Sampling a
-- DEM there returns the elevation of that placeholder, not of anywhere a bee was
-- found, and it would arrive in the same column, with the same type, as a value
-- derived from a real coordinate. Nothing downstream could tell them apart.
--
-- Two independent mechanisms already prevent this (dem_elevation.py never samples a
-- checklist coordinate; marts/occurrences.sql refuses the join for record_type =
-- 'checklist'). This test exists because BOTH are easy to undo by accident — the
-- first by adding checklist_data to _SEED_SOURCES "for completeness", the second by
-- tidying what looks like a redundant predicate out of the join condition. Either
-- alone is silent; this is the check that isn't.
SELECT occ_id_probe.*
FROM (
    SELECT record_type, lat, lon, canonical_name, elevation_dem_m
    FROM {{ ref('occurrences') }}
    WHERE record_type = 'checklist'
      AND elevation_dem_m IS NOT NULL
) occ_id_probe
