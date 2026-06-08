-- DUP-02: Cross-source candidate pairs — int_checklist_collapsed × int_ecdysis_base.
--
-- Joins post-collapse checklist records against Ecdysis specimens on:
--   1. Exact canonical_name match
--   2. date_quality = 'full' (D-06 — excludes year-only/none; must NOT use bare year IS NOT NULL,
--      see Anti-Pattern 4: 'year_only' rows have non-NULL year but NULL month/day)
--   3. Year + month match; day compared only when both sides carry a day (coarser shared precision)
--   4. Both sides carry non-NULL coordinates
--   5. ST_Distance_Sphere <= 1000.0 m (D-07)
--
-- CRITICAL AXIS-ORDER TRAP: ST_Distance_Sphere uses ST_Point(lat, lon) — LATITUDE FIRST.
-- This is the OPPOSITE of ST_Point(lon, lat) used everywhere else for ST_Within.
-- Verified 2026-06-08 (Pitfall 1, 136-RESEARCH.md): wrong order silently produces ~59 km
-- per degree instead of ~111 km, blowing the 1 km window wide open.
-- Every ST_Point feeding ST_Distance_Sphere in this file uses ST_Point(lat, lon).
--
-- D-05: Collector token-set filter (Python _collectors_match) is applied DOWNSTREAM in
-- write_dedup_candidates() — raw collector strings carried here for Python filtering.
--
-- D-07 threshold constant: DEDUP_DISTANCE_THRESHOLD_M = 1000.0 m (Python: checklist_dedup.py)
--
-- References int_checklist_collapsed (NOT stg_checklist__records_full) so pair_key carries
-- the post-collapse survivor ObjectID — pair_key stability invariant (D-02, T-136-06).
{{ config(materialized='table') }}

WITH ecdysis_dated AS (
    -- Derive day from ecdysis_date VARCHAR via TRY_CAST; filter to rows with usable dates.
    -- Note: int_ecdysis_base aliases o.event_date AS ecdysis_date — use that name here.
    -- D-06: exclude year-only / NULL Ecdysis dates (rows missing year, month, or ecdysis_date).
    SELECT
        ecdysis_id,
        ecdysis_lat,
        ecdysis_lon,
        canonical_name,
        year,
        month,
        TRY_CAST(EXTRACT('day' FROM TRY_CAST(ecdysis_date AS DATE)) AS INTEGER) AS day,
        ecdysis_date,
        recordedBy
    FROM {{ ref('int_ecdysis_base') }}
    WHERE ecdysis_lat IS NOT NULL
      AND ecdysis_lon IS NOT NULL
      AND year IS NOT NULL
      AND month IS NOT NULL
      AND ecdysis_date IS NOT NULL
)

SELECT
    -- D-02: pair_key = "<post-collapse survivor ObjectID>|<ecdysis_id>"
    (CAST(cl.ObjectID AS VARCHAR) || '|' || CAST(ec.ecdysis_id AS VARCHAR)) AS pair_key,
    cl.ObjectID   AS checklist_ObjectID,
    ec.ecdysis_id,
    cl.canonical_name,
    cl.lat        AS checklist_lat,
    cl.lon        AS checklist_lon,
    ec.ecdysis_lat,
    ec.ecdysis_lon,
    -- CRITICAL: ST_Distance_Sphere uses ST_Point(lat, lon) — lat FIRST (see header comment)
    ST_Distance_Sphere(
        ST_Point(cl.lat, cl.lon),
        ST_Point(ec.ecdysis_lat, ec.ecdysis_lon)
    )             AS distance_m,
    cl.year       AS checklist_year,
    cl.month      AS checklist_month,
    cl.day        AS checklist_day,
    cl.date_quality,
    ec.ecdysis_date,
    ec.year       AS ecdysis_year,
    ec.month      AS ecdysis_month,
    ec.day        AS ecdysis_day,
    cl.recordedBy AS checklist_collector,
    ec.recordedBy AS ecdysis_collector
FROM {{ ref('int_checklist_collapsed') }} cl
JOIN ecdysis_dated ec
    ON  cl.canonical_name = ec.canonical_name       -- exact accepted-name match
    AND cl.date_quality = 'full'                    -- D-06: filter on date_quality, NOT year IS NOT NULL
    AND cl.year = ec.year
    AND cl.month = ec.month
    AND (
        cl.day IS NULL
        OR ec.day IS NULL
        OR cl.day = ec.day                          -- D-06: day required only when both present
    )
    AND cl.lat IS NOT NULL
    AND cl.lon IS NOT NULL
    -- Bounding-box prefilter (advisory performance guard before expensive haversine):
    -- ±0.012 deg lat ≈ ±1.33 km, ±0.016 deg lon ≈ ±1.25 km at lat 47
    AND ABS(cl.lat - ec.ecdysis_lat) <= 0.012
    AND ABS(cl.lon - ec.ecdysis_lon) <= 0.016
    -- Precise 1 km window (D-07: DEDUP_DISTANCE_THRESHOLD_M = 1000.0 m)
    -- CRITICAL: ST_Point(lat, lon) — lat FIRST for ST_Distance_Sphere (see header)
    AND ST_Distance_Sphere(
            ST_Point(cl.lat, cl.lon),
            ST_Point(ec.ecdysis_lat, ec.ecdysis_lon)
        ) <= 1000.0
-- D-05: collector filter applied in Python (checklist_dedup.write_dedup_candidates)
