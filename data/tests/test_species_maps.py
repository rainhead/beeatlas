"""Unit tests for species_maps.py subdirectory write behavior (PIPE-03)
and color-assignment helper (D-01), and group-map generation (PIPE-02).

Tests assert that _write_species_svg creates the parent Genus/ subdirectory
before writing the SVG file, that _group_colors is pure, deterministic, and
meets the D-01 contract, and that _generate_group_maps emits the correct
output file tree with multi-color SVGs.

Run:
    cd data && uv run pytest tests/test_species_maps.py -x
"""

import re
import xml.etree.ElementTree as ET

import duckdb
import pyarrow as pa
import pyarrow.parquet as pq
import pytest

import species_maps as species_maps_module
from species_maps import _write_species_svg, _group_colors, _generate_group_maps, SVG_NS


def test_write_species_svg_creates_subdir(tmp_path):
    """_write_species_svg creates the parent subdirectory if it doesn't exist (PIPE-03c)."""
    backdrop = ET.Element(f"{{{SVG_NS}}}svg")
    slug = "Andrena/milwaukeensis"
    _write_species_svg(slug, [], set(), {}, backdrop, tmp_path)
    out = tmp_path / "Andrena" / "milwaukeensis.svg"
    assert out.exists(), (
        f"Expected {out} to exist — _write_species_svg must create parent subdir "
        f"via out_path.parent.mkdir(parents=True, exist_ok=True)"
    )


def test_group_colors_determinism():
    """_group_colors returns identical output regardless of input order (D-01)."""
    names = ['Andrena milwaukeensis', 'Andrena prunorum', 'Andrena vicina']
    shuffled = ['Andrena vicina', 'Andrena milwaukeensis', 'Andrena prunorum']
    result_a = _group_colors(names)
    result_b = _group_colors(shuffled)
    assert result_a == result_b, (
        "Expected identical results for same names in different input order"
    )


def test_group_colors_sort_order_independence():
    """Hue assignment is keyed on alphabetical position, not input order (D-01).

    The alphabetically-first name always maps to the same color regardless of
    the order names are supplied.
    """
    names_forward = ['Andrena milwaukeensis', 'Andrena prunorum', 'Andrena vicina']
    names_reverse = ['Andrena vicina', 'Andrena prunorum', 'Andrena milwaukeensis']
    result_forward = _group_colors(names_forward)
    result_reverse = _group_colors(names_reverse)
    assert result_forward == result_reverse, (
        "Same names in different orders must produce identical color assignments"
    )
    # Alphabetically first name is 'Andrena milwaukeensis' — it should have same color in both
    first_name = sorted(names_forward)[0]
    assert result_forward[first_name] == result_reverse[first_name], (
        f"Alphabetically first name '{first_name}' must map to the same color regardless of input order"
    )


def test_group_colors_hex_format():
    """All returned values are valid lowercase 7-char hex strings (D-01)."""
    names = ['Bombus mixtus', 'Bombus flavidus', 'Bombus rufocinctus', 'Bombus sitkensis', 'Bombus vandykei']
    result = _group_colors(names)
    assert len(result) == 5
    hex_pattern = re.compile(r'^#[0-9a-f]{6}$')
    for canon, color in result.items():
        assert hex_pattern.match(color), (
            f"Expected lowercase hex like '#rrggbb' for {canon!r}, got {color!r}"
        )


def test_group_colors_empty():
    """_group_colors([]) returns an empty dict (D-01 edge case)."""
    assert _group_colors([]) == {}


def test_group_colors_single_species():
    """A single-name input yields a 1-entry dict with a valid hex string (D-01)."""
    result = _group_colors(['Bombus mixtus'])
    assert len(result) == 1
    assert 'Bombus mixtus' in result
    hex_pattern = re.compile(r'^#[0-9a-f]{6}$')
    assert hex_pattern.match(result['Bombus mixtus']), (
        f"Expected valid hex color, got {result['Bombus mixtus']!r}"
    )


def test_group_colors_large_group_distinct():
    """A 72-name group produces at least 60 distinct hex values (D-01 — broad hue spread)."""
    # Synthetic 72-name list mimicking Andrena scale
    names = [f"Andrena species_{i:03d}" for i in range(72)]
    result = _group_colors(names)
    assert len(result) == 72
    distinct_colors = {v for v in result.values()}
    assert len(distinct_colors) >= 60, (
        f"Expected at least 60 distinct hex colors for 72 evenly-spaced hues, "
        f"got {len(distinct_colors)}"
    )


