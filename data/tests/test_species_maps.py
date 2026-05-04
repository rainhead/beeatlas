"""Integration tests for species_maps.py.

Covers MAP-01..04, MAP-06, slug-agreement. Written Wave 0 (Plan 078-01) —
these tests FAIL before Plan 078-03 lands data/species_maps.py. Each stub
attempts the lazy import inside a try/except so the failure surfaces as a
deterministic `Wave 0 stub` message rather than an opaque collection error.

Test names match `.planning/phases/078-pipeline-outputs/078-VALIDATION.md`
Per-Task Verification Map exactly.
"""
import pytest


def _import_or_skip_with_wave0(fn_name: str):
    """Lazy import of species_maps; converts ModuleNotFoundError into a
    deterministic Wave 0 stub failure so `grep -c "Wave 0 stub"` works.
    """
    try:
        import species_maps as maps_mod  # noqa: F401
        return maps_mod
    except ModuleNotFoundError:
        pytest.fail(f"Wave 0 stub — Plan 078-03 implements {fn_name}")


def test_one_svg_per_nonzero_species(fixture_con, export_dir, monkeypatch):
    """MAP-01: one SVG per species with occurrence_count > 0; zero SVG for zero-count species."""
    maps_mod = _import_or_skip_with_wave0("generate_species_maps")
    monkeypatch.setattr(maps_mod, 'ASSETS_DIR', export_dir)
    maps_mod.generate_species_maps(fixture_con)
    pytest.fail("Wave 0 stub — Plan 078-03 implements generate_species_maps")


def test_inline_styling_and_viewbox(fixture_con, export_dir, monkeypatch):
    """MAP-02: viewBox='0 0 600 320'; styling lives inside SVG via single <style> block (D-03)."""
    maps_mod = _import_or_skip_with_wave0("generate_species_maps")
    monkeypatch.setattr(maps_mod, 'ASSETS_DIR', export_dir)
    maps_mod.generate_species_maps(fixture_con)
    pytest.fail("Wave 0 stub — Plan 078-03 implements generate_species_maps")


def test_county_paths_and_circles(fixture_con, export_dir, monkeypatch):
    """MAP-03: county <path> count matches WA fixture county count; <circle> count matches in-bbox occurrences."""
    maps_mod = _import_or_skip_with_wave0("generate_species_maps")
    monkeypatch.setattr(maps_mod, 'ASSETS_DIR', export_dir)
    maps_mod.generate_species_maps(fixture_con)
    pytest.fail("Wave 0 stub — Plan 078-03 implements generate_species_maps")


def test_off_bbox_clipping(fixture_con, export_dir, monkeypatch, capsys):
    """MAP-04: off-WA-bbox occurrence is silently clipped; clip count is logged; no exception.

    Uses the OFFBBOX-01 fixture row (lon=-117.5, lat=44.8, eastern Oregon)
    seeded by conftest. The SVG for `andrena anograe` should have one fewer
    in-bbox circle than the species' total occurrence count.
    """
    maps_mod = _import_or_skip_with_wave0("generate_species_maps")
    monkeypatch.setattr(maps_mod, 'ASSETS_DIR', export_dir)
    maps_mod.generate_species_maps(fixture_con)
    captured = capsys.readouterr()
    assert "points clipped" in captured.out
    pytest.fail("Wave 0 stub — Plan 078-03 implements generate_species_maps")


def test_all_svgs_parse(fixture_con, export_dir, monkeypatch):
    """MAP-06: every emitted SVG passes xml.etree.ElementTree.fromstring (well-formed)."""
    maps_mod = _import_or_skip_with_wave0("generate_species_maps")
    monkeypatch.setattr(maps_mod, 'ASSETS_DIR', export_dir)
    maps_mod.generate_species_maps(fixture_con)
    pytest.fail("Wave 0 stub — Plan 078-03 implements generate_species_maps")


def test_svg_filename_matches_slug_column(fixture_con, export_dir, monkeypatch):
    """Slug agreement (success crit 3): SVG filename · species.parquet `slug` column ·
    _slugify(canonical_name) all agree byte-for-byte for every row with occurrence_count > 0.
    """
    maps_mod = _import_or_skip_with_wave0("generate_species_maps")
    monkeypatch.setattr(maps_mod, 'ASSETS_DIR', export_dir)
    maps_mod.generate_species_maps(fixture_con)
    pytest.fail("Wave 0 stub — Plan 078-03 implements generate_species_maps")
