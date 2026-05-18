"""Load content/places.toml into geographies.places DuckDB table (PPIPE-01).

Runs after places-validation and before dbt-build. Creates (or replaces)
the geographies.places table with one row per [[places]] entry. The geom
column is stored as GEOMETRY via ST_GeomFromText, making it available for
ST_Within spatial joins in the occurrences mart.
"""

import os
import tomllib
from pathlib import Path

import duckdb

DB_PATH = os.environ.get('DB_PATH', str(Path(__file__).parent / 'beeatlas.duckdb'))


def load_places(toml_path: "Path | str", db_path: str | None = None) -> None:
    """Read toml_path and load all place entries into geographies.places.

    Opens (or creates) the DuckDB at db_path, creates the geographies schema
    and places table idempotently, then inserts one row per [[places]] entry
    using a parameterized ST_GeomFromText(?) call to prevent WKT injection.

    Args:
        toml_path: Path to content/places.toml.
        db_path:   Path to DuckDB database file. Defaults to DB_PATH env var
                   or data/beeatlas.duckdb.
    """
    toml_path = Path(toml_path)
    with open(toml_path, "rb") as f:
        data = tomllib.load(f)
    places = data.get("places", [])

    db = db_path or DB_PATH
    con = duckdb.connect(db)
    con.execute("LOAD spatial")  # NOT INSTALL — extension already installed (decision 97-01)
    con.execute("CREATE SCHEMA IF NOT EXISTS geographies")
    con.execute(
        "CREATE OR REPLACE TABLE geographies.places "
        "(slug VARCHAR, name VARCHAR, land_owner VARCHAR, geom GEOMETRY)"
    )
    for p in places:
        con.execute(
            "INSERT INTO geographies.places VALUES (?, ?, ?, ST_GeomFromText(?))",
            [p["slug"], p["name"], p["land_owner"], p["geometry_wkt"].strip()],
        )
    print(f"  geographies.places: {len(places)} row(s) loaded")  # noqa: T201
    con.close()


def load_places_step() -> None:
    """Zero-argument wrapper for inclusion in run.py STEPS list.

    Derives the path to content/places.toml relative to this module's
    location (data/ → repo root → content/places.toml).
    Mirrors validate_places_step exactly.
    """
    toml_path = Path(__file__).parent.parent / "content" / "places.toml"
    load_places(toml_path)
