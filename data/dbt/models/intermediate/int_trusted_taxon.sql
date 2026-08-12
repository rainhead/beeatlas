-- Per-record TRUSTED TAXON under expert-trust-with-veto (ADR 0033,
-- beeatlas-xs1): the deepest taxon compatible with EVERY current expert
-- assertion. One row per occ_id that has at least one current expert
-- assertion.
--
-- The computation, in order:
--   1. Current expert assertions only (ADR items 4/6): today that is the
--      Ecdysis determination of record per specimen (provenance trust); the
--      iNat arm contributes when beeatlas-9sy lands.
--   2. Expert SELF-disagreement (same person_key, incompatible current
--      assertions across systems): that person is not trusted on that record —
--      all their assertions drop, and the record flags for the anomalies
--      report (ADR item 6).
--   3. Compatibility (ADR item 2): a = b, or one is ancestor-or-self of the
--      other (list_contains on ancestor_or_self). All remaining assertions
--      pairwise compatible -> they form a chain -> trusted = the DEEPEST
--      assertion (max list length). Any incompatible pair -> DISPUTED ->
--      trusted = the LCA of all resolved assertions (rank-scoped veto, ADR
--      item 3: a species-level dispute leaves genus trust intact) + anomaly.
--   4. Unresolved assertions (no taxon_id — non-bee bycatch mostly): alone on
--      a record they are trivially trusted at face value (taxon_id NULL, name
--      carried). Mixed with resolved assertions they cannot be compared:
--      excluded from the chain/LCA and flagged.
--
-- Consumption rule (beeatlas-nyr publishes): a record qualifies for query
-- taxon T iff T is ancestor-or-self of trusted_taxon, i.e.
-- list_contains(trusted_ancestor_or_self, T).
--
-- Display color (never a gate, ADR Boundaries): identifier_count and
-- identifiers over ALL current assertions, expert or not.
{{ config(materialized='table') }}

WITH current_expert AS (
    SELECT *, ROW_NUMBER() OVER (ORDER BY occ_id, identifier_label, asserted_taxon_id) AS rid
    FROM {{ ref('int_identification_assertions') }}
    WHERE is_current AND is_expert AND occ_id IS NOT NULL
),

self_pairs AS (
    SELECT DISTINCT a.occ_id, a.person_key
    FROM current_expert a
    JOIN current_expert b
      ON b.occ_id = a.occ_id AND a.rid < b.rid
     AND a.person_key IS NOT NULL AND a.person_key = b.person_key
     AND a.asserted_taxon_id IS NOT NULL AND b.asserted_taxon_id IS NOT NULL
     AND NOT (a.asserted_taxon_id = b.asserted_taxon_id
              OR list_contains(b.ancestor_or_self, a.asserted_taxon_id)
              OR list_contains(a.ancestor_or_self, b.asserted_taxon_id))
),

eligible AS (
    SELECT a.*
    FROM current_expert a
    LEFT JOIN self_pairs sd
      ON sd.occ_id = a.occ_id AND sd.person_key = a.person_key
    WHERE sd.occ_id IS NULL
),

-- dispute detection among eligible RESOLVED assertions
incompatible AS (
    SELECT DISTINCT a.occ_id
    FROM eligible a
    JOIN eligible b
      ON b.occ_id = a.occ_id AND a.rid < b.rid
     AND a.asserted_taxon_id IS NOT NULL AND b.asserted_taxon_id IS NOT NULL
     AND NOT (a.asserted_taxon_id = b.asserted_taxon_id
              OR list_contains(b.ancestor_or_self, a.asserted_taxon_id)
              OR list_contains(a.ancestor_or_self, b.asserted_taxon_id))
),

resolved_counts AS (
    SELECT occ_id, COUNT(*) AS n_resolved
    FROM eligible
    WHERE asserted_taxon_id IS NOT NULL
    GROUP BY occ_id
),

-- LCA of all resolved assertions: elements common to every ancestor-or-self
-- list; deepest = min rank_level (species 10 < complex 11 < ... < kingdom 70)
elem_counts AS (
    SELECT e.occ_id, x.elem, COUNT(*) AS cnt
    FROM eligible e, UNNEST(e.ancestor_or_self) AS x(elem)
    WHERE e.asserted_taxon_id IS NOT NULL
    GROUP BY 1, 2
),

