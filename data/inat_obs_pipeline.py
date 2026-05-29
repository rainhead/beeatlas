"""Phase 117 iNat expert observations pipeline.

Reads the committed iNat CSV export (data/raw/inat_expert_obs.csv), applies
D-04 canonicalization to scientific_name, deduplicates against WABA-linked
specimen_observation_ids, and loads the result into the DuckDB staging table
inat_obs_data.observations for downstream use by int_combined (Phase 118).

Phase 117 / PIPE-01..04.
"""
import csv
import os
from pathlib import Path

import duckdb

from canonical_name import apply_synonym, canonicalize

DB_PATH = os.environ.get("DB_PATH", str(Path(__file__).parent / "beeatlas.duckdb"))
CSV_PATH = Path(__file__).parent / "raw" / "inat_expert_obs.csv"

_FLORAL_HOST_FIELD = "field:associated species with names lookup"
_OBS_URL_PREFIX = "https://www.inaturalist.org/observations/"


def _load_excluded_ids(con: duckdb.DuckDBPyConnection) -> set[int]:
    """Return set of iNat obs IDs that are already represented as Ecdysis specimens.

    Queries dbt_sandbox.int_waba_link (VIEW on raw waba tables), falling back
    to raw inaturalist_waba_data query if dbt_sandbox schema is absent (first run).
    """
    try:
        rows = con.execute("""
            SELECT DISTINCT CAST(specimen_observation_id AS BIGINT)
            FROM dbt_sandbox.int_waba_link
            WHERE specimen_observation_id IS NOT NULL
        """).fetchall()
    except duckdb.CatalogException:
        # dbt_sandbox absent on first-ever run; query raw tables directly.
        # The specimen observation ID is stored as the OFV value for field_id=18116.
        rows = con.execute("""
            SELECT DISTINCT CAST(ofv.value AS BIGINT)
            FROM inaturalist_waba_data.observations__ofvs ofv
            WHERE ofv.field_id = 18116 AND ofv.value != '' AND ofv.value IS NOT NULL
        """).fetchall()
    return {r[0] for r in rows}


def load_inat_obs() -> None:
    """Read inat_expert_obs.csv and populate inat_obs_data.observations in DuckDB."""
    con = duckdb.connect(DB_PATH)
    try:
        excluded_ids = _load_excluded_ids(con)
        con.execute("CREATE SCHEMA IF NOT EXISTS inat_obs_data")

        rows: list[tuple] = []
        with CSV_PATH.open(newline="", encoding="utf-8") as f:
            reader = csv.DictReader(f)
            for row in reader:
                obs_id = int(row["id"])
                if obs_id in excluded_ids:
                    continue
                sci_name = (row.get("scientific_name") or "").strip() or None
                rows.append((
                    obs_id,
                    row.get("observed_on") or None,
                    float(row["latitude"]) if row.get("latitude") else None,
                    float(row["longitude"]) if row.get("longitude") else None,
                    apply_synonym(canonicalize(sci_name)),
                    sci_name,
                    row.get("user_login") or None,
                    row.get("image_url") or None,
                    row.get("license") or None,
                    row.get(_FLORAL_HOST_FIELD) or None,
                    row.get("quality_grade") or None,
                    f"{_OBS_URL_PREFIX}{obs_id}",
                ))

        con.execute("""
            CREATE OR REPLACE TABLE inat_obs_data.observations (
                obs_id BIGINT,
                observed_on DATE,
                lat DOUBLE,
                lon DOUBLE,
                canonical_name VARCHAR,
                scientific_name VARCHAR,
                user_login VARCHAR,
                image_url VARCHAR,
                license VARCHAR,
                floral_host VARCHAR,
                quality_grade VARCHAR,
                obs_url VARCHAR
            )
        """)
        con.executemany(
            "INSERT INTO inat_obs_data.observations VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
            rows,
        )

        total = con.execute(
            "SELECT count(*) FROM inat_obs_data.observations"
        ).fetchone()[0]
        null_canon = con.execute(
            "SELECT count(*) FROM inat_obs_data.observations "
            "WHERE canonical_name IS NULL AND scientific_name IS NOT NULL"
        ).fetchone()[0]
        print(  # noqa: T201
            f"inat_obs: {total:,} rows loaded ({len(excluded_ids)} deduped); "
            f"{null_canon} rows with null canonical_name (scientific_name present)"
        )

    finally:
        con.close()


if __name__ == "__main__":
    load_inat_obs()
