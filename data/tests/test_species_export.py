"""Unit and integration tests for species_export.py slug format (PIPE-03) and
slug-collision gate (PAGE-03, D-07).

Tests assert the new Genus/specificEpithet slug format for species rows:
  - test_slug_hierarchical: every row with specific_epithet has slug == f"{genus}/{epithet}"
  - test_no_old_slug_format: no slug contains the old lowercase-dash flat format

Collision gate tests (D-07):
  - test_check_slug_collisions_raises_on_collision: synthetic collision hard-fails
  - test_check_slug_collisions_bombus_no_false_alarm: genus/subgenus Bombus is NOT a collision
  - test_check_slug_collisions_clean_real_data: fixture-based pass on distilled data

Phase 141 (TFIXTURE-03, TFIX-04, TTIER-02):
  - sandbox_parquet fixture builds species/higher_taxa/occurrences parquet from committed CSVs
    in a tmp dir; redirects se_mod.DBT_SANDBOX_DIR and se_mod.ASSETS_DIR via monkeypatch.setattr.
  - test_higher_taxa_json_written_and_12_subfamilies and test_taxon_id are tagged
    @pytest.mark.integration (real-dataset properties, deselected from fast tier).

Run after ``bash data/dbt/run.sh build`` for the integration tier:
    cd data && uv run pytest tests/test_species_export.py -m integration
"""

import json
from pathlib import Path

import duckdb
import pytest

import species_export as se_mod
from species_export import export_species_parquet, SPECIES_COLUMNS

SANDBOX = Path(__file__).resolve().parent.parent / "dbt" / "target" / "sandbox"
SPECIES_JSON = Path(__file__).resolve().parent.parent.parent / "public" / "data" / "species.json"
FIXTURES_DIR = Path(__file__).parent / "fixtures"

_SPECIES_JSON_GUARD = pytest.mark.skipif(
    not SPECIES_JSON.exists(),
    reason="[integration] run `uv run python data/species_export.py` first to produce public/data/species.json",
)


# ---------------------------------------------------------------------------
# Phase 141 D-01 fixture: build parquets from committed CSVs (TFIXTURE-03)
# ---------------------------------------------------------------------------

