-- Ecdysis arm of the identifications model (beeatlas-fc4, ADR 0033).
--
-- One row per named, person-attributed identification event: the current
-- determination plus its supersession history. Per the beeatlas-0o1 findings
-- the OCCURRENCE record is the determination of record; this model is
-- attribution and supersession history for trust computation (beeatlas-xs1)
-- and the curation anomalies report (beeatlas-amp).
--
-- Sentinels filtered HERE, not in staging (int_id_modified needs all rows):
--   • placeholder rows — scientific_name blank or 'undetermined'
--     (canonical_name IS NULL covers blank; 'undetermined' canonicalizes to itself)
--   • the 'Nomenclatural Adjustment' process actor (17 rows) — not a person
--
-- Synonymy: int_synonyms applied to canonical_name, same LEFT JOIN pattern as
-- int_combined's arms — the "synonyms in every arm" lesson applies here too.
--
-- person_key: LEFT JOIN on the identifier register (name or alt_spellings).
-- Unmatched determiners keep NULL person_key; the register drift test
-- (assert_identifier_register_covers_determiners) warns on them — a new person
-- upstream is a curation task, not a broken build.
--
-- taxon_rank: derived from name shape — the source column is empty on all
-- 87,205 rows. canonical_name (data/canonical_name.py normalization, materialized
-- at load) owns name PARSING; this CASE derives rank from the parsed result
-- plus one shape check, each branch reading the name that carries its meaning:
--   • 'species' reads the POST-SYNONYM canonical (a synonym remap decides what
--     taxon the assertion lands on, so it decides the rank too);
--   • 'subgenus' reads the RAW asserted name — the parenthetical-subgenus form
--     records the PRECISION of the determiner's assertion, which no synonym
--     remap can change. regexp_matches (contains, not full-match) so trailing
--     text never silently demotes a subgenus form, and the letters-only paren
--     pattern can never match authority parens like '(Latreille, 1802)'
--     (comma + digits). Only monomial canonicals reach this branch — binomials
--     already took 'species'.
-- Monomials otherwise stay 'genus_or_higher': shape alone cannot split
-- 'Andrena' (genus) from 'Coleoptera' (order).
{{ config(materialized='table') }}

WITH register_names AS (
    {{ register_name_matches() }}
)

SELECT
    'ecdysis:' || i.coreid                                AS occ_id,
    i.coreid,
    reg.person_key,
    i.identified_by,
    i.date_identified,
    i.identification_is_current,
    NULLIF(TRIM(i.identification_qualifier), '')          AS identification_qualifier,
    i.scientific_name,
    COALESCE(syn.accepted_name, i.canonical_name)         AS canonical_name,
    CASE
        WHEN len(string_split(COALESCE(syn.accepted_name, i.canonical_name), ' ')) = 2
            THEN 'species'
        WHEN regexp_matches(i.scientific_name, '\(\s*[A-Z][A-Za-zæ-]+\s*\)')
            THEN 'subgenus'
        ELSE 'genus_or_higher'
    END                                                   AS taxon_rank,
    i.modified
FROM {{ ref('stg_ecdysis__identifications') }} i
LEFT JOIN {{ ref('int_synonyms') }} syn ON syn.synonym = i.canonical_name
LEFT JOIN register_names reg ON reg.match_name = LOWER(TRIM(i.identified_by))
WHERE i.canonical_name IS NOT NULL
  AND i.canonical_name != 'undetermined'
  AND TRIM(COALESCE(i.identified_by, '')) != 'Nomenclatural Adjustment'
