"""Integration tests for species_maps.py.

Covers MAP-01..04, MAP-06, slug-agreement (Phase 78 plan 03).
"""
import xml.etree.ElementTree as ET

import duckdb

from feeds import _slugify

SVG_NS = "http://www.w3.org/2000/svg"


def _fmt(tag: str) -> str:
    """Clark-notation tag for SVG namespace."""
    return f"{{{SVG_NS}}}{tag}"


def _setup_artifacts(fixture_con, export_dir, monkeypatch):
    """Run export → species_export → species_maps, all pointed at export_dir."""
    import export as export_mod
    import species_export
    import species_maps
    monkeypatch.setattr(export_mod, "ASSETS_DIR", export_dir)
    monkeypatch.setattr(species_export, "ASSETS_DIR", export_dir)
    monkeypatch.setattr(species_maps, "ASSETS_DIR", export_dir)
    # species_export reads occurrences.parquet — write a fresh one first.
    export_mod.export_occurrences_parquet(fixture_con)
    species_export.export_species_parquet(fixture_con)
    species_maps.generate_species_maps(fixture_con)
    return species_maps


def test_one_svg_per_nonzero_species(fixture_con, export_dir, monkeypatch):
    """MAP-01: one SVG per species with occurrence_count > 0; zero SVG for zero-count species."""
    _setup_artifacts(fixture_con, export_dir, monkeypatch)
    parquet_path = str(export_dir / "species.parquet")
    rows = duckdb.execute(
        f"SELECT slug, occurrence_count FROM read_parquet('{parquet_path}')"
    ).fetchall()
    maps_dir = export_dir / "species-maps"
    nonzero_slugs = {slug for slug, count in rows if count > 0}
    zero_slugs = {slug for slug, count in rows if count == 0}
    assert nonzero_slugs, "fixture should have at least one species with occurrence_count > 0"
    for slug in nonzero_slugs:
        assert (maps_dir / f"{slug}.svg").exists(), f"missing SVG for {slug}"
    for slug in zero_slugs:
        assert not (maps_dir / f"{slug}.svg").exists(), (
            f"unexpected SVG for zero-count species {slug}"
        )


def test_inline_styling_and_viewbox(fixture_con, export_dir, monkeypatch):
    """MAP-02: viewBox='0 0 600 320'; styling lives inside SVG via single <style> block (D-03)."""
    _setup_artifacts(fixture_con, export_dir, monkeypatch)
    svgs = list((export_dir / "species-maps").glob("*.svg"))
    assert svgs, "expected at least one SVG to be emitted"
    for svg_path in svgs:
        root = ET.fromstring(svg_path.read_text(encoding="utf-8"))
        assert root.get("viewBox") == "0 0 600 320", svg_path
        styles = root.findall(_fmt("style"))
        assert len(styles) == 1, (
            f"expected exactly one <style> block per D-03, got {len(styles)} in {svg_path}"
        )
        style_text = styles[0].text or ""
        assert ".county" in style_text, svg_path
        assert ".occ" in style_text, svg_path
        assert root.find(_fmt("script")) is None, f"<script> not allowed in {svg_path}"
        # No external <link> at root either
        assert root.find(_fmt("link")) is None, f"<link> not allowed in {svg_path}"


def test_county_paths_and_circles(fixture_con, export_dir, monkeypatch):
    """MAP-03: county <path> count matches WA fixture county count; <circle> count matches in-bbox occurrences."""
    _setup_artifacts(fixture_con, export_dir, monkeypatch)
    # Fixture seeds exactly one WA county (Chelan) at state_fips='53'.
    expected_counties = fixture_con.execute(
        "SELECT COUNT(*) FROM geographies.us_counties WHERE state_fips = '53'"
    ).fetchone()[0]
    assert expected_counties >= 1, "fixture sanity: must have ≥1 WA county"

    # Pick every species with at least one occurrence and assert the
    # <circle class='occ'> count matches the fixture in-bbox count.
    parquet_path = str(export_dir / "species.parquet")
    species = duckdb.execute(
        f"""
        SELECT canonical_name, slug
        FROM read_parquet('{parquet_path}')
        WHERE occurrence_count > 0
        ORDER BY canonical_name
        """
    ).fetchall()

    WA_BBOX = (-124.85, 45.54, -116.92, 49.00)

    for canon, slug in species:
        in_bbox = fixture_con.execute(
            """
            SELECT COUNT(*) FROM ecdysis_data.occurrences
            WHERE canonical_name = ?
              AND decimal_latitude IS NOT NULL AND decimal_latitude != ''
              AND decimal_longitude IS NOT NULL AND decimal_longitude != ''
              AND CAST(decimal_longitude AS DOUBLE) BETWEEN ? AND ?
              AND CAST(decimal_latitude  AS DOUBLE) BETWEEN ? AND ?
            """,
            [canon, WA_BBOX[0], WA_BBOX[2], WA_BBOX[1], WA_BBOX[3]],
        ).fetchone()[0]

        svg_path = export_dir / "species-maps" / f"{slug}.svg"
        assert svg_path.exists(), f"missing SVG for {canon}"
        root = ET.fromstring(svg_path.read_text(encoding="utf-8"))
        n_paths = len(root.findall(_fmt("path")))
        n_circles = len(root.findall(_fmt("circle")))
        assert n_paths == expected_counties, (
            f"{canon}: expected {expected_counties} county paths, got {n_paths}"
        )
        assert n_circles == in_bbox, (
            f"{canon}: expected {in_bbox} <circle>, got {n_circles}"
        )


