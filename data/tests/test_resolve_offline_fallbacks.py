"""Offline resolution paths for resolve_taxon_ids.py (debug nightly-resolution-gate).

Covers two fixes that let the nightly resolution-gate clear without API calls:

  Part A — genus fallback: 1-token genus-only names the iNat /v1/taxa search reports
  as ambiguous (bee genera that share a name with an active subgenus, e.g. Bombus,
  Halictus) resolve from a local taxa.csv.gz using the stg_inat__genus_taxon_ids
  filter (rank='genus' AND active AND Animalia ancestry, unique). These names then
  never reach lineage_unresolved.csv, so the resolution-gate reads them as resolved.

  Part C — curated overrides: curator-confirmed canonical_name -> taxon_id rows
  (curated_taxon_ids.csv) UPSERTed into the bridge before the API path. Handles the
  4 binomials/subspecies the API can't resolve (gender variants, subspecies-only,
  junior synonyms) — including the 3-token subspecies case the rank-ladder truncates.

All tests are OFFLINE: requests.get is patched to fail loudly if the genus fallback
path ever issues an API call instead of reading taxa.csv.gz, and the curated path is
asserted to make zero API calls.

Mocks at the requests.get boundary (RESEARCH Pitfall #4); never patches
_inat_get_with_retry directly. Reuses the resolver_db harness shape from
test_resolve_taxon_ids.py.
"""
import csv
import importlib
from pathlib import Path
from unittest.mock import MagicMock, patch

import duckdb
import pytest

FIXTURES_DIR = Path(__file__).parent / "fixtures"
GENUS_TAXA_FIXTURE = FIXTURES_DIR / "taxa_genus_subset.csv.gz"


def _fake_taxa_search_response(results: list[dict]) -> MagicMock:
    resp = MagicMock()
    resp.status_code = 200
    resp.headers = {}
    resp.raise_for_status = MagicMock()
    resp.json.return_value = {"total_results": len(results), "results": results}
    return resp


def _ambiguous_genus_results(genus: str) -> list[dict]:
    """Two active Insecta survivors (genus + same-named subgenus) -> _pick_match None."""
    title = genus.title()
    return [
        {
            "id": 111111,
            "name": title,
            "rank": "genus",
            "is_active": True,
            "matched_term": title,
            "iconic_taxon_name": "Insecta",
        },
        {
            "id": 222222,
            "name": title,
            "rank": "subgenus",
            "is_active": True,
            "matched_term": title,
            "iconic_taxon_name": "Insecta",
        },
    ]


@pytest.fixture
def resolver_db(tmp_path, monkeypatch):
    """Isolated DuckDB with the union-arm tables + bridge, env-patched DB_PATH.

    Reroutes UNRESOLVED_CSV, TAXA_CSV_PATH and CURATED_TAXON_IDS_CSV to test-controlled
    paths so the production writeback files are never touched and each test controls its
    own offline inputs. Returns (db_path, mod).
    """
    db_path = str(tmp_path / "resolver.duckdb")
    monkeypatch.setenv("DB_PATH", db_path)

    import inaturalist_pipeline

    importlib.reload(inaturalist_pipeline)
    monkeypatch.setattr(inaturalist_pipeline, "_INAT_PACE_SECONDS", 0.0)
    monkeypatch.setattr(inaturalist_pipeline, "_INAT_BACKOFF_BASE_SECONDS", 0.0)

    import resolve_taxon_ids

    importlib.reload(resolve_taxon_ids)
    monkeypatch.setattr(resolve_taxon_ids, "_INAT_PACE_SECONDS", 0.0)
    monkeypatch.setattr(
        resolve_taxon_ids, "UNRESOLVED_CSV", tmp_path / "lineage_unresolved.csv"
    )
    # Default: point the genus fallback at the committed genus fixture. Individual tests
    # may override (e.g. to a nonexistent path to assert graceful fall-through).
    monkeypatch.setattr(resolve_taxon_ids, "TAXA_CSV_PATH", GENUS_TAXA_FIXTURE)
    # Default: no curated overrides unless a test writes its own CSV and points here.
    monkeypatch.setattr(
        resolve_taxon_ids, "CURATED_TAXON_IDS_CSV", tmp_path / "curated_taxon_ids.csv"
    )

    con = duckdb.connect(db_path)
    con.execute("CREATE SCHEMA checklist_data")
    con.execute("CREATE SCHEMA ecdysis_data")
    con.execute("CREATE SCHEMA inaturalist_data")
    con.execute("CREATE TABLE checklist_data.species (canonical_name TEXT)")
    con.execute("CREATE TABLE ecdysis_data.occurrences (canonical_name TEXT)")
    con.execute("CREATE SCHEMA inat_obs_data")
    con.execute("CREATE TABLE inat_obs_data.observations (canonical_name TEXT)")
    con.execute("CREATE SCHEMA dbt_sandbox")
    con.execute(
        "CREATE TABLE dbt_sandbox.occurrence_synonyms "
        "(synonym TEXT, accepted_name TEXT, source TEXT)"
    )
    con.execute("CREATE SCHEMA inaturalist_waba_data")
    con.execute("CREATE TABLE inaturalist_waba_data.observations (taxon__name TEXT)")
    con.close()
    return db_path, resolve_taxon_ids


