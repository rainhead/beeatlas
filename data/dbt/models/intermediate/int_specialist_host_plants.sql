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
-- Each entry is (family, genus), either side NULL where the family is unknown:
--   * A genus takes the family iNaturalist's taxonomy files it under
--     (stg_inat__plant_genus_families, stelis st-d64), whatever Fowler wrote.
--     Fowler gives no family for over half its rows, uses an older system for
--     some (Capparaceae for Cleome, which iNat and the site put in Cleomaceae),
--     and once files a genus under the wrong heading (Eriogonum, a buckwheat,
--     under Asteraceae for Perdita zonalis). One system for every genus keeps a
--     family-level claim meaning one thing. A genus iNat does not know falls
--     back to its group's "Family :" prefix, or NULL without one.
--   * A word ending in -aceae is a family named on its own: (family, NULL).
--   * A lone "?" is a host the source could not name: (group family, NULL).
--   * A genus in brackets or parentheses WITH a "?" is a doubtful extra host. It
--     is kept, because a strict claim must allow for every host the bee might
--     use, but it never takes the group's prefix: Fowler offers Eriogonum
--     (Polygonaceae) inside an Asteraceae group. Its family comes from iNat
--     alone, and is NULL if iNat does not know it, which blocks a family-level
--     claim, as an unknown family should.
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

genus_family AS (
    SELECT genus, family FROM {{ ref('stg_inat__plant_genus_families') }}
),

entries AS (
    SELECT DISTINCT l.canonical_name,
        CASE WHEN l.word LIKE '%aceae' THEN l.word
             ELSE COALESCE(gf.family, l.group_family) END AS family,
        CASE WHEN l.word LIKE '%aceae' OR l.word = '' THEN NULL ELSE l.word END AS genus
    FROM listed l
    LEFT JOIN genus_family gf ON gf.genus = l.word
    UNION
    SELECT d.canonical_name,
        CASE WHEN d.word LIKE '%aceae' THEN d.word ELSE gf.family END AS family,
        CASE WHEN d.word LIKE '%aceae' THEN NULL ELSE d.word END AS genus
    FROM doubtful d
    LEFT JOIN genus_family gf ON gf.genus = d.word
)

SELECT
    canonical_name,
    LIST({'family': family, 'genus': genus} ORDER BY family NULLS FIRST, genus NULLS FIRST)
        AS host_plants
FROM entries
GROUP BY canonical_name
