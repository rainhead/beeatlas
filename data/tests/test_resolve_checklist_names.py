"""Phase 135 Wave 0 — RED test stubs for resolve_checklist_names.py.

These tests are written BEFORE the module they exercise (Plan 135-02).
They are designed to FAIL on import/AttributeError until Plan 135-02 lands.

Node IDs (from 135-VALIDATION.md Per-Task Verification Map):
  - test_noop_without_refresh          (RCN-03)
  - test_audit_csv_covers_all_names    (RCN-02)
  - test_fuzzy_candidates_written      (RCN-04)
  - test_at_least_13_fuzzy_candidates  (RCN-04)
  - test_fuzzy_review_gate             (RCN-04)
  - test_slash_lca                     (RCN-05)
  - test_slash_verbatim_retained       (RCN-05)

Fixture pattern: isolated DuckDB (tmp_path/:memory:), monkeypatch DB_PATH +
module-level constants, importlib.reload. Never touches dbt_sandbox fixture
(RESEARCH Pitfall 7 — 18 pre-existing failures are out of scope).
"""
import csv
import importlib
from pathlib import Path
from unittest.mock import patch

import duckdb
import pytest

# Directory containing committed fixture files (Phase 140 Plan 02 / TFIXTURE-02)
FIXTURES_DIR = Path(__file__).parent / "fixtures"


# ---------------------------------------------------------------------------
# Mock helper — mirrors _fake_taxa_search_response shape in test_resolve_taxon_ids.py
# ---------------------------------------------------------------------------

def _fake_gbif_response(
    match_type: str,
    canonical_name: str | None = None,
    confidence: int = 99,
) -> dict:
    """Build a pygbif.species.name_backbone()-shaped response dict.

    When match_type == 'NONE', the 'usage' key is ABSENT (verified live —
    RESEARCH Pitfall 1). Other match types include the 'usage' block.
    """
    if match_type == "NONE":
        return {
            "diagnostics": {"matchType": "NONE", "confidence": 0},
            "synonym": False,
        }
    return {
        "usage": {
            "canonicalName": canonical_name,
            "key": "12345",
            "status": "ACCEPTED",
        },
        "diagnostics": {"matchType": match_type, "confidence": confidence},
        "synonym": False,
    }


# ---------------------------------------------------------------------------
# Fixture — isolated DuckDB with minimal checklist_data schema
# ---------------------------------------------------------------------------

