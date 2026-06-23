"""Golden-fixture tests for add_wdfw_wildlife_areas.py.

Tests dissolve_to_wkt and slug_for on small in-memory fixture geometries.
No network access (fetch_wdfw_features is NOT invoked).

Covers:
  - dissolve_to_wkt: Jackman Creek excluded, exactly 2 areas from 4 features,
    both WKT values start with "MULTIPOLYGON", single-unit area also emits
    MULTIPOLYGON (ST_Multi guarantee), both are DuckDB-loadable.
  - slug_for: concrete slug assertions + slug regex validation.
"""

import re

import duckdb
import pytest

from add_wdfw_wildlife_areas import dissolve_to_wkt, slug_for

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

SLUG_RE = re.compile(r"^[a-z0-9-]+$")


def _poly(lon_min: float, lat_min: float, lon_max: float, lat_max: float) -> dict:
    """Return a minimal GeoJSON Polygon geometry dict in WGS84 range."""
    return {
        "type": "Polygon",
        "coordinates": [[
            [lon_min, lat_min],
            [lon_max, lat_min],
            [lon_max, lat_max],
            [lon_min, lat_max],
            [lon_min, lat_min],
        ]],
    }


def _feature(wla_name: str, geometry: dict) -> dict:
    """Wrap geometry in a GeoJSON Feature dict with WLA_Name property."""
    return {
        "type": "Feature",
        "properties": {"WLA_Name": wla_name, "WLAU_Name": "Unit 1"},
        "geometry": geometry,
    }


# ---------------------------------------------------------------------------
# Fixture features:
#   - "Test Area A": two disjoint Polygon units (will dissolve to a MultiPolygon
#     with 2 rings)
#   - "Test Area B": one Polygon unit (ST_Multi must still emit MULTIPOLYGON)
#   - "Jackman Creek": must be excluded by dissolve_to_wkt
# ---------------------------------------------------------------------------

_FEATURES = [
    # Test Area A — unit 1
    _feature("Test Area A", _poly(-121.0, 47.0, -120.9, 47.1)),
    # Test Area A — unit 2 (disjoint from unit 1)
    _feature("Test Area A", _poly(-121.5, 47.5, -121.4, 47.6)),
    # Test Area B — single unit
    _feature("Test Area B", _poly(-122.0, 48.0, -121.9, 48.1)),
    # Jackman Creek — must be excluded
    _feature("Jackman Creek", _poly(-119.0, 46.0, -118.9, 46.1)),
]


# ---------------------------------------------------------------------------
# Tests: dissolve_to_wkt
# ---------------------------------------------------------------------------


def test_dissolve_excludes_jackman_creek():
    """Jackman Creek feature must not appear in dissolve output."""
    result = dissolve_to_wkt(_FEATURES, 0.0002)
    wla_names = [wla for wla, _ in result]
    assert "Jackman Creek" not in wla_names, (
        "Jackman Creek must be excluded (D-01)"
    )


def test_dissolve_returns_exactly_two_areas():
    """dissolve_to_wkt returns exactly 2 areas (Jackman Creek excluded)."""
    result = dissolve_to_wkt(_FEATURES, 0.0002)
    assert len(result) == 2, (
        f"Expected 2 areas after excluding Jackman Creek, got {len(result)}"
    )


def test_dissolve_all_wkt_are_multipolygon():
    """Every WKT value must start with 'MULTIPOLYGON'."""
    result = dissolve_to_wkt(_FEATURES, 0.0002)
    for wla, wkt in result:
        assert wkt is not None, f"WKT for {wla!r} is None"
        assert wkt.startswith("MULTIPOLYGON"), (
            f"{wla!r}: expected MULTIPOLYGON, got {wkt[:60]!r}"
        )


def test_dissolve_single_unit_area_is_multipolygon():
    """Single-unit area 'Test Area B' must emit MULTIPOLYGON (ST_Multi guarantee)."""
    result = dissolve_to_wkt(_FEATURES, 0.0002)
    by_name = dict(result)
    wkt = by_name.get("Test Area B")
    assert wkt is not None, "'Test Area B' missing from dissolve output"
    assert wkt.startswith("MULTIPOLYGON"), (
        f"Single-unit area emitted {wkt[:60]!r} instead of MULTIPOLYGON"
    )


def test_dissolve_wkt_loadable_by_duckdb():
    """Every WKT value must be parseable by DuckDB ST_GeomFromText."""
    result = dissolve_to_wkt(_FEATURES, 0.0002)
    con = duckdb.connect(":memory:")
    con.execute("LOAD spatial")
    for wla, wkt in result:
        row = con.execute("SELECT ST_GeomFromText(?)", [wkt]).fetchone()
        assert row is not None and row[0] is not None, (
            f"DuckDB could not load WKT for {wla!r}"
        )


# ---------------------------------------------------------------------------
# Tests: slug_for
# ---------------------------------------------------------------------------


def test_slug_oak_creek():
    assert slug_for("Oak Creek") == "oak-creek-wildlife-area"


def test_slug_lt_murray():
    """L.T. Murray has dots and spaces — must produce a valid kebab slug."""
    result = slug_for("L.T. Murray")
    assert SLUG_RE.match(result), f"slug_for('L.T. Murray') = {result!r} is not [a-z0-9-]+"
    assert result.endswith("-wildlife-area"), (
        f"slug_for('L.T. Murray') = {result!r} must end with '-wildlife-area'"
    )


def test_slug_sunnyside_snake_river():
    assert slug_for("Sunnyside-Snake River") == "sunnyside-snake-river-wildlife-area"


def test_slug_matches_regex():
    """Every slug_for output must match ^[a-z0-9-]+$ (the validation slug regex)."""
    names = [
        "Oak Creek",
        "L.T. Murray",
        "Sunnyside-Snake River",
        "Asotin Creek",
        "Big Bend",
        "Columbia Basin",
        "W.T. Wooten",
        "Mount Saint Helens",
    ]
    for name in names:
        result = slug_for(name)
        assert SLUG_RE.match(result), (
            f"slug_for({name!r}) = {result!r} does not match ^[a-z0-9-]+$"
        )
        assert result.endswith("-wildlife-area"), (
            f"slug_for({name!r}) = {result!r} must end with '-wildlife-area'"
        )
