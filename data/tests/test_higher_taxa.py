"""Tests for the higher_taxa dbt rollup model (PAGE-01, PAGE-04, D-08).

All sandbox-gated tests skip when `target/sandbox/higher_taxa.parquet` is absent
(RED state until Task 2 materializes the mart).

Baselines from RESEARCH.md §Data Facts (derived from current string-grouping in species.json):
  Genus:    Andrena 3589/2735, Bombus 1768/7763, Megachile 1186/480,
            Lasioglossum 1718/115, Osmia 1110/450, Nomada 565/616
  Tribe:    Bombini 1768/7763, Andrenini 3589/2735, Osmiini 1696/483
  Subgenus: Bombus/Pyrobombus specimen_count == 1465

Run after `bash data/dbt/run.sh build --select higher_taxa`:
    cd data && uv run pytest tests/test_higher_taxa.py -x
"""

from pathlib import Path

import duckdb
import pytest

SANDBOX = Path(__file__).resolve().parent.parent / "dbt" / "target" / "sandbox"
HIGHER_TAXA_PARQUET = SANDBOX / "higher_taxa.parquet"
SPECIES_PARQUET = SANDBOX / "species.parquet"

_SANDBOX_GUARD = pytest.mark.skipif(
    not HIGHER_TAXA_PARQUET.exists(),
    reason=(
        "run `bash data/dbt/run.sh build --select higher_taxa` first "
        "to produce sandbox higher_taxa.parquet"
    ),
)


def _load_higher_taxa() -> list[dict]:
    """Read all rows from higher_taxa.parquet as list of dicts."""
    con = duckdb.connect()
    rows = con.execute(
        f"SELECT * FROM read_parquet('{HIGHER_TAXA_PARQUET}')"
    ).fetchall()
    cols = [d[0] for d in con.description]
    return [dict(zip(cols, r)) for r in rows]


# ---------------------------------------------------------------------------
# Genus count baselines (RESEARCH §Data Facts)
# ---------------------------------------------------------------------------

GENUS_BASELINES = [
    ("Andrena",     3589, 2735),
    ("Bombus",      1768, 7763),
    ("Megachile",   1186,  480),
    ("Lasioglossum",1718,  115),
    ("Osmia",       1110,  450),
    ("Nomada",       565,  616),
]

TRIBE_BASELINES = [
    ("Bombini",  1768, 7763),
    ("Andrenini",3589, 2735),
    ("Osmiini",  1696,  483),
]

PYROBOMBUS_SPECIMEN_BASELINE = 1465


@_SANDBOX_GUARD
@pytest.mark.parametrize("name,expected_spec,expected_obs", GENUS_BASELINES)
def test_genus_count_baselines(name, expected_spec, expected_obs):
    """Genus rollup specimen/inat_obs counts match RESEARCH.md baselines (PAGE-01)."""
    con = duckdb.connect()
    row = con.execute(
        f"""
        SELECT specimen_count, inat_obs_count
        FROM read_parquet('{HIGHER_TAXA_PARQUET}')
        WHERE rank = 'genus' AND name = ?
        """,
        [name],
    ).fetchone()
    assert row is not None, f"Genus '{name}' not found in higher_taxa"
    got_spec, got_obs = row
    assert got_spec == expected_spec, (
        f"Genus {name}: expected specimen_count={expected_spec}, got {got_spec}"
    )
    assert got_obs == expected_obs, (
        f"Genus {name}: expected inat_obs_count={expected_obs}, got {got_obs}"
    )


@_SANDBOX_GUARD
@pytest.mark.parametrize("name,expected_spec,expected_obs", TRIBE_BASELINES)
def test_tribe_count_baselines(name, expected_spec, expected_obs):
    """Tribe rollup counts match RESEARCH.md baselines."""
    con = duckdb.connect()
    row = con.execute(
        f"""
        SELECT specimen_count, inat_obs_count
        FROM read_parquet('{HIGHER_TAXA_PARQUET}')
        WHERE rank = 'tribe' AND name = ?
        """,
        [name],
    ).fetchone()
    assert row is not None, f"Tribe '{name}' not found in higher_taxa"
    got_spec, got_obs = row
    assert got_spec == expected_spec, (
        f"Tribe {name}: expected specimen_count={expected_spec}, got {got_spec}"
    )
    assert got_obs == expected_obs, (
        f"Tribe {name}: expected inat_obs_count={expected_obs}, got {got_obs}"
    )


