-- Mirrors export.py lines 28-32 (wa_counties CTE)
-- A3 resolution: native geom GEOMETRY column present (Phase 47 backfill applied)
-- Filters to WA only (state_fips = '53') at the staging layer so all downstream
-- models see only WA counties without repeating the filter.
{{ config(materialized='view') }}

SELECT
    name AS county,
    geom
FROM {{ source('geographies', 'us_counties') }}
WHERE state_fips = '53'
