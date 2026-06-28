"""Unit tests for collector_maps.py.

Tests cover:
    County and ecoregion SVG written per collector login.
    SVG contains class="checklist-county" paths for contributed polygons only.
    Non-contributed polygons produce no checklist-county paths.
    MultiPolygon geometries emit checklist-county paths.
    Determinism: two runs produce byte-identical output.
    _load_ecoregion_geojsons keys on NA_L3NAME property (not "name").
    End-to-end: generate_collector_maps emits {login}.svg and {login}-eco.svg.

Run:
    cd data && uv run pytest tests/test_collector_maps.py -x

RED until Plan 03 creates collector_maps.py.
"""

import importlib
import json
import xml.etree.ElementTree as ET
from pathlib import Path

import pyarrow as pa
import pyarrow.parquet as pq
import pytest

import collector_maps as collector_maps_module
from collector_maps import _write_coverage_svg, _load_ecoregion_geojsons, SVG_NS


# ---------------------------------------------------------------------------
# Fixture helpers
# ---------------------------------------------------------------------------

def _write_test_occurrences_parquet(tmp_path: Path) -> Path:
    """Minimal occurrences fixture with county + ecoregion_l3 columns.

    D-01-passing rows (ecdysis_id IS NOT NULL OR record_type IN ...):
        alice: 2 specimen rows (ecdysis_id set)
        bob: 1 provisional_sample row

    D-01-failing row (excluded by gate):
        carol: 1 inat_expert row (ecdysis_id=None, not a passing record_type)
    """
    schema = pa.schema([
        ("collector_inat_login", pa.string()),
        ("ecdysis_id", pa.int64()),
        ("record_type", pa.string()),
        ("county", pa.string()),
        ("ecoregion_l3", pa.string()),
        ("year", pa.int32()),
    ])
    table = pa.table(
        {
            "collector_inat_login": ["alice", "alice", "bob",               "carol"],
            "ecdysis_id":           [1,       2,       None,                None],
            "record_type":          ["specimen", "specimen", "provisional_sample", "inat_expert"],
            "county":               ["King",  "Yakima", "King",             "Clark"],
            "ecoregion_l3":         ["Puget Lowland Forests", "Columbia Plateau",
                                     "Puget Lowland Forests", "Cascades"],
            "year":                 [2020, 2022, 2023, 2021],
        },
        schema=schema,
    )
    out_path = tmp_path / "occurrences.parquet"
    pq.write_table(table, out_path)
    return out_path


def _write_test_ecoregions_geojson(tmp_path: Path) -> Path:
    """Write a minimal ecoregions.geojson with two features keyed by NA_L3NAME."""
    fc = {
        "type": "FeatureCollection",
        "features": [
            {
                "type": "Feature",
                "properties": {"NA_L3NAME": "Puget Lowland Forests"},
                "geometry": {
                    "type": "Polygon",
                    "coordinates": [[[-122.5, 47.0], [-121.5, 47.0],
                                     [-121.5, 48.0], [-122.5, 48.0], [-122.5, 47.0]]],
                },
            },
            {
                "type": "Feature",
                "properties": {"NA_L3NAME": "Columbia Plateau"},
                "geometry": {
                    "type": "Polygon",
                    "coordinates": [[[-119.5, 46.0], [-118.5, 46.0],
                                     [-118.5, 47.0], [-119.5, 47.0], [-119.5, 46.0]]],
                },
            },
        ],
    }
    eco_path = tmp_path / "ecoregions.geojson"
    eco_path.write_text(json.dumps(fc), encoding="utf-8")
    return eco_path


# ---------------------------------------------------------------------------
# _write_coverage_svg unit tests
# ---------------------------------------------------------------------------

def test_write_coverage_svg_fills_contributed_polygon(tmp_path):
    """_write_coverage_svg emits class='checklist-county' path for contributed name."""
    backdrop = ET.Element(f"{{{SVG_NS}}}svg")
    geom = {"type": "Polygon", "coordinates": [[[0, 0], [1, 0], [1, 1], [0, 1], [0, 0]]]}
    _write_coverage_svg(
        out_path=tmp_path / "test.svg",
        filled_names={"King"},
        polygon_geojsons={"King": geom},
        backdrop=backdrop,
    )
    tree = ET.parse(str(tmp_path / "test.svg"))
    paths = tree.getroot().findall(f'.//{{{SVG_NS}}}path[@class="checklist-county"]')
    assert len(paths) == 1, (
        f"Expected exactly one checklist-county path for contributed 'King', got {len(paths)}"
    )


def test_write_coverage_svg_skips_unfilled(tmp_path):
    """_write_coverage_svg emits no checklist-county path when name not in filled_names."""
    backdrop = ET.Element(f"{{{SVG_NS}}}svg")
    geom = {"type": "Polygon", "coordinates": [[[0, 0], [1, 0], [1, 1], [0, 1], [0, 0]]]}
    _write_coverage_svg(
        out_path=tmp_path / "test.svg",
        filled_names={"Yakima"},           # different county — no match
        polygon_geojsons={"King": geom},
        backdrop=backdrop,
    )
    tree = ET.parse(str(tmp_path / "test.svg"))
    paths = tree.getroot().findall(f'.//{{{SVG_NS}}}path[@class="checklist-county"]')
    assert len(paths) == 0, (
        f"Expected no checklist-county paths when name absent from filled_names, got {len(paths)}"
    )


