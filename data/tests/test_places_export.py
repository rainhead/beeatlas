"""Tests for places_export.py — places.geojson FeatureCollection structure and
places.json record/count shape (PPIPE-04).

Covers:
    test_places_geojson_structure: GeoJSON FeatureCollection with one feature, slug property, Polygon geometry
    test_places_json_structure: JSON array with 5 required keys per record (no permits — not a per-place property)
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

_PLACE_A_WKT = "POLYGON((-121.0 47.0, -120.9 47.0, -120.9 47.1, -121.0 47.1, -121.0 47.0))"
# place-b overlaps place-a at lon -120.95..-120.9 (same band as test_occurrence_places).
_PLACE_B_WKT = "POLYGON((-120.95 47.0, -120.85 47.0, -120.85 47.1, -120.95 47.1, -120.95 47.0))"


def _seed_places_db(db_path: Path) -> None:
    """Create geographies.places with two overlapping test rows (place-a, place-b)."""
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
    for slug, name, wkt in [
        ("place-a", "Place A", _PLACE_A_WKT),
        ("place-b", "Place B", _PLACE_B_WKT),
    ]:
        con.execute(
            "INSERT INTO geographies.places VALUES (?, ?, ?, ST_GeomFromText(?))",
            [slug, name, "DNR", wkt],
        )
    con.close()


def _write_test_toml(tmp_path: Path) -> Path:
    """Write a places.toml with two overlapping entries (place-a, place-b). Returns path."""
    content = f"""\
[[places]]
slug = "place-a"
name = "Place A"
land_owner = "DNR"
geometry_wkt = "{_PLACE_A_WKT}"
permits = [{{issuing_authority = "DNR", type = "project-level"}}]

