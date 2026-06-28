"""Tests for collectors_export.py — per-collector stats JSON (PAGE-01/02/03).

Covers:
    test_collectors_json_is_array: collectors.json is a JSON list
    test_gate_excludes_inat_obs_only: D-01 gate removes inat_obs-only logins
    test_sample_host_only_has_nonzero_sample_count: waba_sample rows with
        NULL sample_id get their sample counted via observation_id (Research #3)
    test_status_split_invariant: for every record,
        status_identified + status_awaiting == status_denominator (D-05/D-06)
    test_required_keys: every record carries all 10 required keys
"""

import importlib
import json
from pathlib import Path

import pyarrow as pa
import pyarrow.parquet as pq
import pytest


# ---------------------------------------------------------------------------
# Fixture helpers
# ---------------------------------------------------------------------------

def _write_test_occurrences_parquet(tmp_path: Path) -> Path:
    """Write a small occurrences.parquet fixture with three collector logins.

    Collectors in fixture:
        'alice' — ecdysis-backed (ecdysis_id IS NOT NULL); two rows:
                  one with a species-rank taxon (taxon_id=10 → in species.parquet),
                  one without a species match (taxon_id=99 → NOT in species.parquet).
                  specimen_count=2, status_denominator=2, status_identified=1, status_awaiting=1
        'bob'   — sample-host-only (record_type='provisional_sample', ecdysis_id=None,
                  sample_id=None, observation_id=888).
                  Passes D-01 gate via record_type='provisional_sample'.
                  sample_count must be NON-ZERO (via the observation_id formula).
        'carol' — inat_expert only (record_type='inat_expert', ecdysis_id=None).
                  Must NOT survive the D-01 gate.
        'dave'  — MIXED recordedBy: one specimen row with a real name ('Dave D')
                  and one provisional_sample row with recordedBy=None. display_name MUST
                  resolve to 'Dave D', not '@dave' (CR-01 regression: a per-row
                  COALESCE would let the NULL row's '@dave' win the MIN).
    """
    schema = pa.schema([
        ("collector_inat_login", pa.string()),
        ("recordedBy", pa.string()),
        ("host_inat_login", pa.string()),
        ("ecdysis_id", pa.int64()),
        ("record_type", pa.string()),
        ("sample_id", pa.int64()),
        ("observation_id", pa.int64()),
        ("taxon_id", pa.int64()),
        ("year", pa.int32()),
        ("county", pa.string()),
        ("ecoregion_l3", pa.string()),
    ])
    table = pa.table(
        {
            "collector_inat_login": ["alice",  "alice",  "bob",   "carol",   "dave",    "dave"],
            "recordedBy":           ["Alice A", "Alice A", None,   "Carol C", "Dave D",  None],
            "host_inat_login":      ["alice",   "alice",  "bob",   "carol",   "dave",    "dave"],
            "ecdysis_id":           [42,        77,       None,    None,      55,        None],
            "record_type":          ["specimen", "specimen", "provisional_sample", "inat_expert", "specimen", "provisional_sample"],
            "sample_id":            [10,        20,       None,    None,      30,        None],
            "observation_id":       [None,      None,     888,     999,       None,      777],
            "taxon_id":             [10,        99,       None,    None,      10,        None],
            # alice: years 2020 and 2022 (gap in 2021 — stress-tests D-05: 2 distinct seasons, not 3)
            "year":                 [2020,      2022,     2023,    2021,      2024,      2024],
            "county":               ["King", "Yakima", "King", "Clark", "King", "Yakima"],
            "ecoregion_l3":         ["Puget Lowland Forests", "Columbia Plateau",
                                     "Puget Lowland Forests", "Cascades",
                                     "Puget Lowland Forests", "Columbia Plateau"],
        },
        schema=schema,
    )
    out_path = tmp_path / "occurrences.parquet"
    pq.write_table(table, out_path)
    return out_path


