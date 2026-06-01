-- Wraps source('checklist_data', 'species') with occurrence synonymy applied.
-- When a species' canonical_name appears in int_synonyms as a synonym,
-- canonical_name, specific_epithet, and scientificName are rewritten to the
-- accepted name so the FULL OUTER JOIN in int_species_universe merges the
-- checklist entry with occurrence data under the accepted canonical_name.
-- Used by:
--   int_species_universe: FULL OUTER JOIN axis (checklist half)
--   checklist.sql mart: joins stg_checklist__species for species info
--   test_lin05_lineage_coverage: species_universe CTE
{{ config(materialized='view') }}

SELECT
    CASE WHEN syn.accepted_name IS NOT NULL
         THEN upper(left(syn.accepted_name, 1)) || substring(syn.accepted_name, 2)
         ELSE s.scientificName
    END AS scientificName,
    COALESCE(syn.accepted_name, s.canonical_name) AS canonical_name,
    s.family,
    s.subfamily,
    s.tribe,
    s.genus,
    s.subgenus,
    CASE WHEN syn.accepted_name IS NOT NULL
         THEN NULLIF(split_part(syn.accepted_name, ' ', 2), '')
         ELSE s.specific_epithet
    END AS specific_epithet,
    s.status,
    s.source_citation,
    s.notes
FROM {{ source('checklist_data', 'species') }} s
LEFT JOIN {{ ref('int_synonyms') }} syn ON syn.synonym = s.canonical_name
