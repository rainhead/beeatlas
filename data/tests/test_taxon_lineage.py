"""Phase 76 integration tests for enrich_taxon_lineage_extended().

Covers TAX-01 (full ancestor walk — 5 rank harvests), TAX-03 (NULL emitted,
not sentinel), D-03 (union over both observation tables), the empty-input
short-circuit, and the batch_size=30 invariant.

Uses the existing session-scoped `fixture_db` fixture (path string) from
data/tests/conftest.py — passed directly as `db_path=fixture_db` to the
function under test. Does NOT modify Plan 04's locked
`enrich_taxon_lineage_extended(db_path: str | None = None) -> None` signature.

Each test snapshots the affected observation rows + taxon_lineage_extended
table, mutates state, then restores in a finally block so that other tests
sharing the session-scoped fixture_con (test_export, test_feeds) see
consistent state regardless of pytest collection order.
"""

import pytest
import requests

import inaturalist_pipeline as inat_mod
from inaturalist_pipeline import enrich_taxon_lineage_extended, TARGET_RANKS


class _StubResponse:
    """Minimal requests.Response stand-in for monkeypatch."""

    status_code = 200
    headers: dict = {}

    def __init__(self, payload):
        self._payload = payload

    def json(self):
        return self._payload

    def raise_for_status(self):
        return None


def _snapshot_obs_state(con):
    """Capture the current contents of the observation + lineage + bridge tables
    so each test can restore them before yielding back to the session.

    Phase 77 added inaturalist_data.canonical_to_taxon_id as a third UNION arm in
    enrich_taxon_lineage_extended; tests that clear observations must also clear
    the bridge to genuinely produce a "no taxon IDs" state.
    """
    return {
        "inat": con.execute(
            "SELECT * FROM inaturalist_data.observations"
        ).fetchall(),
        "inat_cols": [
            r[0] for r in con.execute(
                "SELECT column_name FROM information_schema.columns "
                "WHERE table_schema='inaturalist_data' AND table_name='observations' "
                "ORDER BY ordinal_position"
            ).fetchall()
        ],
        "waba": con.execute(
            "SELECT * FROM inaturalist_waba_data.observations"
        ).fetchall(),
        "waba_cols": [
            r[0] for r in con.execute(
                "SELECT column_name FROM information_schema.columns "
                "WHERE table_schema='inaturalist_waba_data' AND table_name='observations' "
                "ORDER BY ordinal_position"
            ).fetchall()
        ],
        "lineage": con.execute(
            "SELECT * FROM inaturalist_data.taxon_lineage_extended"
        ).fetchall(),
        "bridge": con.execute(
            "SELECT canonical_name, taxon_id, resolved_at, source "
            "FROM inaturalist_data.canonical_to_taxon_id"
        ).fetchall(),
    }


def _restore_obs_state(con, snap):
    """Inverse of _snapshot_obs_state. Used in finally blocks."""
    con.execute("DELETE FROM inaturalist_data.observations")
    con.execute("DELETE FROM inaturalist_waba_data.observations")
    con.execute("DELETE FROM inaturalist_data.canonical_to_taxon_id")
    # taxon_lineage_extended may have been replaced with a different schema
    # by the function under test (Plan 04 issues CREATE OR REPLACE TABLE).
    # Drop and rebuild from the seeded shape.
    con.execute("DROP TABLE IF EXISTS inaturalist_data.taxon_lineage_extended")
    con.execute("""
        CREATE TABLE inaturalist_data.taxon_lineage_extended (
            taxon_id BIGINT,
            family VARCHAR,
            subfamily VARCHAR,
            tribe VARCHAR,
            genus VARCHAR,
            subgenus VARCHAR
        )
    """)
    if snap["inat"]:
        placeholders = ",".join(["?"] * len(snap["inat_cols"]))
        cols = ",".join(snap["inat_cols"])
        con.executemany(
            f"INSERT INTO inaturalist_data.observations ({cols}) VALUES ({placeholders})",
            snap["inat"],
        )
    if snap["waba"]:
        placeholders = ",".join(["?"] * len(snap["waba_cols"]))
        cols = ",".join(snap["waba_cols"])
        con.executemany(
            f"INSERT INTO inaturalist_waba_data.observations ({cols}) VALUES ({placeholders})",
            snap["waba"],
        )
    if snap["lineage"]:
        con.executemany(
            "INSERT INTO inaturalist_data.taxon_lineage_extended VALUES (?, ?, ?, ?, ?, ?)",
            snap["lineage"],
        )
    if snap["bridge"]:
        con.executemany(
            "INSERT INTO inaturalist_data.canonical_to_taxon_id "
            "(canonical_name, taxon_id, resolved_at, source) VALUES (?, ?, ?, ?)",
            snap["bridge"],
        )


