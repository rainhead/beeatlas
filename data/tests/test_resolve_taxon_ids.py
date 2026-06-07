"""Phase 77 — unit tests for data/resolve_taxon_ids.py.

Mocks at the requests.get boundary (Pattern D / RESEARCH Pitfall #4); never patches
_inat_get_with_retry directly.
"""
import csv
import importlib
from unittest.mock import MagicMock, patch

import duckdb
import pytest


def _fake_taxa_search_response(results: list[dict]) -> MagicMock:
    """iNat /v1/taxa search response with total_results auto-derived from results length."""
    resp = MagicMock()
    resp.status_code = 200
    resp.headers = {}
    resp.raise_for_status = MagicMock()
    resp.json.return_value = {"total_results": len(results), "results": results}
    return resp


def _throttled_response(status: int = 429, *, retry_after: str | None = None) -> MagicMock:
    """Copied verbatim from test_taxon_lineage_extended.py:289-297."""
    import requests as _r

    resp = MagicMock()
    resp.status_code = status
    resp.headers = {"Retry-After": retry_after} if retry_after else {}
    err = _r.exceptions.HTTPError(f"{status} for testing", response=resp)
    resp.raise_for_status = MagicMock(side_effect=err)
    return resp


def _matching_taxon(taxon_id: int, name: str, *, rank: str = "species") -> dict:
    """Build an iNat result dict that passes the D-02 filter ladder for query `name`."""
    return {
        "id": taxon_id,
        "name": name,
        "rank": rank,
        "is_active": True,
        "matched_term": name,
        "iconic_taxon_name": "Insecta",
    }


@pytest.fixture
def resolver_db(tmp_path, monkeypatch):
    """Isolated DuckDB with checklist_data.species, ecdysis_data.occurrences, bridge.

    Reloads inaturalist_pipeline and resolve_taxon_ids so module-level DB_PATH and
    _INAT_PACE_SECONDS pick up the patched env. Returns (db_path, mod) for tests
    to invoke resolve_taxon_ids.resolve_taxon_ids(...).
    """
    db_path = str(tmp_path / "resolver.duckdb")
    monkeypatch.setenv("DB_PATH", db_path)

    import inaturalist_pipeline

    importlib.reload(inaturalist_pipeline)
    monkeypatch.setattr(inaturalist_pipeline, "_INAT_PACE_SECONDS", 0.0)
    monkeypatch.setattr(inaturalist_pipeline, "_INAT_BACKOFF_BASE_SECONDS", 0.0)

    import resolve_taxon_ids

    importlib.reload(resolve_taxon_ids)
    # `from inaturalist_pipeline import _INAT_PACE_SECONDS` snapshots the value at
    # import — patch the local binding too (RESEARCH Assumption A4).
    monkeypatch.setattr(resolve_taxon_ids, "_INAT_PACE_SECONDS", 0.0)
    # Reroute UNRESOLVED_CSV to tmp_path so each test gets a clean file and the
    # production data/lineage_unresolved.csv is never touched by tests.
    monkeypatch.setattr(
        resolve_taxon_ids, "UNRESOLVED_CSV", tmp_path / "lineage_unresolved.csv"
    )
    # debug nightly-resolution-gate: the resolver now consults two offline inputs
    # (curated_taxon_ids.csv overrides + taxa.csv.gz genus fallback). Reroute both to
    # nonexistent paths so these legacy API-path tests stay hermetic — they assert the
    # pure iNat-API behavior and must not pick up the committed curated seed or the real
    # taxa dump. Tests for the offline paths live in test_resolve_offline_fallbacks.py.
    from pathlib import Path as _Path  # noqa: PLC0415
    monkeypatch.setattr(
        resolve_taxon_ids, "CURATED_TAXON_IDS_CSV", _Path("/nonexistent/curated_taxon_ids.csv")
    )
    monkeypatch.setattr(
        resolve_taxon_ids, "TAXA_CSV_PATH", _Path("/nonexistent/taxa.csv.gz")
    )

    con = duckdb.connect(db_path)
    con.execute("CREATE SCHEMA checklist_data")
    con.execute("CREATE SCHEMA ecdysis_data")
    con.execute("CREATE SCHEMA inaturalist_data")
    con.execute("CREATE TABLE checklist_data.species (canonical_name TEXT)")
    con.execute("CREATE TABLE ecdysis_data.occurrences (canonical_name TEXT)")
    con.execute("CREATE SCHEMA inat_obs_data")
    con.execute("CREATE TABLE inat_obs_data.observations (canonical_name TEXT)")
    # D-06: Two UNION-arm tables missing from the original fixture — their absence caused
    # CatalogException: schema "dbt_sandbox" does not exist on every test.
    # Empty tables are correct: each UNION arm returns 0 rows in isolation, which is the
    # expected state for these unit tests (the seeded names come from checklist_data.species).
    con.execute("CREATE SCHEMA dbt_sandbox")
    con.execute(
        "CREATE TABLE dbt_sandbox.occurrence_synonyms "
        "(synonym TEXT, accepted_name TEXT, source TEXT)"
    )
    con.execute("CREATE SCHEMA inaturalist_waba_data")
    con.execute(
        "CREATE TABLE inaturalist_waba_data.observations (taxon__name TEXT)"
    )
    # Bridge created lazily by resolve_taxon_ids via CREATE TABLE IF NOT EXISTS.
    con.close()
    return db_path, resolve_taxon_ids


