-- Counties GeoJSON mart. Materializes WA counties as a table in dbt_sandbox,
-- then the post-hook emits the FeatureCollection JSON to target/sandbox/counties.geojson.
-- Property name: NAME (matches GeoJSON consumer expectations).
-- Source is Census Cartographic Boundary 1:5M (cb_2024_us_county_5m), which is
-- topology-clean from the source — no post-process needed (#14, fp3).
{{ config(
    materialized='table',
    post_hook=[
      emit_feature_collection(this, 'NAME', 'target/sandbox/counties.geojson')
    ]
) }}

-- stg_geo__us_counties aliases source `name` to `county`; re-alias to `name`
-- so the emit_feature_collection macro's inner FROM clause resolves the `name` column.
SELECT county AS name, geom
FROM {{ ref('stg_geo__us_counties') }}