def _write_test_species_parquet(tmp_path: Path) -> Path:
    """Write a small species.parquet with one species-rank taxon (taxon_id=10).

    taxon_id=10 → specific_epithet='testicus', genus='Testgenus',
                  canonical_name='Testgenus testicus', slug='Testgenus/testicus'.
    taxon_id=99 is absent → LEFT JOIN yields NULL specific_epithet (awaiting).
    """
    schema = pa.schema([
        ("taxon_id", pa.int64()),
        ("specific_epithet", pa.string()),
        ("genus", pa.string()),
        ("canonical_name", pa.string()),
        ("slug", pa.string()),
    ])
    table = pa.table(
        {
            "taxon_id":        [10],
            "specific_epithet": ["testicus"],
            "genus":           ["Testgenus"],
            "canonical_name":  ["Testgenus testicus"],
            "slug":            ["Testgenus/testicus"],
        },
        schema=schema,
    )
    out_path = tmp_path / "species.parquet"
    pq.write_table(table, out_path)
    return out_path


def _setup_env(tmp_path: Path, monkeypatch) -> object:
    """Seed all test fixtures and return the collectors_export module with patched paths."""
    monkeypatch.setenv("DB_PATH", str(tmp_path / "test.duckdb"))
    monkeypatch.setenv("EXPORT_DIR", str(tmp_path))

    import collectors_export  # noqa: PLC0415 — must import after env is set
    importlib.reload(collectors_export)

    _write_test_occurrences_parquet(tmp_path)
    _write_test_species_parquet(tmp_path)

    return collectors_export


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------

def test_collectors_json_is_array(tmp_path, monkeypatch):
    """collectors.json is a JSON list (PAGE-01)."""
    ce_mod = _setup_env(tmp_path, monkeypatch)
    ce_mod.export_collectors_step()

    out = tmp_path / "collectors.json"
    assert out.exists(), "collectors.json was not produced"

    records = json.loads(out.read_text())
    assert isinstance(records, list), "collectors.json must be a JSON array"


def test_gate_excludes_inat_obs_only(tmp_path, monkeypatch):
    """D-01: inat_obs-only login 'carol' must NOT appear in collectors.json.

    Gate predicate: collector_inat_login IS NOT NULL AND
        (ecdysis_id IS NOT NULL OR record_type IN ('waba_specimen', 'provisional_sample'))
    """
    ce_mod = _setup_env(tmp_path, monkeypatch)
    ce_mod.export_collectors_step()

    records = json.loads((tmp_path / "collectors.json").read_text())
    logins = {r["login"] for r in records}

    assert "carol" not in logins, (
        f"'carol' (inat_obs-only) must be excluded by D-01 gate; got logins={logins}"
    )
    assert "alice" in logins, "'alice' (ecdysis-backed) must pass the D-01 gate"
    assert "bob" in logins, "'bob' (waba_sample host) must pass the D-01 gate"


def test_sample_host_only_has_nonzero_sample_count(tmp_path, monkeypatch):
    """provisional_sample rows have NULL sample_id; their sample is the observation_id.

    Research finding #3: sample_count formula =
        COUNT(DISTINCT sample_id) + COUNT(DISTINCT CASE WHEN record_type='provisional_sample' THEN observation_id END)
    For 'bob' (record_type='provisional_sample', sample_id=None, observation_id=888):
        COUNT(DISTINCT sample_id)=0 + COUNT(DISTINCT observation_id where record_type='provisional_sample')=1 → 1.
    """
    ce_mod = _setup_env(tmp_path, monkeypatch)
    ce_mod.export_collectors_step()

    records = json.loads((tmp_path / "collectors.json").read_text())
    by_login = {r["login"]: r for r in records}

    bob = by_login.get("bob")
    assert bob is not None, "'bob' must be in collectors.json"
    assert bob["sample_count"] > 0, (
        f"'bob' is a waba_sample host; sample_count must be non-zero "
        f"(waba_sample rows have sample_id=NULL; count via observation_id). "
        f"Got sample_count={bob['sample_count']}"
    )