def _read_unresolved_rows(mod) -> list[list[str]]:
    """Return all rows (header + data) from the test-rerouted UNRESOLVED_CSV."""
    with mod.UNRESOLVED_CSV.open("r", newline="") as f:
        return list(csv.reader(f))


# ---------------------------------------------------------------------------
# LIN-01 — cold start + union shape
# ---------------------------------------------------------------------------


def test_cold_start_resolves_all_seeded_names(resolver_db):
    db_path, mod = resolver_db
    con = duckdb.connect(db_path)
    con.execute(
        "INSERT INTO checklist_data.species VALUES ('bombus impatiens'), ('osmia lignaria')"
    )
    con.execute("INSERT INTO ecdysis_data.occurrences VALUES ('apis mellifera')")
    con.close()

    # Names are queried in alphabetical order: apis, bombus, osmia.
    responses = [
        _fake_taxa_search_response([_matching_taxon(118970, "apis mellifera")]),
        _fake_taxa_search_response([_matching_taxon(52775, "bombus impatiens")]),
        _fake_taxa_search_response([_matching_taxon(57704, "osmia lignaria")]),
    ]
    with patch(
        "inaturalist_pipeline.requests.get", side_effect=responses
    ) as mock_get:
        mod.resolve_taxon_ids()

    con = duckdb.connect(db_path)
    rows = con.execute(
        "SELECT canonical_name, taxon_id, source FROM "
        "inaturalist_data.canonical_to_taxon_id ORDER BY canonical_name"
    ).fetchall()
    con.close()
    assert len(rows) == 3
    assert {r[0] for r in rows} == {
        "apis mellifera",
        "bombus impatiens",
        "osmia lignaria",
    }
    assert all(r[2] == "inat_species" for r in rows)
    assert mock_get.call_count == 3


def test_names_to_resolve_unions_both_sources(resolver_db):
    db_path, mod = resolver_db
    con = duckdb.connect(db_path)
    # A in checklist only, B in occurrences only, C in both.
    con.execute(
        "INSERT INTO checklist_data.species VALUES ('aaa species'), ('ccc species')"
    )
    con.execute(
        "INSERT INTO ecdysis_data.occurrences VALUES "
        "('bbb species'), ('ccc species'), ('ccc species')"
    )
    con.close()

    responses = [
        _fake_taxa_search_response([_matching_taxon(1, "aaa species")]),
        _fake_taxa_search_response([_matching_taxon(2, "bbb species")]),
        _fake_taxa_search_response([_matching_taxon(3, "ccc species")]),
    ]
    with patch(
        "inaturalist_pipeline.requests.get", side_effect=responses
    ) as mock_get:
        mod.resolve_taxon_ids()

    # 3 distinct names → 3 calls (NOT 4 — duplicates collapsed by UNION).
    assert mock_get.call_count == 3
    queries = [c.kwargs["params"]["q"] for c in mock_get.call_args_list]
    assert sorted(queries) == ["aaa species", "bbb species", "ccc species"]


# ---------------------------------------------------------------------------
# LIN-02 — pacing, retry on 429/5xx, persistent failure → api_error
# ---------------------------------------------------------------------------