@_SANDBOX_GUARD
def test_subgenus_pyrobombus_specimen_baseline():
    """Subgenus Bombus/Pyrobombus specimen_count == 1465 (RESEARCH.md baseline)."""
    con = duckdb.connect()
    row = con.execute(
        f"""
        SELECT specimen_count
        FROM read_parquet('{HIGHER_TAXA_PARQUET}')
        WHERE rank = 'subgenus' AND name = 'Pyrobombus'
        """,
    ).fetchone()
    assert row is not None, "Subgenus 'Pyrobombus' not found in higher_taxa"
    assert row[0] == PYROBOMBUS_SPECIMEN_BASELINE, (
        f"Pyrobombus specimen_count: expected {PYROBOMBUS_SPECIMEN_BASELINE}, got {row[0]}"
    )


# ---------------------------------------------------------------------------
# Subfamily count: exactly 12; no Eumeninae (D-08 / HIER-05)
# ---------------------------------------------------------------------------

@_SANDBOX_GUARD
def test_exactly_12_subfamilies():
    """Exactly 12 bee subfamily rows appear in higher_taxa (D-08)."""
    con = duckdb.connect()
    count = con.execute(
        f"SELECT COUNT(*) FROM read_parquet('{HIGHER_TAXA_PARQUET}') WHERE rank = 'subfamily'"
    ).fetchone()[0]
    assert count == 12, f"Expected exactly 12 subfamily rows, got {count}"


@_SANDBOX_GUARD
def test_eumeninae_absent():
    """Eumeninae (wasp bycatch) must not appear in higher_taxa subfamilies (HIER-05)."""
    con = duckdb.connect()
    count = con.execute(
        f"""
        SELECT COUNT(*)
        FROM read_parquet('{HIGHER_TAXA_PARQUET}')
        WHERE rank = 'subfamily' AND name = 'Eumeninae'
        """,
    ).fetchone()[0]
    assert count == 0, "Eumeninae found in higher_taxa — wasp bycatch must be excluded (D-08)"


# ---------------------------------------------------------------------------
# Count equivalence: rollup == SUM of per-species counts (Pitfall 1 guard)
# ---------------------------------------------------------------------------

@_SANDBOX_GUARD
def test_genus_rollup_equals_species_sum():
    """Every genus rollup specimen_count equals SUM of its member species specimen_count.

    Validates no fan-out from the name-match JOIN (RESEARCH.md Pitfall 1).
    Requires species.parquet to also be present.
    """
    if not SPECIES_PARQUET.exists():
        pytest.skip(
            "run `bash data/dbt/run.sh build --select species` first to produce species.parquet"
        )
    con = duckdb.connect()
    # Per-species sums grouped by genus (from species mart)
    species_sums = con.execute(
        f"""
        SELECT genus, SUM(specimen_count) AS spec_sum
        FROM read_parquet('{SPECIES_PARQUET}')
        WHERE genus IS NOT NULL AND genus <> ''
        GROUP BY genus
        """
    ).fetchall()
    species_sum_by_genus = {row[0]: row[1] for row in species_sums}

    # Rollup genus rows
    rollup_rows = con.execute(
        f"""
        SELECT name, specimen_count
        FROM read_parquet('{HIGHER_TAXA_PARQUET}')
        WHERE rank = 'genus'
        """
    ).fetchall()

    mismatches = []
    for name, rollup_count in rollup_rows:
        expected = species_sum_by_genus.get(name, 0)
        if rollup_count != expected:
            mismatches.append((name, rollup_count, expected))

    assert not mismatches, (
        f"Genus rollup count mismatches (Pitfall 1 fan-out check): {mismatches[:5]}"
    )