def _seed_observation_taxon_ids(con, ids_inat, ids_waba):
    """Replace observation tables with the supplied taxon IDs only.

    Also clears the output table AND the Phase 77 bridge table
    (inaturalist_data.canonical_to_taxon_id is a third UNION arm in
    enrich_taxon_lineage_extended) so the function under test sees a fresh
    starting state.
    """
    con.execute("DELETE FROM inaturalist_data.observations")
    con.execute("DELETE FROM inaturalist_waba_data.observations")
    con.execute("DELETE FROM inaturalist_data.canonical_to_taxon_id")
    con.execute("DROP TABLE IF EXISTS inaturalist_data.taxon_lineage_extended")
    con.execute("""
        CREATE TABLE inaturalist_data.taxon_lineage_extended (
            taxon_id BIGINT,
            family VARCHAR,
            subfamily VARCHAR,
            tribe VARCHAR,
            genus VARCHAR,
            subgenus VARCHAR
        )
    """)
    for tid in ids_inat:
        con.execute(
            "INSERT INTO inaturalist_data.observations (taxon__id) VALUES (?)",
            [tid],
        )
    for tid in ids_waba:
        con.execute(
            "INSERT INTO inaturalist_waba_data.observations (taxon__id) VALUES (?)",
            [tid],
        )


def test_target_ranks_constant():
    """TAX-01: the function harvests exactly the 5 named ranks."""
    assert TARGET_RANKS == {"family", "subfamily", "tribe", "genus", "subgenus"}


def test_enrich_writes_all_five_ranks(fixture_con, fixture_db, monkeypatch):
    """TAX-01: a taxon with family/subfamily/tribe/genus/subgenus in the
    ancestor chain produces a row populating all 5 columns."""
    snap = _snapshot_obs_state(fixture_con)
    try:
        _seed_observation_taxon_ids(fixture_con, [555001], [])

        payload = {
            "results": [
                {
                    "id": 555001,
                    "name": "Lasioglossum zonulum",
                    "rank": "species",
                    "ancestors": [
                        {"id": 1, "name": "Animalia", "rank": "kingdom"},
                        {"id": 2, "name": "Apoidea", "rank": "superfamily"},
                        {"id": 3, "name": "Halictidae", "rank": "family"},
                        {"id": 4, "name": "Halictinae", "rank": "subfamily"},
                        {"id": 5, "name": "Halictini", "rank": "tribe"},
                        {"id": 6, "name": "Lasioglossum", "rank": "genus"},
                        {"id": 7, "name": "Dialictus", "rank": "subgenus"},
                    ],
                }
            ]
        }

        monkeypatch.setattr(requests, "get", lambda *a, **k: _StubResponse(payload))
        enrich_taxon_lineage_extended(db_path=fixture_db)

        row = fixture_con.execute("""
            SELECT taxon_id, family, subfamily, tribe, genus, subgenus
            FROM inaturalist_data.taxon_lineage_extended
            WHERE taxon_id = 555001
        """).fetchone()
        assert row == (
            555001, "Halictidae", "Halictinae", "Halictini",
            "Lasioglossum", "Dialictus",
        ), row
    finally:
        _restore_obs_state(fixture_con, snap)


