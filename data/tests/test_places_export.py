"""Tests for places_export.py — places.geojson FeatureCollection structure and
places.json record/count shape (PPIPE-04).

Covers:
    test_places_geojson_structure: GeoJSON FeatureCollection with one feature, slug property, Polygon geometry
    test_places_json_structure: JSON array with all 6 required keys per record
    test_places_json_counts: specimen_count and sample_count derived correctly from occurrences.parquet
"""

import importlib
import json
from pathlib import Path

import duckdb
import pyarrow as pa
import pyarrow.parquet as pq
import pytest


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _seed_places_db(db_path: Path) -> None:
    """Create geographies.places with one test row in the given DuckDB file."""
    con = duckdb.connect(str(db_path))
    con.execute("LOAD spatial")
    con.execute("CREATE SCHEMA IF NOT EXISTS geographies")
    con.execute("""
        CREATE OR REPLACE TABLE geographies.places (
            slug VARCHAR,
            name VARCHAR,
            land_owner VARCHAR,
            geom GEOMETRY
        )
    """)
    con.execute(
        "INSERT INTO geographies.places VALUES (?, ?, ?, ST_GeomFromText(?))",
        [
            "test-place",
            "Test Place",
            "DNR",
            "POLYGON((-121.0 47.0, -120.9 47.0, -120.9 47.1, -121.0 47.1, -121.0 47.0))",
        ],
    )
    con.close()


def _write_test_toml(tmp_path: Path) -> Path:
    """Write a minimal places.toml with a single test-place entry. Returns path."""
    content = """\
[[places]]
slug = "test-place"
name = "Test Place"
land_owner = "DNR"
geometry_wkt = "POLYGON((-121.0 47.0, -120.9 47.0, -120.9 47.1, -121.0 47.1, -121.0 47.0))"
permits = [{issuing_authority = "DNR", type = "project-level"}]
"""
    path = tmp_path / "places.toml"
    path.write_text(content, encoding="utf-8")
    return path


def _write_test_occurrences_parquet(tmp_path: Path) -> Path:
    """Write a small occurrences.parquet with known counts for test-place.

    Three rows:
        ('test-place', False, 42)   — non-provisional, sample 42
        ('test-place', False, 42)   — same sample as above (sample_count = DISTINCT → 1)
        (None, False, 99)           — outside any place (excluded from counts)

    Expected: specimen_count == 2, sample_count == 1
    """
    schema = pa.schema([
        ("place_slug", pa.string()),
        ("is_provisional", pa.bool_()),
        ("sample_id", pa.int64()),
    ])
    table = pa.table(
        {
            "place_slug": ["test-place", "test-place", None],
            "is_provisional": [False, False, False],
            "sample_id": [42, 42, 99],
        },
        schema=schema,
    )
    out_path = tmp_path / "occurrences.parquet"
    pq.write_table(table, out_path)
    return out_path


def _setup_env(tmp_path: Path, monkeypatch) -> object:
    """Seed all test fixtures and return the places_export module with patched paths."""
    monkeypatch.setenv("DB_PATH", str(tmp_path / "test.duckdb"))
    monkeypatch.setenv("EXPORT_DIR", str(tmp_path))

    import places_export  # noqa: PLC0415 — must import after env is set
    importlib.reload(places_export)

    _seed_places_db(tmp_path / "test.duckdb")
    _write_test_occurrences_parquet(tmp_path)
    monkeypatch.setattr(places_export, "_PLACES_TOML_PATH", _write_test_toml(tmp_path))

    return places_export


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------

def test_places_geojson_structure(tmp_path, monkeypatch):
    """places.geojson is a FeatureCollection with one feature per place (PPIPE-04)."""
    pe_mod = _setup_env(tmp_path, monkeypatch)
    pe_mod.export_places_step()

    out = tmp_path / "places.geojson"
    assert out.exists(), "places.geojson was not produced"

    fc = json.loads(out.read_text())
    assert fc["type"] == "FeatureCollection"
    assert len(fc["features"]) == 1

    feat = fc["features"][0]
    assert feat["type"] == "Feature"
    assert "slug" in feat["properties"]
    assert feat["properties"]["slug"] == "test-place"
    assert feat["geometry"]["type"] in ("Polygon", "MultiPolygon")


def test_places_json_structure(tmp_path, monkeypatch):
    """places.json is a JSON list with all 6 required keys per record (PPIPE-04)."""
    pe_mod = _setup_env(tmp_path, monkeypatch)
    pe_mod.export_places_step()

    out = tmp_path / "places.json"
    assert out.exists(), "places.json was not produced"

    records = json.loads(out.read_text())
    assert isinstance(records, list)
    assert len(records) == 1

    r = records[0]
    required_keys = {"slug", "name", "land_owner", "permits", "specimen_count", "sample_count"}
    assert required_keys <= set(r.keys()), f"Missing keys: {required_keys - set(r.keys())}"

    assert isinstance(r["specimen_count"], int)
    assert isinstance(r["sample_count"], int)
    assert isinstance(r["permits"], list)


def test_places_json_counts(tmp_path, monkeypatch):
    """specimen_count and sample_count are derived correctly from occurrences.parquet."""
    pe_mod = _setup_env(tmp_path, monkeypatch)
    pe_mod.export_places_step()

    records = json.loads((tmp_path / "places.json").read_text())
    assert len(records) == 1

    r = records[0]
    # Two non-provisional rows for test-place → specimen_count == 2
    assert r["specimen_count"] == 2, (
        f"Expected specimen_count == 2, got {r['specimen_count']}"
    )
    # Both rows have same sample_id=42 → DISTINCT count == 1
    assert r["sample_count"] == 1, (
        f"Expected sample_count == 1, got {r['sample_count']}"
    )
