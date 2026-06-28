"""Unit tests for build_coverage_basemaps.py.

Tests cover:
    build_counties_base — emits SVG with <path class="region" data-region="..."> paths.
    build_ecoregions_base — emits SVG with paths keyed by NA_L3NAME (not "name").
    Ecoregion SVG byte size regression guard: must be well under 150 KB even on
        the full public/data/ecoregions.geojson (UAT weight complaint).
    Both emitted SVGs have aria-hidden="true" on the root <svg> element (accessibility).
    Determinism: two calls with identical inputs produce byte-identical files.
    _geom_to_d returns None for degenerate polygons (< 4 points after simplification).

Run:
    cd data && uv run pytest tests/test_build_coverage_basemaps.py -x
"""

import json
import os
import xml.etree.ElementTree as ET
from pathlib import Path

import duckdb
import pytest

import build_coverage_basemaps as bm_module
from build_coverage_basemaps import (
    SVG_NS,
    build_counties_base,
    build_ecoregions_base,
    _geom_to_d,
)


# ---------------------------------------------------------------------------
# Fixture helpers
# ---------------------------------------------------------------------------

def _write_test_ecoregions_geojson(tmp_path: Path) -> Path:
    """Write a minimal ecoregions.geojson with two features keyed by NA_L3NAME.

    Includes two distinct NA_L3NAME values so we can assert each appears.
    All coordinates are within WA_BBOX so _project produces in-range SVG coords.
    """
    fc = {
        "type": "FeatureCollection",
        "features": [
            {
                "type": "Feature",
                "properties": {"NA_L3NAME": "Columbia Plateau"},
                "geometry": {
                    "type": "Polygon",
                    "coordinates": [[
                        [-119.5, 46.0], [-118.5, 46.0],
                        [-118.5, 47.0], [-119.5, 47.0], [-119.5, 46.0],
                    ]],
                },
            },
            {
                "type": "Feature",
                "properties": {"NA_L3NAME": "Cascades"},
                "geometry": {
                    "type": "Polygon",
                    "coordinates": [[
                        [-121.5, 47.0], [-120.5, 47.0],
                        [-120.5, 48.0], [-121.5, 48.0], [-121.5, 47.0],
                    ]],
                },
            },
        ],
    }
    eco_path = tmp_path / "ecoregions.geojson"
    eco_path.write_text(json.dumps(fc), encoding="utf-8")
    return eco_path


def _fresh_con() -> duckdb.DuckDBPyConnection:
    """Open an in-memory DuckDB connection with the spatial extension loaded.

    Used for ecoregion simplification tests. County tests that need the
    geographies.us_counties table gracefully degrade to an empty backdrop
    when the table is absent (tested separately).
    """
    con = duckdb.connect()
    con.execute("INSTALL spatial; LOAD spatial;")
    return con


# ---------------------------------------------------------------------------
# _geom_to_d unit tests
# ---------------------------------------------------------------------------

def test_geom_to_d_valid_polygon():
    """_geom_to_d returns a non-empty string for a valid polygon."""
    geom = {
        "type": "Polygon",
        "coordinates": [[[-122.0, 47.0], [-121.0, 47.0], [-121.0, 48.0], [-122.0, 48.0], [-122.0, 47.0]]],
    }
    d = _geom_to_d(geom)
    assert d is not None, "Expected a path string for valid polygon"
    assert d.startswith("M"), f"Path must start with M move command, got: {d[:20]!r}"
    assert d.endswith("Z"), f"Path must end with Z close command, got: {d[-10:]!r}"


def test_geom_to_d_degenerate_polygon_returns_none():
    """_geom_to_d returns None for a polygon with fewer than 4 points (degenerate)."""
    geom = {
        "type": "Polygon",
        "coordinates": [[[0.0, 0.0], [1.0, 0.0], [0.0, 0.0]]],  # 3 points — degenerate
    }
    result = _geom_to_d(geom)
    assert result is None, (
        f"Expected None for degenerate 3-point polygon, got: {result!r}"
    )