@pytest.fixture
def sandbox_parquet(tmp_path, monkeypatch):
    """Build minimal sandbox parquet files from committed CSV fixtures (Phase 141 D-01).

    Copies species_fixture.csv and higher_taxa_fixture.csv to parquet in a tmp sandbox dir.
    Also creates a minimal occurrences.parquet (export_species_parquet reads it for seasonality).
    Redirects se_mod.DBT_SANDBOX_DIR and se_mod.ASSETS_DIR via monkeypatch.setattr
    (monkeypatch.setenv is insufficient — DBT_SANDBOX_DIR is read once at module import).

    Also patches se_mod._build_higher_taxa to skip the hardcoded == 12 subfamily assertion
    (a real-dataset property; the committed fixture has 2 subfamilies by design, and the
    == 12 assertion belongs in the @integration tier — test_higher_taxa_json_written_and_12_subfamilies).
    """
    import duckdb as _duckdb

    sandbox = tmp_path / "sandbox"
    sandbox.mkdir()

    con = _duckdb.connect()

    # species.parquet: CAST on_checklist to BOOLEAN (RESEARCH Pitfall 3 — CSV true/false
    # may be auto-detected as VARCHAR; production code casts to bool_ via pyarrow schema).
    # Also parse month_histogram from JSON string to INTEGER[] so pyarrow can read it as
    # list<int32> (the production parquet stores it as a list, not a varchar).
    con.execute(f"""
        COPY (
            SELECT * REPLACE (
                CAST(on_checklist AS BOOLEAN) AS on_checklist,
                json_extract(month_histogram, '$')::INTEGER[] AS month_histogram
            )
            FROM read_csv('{FIXTURES_DIR}/species_fixture.csv', header=True, auto_detect=True)
        )
        TO '{sandbox}/species.parquet' (FORMAT PARQUET)
    """)

    # higher_taxa.parquet: no BOOLEAN columns, straight COPY.
    con.execute(f"""
        COPY (
            SELECT * FROM read_csv('{FIXTURES_DIR}/higher_taxa_fixture.csv', header=True, auto_detect=True)
        )
        TO '{sandbox}/higher_taxa.parquet' (FORMAT PARQUET)
    """)

    # occurrences.parquet: export_species_parquet reads this for seasonality (AGG-05).
    # Minimal schema — only canonical_name, county, ecoregion_l3, month are queried.
    con.execute("CREATE TABLE occ_staging (canonical_name VARCHAR, county VARCHAR, ecoregion_l3 VARCHAR, month VARCHAR)")
    con.execute("INSERT INTO occ_staging VALUES ('agapostemon subtilior', NULL, NULL, NULL)")
    con.execute(f"COPY occ_staging TO '{sandbox}/occurrences.parquet' (FORMAT PARQUET)")

    # species_traits.parquet: Phase 174 trait merge input.
    # Must match canonical_names in species_fixture.csv so the merge can join.
    con.execute(f"""
        COPY (
            SELECT * FROM read_csv('{FIXTURES_DIR}/species_traits_fixture.csv',
                                   header=True, auto_detect=True)
        )
        TO '{sandbox}/species_traits.parquet' (FORMAT PARQUET)
    """)

    con.close()

    # Redirect module-level constants via setattr (setenv is insufficient after import).
    monkeypatch.setattr(se_mod, 'DBT_SANDBOX_DIR', sandbox)
    monkeypatch.setattr(se_mod, 'ASSETS_DIR', tmp_path)

    # Patch _build_higher_taxa to skip the hardcoded == 12 assertion (real-dataset property).
    # The fixture has 2 subfamilies; the == 12 check belongs in @integration.
    # This patch preserves the rest of the function's behavior (reads parquet, writes JSON,
    # returns rows) — only the count assert is bypassed in the fixture context.
    _original_build_higher_taxa = se_mod._build_higher_taxa

    def _fixture_build_higher_taxa(con):
        import json as _json
        higher_taxa_parquet = se_mod.DBT_SANDBOX_DIR / 'higher_taxa.parquet'
        rows = con.execute(
            f"SELECT * FROM read_parquet('{higher_taxa_parquet}') ORDER BY rank, name"
        ).fetchall()
        cols = [d[0] for d in con.description]
        higher_taxa_rows = [dict(zip(cols, r)) for r in rows]
        out = se_mod.ASSETS_DIR / "higher_taxa.json"
        out.write_text(
            _json.dumps(higher_taxa_rows, sort_keys=True, indent=2),
            encoding='utf-8',
        )
        assert len(higher_taxa_rows) > 0, "higher_taxa.json must be non-empty"
        # Note: the == 12 subfamily assertion is intentionally absent here.
        # It is a real-dataset property tested in test_higher_taxa_json_written_and_12_subfamilies
        # which is tagged @pytest.mark.integration.
        return higher_taxa_rows

    monkeypatch.setattr(se_mod, '_build_higher_taxa', _fixture_build_higher_taxa)

    return sandbox


# ---------------------------------------------------------------------------
# Slug format tests (PIPE-03) — consume sandbox_parquet fixture
# ---------------------------------------------------------------------------

def test_slug_hierarchical(tmp_path, monkeypatch, sandbox_parquet):
    """species_export.py writes Genus/specificEpithet slug for species rows (PIPE-03a)."""
    con = duckdb.connect()
    export_species_parquet(con)
    rows = duckdb.execute(
        f"SELECT slug, genus, specific_epithet FROM read_parquet('{tmp_path}/species.parquet')"
        " WHERE specific_epithet IS NOT NULL LIMIT 20"
    ).fetchall()
    assert rows, "Expected at least one species-level row with specific_epithet"
    for slug, genus, epithet in rows:
        assert slug == f"{genus}/{epithet}", (
            f"Expected {genus}/{epithet!r}, got {slug!r}"
        )


def test_no_old_slug_format(tmp_path, monkeypatch, sandbox_parquet):
    """No slug uses the old flat lowercase-dash format for species rows (PIPE-03b).

    The old format was 'genus-epithet' (no slash, all lowercase), e.g. 'andrena-milwaukeensis'.
    The new format is 'Genus/epithet' (slash separator, genus capitalized).
    Detection: old format has no slash; new format always has a slash for species rows.
    Note: the epithet itself may contain hyphens (e.g. 'w-scripta'), so checking for
    dash presence is insufficient — we check for absence of slash instead.
    """
    con = duckdb.connect()
    export_species_parquet(con)
    old_pattern_count = duckdb.execute(
        f"SELECT COUNT(*) FROM read_parquet('{tmp_path}/species.parquet')"
        " WHERE slug NOT LIKE '%/%' AND specific_epithet IS NOT NULL"
    ).fetchone()[0]
    assert old_pattern_count == 0, (
        f"Found {old_pattern_count} species-level slugs missing the Genus/epithet slash separator"
    )


