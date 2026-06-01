-- Unified synonym table: manual entries (occurrence_synonyms) take precedence
-- over auto-generated entries (auto_synonyms) when the same synonym key appears
-- in both (ITR-04). Anti-join on synonym column: manual wins by exclusion of
-- matching auto rows (WHERE m.synonym IS NULL).
--
-- Consumers use ref('int_synonyms') instead of ref('occurrence_synonyms') directly,
-- so auto-generated remappings flow through the same LEFT JOIN path as curated ones.
{{ config(materialized='view') }}

SELECT synonym, accepted_name, source FROM {{ ref('occurrence_synonyms') }}
UNION ALL
SELECT a.synonym, a.accepted_name, a.source
FROM {{ ref('auto_synonyms') }} a
LEFT JOIN {{ ref('occurrence_synonyms') }} m ON m.synonym = a.synonym
WHERE m.synonym IS NULL
