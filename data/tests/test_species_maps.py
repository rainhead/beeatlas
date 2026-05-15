"""Unit tests for species_maps.py subdirectory write behavior (PIPE-03).

Tests assert that _write_species_svg creates the parent Genus/ subdirectory
before writing the SVG file.

Run:
    cd data && uv run pytest tests/test_species_maps.py -x
"""

import xml.etree.ElementTree as ET

from species_maps import _write_species_svg, SVG_NS


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