def _write_test_species_parquet(tmp_path):
    """Write a minimal species.parquet to tmp_path for group-map tests.

    4 species covering:
    - genus Andrena with a mix of subgenus (one set, two unset)
    - genus Bombus with a subgenus
    - two tribes: Andrenini and Bombini
    """
    table = pa.table({
        'canonical_name': ['Andrena milwaukeensis', 'Andrena prunorum', 'Andrena vicina', 'Bombus mixtus'],
        'genus': ['Andrena', 'Andrena', 'Andrena', 'Bombus'],
        'subgenus': ['Melandrena', '', None, 'Pyrobombus'],
        'tribe': ['Andrenini', 'Andrenini', 'Andrenini', 'Bombini'],
        'occurrence_count': [2, 1, 1, 3],
        # Remaining SPECIES_COLUMNS with placeholder values so read_parquet works
        'scientificName': ['Andrena milwaukeensis Viereck', 'Andrena prunorum Cockerell',
                           'Andrena vicina Smith', 'Bombus mixtus Cresson'],
        'family': ['Andrenidae', 'Andrenidae', 'Andrenidae', 'Apidae'],
        'subfamily': ['Andreninae', 'Andreninae', 'Andreninae', 'Apinae'],
        'specific_epithet': ['milwaukeensis', 'prunorum', 'vicina', 'mixtus'],
        'on_checklist': [True, True, True, True],
        'status': ['verified', 'verified', 'verified', 'verified'],
        'specimen_count': [2, 1, 1, 3],
        'provisional_count': [0, 0, 0, 0],
        'first_occurrence_date': [None, None, None, None],
        'last_occurrence_date': [None, None, None, None],
        'month_histogram': [[0]*12, [0]*12, [0]*12, [0]*12],
        'county_count': [1, 1, 1, 1],
        'ecoregion_count': [1, 1, 1, 1],
        'checklist_count': [3, 2, 1, 4],
        'slug': ['Andrena/milwaukeensis', 'Andrena/prunorum', 'Andrena/vicina', 'Bombus/mixtus'],
    })
    parquet_path = tmp_path / "species.parquet"
    pq.write_table(table, parquet_path)
    return parquet_path


def test_generate_group_maps_emits_expected_files(tmp_path, monkeypatch):
    """_generate_group_maps emits genus/subgenus/tribe SVGs with correct path shapes
    and multi-color circle content (Plan 02 / PIPE-02).
    """
    monkeypatch.setattr(species_maps_module, 'ASSETS_DIR', tmp_path)
    _write_test_species_parquet(tmp_path)

    con = duckdb.connect()
    backdrop = ET.Element(f"{{{SVG_NS}}}svg")

    # In-WA-bbox point (lon=-120.5, lat=47.5); out-of-bbox point (lon=-100, lat=40).
    WA_IN = (-120.5, 47.5)
    WA_OUT = (-100.0, 40.0)

    occ_by_canon = {
        'Andrena milwaukeensis': [WA_IN, WA_OUT],  # 1 in-bbox, 1 clipped
        'Andrena prunorum': [WA_IN],
        'Andrena vicina': [WA_IN],
        'Bombus mixtus': [WA_IN],
    }

    maps_dir = tmp_path / "species-maps"
    maps_dir.mkdir()

    _generate_group_maps(con, occ_by_canon, backdrop, maps_dir)

    # Genus files
    assert (maps_dir / "genus" / "Andrena.svg").exists(), "genus/Andrena.svg missing"
    assert (maps_dir / "genus" / "Bombus.svg").exists(), "genus/Bombus.svg missing"

    # Subgenus files — nested under Genus/
    assert (maps_dir / "subgenus" / "Andrena" / "Melandrena.svg").exists(), (
        "subgenus/Andrena/Melandrena.svg missing"
    )
    assert (maps_dir / "subgenus" / "Bombus" / "Pyrobombus.svg").exists(), (
        "subgenus/Bombus/Pyrobombus.svg missing"
    )

    # No subgenus file for Andrena prunorum (empty subgenus) or Andrena vicina (None)
    assert not any(
        p.name == 'prunorum.svg' for p in (maps_dir / 'subgenus').rglob('*.svg')
    ), "No subgenus file should exist for empty/null subgenus species"

    # Tribe files
    assert (maps_dir / "tribe" / "Andrenini.svg").exists(), "tribe/Andrenini.svg missing"
    assert (maps_dir / "tribe" / "Bombini.svg").exists(), "tribe/Bombini.svg missing"

    # Genus SVG content: at least one <circle> with fill attribute, no class="occ"
    tree = ET.parse(str(maps_dir / "genus" / "Andrena.svg"))
    root = tree.getroot()
    ns = {'s': SVG_NS}
    circles = root.findall('.//s:circle', ns)
    assert len(circles) > 0, "genus/Andrena.svg must contain at least one <circle>"
    for c in circles:
        assert 'class' not in c.attrib, (
            f"Group SVG circles must not use class='occ'; found class attrib on circle"
        )
    # All circles must be inside a <g fill="..."> element
    g_elements = root.findall('.//s:g', ns)
    assert any('fill' in g.attrib for g in g_elements), (
        "genus/Andrena.svg must have at least one <g fill='...'> element"
    )


