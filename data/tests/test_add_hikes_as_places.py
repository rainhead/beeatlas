"""Golden-fixture tests for add_hikes_as_places.py.

Tests linestring_to_corridor_wkt on a small in-memory fixture LineString
and gpx_to_linestring_wkt on a tiny inline GPX string.
No network access — fetch_osm_relation_geometry and fetch_osm_ways_by_name
are NEVER invoked.

Covers:
  - linestring_to_corridor_wkt: result starts with 'MULTIPOLYGON', is
    DuckDB-loadable, ST_IsValid returns True, bounding box is finite and
    within ~0.01° of the fixture, area is in the 0.05–5 km² band.
    (The always_xy=true regression guard: a missing flag would produce
    POINT(inf inf) which would fail the MULTIPOLYGON/validity/bbox checks.)
  - gpx_to_linestring_wkt: parses a tiny 3-point GPX 1.1 document to
    LINESTRING with lon-lat order (offline; guards the GPX fallback).
  - Slug convention: all 13 active HIKES slugs match ^[a-z0-9-]+$ and end with
    '-trail'; HIKES has exactly 13 entries (snoqualmie-pass-to-olallie-meadow-trail
    is deferred — OSM only has the full ~75 km PCT Section J); every entry carries
    slug, name, land_owner, and at least one geometry-source key.
"""

import re

import duckdb
import pytest

from add_hikes_as_places import HIKES, gpx_to_linestring_wkt, linestring_to_corridor_wkt

# ---------------------------------------------------------------------------
# Fixture geometry: a short WGS84 LineString in western WA (UTM Zone 10N)
# ~1 km long, representative of a short trail section
# ---------------------------------------------------------------------------

FIXTURE_LINESTRING = "LINESTRING(-121.5 47.0, -121.49 47.005, -121.495 47.01)"

SLUG_RE = re.compile(r"^[a-z0-9-]+$")

# Geometry-source keys that a HIKE dict may carry
SOURCE_KEYS = frozenset({"osm_relation_id", "osm_name_query", "osm_ways", "gpx_path"})


# ---------------------------------------------------------------------------
# Tests: linestring_to_corridor_wkt
# ---------------------------------------------------------------------------


def test_corridor_is_multipolygon():
    """linestring_to_corridor_wkt returns a string starting with 'MULTIPOLYGON'."""
    wkt = linestring_to_corridor_wkt(FIXTURE_LINESTRING)
    assert wkt.startswith("MULTIPOLYGON"), (
        f"Expected MULTIPOLYGON, got: {wkt[:80]!r}"
    )


def test_corridor_is_valid_and_finite():
    """The corridor WKT is DuckDB-loadable, ST_IsValid, and contains no inf/nan.

    This is THE regression guard against the always_xy=true omission bug.
    Without always_xy=true in both ST_Transform calls, DuckDB 1.5.3 produces
    POINT(inf inf) silently — which would fail the MULTIPOLYGON check, the
    ST_IsValid check, and the inf-substring check below.
    """
    wkt = linestring_to_corridor_wkt(FIXTURE_LINESTRING)

    # Must not contain inf or nan (the inf-coords pitfall)
    assert "inf" not in wkt.lower(), (
        f"WKT contains 'inf' — always_xy=true may be missing in ST_Transform: {wkt[:120]!r}"
    )
    assert "nan" not in wkt.lower(), (
        f"WKT contains 'nan' — geometry computation produced NaN coordinates: {wkt[:120]!r}"
    )

    # Must be loadable by DuckDB and geometrically valid
    con = duckdb.connect(":memory:")
    con.execute("LOAD spatial")
    row = con.execute("SELECT ST_IsValid(ST_GeomFromText(?))", [wkt]).fetchone()
    assert row is not None and row[0] is True, (
        f"Buffer result must be geometrically valid (ST_IsValid returned {row})"
    )

    # Bounding box must be finite and within ~0.01° (~1 km) of the fixture coords
    # FIXTURE_LINESTRING spans roughly lon -121.5 to -121.49, lat 47.0 to 47.01
    # The 250 m buffer adds ~0.0025° in each direction
    extent = con.execute(
        """
        SELECT
            ST_XMin(ST_GeomFromText(?)) AS x_min,
            ST_XMax(ST_GeomFromText(?)) AS x_max,
            ST_YMin(ST_GeomFromText(?)) AS y_min,
            ST_YMax(ST_GeomFromText(?)) AS y_max
        """,
        [wkt, wkt, wkt, wkt],
    ).fetchone()
    assert extent is not None, "ST_XMin/XMax/YMin/YMax returned None"
    x_min, x_max, y_min, y_max = extent

    # All four values must be finite Python floats
    import math
    for label, val in [("x_min", x_min), ("x_max", x_max), ("y_min", y_min), ("y_max", y_max)]:
        assert val is not None and math.isfinite(val), (
            f"Bounding box {label}={val!r} is not finite — always_xy=true may be missing"
        )

    # Bbox must be within ~0.01° of the fixture extent
    # Fixture lon range: -121.5 to -121.49; lat range: 47.0 to 47.01
    # A 250 m buffer adds ~0.0025° lon, ~0.00225° lat — well within 0.01°
    assert -121.51 < x_min < -121.49, (
        f"x_min={x_min:.6f} is not within ~0.01° of fixture lon -121.5"
    )
    assert -121.49 < x_max < -121.48, (
        f"x_max={x_max:.6f} is not within ~0.01° of fixture lon -121.49"
    )
    assert 46.99 < y_min < 47.001, (
        f"y_min={y_min:.6f} is not within ~0.01° of fixture lat 47.0"
    )
    assert 47.009 < y_max < 47.015, (
        f"y_max={y_max:.6f} is not within ~0.015° of fixture lat 47.01"
    )


