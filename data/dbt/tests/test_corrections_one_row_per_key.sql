-- Singular test: (canonical_name, trait) is unique in bee_traits_corrections,
-- AFTER synonym normalization — the same key marts/species_traits groups by.
--
-- Why this needs a test rather than a convention: the `corrections` CTE in
-- species_traits pivots with independent MAX()es per column, so duplicates do not
-- error, they resolve silently and incoherently. Two `replace` rows for one key
-- publish the lexicographically largest corrected_value. A `replace` plus a
-- `retract` picks 'retract' (r-e-t sorts above r-e-p) and DISCARDS the
-- replacement — the correction is silently downgraded to a deletion. It also
-- fires when two synonyms of one species carry separate corrections, since the
-- CTE coalesces through int_synonyms before grouping, which is why this test
-- normalizes the same way instead of grouping the raw seed.
--
-- A correction overrides a cited source. Which of two conflicting overrides wins
-- is not something to decide by string ordering.
WITH syn AS (
    SELECT synonym, accepted_name FROM {{ ref('int_synonyms') }}
),

normalized AS (
    SELECT
        COALESCE(syn.accepted_name, c.canonical_name) AS canonical_name,
        c.trait
    FROM {{ ref('bee_traits_corrections') }} c
    LEFT JOIN syn ON syn.synonym = c.canonical_name
)

SELECT canonical_name, trait, COUNT(*) AS cnt
FROM normalized
GROUP BY canonical_name, trait
HAVING COUNT(*) > 1