def test_off_bbox_clipping(fixture_con, export_dir, monkeypatch, capsys):
    """MAP-04: off-WA-bbox occurrence is silently clipped; clip count is logged; no exception.

    Uses the OFFBBOX-01 fixture row (lon=-117.5, lat=44.8, eastern Oregon)
    seeded by conftest. The SVG for `andrena anograe` should have ZERO
    in-bbox circles (its only occurrence is the OFFBBOX row).
    """
    _setup_artifacts(fixture_con, export_dir, monkeypatch)
    captured = capsys.readouterr()
    assert "points clipped" in captured.out, (
        f"expected clip log line, got stdout:\n{captured.out}"
    )
    # andrena anograe slug — slugified via _slugify('Andrena anograe') = 'andrena-anograe'.
    slug = _slugify("Andrena anograe")
    svg_path = export_dir / "species-maps" / f"{slug}.svg"
    assert svg_path.exists(), f"expected SVG for off-bbox species at {svg_path}"
    root = ET.fromstring(svg_path.read_text(encoding="utf-8"))
    circles = root.findall(_fmt("circle"))
    assert len(circles) == 0, (
        f"andrena anograe has only an off-bbox occurrence — expected 0 <circle>, "
        f"got {len(circles)}"
    )


def test_all_svgs_parse(fixture_con, export_dir, monkeypatch):
    """MAP-06: every emitted SVG passes xml.etree.ElementTree.fromstring (well-formed)."""
    _setup_artifacts(fixture_con, export_dir, monkeypatch)
    svgs = list((export_dir / "species-maps").glob("*.svg"))
    assert svgs, "expected at least one SVG to be emitted"
    for svg_path in svgs:
        # Raises if not well-formed XML.
        ET.fromstring(svg_path.read_text(encoding="utf-8"))


def test_svg_filename_matches_slug_column(fixture_con, export_dir, monkeypatch):
    """Slug agreement (Pitfall #3): SVG filename · species.parquet `slug` column ·
    _slugify(scientificName) all agree byte-for-byte for every row with occurrence_count > 0.
    """
    _setup_artifacts(fixture_con, export_dir, monkeypatch)
    parquet_path = str(export_dir / "species.parquet")
    rows = duckdb.execute(
        f"""
        SELECT scientificName, slug
        FROM read_parquet('{parquet_path}')
        WHERE occurrence_count > 0
        """
    ).fetchall()
    assert rows, "fixture should yield ≥1 species with occurrences"
    maps_dir = export_dir / "species-maps"
    for sci, slug in rows:
        # Plan 02 chose scientificName as the slug source.
        assert _slugify(sci) == slug, (
            f"slug drift: _slugify({sci!r})={_slugify(sci)!r} != parquet slug {slug!r}"
        )
        assert (maps_dir / f"{slug}.svg").exists(), (
            f"missing SVG for {sci!r} at slug {slug!r}"
        )


def test_svg_idempotency(fixture_con, export_dir, monkeypatch):
    """Success crit 4 (SVG arm): two consecutive generate_species_maps runs produce
    byte-identical SVGs for every species. Fails the run on any drift —
    no WARN-only escape hatch.
    """
    import hashlib
    import time

    import species_maps

    _setup_artifacts(fixture_con, export_dir, monkeypatch)
    maps_dir = export_dir / "species-maps"
    first = {
        p.name: hashlib.sha256(p.read_bytes()).hexdigest()
        for p in sorted(maps_dir.glob("*.svg"))
    }
    assert first, "expected at least one SVG from fixture run"

    time.sleep(1.5)  # observable gap so time-dependent non-determinism would surface

    species_maps.generate_species_maps(fixture_con)
    second = {
        p.name: hashlib.sha256(p.read_bytes()).hexdigest()
        for p in sorted(maps_dir.glob("*.svg"))
    }

    assert set(first.keys()) == set(second.keys()), (
        f"SVG filename set differs between runs: "
        f"first - second = {set(first) - set(second)}, "
        f"second - first = {set(second) - set(first)}"
    )
    for name in first:
        assert first[name] == second[name], (
            f"{name} drifted between runs (first={first[name]}, second={second[name]}) — "
            f"check _write_species_svg attribute ordering / ET.canonicalize"
        )
