-- Mirrors export.py lines 33-40 (wa_eco CTE)
-- A3 resolution: native geom GEOMETRY column present (Phase 47 backfill applied)
-- Cross-staging reference to stg_geo__us_states via ref() (not source()) so the
-- DAG edge is visible in dbt lineage. Filters to WA-intersecting ecoregions only.
{{ config(materialized='view') }}

SELECT
    name AS ecoregion_l3,
    geom
FROM {{ source('geographies', 'ecoregions') }}
WHERE ST_Intersects(
    geom,
    (SELECT geom FROM {{ ref('stg_geo__us_states') }} WHERE abbreviation = 'WA')
)
