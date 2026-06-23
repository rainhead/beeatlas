"""Tests for places_maps.py — per-place SVG file existence and byte-stability (PPAGE-03)."""

import importlib
import xml.etree.ElementTree as ET
from pathlib import Path

import duckdb
import pyarrow as pa
import pyarrow.parquet as pq
import pytest


def _seed_counties(con: duckdb.DuckDBPyConnection) -> None:
    """Create geographies.us_counties with a minimal WA county polygon for backdrop tests."""
    con.execute("LOAD spatial")
    con.execute("CREATE SCHEMA IF NOT EXISTS geographies")
    con.execute("""
        CREATE TABLE IF NOT EXISTS geographies.us_counties (
            geoid VARCHAR,
            name VARCHAR,
            state_fips VARCHAR,
            geom GEOMETRY
        )
    """)
    # One WA county (Chelan) sufficient for backdrop — the backdrop helper just needs rows.
    con.execute("""
        INSERT INTO geographies.us_counties VALUES (
            '53007', 'Chelan', '53',
            ST_GeomFromText('POLYGON((-121.5 47.0, -120.0 47.0, -120.0 48.5, -121.5 48.5, -121.5 47.0))')
        )
    """)


def _write_test_occurrences_parquet(path: Path) -> None:
    """Write minimal occurrences + occurrence_places bridge fixtures.

    Phase 160 (D-02/D-05): places_maps derives an Option-B ``occ_id`` from the
    identity columns and JOINs the ``occurrence_places`` bridge (no scalar
    ``place_slug`` column). Three occurrences (occ_id ``inat:1/2/3``); the bridge
    maps inat:1 → rattlesnake-ledge and inat:2 → tiger-mountain, and leaves inat:3
    unmapped so it produces no SVG (the old NULL-place-slug case).
    """
    occ = pa.table({
        "ecdysis_id": pa.array([None, None, None], type=pa.int64()),
        "observation_id": pa.array([1, 2, 3], type=pa.int64()),
        "specimen_observation_id": pa.array([None, None, None], type=pa.int64()),
        "checklist_id": pa.array([None, None, None], type=pa.int64()),
        "lon": pa.array([-121.77, -121.94, -120.0], type=pa.float64()),
        "lat": pa.array([47.435, 47.42, 47.5], type=pa.float64()),
    })
    pq.write_table(occ, str(path))

    bridge = pa.table({
        "occ_id": pa.array(["inat:1", "inat:2"], type=pa.string()),
        "place_slug": pa.array(["rattlesnake-ledge", "tiger-mountain"], type=pa.string()),
    })
    pq.write_table(bridge, str(path.parent / "occurrence_places.parquet"))


def test_place_svg_files_exist(tmp_path, monkeypatch):
    """generate_place_maps() writes one SVG per distinct place_slug in occurrences.parquet.

    Verifies PPAGE-03 file-existence contract:
    - rattlesnake-ledge.svg and tiger-mountain.svg exist under place-maps/
    - No SVG for the NULL place_slug row
    """
    monkeypatch.setenv("DB_PATH", str(tmp_path / "test.duckdb"))
    monkeypatch.setenv("EXPORT_DIR", str(tmp_path))

    # Force module-level constants (DB_PATH, ASSETS_DIR) to pick up new env vars.
    import places_maps
    importlib.reload(places_maps)

    # Build fixture DuckDB with county table (needed by _load_county_geojsons).
    con = duckdb.connect(str(tmp_path / "test.duckdb"))
    _seed_counties(con)
    con.close()

    # Write occurrences.parquet fixture (3 rows: 2 with slugs, 1 NULL).
    _write_test_occurrences_parquet(tmp_path / "occurrences.parquet")

    # Exercise the main() zero-arg wrapper (STEPS entry point).
    places_maps.main()

    maps_dir = tmp_path / "place-maps"
    assert (maps_dir / "rattlesnake-ledge.svg").exists(), (
        "rattlesnake-ledge.svg missing — generate_place_maps() must write one SVG per slug"
    )
    assert (maps_dir / "tiger-mountain.svg").exists(), (
        "tiger-mountain.svg missing — generate_place_maps() must write one SVG per slug"
    )
    # NULL place_slug row must not produce a file.
    assert not (maps_dir / "None.svg").exists(), (
        "None.svg must not exist — NULL place_slug rows must be filtered by WHERE clause"
    )
    assert not (maps_dir / ".svg").exists(), (
        "Empty-string SVG must not exist"
    )


def test_place_svg_byte_stable(tmp_path):
    """_write_species_svg produces byte-identical output on two consecutive calls.

    Proves that places_maps reuses the byte-stable helper from species_maps.py without
    breaking the idempotency invariant (attribute dict sorting in _write_species_svg lines
    194-196 of species_maps.py).
    """
    from species_maps import SVG_NS, _write_species_svg

    maps_dir = tmp_path / "place-maps"
    maps_dir.mkdir(parents=True, exist_ok=True)

    # An empty SVG root is sufficient — attribute sorting is applied to all elements.
    backdrop = ET.Element(f"{{{SVG_NS}}}svg")
    points = [(-120.95, 47.05), (-120.90, 47.08)]

    # First write.
    _write_species_svg("test-place", points, set(), {}, backdrop, maps_dir)
    content_a = (maps_dir / "test-place.svg").read_text(encoding="utf-8")

    # Second write (same inputs, overwrites).
    _write_species_svg("test-place", points, set(), {}, backdrop, maps_dir)
    content_b = (maps_dir / "test-place.svg").read_text(encoding="utf-8")

    assert content_a == content_b, (
        "SVG output must be byte-stable across runs (idempotency invariant)"
    )