lca AS (
    SELECT ec.occ_id, arg_min(ec.elem, COALESCE(nd.rank_level, 999)) AS lca_taxon_id
    FROM elem_counts ec
    JOIN resolved_counts rc ON rc.occ_id = ec.occ_id AND ec.cnt = rc.n_resolved
    JOIN {{ ref('int_taxon_nodes') }} nd ON nd.taxon_id = ec.elem
    GROUP BY ec.occ_id
),

-- chain winner: the deepest resolved assertion (only meaningful when
-- undisputed — all assertions then lie on one ancestor path)
deepest AS (
    SELECT
        occ_id,
        arg_max(asserted_taxon_id,  len(ancestor_or_self)) AS taxon_id,
        arg_max(asserted_name,      len(ancestor_or_self)) AS name,
        arg_max(asserted_rank,      len(ancestor_or_self)) AS rank,
        arg_max(ancestor_or_self,   len(ancestor_or_self)) AS ancestor_or_self
    FROM eligible
    WHERE asserted_taxon_id IS NOT NULL
    GROUP BY occ_id
),

-- unresolved-only records: trusted at face value when the name is unambiguous
unresolved_only AS (
    SELECT e.occ_id,
           MIN(e.asserted_name)           AS name,
           COUNT(DISTINCT e.asserted_name) AS n_names
    FROM eligible e
    LEFT JOIN resolved_counts rc ON rc.occ_id = e.occ_id
    WHERE rc.occ_id IS NULL
    GROUP BY e.occ_id
),

-- one output row per occ_id with ANY current expert assertion — grouped over
-- current_expert, not eligible, so a record whose only expert self-disagrees
-- still surfaces (trusted NULL, flagged) instead of vanishing
flags AS (
    SELECT
        occ_id,
        COUNT(*) AS expert_assertion_count
    FROM current_expert
    GROUP BY occ_id
),

unresolved_flags AS (
    SELECT occ_id, bool_or(asserted_taxon_id IS NULL) AS has_unresolved
    FROM eligible
    GROUP BY occ_id
),

self_disagreement AS (
    SELECT DISTINCT occ_id FROM self_pairs
),

-- display color over ALL current assertions (expert or not)
color AS (
    SELECT
        occ_id,
        COUNT(DISTINCT COALESCE(person_key, identifier_label)) AS identifier_count,
        list_sort(list_distinct(array_agg(identifier_label)))  AS identifiers
    FROM {{ ref('int_identification_assertions') }}
    WHERE is_current AND occ_id IS NOT NULL
    GROUP BY occ_id
)

SELECT
    f.occ_id,
    CASE
        WHEN i.occ_id IS NOT NULL THEN l.lca_taxon_id
        WHEN d.occ_id IS NOT NULL THEN d.taxon_id
        ELSE NULL
    END                                                    AS trusted_taxon_id,
    CASE
        WHEN i.occ_id IS NOT NULL THEN ln.name
        WHEN d.occ_id IS NOT NULL THEN d.name
        WHEN u.n_names = 1        THEN u.name
        ELSE NULL
    END                                                    AS trusted_taxon_name,
    CASE
        WHEN i.occ_id IS NOT NULL THEN ln.rank
        WHEN d.occ_id IS NOT NULL THEN d.rank
        ELSE NULL
    END                                                    AS trusted_taxon_rank,
    CASE
        WHEN i.occ_id IS NOT NULL THEN ln.ancestor_or_self
        WHEN d.occ_id IS NOT NULL THEN d.ancestor_or_self
        ELSE NULL
    END                                                    AS trusted_ancestor_or_self,
    i.occ_id IS NOT NULL                                   AS is_disputed,
    sd.occ_id IS NOT NULL                                  AS has_expert_self_disagreement,
    COALESCE(uf.has_unresolved, FALSE)
        AND d.occ_id IS NOT NULL                           AS has_uncomparable_assertion,
    f.expert_assertion_count,
    c.identifier_count,
    c.identifiers
FROM flags f
LEFT JOIN unresolved_flags uf   ON uf.occ_id = f.occ_id
LEFT JOIN incompatible i        ON i.occ_id = f.occ_id
LEFT JOIN lca l                 ON l.occ_id = f.occ_id
LEFT JOIN {{ ref('int_taxon_nodes') }} ln ON ln.taxon_id = l.lca_taxon_id
LEFT JOIN deepest d             ON d.occ_id = f.occ_id
LEFT JOIN unresolved_only u     ON u.occ_id = f.occ_id
LEFT JOIN self_disagreement sd  ON sd.occ_id = f.occ_id
LEFT JOIN color c               ON c.occ_id = f.occ_id
