{{ config(severity='warn') }}

-- Identifier-register drift surfacing (ADR 0033, beeatlas-16m): every CURRENT, NAMED
-- Ecdysis determination should trace to a register row — by the person's name or one of
-- their non-preferred spellings (alt_spellings, pipe-separated) — so a new determiner
-- appearing upstream is noticed rather than silently unresolvable. WARN, not error — a new
-- person in the data is a curation task, not a broken build (ADR 0010 posture: a curator
-- reviews and adds the row; never auto-matched).
--
-- Sentinels excluded here, matching the identifications-arm filter in
-- int_ecdysis_identifications (staging stays unfiltered for int_id_modified): blank names,
-- the 'undetermined' placeholder rows, and the 'Nomenclatural Adjustment' process actor.
-- PASS semantics: 0 rows.

WITH register_names AS (
    SELECT LOWER(TRIM(name)) AS match_name FROM {{ ref('identifier_register') }}
    WHERE name IS NOT NULL
    UNION ALL
    SELECT LOWER(TRIM(alt.value)) AS match_name
    FROM {{ ref('identifier_register') }},
         UNNEST(STRING_SPLIT(alt_spellings, '|')) AS alt(value)
    WHERE alt_spellings IS NOT NULL
)

SELECT
    i.identified_by,
    COUNT(*) AS current_determinations
FROM {{ source('ecdysis_data', 'identifications') }} i
LEFT JOIN register_names r
    ON LOWER(TRIM(i.identified_by)) = r.match_name
WHERE i.identification_is_current = '1'
  AND i.identified_by IS NOT NULL
  AND TRIM(i.identified_by) NOT IN ('', 'Nomenclatural Adjustment')
  AND LOWER(COALESCE(i.scientific_name, '')) NOT IN ('', 'undetermined')
  AND r.match_name IS NULL
GROUP BY 1
