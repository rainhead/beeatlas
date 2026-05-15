"""Unit tests for species_export.py slug format (Phase 92 PIPE-03a, PIPE-03b).

Tests assert the new Genus/specificEpithet slug format and absence of the old
lowercase-dash format. Both tests are guarded by _SANDBOX_GUARD so they skip
cleanly when data/dbt/target/sandbox/species.parquet is absent (i.e., before
`bash data/dbt/run.sh build` has been run).

RED state: tests FAIL against current species_export.py (which emits
andrena-milwaukeensis-style slugs via _slugify). GREEN state achieved in Plan 02
after the slug assignment line is rewritten to use f"{genus}/{epithet}".
"""

import os
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
    """species_export.py writes Genus/specificEpithet slug for species rows (PIPE-03a).

    After calling export_species_parquet(con) with ASSETS_DIR monkeypatched to
    tmp_path, every row in the resulting species.parquet with specific_epithet IS NOT
    NULL must have slug == f"{genus}/{epithet}". Samples up to 20 such rows.
    """
    monkeypatch.setattr(se_mod, 'ASSETS_DIR', tmp_path)
    monkeypatch.setenv('DBT_SANDBOX_DIR', str(SANDBOX))
    con = duckdb.connect()
    export_species_parquet(con)
    rows = duckdb.execute(
        f"SELECT slug, genus, specific_epithet FROM read_parquet('{tmp_path}/species.parquet')"
        " WHERE specific_epithet IS NOT NULL LIMIT 20"
    ).fetchall()
    assert len(rows) > 0, "Expected at least one row with specific_epithet IS NOT NULL"
    for slug, genus, epithet in rows:
        assert slug == f"{genus}/{epithet}", (
            f"Expected hierarchical slug {genus}/{epithet!r}, got {slug!r}"
        )


@_SANDBOX_GUARD
def test_no_old_slug_format(tmp_path, monkeypatch):
    """No slug retains the old lowercase-dash format for species rows (PIPE-03b).

    After calling export_species_parquet(con), the count of rows where
    slug LIKE '%-%' AND specific_epithet IS NOT NULL must be 0.

    Genus values like 'Lasioglossum (Dialictus)' contain spaces but never
    hyphens; epithets are single tokens. The old flat slug was the only source
    of hyphens in the slug column.
    """
    monkeypatch.setattr(se_mod, 'ASSETS_DIR', tmp_path)
    monkeypatch.setenv('DBT_SANDBOX_DIR', str(SANDBOX))
    con = duckdb.connect()
    export_species_parquet(con)
    old_pattern_count = duckdb.execute(
        f"SELECT COUNT(*) FROM read_parquet('{tmp_path}/species.parquet')"
        " WHERE slug LIKE '%-%' AND specific_epithet IS NOT NULL"
    ).fetchone()[0]
    assert old_pattern_count == 0, (
        f"Found {old_pattern_count} slugs with old genus-epithet flat format "
        f"(expected 0 after slug migration)"
    )
