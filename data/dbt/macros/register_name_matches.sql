-- The identifier-register name-match relation (ADR 0033 item 5): one row per
-- (person_key, matchable spelling), where spellings are the register's
-- preferred name plus each pipe-separated alt_spelling, lowercased/trimmed.
-- Single definition of the match rule — "never a second name system".
-- Consumers: int_ecdysis_identifications, int_identification_events,
-- assert_identifier_register_covers_determiners.

{% macro register_name_matches() %}
    SELECT person_key, LOWER(TRIM(name)) AS match_name
    FROM {{ ref('identifier_register') }}
    WHERE name IS NOT NULL AND TRIM(name) != ''
    UNION ALL
    SELECT r.person_key, LOWER(TRIM(alt.value)) AS match_name
    FROM {{ ref('identifier_register') }} r,
         UNNEST(STRING_SPLIT(r.alt_spellings, '|')) AS alt(value)
    WHERE r.alt_spellings IS NOT NULL AND TRIM(r.alt_spellings) != ''
{% endmacro %}