def test_corridor_area_sane():
    """The corridor area is in the 0.05–5 km² band.

    A 250 m buffer on a ~1 km trail should produce ~0.5 km².
    The lower bound (50,000 m²) rejects a collapsed/empty polygon.
    The upper bound (5,000,000 m²) rejects an inf-scale polygon.
    """
    wkt = linestring_to_corridor_wkt(FIXTURE_LINESTRING)
    con = duckdb.connect(":memory:")
    con.execute("LOAD spatial")

    # Project to EPSG:32610 (UTM Zone 10N, meters) with always_xy=true to get metric area
    area_m2 = con.execute(
        """
        SELECT ST_Area(
            ST_Transform(ST_GeomFromText(?), 'EPSG:4326', 'EPSG:32610', true)
        )
        """,
        [wkt],
    ).fetchone()[0]

    assert area_m2 is not None, "ST_Area returned None"
    assert area_m2 > 50_000, (
        f"Corridor area {area_m2:.0f} m² is too small (< 50,000 m²) — "
        "may indicate a collapsed or empty buffer"
    )
    assert area_m2 < 5_000_000, (
        f"Corridor area {area_m2:.0f} m² is too large (> 5,000,000 m²) — "
        "may indicate an inf-scale geometry or wrong CRS"
    )


# ---------------------------------------------------------------------------
# Tests: HIKES slug convention
# ---------------------------------------------------------------------------


def test_all_hike_slugs_match_regex():
    """Every HIKES slug must match ^[a-z0-9-]+$ and end with '-trail'."""
    # 15 planned; 1 deferred (snoqualmie-pass-to-olallie-meadow-trail, 2026-06-23).
    # sourdough-ridge-trail added 2026-07-06.
    assert len(HIKES) == 14, f"Expected 14 HIKES entries, got {len(HIKES)}"

    for hike in HIKES:
        slug = hike["slug"]
        assert SLUG_RE.match(slug), (
            f"Slug {slug!r} does not match ^[a-z0-9-]+"
        )
        assert slug.endswith("-trail"), (
            f"Slug {slug!r} must end with '-trail' (immutable slug convention)"
        )


def test_all_hikes_have_required_fields():
    """Every HIKES entry must have slug, name, land_owner, and at least one source key."""
    for hike in HIKES:
        slug = hike.get("slug", "<missing>")
        assert "slug" in hike, f"Hike entry missing 'slug': {hike!r}"
        assert "name" in hike, f"Hike {slug!r} missing 'name'"
        assert "land_owner" in hike, f"Hike {slug!r} missing 'land_owner'"
        has_source = bool(SOURCE_KEYS & hike.keys())
        assert has_source, (
            f"Hike {slug!r} has no geometry-source key. "
            f"Must have one of: {sorted(SOURCE_KEYS)}"
        )


# ---------------------------------------------------------------------------
# Tests: gpx_to_linestring_wkt (offline GPX fallback guard)
# ---------------------------------------------------------------------------


def test_gpx_fallback_parses(tmp_path):
    """gpx_to_linestring_wkt parses a tiny 3-point GPX 1.1 document correctly.

    The result must start with 'LINESTRING(' and use lon-lat order in WKT
    (GPX attributes are lat/lon; WKT must be lon/lat).
    """
    gpx_content = """\
<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="test"
     xmlns="http://www.topografix.com/GPX/1/1">
  <trk>
    <trkseg>
      <trkpt lat="47.00" lon="-121.50"><ele>500</ele></trkpt>
      <trkpt lat="47.01" lon="-121.49"><ele>510</ele></trkpt>
      <trkpt lat="47.02" lon="-121.495"><ele>520</ele></trkpt>
    </trkseg>
  </trk>
</gpx>
"""
    gpx_file = tmp_path / "test_trail.gpx"
    gpx_file.write_text(gpx_content, encoding="utf-8")

    wkt = gpx_to_linestring_wkt(str(gpx_file))

    assert wkt.startswith("LINESTRING("), (
        f"Expected 'LINESTRING(' prefix, got: {wkt!r}"
    )

    # The first coordinate pair must be lon-lat order:
    # First trkpt: lat=47.00, lon=-121.50 → WKT should be "-121.5 47.0"
    # Extract the first coordinate pair from the LINESTRING
    inner = wkt[len("LINESTRING("):-1]  # strip "LINESTRING(" and ")"
    first_pair = inner.split(",")[0].strip()
    parts = first_pair.split()
    assert len(parts) == 2, f"First coord pair {first_pair!r} should have 2 values"
    lon_val = float(parts[0])
    lat_val = float(parts[1])

    # lon must be negative (western hemisphere) and lat must be positive ~47°
    assert lon_val < 0, (
        f"First WKT value (lon) should be negative (western hemisphere), got {lon_val}"
    )
    assert 46.9 < lat_val < 47.1, (
        f"Second WKT value (lat) should be ~47°, got {lat_val}"
    )
    # Specifically: lon should be ~-121.5, lat should be ~47.0
    assert abs(lon_val - (-121.50)) < 0.01, (
        f"WKT lon {lon_val} does not match GPX lon -121.50 (lon/lat may be swapped)"
    )
    assert abs(lat_val - 47.00) < 0.01, (
        f"WKT lat {lat_val} does not match GPX lat 47.00 (lon/lat may be swapped)"
    )
