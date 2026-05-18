"""Tests for inaturalist_pipeline.enrich_taxon_lineage_extended (Phase 76 / Plan 04).

Asserts (TAX-01, TAX-03, D-03):
  - inaturalist_data.taxon_lineage_extended has exactly 6 columns:
    (taxon_id BIGINT PRIMARY KEY, family, subfamily, tribe, genus, subgenus)
  - Source taxon IDs are the DISTINCT NOT NULL UNION of
    inaturalist_data.observations.taxon__id AND
    inaturalist_waba_data.observations.taxon__id
  - NULL is emitted (NOT a sentinel) for ranks absent from the ancestor chain
  - CREATE OR REPLACE semantics — re-running is idempotent
  - When no taxon IDs exist, function prints skip message and returns cleanly
  - TARGET_RANKS is exactly {family, subfamily, tribe, genus, subgenus}
"""

from unittest.mock import patch, MagicMock

import duckdb
import pytest


@pytest.fixture
def lineage_db(tmp_path, monkeypatch):
    """Isolated DuckDB with both observation tables present.

    inaturalist_pipeline reads DB_PATH at module import time; we reload the
    module after patching the env so its DB_PATH constant points at the temp DB.
    """
    db_path = str(tmp_path / "lineage.duckdb")
    monkeypatch.setenv("DB_PATH", db_path)
    import importlib
    import inaturalist_pipeline
    importlib.reload(inaturalist_pipeline)
    # Zero pacing/backoff so multi-batch + retry tests stay fast.
    monkeypatch.setattr(inaturalist_pipeline, "_INAT_PACE_SECONDS", 0.0)
    monkeypatch.setattr(inaturalist_pipeline, "_INAT_BACKOFF_BASE_SECONDS", 0.0)

    con = duckdb.connect(db_path)
    con.execute("CREATE SCHEMA inaturalist_data")
    con.execute("CREATE SCHEMA inaturalist_waba_data")
    con.execute("""
        CREATE TABLE inaturalist_data.observations (
            taxon__id BIGINT
        )
    """)
    con.execute("""
        CREATE TABLE inaturalist_waba_data.observations (
            taxon__id BIGINT
        )
    """)
    con.execute("""
        CREATE TABLE inaturalist_data.canonical_to_taxon_id (
            canonical_name TEXT PRIMARY KEY,
            taxon_id INTEGER,
            resolved_at TIMESTAMP,
            source TEXT
        )
    """)
    con.close()
    return db_path, inaturalist_pipeline


def _fake_inat_response(taxa: list[dict]) -> MagicMock:
    """Build a MagicMock that mimics requests.Response with a results array."""
    resp = MagicMock()
    resp.status_code = 200
    resp.headers = {}
    resp.raise_for_status = MagicMock()
    resp.json.return_value = {"results": taxa}
    return resp


def test_target_ranks_is_exactly_five_target_ranks(lineage_db):
    _, mod = lineage_db
    assert mod.TARGET_RANKS == {"family", "subfamily", "tribe", "genus", "subgenus"}


def test_enrich_creates_table_with_six_columns(lineage_db):
    db_path, mod = lineage_db
    con = duckdb.connect(db_path)
    con.execute("INSERT INTO inaturalist_data.observations VALUES (100001)")
    con.close()

    fake_taxa = [
        {
            "id": 100001,
            "name": "Eucera acerba",
            "rank": "species",
            "ancestors": [
                {"id": 1, "name": "Apidae", "rank": "family"},
                {"id": 2, "name": "Apinae", "rank": "subfamily"},
                {"id": 3, "name": "Eucerini", "rank": "tribe"},
                {"id": 4, "name": "Eucera", "rank": "genus"},
            ],
        }
    ]
    with patch("inaturalist_pipeline.requests.get", return_value=_fake_inat_response(fake_taxa)):
        mod.enrich_taxon_lineage_extended(db_path)

    con = duckdb.connect(db_path, read_only=True)
    try:
        cols = con.execute(
            "SELECT column_name, data_type FROM information_schema.columns "
            "WHERE table_schema='inaturalist_data' AND table_name='taxon_lineage_extended' "
            "ORDER BY ordinal_position"
        ).fetchall()
    finally:
        con.close()

    names = [c[0] for c in cols]
    assert names == ["taxon_id", "family", "subfamily", "tribe", "genus", "subgenus"]
    assert cols[0][1] == "BIGINT"
    for _, dtype in cols[1:]:
        assert dtype == "VARCHAR"


