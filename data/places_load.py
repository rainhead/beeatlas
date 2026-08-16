"""Load named places into the geographies.places DuckDB table (PPIPE-01).

TWO SOURCES, one table:

  content/places.toml       kind='site'         — curated collecting locations,
                            authored by hand, each with a land owner and permits.
  geographies.ecoregions_l4 kind='ecoregion_l4' — EPA Level IV ecoregions, loaded
                            by geographies_pipeline. No land owner: nobody owns an
                            ecoregion, so the place pages omit the field.

Both are places in every sense the rest of the pipeline cares about — the
occurrence_places bridge joins ST_Within against this one table, so an ecoregion
gets record membership, a /places/<slug>.html page, a per-place SVG map and a
filter chip for free (beeatlas-8gcw).

Runs after places-validation and before dbt-build. The geom column is stored as
GEOMETRY, making it available for ST_Within spatial joins downstream.
"""

import os
import re
import tomllib
from pathlib import Path

import duckdb

DB_PATH = os.environ.get('DB_PATH', str(Path(__file__).parent / 'beeatlas.duckdb'))

# Place kinds. `kind` is what the site templates branch on — the ecoregion section
# on /places.html, and the land-owner line the ecoregion pages omit.
KIND_SITE = "site"
KIND_ECOREGION_L4 = "ecoregion_l4"


def _slugify(name: str) -> str:
    """Lowercase [a-z0-9-] slug, matching places_validation.SLUG_RE.

    '/' becomes a separator rather than being dropped, so
    'Cascade Subalpine/Alpine' -> 'cascade-subalpine-alpine' instead of
    'cascade-subalpinealpine'.
    """
    return re.sub(r'[^a-z0-9]+', '-', name.lower()).strip('-')


def ecoregion_l4_slug(code: str, name: str) -> str:
    """Slug for a Level IV ecoregion place: '1d' + 'Volcanics' -> '1d-volcanics'.

    The EPA code leads. Slugs are immutable after first publish, so this is a
    one-way decision: several Level IV names ('Volcanics', 'Outwash', 'Valley
    Foothills') are meaningless standing alone, the code is how the EPA itself
    cites them, and prefixing also namespaces these away from the hand-authored
    site slugs so a future collecting site can never collide with one.
    """
    return f"{_slugify(code)}-{_slugify(name)}"


def ecoregion_l4_title(code: str, name: str) -> str:
    """Display name for a Level IV ecoregion place: '1d. Volcanics'."""
    return f"{code}. {name}"


def _create_places_table(con: duckdb.DuckDBPyConnection) -> None:
    """(Re)create geographies.places.

    `land_owner` is NULL for ecoregions; `l3_name` and `code` are NULL for sites.
    Kept as columns on the one table rather than a second table because every
    consumer downstream — the occurrence_places bridge, places_export, place-maps —
    wants "all the places" and would otherwise have to UNION them back together.
    """
    con.execute("CREATE SCHEMA IF NOT EXISTS geographies")
    con.execute(
        "CREATE OR REPLACE TABLE geographies.places ("
        "slug VARCHAR, name VARCHAR, kind VARCHAR, land_owner VARCHAR, "
        "l3_name VARCHAR, code VARCHAR, geom GEOMETRY)"
    )


def _load_toml_places(con: duckdb.DuckDBPyConnection, toml_path: Path) -> int:
    """Insert one kind='site' row per [[places]] entry. Returns the row count."""
    with open(toml_path, "rb") as f:
        data = tomllib.load(f)
    places = data.get("places", [])
    for p in places:
        con.execute(
            "INSERT INTO geographies.places VALUES (?, ?, ?, ?, NULL, NULL, ST_GeomFromText(?))",
            [p["slug"], p["name"], KIND_SITE, p["land_owner"], p["geometry_wkt"].strip()],
        )
    return len(places)


def _load_ecoregion_places(con: duckdb.DuckDBPyConnection) -> int:
    """Insert one kind='ecoregion_l4' row per geographies.ecoregions_l4 row.

    Silently loads nothing when the source table is absent: the Level IV layer is
    part of the same geographies load as the rest, but a database that predates it
    should degrade to "no ecoregion places" rather than failing the build — the
    site templates already guard on an empty ecoregion section.
    """
    exists = con.execute(
        "SELECT COUNT(*) FROM duckdb_tables() "
        "WHERE schema_name = 'geographies' AND table_name = 'ecoregions_l4'"
    ).fetchone()[0]
    if not exists:
        print("  geographies.ecoregions_l4 absent — no ecoregion places loaded")  # noqa: T201
        return 0
    rows = con.execute(
        "SELECT l4_code, l4_name FROM geographies.ecoregions_l4 ORDER BY l4_code"
    ).fetchall()
    # Slug and title are derived in Python, so they ride in on a join key rather
    # than through a fetchall() of the geometry — a GEOMETRY round-tripped out to
    # Python and back is a conversion this has no reason to risk.
    con.execute("CREATE OR REPLACE TEMP TABLE _l4_labels (l4_code VARCHAR, slug VARCHAR, title VARCHAR)")
    con.executemany(
        "INSERT INTO _l4_labels VALUES (?, ?, ?)",
        [(code, ecoregion_l4_slug(code, name), ecoregion_l4_title(code, name)) for code, name in rows],
    )
    con.execute(
        "INSERT INTO geographies.places "
        "SELECT b.slug, b.title, ?, NULL, e.l3_name, e.l4_code, e.geom "
        "FROM geographies.ecoregions_l4 e JOIN _l4_labels b USING (l4_code)",
        [KIND_ECOREGION_L4],
    )
    con.execute("DROP TABLE _l4_labels")
    return len(rows)


def load_places(toml_path: "Path | str", db_path: str | None = None) -> None:
    """Load both place sources into geographies.places.

    Opens (or creates) the DuckDB at db_path, creates the geographies schema
    and places table idempotently, then inserts the hand-authored sites from
    toml_path (parameterized ST_GeomFromText, so no WKT injection) followed by
    one place per Level IV ecoregion already loaded into the database.

    Args:
        toml_path: Path to content/places.toml.
        db_path:   Path to DuckDB database file. Defaults to DB_PATH env var
                   or data/beeatlas.duckdb.
    """
    toml_path = Path(toml_path)
    db = db_path or DB_PATH
    con = duckdb.connect(db)
    con.execute("LOAD spatial")  # NOT INSTALL — extension already installed (decision 97-01)
    _create_places_table(con)
    sites = _load_toml_places(con, toml_path)
    ecoregions = _load_ecoregion_places(con)
    print(  # noqa: T201
        f"  geographies.places: {sites + ecoregions} row(s) loaded "
        f"({sites} site(s), {ecoregions} Level IV ecoregion(s))"
    )
    con.close()


def load_places_step() -> None:
    """Zero-argument wrapper for inclusion in run.py STEPS list.

    Derives the path to content/places.toml relative to this module's
    location (data/ → repo root → content/places.toml).
    Mirrors validate_places_step exactly.
    """
    toml_path = Path(__file__).parent.parent / "content" / "places.toml"
    load_places(toml_path)
