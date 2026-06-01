-- Active Animalia genus self-rows: (genus_name lowercase -> genus self-row taxon_id INTEGER).
--
-- Source of truth: data/raw/taxa.csv.gz (the full iNat Open Data taxa dump, all ranks/all
-- kingdoms, already downloaded by the taxa-download pipeline STEP before `dbt build`). Read
-- directly via DuckDB read_csv because the full dump (with `rank` + `ancestry`) is NOT loaded
-- into DuckDB anywhere: the only taxa tables are `taxon_lineage_extended` (Anthophila-filtered,
-- no rank column — fans out + bee-only, NOT a usable genus map) and the species-level
-- `canonical_to_taxon_id` bridge. So the raw read_csv is the only dbt-only path (Phase 128 D-02).
--
-- Why the Animalia (kingdom taxon `1`) ancestry filter, not the Anthophila (bees-only) clade:
--   Ecdysis identifications are all animals — the non-bee aculeates collected alongside the bees
--   (wasps, flies: Ammophila, Bembix, Cerceris, Crabro, Philanthus, ...) are real animal genus
--   IDs and should link to their real iNat genus taxon, not be forced NULL (D-02/D-07). The
--   Animalia filter also resolves the cross-kingdom homonym collision: the orchid Stelis lives in
--   Plantae (47126) so it is excluded, leaving the bee Stelis (127831). Verified 2026-06-01:
--   0 of our 149 occurrence genera collide within Animalia, so the downstream LEFT JOIN cannot
--   fan out (a dbt `unique` test on genus_name in schema.yml is the fail-loud safety net, D-02b).
--
-- taxon_id is cast BIGINT->INTEGER to match the occurrences/species contract (RESEARCH Pitfall 4).
-- Path note: run.sh `cd`s into data/dbt before invoking dbt, so the DuckDB process CWD is data/dbt
-- and `../raw/taxa.csv.gz` resolves to data/raw/taxa.csv.gz (same relative convention as profiles.yml).
--
-- Cross-phylum homonym handling (D-02b, refined during execution 2026-06-01): within Animalia there
-- are 58 genus names shared across animal phyla (e.g. an insect Taracticus and a different-phylum
-- Taracticus — distinct valid taxa that share a name). Emitting both rows would make the downstream
-- int_combined LEFT JOIN fan out for any occurrence whose genus matched a homonym, AND would silently
-- pick one arbitrarily. Verified: 0 of our 149 occurrence genera are among these 58, so excluding the
-- ambiguous names (HAVING COUNT(*) = 1) drops 0 of our resolutions while making genus_name genuinely
-- unique. Fail-safe: if a future occurrence genus ever matches an excluded homonym it stays NULL
-- (surfaced by the re-scoped not_null warn) rather than silently resolving to the wrong taxon. The
-- dbt `unique` test on genus_name (schema.yml) then passes and still fails loudly if the dedup logic
-- ever regresses.
{{ config(materialized='view') }}

WITH animal_genera AS (
    SELECT
        lower(name)        AS genus_name,
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
    WHERE rank = 'genus'
      AND active = 'true'
      AND list_contains(string_split(ancestry, '/'), '1')  -- kingdom = Animalia (taxon 1)
)

SELECT genus_name, ANY_VALUE(taxon_id) AS taxon_id
FROM animal_genera
GROUP BY genus_name
HAVING COUNT(*) = 1  -- exclude cross-phylum homonyms (none touch our data; keeps genus_name unique)
