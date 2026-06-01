"""Phase 127 — unit tests for generate_inactive_remaps() and check_inactive_gate().

Mocks at the inaturalist_pipeline.requests.get boundary (Pattern D);
never patches _inat_get_with_retry directly.

Tests are RED until Task 2 adds generate_inactive_remaps() and check_inactive_gate()
to resolve_taxon_ids.py.
"""
import csv
import gzip
import importlib
from unittest.mock import MagicMock, patch

import duckdb
import pytest

# ---------------------------------------------------------------------------
# Mini TSV fixture — active successor + inactive predecessor
# ---------------------------------------------------------------------------

MINI_TAXA_TSV_WITH_INACTIVE = (
    "taxon_id\tancestry\trank_level\trank\tname\tactive\n"
    # Active successor
    "99001\t48460/1/47120/372739/47158/184884/47219/630955\t10\tspecies\tBombus newspecies\ttrue\n"
    # Inactive predecessor (in bridge)
    "99000\t48460/1/47120/372739/47158/184884/47219/630955\t10\tspecies\tBombus oldspecies\tfalse\n"
)


def _fake_taxon_detail_response(successor_ids: list[int] | None) -> MagicMock:
    """iNat /v1/taxa/{id} response with current_synonymous_taxon_ids."""
    resp = MagicMock()
    resp.status_code = 200
    resp.headers = {}
    resp.raise_for_status = MagicMock()
    resp.json.return_value = {
        "results": [{"current_synonymous_taxon_ids": successor_ids}]
    }
    return resp