def test_geom_to_d_multipolygon():
    """_geom_to_d handles MultiPolygon and concatenates valid sub-polygons."""
    geom = {
        "type": "MultiPolygon",
        "coordinates": [
            [[[0.0, 0.0], [1.0, 0.0], [1.0, 1.0], [0.0, 1.0], [0.0, 0.0]]],
            [[[2.0, 2.0], [3.0, 2.0], [3.0, 3.0], [2.0, 3.0], [2.0, 2.0]]],
        ],
    }
    d = _geom_to_d(geom)
    assert d is not None, "Expected path string for valid MultiPolygon"
    # Two subpolygons → two M...Z segments
    assert d.count("M") == 2, f"Expected 2 M commands for 2 sub-polygons, got {d.count('M')}"


def test_geom_to_d_unsupported_type_returns_none():
    """_geom_to_d returns None for Point geometry type."""
    geom = {"type": "Point", "coordinates": [-122.0, 47.0]}
    assert _geom_to_d(geom) is None


# ---------------------------------------------------------------------------
# build_counties_base unit tests
# ---------------------------------------------------------------------------

def test_build_counties_base_emits_svg_file(tmp_path):
    """build_counties_base creates an SVG file at the given path."""
    # Use a fresh DB without geographies.us_counties — should gracefully degrade
    con = duckdb.connect()
    out = tmp_path / "counties-base.svg"
    build_counties_base(con, out)
    con.close()
    assert out.exists(), "counties-base.svg must be created even when county table is absent"


def test_build_counties_base_svg_has_style_and_root(tmp_path):
    """counties-base.svg has a <svg> root with a <style> block."""
    con = duckdb.connect()
    out = tmp_path / "counties-base.svg"
    build_counties_base(con, out)
    con.close()

    tree = ET.parse(str(out))
    root = tree.getroot()
    assert root.tag == f"{{{SVG_NS}}}svg", f"Root must be <svg>, got: {root.tag}"
    styles = root.findall(f"{{{SVG_NS}}}style")
    assert styles, "SVG must contain a <style> block"
    assert ".region" in styles[0].text, "Style block must declare .region class"


def test_build_counties_base_svg_aria_hidden(tmp_path):
    """counties-base.svg has aria-hidden='true' on the root element."""
    con = duckdb.connect()
    out = tmp_path / "counties-base.svg"
    build_counties_base(con, out)
    con.close()

    tree = ET.parse(str(out))
    root = tree.getroot()
    assert root.get("aria-hidden") == "true", (
        "SVG root must have aria-hidden='true' (inline SVG; parent carries a11y label)"
    )


def test_build_counties_base_paths_have_data_region(tmp_path):
    """When counties are present, each path carries class='region' and data-region attribute."""
    # Use a fresh in-memory DuckDB and insert a synthetic county polygon.
    con = _fresh_con()
    # Create the geographies schema and us_counties table with one WA county.
    con.execute("CREATE SCHEMA IF NOT EXISTS geographies")
    con.execute("""
        CREATE TABLE geographies.us_counties (
            name    VARCHAR,
            state_fips VARCHAR,
            geom    GEOMETRY
        )
    """)
    # Insert a simple square polygon in WA (within WA_BBOX).
    con.execute("""
        INSERT INTO geographies.us_counties VALUES (
            'King', '53',
            ST_GeomFromText('POLYGON((-122.5 47.0, -121.5 47.0, -121.5 48.0, -122.5 48.0, -122.5 47.0))')
        )
    """)

    out = tmp_path / "counties-base.svg"
    build_counties_base(con, out)
    con.close()

    tree = ET.parse(str(out))
    paths = tree.getroot().findall(f".//{{{SVG_NS}}}path")
    assert paths, "Expected at least one <path> element when county data is present"
    for p in paths:
        assert p.get("class") == "region", f"Path must have class='region', got {p.get('class')!r}"
        assert p.get("data-region"), f"Path must have non-empty data-region attribute"
    # The synthetic 'King' county must be present.
    regions = {p.get("data-region") for p in paths}
    assert "King" in regions, f"Expected 'King' county in data-region values; got {regions}"


# ---------------------------------------------------------------------------
# build_ecoregions_base unit tests
# ---------------------------------------------------------------------------

def test_build_ecoregions_base_emits_svg_file(tmp_path):
    """build_ecoregions_base creates an SVG file at the given path."""
    eco_path = _write_test_ecoregions_geojson(tmp_path)
    con = _fresh_con()
    out = tmp_path / "ecoregions-base.svg"
    build_ecoregions_base(con, eco_path, out)
    con.close()
    assert out.exists(), "ecoregions-base.svg must be created"