def _bridge_rows(db_path):
    con = duckdb.connect(db_path)
    rows = con.execute(
        "SELECT canonical_name, taxon_id, source FROM "
        "inaturalist_data.canonical_to_taxon_id ORDER BY canonical_name"
    ).fetchall()
    con.close()
    return rows


def _read_unresolved(mod):
    with mod.UNRESOLVED_CSV.open("r", newline="") as f:
        return list(csv.reader(f))


# ---------------------------------------------------------------------------
# Part A — genus fallback from taxa.csv.gz
# ---------------------------------------------------------------------------


def test_ambiguous_genus_resolves_via_taxa_csv(resolver_db):
    """'bombus' is API-ambiguous (genus + same-named subgenus) but resolves offline
    from taxa.csv.gz to the genus self-row taxon_id, source='taxa_csv_genus'. The
    name does NOT land in lineage_unresolved.csv, so the resolution-gate reads it green.
    """
    db_path, mod = resolver_db
    con = duckdb.connect(db_path)
    con.execute("INSERT INTO ecdysis_data.occurrences VALUES ('bombus')")
    con.close()

    # 1-token name → single API call (rank unconstrained), returns ambiguous.
    responses = [_fake_taxa_search_response(_ambiguous_genus_results("bombus"))]
    with patch(
        "inaturalist_pipeline.requests.get", side_effect=responses
    ) as mock_get:
        mod.resolve_taxon_ids()

    assert mock_get.call_count == 1  # API tried once, then offline fallback
    assert _bridge_rows(db_path) == [("bombus", 52775, "taxa_csv_genus")]

    rows = _read_unresolved(mod)
    # Header only — no unresolved data rows.
    assert rows == [["canonical_name", "reason", "attempted_at"]]


def test_genus_fallback_resolves_helper_directly(resolver_db):
    """_resolve_genus_from_taxa_csv returns the unique active Animalia genus taxon_id,
    excludes inactive same-named rows, cross-phylum homonyms, and non-Animalia (plant)
    genera, and returns None for unknown names.
    """
    db_path, mod = resolver_db
    con = duckdb.connect(db_path)
    try:
        assert mod._resolve_genus_from_taxa_csv(con, "bombus") == 52775
        # halictus has an active genus row + an INACTIVE same-named row → active wins, unique.
        assert mod._resolve_genus_from_taxa_csv(con, "halictus") == 57677
        # taracticus is a cross-phylum Animalia homonym (2 distinct active genera) → None.
        assert mod._resolve_genus_from_taxa_csv(con, "taracticus") is None
        # phaceliana is a Plantae genus → excluded by the Animalia(1) ancestry filter.
        assert mod._resolve_genus_from_taxa_csv(con, "phaceliana") is None
        # unknown name → None.
        assert mod._resolve_genus_from_taxa_csv(con, "notagenus") is None
    finally:
        con.close()


def test_genus_fallback_absent_taxa_csv_falls_through(resolver_db, monkeypatch):
    """If taxa.csv.gz is missing, the genus fallback returns None and the name is
    recorded unresolved (reason='ambiguous') rather than raising.
    """
    db_path, mod = resolver_db
    monkeypatch.setattr(mod, "TAXA_CSV_PATH", Path("/nonexistent/taxa.csv.gz"))
    con = duckdb.connect(db_path)
    con.execute("INSERT INTO ecdysis_data.occurrences VALUES ('bombus')")
    con.close()

    responses = [_fake_taxa_search_response(_ambiguous_genus_results("bombus"))]
    with patch("inaturalist_pipeline.requests.get", side_effect=responses):
        mod.resolve_taxon_ids()

    assert _bridge_rows(db_path) == []
    rows = _read_unresolved(mod)
    assert rows[1][0] == "bombus"
    assert rows[1][1] == "ambiguous"


def test_genus_fallback_only_applies_to_one_token_names(resolver_db):
    """A 2-token name that fails both species and genus API arms is NOT rescued by the
    genus-csv fallback (the fallback is genus-only); it lands unresolved.
    """
    db_path, mod = resolver_db
    con = duckdb.connect(db_path)
    # 'bombus zzznonexistent' → species arm 404, genus arm (q='bombus') ambiguous.
    con.execute(
        "INSERT INTO ecdysis_data.occurrences VALUES ('bombus zzznonexistent')"
    )
    con.close()

    responses = [
        _fake_taxa_search_response([]),  # species arm → 0 results
        _fake_taxa_search_response(_ambiguous_genus_results("bombus")),  # genus arm → ambiguous
    ]
    with patch("inaturalist_pipeline.requests.get", side_effect=responses):
        mod.resolve_taxon_ids()

    assert _bridge_rows(db_path) == []
    rows = _read_unresolved(mod)
    assert rows[1][0] == "bombus zzznonexistent"
    assert rows[1][1] == "ambiguous"