# ---------------------------------------------------------------------------
# Checklist-only species are in genus membership (PAGE-04)
# ---------------------------------------------------------------------------

@_SANDBOX_GUARD
def test_checklist_only_species_in_membership():
    """At least one checklist-only species (occurrence_count=0, on_checklist=True)
    is present as a member of some genus in the member_taxon_ids column (PAGE-04).

    Validates that D-04/D-09 checklist-only species are included in rollup membership.
    """
    if not SPECIES_PARQUET.exists():
        pytest.skip(
            "run `bash data/dbt/run.sh build --select species` first to produce species.parquet"
        )
    con = duckdb.connect()

    # Get checklist-only species taxon_ids from the species mart
    checklist_only = con.execute(
        f"""
        SELECT taxon_id
        FROM read_parquet('{SPECIES_PARQUET}')
        WHERE occurrence_count = 0 AND on_checklist = TRUE AND taxon_id IS NOT NULL
        LIMIT 100
        """
    ).fetchall()

    if not checklist_only:
        pytest.skip("No checklist-only species found in species.parquet — cannot test PAGE-04")

    checklist_tids = {str(row[0]) for row in checklist_only}

    # Check that at least one of these taxon_ids appears somewhere in member_taxon_ids
    # member_taxon_ids is a JSON array of integer taxon_ids as a varchar column
    genus_members = con.execute(
        f"""
        SELECT name, member_taxon_ids
        FROM read_parquet('{HIGHER_TAXA_PARQUET}')
        WHERE rank = 'genus' AND member_taxon_ids IS NOT NULL
        """
    ).fetchall()

    found_any = False
    for genus_name, member_ids_json in genus_members:
        if member_ids_json is None:
            continue
        # member_taxon_ids is a JSON array string like "[12345, 67890]"
        import json
        try:
            member_ids = {str(tid) for tid in json.loads(member_ids_json)}
        except (json.JSONDecodeError, TypeError):
            continue
        if member_ids & checklist_tids:
            found_any = True
            break

    assert found_any, (
        "No checklist-only species found in any genus's member_taxon_ids — "
        "PAGE-04 requires checklist-only species to be included in rollup membership"
    )


# ---------------------------------------------------------------------------
# Schema sanity: taxon_id is unique, rank and name are not null
# ---------------------------------------------------------------------------

@_SANDBOX_GUARD
def test_taxon_id_unique_not_null():
    """higher_taxa.taxon_id is unique and not null (contract enforcement test)."""
    con = duckdb.connect()
    total = con.execute(
        f"SELECT COUNT(*) FROM read_parquet('{HIGHER_TAXA_PARQUET}')"
    ).fetchone()[0]
    distinct = con.execute(
        f"SELECT COUNT(DISTINCT taxon_id) FROM read_parquet('{HIGHER_TAXA_PARQUET}')"
    ).fetchone()[0]
    null_count = con.execute(
        f"SELECT COUNT(*) FROM read_parquet('{HIGHER_TAXA_PARQUET}') WHERE taxon_id IS NULL"
    ).fetchone()[0]
    assert null_count == 0, f"higher_taxa has {null_count} rows with null taxon_id"
    assert distinct == total, (
        f"higher_taxa has duplicate taxon_ids: {total} rows but only {distinct} distinct taxon_ids"
    )


@_SANDBOX_GUARD
def test_member_taxon_ids_column_present():
    """higher_taxa has a member_taxon_ids column (D-10 membership contract)."""
    con = duckdb.connect()
    cols = [d[0] for d in con.execute(
        f"SELECT * FROM read_parquet('{HIGHER_TAXA_PARQUET}') LIMIT 1"
    ).description]
    assert "member_taxon_ids" in cols, (
        f"member_taxon_ids column missing from higher_taxa.parquet — columns: {cols}"
    )
