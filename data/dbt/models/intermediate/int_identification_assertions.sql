-- Identification assertions: events with their asserted taxon resolved
-- (beeatlas-xs1). This is where ADR 0033 item 9's hedge-target rule lands on
-- taxonomy:
--   hedge_epithet / hedge_bare -> the target species' ANCHOR (deepest ancestor
--     above species: complex > subgenus > genus)
--   slash                      -> LCA of the two targets (deepest common
--     element of their ancestor-or-self lists)
--   refine_subg                -> the named subgenus node
--   refine_subsp / noop / none -> the face name's node
--   unresolvable hedge target  -> the FACE name's anchor, so the hedge still
--     demotes ('Perdita nevadensis aff. molina' with no local P. molina ->
--     Pygoperdita, not species-level nevadensis); face anchor = face itself
--     for supra-species faces, so genus faces are unaffected
--   any other unresolvable step -> the face name (taxon_id NULL if the face
--     itself doesn't resolve — non-bee bycatch mostly)
--
-- iNat rows arrive pre-resolved (presolved_*) from the API's per-row taxon +
-- ancestor_ids (ADR 0030) and bypass local resolution entirely.
{{ config(materialized='table') }}

WITH joined AS (
    SELECT
        e.*,
        fn.taxon_id          AS face_id,
        fn.anchor_taxon_id   AS face_anchor,
        t1n.taxon_id         AS t1_id,
        t1n.anchor_taxon_id  AS t1_anchor,
        t1n.ancestor_or_self AS t1_aos,
        t2n.ancestor_or_self AS t2_aos
    FROM {{ ref('int_identification_events') }} e
    LEFT JOIN {{ ref('int_taxon_resolution') }} fr  ON fr.name = e.face_name
    LEFT JOIN {{ ref('int_taxon_nodes') }} fn       ON fn.taxon_id = fr.taxon_id
    LEFT JOIN {{ ref('int_taxon_resolution') }} r1  ON r1.name = e.target1_name
    LEFT JOIN {{ ref('int_taxon_nodes') }} t1n      ON t1n.taxon_id = r1.taxon_id
    LEFT JOIN {{ ref('int_taxon_resolution') }} r2  ON r2.name = e.target2_name
    LEFT JOIN {{ ref('int_taxon_nodes') }} t2n      ON t2n.taxon_id = r2.taxon_id
),

asserted AS (
    SELECT
        *,
        CASE
            WHEN presolved_taxon_id IS NOT NULL
                THEN presolved_taxon_id
            WHEN qualifier_class IN ('hedge_epithet', 'hedge_bare')
                THEN COALESCE(t1_anchor, face_anchor, face_id)
            WHEN qualifier_class = 'slash' AND t1_aos IS NOT NULL AND t2_aos IS NOT NULL
                THEN list_filter(t1_aos, x -> list_contains(t2_aos, x))[-1]
            WHEN qualifier_class = 'refine_subg' AND t1_id IS NOT NULL
                THEN t1_id
            ELSE face_id
        END AS asserted_taxon_id
    FROM joined
)

SELECT
    a.occ_id,
    a.source,
    a.person_key,
    a.identifier_label,
    a.is_current,
    a.is_expert,
    a.face_name,
    a.qualifier,
    a.qualifier_class,
    a.asserted_taxon_id,
    CASE
        WHEN an.taxon_id IS NOT NULL          THEN an.name
        ELSE a.face_name
    END                                        AS asserted_name,
    CASE
        WHEN an.taxon_id IS NOT NULL          THEN an.rank
        WHEN a.presolved_taxon_id IS NOT NULL THEN a.presolved_rank
        ELSE NULL
    END                                        AS asserted_rank,
    CASE
        WHEN an.taxon_id IS NOT NULL          THEN an.ancestor_or_self
        WHEN a.presolved_taxon_id IS NOT NULL
            THEN list_append(a.presolved_ancestor_ids, a.presolved_taxon_id)
        ELSE NULL
    END                                        AS ancestor_or_self
FROM asserted a
LEFT JOIN {{ ref('int_taxon_nodes') }} an ON an.taxon_id = a.asserted_taxon_id