def test_pacing_sleep_called_per_request(resolver_db, monkeypatch):
    db_path, mod = resolver_db
    con = duckdb.connect(db_path)
    con.execute(
        "INSERT INTO checklist_data.species VALUES "
        "('one species'), ('two species'), ('three species')"
    )
    con.close()

    sleep_mock = MagicMock()
    monkeypatch.setattr(mod.time, "sleep", sleep_mock)

    responses = [
        _fake_taxa_search_response([_matching_taxon(10, "one species")]),
        _fake_taxa_search_response([_matching_taxon(20, "three species")]),
        _fake_taxa_search_response([_matching_taxon(30, "two species")]),
    ]
    with patch("inaturalist_pipeline.requests.get", side_effect=responses):
        mod.resolve_taxon_ids()

    # Pacing sleep happens once per resolve attempt (3 names, all resolve on first call).
    assert sleep_mock.call_count >= 3


def test_retry_on_429_then_succeeds(resolver_db):
    db_path, mod = resolver_db
    con = duckdb.connect(db_path)
    con.execute("INSERT INTO checklist_data.species VALUES ('bombus impatiens')")
    con.close()

    responses = [
        _throttled_response(429, retry_after="0"),
        _fake_taxa_search_response([_matching_taxon(52775, "bombus impatiens")]),
    ]
    with patch(
        "inaturalist_pipeline.requests.get", side_effect=responses
    ) as mock_get:
        mod.resolve_taxon_ids()

    con = duckdb.connect(db_path)
    rows = con.execute(
        "SELECT canonical_name, taxon_id FROM inaturalist_data.canonical_to_taxon_id"
    ).fetchall()
    con.close()
    assert rows == [("bombus impatiens", 52775)]
    assert mock_get.call_count == 2


def test_retry_on_5xx_then_succeeds(resolver_db):
    db_path, mod = resolver_db
    con = duckdb.connect(db_path)
    con.execute("INSERT INTO checklist_data.species VALUES ('osmia lignaria')")
    con.close()

    responses = [
        _throttled_response(503),
        _fake_taxa_search_response([_matching_taxon(57704, "osmia lignaria")]),
    ]
    with patch(
        "inaturalist_pipeline.requests.get", side_effect=responses
    ) as mock_get:
        mod.resolve_taxon_ids()

    con = duckdb.connect(db_path)
    rows = con.execute(
        "SELECT canonical_name, taxon_id FROM inaturalist_data.canonical_to_taxon_id"
    ).fetchall()
    con.close()
    assert rows == [("osmia lignaria", 57704)]
    assert mock_get.call_count == 2


def test_persistent_429_records_api_error(resolver_db):
    db_path, mod = resolver_db
    con = duckdb.connect(db_path)
    con.execute("INSERT INTO checklist_data.species VALUES ('foo bar')")
    con.close()

    # _INAT_MAX_RETRIES = 5 → 6 attempts each call. 2-token rank ladder has 2 calls
    # (species, then genus fallback). Provide 12 throttled responses to exhaust both.
    import inaturalist_pipeline

    n_attempts = (inaturalist_pipeline._INAT_MAX_RETRIES + 1) * 2
    responses = [_throttled_response(429, retry_after="0") for _ in range(n_attempts)]
    with patch("inaturalist_pipeline.requests.get", side_effect=responses):
        mod.resolve_taxon_ids()

    con = duckdb.connect(db_path)
    bridge = con.execute(
        "SELECT count(*) FROM inaturalist_data.canonical_to_taxon_id"
    ).fetchone()[0]
    con.close()
    assert bridge == 0

    rows = _read_unresolved_rows(mod)
    assert rows[0] == ["canonical_name", "reason", "attempted_at"]
    assert len(rows) == 2
    assert rows[1][0] == "foo bar"
    assert rows[1][1] == "api_error"


# ---------------------------------------------------------------------------
# LIN-03 — bridge is the cache; idempotent; refresh retries only failures
# ---------------------------------------------------------------------------


def test_second_run_makes_no_api_calls(resolver_db):
    db_path, mod = resolver_db
    con = duckdb.connect(db_path)
    con.execute(
        "INSERT INTO checklist_data.species VALUES ('alpha species'), ('beta species')"
    )
    con.close()

    first_run_responses = [
        _fake_taxa_search_response([_matching_taxon(1, "alpha species")]),
        _fake_taxa_search_response([_matching_taxon(2, "beta species")]),
    ]
    with patch("inaturalist_pipeline.requests.get", side_effect=first_run_responses):
        mod.resolve_taxon_ids()

    # Second run — patch with a fresh mock; observe call_count within this scope.
    with patch("inaturalist_pipeline.requests.get") as second_mock:
        mod.resolve_taxon_ids()
    assert second_mock.call_count == 0


