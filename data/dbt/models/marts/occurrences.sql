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
-- Snap to the NEAREST county, but only within region_snap_tolerance_deg — see the
-- macro for why the ceiling exists and how 0.2 was measured. Beyond it the point
-- is not in Washington and county is NULL, which is the true answer rather than
-- the nearest-looking one (beeatlas-8pz).
county_fallback AS (
    SELECT _row_id,
        (SELECT c.county FROM wa_counties c
         WHERE ST_Distance(c.geom,
             (SELECT pt FROM occ_pt o2 WHERE o2._row_id = county_dedup._row_id))
             <= {{ region_snap_tolerance_deg() }}
         ORDER BY ST_Distance(c.geom,
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
-- Same ceiling, same reason. Ecoregions are the more forgiving of the two — they
-- are physiographic and genuinely continue across the state line, so the nearest
-- one is often still correct for a point just outside. That makes a fabricated
-- value HARDER to spot here, not easier, which is the argument for capping it on
-- the same terms rather than trusting it further.
eco_fallback AS (
    SELECT _row_id,
        (SELECT e.ecoregion_l3 FROM wa_eco e
         WHERE ST_Distance(e.geom,
             (SELECT pt FROM occ_pt o2 WHERE o2._row_id = eco_dedup._row_id))
             <= {{ region_snap_tolerance_deg() }}
         ORDER BY ST_Distance(e.geom,
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
    dem.elevation_dem_m,
    j.observation_id, j.host_inat_login, j.specimen_count, j.sample_id,
    j.sample_host,
    j.specimen_inat_quality_grade,
    j.is_provisional,
    j.canonical_name,
    j.taxon_id,
    j.tier, j.record_type, j.image_url, j.obs_url, j.user_login, j.license,
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
-- DERIVED elevation (beeatlas-sn8), kept in its own column and never COALESCEd into
-- the RECORDED j.elevation_m. dem_data.elevations is keyed on the coordinate rounded
-- to 6 dp, so the join expression must round identically.
--
-- The record_type guard is the SECOND of two independent defences against
-- fabricating elevations for checklist rows: data/dem_elevation.py never samples a
-- checklist coordinate in the first place. It is repeated here because a checklist
-- placeholder point can COINCIDE with a real non-checklist coordinate — 683 King
-- County checklist rows are parked on one point in downtown Seattle, and if a
-- specimen happens to share it, the lookup row exists and would otherwise join.
LEFT JOIN {{ ref('stg_dem__elevations') }} dem
       ON j.record_type <> 'checklist'
      AND dem.lat = ROUND(j.lat, 6)
      AND dem.lon = ROUND(j.lon, 6)
-- Byte-stable determinism (RESEARCH Pitfall 4; sibling occurrence_places.sql ends the
-- same way). Without a final ORDER BY the parquet row order follows DuckDB's parallel scan
-- of int_combined and flips between builds (beeatlas-zo7). _row_id can't be the sort key —
-- it's ROW_NUMBER() OVER () with no ORDER BY, so its assignment is itself nondeterministic.
-- ORDER BY ALL (not occ_id) because occ_id is NOT guaranteed unique here: the
-- test_no_duplicate_occ_ids check is severity:warn (known "Shape C" OFV fan-out dupes), so
-- ordering by occ_id alone would leave duplicate-occ_id rows tied on their other 34 columns.
-- ORDER BY ALL is a total order over the projection; any genuine tie is byte-identical anyway.
ORDER BY ALL
