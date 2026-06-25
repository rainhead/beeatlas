-- Occurrences parquet mart: full spatial-join pipeline translating export.py:199-263.
-- Reads int_combined (materialized as TABLE per RESEARCH Pitfall 5 — prevents re-evaluating
-- the UNION ALL on each spatial join pass), then adds _row_id, ST_Point, county, ecoregion_l3.
--
-- PORT-02 invariants preserved verbatim:
--   - _row_id is ROW_NUMBER() OVER () over int_combined (not an existing PK)
--   - eco_dedup uses DISTINCT ON (_row_id) — DuckDB-specific feature
--   - county_fallback and eco_fallback use correlated (SELECT ... ORDER BY ST_Distance LIMIT 1)
--
-- Sandbox output path: target/sandbox/occurrences.parquet (relative to data/dbt/).
-- Per Pitfall 3: location is relative so external_root (profiles.yml: target/sandbox) applies.
{{ config(
    materialized='external',
    location='target/sandbox/occurrences.parquet',
    format='parquet',
    options={'CODEC': "'SNAPPY'"}
) }}

WITH joined AS (
    SELECT ROW_NUMBER() OVER () AS _row_id, *
    FROM {{ ref('int_combined') }}
),
occ_pt AS (
    SELECT *, ST_Point(lon, lat) AS pt FROM joined
),
wa_counties AS (SELECT * FROM {{ ref('stg_geo__us_counties') }}),
wa_eco      AS (SELECT * FROM {{ ref('stg_geo__ecoregions') }}),
with_county AS (
    SELECT occ_pt._row_id, c.county
    FROM occ_pt
    LEFT JOIN wa_counties c ON ST_Within(occ_pt.pt, c.geom)
),
county_dedup AS (
    SELECT DISTINCT ON (_row_id) _row_id, county
    FROM with_county
),
county_fallback AS (
    SELECT _row_id,
        (SELECT county FROM wa_counties
         ORDER BY ST_Distance(geom,
             (SELECT pt FROM occ_pt o2 WHERE o2._row_id = county_dedup._row_id))
         LIMIT 1) AS county
    FROM county_dedup
    WHERE county IS NULL
),
final_county AS (
    SELECT * FROM county_dedup WHERE county IS NOT NULL
    UNION ALL SELECT * FROM county_fallback
),
with_eco AS (
    SELECT occ_pt._row_id, e.ecoregion_l3
    FROM occ_pt
    LEFT JOIN wa_eco e ON ST_Within(occ_pt.pt, e.geom)
),
eco_dedup AS (
    SELECT DISTINCT ON (_row_id) _row_id, ecoregion_l3
    FROM with_eco
),
eco_fallback AS (
    SELECT _row_id,
        (SELECT ecoregion_l3 FROM wa_eco
         ORDER BY ST_Distance(geom,
             (SELECT pt FROM occ_pt o2 WHERE o2._row_id = eco_dedup._row_id))
         LIMIT 1) AS ecoregion_l3
    FROM eco_dedup
    WHERE ecoregion_l3 IS NULL
),
final_eco AS (
    SELECT * FROM eco_dedup WHERE ecoregion_l3 IS NOT NULL
    UNION ALL SELECT * FROM eco_fallback
)
-- Phase 160 (D-02): place_slug dropped from this mart; place membership is now the
-- many-to-many occurrence_places bridge (data/dbt/models/marts/occurrence_places.sql).
SELECT
    j.ecdysis_id, j.catalog_number,
    j.lon, j.lat, j.date, j.year, j.month,
    j.recordedBy, j.fieldNumber,
    j.floralHost, j.host_observation_id, j.inat_host, j.inat_quality_grade,
    j.modified, j.specimen_observation_id, j.elevation_m,
    j.observation_id, j.host_inat_login, j.specimen_count, j.sample_id,
    j.sample_host,
    j.specimen_inat_quality_grade,
    j.is_provisional,
    j.canonical_name,
    j.taxon_id,
    j.source, j.image_url, j.obs_url, j.user_login, j.license,
    fc.county, fe.ecoregion_l3,
    j.checklist_id,
    j.verbatim_name,
    j.locality,
    j.collapsed_count,
    j.collector_inat_login,
    j.id_date
FROM joined j
JOIN final_county fc ON fc._row_id = j._row_id
JOIN final_eco    fe ON fe._row_id = j._row_id
