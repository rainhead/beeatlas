"""Unit and integration tests for species_export.py slug format (PIPE-03).

Tests assert the new Genus/specificEpithet slug format for species rows:
  - test_slug_hierarchical: every row with specific_epithet has slug == f"{genus}/{epithet}"
  - test_no_old_slug_format: no slug contains the old lowercase-dash flat format

Both tests guarded by _SANDBOX_GUARD so they skip cleanly when
data/dbt/target/sandbox/species.parquet is absent.

Run after ``bash data/dbt/run.sh build``:
    cd data && uv run pytest tests/test_species_export.py -x
"""

from pathlib import Path

import duckdb
import pytest

import species_export as se_mod
from species_export import export_species_parquet, SPECIES_COLUMNS

SANDBOX = Path(__file__).resolve().parent.parent / "dbt" / "target" / "sandbox"

_SANDBOX_GUARD = pytest.mark.skipif(
    not (SANDBOX / "species.parquet").exists(),
    reason="run `bash data/dbt/run.sh build` first to produce sandbox species.parquet",
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
