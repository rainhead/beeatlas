"""Tests for the species_hosts.json sidecar producer in species_export.py (Phase 175).

Covers:
  - test_families_ordered_by_sample_count_desc: families sorted by sample_count desc
  - test_genera_ordered_by_sample_count_desc: genera within a family sorted desc
  - test_null_genus_contributes_to_family_count: null-genus row adds to family sample_count
    but emits no genus object in the genera list
  - test_absent_parquet_yields_empty_object: missing parquet → empty dict, no exception
  - test_idempotent_write: two runs produce byte-identical output
"""

import json
from pathlib import Path

import duckdb
import pytest

import species_export as se_mod
from species_export import export_species_parquet

FIXTURES_DIR = Path(__file__).parent / "fixtures"


# ---------------------------------------------------------------------------
# Fixture: tiny species_host_plants.parquet with two species, plus the minimum
# stub parquets required for export_species_parquet to reach the hosts block.
# ---------------------------------------------------------------------------


@pytest.fixture
def hosts_sandbox(tmp_path, monkeypatch):
    """Build species_host_plants.parquet + required stubs and redirect module paths.

    Species fixture:
      'bombus vosnesenskii':
        Rosaceae / Rubus       sample_count=10
        Asteraceae / Solidago  sample_count=5
        Asteraceae / Cirsium   sample_count=3
        Rosaceae / (NULL genus) sample_count=2   ← null-genus row

      'osmia lignaria':
        Rosaceae / Rosa        sample_count=7
        Fabaceae / Lupinus     sample_count=4

    Expected Rosaceae family sample_count for bombus: 10 + 2 = 12
    Expected Asteraceae family sample_count for bombus: 5 + 3 = 8
    Family order: Rosaceae (12) > Asteraceae (8)
    Genera in Asteraceae: Solidago (5) > Cirsium (3)
    Genera in Rosaceae: Rubus (10) only — null-genus row not emitted
    """
    sandbox = tmp_path / "sandbox"
    sandbox.mkdir()
    assets = tmp_path / "assets"
    assets.mkdir()

    con = duckdb.connect()

    # species_host_plants.parquet — the Phase 175 intermediate
    con.execute(f"""
        COPY (
            SELECT canonical_name, family, genus, sample_count
            FROM (VALUES
                ('bombus vosnesenskii', 'Rosaceae',   'Rubus',    10),
                ('bombus vosnesenskii', 'Asteraceae', 'Solidago',  5),
                ('bombus vosnesenskii', 'Asteraceae', 'Cirsium',   3),
                ('bombus vosnesenskii', 'Rosaceae',    NULL,        2),
                ('osmia lignaria',      'Rosaceae',   'Rosa',       7),
                ('osmia lignaria',      'Fabaceae',   'Lupinus',    4)
            ) t(canonical_name, family, genus, sample_count)
            ORDER BY canonical_name, sample_count DESC
        )
        TO '{sandbox}/species_host_plants.parquet' (FORMAT PARQUET)
    """)

    # species.parquet — required by export_species_parquet before the hosts block
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

    # higher_taxa.parquet — required by _build_higher_taxa
    con.execute(f"""
        COPY (
            SELECT * FROM read_csv('{FIXTURES_DIR}/higher_taxa_fixture.csv',
                                   header=True, auto_detect=True)
        )
        TO '{sandbox}/higher_taxa.parquet' (FORMAT PARQUET)
    """)

    # occurrences.parquet — required for the seasonality block
    con.execute(
        "CREATE TABLE occ_stub "
        "(canonical_name VARCHAR, county VARCHAR, ecoregion_l3 VARCHAR, month VARCHAR)"
    )
    con.execute(
        "INSERT INTO occ_stub VALUES "
        "('bombus vosnesenskii', NULL, NULL, NULL), "
        "('osmia lignaria', NULL, NULL, NULL)"
    )
    con.execute(f"COPY occ_stub TO '{sandbox}/occurrences.parquet' (FORMAT PARQUET)")

    # species_traits.parquet — required for Phase 174 trait merge
    con.execute(f"""
        COPY (
            SELECT * FROM read_csv('{FIXTURES_DIR}/species_traits_fixture.csv',
                                   header=True, auto_detect=True)
        )
        TO '{sandbox}/species_traits.parquet' (FORMAT PARQUET)
    """)

    con.close()

    monkeypatch.setattr(se_mod, "DBT_SANDBOX_DIR", sandbox)
    monkeypatch.setattr(se_mod, "ASSETS_DIR", assets)

    # Patch _build_higher_taxa to skip the == 12 subfamily assertion (real-dataset property).
    # Mirrors the sandbox_parquet fixture in test_species_export.py.
    def _stub_build_higher_taxa(con):
        higher_taxa_parquet = se_mod.DBT_SANDBOX_DIR / "higher_taxa.parquet"
        rows = con.execute(
            f"SELECT * FROM read_parquet('{higher_taxa_parquet}') ORDER BY rank, name"
        ).fetchall()
        cols = [d[0] for d in con.description]
        higher_taxa_rows = [dict(zip(cols, r)) for r in rows]
        out = se_mod.ASSETS_DIR / "higher_taxa.json"
        out.write_text(
            json.dumps(higher_taxa_rows, sort_keys=True, indent=2), encoding="utf-8"
        )
        assert len(higher_taxa_rows) > 0
        return higher_taxa_rows

    monkeypatch.setattr(se_mod, "_build_higher_taxa", _stub_build_higher_taxa)

    return sandbox, assets


