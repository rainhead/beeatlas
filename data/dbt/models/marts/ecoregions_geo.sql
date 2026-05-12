-- Ecoregions GeoJSON mart. Materializes WA ecoregions as a table in dbt_sandbox,
-- then the post-hook emits the FeatureCollection JSON to target/sandbox/ecoregions.geojson.
-- Mirrors export.py:297-313 (export_ecoregions_geojson).
-- Property name: NA_L3NAME (matches export.py:309 and GeoJSON consumer expectations).
-- Simplification tolerance 0.001 matches export.py:301.
{{ config(
    materialized='table',
    post_hook=[
      emit_feature_collection(this, 'NA_L3NAME', 'target/sandbox/ecoregions.geojson')
    ]
) }}

-- stg_geo__ecoregions aliases source `name` to `ecoregion_l3`; re-alias to `name`
-- so the emit_feature_collection macro's inner FROM clause resolves the `name` column.
SELECT ecoregion_l3 AS name, geom
FROM {{ ref('stg_geo__ecoregions') }}
