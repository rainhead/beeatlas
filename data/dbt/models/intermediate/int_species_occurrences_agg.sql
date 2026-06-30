-- Per-species temporal aggregates from ecdysis_data.occurrences.
-- Mirrors species_export.py lines 116-140 (occurrences_agg CTE).
-- NOTE: month_histogram NULL backfill (for checklist-only rows in the FULL OUTER
-- JOIN) is handled in int_species_universe via CASE expression — DuckDB COALESCE
-- on INTEGER[12] is unimplemented in 1.4.x (Phase 078-02).
-- NOTE: reads source('ecdysis_data', 'occurrences') directly — NOT
-- ref('stg_ecdysis__occurrences') — because the staging view applies a
-- decimal_latitude IS NOT NULL spatial filter that must NOT exclude temporally
-- valid records with null coordinates (PATTERNS.md Note + Surprise 3).
-- CROSS-LAYER: specimen_count here agrees with isSpecimenBacked() in src/occurrence.ts,
-- which is the canonical cross-layer definition for "confirmed specimen" (SEM-01).
-- This site is structurally correct without an explicit ecdysis_id predicate because
-- it reads ecdysis_data.occurrences directly — every row in that table IS an Ecdysis
-- specimen, so id IS NOT NULL is structurally equivalent to "confirmed specimen".
-- The diverging site places_export.py:_query_counts was aligned to ecdysis_id IS NOT NULL
-- in phase 104 (SEM-01) to match this definition.
{{ config(materialized='view') }}

-- Synonymy: this reads the raw Ecdysis source, which may carry junior/gender-variant
-- names (e.g. 'coelioxys octodentata' alongside accepted 'octodentatus'). Route the
-- group key through int_synonyms so synonymous spellings collapse into one species row
-- — mirroring the inat_obs arm of int_species_universe. Without this, a synonym present
-- in raw Ecdysis leaks a duplicate species into the universe.
SELECT
    COALESCE(syn.accepted_name, o.canonical_name) AS canonical_name,
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
FROM {{ source('ecdysis_data', 'occurrences') }} o
LEFT JOIN {{ ref('int_synonyms') }} syn ON syn.synonym = o.canonical_name
WHERE o.canonical_name IS NOT NULL
GROUP BY COALESCE(syn.accepted_name, o.canonical_name)
