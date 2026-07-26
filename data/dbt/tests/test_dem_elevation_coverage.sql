-- Singular dbt test (beeatlas-sn8): the DEM lookup should reach essentially every
-- non-checklist occurrence. Warns when coverage drops below 95%.
--
-- WHAT THIS ACTUALLY GUARDS. data/dem_elevation.py seeds its coordinate set by
-- ENUMERATING the four source relations that feed int_combined's non-checklist arms.
-- That enumeration is a hand-maintained mirror of int_combined, and it has already
-- been wrong once during development: ARM 2 and ARM 1's COALESCE fallback read
-- coordinates from inaturalist_data.observations, not from the WABA schema the arm
-- names suggest. Add a sixth arm — or repoint an existing one at a different
-- relation — and the lookup silently stops covering it, with no error anywhere:
-- elevation_dem_m just goes NULL for those rows, which is indistinguishable from
-- "no elevation data" to every consumer. This test is what makes that visible.
--
-- WARN, not error, and deliberately so. The lookup is populated by an ingestion step
-- that reads USGS over the network. A 3DEP outage on the night a large batch of new
-- observations lands leaves those coordinates unsampled until the next run — real,
-- self-healing, and not a reason to block a publish. Coverage drifting DOWN and
-- STAYING down across runs is the signal worth chasing; a single dip is not.
--
-- Checklist rows are excluded from the denominator, not counted as failures: they
-- are never sampled on purpose (31% of them sit on shared placeholder points — see
-- data/dem_elevation.py), so counting them here would peg coverage at ~80% forever
-- and train everyone to ignore the warning.
{{ config(severity='warn') }}
WITH coverage AS (
    SELECT
        COUNT(*)                                                        AS total,
        SUM(CASE WHEN elevation_dem_m IS NOT NULL THEN 1 ELSE 0 END)    AS covered
    FROM {{ ref('occurrences') }}
    WHERE record_type <> 'checklist'
)
SELECT total, covered, CAST(covered AS DOUBLE) / NULLIF(total, 0) AS ratio
FROM coverage
WHERE CAST(covered AS DOUBLE) / NULLIF(total, 0) < 0.95
