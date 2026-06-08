-- PLACEHOLDER — DUP-01 collapse implemented in 136-02.
--
-- int_checklist_collapsed: collapses exact-duplicate checklist records by
-- (canonical_name, lat, lon, year, month, day, date_quality, recordedBy),
-- keeping MIN(ObjectID) as the survivor and COUNT(*) as collapsed_count.
-- D-03: NULL recordedBy rows form their own groups (per-ObjectID key).
{{ config(materialized='table') }}

SELECT * FROM {{ ref('stg_checklist__records_full') }}
