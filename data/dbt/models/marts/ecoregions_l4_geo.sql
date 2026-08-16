-- Level IV ecoregions GeoJSON mart (beeatlas-8gcw). The fourth region overlay,
-- alongside counties_geo / ecoregions_geo / wilderness_geo, and the only one whose
-- features are also PLACES: places_load turns each EPA Level IV ecoregion into a row
-- in geographies.places, so this model reads that table rather than the raw
-- geographies.ecoregions_l4 layer. Reading the places table is what guarantees the
-- overlay's slugs are the same slugs the occurrence_places bridge, the place pages
-- and the `place=` URL param use — one geometry, one identity, no second derivation.
--
-- Properties are {slug, name}, matching places.geojson, so <bee-map> drives both
-- overlays through one click handler and one slug-keyed highlight.
--
-- Like the Level III mart, the source carries inter-feature overlaps and far more
-- vertices than a web map needs (~7.7 MB raw over 57 features); `mapshaper -clean
-- -simplify` runs in the topology-postprocess step and writes the published
-- ecoregions_l4.clean.geojson.
--
-- No clip to the state outline: these come from the EPA's per-state Level IV files,
-- so the state edge is already the source's own (see geographies_pipeline).
{{ config(
    materialized='table',
    post_hook=[
      emit_place_feature_collection(this, 'target/sandbox/ecoregions_l4.geojson')
    ]
) }}

SELECT
    slug,
    name,
    geom
FROM {{ source('geographies', 'places') }}
WHERE kind = 'ecoregion_l4'
ORDER BY slug