def test_status_split_invariant(tmp_path, monkeypatch):
    """D-05/D-06/D-07: status_identified + status_awaiting == status_denominator for every record.

    For 'alice' (2 ecdysis rows):
        taxon_id=10 → specific_epithet IS NOT NULL → identified=1
        taxon_id=99 → not in species.parquet → specific_epithet IS NULL → awaiting=1
        denominator=2, identified=1, awaiting=1 → 1+1==2 ✓
    For 'bob' (0 ecdysis rows, 0 waba_specimen rows):
        denominator=0, identified=0, awaiting=0 → 0+0==0 ✓
    """
    ce_mod = _setup_env(tmp_path, monkeypatch)
    ce_mod.export_collectors_step()

    records = json.loads((tmp_path / "collectors.json").read_text())
    assert len(records) > 0, "collectors.json must have records"

    for r in records:
        assert r["status_identified"] + r["status_awaiting"] == r["status_denominator"], (
            f"Split invariant violated for login={r['login']}: "
            f"identified={r['status_identified']} + awaiting={r['status_awaiting']} "
            f"!= denominator={r['status_denominator']}"
        )


def test_mixed_null_recordedby_keeps_real_name(tmp_path, monkeypatch):
    """CR-01 regression: a collector with both a named row and a NULL-recordedBy row
    must display the real name, not the '@login' fallback.

    'dave' has a specimen row (recordedBy='Dave D') and a provisional_sample row
    (recordedBy=None). A per-row COALESCE(recordedBy, '@'||login) followed by MIN
    would pick '@dave' (the '@' sorts before letters), masking the real name.
    The correct COALESCE(MIN(recordedBy), '@'||MIN(login)) yields 'Dave D'.
    """
    ce_mod = _setup_env(tmp_path, monkeypatch)
    ce_mod.export_collectors_step()

    records = json.loads((tmp_path / "collectors.json").read_text())
    by_login = {r["login"]: r for r in records}

    dave = by_login.get("dave")
    assert dave is not None, "'dave' must be in collectors.json"
    assert dave["display_name"] == "Dave D", (
        f"Mixed-null recordedBy must resolve to the real name, not '@login' (CR-01). "
        f"Got display_name={dave['display_name']!r}"
    )


def test_required_keys(tmp_path, monkeypatch):
    """Every record carries all 10 required keys with correct types."""
    ce_mod = _setup_env(tmp_path, monkeypatch)
    ce_mod.export_collectors_step()

    records = json.loads((tmp_path / "collectors.json").read_text())
    assert len(records) > 0, "collectors.json must have records"

    required_str_keys = {"login", "display_name"}
    required_int_keys = {
        "specimen_count", "sample_count", "species_count",
        "status_denominator", "status_identified", "status_awaiting",
    }
    # recordedBy and host_inat_login may be None for some collectors
    required_present_keys = required_str_keys | required_int_keys | {"recordedBy", "host_inat_login"}

    for r in records:
        missing = required_present_keys - set(r.keys())
        assert not missing, f"Missing keys in login={r['login']}: {missing}"

        for k in required_str_keys:
            assert isinstance(r[k], str), f"login={r['login']}: {k} must be str, got {type(r[k])}"

        for k in required_int_keys:
            assert isinstance(r[k], int), f"login={r['login']}: {k} must be int, got {type(r[k])}"


# ---------------------------------------------------------------------------
# Phase 172 — ACCOM-01/02/03/04 aggregation-field tests (RED until Plan 02)
#
# These tests fail with KeyError/AssertionError because collectors_export.py
# does not yet emit the new fields. They turn GREEN in Plan 02 when the
# export is extended. The existing tests above remain GREEN throughout.
# ---------------------------------------------------------------------------

def test_badge_fields_present_and_typed(tmp_path, monkeypatch):
    """active_since (int) and seasons_count (int) present for every record (ACCOM-04)."""
    ce_mod = _setup_env(tmp_path, monkeypatch)
    ce_mod.export_collectors_step()
    records = json.loads((tmp_path / "collectors.json").read_text())
    for r in records:
        assert isinstance(r["active_since"], int), (
            f"active_since must be int for login={r['login']}, got {type(r.get('active_since'))}"
        )
        assert isinstance(r["seasons_count"], int), (
            f"seasons_count must be int for login={r['login']}, got {type(r.get('seasons_count'))}"
        )


