-- Wilderness GeoJSON mart (beeatlas-2vj). Materializes the WA wilderness
-- no-collect overlay as a table in dbt_sandbox, then the post-hook emits the
-- FeatureCollection to target/sandbox/wilderness.geojson.
-- Property name: 'name' (the wilderness unit name, e.g. "Alpine Lakes Wilderness").
--
-- PAD-US splits some wilderness areas into multiple rows by managing agency
-- (a Forest Service portion and an adjacent BLM/NPS portion of the same unit);
-- dissolve by name so each named wilderness is a single feature with a single
-- label. mapshaper -clean/-simplify runs in the run.py topology-postprocess step.
{{ config(
    materialized='table',
    post_hook=[
      emit_feature_collection(this, 'name', 'target/sandbox/wilderness.geojson')
    ]
) }}

SELECT
    name,
    ST_Union_Agg(geom) AS geom
FROM {{ ref('stg_geo__wilderness') }}
GROUP BY name
-- A GROUP BY comes out in whatever order DuckDB's threads finish, and the post-hook
-- emits the features in table order, so two builds of the same data wrote the
-- features in different orders (beeatlas-3je9's determinism check). Names are
-- unique after the dissolve; ecoregions_l4_geo orders by slug the same way.
ORDER BY name