def test_build_ecoregions_base_keys_on_NA_L3NAME(tmp_path):
    """Paths are keyed by NA_L3NAME property (not 'name' — Pitfall 2 from collector_maps.py)."""
    eco_path = _write_test_ecoregions_geojson(tmp_path)
    con = _fresh_con()
    out = tmp_path / "ecoregions-base.svg"
    build_ecoregions_base(con, eco_path, out)
    con.close()

    tree = ET.parse(str(out))
    regions = {p.get("data-region") for p in tree.getroot().findall(f".//{{{SVG_NS}}}path")}
    assert "Columbia Plateau" in regions, (
        f"Expected 'Columbia Plateau' (NA_L3NAME key) in data-region values; got {regions}. "
        "Loader must key on NA_L3NAME, not 'name' (Pitfall 2)."
    )
    assert "Cascades" in regions, (
        f"Expected 'Cascades' in data-region values; got {regions}"
    )


def test_build_ecoregions_base_paths_have_region_class(tmp_path):
    """All ecoregion paths have class='region'."""
    eco_path = _write_test_ecoregions_geojson(tmp_path)
    con = _fresh_con()
    out = tmp_path / "ecoregions-base.svg"
    build_ecoregions_base(con, eco_path, out)
    con.close()

    tree = ET.parse(str(out))
    paths = tree.getroot().findall(f".//{{{SVG_NS}}}path")
    assert paths, "Expected at least one <path> element"
    for p in paths:
        assert p.get("class") == "region", (
            f"All paths must have class='region', got {p.get('class')!r}"
        )


def test_build_ecoregions_base_raises_on_missing_geojson(tmp_path):
    """build_ecoregions_base raises FileNotFoundError when eco_geojson_path is absent."""
    con = _fresh_con()
    with pytest.raises(FileNotFoundError):
        build_ecoregions_base(con, tmp_path / "nonexistent.geojson", tmp_path / "out.svg")
    con.close()


def test_build_ecoregions_base_deterministic(tmp_path):
    """Two calls with identical inputs produce byte-identical SVG output."""
    eco_path = _write_test_ecoregions_geojson(tmp_path)
    con = _fresh_con()
    out1 = tmp_path / "run1.svg"
    out2 = tmp_path / "run2.svg"
    build_ecoregions_base(con, eco_path, out1)
    build_ecoregions_base(con, eco_path, out2)
    con.close()
    assert out1.read_bytes() == out2.read_bytes(), (
        "Two calls with identical inputs must produce byte-identical SVG (idempotency)"
    )


def test_build_ecoregions_base_aria_hidden(tmp_path):
    """ecoregions-base.svg has aria-hidden='true' on the root element."""
    eco_path = _write_test_ecoregions_geojson(tmp_path)
    con = _fresh_con()
    out = tmp_path / "ecoregions-base.svg"
    build_ecoregions_base(con, eco_path, out)
    con.close()

    tree = ET.parse(str(out))
    root = tree.getroot()
    assert root.get("aria-hidden") == "true", (
        "SVG root must have aria-hidden='true'"
    )


# ---------------------------------------------------------------------------
# Weight regression guard (uses real ecoregions.geojson if present)
# ---------------------------------------------------------------------------

_REAL_ECO = Path(__file__).parent.parent.parent / "public" / "data" / "ecoregions.geojson"


@pytest.mark.skipif(
    not _REAL_ECO.exists(),
    reason="public/data/ecoregions.geojson not present (gitignored in CI)",
)
def test_ecoregions_base_weight_regression(tmp_path):
    """ecoregions-base.svg from the real ecoregions.geojson stays under 200 KB.

    Regression guard for the UAT weight complaint (Phase 172 — 1.3 MB per-collector
    SVG). The base map must be aggressively simplified to stay well under 150 KB;
    we allow 200 KB with a comfortable margin.
    """
    con = _fresh_con()
    out = tmp_path / "ecoregions-base.svg"
    size = build_ecoregions_base(con, _REAL_ECO, out)
    con.close()
    assert size < 200_000, (
        f"ecoregions-base.svg is {size:,} bytes — exceeds 200 KB threshold. "
        "Raise ECO_TOLERANCE in build_coverage_basemaps.py to simplify further."
    )
