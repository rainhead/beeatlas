"""Wave 0 RED tests for taxa_pipeline — ETag caching and ancestry walk.

Tests cover:
  - test_download_uses_304: conditional GET headers sent + 304 skips file write
  - test_download_writes_sidecar: 200 response writes bytes + sidecar JSON
  - test_lineage_schema: load_taxon_lineage_extended produces 6-col schema
  - test_lineage_null_ranks: absent ranks emit NULL (not empty string)
  - test_lineage_includes_self: genus taxon appears with genus column populated

All HTTP calls are patched via unittest.mock.patch — no live network access.
"""

import gzip
import importlib
import json
from unittest.mock import MagicMock, patch

import duckdb
import pytest

# ---------------------------------------------------------------------------
# Mini TSV fixture — 5 rows: Anthophila superfamily, Apidae family, Bombus
# genus, Bombus melanopygus species, plus one non-Anthophila row to confirm
# filtering.
# ---------------------------------------------------------------------------

MINI_TAXA_TSV = (
    "taxon_id\tancestry\trank_level\trank\tname\tactive\n"
    # Anthophila superfamily (630955) — itself is the scope root
    "630955\t48460/1/47120/372739/47158/184884/47219\t57\tsuperfamily\tAnthophila\ttrue\n"
    # Apidae family — ancestor chain includes 630955
    "52775\t48460/1/47120/372739/47158/184884/47219/630955\t30\tfamily\tApidae\ttrue\n"
    # Bombus genus — ancestor chain includes 630955 and 52775
    "84734\t48460/1/47120/372739/47158/184884/47219/630955/52775\t20\tgenus\tBombus\ttrue\n"
    # Bombus melanopygus species — ancestor chain includes 630955, 52775, 84734
    "52776\t48460/1/47120/372739/47158/184884/47219/630955/52775/84734\t10\tspecies\tBombus melanopygus\ttrue\n"
    # Non-Anthophila row — should be filtered OUT (Vespa vulgaris, a wasp)
    "52850\t48460/1/47120/372739/47158/184884/47221\t10\tspecies\tVespa vulgaris\ttrue\n"
)


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


@pytest.fixture
def mini_taxa_gz(tmp_path):
    """Write MINI_TAXA_TSV as a gzipped file in tmp_path; return the Path."""
    path = tmp_path / "taxa.csv.gz"
    with gzip.open(path, "wb") as f:
        f.write(MINI_TAXA_TSV.encode())
    return path


@pytest.fixture
def taxa_db(tmp_path, monkeypatch):
    """Isolated DuckDB with taxa_pipeline module reloaded against tmp paths.

    - Sets DB_PATH env var to a temp DuckDB
    - Reloads taxa_pipeline so module-level DB_PATH + TAXA_PATH pick up envvar
    - Redirects TAXA_PATH and TAXA_CACHE_PATH to tmp_path
    - Returns (db_path_str, taxa_pipeline_module)
    """
    db_path = str(tmp_path / "taxa.duckdb")
    monkeypatch.setenv("DB_PATH", db_path)
    import taxa_pipeline  # noqa: PLC0415
    importlib.reload(taxa_pipeline)
    monkeypatch.setattr(taxa_pipeline, "TAXA_PATH", tmp_path / "taxa.csv.gz")
    monkeypatch.setattr(taxa_pipeline, "TAXA_CACHE_PATH", tmp_path / "taxa_cache.json")
    return db_path, taxa_pipeline


# ---------------------------------------------------------------------------
# HTTP caching tests (TAX-01)
# ---------------------------------------------------------------------------


