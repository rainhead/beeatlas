-- Wraps source('checklist_data', 'checklist_records_full') with synonym resolution
-- and iNat taxon_id bridge applied over the pre-computed canonical_name column
-- (canonical_name = normalize_scientific_name(verbatim_name), written by checklist_pipeline.py
-- _load_checklist_records_full(); slash compounds resolved to LCA taxon_id by Plan 135-03).
--
-- Synonym resolution: int_synonyms (single 3-arm subsystem, RCN-06) — GBIF checklist synonyms
-- are the third arm, lowest precedence (manual occurrence_synonyms + iNat auto_synonyms win).
-- taxon_id bridge: stg_inat__canonical_to_taxon_id (exact match), then stg_inat__genus_taxon_ids
-- fallback for genus-only names (single-token canonical_name with no space).
--
-- Filter: coord_flag = 'valid' drops ~9% (4,595) records with no usable coordinates.
-- These records are excluded from the point layer (Phase 138) but available for
-- presence-only display via checklist.parquet (unaffected).
--
-- Does NOT write to int_combined or the occurrences mart — that is Phase 137.
-- Used by: Phase 136 dedup, Phase 137 promotion into int_combined.
{{ config(materialized='view') }}

SELECT
    cr.ObjectID,
    cr.verbatim_name,
    COALESCE(syn.accepted_name, cr.canonical_name) AS canonical_name,
    cr.latitude    AS lat,
    cr.longitude   AS lon,
    cr.year,
    cr.month,
    cr.day,
    cr.date_quality,
    cr.recordedBy,
    cr.locality,
    cr.family,
    cr.coord_flag,
    COALESCE(ctt.taxon_id, g.taxon_id)::INTEGER AS taxon_id
FROM {{ source('checklist_data', 'checklist_records_full') }} cr
LEFT JOIN {{ ref('int_synonyms') }} syn
    ON syn.synonym = cr.canonical_name
LEFT JOIN {{ ref('stg_inat__canonical_to_taxon_id') }} ctt
    ON ctt.canonical_name = COALESCE(syn.accepted_name, cr.canonical_name)
LEFT JOIN {{ ref('stg_inat__genus_taxon_ids') }} g
    ON ctt.taxon_id IS NULL
   AND position(' ' IN COALESCE(syn.accepted_name, cr.canonical_name)) = 0
   AND g.genus_name = COALESCE(syn.accepted_name, cr.canonical_name)
WHERE cr.coord_flag = 'valid'
