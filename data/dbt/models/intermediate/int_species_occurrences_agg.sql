-- Per-species temporal aggregates from ecdysis_data.occurrences.
-- Mirrors species_export.py lines 116-140 (occurrences_agg CTE).
-- NOTE: month_histogram NULL backfill (for checklist-only rows in the FULL OUTER
-- JOIN) is handled in int_species_universe via CASE expression — DuckDB COALESCE
-- on INTEGER[12] is unimplemented in 1.4.x (Phase 078-02).
-- NOTE: reads source('ecdysis_data', 'occurrences') directly — NOT
-- ref('stg_ecdysis__occurrences') — because the staging view applies a
-- decimal_latitude IS NOT NULL spatial filter that must NOT exclude temporally
-- valid records with null coordinates (PATTERNS.md Note + Surprise 3).
{{ config(materialized='view') }}

SELECT
    canonical_name,
    COUNT(*) AS occurrence_count,
    CAST(SUM(CASE WHEN id IS NOT NULL THEN 1 ELSE 0 END) AS BIGINT) AS specimen_count,
    MIN(TRY_CAST(event_date AS DATE)) AS first_occurrence_date,
    MAX(TRY_CAST(event_date AS DATE)) AS last_occurrence_date,
    list_value(
        SUM(CASE WHEN TRY_CAST(month AS INT) =  1 THEN 1 ELSE 0 END),
        SUM(CASE WHEN TRY_CAST(month AS INT) =  2 THEN 1 ELSE 0 END),
        SUM(CASE WHEN TRY_CAST(month AS INT) =  3 THEN 1 ELSE 0 END),
        SUM(CASE WHEN TRY_CAST(month AS INT) =  4 THEN 1 ELSE 0 END),
        SUM(CASE WHEN TRY_CAST(month AS INT) =  5 THEN 1 ELSE 0 END),
        SUM(CASE WHEN TRY_CAST(month AS INT) =  6 THEN 1 ELSE 0 END),
        SUM(CASE WHEN TRY_CAST(month AS INT) =  7 THEN 1 ELSE 0 END),
        SUM(CASE WHEN TRY_CAST(month AS INT) =  8 THEN 1 ELSE 0 END),
        SUM(CASE WHEN TRY_CAST(month AS INT) =  9 THEN 1 ELSE 0 END),
        SUM(CASE WHEN TRY_CAST(month AS INT) = 10 THEN 1 ELSE 0 END),
        SUM(CASE WHEN TRY_CAST(month AS INT) = 11 THEN 1 ELSE 0 END),
        SUM(CASE WHEN TRY_CAST(month AS INT) = 12 THEN 1 ELSE 0 END)
    )::INTEGER[12] AS month_histogram
FROM {{ source('ecdysis_data', 'occurrences') }}
WHERE canonical_name IS NOT NULL
GROUP BY canonical_name