[[places]]
slug = "place-b"
name = "Place B"
land_owner = "DNR"
geometry_wkt = "{_PLACE_B_WKT}"
permits = [{{issuing_authority = "DNR", type = "project-level"}}]
"""
    path = tmp_path / "places.toml"
    path.write_text(content, encoding="utf-8")
    return path


def _write_test_occurrences_parquet(tmp_path: Path) -> Path:
    """Write a small occurrences.parquet keyed by IDENTITY columns (no place_slug).

    Phase 160 (D-02): place_slug is no longer a column on the occurrences mart;
    membership lives in the occurrence_places bridge. This fixture carries the
    four identity columns the bridge keys on, plus the count-driving columns.

    Three occurrences:
        ecdysis:42 — Ecdysis-backed, sample_id=10 → member of BOTH place-a & place-b
                     (the overlap occurrence — double-counted, D-05)
        inat:99    — sample-only iNat (ecdysis_id=None), sample_id=10 → place-a only
        ecdysis:7  — Ecdysis-backed, sample_id=None → place-b only
    """
    schema = pa.schema([
        ("ecdysis_id", pa.int64()),
        ("observation_id", pa.int64()),
        ("specimen_observation_id", pa.int64()),
        ("checklist_id", pa.int64()),
        ("is_provisional", pa.bool_()),
        ("sample_id", pa.int64()),
        ("lon", pa.float64()),
        ("lat", pa.float64()),
        # Columns the phase-1 (cyv) species + timing queries read.
        ("tier", pa.string()),
        ("month", pa.int64()),
        ("taxon_id", pa.int64()),
        # Host plant name the target-host join reads (matches target_hosts.canonical_name).
        ("sample_host", pa.string()),
    ])
    table = pa.table(
        {
            "ecdysis_id":              [42,    None,  7],
            "observation_id":          [None,  99,    None],
            "specimen_observation_id": [None,  None,  None],
            "checklist_id":            [None,  None,  None],
            "is_provisional":          [False, False, False],
            "sample_id":               [10,    10,    None],
            "lon":                     [-120.92, -120.97, -120.88],
            "lat":                     [47.05, 47.05, 47.05],
            "tier":                    ["atlas", "atlas", "atlas"],
            "month":                   [6,     7,     6],
            # taxon 100 = Andrena foo (ecdysis:42, inat:99); 200 = Bombus bar (ecdysis:7)
            "taxon_id":                [100,   100,   200],
            # ecdysis:42 native target host (both places); inat:99 an introduced weed
            # (excluded — not in the seed); ecdysis:7 no host.
            "sample_host":             ["Balsamorhiza sagittata", "Taraxacum officinale", None],
        },
        schema=schema,
    )
    out_path = tmp_path / "occurrences.parquet"
    pq.write_table(table, out_path)
    return out_path


def _write_test_species_parquet(tmp_path: Path) -> Path:
    """Write species.parquet keyed by taxon_id for the per-place species join.

    Two species-rank taxa (specific_epithet non-null): 100=Andrena foo, 200=Bombus bar.
    """
    schema = pa.schema([
        ("taxon_id", pa.int64()),
        ("genus", pa.string()),
        ("scientificName", pa.string()),
        ("slug", pa.string()),
        ("specific_epithet", pa.string()),
    ])
    table = pa.table(
        {
            "taxon_id":         [100,          200],
            "genus":            ["Andrena",    "Bombus"],
            "scientificName":   ["Andrena foo", "Bombus bar"],
            "slug":             ["Andrena/foo", "Bombus/bar"],
            "specific_epithet": ["foo",        "bar"],
        },
        schema=schema,
    )
    out_path = tmp_path / "species.parquet"
    pq.write_table(table, out_path)
    return out_path


def _write_test_bridge_parquet(tmp_path: Path) -> Path:
    """Write occurrence_places.parquet: (occ_id VARCHAR, place_slug VARCHAR).

    Mirrors the bridge built in 160-02. ecdysis:42 is a member of BOTH places
    (the overlap occurrence — two bridge rows for one occ_id); inat:99 is in
    place-a only; ecdysis:7 is in place-b only. Sorted by (occ_id, place_slug).
    """
    schema = pa.schema([
        ("occ_id", pa.string()),
        ("place_slug", pa.string()),
    ])
    table = pa.table(
        {
            "occ_id":     ["ecdysis:42", "ecdysis:42", "ecdysis:7", "inat:99"],
            "place_slug": ["place-a",    "place-b",    "place-b",   "place-a"],
        },
        schema=schema,
    )
    out_path = tmp_path / "occurrence_places.parquet"
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
    _write_test_bridge_parquet(tmp_path)
    _write_test_species_parquet(tmp_path)
    monkeypatch.setattr(places_export, "_PLACES_TOML_PATH", _write_test_toml(tmp_path))

    # Deterministic target-host seed fixture (isolates the test from the real seed).
    th = tmp_path / "target_hosts.csv"
    th.write_text(
        "canonical_name,family,inat_taxon_id,endemic,source\n"
        '"Balsamorhiza sagittata","Asteraceae",50000,N,burke-wa-flora\n'
        '"Lomatium cuspidatum","Apiaceae",60000,Y,burke-wa-flora\n',
        encoding="utf-8",
    )
    monkeypatch.setattr(places_export, "_TARGET_HOSTS_CSV", th)

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
    assert len(fc["features"]) == 2

    feat = fc["features"][0]
    assert feat["type"] == "Feature"
    assert "slug" in feat["properties"]
    assert feat["properties"]["slug"] in ("place-a", "place-b")
    assert feat["geometry"]["type"] in ("Polygon", "MultiPolygon")


def test_places_json_structure(tmp_path, monkeypatch):
    """places.json is a JSON list with all 5 required keys per record (PPIPE-04)."""
    pe_mod = _setup_env(tmp_path, monkeypatch)
    pe_mod.export_places_step()

    out = tmp_path / "places.json"
    assert out.exists(), "places.json was not produced"

    records = json.loads(out.read_text())
    assert isinstance(records, list)
    assert len(records) == 2

    r = records[0]
    required_keys = {"slug", "name", "land_owner", "specimen_count", "sample_count"}
    assert required_keys <= set(r.keys()), f"Missing keys: {required_keys - set(r.keys())}"
    assert "permits" not in r, "permits must not appear in places.json (not a per-place property)"

    assert isinstance(r["specimen_count"], int)
    assert isinstance(r["sample_count"], int)


def test_places_json_counts(tmp_path, monkeypatch):
    """Per-place counts double-count an occurrence that belongs to two places (D-05/SC-3).

    RED-by-design until 160-03 rewrites _query_counts to JOIN occurrences to the
    occurrence_places bridge (today it reads a scalar place_slug column that this
    fixture no longer emits, so counts come back empty/zero).

    Fixture membership (occurrence_places.parquet):
        ecdysis:42 (Ecdysis-backed, sample_id=10) → place-a AND place-b
        inat:99    (sample-only,    sample_id=10) → place-a
        ecdysis:7  (Ecdysis-backed, sample_id=None) → place-b

    Expected per-place counts (an occurrence counts toward EVERY place it's in):
        place-a: specimen_count=1 (ecdysis:42), sample_count=1 (DISTINCT sample_id={10})
        place-b: specimen_count=2 (ecdysis:42 + ecdysis:7), sample_count=1 (DISTINCT {10})
    The shared occurrence ecdysis:42 increments BOTH places' specimen_count — the
    double-count proof.
    """
    pe_mod = _setup_env(tmp_path, monkeypatch)
    pe_mod.export_places_step()

    records = json.loads((tmp_path / "places.json").read_text())
    assert len(records) == 2
    by_slug = {r["slug"]: r for r in records}

    assert by_slug["place-a"]["specimen_count"] == 1, (
        f"place-a specimen_count: {by_slug['place-a']['specimen_count']}"
    )
    assert by_slug["place-a"]["sample_count"] == 1, (
        f"place-a sample_count: {by_slug['place-a']['sample_count']}"
    )
    # ecdysis:42 (shared) + ecdysis:7 both land in place-b → double-count.
    assert by_slug["place-b"]["specimen_count"] == 2, (
        f"place-b specimen_count must double-count ecdysis:42, got "
        f"{by_slug['place-b']['specimen_count']}"
    )
    assert by_slug["place-b"]["sample_count"] == 1, (
        f"place-b sample_count: {by_slug['place-b']['sample_count']}"
    )


# ---------------------------------------------------------------------------
# Phase 1 (cyv): place_details.json — per-place species + collection timing
# ---------------------------------------------------------------------------

def test_place_details_species_by_genus(tmp_path, monkeypatch):
    """place_details.json groups a place's species by genus, with cased name, slug, count.

    Membership (bridge) × taxa (fixture):
        place-a: ecdysis:42 (taxon 100) + inat:99 (taxon 100) → Andrena foo ×2
        place-b: ecdysis:42 (taxon 100) + ecdysis:7 (taxon 200) → Andrena foo ×1, Bombus bar ×1
    """
    pe_mod = _setup_env(tmp_path, monkeypatch)
    pe_mod.export_places_step()

    out = tmp_path / "place_details.json"
    assert out.exists(), "place_details.json was not produced"
    by_slug = {r["slug"]: r for r in json.loads(out.read_text())}

    a = by_slug["place-a"]["species_by_genus"]
    assert a == [
        {"genus": "Andrena", "species": [
            {"name": "Andrena foo", "slug": "Andrena/foo", "count": 2}]}
    ], a

    b = by_slug["place-b"]["species_by_genus"]
    assert [g["genus"] for g in b] == ["Andrena", "Bombus"], "genera alphabetical"
    assert b[0]["species"][0]["count"] == 1  # Andrena foo, place-b
    assert b[1]["species"][0] == {"name": "Bombus bar", "slug": "Bombus/bar", "count": 1}


def test_place_details_collection_months_and_peak(tmp_path, monkeypatch):
    """collection_months is a 12-int Jan..Dec histogram; peak_month is suppressed below
    _PEAK_MIN_RECORDS (both test places have only 2 dated records)."""
    pe_mod = _setup_env(tmp_path, monkeypatch)
    pe_mod.export_places_step()

    by_slug = {r["slug"]: r for r in json.loads((tmp_path / "place_details.json").read_text())}

    # place-a: month 6 (×1) + month 7 (×1); place-b: month 6 (×2).
    assert by_slug["place-a"]["collection_months"] == [0, 0, 0, 0, 0, 1, 1, 0, 0, 0, 0, 0]
    assert by_slug["place-b"]["collection_months"] == [0, 0, 0, 0, 0, 2, 0, 0, 0, 0, 0, 0]
    assert by_slug["place-a"]["dated_total"] == 2
    # Below the 10-record threshold → no fabricated peak.
    assert by_slug["place-a"]["peak_month"] is None
    assert by_slug["place-b"]["peak_month"] is None


def test_place_details_peak_month_when_above_threshold(tmp_path, monkeypatch):
    """peak_month is the 1-based modal month once dated_total ≥ _PEAK_MIN_RECORDS."""
    pe_mod = _setup_env(tmp_path, monkeypatch)
    months = {"place-a": [0, 0, 0, 3, 9, 4, 0, 0, 0, 0, 0, 0]}  # total 16, mode May(=5)
    out = tmp_path / "place_details.json"
    pe_mod._write_place_details({}, months, {}, out)
    rec = {r["slug"]: r for r in json.loads(out.read_text())}["place-a"]
    assert rec["dated_total"] == 16
    assert rec["peak_month"] == 5
    assert rec["species_by_genus"] == []  # no species supplied → empty, not missing
    assert rec["target_hosts"] == []  # no hosts supplied → empty, not missing


def test_place_details_target_hosts(tmp_path, monkeypatch):
    """target_hosts lists native seed hosts bees were collected on at the place;
    introduced weeds (Taraxacum, absent from the seed) are excluded."""
    pe_mod = _setup_env(tmp_path, monkeypatch)
    pe_mod.export_places_step()
    by_slug = {r["slug"]: r for r in json.loads((tmp_path / "place_details.json").read_text())}
    # ecdysis:42 (Balsamorhiza sagittata, native) is in BOTH places; inat:99
    # (Taraxacum officinale, introduced) is place-a only and must NOT appear.
    expected = [{"name": "Balsamorhiza sagittata", "family": "Asteraceae", "endemic": False, "count": 1}]
    assert by_slug["place-a"]["target_hosts"] == expected, by_slug["place-a"]["target_hosts"]
    assert by_slug["place-b"]["target_hosts"] == expected, by_slug["place-b"]["target_hosts"]