def test_enrich_emits_null_subgenus_not_sentinel(fixture_con, fixture_db, monkeypatch):
    """TAX-03: a taxon whose lineage lacks a subgenus must produce
    `subgenus IS NULL` — NOT a sentinel like '(no subgenus)'."""
    snap = _snapshot_obs_state(fixture_con)
    try:
        _seed_observation_taxon_ids(fixture_con, [555002], [])

        payload = {
            "results": [
                {
                    "id": 555002,
                    "name": "Eucera frater",
                    "rank": "species",
                    "ancestors": [
                        {"id": 10, "name": "Apidae", "rank": "family"},
                        {"id": 11, "name": "Apinae", "rank": "subfamily"},
                        {"id": 12, "name": "Eucerini", "rank": "tribe"},
                        {"id": 13, "name": "Eucera", "rank": "genus"},
                    ],
                }
            ]
        }

        monkeypatch.setattr(requests, "get", lambda *a, **k: _StubResponse(payload))
        enrich_taxon_lineage_extended(db_path=fixture_db)

        row = fixture_con.execute("""
            SELECT family, subfamily, tribe, genus, subgenus
            FROM inaturalist_data.taxon_lineage_extended
            WHERE taxon_id = 555002
        """).fetchone()
        assert row == ("Apidae", "Apinae", "Eucerini", "Eucera", None), row
        # Explicit guard: NULL, not the string "(no subgenus)" or any sentinel.
        assert row[4] is None
    finally:
        _restore_obs_state(fixture_con, snap)


def test_enrich_unions_inat_and_waba_taxa(fixture_con, fixture_db, monkeypatch):
    """D-03: source IDs come from the UNION of inaturalist + waba observations."""
    snap = _snapshot_obs_state(fixture_con)
    try:
        _seed_observation_taxon_ids(fixture_con, [600001], [600002])

        payloads = {
            "600001": {
                "id": 600001, "name": "X", "rank": "species",
                "ancestors": [{"id": 1, "name": "F1", "rank": "family"}],
            },
            "600002": {
                "id": 600002, "name": "Y", "rank": "species",
                "ancestors": [{"id": 2, "name": "F2", "rank": "family"}],
            },
        }

        def fake_get(url, params=None, timeout=None):
            # url is .../v2/taxa/<comma-separated-ids>
            ids_part = url.rsplit("/", 1)[-1]
            results = []
            for tid in ids_part.split(","):
                tid = tid.strip()
                if tid in payloads:
                    results.append(payloads[tid])
            return _StubResponse({"results": results})

        monkeypatch.setattr(requests, "get", fake_get)
        enrich_taxon_lineage_extended(db_path=fixture_db)

        rows = fixture_con.execute(
            "SELECT taxon_id FROM inaturalist_data.taxon_lineage_extended ORDER BY taxon_id"
        ).fetchall()
        taxon_ids = [r[0] for r in rows]
        assert 600001 in taxon_ids and 600002 in taxon_ids, taxon_ids
    finally:
        _restore_obs_state(fixture_con, snap)


def test_enrich_handles_no_taxa(fixture_con, fixture_db, monkeypatch, capsys):
    """Empty source: function must skip cleanly without raising or hitting the network."""
    snap = _snapshot_obs_state(fixture_con)
    try:
        _seed_observation_taxon_ids(fixture_con, [], [])

        called = {"count": 0}

        def should_not_be_called(*a, **k):
            called["count"] += 1
            raise AssertionError("requests.get should not be invoked when no taxa")

        monkeypatch.setattr(requests, "get", should_not_be_called)
        enrich_taxon_lineage_extended(db_path=fixture_db)

        assert called["count"] == 0
        captured = capsys.readouterr()
        assert "all cached" in captured.out or "no taxon IDs found" in captured.out
    finally:
        _restore_obs_state(fixture_con, snap)


def test_enrich_batches_at_30(fixture_con, fixture_db, monkeypatch):
    """batch_size=30 invariant: 60 IDs produces exactly 2 requests.get calls
    and no batch exceeds 30 IDs."""
    snap = _snapshot_obs_state(fixture_con)
    try:
        _seed_observation_taxon_ids(
            fixture_con, list(range(700001, 700061)), [],
        )

        call_count = {"n": 0}

        def fake_get(url, params=None, timeout=None):
            call_count["n"] += 1
            ids_part = url.rsplit("/", 1)[-1].split(",")
            assert len(ids_part) <= 30, f"batch overflow: {len(ids_part)} ids"
            return _StubResponse({
                "results": [
                    {
                        "id": int(tid), "name": f"T{tid}", "rank": "species",
                        "ancestors": [
                            {"id": 99, "name": "Apidae", "rank": "family"},
                        ],
                    }
                    for tid in ids_part
                ]
            })

        monkeypatch.setattr(requests, "get", fake_get)
        enrich_taxon_lineage_extended(db_path=fixture_db)

        assert call_count["n"] == 2, \
            f"expected 2 batches for 60 IDs, got {call_count['n']}"
    finally:
        _restore_obs_state(fixture_con, snap)