@pytest.fixture
def inactive_remap_db(tmp_path, monkeypatch):
    """Isolated DuckDB for inactive-remap tests.

    - Sets DB_PATH to tmp_path/resolver.duckdb
    - Reloads inaturalist_pipeline and resolve_taxon_ids so module-level constants
      pick up the patched environment
    - Monkeypatches _INAT_PACE_SECONDS to 0.0 on both modules
    - Monkeypatches AUTO_SYNONYMS_CSV and INACTIVE_UNRESOLVED_CSV to tmp_path
    - Writes synthetic gzipped taxa.csv.gz at tmp_path/raw/taxa.csv.gz
    - Creates inaturalist_data schema + canonical_to_taxon_id bridge table
    - Pre-seeds bridge with bombus oldspecies -> taxon_id=99000 (inactive)
    Does NOT call resolve_taxon_ids() (Pitfall 4).
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

    # Reroute writeback files to tmp_path so tests are isolated
    monkeypatch.setattr(
        resolve_taxon_ids, "AUTO_SYNONYMS_CSV", tmp_path / "auto_synonyms.csv"
    )
    monkeypatch.setattr(
        resolve_taxon_ids, "INACTIVE_UNRESOLVED_CSV", tmp_path / "inactive_unresolved.csv"
    )

    # Write synthetic taxa.csv.gz at the path generate_inactive_remaps() expects
    raw_dir = tmp_path / "raw"
    raw_dir.mkdir()
    taxa_gz_path = raw_dir / "taxa.csv.gz"
    with gzip.open(taxa_gz_path, "wb") as f:
        f.write(MINI_TAXA_TSV_WITH_INACTIVE.encode())

    # Patch the module's __file__ parent so taxa_path resolves to tmp_path
    monkeypatch.setattr(resolve_taxon_ids, "DB_PATH", db_path)

    # Also patch the Path used inside generate_inactive_remaps by patching the
    # module's __file__ attribute so Path(__file__).parent == tmp_path
    import types
    monkeypatch.setattr(resolve_taxon_ids, "__file__", str(tmp_path / "resolve_taxon_ids.py"))

    # Set up database
    con = duckdb.connect(db_path)
    con.execute("CREATE SCHEMA inaturalist_data")
    con.execute("""
        CREATE TABLE inaturalist_data.canonical_to_taxon_id (
            canonical_name TEXT PRIMARY KEY,
            taxon_id INTEGER,
            resolved_at TIMESTAMP,
            source TEXT
        )
    """)
    # Pre-seed bridge: bombus oldspecies is inactive (taxon_id=99000)
    con.execute("""
        INSERT INTO inaturalist_data.canonical_to_taxon_id
            (canonical_name, taxon_id, resolved_at, source)
        VALUES ('bombus oldspecies', 99000, current_timestamp, 'inat_species')
    """)
    con.close()

    return tmp_path, resolve_taxon_ids


# ---------------------------------------------------------------------------
# ITR-01 — single successor: auto_synonyms.csv row + bridge upsert
# ---------------------------------------------------------------------------


def test_single_successor_writes_auto_synonyms(inactive_remap_db):
    """1-successor response -> auto_synonyms.csv row; bridge has successor entry."""
    tmp_path, mod = inactive_remap_db

    # successor 99001 (Bombus newspecies) is in taxa.csv.gz and active
    response = _fake_taxon_detail_response([99001])

    with patch("inaturalist_pipeline.requests.get", return_value=response):
        mod.generate_inactive_remaps()

    # auto_synonyms.csv must have the (oldspecies -> newspecies) row
    auto_csv = tmp_path / "auto_synonyms.csv"
    assert auto_csv.exists(), "auto_synonyms.csv was not written"
    with auto_csv.open(newline="") as f:
        rows = list(csv.DictReader(f))
    assert len(rows) == 1, f"Expected 1 data row, got {len(rows)}: {rows}"
    assert rows[0]["synonym"] == "bombus oldspecies"
    assert "bombus newspecies" in rows[0]["accepted_name"]
    assert "inat-inactive-remap:99000" in rows[0]["source"]

    # inactive_unresolved.csv must have 0 data rows
    inactive_csv = tmp_path / "inactive_unresolved.csv"
    assert inactive_csv.exists()
    with inactive_csv.open(newline="") as f:
        triage_rows = list(csv.DictReader(f))
    assert len(triage_rows) == 0, f"Expected 0 triage rows, got: {triage_rows}"

    # Bridge must have lower(bombus newspecies) -> 99001
    import duckdb as _duckdb
    con = _duckdb.connect(str(tmp_path / "resolver.duckdb"))
    row = con.execute(
        "SELECT taxon_id, source FROM inaturalist_data.canonical_to_taxon_id "
        "WHERE canonical_name = 'bombus newspecies'"
    ).fetchone()
    con.close()
    assert row is not None, "Bridge missing bombus newspecies entry"
    assert row[0] == 99001
    assert row[1].startswith("inat-inactive-remap:")


# ---------------------------------------------------------------------------
# ITR-01 — zero inactive: header-only auto_synonyms.csv
# ---------------------------------------------------------------------------


def test_zero_inactive_writes_header_only(tmp_path, monkeypatch):
    """Bridge with no inactive taxa -> auto_synonyms.csv with header only (D-04)."""
    db_path = str(tmp_path / "empty.duckdb")
    monkeypatch.setenv("DB_PATH", db_path)

    import inaturalist_pipeline
    importlib.reload(inaturalist_pipeline)
    monkeypatch.setattr(inaturalist_pipeline, "_INAT_PACE_SECONDS", 0.0)
    monkeypatch.setattr(inaturalist_pipeline, "_INAT_BACKOFF_BASE_SECONDS", 0.0)

    import resolve_taxon_ids
    importlib.reload(resolve_taxon_ids)
    monkeypatch.setattr(resolve_taxon_ids, "_INAT_PACE_SECONDS", 0.0)
    monkeypatch.setattr(resolve_taxon_ids, "AUTO_SYNONYMS_CSV", tmp_path / "auto_synonyms.csv")
    monkeypatch.setattr(
        resolve_taxon_ids, "INACTIVE_UNRESOLVED_CSV", tmp_path / "inactive_unresolved.csv"
    )
    monkeypatch.setattr(resolve_taxon_ids, "DB_PATH", db_path)
    monkeypatch.setattr(resolve_taxon_ids, "__file__", str(tmp_path / "resolve_taxon_ids.py"))

    # Write a taxa.csv.gz with only active rows (no inactive)
    raw_dir = tmp_path / "raw"
    raw_dir.mkdir()
    active_only_tsv = (
        "taxon_id\tancestry\trank_level\trank\tname\tactive\n"
        "99001\t48460/1/.../630955\t10\tspecies\tBombus newspecies\ttrue\n"
    )
    with gzip.open(raw_dir / "taxa.csv.gz", "wb") as f:
        f.write(active_only_tsv.encode())

    # Bridge with no inactive entries (bridge has an active taxon only)
    con = duckdb.connect(db_path)
    con.execute("CREATE SCHEMA inaturalist_data")
    con.execute("""
        CREATE TABLE inaturalist_data.canonical_to_taxon_id (
            canonical_name TEXT PRIMARY KEY,
            taxon_id INTEGER,
            resolved_at TIMESTAMP,
            source TEXT
        )
    """)
    con.execute("""
        INSERT INTO inaturalist_data.canonical_to_taxon_id
            (canonical_name, taxon_id, resolved_at, source)
        VALUES ('bombus newspecies', 99001, current_timestamp, 'inat_species')
    """)
    con.close()

    # No API calls expected (no inactive taxa)
    with patch("inaturalist_pipeline.requests.get") as mock_get:
        resolve_taxon_ids.generate_inactive_remaps()

    mock_get.assert_not_called()

    auto_csv = tmp_path / "auto_synonyms.csv"
    assert auto_csv.exists()
    content = auto_csv.read_text()
    # Must have exactly the header line
    lines = [l for l in content.splitlines() if l.strip()]
    assert len(lines) == 1, f"Expected header only, got: {lines}"
    assert lines[0] == "synonym,accepted_name,source"

    inactive_csv = tmp_path / "inactive_unresolved.csv"
    with inactive_csv.open(newline="") as f:
        triage_rows = list(csv.DictReader(f))
    assert len(triage_rows) == 0


# ---------------------------------------------------------------------------
# ITR-02 — zero successors: triage with reason=no_successor
# ---------------------------------------------------------------------------


def test_zero_successors_writes_triage(inactive_remap_db):
    """[] response -> inactive_unresolved.csv row with reason=no_successor."""
    tmp_path, mod = inactive_remap_db

    response = _fake_taxon_detail_response([])  # no successor

    with patch("inaturalist_pipeline.requests.get", return_value=response):
        mod.generate_inactive_remaps()

    inactive_csv = tmp_path / "inactive_unresolved.csv"
    assert inactive_csv.exists()
    with inactive_csv.open(newline="") as f:
        rows = list(csv.DictReader(f))
    assert len(rows) == 1, f"Expected 1 triage row, got {len(rows)}: {rows}"
    assert rows[0]["canonical_name"] == "bombus oldspecies"
    assert rows[0]["reason"] == "no_successor"

    # auto_synonyms.csv must be header-only (D-04)
    auto_csv = tmp_path / "auto_synonyms.csv"
    assert auto_csv.exists()
    content = auto_csv.read_text()
    lines = [l for l in content.splitlines() if l.strip()]
    assert len(lines) == 1
    assert lines[0] == "synonym,accepted_name,source"


# ---------------------------------------------------------------------------
# ITR-02 — split (>=2 successors): triage with reason=split
# ---------------------------------------------------------------------------


def test_split_writes_triage(inactive_remap_db):
    """[id1, id2] response -> inactive_unresolved.csv row with reason=split."""
    tmp_path, mod = inactive_remap_db

    response = _fake_taxon_detail_response([99001, 99002])  # split

    with patch("inaturalist_pipeline.requests.get", return_value=response):
        mod.generate_inactive_remaps()

    inactive_csv = tmp_path / "inactive_unresolved.csv"
    with inactive_csv.open(newline="") as f:
        rows = list(csv.DictReader(f))
    assert len(rows) == 1
    assert rows[0]["reason"] == "split"
    assert rows[0]["canonical_name"] == "bombus oldspecies"


# ---------------------------------------------------------------------------
# ITR-02 — successor not in taxa.csv.gz: triage with reason=successor_not_in_taxa_csv
# ---------------------------------------------------------------------------


def test_successor_not_in_taxa_csv(inactive_remap_db):
    """1-successor response whose successor taxon_id is absent from taxa.csv.gz -> triage."""
    tmp_path, mod = inactive_remap_db

    # 99999 is NOT in MINI_TAXA_TSV_WITH_INACTIVE
    response = _fake_taxon_detail_response([99999])

    with patch("inaturalist_pipeline.requests.get", return_value=response):
        mod.generate_inactive_remaps()

    inactive_csv = tmp_path / "inactive_unresolved.csv"
    with inactive_csv.open(newline="") as f:
        rows = list(csv.DictReader(f))
    assert len(rows) == 1
    assert rows[0]["reason"] == "successor_not_in_taxa_csv"
    assert rows[0]["canonical_name"] == "bombus oldspecies"


# ---------------------------------------------------------------------------
# ITR-02 — inactive gate: blocks on rows
# ---------------------------------------------------------------------------


def test_inactive_gate_blocks(tmp_path, monkeypatch):
    """Rows in INACTIVE_UNRESOLVED_CSV -> check_inactive_gate() raises SystemExit."""
    import resolve_taxon_ids as r
    importlib.reload(r)

    inactive_csv = tmp_path / "inactive_unresolved.csv"
    with inactive_csv.open("w", newline="") as f:
        writer = csv.DictWriter(
            f, fieldnames=["canonical_name", "inactive_taxon_id", "inat_name", "reason", "attempted_at"]
        )
        writer.writeheader()
        writer.writerow({
            "canonical_name": "bombus oldspecies",
            "inactive_taxon_id": "99000",
            "inat_name": "Bombus oldspecies",
            "reason": "no_successor",
            "attempted_at": "2026-05-31T00:00:00",
        })

    monkeypatch.setattr(r, "INACTIVE_UNRESOLVED_CSV", inactive_csv)

    with pytest.raises(SystemExit) as excinfo:
        r.check_inactive_gate()

    assert "bombus oldspecies" in str(excinfo.value), (
        f"Expected offending canonical_name in SystemExit message, got: {excinfo.value!r}"
    )


# ---------------------------------------------------------------------------
# ITR-02 — inactive gate: passes on header-only CSV
# ---------------------------------------------------------------------------


def test_inactive_gate_passes_empty(tmp_path, monkeypatch, capsys):
    """Header-only INACTIVE_UNRESOLVED_CSV -> check_inactive_gate() does not raise."""
    import resolve_taxon_ids as r
    importlib.reload(r)

    inactive_csv = tmp_path / "inactive_unresolved.csv"
    with inactive_csv.open("w", newline="") as f:
        writer = csv.DictWriter(
            f, fieldnames=["canonical_name", "inactive_taxon_id", "inat_name", "reason", "attempted_at"]
        )
        writer.writeheader()

    monkeypatch.setattr(r, "INACTIVE_UNRESOLVED_CSV", inactive_csv)

    # Must not raise
    r.check_inactive_gate()

    captured = capsys.readouterr()
    assert "inactive-gate: OK" in captured.out, (
        f"Expected 'inactive-gate: OK' in stdout, got: {captured.out!r}"
    )