def test_inat_obs_count_in_species(tmp_path, monkeypatch, sandbox_parquet):
    """inat_obs_count column is present and non-null in species.parquet/species.json (OCC-02/03)."""
    con = duckdb.connect()
    export_species_parquet(con)
    row = duckdb.execute(
        f"SELECT COUNT(*) FROM read_parquet('{tmp_path}/species.parquet')"
        " WHERE inat_obs_count IS NULL"
    ).fetchone()
    assert row[0] == 0, f"species.parquet has {row[0]} rows with null inat_obs_count"
    assert 'inat_obs_count' in SPECIES_COLUMNS, "inat_obs_count must be in SPECIES_COLUMNS"


@pytest.mark.integration
@_SPECIES_JSON_GUARD
def test_taxon_id(tmp_path):
    """Every species entry in public/data/species.json has a non-null integer taxon_id (TID-03).

    [integration] Reads public/data/species.json — a downstream artifact produced by
    `uv run python data/species_export.py`. Requires the full dbt sandbox + export pipeline.
    Deselected from the fast tier by addopts = -m "not integration" in pyproject.toml.
    """
    rows = json.loads(SPECIES_JSON.read_text(encoding='utf-8'))
    assert rows, "species.json must be non-empty"
    for row in rows:
        tid = row.get('taxon_id')
        assert tid is not None, (
            f"species.json row missing taxon_id: canonical_name={row.get('canonical_name')!r}"
        )
        assert isinstance(tid, int), (
            f"species.json taxon_id is not an integer for {row.get('canonical_name')!r}: {tid!r}"
        )


# ---------------------------------------------------------------------------
# Slug-collision gate tests (D-07, PAGE-03)
# ---------------------------------------------------------------------------

def test_check_slug_collisions_raises_on_collision():
    """_check_slug_collisions raises AssertionError when two distinct taxa share a URL (D-07)."""
    # Two distinct genera with the same name produce the same URL — synthetic collision
    higher_taxa_rows = [
        {'taxon_id': 1001, 'rank': 'genus', 'name': 'Apis', 'genus': None, 'subfamily': None, 'tribe': None},
        {'taxon_id': 1002, 'rank': 'genus', 'name': 'Apis', 'genus': None, 'subfamily': None, 'tribe': None},
    ]
    species_rows: list = []
    with pytest.raises(AssertionError) as exc_info:
        se_mod._check_slug_collisions(higher_taxa_rows, species_rows)
    msg = str(exc_info.value)
    assert '/species/Apis/' in msg, f"Expected URL in error message, got: {msg}"
    assert 'no auto-suffix' in msg, f"Expected 'no auto-suffix' in error message, got: {msg}"


def test_check_slug_collisions_bombus_no_false_alarm():
    """genus Bombus and subgenus Bombus do NOT collide — distinct full URLs (Pitfall 5)."""
    higher_taxa_rows = [
        # genus Bombus -> /species/Bombus/
        {'taxon_id': 52775, 'rank': 'genus', 'name': 'Bombus', 'genus': None, 'subfamily': None, 'tribe': None},
        # subgenus Bombus -> /species/Bombus/Bombus/
        {'taxon_id': 200001, 'rank': 'subgenus', 'name': 'Bombus', 'genus': 'Bombus', 'subfamily': None, 'tribe': None},
    ]
    species_rows: list = []
    # Must NOT raise — distinct full URLs
    se_mod._check_slug_collisions(higher_taxa_rows, species_rows)


