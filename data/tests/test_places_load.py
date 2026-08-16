"""Tests for places_load.py — geographies.places table creation and ST_Within usability (PPIPE-01)."""

import pytest
from pathlib import Path
import duckdb
from places_load import load_places


_VALID_PLACE = {
    "slug": "test-place",
    "name": "Test Place",
    "land_owner": "DNR",
    "geometry_wkt": "POLYGON((-121.0 47.0, -120.9 47.0, -120.9 47.1, -121.0 47.1, -121.0 47.0))",
    "permits": [{"issuing_authority": "DNR", "type": "project-level"}],
}


def write_toml(tmp_path: Path, places: list[dict]) -> Path:
    """Write a minimal TOML file with the given places list.

    Serializes each place dict as a [[places]] TOML array-of-tables entry.
    Returns the Path of the written file.
    """
    lines = []
    for p in places:
        lines.append("[[places]]")
        lines.append(f'slug = {p["slug"]!r}')
        lines.append(f'name = {p["name"]!r}')
        lines.append(f'land_owner = {p["land_owner"]!r}')
        lines.append(f'geometry_wkt = {p["geometry_wkt"]!r}')
        permit_strs = []
        for permit in p["permits"]:
            kv = ", ".join(f'{k} = {v!r}' for k, v in permit.items())
            permit_strs.append(f"{{{kv}}}")
        lines.append(f'permits = [{", ".join(permit_strs)}]')
        lines.append("")
    path = tmp_path / "places.toml"
    path.write_text("\n".join(lines), encoding="utf-8")
    return path


def test_load_creates_table(tmp_path):
    """load_places creates geographies.places with one row per [[places]] entry."""
    toml_path = write_toml(tmp_path, [_VALID_PLACE])
    db_path = str(tmp_path / "test.duckdb")
    load_places(toml_path, db_path)
    con = duckdb.connect(db_path)
    count = con.execute("SELECT COUNT(*) FROM geographies.places").fetchone()[0]
    con.close()
    assert count == 1


def test_places_geometry_usable(tmp_path):
    """The GEOMETRY column survives the round-trip and ST_Within works against the polygon."""
    toml_path = write_toml(tmp_path, [_VALID_PLACE])
    db_path = str(tmp_path / "test.duckdb")
    load_places(toml_path, db_path)
    con = duckdb.connect(db_path)
    con.execute("LOAD spatial")
    row = con.execute(
        "SELECT slug FROM geographies.places WHERE ST_Within(ST_Point(-120.95, 47.05), geom)"
    ).fetchone()
    con.close()
    assert row is not None
    assert row[0] == "test-place"


def test_occurrence_inside_place_gets_slug(tmp_path):
    """An occurrence point inside the polygon returns the place's slug (non-NULL)."""
    toml_path = write_toml(tmp_path, [_VALID_PLACE])
    db_path = str(tmp_path / "test.duckdb")
    load_places(toml_path, db_path)
    con = duckdb.connect(db_path)
    con.execute("LOAD spatial")
    # (-120.95, 47.05) is inside POLYGON((-121.0 47.0, -120.9 47.0, -120.9 47.1, -121.0 47.1, -121.0 47.0))
    row = con.execute(
        "SELECT slug FROM geographies.places WHERE ST_Within(ST_Point(-120.95, 47.05), geom)"
    ).fetchone()
    con.close()
    assert row is not None, "Expected slug for point inside polygon, got None"
    assert row[0] == "test-place"


def test_occurrence_outside_places_is_null(tmp_path):
    """An occurrence point outside all polygons returns no match (no fallback — NULL semantics)."""
    toml_path = write_toml(tmp_path, [_VALID_PLACE])
    db_path = str(tmp_path / "test.duckdb")
    load_places(toml_path, db_path)
    con = duckdb.connect(db_path)
    con.execute("LOAD spatial")
    # (-110.0, 35.0) is outside the test polygon (and outside WA entirely)
    row = con.execute(
        "SELECT slug FROM geographies.places WHERE ST_Within(ST_Point(-110.0, 35.0), geom)"
    ).fetchone()
    con.close()
    assert row is None, "Expected no match for point outside all polygons"


# ---------------------------------------------------------------------------
# Level IV ecoregion places (beeatlas-8gcw)
# ---------------------------------------------------------------------------

_ECOREGION_WKT = "POLYGON((-122.0 46.0, -119.0 46.0, -119.0 48.0, -122.0 48.0, -122.0 46.0))"


