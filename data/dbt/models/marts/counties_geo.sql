-- Counties GeoJSON mart. Materializes WA counties as a table in dbt_sandbox,
-- then the post-hook emits the FeatureCollection JSON to target/sandbox/counties.geojson.
-- Mirrors export.py:280-294 (export_counties_geojson).
-- Property name: NAME (matches export.py:289 and GeoJSON consumer expectations).
-- Simplification tolerance 0.001 matches export.py:284.
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
