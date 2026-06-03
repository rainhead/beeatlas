-- Singular test: (name, rank) is unique in stg_inat__higher_rank_taxon_ids.
-- Fails (returns rows) if any (name, rank) combination appears more than once,
-- which would indicate a homonymous higher-rank taxon within Anthophila (A1 safety net).
SELECT name, rank, COUNT(*) AS cnt
FROM {{ ref('stg_inat__higher_rank_taxon_ids') }}
GROUP BY name, rank
HAVING COUNT(*) > 1