# ---------------------------------------------------------------------------
# Helper
# ---------------------------------------------------------------------------


def _load_hosts_json(assets: Path) -> dict:
    return json.loads((assets / "species_hosts.json").read_text())


def _run(sandbox, assets):
    """Run export_species_parquet with an in-memory DuckDB connection (mirrors existing tests)."""
    con = duckdb.connect()
    export_species_parquet(con)
    con.close()


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------


def test_families_ordered_by_sample_count_desc(hosts_sandbox):
    """families array is ordered by sample_count desc for each species."""
    sandbox, assets = hosts_sandbox
    _run(sandbox, assets)

    hosts = _load_hosts_json(assets)

    assert "bombus vosnesenskii" in hosts, "bombus vosnesenskii must appear in species_hosts.json"
    families = hosts["bombus vosnesenskii"]
    # Rosaceae (10 + 2 = 12) > Asteraceae (5 + 3 = 8)
    assert families[0]["family"] == "Rosaceae", (
        f"Expected Rosaceae first (sample_count=12), got {families[0]['family']}"
    )
    assert families[1]["family"] == "Asteraceae", (
        f"Expected Asteraceae second (sample_count=8), got {families[1]['family']}"
    )
    assert families[0]["sample_count"] == 12
    assert families[1]["sample_count"] == 8


def test_genera_ordered_by_sample_count_desc(hosts_sandbox):
    """genera within a family are ordered by sample_count desc."""
    sandbox, assets = hosts_sandbox
    _run(sandbox, assets)

    hosts = _load_hosts_json(assets)

    aster = next(
        (f for f in hosts["bombus vosnesenskii"] if f["family"] == "Asteraceae"),
        None,
    )
    assert aster is not None, "Asteraceae must appear for bombus vosnesenskii"
    genera = aster["genera"]
    # Solidago (5) > Cirsium (3)
    assert genera[0]["genus"] == "Solidago", (
        f"Expected Solidago first (sample_count=5), got {genera[0]}"
    )
    assert genera[1]["genus"] == "Cirsium", (
        f"Expected Cirsium second (sample_count=3), got {genera[1]}"
    )
    assert genera[0]["sample_count"] == 5
    assert genera[1]["sample_count"] == 3


