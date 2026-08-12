-- Canonical name -> taxon_id for every name the identification events put in
-- play: face names, hedge targets, slash alternates, subg. refinement names
-- (beeatlas-xs1). Local-lineage only (ADR 0030).
--
-- Resolution order:
--   1. Binomials: the curated bridge (stg_inat__canonical_to_taxon_id) wins,
--      then an unambiguous active species name-match in taxa.csv.gz, scoped to
--      Insecta (homonym guard — 'Villa' the fly genus, not the plant).
--   2. Monomials: unambiguous active Insecta name-match at ANY rank; when one
--      spelling names taxa at several ranks (Perdita is both genus and
--      subgenus), the MOST INCLUSIVE rank wins (max rank_level) — a monomial
--      determination asserts the genus, not its nominate subgenus.
-- Ambiguity within the winning rank_level -> unresolved (dropped here);
-- assertions fall back to the name at face value, taxon_id NULL.
{{ config(materialized='table') }}

{% set insecta_id = 47158 %}

WITH vocab AS (
    SELECT DISTINCT name FROM (
        SELECT face_name   AS name FROM {{ ref('int_identification_events') }}
        UNION
        SELECT target1_name AS name FROM {{ ref('int_identification_events') }}
        UNION
        SELECT target2_name AS name FROM {{ ref('int_identification_events') }}
    )
    WHERE name IS NOT NULL
),

insecta_taxa AS (
    SELECT taxon_id, LOWER(name) AS match_name, rank, rank_level
    FROM {{ ref('stg_inat__taxa') }}
    WHERE active
      AND (list_contains(ancestor_ids, {{ insecta_id }}) OR taxon_id = {{ insecta_id }})
),

curated AS (
    SELECT v.name, ctt.taxon_id
    FROM vocab v
    JOIN {{ ref('stg_inat__canonical_to_taxon_id') }} ctt ON ctt.canonical_name = v.name
),

name_matched AS (
    SELECT
        v.name,
        t.taxon_id,
        t.rank_level,
        -- most-inclusive rank first; ambiguity within it detected below
        ROW_NUMBER() OVER (PARTITION BY v.name ORDER BY t.rank_level DESC, t.taxon_id) AS rn,
        COUNT(*) OVER (PARTITION BY v.name, t.rank_level)                              AS peers_at_level
    FROM vocab v
    JOIN insecta_taxa t ON t.match_name = v.name
    WHERE v.name NOT IN (SELECT name FROM curated)
      -- binomial names may only match species-and-below; monomials any rank
      AND (v.name NOT LIKE '% %' OR t.rank = 'species')
)

SELECT name, taxon_id FROM curated
UNION ALL
SELECT name, taxon_id
FROM name_matched
WHERE rn = 1 AND peers_at_level = 1