def test_seasons_count_is_distinct_years(tmp_path, monkeypatch):
    """seasons_count = COUNT(DISTINCT year), not max-min span (D-05).

    alice has years {2020, 2022} — a gap in 2021. COUNT(DISTINCT year) = 2.
    A max-min+1 span would incorrectly return 3. The test asserts exactly 2.
    """
    ce_mod = _setup_env(tmp_path, monkeypatch)
    ce_mod.export_collectors_step()
    records = json.loads((tmp_path / "collectors.json").read_text())
    by_login = {r["login"]: r for r in records}
    alice = by_login["alice"]
    assert alice["seasons_count"] == 2, (
        f"alice has 2 distinct years {{2020, 2022}} — seasons_count must be 2 (not the "
        f"max-min+1 span of 3). Got seasons_count={alice['seasons_count']} (D-05)."
    )


def test_active_since_is_min_year(tmp_path, monkeypatch):
    """active_since = MIN(year) over D-01 WABA-contribution rows (D-05).

    alice's earliest WABA year is 2020.
    """
    ce_mod = _setup_env(tmp_path, monkeypatch)
    ce_mod.export_collectors_step()
    records = json.loads((tmp_path / "collectors.json").read_text())
    by_login = {r["login"]: r for r in records}
    alice = by_login["alice"]
    assert alice["active_since"] == 2020, (
        f"alice's earliest year is 2020; active_since must be 2020. "
        f"Got active_since={alice['active_since']} (D-05)."
    )


def test_county_and_ecoregion_counts(tmp_path, monkeypatch):
    """county_count and ecoregion_count are COUNT(DISTINCT …) over D-01 rows (ACCOM-01/03).

    alice has county rows: King (2020), Yakima (2022) → county_count=2.
    alice has ecoregion rows: Puget Lowland Forests, Columbia Plateau → ecoregion_count=2.
    """
    ce_mod = _setup_env(tmp_path, monkeypatch)
    ce_mod.export_collectors_step()
    records = json.loads((tmp_path / "collectors.json").read_text())
    by_login = {r["login"]: r for r in records}
    alice = by_login["alice"]
    assert isinstance(alice["county_count"], int), (
        f"county_count must be int for alice, got {type(alice.get('county_count'))}"
    )
    assert isinstance(alice["ecoregion_count"], int), (
        f"ecoregion_count must be int for alice, got {type(alice.get('ecoregion_count'))}"
    )
    assert alice["county_count"] == 2, (
        f"alice's D-01 rows cover King and Yakima counties; county_count must be 2. "
        f"Got county_count={alice['county_count']} (ACCOM-01)."
    )
    assert alice["ecoregion_count"] == 2, (
        f"alice's D-01 rows cover 2 distinct ecoregions; ecoregion_count must be 2. "
        f"Got ecoregion_count={alice['ecoregion_count']} (ACCOM-03)."
    )


def test_species_by_genus_structure(tmp_path, monkeypatch):
    """species_by_genus is a list of {genus, species:[{canonical_name, slug, count}]} (ACCOM-02).

    The fixture has taxon_id=10 → Testgenus testicus. alice has taxon_id=10 (species-rank);
    the species list must include one genus group with one species entry.
    """
    ce_mod = _setup_env(tmp_path, monkeypatch)
    ce_mod.export_collectors_step()
    records = json.loads((tmp_path / "collectors.json").read_text())
    for r in records:
        assert isinstance(r["species_by_genus"], list), (
            f"species_by_genus must be a list for login={r['login']}"
        )
        for g in r["species_by_genus"]:
            assert "genus" in g, f"genus key missing in species_by_genus entry for {r['login']}"
            assert isinstance(g["species"], list), (
                f"species must be a list in genus group for {r['login']}"
            )
            for sp in g["species"]:
                assert "canonical_name" in sp, (
                    f"canonical_name missing in species entry for {r['login']}"
                )
                assert "slug" in sp, f"slug missing in species entry for {r['login']}"
                assert isinstance(sp["count"], int), (
                    f"count must be int in species entry for {r['login']}"
                )