def test_download_uses_304(tmp_path, monkeypatch):
    """304 response: conditional headers sent, cached bytes NOT overwritten."""
    import taxa_pipeline  # noqa: PLC0415
    importlib.reload(taxa_pipeline)
    monkeypatch.setattr(taxa_pipeline, "TAXA_PATH", tmp_path / "taxa.csv.gz")
    monkeypatch.setattr(taxa_pipeline, "TAXA_CACHE_PATH", tmp_path / "taxa_cache.json")

    # Pre-create archive + sidecar so the conditional-GET branch fires.
    (tmp_path / "taxa.csv.gz").write_bytes(b"fake")
    (tmp_path / "taxa_cache.json").write_text(
        json.dumps({"etag": "abc", "last_modified": "Mon, 27 Apr 2026 12:48:16 GMT"})
    )

    mock_resp = MagicMock()
    mock_resp.status_code = 304

    with patch("taxa_pipeline.requests.get", return_value=mock_resp) as mock_get:
        taxa_pipeline.download_taxa_csv()

    # Verify If-None-Match and If-Modified-Since were sent.
    _, kwargs = mock_get.call_args
    assert kwargs["headers"]["If-None-Match"] == "abc"
    assert kwargs["headers"]["If-Modified-Since"] == "Mon, 27 Apr 2026 12:48:16 GMT"

    # File must remain unchanged (304 means skip write).
    assert (tmp_path / "taxa.csv.gz").read_bytes() == b"fake"


def test_download_writes_sidecar(tmp_path, monkeypatch):
    """200 response: payload written to TAXA_PATH, sidecar JSON written."""
    import taxa_pipeline  # noqa: PLC0415
    importlib.reload(taxa_pipeline)
    taxa_path = tmp_path / "taxa.csv.gz"
    cache_path = tmp_path / "taxa_cache.json"
    monkeypatch.setattr(taxa_pipeline, "TAXA_PATH", taxa_path)
    monkeypatch.setattr(taxa_pipeline, "TAXA_CACHE_PATH", cache_path)

    # No pre-existing files — fresh download path.
    payload = b"payload"

    mock_resp = MagicMock()
    mock_resp.status_code = 200
    mock_resp.headers = {
        "ETag": "xyz",
        "Last-Modified": "Tue, 28 Apr 2026 00:00:00 GMT",
    }
    mock_resp.iter_content = MagicMock(return_value=[payload])

    with patch("taxa_pipeline.requests.get", return_value=mock_resp):
        taxa_pipeline.download_taxa_csv()

    # Archive file must contain the streamed bytes.
    assert taxa_path.exists()
    assert taxa_path.read_bytes() == payload

    # Sidecar must record ETag and Last-Modified.
    assert cache_path.exists()
    sidecar = json.loads(cache_path.read_text())
    assert sidecar["etag"] == "xyz"
    assert sidecar["last_modified"] == "Tue, 28 Apr 2026 00:00:00 GMT"


# ---------------------------------------------------------------------------
# Ancestry walk tests (TAX-02)
# ---------------------------------------------------------------------------


def test_lineage_schema(tmp_path, monkeypatch, mini_taxa_gz):
    """load_taxon_lineage_extended creates table with 6-column ordered schema."""
    import taxa_pipeline  # noqa: PLC0415
    importlib.reload(taxa_pipeline)
    db_path = str(tmp_path / "test.duckdb")
    monkeypatch.setenv("DB_PATH", db_path)
    importlib.reload(taxa_pipeline)
    monkeypatch.setattr(taxa_pipeline, "TAXA_PATH", mini_taxa_gz)

    # Pre-create inaturalist_data schema (mirrors prod ordering via run.py).
    con = duckdb.connect(db_path)
    con.execute("CREATE SCHEMA inaturalist_data")
    con.close()

    taxa_pipeline.load_taxon_lineage_extended()

    con = duckdb.connect(db_path, read_only=True)
    try:
        cols = [
            row[0]
            for row in con.execute(
                "SELECT column_name FROM information_schema.columns "
                "WHERE table_schema='inaturalist_data' "
                "  AND table_name='taxon_lineage_extended' "
                "ORDER BY ordinal_position"
            ).fetchall()
        ]
    finally:
        con.close()

    assert cols == ["taxon_id", "family", "subfamily", "tribe", "genus", "subgenus"]


