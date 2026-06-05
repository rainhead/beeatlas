-- RCN-07 — Anthophila ancestor taxon_id=630955 (verify in Plan 135-05 build step per RESEARCH A3).
--
-- Singular dbt test: fails (returns rows) if any canonical_name within Anthophila
-- maps to more than one distinct taxon_id in int_combined.
--
-- A homonym collision in int_combined means a name resolves to different species
-- for different occurrence sources — a data-integrity error that would silently
-- filter the wrong occurrences on the map. Hard-fail is required (RCN-07); do NOT
-- add severity='warn'.
--
-- Anthophila filter: taxon_id must appear in taxa.csv.gz under ancestry including
-- the Anthophila node (630955). Uses the same read_csv pattern as
-- stg_inat__genus_taxon_ids.sql and stg_inat__higher_rank_taxon_ids.sql.
-- Path: data/dbt is CWD when dbt runs (run.sh cd-s into data/dbt), so
-- '../raw/taxa.csv.gz' resolves to data/raw/taxa.csv.gz.
--
-- NOTE: This test references int_combined which Phase 135 does NOT modify.
-- Against the current (unmodified) int_combined the test returns zero rows —
-- that is the correct GREEN baseline. The test becomes meaningful when Phase 137
-- promotes checklist rows into int_combined (a source='checklist' ARM 4).

WITH anthophila_taxon_ids AS (
    -- All active taxon_ids whose ancestry path passes through Anthophila (630955).
    SELECT DISTINCT CAST(taxon_id AS INTEGER) AS taxon_id
    FROM read_csv(
        '../raw/taxa.csv.gz',
        delim = chr(9),
        header = true,
        compression = 'gzip',
        columns = {
            'taxon_id': 'BIGINT',
            'ancestry': 'VARCHAR',
            'rank_level': 'BIGINT',
            'rank': 'VARCHAR',
            'name': 'VARCHAR',
            'active': 'VARCHAR'
        }
    )
    WHERE active = 'true'
      AND list_contains(string_split(ancestry, '/'), '630955')
),

homonym_candidates AS (
    -- Find any canonical_name within Anthophila that maps to more than one taxon_id.
    SELECT
        c.canonical_name,
        COUNT(DISTINCT c.taxon_id) AS taxon_id_count
    FROM {{ ref('int_combined') }} c
    WHERE c.taxon_id IS NOT NULL
      AND c.taxon_id IN (SELECT taxon_id FROM anthophila_taxon_ids)
    GROUP BY c.canonical_name
    HAVING COUNT(DISTINCT c.taxon_id) > 1
)

-- dbt singular tests fail when this query returns any rows.
-- Non-empty result = homonym detected = build fails = RCN-07 satisfied.
SELECT *
FROM homonym_candidates
