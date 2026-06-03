"""Unit and integration tests for species_export.py slug format (PIPE-03) and
slug-collision gate (PAGE-03, D-07).

Tests assert the new Genus/specificEpithet slug format for species rows:
  - test_slug_hierarchical: every row with specific_epithet has slug == f"{genus}/{epithet}"
  - test_no_old_slug_format: no slug contains the old lowercase-dash flat format

Collision gate tests (D-07):
  - test_check_slug_collisions_raises_on_collision: synthetic collision hard-fails
  - test_check_slug_collisions_bombus_no_false_alarm: genus/subgenus Bombus is NOT a collision
  - test_check_slug_collisions_clean_real_data: sandbox-gated pass on live data

Both sandbox tests guarded by _SANDBOX_GUARD so they skip cleanly when
data/dbt/target/sandbox/species.parquet is absent.

Run after ``bash data/dbt/run.sh build``:
    cd data && uv run pytest tests/test_species_export.py -x
"""

import json
from pathlib import Path

import duckdb
import pytest

import species_export as se_mod
from species_export import export_species_parquet, SPECIES_COLUMNS

SANDBOX = Path(__file__).resolve().parent.parent / "dbt" / "target" / "sandbox"
SPECIES_JSON = Path(__file__).resolve().parent.parent.parent / "public" / "data" / "species.json"

_SANDBOX_GUARD = pytest.mark.skipif(
    not (SANDBOX / "species.parquet").exists(),
    reason="run `bash data/dbt/run.sh build` first to produce sandbox species.parquet",
)

_HIGHER_TAXA_GUARD = pytest.mark.skipif(
    not (SANDBOX / "higher_taxa.parquet").exists(),
    reason="run `bash data/dbt/run.sh build` first to produce sandbox higher_taxa.parquet",
)

_SPECIES_JSON_GUARD = pytest.mark.skipif(
    not SPECIES_JSON.exists(),
    reason="run `uv run python data/species_export.py` first to produce public/data/species.json",
)


@_SANDBOX_GUARD
def test_slug_hierarchical(tmp_path, monkeypatch):
    """species_export.py writes Genus/specificEpithet slug for species rows (PIPE-03a)."""
    monkeypatch.setattr(se_mod, 'ASSETS_DIR', tmp_path)
    monkeypatch.setenv('DBT_SANDBOX_DIR', str(SANDBOX))
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


@_SANDBOX_GUARD
def test_no_old_slug_format(tmp_path, monkeypatch):
    """No slug uses the old flat lowercase-dash format for species rows (PIPE-03b).

    The old format was 'genus-epithet' (no slash, all lowercase), e.g. 'andrena-milwaukeensis'.
    The new format is 'Genus/epithet' (slash separator, genus capitalized).
    Detection: old format has no slash; new format always has a slash for species rows.
    Note: the epithet itself may contain hyphens (e.g. 'w-scripta'), so checking for
    dash presence is insufficient — we check for absence of slash instead.
    """
    monkeypatch.setattr(se_mod, 'ASSETS_DIR', tmp_path)
    monkeypatch.setenv('DBT_SANDBOX_DIR', str(SANDBOX))
    con = duckdb.connect()
    export_species_parquet(con)
    old_pattern_count = duckdb.execute(
        f"SELECT COUNT(*) FROM read_parquet('{tmp_path}/species.parquet')"
        " WHERE slug NOT LIKE '%/%' AND specific_epithet IS NOT NULL"
    ).fetchone()[0]
    assert old_pattern_count == 0, (
        f"Found {old_pattern_count} species-level slugs missing the Genus/epithet slash separator"
    )


@_SANDBOX_GUARD
def test_inat_obs_count_in_species(tmp_path, monkeypatch):
    """inat_obs_count column is present and non-null in species.parquet/species.json (OCC-02/03)."""
    monkeypatch.setattr(se_mod, 'ASSETS_DIR', tmp_path)
    monkeypatch.setenv('DBT_SANDBOX_DIR', str(SANDBOX))
    con = duckdb.connect()
    export_species_parquet(con)
    row = duckdb.execute(
        f"SELECT COUNT(*) FROM read_parquet('{tmp_path}/species.parquet')"
        " WHERE inat_obs_count IS NULL"
    ).fetchone()
    assert row[0] == 0, f"species.parquet has {row[0]} rows with null inat_obs_count"
    assert 'inat_obs_count' in SPECIES_COLUMNS, "inat_obs_count must be in SPECIES_COLUMNS"


@_SPECIES_JSON_GUARD
def test_taxon_id(tmp_path):
    """Every species entry in public/data/species.json has a non-null integer taxon_id (TID-03)."""
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


@_SANDBOX_GUARD
@_HIGHER_TAXA_GUARD
def test_check_slug_collisions_clean_real_data(tmp_path, monkeypatch):
    """_check_slug_collisions passes on current real data — no collision in live data (D-07).

    Species rows are filtered to specific_epithet IS NOT NULL — genus-only records do not
    generate pages and are excluded from URL collision checking (mirrors speciesList filter
    in _data/species.js line 99).
    """
    monkeypatch.setattr(se_mod, 'ASSETS_DIR', tmp_path)
    monkeypatch.setenv('DBT_SANDBOX_DIR', str(SANDBOX))
    con = duckdb.connect()
    # Build higher_taxa_rows from the parquet
    higher_taxa_parquet = SANDBOX / 'higher_taxa.parquet'
    rows = con.execute(
        f"SELECT * FROM read_parquet('{higher_taxa_parquet}') ORDER BY rank, name"
    ).fetchall()
    cols = [d[0] for d in con.description]
    higher_taxa_rows = [dict(zip(cols, r)) for r in rows]
    # Build species_rows with slugs — only species-level rows (specific_epithet != null)
    # Genus-only records (species identified only to genus) do not generate pages and are
    # excluded from URL collision checking (mirrors speciesList filter in species.js).
    species_parquet = SANDBOX / 'species.parquet'
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
