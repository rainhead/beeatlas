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
