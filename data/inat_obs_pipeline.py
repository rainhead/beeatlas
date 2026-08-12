"""ARM 4 upstream: expert iNat observations for int_combined (record_type='inat_expert').

Reads inat_expert_data.observations — the live v2 API dataset loaded by
inat_expert_pipeline.py (beeatlas-iek cutover, 2026-08-12; previously the
hand-refreshed data/raw/inat_expert_obs.csv, whose ~5%-per-two-months drift and
manual export step this retires) — applies D-04 canonicalization to the taxon
name, deduplicates against WABA-linked specimen_observation_ids, and loads the
result into inat_obs_data.observations. The 12-column output schema is
unchanged from the CSV era, so downstream (int_combined ARM 4, the st-0vz
integrity gate) is untouched.

Parity notes vs the CSV export:
- license: the API sends lowercase license_code ('cc-by-nc'); the export sent
  'CC-BY-NC'. Uppercased here so downstream display/filtering sees the same
  vocabulary.
- image_url: the loader already medium-sizes the first photo URL — byte-equal
  to the export's image_url on shared rows (verified 2026-08-12).
- scientific_name: the observation's community taxon name (taxon.name), the
  same concept the export's scientific_name column carried.
"""
import os
from pathlib import Path

import duckdb

from canonical_name import normalize_scientific_name

DB_PATH = os.environ.get("DB_PATH", str(Path(__file__).parent / "beeatlas.duckdb"))

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
    """Build inat_obs_data.observations from inat_expert_data.observations."""
    con = duckdb.connect(DB_PATH)
    try:
        excluded_ids = _load_excluded_ids(con)
        con.execute("CREATE SCHEMA IF NOT EXISTS inat_obs_data")

        src = con.execute("""
            SELECT id, observed_on, latitude, longitude, taxon__name,
                   user__login, image_url, license_code, floral_host, quality_grade
            FROM inat_expert_data.observations
        """).fetchall()

        rows: list[tuple] = []
        for (obs_id, observed_on, lat, lon, sci_name, user_login,
             image_url, license_code, floral_host, quality_grade) in src:
            if obs_id in excluded_ids:
                continue
            sci_name = (sci_name or "").strip() or None
            rows.append((
                obs_id,
                observed_on or None,
                lat,
                lon,
                normalize_scientific_name(sci_name),
                sci_name,
                user_login or None,
                image_url or None,
                license_code.upper() if license_code else None,
                floral_host or None,
                quality_grade or None,
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
