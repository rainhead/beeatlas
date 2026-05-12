-- Shared macro: writes a GeoJSON FeatureCollection to out_path via a DuckDB COPY statement.
-- Called from post-hooks in counties_geo.sql and ecoregions_geo.sql.
-- Mirrors export.py:280-314 (ST_AsGeoJSON + ST_SimplifyPreserveTopology with tolerance 0.001).
-- Pattern 5 from 083-RESEARCH.md (lines 427-443).
-- Hand-rolled FeatureCollection (not GDAL driver) to match export.py's minimal output:
--   {type: Feature, properties: {<NAME|NA_L3NAME>: ...}, geometry: ...} with no crs/id/bbox fields.
--
-- Implementation note: FORMAT CSV with no header/delimiter/quote writes raw text — the only
-- DuckDB COPY format that writes a scalar VARCHAR value verbatim. FORMAT JSON wraps the value
-- in {"col_name": value}, which breaks FeatureCollection structure.
{% macro emit_feature_collection(model_relation, property_name, out_path) %}
COPY (
  SELECT json_object(
    'type', 'FeatureCollection',
    'features', (
      SELECT to_json(list({
        'type': 'Feature',
        'properties': {{ "{" }} {{ "'" ~ property_name ~ "'" }}: name {{ "}" }},
        'geometry': ST_AsGeoJSON(ST_SimplifyPreserveTopology(geom, 0.001))::JSON
      }))
      FROM {{ model_relation }}
    )
  )::VARCHAR
) TO '{{ out_path }}' (FORMAT CSV, DELIMITER '', QUOTE '', HEADER false)
{% endmacro %}
