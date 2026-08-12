-- Identification events across sources, pre-taxon-resolution (beeatlas-xs1).
--
-- One row per current-or-not identification assertion that the trust model may
-- weigh: today the Ecdysis DETERMINATION OF RECORD per occurrence (ADR 0033
-- item 7 — read from occurrences, NOT the identifications table, which is
-- attribution/supersession history) plus the iNat arm (contract placeholder,
-- zero rows until beeatlas-9sy).
--
-- This model also OWNS qualifier parsing (ADR 0033 item 9, the hedge-target
-- rule): it classifies identification_qualifier and constructs the canonical
-- hedge-target name(s) whose resolution int_taxon_nodes provides and whose
-- rank semantics int_identification_assertions applies. The qualifier
-- vocabulary is small and enumerable (14 distinct live values); the regexes
-- here are pinned by the unit tests on this model.
--
-- Synonyms (int_synonyms) apply to the face name AND to constructed targets —
-- synonyms-in-every-arm, before any taxonomy resolution.
--
-- Columns:
--   presolved_* — the iNat arm ships taxon_id/rank/ancestor_ids per row from
--   the API (ADR 0030: ingested ancestor_ids, no lookups); Ecdysis rows carry
--   NULL and resolve via int_taxon_nodes downstream.
{{ config(materialized='view') }}

WITH register_names AS (
    {{ register_name_matches() }}
),

ecdysis_raw AS (
    SELECT
        'ecdysis:' || o.id                                   AS occ_id,
        'ecdysis'                                            AS source,
        reg.person_key                                       AS person_key,
        o.identified_by                                      AS identifier_label,
        TRUE                                                 AS is_current,
        -- Determination of record: expert-made or expert-reviewed at ingestion,
        -- trusted by provenance (ADR 0033 decision) — no per-determiner flag.
        TRUE                                                 AS is_expert,
        COALESCE(syn.accepted_name, o.canonical_name)        AS face_name,
        NULLIF(TRIM(o.identification_qualifier), '')         AS qualifier
    FROM {{ ref('stg_ecdysis__occurrences') }} o
    LEFT JOIN {{ ref('int_synonyms') }} syn ON syn.synonym = o.canonical_name
    LEFT JOIN register_names reg
        ON reg.match_name = LOWER(TRIM(o.identified_by))
    WHERE o.canonical_name IS NOT NULL
      AND o.canonical_name != 'undetermined'
),

ecdysis_classified AS (
    SELECT
        *,
        LOWER(COALESCE(qualifier, ''))                       AS q,
        string_split(face_name, ' ')[1]                      AS genus_token
    FROM ecdysis_raw
),

ecdysis_parsed AS (
    SELECT
        occ_id, source, person_key, identifier_label, is_current, is_expert,
        face_name, qualifier,
        CASE
            WHEN q = ''                                            THEN 'none'
            WHEN q = 'sp.'                                         THEN 'noop'
            WHEN regexp_matches(q, '^subsp\.?\s')                  THEN 'refine_subsp'
            WHEN regexp_matches(q, 'subg\.?\s*\(')                 THEN 'refine_subg'
            WHEN regexp_matches(q, '^[a-z]+/[a-z]+$')              THEN 'slash'
            WHEN regexp_matches(q, '^[a-z]+ group$')               THEN 'hedge_epithet'
            WHEN regexp_extract(q, '(?:^|\s)(?:cf|aff|af|nr)\.?\s+([a-z]+)\.?$', 1) != ''
                                                                   THEN 'hedge_epithet'
            WHEN q IN ('?', 'nr.', 'cf.', 'aff.')                  THEN 'hedge_bare'
            ELSE 'none'   -- unknown qualifier: name at face value
        END                                                   AS qualifier_class,
        CASE
            WHEN regexp_matches(q, '^[a-z]+ group$')
                THEN genus_token || ' ' || regexp_extract(q, '^([a-z]+) group$', 1)
            WHEN regexp_extract(q, '(?:^|\s)(?:cf|aff|af|nr)\.?\s+([a-z]+)\.?$', 1) != ''
                 AND q != 'sp.' AND NOT regexp_matches(q, '^subsp\.?\s')
                THEN genus_token || ' ' ||
                     regexp_extract(q, '(?:^|\s)(?:cf|aff|af|nr)\.?\s+([a-z]+)\.?$', 1)
            WHEN regexp_matches(q, '^[a-z]+/[a-z]+$')
                THEN genus_token || ' ' || regexp_extract(q, '^([a-z]+)/', 1)
            WHEN regexp_matches(q, 'subg\.?\s*\(')
                THEN LOWER(regexp_extract(qualifier, '\(([A-Za-z]+)\)', 1))
            WHEN q IN ('?', 'nr.', 'cf.', 'aff.') AND face_name LIKE '% %'
                THEN face_name
            ELSE NULL
        END                                                   AS target1_raw,
        CASE
            WHEN regexp_matches(q, '^[a-z]+/[a-z]+$')
                THEN genus_token || ' ' || regexp_extract(q, '/([a-z]+)$', 1)
            ELSE NULL
        END                                                   AS target2_raw
    FROM ecdysis_classified
),

ecdysis_events AS (
    SELECT
        p.occ_id, p.source, p.person_key, p.identifier_label,
        p.is_current, p.is_expert, p.face_name, p.qualifier, p.qualifier_class,
        COALESCE(s1.accepted_name, p.target1_raw)             AS target1_name,
        COALESCE(s2.accepted_name, p.target2_raw)             AS target2_name,
        CAST(NULL AS INTEGER)                                 AS presolved_taxon_id,
        CAST(NULL AS VARCHAR)                                 AS presolved_rank,
        CAST(NULL AS INTEGER[])                               AS presolved_ancestor_ids
    FROM ecdysis_parsed p
    LEFT JOIN {{ ref('int_synonyms') }} s1 ON s1.synonym = p.target1_raw
    LEFT JOIN {{ ref('int_synonyms') }} s2 ON s2.synonym = p.target2_raw
),

-- iNat arm (beeatlas-9sy): one event per (identification, linked occurrence).
-- The 1:N join is deliberate — an identification on a specimen's photo
-- observation asserts a taxon for the SPECIMEN record (ADR 0033 item 1), and
-- an observation can back both nothing (unlinked) and exactly one occ row per
-- linkage. Taxa arrive pre-resolved from the API (per-row ancestor_ids).
inat_events AS (
    SELECT
        occ.occ_id,
        'inat'                                                AS source,
        i.person_key,
        i.inat_login                                          AS identifier_label,
        i.identification_is_current                           AS is_current,
        i.is_expert,
        COALESCE(syn.accepted_name, LOWER(i.taxon_name))      AS face_name,
        CAST(NULL AS VARCHAR)                                 AS qualifier,
        'none'                                                AS qualifier_class,
        CAST(NULL AS VARCHAR)                                 AS target1_name,
        CAST(NULL AS VARCHAR)                                 AS target2_name,
        i.taxon_id                                            AS presolved_taxon_id,
        i.taxon_rank                                          AS presolved_rank,
        i.ancestor_ids                                        AS presolved_ancestor_ids
    FROM {{ ref('int_inat_identifications') }} i
    JOIN {{ ref('int_observation_occ_ids') }} occ ON occ.observation_id = i.observation_id
    LEFT JOIN {{ ref('int_synonyms') }} syn ON syn.synonym = LOWER(i.taxon_name)
)

SELECT * FROM ecdysis_events
UNION ALL
SELECT * FROM inat_events