def test_write_coverage_svg_handles_multipolygon(tmp_path):
    """_write_coverage_svg emits a checklist-county path for a MultiPolygon geometry."""
    backdrop = ET.Element(f"{{{SVG_NS}}}svg")
    geom = {
        "type": "MultiPolygon",
        "coordinates": [
            [[[0, 0], [1, 0], [1, 1], [0, 1], [0, 0]]],
            [[[2, 2], [3, 2], [3, 3], [2, 3], [2, 2]]],
        ],
    }
    _write_coverage_svg(
        out_path=tmp_path / "test.svg",
        filled_names={"SanJuan"},
        polygon_geojsons={"SanJuan": geom},
        backdrop=backdrop,
    )
    tree = ET.parse(str(tmp_path / "test.svg"))
    paths = tree.getroot().findall(f'.//{{{SVG_NS}}}path[@class="checklist-county"]')
    assert len(paths) >= 1, (
        f"Expected at least one checklist-county path for MultiPolygon geometry, got {len(paths)}"
    )


def test_write_coverage_svg_deterministic(tmp_path):
    """Two calls with identical inputs produce byte-identical SVG output."""
    backdrop = ET.Element(f"{{{SVG_NS}}}svg")
    geom = {"type": "Polygon", "coordinates": [[[0, 0], [1, 0], [1, 1], [0, 1], [0, 0]]]}
    _write_coverage_svg(tmp_path / "run1.svg", {"King"}, {"King": geom}, backdrop)
    _write_coverage_svg(tmp_path / "run2.svg", {"King"}, {"King": geom}, backdrop)
    assert (tmp_path / "run1.svg").read_bytes() == (tmp_path / "run2.svg").read_bytes(), (
        "Two calls with identical inputs must produce byte-identical SVG (idempotency contract)"
    )


# ---------------------------------------------------------------------------
# _load_ecoregion_geojsons unit test
# ---------------------------------------------------------------------------

def test_load_ecoregion_geojsons_keys_on_NA_L3NAME(tmp_path):
    """_load_ecoregion_geojsons returns a dict keyed by NA_L3NAME property (Pitfall 2).

    The property is 'NA_L3NAME', NOT 'name'. Keys must match the feature properties exactly.
    """
    _write_test_ecoregions_geojson(tmp_path)
    result = _load_ecoregion_geojsons(tmp_path)
    assert "Puget Lowland Forests" in result, (
        f"Expected 'Puget Lowland Forests' in loader result; got keys: {list(result.keys())}. "
        f"Loader must key on NA_L3NAME, not 'name' (Pitfall 2)."
    )
    assert "Columbia Plateau" in result, (
        f"Expected 'Columbia Plateau' in loader result; got keys: {list(result.keys())}"
    )
    assert len(result) == 2, f"Expected 2 ecoregion entries, got {len(result)}"
    # Each value is a GeoJSON geometry dict
    for name, geom in result.items():
        assert "type" in geom, f"Ecoregion geometry for {name!r} must have a 'type' key"
        assert "coordinates" in geom, f"Ecoregion geometry for {name!r} must have 'coordinates'"


# ---------------------------------------------------------------------------
# End-to-end: generate_collector_maps
# ---------------------------------------------------------------------------

def test_generate_collector_maps_emits_per_login_svgs(tmp_path, monkeypatch):
    """generate_collector_maps emits {login}.svg and {login}-eco.svg under collector-maps/.

    D-01 gate: only alice and bob (WABA contributors) receive maps.
    carol (inat_expert) must NOT receive a map.
    """
    # Seed fixtures
    _write_test_occurrences_parquet(tmp_path)
    _write_test_ecoregions_geojson(tmp_path)

    # Patch ASSETS_DIR so the module reads from tmp_path
    monkeypatch.setenv("DB_PATH", str(tmp_path / "test.duckdb"))
    monkeypatch.setenv("EXPORT_DIR", str(tmp_path))
    importlib.reload(collector_maps_module)
    monkeypatch.setattr(collector_maps_module, "ASSETS_DIR", tmp_path)

    collector_maps_module.generate_collector_maps()

    maps_dir = tmp_path / "collector-maps"
    assert maps_dir.exists(), "collector-maps/ directory must be created"

    # alice (2 specimen rows — D-01 passing) must have both county and eco SVGs
    assert (maps_dir / "alice.svg").exists(), "alice.svg missing from collector-maps/"
    assert (maps_dir / "alice-eco.svg").exists(), "alice-eco.svg missing from collector-maps/"

    # bob (provisional_sample — D-01 passing) must have both SVGs
    assert (maps_dir / "bob.svg").exists(), "bob.svg missing from collector-maps/"
    assert (maps_dir / "bob-eco.svg").exists(), "bob-eco.svg missing from collector-maps/"

    # carol (inat_expert — D-01 failing) must NOT have any SVG
    assert not (maps_dir / "carol.svg").exists(), (
        "carol.svg must NOT exist — carol is excluded by the D-01 WABA-contribution gate"
    )