def seed_ecoregions_l4(db_path: str, rows: list[tuple[str, str, str]]) -> None:
    """Create geographies.ecoregions_l4 with (l4_code, l4_name, l3_name) rows."""
    con = duckdb.connect(db_path)
    con.execute("LOAD spatial")
    con.execute("CREATE SCHEMA IF NOT EXISTS geographies")
    con.execute("""
        CREATE OR REPLACE TABLE geographies.ecoregions_l4 (
            l4_code VARCHAR, l4_name VARCHAR, l3_name VARCHAR, geom GEOMETRY
        )
    """)
    for code, name, l3 in rows:
        con.execute(
            "INSERT INTO geographies.ecoregions_l4 VALUES (?, ?, ?, ST_GeomFromText(?))",
            [code, name, l3, _ECOREGION_WKT],
        )
    con.close()


def test_toml_places_are_kind_site(tmp_path):
    """A hand-authored place loads as kind='site' with its land owner and no L4 fields."""
    toml_path = write_toml(tmp_path, [_VALID_PLACE])
    db_path = str(tmp_path / "test.duckdb")
    load_places(toml_path, db_path)
    con = duckdb.connect(db_path)
    row = con.execute(
        "SELECT kind, land_owner, l3_name, code FROM geographies.places WHERE slug = 'test-place'"
    ).fetchone()
    con.close()
    assert row == ("site", "DNR", None, None)


def test_ecoregions_become_places(tmp_path):
    """Level IV ecoregions load alongside the sites, code-prefixed and owner-less."""
    toml_path = write_toml(tmp_path, [_VALID_PLACE])
    db_path = str(tmp_path / "test.duckdb")
    seed_ecoregions_l4(db_path, [("1d", "Volcanics", "Coast Range")])
    load_places(toml_path, db_path)
    con = duckdb.connect(db_path)
    row = con.execute(
        "SELECT slug, name, kind, land_owner, l3_name, code FROM geographies.places "
        "WHERE kind = 'ecoregion_l4'"
    ).fetchone()
    total = con.execute("SELECT COUNT(*) FROM geographies.places").fetchone()[0]
    con.close()
    # 'Volcanics' alone names nothing; the EPA code is what disambiguates it, and
    # nobody owns an ecoregion.
    assert row == ("1d-volcanics", "1d. Volcanics", "ecoregion_l4", None, "Coast Range", "1d")
    assert total == 2, "the site and the ecoregion share one table"


def test_ecoregion_slug_handles_punctuation(tmp_path):
    """A '/' in an EPA name is a separator, not a character to drop."""
    toml_path = write_toml(tmp_path, [_VALID_PLACE])
    db_path = str(tmp_path / "test.duckdb")
    seed_ecoregions_l4(db_path, [("4d", "Cascade Subalpine/Alpine", "Cascades")])
    load_places(toml_path, db_path)
    con = duckdb.connect(db_path)
    slug = con.execute(
        "SELECT slug FROM geographies.places WHERE kind = 'ecoregion_l4'"
    ).fetchone()[0]
    con.close()
    assert slug == "4d-cascade-subalpine-alpine"


def test_ecoregion_place_is_spatially_joinable(tmp_path):
    """The ecoregion geometry survives the load — it is what the bridge joins against."""
    toml_path = write_toml(tmp_path, [_VALID_PLACE])
    db_path = str(tmp_path / "test.duckdb")
    seed_ecoregions_l4(db_path, [("2f", "Central Puget Lowland", "Strait of Georgia/Puget Lowland")])
    load_places(toml_path, db_path)
    con = duckdb.connect(db_path)
    con.execute("LOAD spatial")
    slugs = [r[0] for r in con.execute(
        "SELECT slug FROM geographies.places WHERE ST_Within(ST_Point(-120.95, 47.05), geom) ORDER BY slug"
    ).fetchall()]
    con.close()
    # The point is inside BOTH the test site and the ecoregion — membership is
    # many-to-many, and an ecoregion place does not displace the site it contains.
    assert slugs == ["2f-central-puget-lowland", "test-place"]


def test_missing_ecoregion_table_degrades(tmp_path):
    """A database without the Level IV layer loads the sites and says so, not raises."""
    toml_path = write_toml(tmp_path, [_VALID_PLACE])
    db_path = str(tmp_path / "test.duckdb")
    load_places(toml_path, db_path)
    con = duckdb.connect(db_path)
    total = con.execute("SELECT COUNT(*) FROM geographies.places").fetchone()[0]
    con.close()
    assert total == 1