def test_enrich_unions_both_observation_tables(lineage_db):
    db_path, mod = lineage_db
    con = duckdb.connect(db_path)
    # 100001 only in inaturalist_data; 200002 only in waba; 300003 in both; NULL ignored.
    con.execute("INSERT INTO inaturalist_data.observations VALUES (100001), (300003), (NULL)")
    con.execute("INSERT INTO inaturalist_waba_data.observations VALUES (200002), (300003), (NULL)")
    con.close()

    captured_ids: list[str] = []

    def _fake_get(url, params=None, timeout=None):
        # Capture the IDs path segment so we can assert union semantics.
        captured_ids.append(url.rsplit("/", 1)[-1])
        return _fake_inat_response(
            [
                {"id": 100001, "name": "Eucera", "rank": "genus", "ancestors": []},
                {"id": 200002, "name": "Osmia", "rank": "genus", "ancestors": []},
                {"id": 300003, "name": "Bombus", "rank": "genus", "ancestors": []},
            ]
        )

    with patch("inaturalist_pipeline.requests.get", side_effect=_fake_get):
        mod.enrich_taxon_lineage_extended(db_path)

    con = duckdb.connect(db_path, read_only=True)
    try:
        rows = con.execute(
            "SELECT taxon_id FROM inaturalist_data.taxon_lineage_extended ORDER BY taxon_id"
        ).fetchall()
    finally:
        con.close()
    assert [r[0] for r in rows] == [100001, 200002, 300003]

    # Only one batch (3 IDs < batch_size=30); IDs from BOTH source tables present.
    assert len(captured_ids) == 1
    sent_ids = set(captured_ids[0].split(","))
    assert sent_ids == {"100001", "200002", "300003"}


def test_enrich_includes_bridge_taxon_ids(lineage_db):
    """Pitfall #2 regression: a taxon_id present ONLY in the bridge must be walked.

    Without the third UNION arm in enrich_taxon_lineage_extended's source SQL, the
    bridge row is silently ignored and Phase 78 sees ~70% NULL family.
    """
    db_path, mod = lineage_db
    con = duckdb.connect(db_path)
    # 100001 in iNat-project observations only.
    con.execute("INSERT INTO inaturalist_data.observations VALUES (100001)")
    # 200002 in WABA observations only.
    con.execute("INSERT INTO inaturalist_waba_data.observations VALUES (200002)")
    # 300003 in the bridge ONLY — not in either observations table.
    con.execute("""
        INSERT INTO inaturalist_data.canonical_to_taxon_id
            (canonical_name, taxon_id, resolved_at, source)
        VALUES ('unique bee', 300003, current_timestamp, 'inat_species')
    """)
    con.close()

    captured_urls: list[str] = []

    def _fake_get(url, params=None, timeout=None):
        captured_urls.append(url)
        return _fake_inat_response([
            {"id": 100001, "name": "Eucera",  "rank": "genus", "ancestors": []},
            {"id": 200002, "name": "Osmia",   "rank": "genus", "ancestors": []},
            {"id": 300003, "name": "Bombus",  "rank": "genus", "ancestors": []},
        ])

    with patch("inaturalist_pipeline.requests.get", side_effect=_fake_get):
        mod.enrich_taxon_lineage_extended(db_path)

    # The taxa-batch URL is /v2/taxa/<comma-separated-ids>; gather all IDs requested.
    sent_ids: set[str] = set()
    for url in captured_urls:
        ids_path = url.rsplit("/", 1)[-1]
        for chunk in ids_path.split(","):
            sent_ids.add(chunk)
    assert "100001" in sent_ids
    assert "200002" in sent_ids
    assert "300003" in sent_ids, (
        "bridge-only taxon_id was NOT walked — Pitfall #2: enrich_taxon_lineage_extended "
        "source SQL is missing the canonical_to_taxon_id UNION arm"
    )


