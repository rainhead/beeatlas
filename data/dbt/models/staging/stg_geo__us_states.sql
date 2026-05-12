-- Thin SELECT over source('geographies', 'us_states').
-- No WA filter at this layer — the WA filter is applied by stg_geo__ecoregions
-- as a subquery (ST_Intersects). Output columns exposed for that subquery:
-- abbreviation (for WHERE abbreviation = 'WA'), name, geom.
-- A3 resolution: native geom GEOMETRY column present (Phase 47 backfill applied)
{{ config(materialized='view') }}

SELECT
    abbreviation,
    name,
    geom
FROM {{ source('geographies', 'us_states') }}
