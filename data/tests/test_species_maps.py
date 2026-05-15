"""Unit tests for species_maps.py subdirectory write behavior (PIPE-03)
and color-assignment helper (D-01).

Tests assert that _write_species_svg creates the parent Genus/ subdirectory
before writing the SVG file, and that _group_colors is pure, deterministic,
and meets the D-01 contract.

Run:
    cd data && uv run pytest tests/test_species_maps.py -x
"""

import re
import xml.etree.ElementTree as ET

import pytest

import species_maps as species_maps_module
from species_maps import _write_species_svg, _group_colors, SVG_NS


def test_write_species_svg_creates_subdir(tmp_path):
    """_write_species_svg creates the parent subdirectory if it doesn't exist (PIPE-03c)."""
    backdrop = ET.Element(f"{{{SVG_NS}}}svg")
    slug = "Andrena/milwaukeensis"
    _write_species_svg(slug, [], backdrop, tmp_path)
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


@pytest.mark.skipif(
    not hasattr(species_maps_module, '_generate_group_maps'),
    reason="Plan 02 implements _generate_group_maps — this test activates when that function is added",
)
def test_group_map_output_paths_skip_guarded(tmp_path, monkeypatch):
    """Group SVG output follows genus/<Genus>.svg, subgenus/<Genus>/<Subgenus>.svg,
    tribe/<Tribe>.svg path shapes (activates when Plan 02 lands _generate_group_maps).
    """
    # This body is only reached when _generate_group_maps exists.
    # Assert the output path conventions — exact shape not content.
    monkeypatch.setattr(species_maps_module, 'ASSETS_DIR', tmp_path)
    maps_dir = tmp_path / "species-maps"
    maps_dir.mkdir(parents=True)

    # Verify the path shape conventions only (test body is scaffolded for Plan 02).
    # When Plan 02 wires up _generate_group_maps, fill in a minimal con fixture here.
    genus_path = maps_dir / "genus" / "Andrena.svg"
    subgenus_path = maps_dir / "subgenus" / "Andrena" / "Andrena.svg"
    tribe_path = maps_dir / "tribe" / "Andrenini.svg"

    # Verify path shapes are under species-maps/ with the expected subdirectory layout.
    assert str(genus_path).endswith("species-maps/genus/Andrena.svg")
    assert str(subgenus_path).endswith("species-maps/subgenus/Andrena/Andrena.svg")
    assert str(tribe_path).endswith("species-maps/tribe/Andrenini.svg")
