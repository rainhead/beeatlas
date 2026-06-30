-- Species universe: FULL OUTER JOIN of checklist + ecdysis occurrences with
-- lineage backfill. Mirrors species_export.py lines 157-208.
-- Materialized as TABLE to prevent re-evaluating the FULL OUTER JOIN on each
-- mart pass (same reason as int_combined).
-- NOTE: month_histogram uses COALESCE element-wise addition. The original four-branch
-- CASE approach (NULL guards per arm) was changed because DuckDB 1.5.2 materialization
-- produces corrupt values when both arms are non-NULL INTEGER[] arrays (garbage floats/ints).
-- COALESCE(arr[n], 0)::INTEGER + COALESCE(arr[n], 0)::INTEGER avoids all branching on arrays.
-- slug column is NOT emitted here — it is added by the Python post-step
-- (Plan 086-05) reading the species mart parquet. The _slugify function uses
-- unicodedata.normalize('NFKD') which cannot be replicated byte-identically in SQL.
{{ config(materialized='table') }}

WITH occ_agg AS (
    SELECT canonical_name, occurrence_count, specimen_count, first_occurrence_date,
           last_occurrence_date, month_histogram::INTEGER[] AS month_histogram
    FROM {{ ref('int_species_occurrences_agg') }}
),
checklist_month_agg AS (
    -- Aggregate checklist month data per species (NULL months skipped — ~15% of rows).
    -- Pattern mirrors int_species_occurrences_agg.sql list_value(SUM(CASE...))::INTEGER[12].
    -- Only non-NULL months contribute to the histogram (D-11).
    SELECT
        canonical_name,
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
        ) AS checklist_month_histogram
    FROM {{ ref('checklist') }}
    WHERE canonical_name IS NOT NULL
      AND month IS NOT NULL
    GROUP BY canonical_name
),
checklist_count_agg AS (
    -- UIX-04: Re-sourced from int_checklist_dedup_status (deduped, coord-bearing promoted arm)
    -- so checklist_count equals the actual point record count in occurrences.parquet.
    -- Previously read ref('checklist') (old county-level mart, 42k rows) — wrong post-Phase-137.
    -- Uses same filter as ARM 4 in int_combined.sql to guarantee count agreement.
    -- Uses ref('int_checklist_dedup_status') NOT ref('occurrences') to avoid the external-parquet
    -- circular DAG (int_species_universe → species mart → occurrences external parquet).
    SELECT canonical_name, COUNT(*) AS checklist_count
    FROM {{ ref('int_checklist_dedup_status') }}
    WHERE canonical_name IS NOT NULL
      AND dedup_status IS DISTINCT FROM 'confirmed'
      AND lat IS NOT NULL AND lon IS NOT NULL
    GROUP BY canonical_name
),
checklist_record_count_agg AS (
    -- Total checklist records per species INCLUDING non-georeferenced ones
    -- (every coord_flag), for the species-page attribution count. Distinct from
    -- checklist_count_agg above, which counts only coord-bearing point records that
    -- flow into occurrences.parquet. Reads the RAW source (not
    -- stg_checklist__records_full) so it bypasses that model's coord_flag='valid'
    -- filter and its ../raw/taxa.csv.gz genus-bridge dependency. Synonym-resolved
    -- (int_synonyms) like the other checklist aggs so listed records keyed under a
    -- synonym merge under the accepted canonical_name.
    SELECT
        COALESCE(syn.accepted_name, cr.canonical_name) AS canonical_name,
        COUNT(*) AS checklist_record_count
    FROM {{ source('checklist_data', 'checklist_records_full') }} cr
    LEFT JOIN {{ ref('int_synonyms') }} syn ON syn.synonym = cr.canonical_name
    WHERE cr.canonical_name IS NOT NULL
    GROUP BY 1
),
-- Per-species iNat expert obs count (OCC-02). Reads source directly to avoid circular DAG with occurrences mart.
-- Phase 123 (SYN-02): apply occurrence synonymy here too. Reads source
-- directly (avoids circular DAG with occurrences mart) so it must
-- redo the same LEFT JOIN that int_combined applies to ARM 3.
inat_obs_count_agg AS (
    SELECT
        COALESCE(syn.accepted_name, io.canonical_name) AS canonical_name,
        COUNT(*) AS inat_obs_count
    FROM {{ source('inat_obs_data', 'observations') }} io
    LEFT JOIN {{ ref('int_synonyms') }} syn ON syn.synonym = io.canonical_name
    WHERE io.canonical_name IS NOT NULL
    GROUP BY 1
),
provisional_agg AS (
    -- provisional_count: occurrences mart rows flagged is_provisional=TRUE.
    -- Inlined here (parallel to geo_agg) rather than as a separate intermediate
    -- model — reads ref('occurrences') external parquet, creating a DAG dependency.
    SELECT canonical_name, COUNT(*) AS provisional_count
    FROM {{ ref('occurrences') }}
    WHERE is_provisional = TRUE AND canonical_name IS NOT NULL
    GROUP BY canonical_name
),
geo_agg AS (
    SELECT * FROM {{ ref('int_species_geo_agg') }}
),
species_universe AS (
    SELECT
        COALESCE(
            c.scientificName,
            upper(left(COALESCE(c.canonical_name, oa.canonical_name), 1)) ||
            substring(COALESCE(c.canonical_name, oa.canonical_name), 2)
        ) AS scientificName,
        COALESCE(c.canonical_name, oa.canonical_name) AS canonical_name,
        COALESCE(c.family, tle.family) AS family,
        COALESCE(c.subfamily, tle.subfamily) AS subfamily,
        COALESCE(c.tribe, tle.tribe) AS tribe,
        COALESCE(
            c.genus,
            tle.genus,
            split_part(COALESCE(c.canonical_name, oa.canonical_name), ' ', 1)
        ) AS genus,
        COALESCE(c.subgenus, tle.subgenus) AS subgenus,
        COALESCE(
            c.specific_epithet,
            NULLIF(split_part(COALESCE(c.canonical_name, oa.canonical_name), ' ', 2), '')
        ) AS specific_epithet,
        c.scientificName IS NOT NULL AS on_checklist,
        c.status AS status,
        COALESCE(oa.occurrence_count, 0) AS occurrence_count,
        COALESCE(oa.specimen_count, 0) AS specimen_count,
        COALESCE(pa.provisional_count, 0) AS provisional_count,
        oa.first_occurrence_date,
        oa.last_occurrence_date,
        -- Merged month_histogram: element-wise sum of ecdysis + checklist months.
        -- COALESCE(arr[n], 0) handles NULL on either side without branching, which
        -- avoids a DuckDB 1.5.2 materialization bug where the four-branch CASE on
        -- INTEGER[] arrays produced corrupt values when both arms were non-NULL.
        -- ::INTEGER cast on each element ensures INT32 (not BIGINT) before list_value.
        list_value(
            COALESCE(oa.month_histogram[1],  0)::INTEGER + COALESCE(cma.checklist_month_histogram[1],  0)::INTEGER,
            COALESCE(oa.month_histogram[2],  0)::INTEGER + COALESCE(cma.checklist_month_histogram[2],  0)::INTEGER,
            COALESCE(oa.month_histogram[3],  0)::INTEGER + COALESCE(cma.checklist_month_histogram[3],  0)::INTEGER,
            COALESCE(oa.month_histogram[4],  0)::INTEGER + COALESCE(cma.checklist_month_histogram[4],  0)::INTEGER,
            COALESCE(oa.month_histogram[5],  0)::INTEGER + COALESCE(cma.checklist_month_histogram[5],  0)::INTEGER,
            COALESCE(oa.month_histogram[6],  0)::INTEGER + COALESCE(cma.checklist_month_histogram[6],  0)::INTEGER,
            COALESCE(oa.month_histogram[7],  0)::INTEGER + COALESCE(cma.checklist_month_histogram[7],  0)::INTEGER,
            COALESCE(oa.month_histogram[8],  0)::INTEGER + COALESCE(cma.checklist_month_histogram[8],  0)::INTEGER,
            COALESCE(oa.month_histogram[9],  0)::INTEGER + COALESCE(cma.checklist_month_histogram[9],  0)::INTEGER,
            COALESCE(oa.month_histogram[10], 0)::INTEGER + COALESCE(cma.checklist_month_histogram[10], 0)::INTEGER,
            COALESCE(oa.month_histogram[11], 0)::INTEGER + COALESCE(cma.checklist_month_histogram[11], 0)::INTEGER,
            COALESCE(oa.month_histogram[12], 0)::INTEGER + COALESCE(cma.checklist_month_histogram[12], 0)::INTEGER
        )::INTEGER[12] AS month_histogram,
        COALESCE(ga.county_count, 0) AS county_count,
        COALESCE(ga.ecoregion_count, 0) AS ecoregion_count,
        COALESCE(cca.checklist_count, 0)::BIGINT AS checklist_count,
        COALESCE(crca.checklist_record_count, 0)::BIGINT AS checklist_record_count,
        COALESCE(ioa.inat_obs_count, 0)::BIGINT AS inat_obs_count,
        ctt.taxon_id::INTEGER AS taxon_id
    FROM {{ ref('stg_checklist__species') }} c
    FULL OUTER JOIN occ_agg oa ON oa.canonical_name = c.canonical_name
    LEFT JOIN {{ ref('stg_inat__canonical_to_taxon_id') }} ctt
        ON ctt.canonical_name = COALESCE(c.canonical_name, oa.canonical_name)
    LEFT JOIN {{ ref('stg_inat__taxon_lineage_extended') }} tle
        ON tle.taxon_id = ctt.taxon_id
    LEFT JOIN provisional_agg pa
        ON pa.canonical_name = COALESCE(c.canonical_name, oa.canonical_name)
    LEFT JOIN geo_agg ga
        ON ga.canonical_name = COALESCE(c.canonical_name, oa.canonical_name)
    LEFT JOIN checklist_month_agg cma
        ON cma.canonical_name = COALESCE(c.canonical_name, oa.canonical_name)
    LEFT JOIN checklist_count_agg cca
        ON cca.canonical_name = COALESCE(c.canonical_name, oa.canonical_name)
    LEFT JOIN checklist_record_count_agg crca
        ON crca.canonical_name = COALESCE(c.canonical_name, oa.canonical_name)
    LEFT JOIN inat_obs_count_agg ioa
        ON ioa.canonical_name = COALESCE(c.canonical_name, oa.canonical_name)
)
-- Collapse any accidental duplicate canonical_name rows, preferring the
-- checklist-favoring row when both arms produce one (Pitfall 7: DISTINCT ON).
-- Sole gate for restricting species universe to the seven Anthophila bee families.
-- This WHERE clause is the only filter in the pipeline — there is no other family
-- restriction. The Python BEE_FAMILIES constant in species_export.py was removed in
-- Phase 102 (PY-02) because it was dead code; this SQL clause was always the real gate.
SELECT DISTINCT ON (canonical_name) *
FROM species_universe
WHERE family IN ('Andrenidae', 'Apidae', 'Colletidae', 'Halictidae',
                 'Megachilidae', 'Melittidae', 'Stenotritidae')
ORDER BY canonical_name, on_checklist DESC