def test_enrich_emits_null_for_missing_subgenus_no_sentinel(lineage_db):
    """TAX-03: ranks absent from ancestor chain must be NULL, not '(no subgenus)'."""
    db_path, mod = lineage_db
    con = duckdb.connect(db_path)
    con.execute("INSERT INTO inaturalist_data.observations VALUES (555)")
    con.close()

    # Eucera lineage has NO subgenus and NO tribe — must yield NULL on those columns.
    fake_taxa = [
        {
            "id": 555,
            "name": "Eucera acerba",
            "rank": "species",
            "ancestors": [
                {"id": 1, "name": "Apidae", "rank": "family"},
                {"id": 2, "name": "Apinae", "rank": "subfamily"},
                {"id": 4, "name": "Eucera", "rank": "genus"},
            ],
        }
    ]
    with patch("inaturalist_pipeline.requests.get", return_value=_fake_inat_response(fake_taxa)):
        mod.enrich_taxon_lineage_extended(db_path)

    con = duckdb.connect(db_path, read_only=True)
    try:
        row = con.execute(
            "SELECT family, subfamily, tribe, genus, subgenus "
            "FROM inaturalist_data.taxon_lineage_extended WHERE taxon_id = 555"
        ).fetchone()
    finally:
        con.close()
    family, subfamily, tribe, genus, subgenus = row
    assert family == "Apidae"
    assert subfamily == "Apinae"
    assert tribe is None  # NULL, not '(no tribe)'
    assert genus == "Eucera"
    assert subgenus is None  # NULL, not '(no subgenus)'


def test_enrich_taxon_id_is_primary_key(lineage_db):
    db_path, mod = lineage_db
    con = duckdb.connect(db_path)
    con.execute("INSERT INTO inaturalist_data.observations VALUES (777)")
    con.close()

    fake_taxa = [
        {"id": 777, "name": "Bombus", "rank": "genus", "ancestors": [
            {"id": 1, "name": "Apidae", "rank": "family"},
        ]},
    ]
    with patch("inaturalist_pipeline.requests.get", return_value=_fake_inat_response(fake_taxa)):
        mod.enrich_taxon_lineage_extended(db_path)

    con = duckdb.connect(db_path)
    try:
        # PRIMARY KEY rejects duplicate insert.
        with pytest.raises(duckdb.ConstraintException):
            con.execute(
                "INSERT INTO inaturalist_data.taxon_lineage_extended VALUES "
                "(777, 'X', NULL, NULL, NULL, NULL)"
            )
    finally:
        con.close()


def test_enrich_idempotent_create_or_replace(lineage_db):
    db_path, mod = lineage_db
    con = duckdb.connect(db_path)
    con.execute("INSERT INTO inaturalist_data.observations VALUES (999)")
    con.close()

    fake_taxa = [
        {"id": 999, "name": "Andrena", "rank": "genus", "ancestors": [
            {"id": 1, "name": "Andrenidae", "rank": "family"},
        ]},
    ]
    with patch("inaturalist_pipeline.requests.get", return_value=_fake_inat_response(fake_taxa)):
        mod.enrich_taxon_lineage_extended(db_path)
        mod.enrich_taxon_lineage_extended(db_path)  # second call must not raise

    con = duckdb.connect(db_path, read_only=True)
    try:
        n = con.execute("SELECT count(*) FROM inaturalist_data.taxon_lineage_extended").fetchone()[0]
    finally:
        con.close()
    assert n == 1


def test_enrich_skips_when_no_taxon_ids(lineage_db, capsys):
    """No taxon IDs → print skip message, no API call, table exists but is empty."""
    db_path, mod = lineage_db
    # Both observation tables empty.

    with patch("inaturalist_pipeline.requests.get") as mock_get:
        mod.enrich_taxon_lineage_extended(db_path)
        mock_get.assert_not_called()

    captured = capsys.readouterr()
    assert "all cached" in captured.out or "no taxon IDs found" in captured.out

    con = duckdb.connect(db_path, read_only=True)
    try:
        count = con.execute(
            "SELECT count(*) FROM inaturalist_data.taxon_lineage_extended"
        ).fetchone()[0]
    finally:
        con.close()
    assert count == 0


def test_enrich_handles_taxon_whose_own_rank_is_target(lineage_db):
    """If the taxon itself is a genus (no genus ancestor), its own name fills the genus column."""
    db_path, mod = lineage_db
    con = duckdb.connect(db_path)
    con.execute("INSERT INTO inaturalist_data.observations VALUES (42)")
    con.close()

    fake_taxa = [
        {
            "id": 42,
            "name": "Bombus",
            "rank": "genus",
            "ancestors": [
                {"id": 1, "name": "Apidae", "rank": "family"},
            ],
        }
    ]
    with patch("inaturalist_pipeline.requests.get", return_value=_fake_inat_response(fake_taxa)):
        mod.enrich_taxon_lineage_extended(db_path)

    con = duckdb.connect(db_path, read_only=True)
    try:
        row = con.execute(
            "SELECT family, genus, subgenus FROM inaturalist_data.taxon_lineage_extended "
            "WHERE taxon_id = 42"
        ).fetchone()
    finally:
        con.close()
    assert row == ("Apidae", "Bombus", None)