def test_refresh_retries_only_failures(resolver_db):
    db_path, mod = resolver_db
    con = duckdb.connect(db_path)
    con.execute(
        "INSERT INTO checklist_data.species VALUES "
        "('osmia lignaria'), ('bombus impatiens')"
    )
    # Pre-seed bridge with osmia lignaria already resolved.
    mod._ensure_bridge_table(con)
    con.execute(
        """
        INSERT INTO inaturalist_data.canonical_to_taxon_id
            (canonical_name, taxon_id, resolved_at, source)
        VALUES ('osmia lignaria', 57704, current_timestamp, 'inat_species')
        """
    )
    con.close()

    # Pre-seed unresolved CSV with the previously-failed name.
    with mod.UNRESOLVED_CSV.open("w", newline="") as f:
        w = csv.writer(f)
        w.writerow(["canonical_name", "reason", "attempted_at"])
        w.writerow(["bombus impatiens", "404", "2026-05-03T00:00:00"])

    responses = [_fake_taxa_search_response([_matching_taxon(52775, "bombus impatiens")])]
    with patch(
        "inaturalist_pipeline.requests.get", side_effect=responses
    ) as mock_get:
        mod.resolve_taxon_ids(refresh=True)

    # Only the previously-failed name was retried.
    assert mock_get.call_count == 1
    con = duckdb.connect(db_path)
    rows = con.execute(
        "SELECT canonical_name, taxon_id FROM "
        "inaturalist_data.canonical_to_taxon_id ORDER BY canonical_name"
    ).fetchall()
    con.close()
    assert rows == [("bombus impatiens", 52775), ("osmia lignaria", 57704)]


# ---------------------------------------------------------------------------
# LIN-04 — CSV reasons (404, ambiguous, api_error) and schema
# ---------------------------------------------------------------------------


def test_unknown_name_writes_404_row(resolver_db):
    db_path, mod = resolver_db
    con = duckdb.connect(db_path)
    con.execute("INSERT INTO checklist_data.species VALUES ('zzzzz nonexistensia')")
    con.close()

    # Pitfall #5: iNat 404s are signaled by total_results == 0 (HTTP 200), NOT
    # an HTTP 404 status. _fake_taxa_search_response([]) yields total_results: 0.
    responses = [_fake_taxa_search_response([]), _fake_taxa_search_response([])]
    with patch("inaturalist_pipeline.requests.get", side_effect=responses):
        mod.resolve_taxon_ids()

    con = duckdb.connect(db_path)
    bridge_count = con.execute(
        "SELECT count(*) FROM inaturalist_data.canonical_to_taxon_id"
    ).fetchone()[0]
    con.close()
    assert bridge_count == 0

    rows = _read_unresolved_rows(mod)
    assert rows[0] == ["canonical_name", "reason", "attempted_at"]
    assert rows[1][0] == "zzzzz nonexistensia"
    assert rows[1][1] == "404"
    # ISO 8601 timestamp present.
    assert "T" in rows[1][2]


def test_ambiguous_match_writes_ambiguous_row(resolver_db):
    db_path, mod = resolver_db
    con = duckdb.connect(db_path)
    con.execute("INSERT INTO checklist_data.species VALUES ('andrena fulva')")
    con.close()

    # Three results, none with name OR matched_term matching 'andrena fulva' exactly.
    sibling = lambda tid, n: {
        "id": tid,
        "name": n,
        "rank": "species",
        "is_active": True,
        "matched_term": n,
        "iconic_taxon_name": "Insecta",
    }
    species_results = [
        sibling(484511, "Andrena fulvago"),
        sibling(433153, "Andrena fulvata"),
        sibling(900001, "Andrena fulvescens"),
    ]
    # Genus fallback to 'andrena' — also ambiguous (no exact match either).
    genus_results = [
        sibling(48157, "Andrena"),
        sibling(900002, "Andrenax"),
    ]
    # Force genus fallback ambiguity by stripping name match: neither name nor
    # matched_term equals 'andrena' on the survivors. Build a pure-non-match list.
    genus_results = [sibling(900003, "Andrenax"), sibling(900004, "Andreneza")]
    responses = [
        _fake_taxa_search_response(species_results),
        _fake_taxa_search_response(genus_results),
    ]
    with patch("inaturalist_pipeline.requests.get", side_effect=responses):
        mod.resolve_taxon_ids()

    rows = _read_unresolved_rows(mod)
    assert rows[1][0] == "andrena fulva"
    assert rows[1][1] == "ambiguous"