# ---------------------------------------------------------------------------
# Part C — curated direct canonical_name -> taxon_id overrides
# ---------------------------------------------------------------------------


def _write_curated(mod, rows):
    with mod.CURATED_TAXON_IDS_CSV.open("w", newline="") as f:
        w = csv.writer(f)
        w.writerow(["canonical_name", "taxon_id", "note"])
        w.writerows(rows)


def test_curated_overrides_bridge_and_skip_api(resolver_db):
    """The 4 curator-confirmed names are UPSERTed into the bridge from the seed and are
    excluded from the API path (b.canonical_name IS NULL filter), so resolve_taxon_ids
    makes ZERO API calls and none of them reach lineage_unresolved.csv. Includes the
    3-token subspecies case (anthidiellum robertsoni) the rank-ladder would truncate.
    """
    db_path, mod = resolver_db
    con = duckdb.connect(db_path)
    con.execute(
        "INSERT INTO ecdysis_data.occurrences VALUES "
        "('lasioglossum aspilurus'), ('lasioglossum heterorhinus'), "
        "('anthidiellum robertsoni'), ('osmia phaceliae')"
    )
    con.close()

    _write_curated(
        mod,
        [
            ("lasioglossum aspilurus", 1339222, "gender variant -us->-um"),
            ("lasioglossum heterorhinus", 271600, "gender variant -us->-um"),
            ("anthidiellum robertsoni", 361496, "subspecies"),
            ("osmia phaceliae", 226676, "junior synonym (Osmia nanula)"),
        ],
    )

    with patch("inaturalist_pipeline.requests.get") as mock_get:
        mod.resolve_taxon_ids()

    assert mock_get.call_count == 0  # all 4 satisfied offline from the curated seed
    assert _bridge_rows(db_path) == [
        ("anthidiellum robertsoni", 361496, "curated"),
        ("lasioglossum aspilurus", 1339222, "curated"),
        ("lasioglossum heterorhinus", 271600, "curated"),
        ("osmia phaceliae", 226676, "curated"),
    ]
    assert _read_unresolved(mod) == [["canonical_name", "reason", "attempted_at"]]


def test_curated_overrides_idempotent(resolver_db):
    """Applying the curated seed twice is a no-op on data (ON CONFLICT update)."""
    db_path, mod = resolver_db
    con = duckdb.connect(db_path)
    con.execute("INSERT INTO ecdysis_data.occurrences VALUES ('osmia phaceliae')")
    con.close()
    _write_curated(mod, [("osmia phaceliae", 226676, "junior synonym")])

    with patch("inaturalist_pipeline.requests.get") as mock_get:
        mod.resolve_taxon_ids()
        mod.resolve_taxon_ids()
    assert mock_get.call_count == 0
    assert _bridge_rows(db_path) == [("osmia phaceliae", 226676, "curated")]


def test_committed_curated_seed_matches_expected_mappings():
    """Pin the committed curated_taxon_ids.csv to the curator-confirmed taxon IDs
    (debug nightly-resolution-gate Part C). Guards against an accidental edit silently
    re-breaking the gate.

    NOTE: exact-match — adding a curator override to the seed (the routine way to
    clear a newly-unresolved bee name) requires adding it here too.
    """
    seed = Path(__file__).parent.parent / "dbt" / "seeds" / "curated_taxon_ids.csv"
    with seed.open(newline="") as f:
        mapping = {
            r["canonical_name"]: int(r["taxon_id"]) for r in csv.DictReader(f)
        }
    assert mapping == {
        "lasioglossum aspilurus": 1339222,
        "lasioglossum heterorhinus": 271600,
        "anthidiellum robertsoni": 361496,
        "osmia phaceliae": 226676,
        "agapostemon angelicus": 270393,
        "andrena candidiformis": 458998,
        "andrena chalybioides": 573383,
        "bombus suckleyi": 452445,
        "epimelissodes obliqua": 1630911,
        "lasioglossum comagenense": 459081,
        "lasioglossum heterorhinum": 271600,
        "lasioglossum pavonotum": 1453119,
        "megachile concinna": 308913,
        "nomada citrina": 1030776,
        "nomada heiligbrodtii": 1447845,
        "nomada kincaidiana": 1588468,
        "nomada rivalis": 1339416,
        "nomada washingtoni": 1339464,
    }
