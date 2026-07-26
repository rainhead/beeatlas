-- Wraps source('dem_data', 'elevations').
-- Written by data/dem_elevation.py (ingestion step — reads USGS 3DEP COGs over
-- HTTP; see ingestion-boundary.md). Columns: lat, lon (the PK, rounded to 6
-- decimal places), elevation_dem_m, status ('ok' | 'nodata' | 'no_tile'),
-- dem_source.
--
-- Only status='ok' rows carry an elevation; the other two are negative caching
-- (a coordinate outside 3DEP coverage is asked once, not every nightly). They
-- are filtered out here so downstream models never have to know that a row can
-- exist with a NULL elevation — an absent join partner and a 'no_tile' row mean
-- exactly the same thing to a consumer.
--
-- Used by:
--   marts/occurrences: LEFT JOIN on rounded (lat, lon) → elevation_dem_m
{{ config(materialized='view') }}

SELECT
    lat,
    lon,
    elevation_dem_m,
    dem_source
FROM {{ source('dem_data', 'elevations') }}
WHERE status = 'ok'
