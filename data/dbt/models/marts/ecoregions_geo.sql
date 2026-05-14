-- Ecoregions GeoJSON mart. Materializes WA ecoregions as a table in dbt_sandbox,
-- then the post-hook emits the FeatureCollection JSON to target/sandbox/ecoregions.geojson.
-- Property name: NA_L3NAME (matches GeoJSON consumer expectations).
-- The EPA Level III source has ~160 km² of inter-ecoregion overlaps in WA;
-- `mapshaper -clean -simplify` runs in the run.py post-step to resolve them
-- and simplify topology-aware (#14, fp3).
{{ config(
    materialized='table',
    post_hook=[
      emit_feature_collection(this, 'NA_L3NAME', 'target/sandbox/ecoregions.geojson')
    ]
) }}

-- Clip ecoregion polygons to WA state. The EPA L3 features extend across BC/OR
-- (single Cascades polygon spans ~10° of latitude); the unclipped geom is ~6 MB
-- in GeoJSON form. Clipping reduces the input to mapshaper to a manageable size
-- and matches what the WA Bee Atlas actually displays.
SELECT
    e.ecoregion_l3 AS name,
    ST_Intersection(e.geom, wa.geom) AS geom
FROM {{ ref('stg_geo__ecoregions') }} e
CROSS JOIN (SELECT geom FROM {{ ref('stg_geo__us_states') }} WHERE abbreviation='WA') wa
WHERE ST_Intersects(e.geom, wa.geom)
