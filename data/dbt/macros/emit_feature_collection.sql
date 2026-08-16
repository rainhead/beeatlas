-- Shared macro: writes a GeoJSON FeatureCollection to out_path via a DuckDB COPY statement.
-- Called from post-hooks in counties_geo.sql and ecoregions_geo.sql.
--
-- Raw geometry is emitted (no ST_SimplifyPreserveTopology) — the per-feature
-- simplification was retired in quick task 260514-fp3 (#14). Counties now come
-- from the Census Cartographic Boundary 1:5M file (cb_2024_us_county_5m),
-- which is already cartographically generalized and topology-clean. Ecoregions
-- get a topology-aware cleanup via mapshaper in the run.py post-step (which
-- also runs simplification across shared arcs, not per-feature).
--
-- CLEAN-01 (Phase 85): the FORMAT CSV workaround below is intentional and documented.
--
-- WHY NOT FORMAT JSON: it wraps the scalar in {"col_name": value}, which breaks the
--   FeatureCollection root structure. The output must be a bare {type, features} object.
--
-- WHY NOT FORMAT GDAL / DRIVER 'GeoJSON': it adds a "name" key to the FeatureCollection root
--   (e.g. {"type":"FeatureCollection","name":"counties_geo","features":[...]}). The public
--   counties.geojson and ecoregions.geojson have exactly two top-level keys: {type, features}.
--   The "name" key is structurally incompatible. The GDAL driver also writes indented JSON,
--   whereas the current pipeline writes compact JSON; replacing with GDAL would break the
--   diff harness on both structure and whitespace.
--   Verified against DuckDB v1.5.2 spatial extension dc1996b — see 085-RESEARCH.md §CLEAN-01.
--
-- WHY FORMAT CSV WITH EMPTY DELIMITER/QUOTE/HEADER: this is the only DuckDB COPY path that
--   writes a raw scalar VARCHAR verbatim. The single-column SELECT projects the
--   pre-constructed FeatureCollection as a JSON string, and COPY emits it byte-for-byte.
--   The output is byte-comparable to public/data/counties.geojson and
--   public/data/ecoregions.geojson; test_dbt_diff.py confirms parity.
-- Two macros, one COPY trick. emit_feature_collection projects ONE property from a
-- column literally named `name`, which is all counties/ecoregions/wilderness need.
-- emit_place_feature_collection (beeatlas-8gcw) projects {slug, name} for the region
-- layers whose features are PLACES — the Level IV ecoregions — because the frontend
-- resolves a place by slug on click and labels it by name. Kept as a separate macro
-- rather than generalizing the first: counties.geojson and ecoregions.geojson are
-- byte-compared against their published copies by test_dbt_diff, and a property-list
-- refactor of the shared macro is exactly the kind of change that moves those bytes.
{% macro emit_feature_collection(model_relation, property_name, out_path) %}
COPY (
  SELECT json_object(
    'type', 'FeatureCollection',
    'features', (
      SELECT to_json(list({
        'type': 'Feature',
        'properties': {{ "{" }} {{ "'" ~ property_name ~ "'" }}: name {{ "}" }},
        'geometry': ST_AsGeoJSON(geom)::JSON
      }))
      FROM {{ model_relation }}
    )
  )::VARCHAR
) TO '{{ out_path }}' (FORMAT CSV, DELIMITER '', QUOTE '', HEADER false)
{% endmacro %}

{% macro emit_place_feature_collection(model_relation, out_path) %}
COPY (
  SELECT json_object(
    'type', 'FeatureCollection',
    'features', (
      SELECT to_json(list({
        'type': 'Feature',
        'properties': {'slug': slug, 'name': name},
        'geometry': ST_AsGeoJSON(geom)::JSON
      }))
      FROM {{ model_relation }}
    )
  )::VARCHAR
) TO '{{ out_path }}' (FORMAT CSV, DELIMITER '', QUOTE '', HEADER false)
{% endmacro %}