def test_api_error_writes_api_error_row(resolver_db):
    db_path, mod = resolver_db
    con = duckdb.connect(db_path)
    con.execute("INSERT INTO checklist_data.species VALUES ('foo bar')")
    con.close()

    import inaturalist_pipeline

    n_attempts = (inaturalist_pipeline._INAT_MAX_RETRIES + 1) * 2
    responses = [_throttled_response(429, retry_after="0") for _ in range(n_attempts)]
    with patch("inaturalist_pipeline.requests.get", side_effect=responses):
        mod.resolve_taxon_ids()

    rows = _read_unresolved_rows(mod)
    assert rows[1][1] == "api_error"


def test_unresolved_csv_schema(resolver_db):
    db_path, mod = resolver_db
    con = duckdb.connect(db_path)
    con.execute("INSERT INTO checklist_data.species VALUES ('zzzzz nonexistensia')")
    con.close()

    responses = [_fake_taxa_search_response([]), _fake_taxa_search_response([])]
    with patch("inaturalist_pipeline.requests.get", side_effect=responses):
        mod.resolve_taxon_ids()

    rows = _read_unresolved_rows(mod)
    assert rows[0] == ["canonical_name", "reason", "attempted_at"]


# ---------------------------------------------------------------------------
# D-02 — _pick_match (matched_term synonym path, exact-name disambiguation)
# ---------------------------------------------------------------------------


def test_pick_match_uses_matched_term_for_synonym():
    import resolve_taxon_ids

    importlib.reload(resolve_taxon_ids)
    results = [
        {
            "id": 1453118,
            "name": "Lasioglossum zonulus",
            "rank": "species",
            "is_active": True,
            "matched_term": "Lasioglossum zonulum",
            "iconic_taxon_name": "Insecta",
        }
    ]
    pick = resolve_taxon_ids._pick_match(results, "lasioglossum zonulum", "species")
    assert pick is not None
    assert pick["id"] == 1453118


def test_pick_match_filters_to_exact_name():
    import resolve_taxon_ids

    importlib.reload(resolve_taxon_ids)
    results = [
        {
            "id": 60579,
            "name": "Andrena fulva",
            "rank": "species",
            "is_active": True,
            "matched_term": "Andrena fulva",
            "iconic_taxon_name": "Insecta",
        },
        {
            "id": 484511,
            "name": "Andrena fulvago",
            "rank": "species",
            "is_active": True,
            "matched_term": "Andrena fulvago",
            "iconic_taxon_name": "Insecta",
        },
        {
            "id": 433153,
            "name": "Andrena fulvata",
            "rank": "species",
            "is_active": True,
            "matched_term": "Andrena fulvata",
            "iconic_taxon_name": "Insecta",
        },
    ]
    pick = resolve_taxon_ids._pick_match(results, "andrena fulva", "species")
    assert pick is not None
    assert pick["id"] == 60579


# ---------------------------------------------------------------------------
# D-03 — rank-ladder behavior (1-token genus, 2-token species → genus fallback)
# ---------------------------------------------------------------------------


def test_one_token_query_omits_rank_and_records_response_rank(resolver_db):
    """Single-token names query iNat without a rank constraint; the bridge
    `source` column reflects the rank returned by the API (so a family-level
    canonical like 'apidae' lands as 'inat_family', not 'inat_genus')."""
    db_path, mod = resolver_db
    con = duckdb.connect(db_path)
    con.execute("INSERT INTO checklist_data.species VALUES ('apidae')")
    con.close()

    responses = [
        _fake_taxa_search_response(
            [_matching_taxon(47221, "Apidae", rank="family")]
        )
    ]
    with patch(
        "inaturalist_pipeline.requests.get", side_effect=responses
    ) as mock_get:
        mod.resolve_taxon_ids()

    assert mock_get.call_count == 1
    params = mock_get.call_args_list[0].kwargs["params"]
    assert "rank" not in params
    assert params["q"] == "apidae"

    con = duckdb.connect(db_path)
    rows = con.execute(
        "SELECT canonical_name, taxon_id, source FROM "
        "inaturalist_data.canonical_to_taxon_id"
    ).fetchall()
    con.close()
    assert rows == [("apidae", 47221, "inat_family")]