def _throttled_response(status: int = 429, *, retry_after: str | None = None) -> MagicMock:
    """Build a MagicMock requests.Response that raises on raise_for_status()."""
    import requests as _r
    resp = MagicMock()
    resp.status_code = status
    resp.headers = {"Retry-After": retry_after} if retry_after else {}
    err = _r.exceptions.HTTPError(f"{status} for testing", response=resp)
    resp.raise_for_status = MagicMock(side_effect=err)
    return resp


def test_enrich_retries_on_429_then_succeeds(lineage_db):
    """A transient 429 followed by a 200 must succeed without surfacing the error."""
    db_path, mod = lineage_db
    con = duckdb.connect(db_path)
    con.execute("INSERT INTO inaturalist_data.observations VALUES (777)")
    con.close()

    fake_taxa = [{"id": 777, "name": "Bombus", "rank": "genus", "ancestors": []}]
    responses = [
        _throttled_response(429),
        _throttled_response(429),
        _fake_inat_response(fake_taxa),
    ]
    with patch("inaturalist_pipeline.requests.get", side_effect=responses) as mock_get:
        mod.enrich_taxon_lineage_extended(db_path)

    assert mock_get.call_count == 3

    con = duckdb.connect(db_path, read_only=True)
    try:
        n = con.execute("SELECT count(*) FROM inaturalist_data.taxon_lineage_extended").fetchone()[0]
    finally:
        con.close()
    assert n == 1


def test_enrich_retries_on_5xx_then_succeeds(lineage_db):
    """500/502/503/504 must also retry (treated identically to 429)."""
    db_path, mod = lineage_db
    con = duckdb.connect(db_path)
    con.execute("INSERT INTO inaturalist_data.observations VALUES (888)")
    con.close()

    fake_taxa = [{"id": 888, "name": "Apis", "rank": "genus", "ancestors": []}]
    responses = [_throttled_response(503), _fake_inat_response(fake_taxa)]
    with patch("inaturalist_pipeline.requests.get", side_effect=responses) as mock_get:
        mod.enrich_taxon_lineage_extended(db_path)
    assert mock_get.call_count == 2


def test_enrich_raises_after_exhausting_retries(lineage_db):
    """Persistent 429 must surface as HTTPError after _INAT_MAX_RETRIES + 1 attempts."""
    import requests as _r
    db_path, mod = lineage_db
    con = duckdb.connect(db_path)
    con.execute("INSERT INTO inaturalist_data.observations VALUES (999)")
    con.close()

    # Always-throttled response.
    with patch(
        "inaturalist_pipeline.requests.get",
        return_value=_throttled_response(429),
    ) as mock_get:
        with pytest.raises(_r.exceptions.HTTPError):
            mod.enrich_taxon_lineage_extended(db_path)
    # 1 initial + _INAT_MAX_RETRIES retries
    assert mock_get.call_count == mod._INAT_MAX_RETRIES + 1


def test_enrich_honors_retry_after_header(lineage_db, monkeypatch):
    """If Retry-After is larger than exponential backoff, helper sleeps for the header value."""
    db_path, mod = lineage_db
    con = duckdb.connect(db_path)
    con.execute("INSERT INTO inaturalist_data.observations VALUES (111)")
    con.close()

    # Restore a non-zero base so the header has something larger to overrule.
    monkeypatch.setattr(mod, "_INAT_BACKOFF_BASE_SECONDS", 0.001)
    sleeps: list[float] = []
    monkeypatch.setattr(mod.time, "sleep", lambda s: sleeps.append(s))

    fake_taxa = [{"id": 111, "name": "Andrena", "rank": "genus", "ancestors": []}]
    responses = [_throttled_response(429, retry_after="7"), _fake_inat_response(fake_taxa)]
    with patch("inaturalist_pipeline.requests.get", side_effect=responses):
        mod.enrich_taxon_lineage_extended(db_path)

    assert 7.0 in sleeps  # header value, not the 0.001 exponential value
