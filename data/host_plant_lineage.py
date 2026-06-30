"""Phase 175 plant-host lineage pipeline.

Walks the ancestry column of the already-downloaded data/raw/taxa.csv.gz
for the observed host plant taxon_ids and materialises them as
inaturalist_data.host_plant_lineage (taxon_id, family, genus).

The seed set is derived from inaturalist_data.observations joined to
ecdysis_data.occurrence_links on host_observation_id — the ~915 distinct
host plant taxa actually observed in the field as floral hosts.

Mirrors taxa_pipeline.load_taxon_lineage_extended but replaces the
Anthophila ancestry filter with a seed-set restriction so the walk is
bounded to observed host taxa rather than all of Plantae.

Anti-patterns avoided:
- active = 'true' (string), not active = true (bool)
- UNION ALL self_rows arm included (ancestry column omits self)
- target_taxon_id aliased to taxon_id in final SELECT
- seed-set restriction replaces LIKE '%/N/%' — walk is bounded to ~915 taxa
"""

import os
from pathlib import Path

import duckdb

DB_PATH = os.environ.get("DB_PATH", str(Path(__file__).parent / "beeatlas.duckdb"))
RAW_DIR = Path(__file__).parent / "raw"
TAXA_PATH = RAW_DIR / "taxa.csv.gz"


def load_host_plant_lineage(db_path: str | None = None) -> None:
    """Populate inaturalist_data.host_plant_lineage from local taxa.csv.gz.

    Reads TAXA_PATH (gzip-compressed TSV), walks the ancestry column for the
    observed host plant taxon_ids (seed set from occurrence_links × observations),
    and materialises the result as inaturalist_data.host_plant_lineage with
    columns: (taxon_id, family, genus).

    The seed set (~915 distinct host plant taxa) replaces the Anthophila
    Anthophila ancestry filter from taxa_pipeline — keeping the walk bounded and
    the result relevant to the floral-host provenance feature (Phase 175).

    Anti-patterns avoided:
    - active = 'true' (string), not active = true (bool)
    - UNION ALL self_rows arm included (ancestry column omits self)
    - target_taxon_id aliased to taxon_id in final SELECT
    - seed-set restriction in final WHERE rather than a full-Plantae walk
    """
    if db_path is None:
        db_path = DB_PATH

    con = duckdb.connect(db_path)
    try:
        con.execute("CREATE SCHEMA IF NOT EXISTS inaturalist_data")
        con.execute(
            """
            CREATE OR REPLACE TABLE inaturalist_data.host_plant_lineage AS
            WITH host_seed_ids AS (
                -- Distinct host plant taxon_ids actually linked as floral hosts.
                -- Source: ecdysis occurrence_links joined to iNat observations.
                -- Bounds the walk to ~915 taxa rather than all of Plantae.
                SELECT DISTINCT o.taxon__id AS taxon_id
                FROM inaturalist_data.observations o
                JOIN ecdysis_data.occurrence_links l ON l.host_observation_id = o.id
                WHERE o.taxon__id IS NOT NULL
            ),
            all_active_taxa AS (
                -- All active taxa from the full iNat taxonomy archive.
                -- active column is string 'true'/'false', not a SQL boolean.
                SELECT taxon_id, ancestry, rank, name
                FROM read_csv(?, delim='\t', header=true, compression='gzip',
                              columns={'taxon_id':'BIGINT','ancestry':'VARCHAR',
                                       'rank_level':'INTEGER','rank':'VARCHAR',
                                       'name':'VARCHAR','active':'VARCHAR'})
                WHERE active = 'true'
            ),
            -- Unnest ancestor IDs from the ancestry string (for seed taxa only).
            -- Restricting to seeds here avoids a full walk of all active taxa.
            ancestor_ids AS (
                SELECT
                    b.taxon_id AS target_taxon_id,
                    CAST(unnest(string_split(b.ancestry, '/')) AS BIGINT) AS ancestor_id
                FROM all_active_taxa b
                WHERE b.taxon_id IN (SELECT taxon_id FROM host_seed_ids)
            ),
            -- Join ancestor IDs back to the taxa table to get rank/name
            ancestor_rows AS (
                SELECT ai.target_taxon_id, anc.rank, anc.name
                FROM ancestor_ids ai
                JOIN all_active_taxa anc ON anc.taxon_id = ai.ancestor_id
                WHERE anc.rank IN ('family', 'genus')
            ),
            -- Include the taxon itself (genus/family taxa are NOT in their own ancestry)
            self_rows AS (
                SELECT taxon_id AS target_taxon_id, rank, name
                FROM all_active_taxa
                WHERE taxon_id IN (SELECT taxon_id FROM host_seed_ids)
                  AND rank IN ('family', 'genus')
            ),
            all_rows AS (
                SELECT * FROM ancestor_rows
                UNION ALL
                SELECT * FROM self_rows
            ),
            pivoted AS (
                PIVOT all_rows
                    ON rank IN ('family', 'genus')
                    USING first(name)
                    GROUP BY target_taxon_id
            )
            SELECT target_taxon_id AS taxon_id, family, genus
            FROM pivoted
            WHERE taxon_id IN (SELECT taxon_id FROM host_seed_ids)
            """,
            [str(TAXA_PATH)],
        )
        count = con.execute(
            "SELECT count(*) FROM inaturalist_data.host_plant_lineage"
        ).fetchone()[0]
        print(f"host_plant_lineage: {count} rows")  # noqa: T201
    finally:
        con.close()
