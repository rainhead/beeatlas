-- DUP-01: Collapse exact-duplicate checklist records to lowest-ObjectID survivor.
--
-- Grouping keys: canonical_name, lat, lon, year, month, day, date_quality, recordedBy
-- D-03: NULL recordedBy rows each form their own group (no cross-NULL collapse).
--       COALESCE(recordedBy, CAST(ObjectID AS VARCHAR)) keeps them distinct.
-- D-04: collapsed_count = group size; 1 for unique rows.
--
-- Expensive full-table aggregate — materialize as table so downstream models
-- (int_dedup_candidates, int_checklist_dedup_status) read the result once.
{{ config(materialized='table') }}

WITH keyed AS (
    SELECT
        ObjectID,
        canonical_name,
        lat,
        lon,
        year,
        month,
        day,
        date_quality,
        recordedBy,
        verbatim_name,
        locality,
        family,
        coord_flag,
        taxon_id,
        -- D-03: Use raw ObjectID (not MIN) so each NULL-recordedBy row has a
        -- unique coalesced key — preventing NULL-collector rows from collapsing.
        COALESCE(recordedBy, CAST(ObjectID AS VARCHAR)) AS collector_key
    FROM {{ ref('stg_checklist__records_full') }}
)

SELECT
    MIN(ObjectID)         AS ObjectID,           -- D-03: lowest ObjectID survives
    canonical_name,
    lat,
    lon,
    year,
    month,
    day,
    date_quality,
    -- Restore original recordedBy (NULL if NULL): carry from the surviving row.
    -- Since all rows in a group share the same recordedBy (or are individually NULL),
    -- MIN() preserves the value (NULL is ignored by MIN, so real names win;
    -- pure-NULL groups return NULL which is correct).
    MIN(recordedBy)       AS recordedBy,
    MIN(verbatim_name)    AS verbatim_name,
    MIN(locality)         AS locality,
    MIN(family)           AS family,
    MIN(coord_flag)       AS coord_flag,
    MIN(taxon_id)         AS taxon_id,
    COUNT(*)              AS collapsed_count      -- D-04: group size; 1 if unique
FROM keyed
GROUP BY canonical_name, lat, lon, year, month, day, date_quality, collector_key