def test_null_genus_contributes_to_family_count_but_not_genera(hosts_sandbox):
    """Null-genus row adds to family sample_count but emits no genus object."""
    sandbox, assets = hosts_sandbox
    _run(sandbox, assets)

    hosts = _load_hosts_json(assets)

    rosaceae = next(
        (f for f in hosts["bombus vosnesenskii"] if f["family"] == "Rosaceae"),
        None,
    )
    assert rosaceae is not None, "Rosaceae must appear for bombus vosnesenskii"
    # family sample_count includes the null-genus row: 10 + 2 = 12
    assert rosaceae["sample_count"] == 12, (
        f"Expected Rosaceae sample_count=12 (Rubus 10 + null 2), got {rosaceae['sample_count']}"
    )
    # genera list only contains Rubus (null-genus row not emitted as a genus object)
    genus_names = [g["genus"] for g in rosaceae["genera"]]
    assert genus_names == ["Rubus"], (
        f"Expected only Rubus in Rosaceae genera, got {genus_names}"
    )


def test_absent_parquet_yields_empty_object(hosts_sandbox):
    """Missing species_host_plants.parquet → empty dict written, no exception raised."""
    sandbox, assets = hosts_sandbox

    # Remove the parquet to simulate local dev without a dbt build
    (sandbox / "species_host_plants.parquet").unlink()

    # Should not raise
    _run(sandbox, assets)

    hosts = _load_hosts_json(assets)
    assert hosts == {}, (
        f"Expected empty object when parquet absent, got {list(hosts.keys())[:3]}"
    )


def test_idempotent_write(hosts_sandbox):
    """Two successive runs produce byte-identical species_hosts.json."""
    sandbox, assets = hosts_sandbox
    _run(sandbox, assets)
    first_bytes = (assets / "species_hosts.json").read_bytes()

    _run(sandbox, assets)
    second_bytes = (assets / "species_hosts.json").read_bytes()

    assert first_bytes == second_bytes, "species_hosts.json must be byte-identical across runs"


def test_equal_sample_count_breaks_ties_by_name(hosts_sandbox):
    """Families/genera at equal sample_count fall back to ascending name order.

    Without a deterministic name tiebreaker the list order churns across builds
    (the byte-stable nightly diff gate fails). sort_keys=True only orders dict
    keys, not list elements, so the idempotency test alone can't catch this.
    """
    sandbox, assets = hosts_sandbox

    # Overwrite the fixture parquet with an all-ties scenario: two families both
    # at sample_count 5, and within Asteraceae two genera both at sample_count 5.
    con = duckdb.connect()
    con.execute(f"""
        COPY (
            SELECT canonical_name, family, genus, sample_count
            FROM (VALUES
                ('andrena cerasifolii', 'Rosaceae',   'Prunus',  5),
                ('andrena cerasifolii', 'Asteraceae', 'Erigeron', 5),
                ('andrena cerasifolii', 'Asteraceae', 'Aster',    5)
            ) t(canonical_name, family, genus, sample_count)
        )
        TO '{sandbox}/species_host_plants.parquet' (FORMAT PARQUET)
    """)
    con.close()

    _run(sandbox, assets)
    families = _load_hosts_json(assets)["andrena cerasifolii"]

    # Both families have sample_count 5 → ascending family name: Asteraceae, Rosaceae
    assert [f["family"] for f in families] == ["Asteraceae", "Rosaceae"], (
        f"Equal-count families must tiebreak by name asc, got {[f['family'] for f in families]}"
    )
    # Both genera have sample_count 5 → ascending genus name: Aster, Erigeron
    aster = next(f for f in families if f["family"] == "Asteraceae")
    assert [g["genus"] for g in aster["genera"]] == ["Aster", "Erigeron"], (
        f"Equal-count genera must tiebreak by name asc, got {[g['genus'] for g in aster['genera']]}"
    )
