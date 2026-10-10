-- Fowler & Droege's host plants, one list of (family, genus) entries per bee
-- (stelis st-7dm). The seed gives each bee ONE row whose host_plant_detail packs
-- every host into a single text field, in a small grammar of its own:
--
--   Asteraceae : Coreopsis L. , Engelmannia A. Gray ex Nutt. , Solidago L.
--   Cryptantha Lehm. ex G. Don , Hackelia Opiz          (no family given)
--   Fabaceae                                            (a family, no genera)
--   Boraginaceae ; Hydrophyllaceae                      (';' separates groups)
--   Gutierrezia Lag. ( Eriogonum Michx. ?)              (a doubtful alternative)
--   Lotus L. ( Acmispon Raf.)  ·  Eurybia (Cass.) Cass. (a synonym; an author)
--
-- Read whole, the field is one opaque string, and stelis's at-risk reasoning
-- treated it as ONE plant, so every specialist read as depending on a single
-- plant. Split, a bee's hosts are a set whose shape decides what can be claimed:
-- one genus, several genera in one family, or several families.
--
-- Each entry is (family, genus), either side NULL where the source does not say:
--   * A genus takes its group's "Family :" prefix, or NULL without one.
--   * A word ending in -aceae is a family named on its own: (family, NULL).
--   * A lone "?" is a host the source could not name: (group family, NULL).
--   * A genus in brackets or parentheses WITH a "?" is a doubtful extra host. It
--     is kept, because a strict claim must allow for every host the bee might
--     use, but it does NOT take the group's family: Fowler offers Eriogonum
--     (Polygonaceae) inside an Asteraceae group. So it is (NULL, genus), which
--     blocks a family-level claim, as an unknown family should.
--   * Any other bracketed text is a synonym or an author citation and is dropped.
--   * A trailing "?" on an entry outside brackets marks a doubtful host that is
--     still listed in the group, so it keeps the group's family.
-- The genus is the first capitalised word of an entry, the rule the site's
-- dietHostLabel (_data/species.js) uses for its label.
-- Keyed by the seed's own spelling; species_traits applies synonymy.

{{ config(materialized='view') }}

WITH src AS (
    SELECT canonical_name, host_plant_detail AS detail
    FROM {{ ref('bee_specialist_hosts') }}
    WHERE NULLIF(TRIM(host_plant_detail), '') IS NOT NULL
),

grp AS (
    SELECT canonical_name, TRIM(g) AS grp
    FROM src, UNNEST(string_split(detail, ';')) AS t(g)
),

parts AS (
    SELECT
        canonical_name,
        CASE WHEN grp LIKE '%:%' THEN NULLIF(TRIM(split_part(grp, ':', 1)), '') END AS group_family,
        CASE WHEN grp LIKE '%:%' THEN substr(grp, strpos(grp, ':') + 1) ELSE grp END AS body
    FROM grp
),

-- Doubtful alternatives: a bracketed or parenthesised genus followed by "?".
doubtful AS (
    SELECT canonical_name, g AS word
    FROM parts,
         UNNEST(regexp_extract_all(body, '[\(\[]\s*([A-Z][A-Za-z-]*)[^\)\]]*\?\s*[\)\]]', 1)) AS t(g)
),

listed AS (
    SELECT canonical_name, group_family,
           regexp_extract(TRIM(e), '^([A-Z][A-Za-z-]*)', 1) AS word
    FROM parts,
         UNNEST(string_split(regexp_replace(body, '[\(\[][^\)\]]*[\)\]]', '', 'g'), ',')) AS t(e)
    WHERE TRIM(e) <> ''
),

entries AS (
    SELECT DISTINCT canonical_name,
        CASE WHEN word LIKE '%aceae' THEN word ELSE group_family END AS family,
        CASE WHEN word LIKE '%aceae' OR word = '' THEN NULL ELSE word END AS genus
    FROM listed
    UNION
    SELECT canonical_name,
        CASE WHEN word LIKE '%aceae' THEN word END AS family,
        CASE WHEN word LIKE '%aceae' THEN NULL ELSE word END AS genus
    FROM doubtful
)

SELECT
    canonical_name,
    LIST({'family': family, 'genus': genus} ORDER BY family NULLS FIRST, genus NULLS FIRST)
        AS host_plants
FROM entries
GROUP BY canonical_name
