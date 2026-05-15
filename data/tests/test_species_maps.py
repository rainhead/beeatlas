"""Unit tests for species_maps.py subdirectory write behavior (Phase 92 PIPE-03c).

Tests assert that _write_species_svg creates the parent subdirectory when the
slug contains a '/' character (i.e., the new Genus/epithet format).

RED state: test FAILS with FileNotFoundError because the current _write_species_svg
implementation at line 167 of species_maps.py does:
    out_path = out_dir / f"{slug}.svg"
    out_path.write_text(...)
without creating the parent directory. After Plan 02 adds:
    out_path.parent.mkdir(parents=True, exist_ok=True)
the test passes GREEN.
"""

import xml.etree.ElementTree as ET

import pytest

from species_maps import _write_species_svg, SVG_NS


def test_write_species_svg_creates_subdir(tmp_path):
    """_write_species_svg creates the parent subdirectory when slug contains '/'.

    Call _write_species_svg with slug="Andrena/milwaukeensis" and assert that
    tmp_path / "Andrena" / "milwaukeensis.svg" exists after the call.

    Currently raises FileNotFoundError because _write_species_svg does not
    call out_path.parent.mkdir() before writing — that is the RED state.
    After Plan 02 adds the mkdir line, this test passes GREEN.
    """
    backdrop = ET.Element(f"{{{SVG_NS}}}svg")
    slug = "Andrena/milwaukeensis"
    _write_species_svg(slug, [], backdrop, tmp_path)
    out = tmp_path / "Andrena" / "milwaukeensis.svg"
    assert out.exists(), (
        f"Expected {out} to exist after _write_species_svg(slug={slug!r}, ...)"
    )