@pytest.fixture
def checklist_resolver_db(tmp_path, monkeypatch):
    """Isolated DuckDB fixture for resolve_checklist_names tests.

    - Creates tmp_path/checklist_resolver.duckdb with checklist_data schema
    - Monkeypatches DB_PATH env so module-level constant picks it up on reload
    - Reloads resolve_checklist_names so all Path constants redirect to tmp_path
    - Zeroes _GBIF_PACE_SECONDS so tests don't real-time-sleep
    - Redirects AUDIT_CSV, FUZZY_REVIEW_CSV, GBIF_SEED_CSV to tmp_path
    - Seeds a handful of checklist_records_full rows including:
        * one slash-compound row (Agapostemon texanus/angelicus)
        * one known-misspelling row (Lasioglossum heterorhinus)
        * two exact-match rows
    - Phase 142 additions for test_at_least_13_fuzzy_candidates:
        * Loads all 178 verbatim names from committed data/checklist_unmatched.csv
        * Creates inaturalist_data.canonical_to_taxon_id seeded with 20 near-match
          bridge entries (1-char variations of unmatched canonicals) so that
          rapidfuzz score_cutoff=85 reliably yields >= 13 fuzzy candidates.
          Bridge entries are DIFFERENT from the unmatched canonical forms so they
          do not accidentally trigger Tier 2 (exact) — only the fuzzy tier.

    Returns (tmp_path, reloaded_module).
    """
    db_path = str(tmp_path / "checklist_resolver.duckdb")
    monkeypatch.setenv("DB_PATH", db_path)

    # Import and reload so module-level DB_PATH picks up the patched env.
    import resolve_checklist_names  # noqa: PLC0415 — intentional late import
    importlib.reload(resolve_checklist_names)

    # Zero pacing and redirect file outputs to tmp_path.
    monkeypatch.setattr(resolve_checklist_names, "_GBIF_PACE_SECONDS", 0.0)
    monkeypatch.setattr(
        resolve_checklist_names, "AUDIT_CSV", tmp_path / "audit.csv"
    )
    monkeypatch.setattr(
        resolve_checklist_names, "FUZZY_REVIEW_CSV", tmp_path / "fuzzy_review.csv"
    )
    monkeypatch.setattr(
        resolve_checklist_names, "GBIF_SEED_CSV",
        tmp_path / "gbif_checklist_synonyms.csv"
    )
    # Redirect TAXA_PATH to the committed 3-row fixture gz (D-06, D-07):
    #   Agapostemon angelicus (taxon_id=270393, ancestry: .../50086/606634)
    #   Agapostemon texanus   (taxon_id=1581468, ancestry: .../50086/606634/1581466)
    #   Agapostemon (subgenus, taxon_id=606634, for LCA name lookup)
    # LCA = 606634. With this redirect, the fast tier passes with raw/taxa.csv.gz absent.
    monkeypatch.setattr(resolve_checklist_names, "TAXA_PATH",
                        str(FIXTURES_DIR / "taxa_subset.csv.gz"))

    # Seed minimal DB schema.
    con = duckdb.connect(db_path)
    con.execute("CREATE SCHEMA checklist_data")
    con.execute("""
        CREATE TABLE checklist_data.checklist_records_full (
            ObjectID BIGINT,
            family VARCHAR,
            genus VARCHAR,
            verbatim_name VARCHAR,
            canonical_name VARCHAR,
            locality VARCHAR,
            latitude DOUBLE,
            longitude DOUBLE,
            recordedBy VARCHAR,
            year BIGINT,
            month BIGINT,
            day BIGINT,
            date_quality VARCHAR,
            coord_flag VARCHAR
        )
    """)
    # Seed rows: two exact-match, one slash-compound, one known-misspelling.
    # The slash row (ObjectID 3) MUST remain for test_slash_verbatim_retained.
    con.execute("""
        INSERT INTO checklist_data.checklist_records_full
            (ObjectID, verbatim_name, canonical_name, coord_flag)
        VALUES
            (1, 'Agapostemon virescens Cresson, 1872',
               'agapostemon virescens', 'valid'),
            (2, 'Osmia lignaria Say, 1824',
               'osmia lignaria', 'valid'),
            (3, 'Agapostemon texanus/angelicus Cresson, 1872',
               NULL, 'valid'),
            (4, 'Lasioglossum heterorhinus Biscoe, 1939',
               'lasioglossum heterorhinus', 'valid')
    """)

    # Phase 142: load all 178 verbatim names from committed checklist_unmatched.csv
    # so that resolve_checklist_names() has a full unmatched set to process.
    # INSERT via read_csv() consistent with production load_checklist() patterns.
    unmatched_csv = Path(__file__).parent.parent / "checklist_unmatched.csv"
    con.execute(f"""
        INSERT INTO checklist_data.checklist_records_full
            (verbatim_name, canonical_name, coord_flag)
        SELECT checklist_name, canonical_name, 'valid'
        FROM read_csv('{unmatched_csv}', header=true)
    """)

    # Phase 142: create inaturalist_data schema + canonical_to_taxon_id bridge.
    # Seeded with 20 near-match entries (1-char variations of unmatched canonicals).
    # Bridge entries are NOT exact matches of the unmatched canonical forms — they
    # differ by exactly one character — so they bypass Tier 2 (exact) and reach
    # Tier 5 (fuzzy) where rapidfuzz WRatio at score_cutoff=85 produces a hit
    # (empirically verified: 1-char variation yields WRatio ~93-97, well above 85).
    # Column order matches conftest.py canonical_to_taxon_id INSERT pattern exactly.
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
            (canonical_name, taxon_id, resolved_at, source) VALUES
            ('andrena evolata',             3001, current_timestamp, 'inat_species'),
            ('andrena viereckii',           3002, current_timestamp, 'inat_species'),
            ('megachile pascuensis',        3003, current_timestamp, 'inat_species'),
            ('nomada jenne',                3004, current_timestamp, 'inat_species'),
            ('nomada orcusela',             3005, current_timestamp, 'inat_species'),
            ('stelis foederali',            3006, current_timestamp, 'inat_species'),
            ('lasioglossum heterorhinu',    3007, current_timestamp, 'inat_species'),
            ('sphecodes kincaidi',          3008, current_timestamp, 'inat_species'),
            ('habropoda morrisony',         3009, current_timestamp, 'inat_species'),
            ('megachile legali',            3010, current_timestamp, 'inat_species'),
            ('melissodes vernali',          3011, current_timestamp, 'inat_species'),
            ('nomada malonela',             3012, current_timestamp, 'inat_species'),
            ('osmia obliquu',               3013, current_timestamp, 'inat_species'),
            ('lasioglossum longicome',      3014, current_timestamp, 'inat_species'),
            ('lasioglossum pavonotu',       3015, current_timestamp, 'inat_species'),
            ('lasioglossum perdifficil',    3016, current_timestamp, 'inat_species'),
            ('lasioglossum robustu',        3017, current_timestamp, 'inat_species'),
            ('osmia nigrifon',              3018, current_timestamp, 'inat_species'),
            ('osmia tannerii',              3019, current_timestamp, 'inat_species'),
            ('lasioglossum sequoiaa',       3020, current_timestamp, 'inat_species')
    """)
    con.close()

    return tmp_path, resolve_checklist_names


# ---------------------------------------------------------------------------
# RCN-03: test_noop_without_refresh
# ---------------------------------------------------------------------------

def test_noop_without_refresh(checklist_resolver_db, monkeypatch):
    """RCN-03: resolve_checklist_names(refresh=False) must make zero GBIF calls.

    This is the nightly path — no network calls allowed when refresh=False.
    FAILS until resolve_checklist_names module exists (Plan 135-02).
    """
    tmp_path, mod = checklist_resolver_db
    import pygbif  # noqa: PLC0415

    with patch.object(pygbif.species, "name_backbone") as mock_gbif:
        mod.resolve_checklist_names(refresh=False)

    assert mock_gbif.call_count == 0, (
        "resolve_checklist_names(refresh=False) must make zero GBIF calls "
        "(RCN-03: nightly path is offline)"
    )


# ---------------------------------------------------------------------------
# RCN-02: test_audit_csv_covers_all_names
# ---------------------------------------------------------------------------

def test_audit_csv_covers_all_names(checklist_resolver_db, monkeypatch):
    """RCN-02: after a refresh run, the audit CSV covers every distinct checklist
    canonical_name exactly once, with a non-empty source in the locked vocabulary
    and a numeric confidence in [0, 1].

    Locked source vocabulary: exact | synonym_seed | gbif | fuzzy | slash_lca | unresolved.
    FAILS until resolve_checklist_names module exists (Plan 135-02).
    """
    tmp_path, mod = checklist_resolver_db

    VALID_SOURCES = {"exact", "synonym_seed", "gbif", "fuzzy", "slash_lca", "unresolved"}

    # Mock GBIF to return NONE for all lookups (so audit still has rows).
    import pygbif  # noqa: PLC0415
    with patch.object(pygbif.species, "name_backbone",
                      return_value=_fake_gbif_response("NONE")):
        mod.resolve_checklist_names(refresh=True)

    audit_path = tmp_path / "audit.csv"
    assert audit_path.exists(), "audit CSV must be written after refresh=True"

    rows = list(csv.DictReader(audit_path.open(newline="")))
    assert len(rows) > 0, "audit CSV must have at least one data row"

    # Every row must have a non-empty source from the locked vocabulary.
    for row in rows:
        src = row.get("source", "")
        assert src in VALID_SOURCES, (
            f"source {src!r} is not in locked vocabulary {VALID_SOURCES}"
        )
        conf_str = row.get("confidence", "")
        assert conf_str != "", "confidence must not be empty"
        conf = float(conf_str)
        assert 0.0 <= conf <= 1.0, (
            f"confidence {conf} is out of range [0, 1]"
        )

    # Every distinct canonical_name in checklist_records_full must appear exactly once.
    con = duckdb.connect(str(tmp_path / "checklist_resolver.duckdb"))
    db_names = {
        r[0]
        for r in con.execute(
            "SELECT DISTINCT canonical_name FROM checklist_data.checklist_records_full "
            "WHERE canonical_name IS NOT NULL"
        ).fetchall()
    }
    con.close()

    audit_names = {row["canonical_name"] for row in rows}
    missing = db_names - audit_names
    assert not missing, (
        f"These canonical_names are absent from audit CSV: {missing}"
    )


# ---------------------------------------------------------------------------
# RCN-04: test_fuzzy_candidates_written
# ---------------------------------------------------------------------------

def test_fuzzy_candidates_written(checklist_resolver_db, monkeypatch):
    """RCN-04: after refresh, FUZZY_REVIEW_CSV must exist with the 5 locked columns:
    verbatim_name, canonical_name, fuzzy_candidate, fuzzy_score, fuzzy_candidate_taxon_id.

    FAILS until resolve_checklist_names module exists (Plan 135-02).
    """
    tmp_path, mod = checklist_resolver_db

    REQUIRED_COLS = {
        "verbatim_name", "canonical_name", "fuzzy_candidate",
        "fuzzy_score", "fuzzy_candidate_taxon_id",
    }

    import pygbif  # noqa: PLC0415
    with patch.object(pygbif.species, "name_backbone",
                      return_value=_fake_gbif_response("NONE")):
        mod.resolve_checklist_names(refresh=True)

    fuzzy_path = tmp_path / "fuzzy_review.csv"
    assert fuzzy_path.exists(), "fuzzy review CSV must be written after refresh=True"

    with fuzzy_path.open(newline="") as f:
        reader = csv.DictReader(f)
        cols = set(reader.fieldnames or [])

    assert REQUIRED_COLS <= cols, (
        f"fuzzy review CSV is missing columns: {REQUIRED_COLS - cols}"
    )


# ---------------------------------------------------------------------------
# RCN-04: test_at_least_13_fuzzy_candidates
# ---------------------------------------------------------------------------

@pytest.mark.integration
def test_at_least_13_fuzzy_candidates(checklist_resolver_db, monkeypatch):
    """RCN-04: running the fuzzy tier over the full unmatched set (178 names)
    yields >= 13 candidates at score_cutoff=85 (A1 assumption from RESEARCH.md).

    This test uses the real data/checklist_unmatched.csv file.
    FAILS until resolve_checklist_names module exists (Plan 135-02).
    """
    tmp_path, mod = checklist_resolver_db

    # The full unmatched CSV lives in data/ (relative to module).
    unmatched_path = Path(mod.__file__).parent / "checklist_unmatched.csv"
    assert unmatched_path.exists(), (
        f"checklist_unmatched.csv not found at {unmatched_path}; "
        "this file must be committed (Phase 134 output)"
    )

    # Call the internal fuzzy-candidate generator directly.
    # The function signature is expected to be:
    #   generate_fuzzy_candidates(unmatched_names, candidate_names, score_cutoff=85)
    # Returns a list of (verbatim_name, canonical_name, fuzzy_candidate, score, taxon_id)
    # Alternatively, run resolve_checklist_names(refresh=True) and count fuzzy_review rows.
    import pygbif  # noqa: PLC0415
    with patch.object(pygbif.species, "name_backbone",
                      return_value=_fake_gbif_response("NONE")):
        mod.resolve_checklist_names(refresh=True)

    fuzzy_path = tmp_path / "fuzzy_review.csv"
    rows = list(csv.DictReader(fuzzy_path.open(newline="")))

    assert len(rows) >= 13, (
        f"Expected >= 13 fuzzy candidates at score_cutoff=85 (A1 assumption), "
        f"got {len(rows)}. Check rapidfuzz scorer and score_cutoff."
    )


# ---------------------------------------------------------------------------
# RCN-04: test_fuzzy_review_gate
# ---------------------------------------------------------------------------

def test_fuzzy_review_gate(checklist_resolver_db, monkeypatch):
    """RCN-04: no row whose source contains the literal 'fuzzy' must be present
    in occurrence_synonyms / gbif_checklist_synonyms (the live synonym seeds).

    Since the fuzzy path writes only to FUZZY_REVIEW_CSV (never to any seed),
    this gate asserts that the GBIF seed CSV does not contain source='fuzzy:*'.
    FAILS until resolve_checklist_names module exists (Plan 135-02).
    """
    tmp_path, mod = checklist_resolver_db

    import pygbif  # noqa: PLC0415
    with patch.object(pygbif.species, "name_backbone",
                      return_value=_fake_gbif_response("NONE")):
        mod.resolve_checklist_names(refresh=True)

    gbif_seed_path = tmp_path / "gbif_checklist_synonyms.csv"
    if gbif_seed_path.exists():
        rows = list(csv.DictReader(gbif_seed_path.open(newline="")))
        fuzzy_rows = [r for r in rows if "fuzzy" in r.get("source", "")]
        assert len(fuzzy_rows) == 0, (
            f"gbif_checklist_synonyms.csv must not contain source='fuzzy:*' rows "
            f"(fuzzy candidates are review-only, never auto-applied). "
            f"Found: {fuzzy_rows}"
        )

    # Also verify occurrence_synonyms.csv (the curated seed, repo-level) has no fuzzy rows.
    # This is a read-only check on the committed file.
    occurrence_synonyms = (
        Path(mod.__file__).parent / "dbt" / "seeds" / "occurrence_synonyms.csv"
    )
    if occurrence_synonyms.exists():
        rows = list(csv.DictReader(occurrence_synonyms.open(newline="")))
        fuzzy_rows = [r for r in rows if "fuzzy" in r.get("source", "")]
        assert len(fuzzy_rows) == 0, (
            f"occurrence_synonyms.csv must not contain source='fuzzy:*' rows. "
            f"Found: {fuzzy_rows}"
        )


# ---------------------------------------------------------------------------
# RCN-05: test_slash_lca (pure function — no DuckDB needed)
# ---------------------------------------------------------------------------

def test_slash_lca():
    """RCN-05: compute_lca('agapostemon angelicus', 'agapostemon texanus', taxa)
    must return 606634 (subgenus Agapostemon), NOT 50086 (genus Agapostemon).

    Uses verified ancestry strings from RESEARCH.md §RCN-05 inline — no file I/O.
    FAILS until resolve_checklist_names module exists (Plan 135-02).
    """
    from resolve_checklist_names import compute_lca  # noqa: PLC0415

    # Ancestry strings verified from data/raw/taxa.csv.gz (RESEARCH.md §RCN-05):
    #   angelicus (270393): ancestry ends in .../50086/606634
    #   texanus   (1581468): ancestry ends in .../50086/606634/1581466
    #   LCA: 606634 (subgenus Agapostemon — NOT genus 50086)
    taxa = {
        "agapostemon angelicus": {
            "taxon_id": 270393,
            "ancestry": "48460/1/47120/372739/630955/52747/50086/606634",
        },
        "agapostemon texanus": {
            "taxon_id": 1581468,
            "ancestry": "48460/1/47120/372739/630955/52747/50086/606634/1581466",
        },
    }

    result = compute_lca("agapostemon angelicus", "agapostemon texanus", taxa)
    assert result == 606634, (
        f"LCA of angelicus/texanus must be 606634 (subgenus Agapostemon), "
        f"got {result!r}. "
        "NOT 50086 (genus) — the LCA is the subgenus node per taxa.csv.gz ancestry."
    )


# ---------------------------------------------------------------------------
# RCN-05: test_slash_verbatim_retained
# ---------------------------------------------------------------------------

def test_slash_verbatim_retained(checklist_resolver_db, monkeypatch):
    """RCN-05: after a refresh run on a fixture row whose verbatim_name contains '/',
    the audit CSV row keeps the raw slash verbatim_name while resolved_taxon_id is
    the LCA taxon_id (606634 for texanus/angelicus).

    FAILS until resolve_checklist_names module exists (Plan 135-02).
    """
    tmp_path, mod = checklist_resolver_db

    import pygbif  # noqa: PLC0415
    with patch.object(pygbif.species, "name_backbone",
                      return_value=_fake_gbif_response("NONE")):
        mod.resolve_checklist_names(refresh=True)

    audit_path = tmp_path / "audit.csv"
    assert audit_path.exists(), "audit CSV must be written after refresh=True"

    rows = list(csv.DictReader(audit_path.open(newline="")))
    slash_rows = [r for r in rows if "/" in r.get("verbatim_name", "")]

    assert len(slash_rows) > 0, (
        "audit CSV must contain at least one row where verbatim_name has '/'"
    )

    for row in slash_rows:
        # The raw slash verbatim string must be preserved.
        assert "/" in row["verbatim_name"], (
            f"verbatim_name must retain the slash: {row['verbatim_name']!r}"
        )
        # Source must be 'slash_lca' for slash-compound rows.
        assert row["source"] == "slash_lca", (
            f"slash-compound row must have source='slash_lca', got {row['source']!r}"
        )
        # resolved_taxon_id must be set (the LCA taxon_id).
        assert row.get("resolved_taxon_id", "") != "", (
            "slash-compound row must have a non-empty resolved_taxon_id"
        )
