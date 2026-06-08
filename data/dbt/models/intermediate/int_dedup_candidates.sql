-- PLACEHOLDER — DUP-02 candidate join implemented in 136-03.
--
-- int_dedup_candidates: spatial + date + name candidate filter.
-- Joins int_checklist_collapsed against int_ecdysis_base on:
--   exact canonical_name, date_quality='full', year+month match, optional day match,
--   ST_Distance_Sphere(ST_Point(lat, lon), ST_Point(ecdysis_lat, ecdysis_lon)) <= 1000.0 m.
-- CRITICAL: ST_Distance_Sphere uses ST_Point(lat, lon) — latitude first.
-- Python-side collector match (_collectors_match) applied in write_dedup_candidates().
--
-- Emits the pair_key/checklist_ObjectID/ecdysis_id column shape for 136-03 to fill.
{{ config(materialized='table') }}

SELECT
    CAST(NULL AS VARCHAR)  AS pair_key,
    CAST(NULL AS BIGINT)   AS checklist_ObjectID,
    CAST(NULL AS INTEGER)  AS ecdysis_id,
    CAST(NULL AS VARCHAR)  AS canonical_name,
    CAST(NULL AS DOUBLE)   AS checklist_lat,
    CAST(NULL AS DOUBLE)   AS checklist_lon,
    CAST(NULL AS DOUBLE)   AS ecdysis_lat,
    CAST(NULL AS DOUBLE)   AS ecdysis_lon,
    CAST(NULL AS DOUBLE)   AS distance_m,
    CAST(NULL AS INTEGER)  AS checklist_year,
    CAST(NULL AS INTEGER)  AS checklist_month,
    CAST(NULL AS INTEGER)  AS checklist_day,
    CAST(NULL AS VARCHAR)  AS date_quality,
    CAST(NULL AS VARCHAR)  AS ecdysis_date,
    CAST(NULL AS INTEGER)  AS ecdysis_year,
    CAST(NULL AS INTEGER)  AS ecdysis_month,
    CAST(NULL AS INTEGER)  AS ecdysis_day,
    CAST(NULL AS VARCHAR)  AS checklist_collector,
    CAST(NULL AS VARCHAR)  AS ecdysis_collector
WHERE false
