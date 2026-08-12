-- Full typed view over the iNat taxonomy dump (~1.64M rows), the local-lineage
-- authority for ancestor-or-self compatibility and hedge-anchor resolution
-- (ADR 0033 items 2 and 9; ADR 0030 — local lineage, never per-ID lookups).
--
-- stg_inat__genus_taxon_ids / stg_inat__higher_rank_taxon_ids read the same
-- file with narrower projections; this view adds ancestry (as an ordered
-- root->leaf INTEGER list) and rank_level, which they don't carry.
-- View, not table: only materialized downstream models (int_taxon_nodes)
-- query it, once per build.
--
-- Path note: run.sh cd-s into data/dbt, so '../raw/taxa.csv.gz' resolves to
-- data/raw/taxa.csv.gz.
{{ config(materialized='view') }}

SELECT
    taxon_id::INTEGER                                       AS taxon_id,
    name,
    rank,
    rank_level::INTEGER                                     AS rank_level,
    active = 'true'                                         AS active,
    CASE WHEN ancestry IS NULL OR ancestry = '' THEN []
         ELSE list_transform(string_split(ancestry, '/'), x -> x::INTEGER)
    END                                                     AS ancestor_ids
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