def test_species_404_falls_back_to_genus(resolver_db):
    db_path, mod = resolver_db
    con = duckdb.connect(db_path)
    con.execute("INSERT INTO checklist_data.species VALUES ('andrena nigrocaerulea')")
    con.close()

    responses = [
        _fake_taxa_search_response([]),  # rank=species → 0 results
        _fake_taxa_search_response(
            [_matching_taxon(48157, "andrena", rank="genus")]
        ),
    ]
    with patch(
        "inaturalist_pipeline.requests.get", side_effect=responses
    ) as mock_get:
        mod.resolve_taxon_ids()

    assert mock_get.call_count == 2
    # Second call is the genus-fallback: rank-unconstrained, q=tokens[0].
    second_params = mock_get.call_args_list[1].kwargs["params"]
    assert "rank" not in second_params
    assert second_params["q"] == "andrena"

    con = duckdb.connect(db_path)
    rows = con.execute(
        "SELECT canonical_name, taxon_id, source FROM "
        "inaturalist_data.canonical_to_taxon_id"
    ).fetchall()
    con.close()
    assert rows == [("andrena nigrocaerulea", 48157, "inat_genus")]


# ---------------------------------------------------------------------------
# Pitfall #6 — bridge `source` column distinguishes species vs genus resolution
# ---------------------------------------------------------------------------


def test_bridge_source_distinguishes_rank(resolver_db):
    db_path, mod = resolver_db
    con = duckdb.connect(db_path)
    # 'apis mellifera' resolves at species rank; 'andrena nigrocaerulea' falls
    # back to genus.
    con.execute(
        "INSERT INTO checklist_data.species VALUES "
        "('apis mellifera'), ('andrena nigrocaerulea')"
    )
    con.close()

    # Names queried alphabetically: 'andrena nigrocaerulea' first
    # (species 0 results → genus match), then 'apis mellifera' (species match).
    responses = [
        _fake_taxa_search_response([]),  # andrena nigrocaerulea @ species → 0
        _fake_taxa_search_response(
            [_matching_taxon(48157, "andrena", rank="genus")]
        ),  # andrena @ genus → match
        _fake_taxa_search_response(
            [_matching_taxon(118970, "apis mellifera")]
        ),  # apis mellifera @ species → match
    ]
    with patch("inaturalist_pipeline.requests.get", side_effect=responses):
        mod.resolve_taxon_ids()

    con = duckdb.connect(db_path)
    rows = con.execute(
        "SELECT canonical_name, source FROM "
        "inaturalist_data.canonical_to_taxon_id ORDER BY canonical_name"
    ).fetchall()
    con.close()
    assert rows == [
        ("andrena nigrocaerulea", "inat_genus"),
        ("apis mellifera", "inat_species"),
    ]


def test_names_to_resolve_includes_inat_obs_source(resolver_db):
    db_path, mod = resolver_db
    con = duckdb.connect(db_path)
    # No rows in checklist_data.species or ecdysis_data.occurrences.
    # Only inat_obs_data.observations has a name.
    con.execute("INSERT INTO inat_obs_data.observations VALUES ('ddd species')")
    con.close()

    responses = [
        _fake_taxa_search_response([_matching_taxon(4, "ddd species")]),
    ]
    with patch(
        "inaturalist_pipeline.requests.get", side_effect=responses
    ) as mock_get:
        mod.resolve_taxon_ids()

    assert mock_get.call_count == 1
    queries = [c.kwargs["params"]["q"] for c in mock_get.call_args_list]
    assert queries == ["ddd species"]


def test_lineage_coverage_threshold(fixture_con):
    """LIN-05: ≥95% of FULL OUTER union species have non-NULL family via taxon_lineage_extended.

    Asserts the SQL gate that Phase 78 (Pipeline Outputs) depends on. The Plan 01
    fixture in conftest.py seeds 20 canonical_names with 19 mapped to non-NULL family
    (= 0.95 exactly); this test pins that ratio.
    """
    coverage = fixture_con.execute("""
        SELECT
            count(*) FILTER (WHERE tle.family IS NOT NULL) * 1.0 / count(*)
        FROM (
            SELECT DISTINCT canonical_name FROM checklist_data.species
            WHERE canonical_name IS NOT NULL
            UNION
            SELECT DISTINCT canonical_name FROM ecdysis_data.occurrences
            WHERE canonical_name IS NOT NULL
        ) u
        LEFT JOIN inaturalist_data.canonical_to_taxon_id b USING (canonical_name)
        LEFT JOIN inaturalist_data.taxon_lineage_extended tle ON tle.taxon_id = b.taxon_id
    """).fetchone()[0]

    assert coverage >= 0.95, (
        f"LIN-05 threshold not met: {coverage:.3f} < 0.95. "
        "Check the Plan 01 fixture in conftest.py — 19/20 canonical_names "
        "must resolve to a taxon_lineage_extended row with non-NULL family."
    )
