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
        'bob'   — sample-host-only (source='waba_sample', ecdysis_id=None,
                  sample_id=None, observation_id=888).
                  Passes D-01 gate via source='waba_sample'.
                  sample_count must be NON-ZERO (via the observation_id formula).
        'carol' — inat_obs only (source='inat_obs', ecdysis_id=None).
                  Must NOT survive the D-01 gate.
        'dave'  — MIXED recordedBy: one ecdysis row with a real name ('Dave D')
                  and one waba_sample row with recordedBy=None. display_name MUST
                  resolve to 'Dave D', not '@dave' (CR-01 regression: a per-row
                  COALESCE would let the NULL row's '@dave' win the MIN).
    """
    schema = pa.schema([
        ("collector_inat_login", pa.string()),
        ("recordedBy", pa.string()),
        ("host_inat_login", pa.string()),
        ("ecdysis_id", pa.int64()),
        ("source", pa.string()),
        ("sample_id", pa.int64()),
        ("observation_id", pa.int64()),
        ("taxon_id", pa.int64()),
    ])
    table = pa.table(
        {
            "collector_inat_login": ["alice",  "alice",  "bob",   "carol",   "dave",    "dave"],
            "recordedBy":           ["Alice A", "Alice A", None,   "Carol C", "Dave D",  None],
            "host_inat_login":      ["alice",   "alice",  "bob",   "carol",   "dave",    "dave"],
            "ecdysis_id":           [42,        77,       None,    None,      55,        None],
            "source":               ["ecdysis", "ecdysis", "waba_sample", "inat_obs", "ecdysis", "waba_sample"],
            "sample_id":            [10,        20,       None,    None,      30,        None],
            "observation_id":       [None,      None,     888,     999,       None,      777],
            "taxon_id":             [10,        99,       None,    None,      10,        None],
        },
        schema=schema,
    )
    out_path = tmp_path / "occurrences.parquet"
    pq.write_table(table, out_path)
    return out_path


def _write_test_species_parquet(tmp_path: Path) -> Path:
    """Write a small species.parquet with one species-rank taxon (taxon_id=10).

    taxon_id=10 → specific_epithet='testicus' (identified to species).
    taxon_id=99 is absent → LEFT JOIN yields NULL specific_epithet (awaiting).
    """
    schema = pa.schema([
        ("taxon_id", pa.int64()),
        ("specific_epithet", pa.string()),
    ])
    table = pa.table(
        {
            "taxon_id":        [10],
            "specific_epithet": ["testicus"],
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
        (ecdysis_id IS NOT NULL OR source IN ('waba_specimen', 'waba_sample'))
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
    """waba_sample rows have NULL sample_id; their sample is the observation_id.

    Research finding #3: sample_count formula =
        COUNT(DISTINCT sample_id) + COUNT(DISTINCT CASE WHEN source='waba_sample' THEN observation_id END)
    For 'bob' (source='waba_sample', sample_id=None, observation_id=888):
        COUNT(DISTINCT sample_id)=0 + COUNT(DISTINCT observation_id where source='waba_sample')=1 → 1.
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

    'dave' has an ecdysis row (recordedBy='Dave D') and a waba_sample row
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
