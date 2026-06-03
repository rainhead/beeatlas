-- Active Anthophila higher-rank taxa: (name, rank) -> taxon_id for
-- rank IN ('subfamily', 'tribe', 'subgenus') among Anthophila descendants.
--
-- Extends the stg_inat__genus_taxon_ids.sql read_csv pattern to the three
-- higher ranks needed by the higher_taxa mart (Phase 132 D-02). Genus is
-- already handled by stg_inat__genus_taxon_ids; this view covers the rest.
--
-- Ancestry filter: Anthophila root taxon_id = 630955 (not Animalia '1').
-- Genus-level dedup (HAVING COUNT(*) = 1) is not needed here: tribal/
-- subfamily/subgenus names are unique within Anthophila by assumption (A1
-- in RESEARCH.md); a `unique` dbt test on (name, rank) is the fail-loud
-- safety net.
--
-- Output columns:
--   name     VARCHAR  -- raw capitalized name (e.g. 'Apinae', 'Bombini', 'Pyrobombus')
--   rank     VARCHAR  -- 'subfamily' | 'tribe' | 'subgenus'
--   taxon_id INTEGER  -- the higher-rank taxon's own taxon_id (cast BIGINT->INTEGER)
--
-- Path note: run.sh cd-s into data/dbt before invoking dbt, so DuckDB CWD is
-- data/dbt and '../raw/taxa.csv.gz' resolves to data/raw/taxa.csv.gz.
{{ config(materialized='view') }}

WITH bee_higher_ranks AS (
    SELECT
        name               AS name,
        rank               AS rank,
        taxon_id::INTEGER  AS taxon_id
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
    WHERE rank IN ('subfamily', 'tribe', 'subgenus')
      AND active = 'true'
      AND list_contains(string_split(ancestry, '/'), '630955')  -- Anthophila only
)

SELECT name, rank, taxon_id
FROM bee_higher_ranks