def test_check_slug_collisions_clean_real_data(tmp_path, monkeypatch, sandbox_parquet):
    """_check_slug_collisions passes on fixture data — no collision in distilled fixture (D-07).

    Species rows are filtered to specific_epithet IS NOT NULL — genus-only records do not
    generate pages and are excluded from URL collision checking (mirrors speciesList filter
    in _data/species.js line 99).
    """
    con = duckdb.connect()
    # Build higher_taxa_rows from the fixture parquet
    higher_taxa_parquet = sandbox_parquet / 'higher_taxa.parquet'
    rows = con.execute(
        f"SELECT * FROM read_parquet('{higher_taxa_parquet}') ORDER BY rank, name"
    ).fetchall()
    cols = [d[0] for d in con.description]
    higher_taxa_rows = [dict(zip(cols, r)) for r in rows]
    # Build species_rows with slugs — only species-level rows (specific_epithet != null)
    # Genus-only records (species identified only to genus) do not generate pages and are
    # excluded from URL collision checking (mirrors speciesList filter in species.js).
    species_parquet = sandbox_parquet / 'species.parquet'
    sp_rows = con.execute(
        f"SELECT canonical_name, taxon_id, genus, specific_epithet FROM read_parquet('{species_parquet}')"
        " WHERE specific_epithet IS NOT NULL"
    ).fetchall()
    species_rows = []
    for canonical_name, taxon_id, genus, epithet in sp_rows:
        slug = f"{genus}/{epithet}" if genus and epithet else (genus or '')
        species_rows.append({'canonical_name': canonical_name, 'taxon_id': taxon_id, 'slug': slug})
    # Must not raise
    se_mod._check_slug_collisions(higher_taxa_rows, species_rows)


# ---------------------------------------------------------------------------
# _build_higher_taxa + retirement tests (D-03, PAGE-01)
# ---------------------------------------------------------------------------

@pytest.mark.integration
def test_higher_taxa_json_written_and_12_subfamilies(tmp_path, monkeypatch):
    """higher_taxa.json is written, non-empty, and contains exactly 12 subfamily rows (D-08).

    [integration] The == 12 count is a real-dataset property — the committed fixture
    intentionally has only 2 subfamilies. Requires the full dbt sandbox (species.parquet,
    higher_taxa.parquet with all 12 bee subfamilies, occurrences.parquet).
    Deselected from the fast tier by addopts = -m "not integration" in pyproject.toml.

    Run after `bash data/dbt/run.sh build`:
        cd data && uv run pytest tests/test_species_export.py::test_higher_taxa_json_written_and_12_subfamilies -m integration
    """
    if not (SANDBOX / "species.parquet").exists():
        pytest.skip("[integration] sandbox species.parquet absent — run `bash data/dbt/run.sh build` first")
    if not (SANDBOX / "higher_taxa.parquet").exists():
        pytest.skip("[integration] sandbox higher_taxa.parquet absent — run `bash data/dbt/run.sh build` first")
    monkeypatch.setattr(se_mod, 'ASSETS_DIR', tmp_path)
    monkeypatch.setattr(se_mod, 'DBT_SANDBOX_DIR', SANDBOX)
    con = duckdb.connect()
    export_species_parquet(con)
    out = tmp_path / 'higher_taxa.json'
    assert out.exists(), "higher_taxa.json was not written by export"
    rows = json.loads(out.read_text(encoding='utf-8'))
    assert len(rows) > 0, "higher_taxa.json must be non-empty"
    subfamily_rows = [r for r in rows if r['rank'] == 'subfamily']
    assert len(subfamily_rows) == 12, (
        f"Expected exactly 12 bee subfamily rows, got {len(subfamily_rows)}: "
        f"{[r['name'] for r in subfamily_rows]}"
    )
    names = {r['name'] for r in subfamily_rows}
    assert 'Eumeninae' not in names, "Eumeninae (wasp bycatch) must not appear in subfamily rows"


def test_higher_rank_taxon_ids_not_written(tmp_path, monkeypatch, sandbox_parquet):
    """higher_rank_taxon_ids.json is NOT written by export (D-03 retirement)."""
    con = duckdb.connect()
    export_species_parquet(con)
    retired = tmp_path / 'higher_rank_taxon_ids.json'
    assert not retired.exists(), (
        "higher_rank_taxon_ids.json must NOT be written — it was retired in D-03"
    )


def test_export_runs_collision_check_clean(tmp_path, monkeypatch, sandbox_parquet):
    """export_species_parquet invokes _check_slug_collisions and completes without raising."""
    con = duckdb.connect()
    # If a collision were present, this would raise AssertionError.
    # Completing without error confirms the check ran and found no collision.
    export_species_parquet(con)
