-- One row per taxon in play for the trust model: every taxon an identification
-- resolves to (int_taxon_resolution) PLUS all their ancestors — so hedge
-- anchors, slash LCAs, and dispute LCAs always have a node row to take their
-- name/rank/depth from (beeatlas-xs1).
--
-- ancestor_or_self is root->leaf INCLUSIVE of self: ancestor-or-self
-- compatibility (ADR 0033 item 2) is list_contains(b.ancestor_or_self,
-- a.taxon_id), and depth comparisons are len(ancestor_or_self).
--
-- anchor_taxon_id is the hedge-demotion target (ADR 0033 item 9): the deepest
-- ancestor-or-self STRICTLY ABOVE species rank. iNat rank_level orders depth
-- (species 10 < complex 11 < subgenus 15 < genus 20), so "deepest above
-- species" = arg_min over rank_level among elements with rank_level > 10 —
-- picking complex over subgenus over genus. For nodes already above species,
-- the anchor is the node itself.
{{ config(materialized='table') }}

WITH resolved_ids AS (
    SELECT DISTINCT taxon_id FROM {{ ref('int_taxon_resolution') }}
),

taxa AS (
    SELECT taxon_id, name, rank, rank_level, ancestor_ids
    FROM {{ ref('stg_inat__taxa') }}
),

in_play AS (
    SELECT t.taxon_id, t.name, t.rank, t.rank_level, t.ancestor_ids
    FROM taxa t
    JOIN resolved_ids r ON r.taxon_id = t.taxon_id
),

ancestor_ids_in_play AS (
    SELECT DISTINCT anc.a AS taxon_id
    FROM in_play, UNNEST(in_play.ancestor_ids) AS anc(a)
),

nodes AS (
    SELECT t.taxon_id, t.name, t.rank, t.rank_level, t.ancestor_ids
    FROM taxa t
    JOIN ancestor_ids_in_play a ON a.taxon_id = t.taxon_id
    WHERE t.taxon_id NOT IN (SELECT taxon_id FROM in_play)
    UNION ALL
    SELECT * FROM in_play
),

with_self AS (
    SELECT
        taxon_id, name, rank, rank_level,
        list_append(ancestor_ids, taxon_id) AS ancestor_or_self
    FROM nodes
),

exploded AS (
    SELECT taxon_id, UNNEST(ancestor_or_self) AS elem_id
    FROM with_self
),

anchors AS (
    SELECT e.taxon_id, arg_min(e.elem_id, n.rank_level) AS anchor_taxon_id
    FROM exploded e
    JOIN with_self n ON n.taxon_id = e.elem_id
    WHERE n.rank_level > 10
    GROUP BY e.taxon_id
)

SELECT
    w.taxon_id,
    w.name,
    w.rank,
    w.rank_level,
    w.ancestor_or_self,
    a.anchor_taxon_id
FROM with_self w
LEFT JOIN anchors a USING (taxon_id)