def test_write_species_svg_renders_checklist_county_fill(tmp_path):
    """_write_species_svg emits one <path class="checklist-county"> for a matching county.

    This test calls _write_species_svg with the EXTENDED signature
    (slug, points, checklist_counties, county_geojsons_by_name, backdrop, out_dir)
    that Plan 03 will implement. RED until Plan 03 changes the function signature.
    """
    backdrop = ET.Element(f"{{{SVG_NS}}}svg")
    county_geom = {"type": "Polygon", "coordinates": [[[0, 0], [1, 0], [1, 1], [0, 1], [0, 0]]]}
    county_geojsons_by_name = {"TestCounty": county_geom}
    checklist_counties = {"TestCounty"}
    _write_species_svg("Genus/epithet", [], checklist_counties, county_geojsons_by_name, backdrop, tmp_path)
    tree = ET.parse(str(tmp_path / "Genus" / "epithet.svg"))
    root = tree.getroot()
    ns = {'s': SVG_NS}
    checklist_paths = root.findall('.//s:path[@class="checklist-county"]', ns)
    assert len(checklist_paths) == 1, (
        f"Expected one checklist-county path, got {len(checklist_paths)}"
    )


def test_write_species_svg_no_checklist_fill_when_county_absent(tmp_path):
    """_write_species_svg emits no <path class="checklist-county"> when county not in set.

    This test calls _write_species_svg with the EXTENDED signature
    (slug, points, checklist_counties, county_geojsons_by_name, backdrop, out_dir)
    that Plan 03 will implement. RED until Plan 03 changes the function signature.
    """
    backdrop = ET.Element(f"{{{SVG_NS}}}svg")
    county_geom = {"type": "Polygon", "coordinates": [[[0, 0], [1, 0], [1, 1], [0, 1], [0, 0]]]}
    county_geojsons_by_name = {"OtherCounty": county_geom}
    checklist_counties = {"TestCounty"}  # different county — no match
    _write_species_svg("Genus/epithet", [], checklist_counties, county_geojsons_by_name, backdrop, tmp_path)
    tree = ET.parse(str(tmp_path / "Genus" / "epithet.svg"))
    root = tree.getroot()
    ns = {'s': SVG_NS}
    checklist_paths = root.findall('.//s:path[@class="checklist-county"]', ns)
    assert len(checklist_paths) == 0, (
        f"Expected no checklist-county paths when county absent, got {len(checklist_paths)}"
    )


def test_style_css_contains_checklist_county_class():
    """STYLE_CSS must define a .checklist-county rule with #b0cfe8 fill and fill-opacity.

    RED until Plan 03 adds the .checklist-county class to STYLE_CSS.
    """
    from species_maps import STYLE_CSS
    assert 'checklist-county' in STYLE_CSS, (
        "STYLE_CSS must contain a .checklist-county rule"
    )
    assert '#b0cfe8' in STYLE_CSS, (
        "STYLE_CSS checklist-county rule must specify fill: #b0cfe8"
    )
    assert 'fill-opacity' in STYLE_CSS, (
        "STYLE_CSS checklist-county rule must specify fill-opacity"
    )


def test_generate_group_maps_deterministic(tmp_path, monkeypatch):
    """Two consecutive calls to _generate_group_maps with identical inputs
    produce byte-identical SVG output (D-01 determinism).
    """
    # First run
    tmp_a = tmp_path / "run_a"
    tmp_a.mkdir()
    monkeypatch.setattr(species_maps_module, 'ASSETS_DIR', tmp_a)
    _write_test_species_parquet(tmp_a)
    maps_dir_a = tmp_a / "species-maps"
    maps_dir_a.mkdir()
    con = duckdb.connect()
    backdrop = ET.Element(f"{{{SVG_NS}}}svg")
    WA_IN = (-120.5, 47.5)
    occ_by_canon = {
        'Andrena milwaukeensis': [WA_IN],
        'Andrena prunorum': [WA_IN],
        'Andrena vicina': [WA_IN],
        'Bombus mixtus': [WA_IN],
    }
    _generate_group_maps(con, occ_by_canon, backdrop, maps_dir_a)

    # Second run with identical inputs
    tmp_b = tmp_path / "run_b"
    tmp_b.mkdir()
    monkeypatch.setattr(species_maps_module, 'ASSETS_DIR', tmp_b)
    _write_test_species_parquet(tmp_b)
    maps_dir_b = tmp_b / "species-maps"
    maps_dir_b.mkdir()
    con2 = duckdb.connect()
    backdrop2 = ET.Element(f"{{{SVG_NS}}}svg")
    _generate_group_maps(con2, occ_by_canon, backdrop2, maps_dir_b)

    # Compare byte-identical output for each SVG
    svg_pairs = [
        (maps_dir_a / "genus" / "Andrena.svg", maps_dir_b / "genus" / "Andrena.svg"),
        (maps_dir_a / "genus" / "Bombus.svg", maps_dir_b / "genus" / "Bombus.svg"),
        (maps_dir_a / "subgenus" / "Andrena" / "Melandrena.svg",
         maps_dir_b / "subgenus" / "Andrena" / "Melandrena.svg"),
        (maps_dir_a / "tribe" / "Andrenini.svg", maps_dir_b / "tribe" / "Andrenini.svg"),
    ]
    for path_a, path_b in svg_pairs:
        assert path_a.read_bytes() == path_b.read_bytes(), (
            f"Non-deterministic output: {path_a.name} differs between two runs"
        )