def test_lineage_null_ranks(tmp_path, monkeypatch, mini_taxa_gz):
    """Absent ranks emit NULL, not empty string.

    Apidae (52775) is a family — subfamily/tribe/genus/subgenus are NULL.
    Bombus melanopygus (52776) is a species — subfamily/tribe/subgenus are NULL,
    genus is 'Bombus', family is 'Apidae'.
    """
    import taxa_pipeline  # noqa: PLC0415
    importlib.reload(taxa_pipeline)
    db_path = str(tmp_path / "test.duckdb")
    monkeypatch.setenv("DB_PATH", db_path)
    importlib.reload(taxa_pipeline)
    monkeypatch.setattr(taxa_pipeline, "TAXA_PATH", mini_taxa_gz)

    con = duckdb.connect(db_path)
    con.execute("CREATE SCHEMA inaturalist_data")
    con.close()

    taxa_pipeline.load_taxon_lineage_extended()

    con = duckdb.connect(db_path, read_only=True)
    try:
        # Apidae family row (52775): family='Apidae', rest NULL
        apidae_row = con.execute(
            "SELECT taxon_id, family, subfamily, tribe, genus, subgenus "
            "FROM inaturalist_data.taxon_lineage_extended "
            "WHERE taxon_id = 52775"
        ).fetchone()

        # Bombus melanopygus species row (52776)
        melanopygus_row = con.execute(
            "SELECT taxon_id, family, subfamily, tribe, genus, subgenus "
            "FROM inaturalist_data.taxon_lineage_extended "
            "WHERE taxon_id = 52776"
        ).fetchone()
    finally:
        con.close()

    assert apidae_row is not None, "Apidae (52775) must appear in taxon_lineage_extended"
    taxon_id, family, subfamily, tribe, genus, subgenus = apidae_row
    assert taxon_id == 52775
    assert family == "Apidae"
    assert subfamily is None, f"subfamily should be NULL for a family taxon, got {subfamily!r}"
    assert tribe is None, f"tribe should be NULL for a family taxon, got {tribe!r}"
    assert genus is None, f"genus should be NULL for a family taxon, got {genus!r}"
    assert subgenus is None, f"subgenus should be NULL for a family taxon, got {subgenus!r}"

    assert melanopygus_row is not None, "Bombus melanopygus (52776) must appear in taxon_lineage_extended"
    taxon_id, family, subfamily, tribe, genus, subgenus = melanopygus_row
    assert taxon_id == 52776
    assert family == "Apidae"
    assert subfamily is None, f"subfamily should be NULL, got {subfamily!r}"
    assert tribe is None, f"tribe should be NULL, got {tribe!r}"
    assert genus == "Bombus"
    assert subgenus is None, f"subgenus should be NULL, got {subgenus!r}"


def test_lineage_includes_self(tmp_path, monkeypatch, mini_taxa_gz):
    """Bombus genus taxon (84734) appears with genus='Bombus'.

    The ancestry column does NOT include a taxon's own ID, so the implementation
    must UNION ALL the self_rows arm to capture genus/family taxa themselves.
    """
    import taxa_pipeline  # noqa: PLC0415
    importlib.reload(taxa_pipeline)
    db_path = str(tmp_path / "test.duckdb")
    monkeypatch.setenv("DB_PATH", db_path)
    importlib.reload(taxa_pipeline)
    monkeypatch.setattr(taxa_pipeline, "TAXA_PATH", mini_taxa_gz)

    con = duckdb.connect(db_path)
    con.execute("CREATE SCHEMA inaturalist_data")
    con.close()

    taxa_pipeline.load_taxon_lineage_extended()

    con = duckdb.connect(db_path, read_only=True)
    try:
        bombus_row = con.execute(
            "SELECT taxon_id, family, genus "
            "FROM inaturalist_data.taxon_lineage_extended "
            "WHERE taxon_id = 84734"
        ).fetchone()
    finally:
        con.close()

    assert bombus_row is not None, (
        "Bombus genus (84734) must appear in taxon_lineage_extended — "
        "requires UNION ALL self_rows arm since ancestry column omits self"
    )
    taxon_id, family, genus = bombus_row
    assert taxon_id == 84734
    assert genus == "Bombus", f"genus column should be 'Bombus', got {genus!r}"
    assert family == "Apidae", f"family column should be 'Apidae', got {family!r}"
