"""Tests for the higher_taxa dbt rollup model (PAGE-01, PAGE-04, D-08).

All sandbox-gated tests skip when `target/sandbox/higher_taxa.parquet` is absent
(RED state until Task 2 materializes the mart).

PAGE-01 success criterion 1 requires higher-rank page totals to derive from the
hierarchy AND match the pre-normalization string-grouping. The robust, snapshot-
independent way to assert this is to compare the rollup against the per-species
string-group SUM on the SAME species mart — NOT against hardcoded absolute counts.
Absolute counts drift with every data refresh: Phase 131 occurrence-normalization
roughly halved iNat observation counts (e.g. Andrena 2735 -> 1477) and shifted some
specimen counts (Lasioglossum 1718 -> 1742) relative to the previously-deployed
species.json the RESEARCH baselines were captured from. We therefore spot-check a
set of taxa spanning multiple bee families and assert rollup == string-group sum.

Run after `bash data/dbt/run.sh build --select higher_taxa species`:
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
# Count equivalence spot-checks (PAGE-01 success criterion 1)
#
# Spot-check taxa spanning multiple bee families. We assert the rollup equals the
# per-species string-group SUM on the SAME mart rather than hardcoding absolute
# counts, which drift every data refresh (see module docstring).
# ---------------------------------------------------------------------------

GENUS_SPOT_CHECK = ["Andrena", "Bombus", "Megachile", "Lasioglossum", "Osmia", "Nomada"]
TRIBE_SPOT_CHECK = ["Bombini", "Andrenini", "Osmiini"]
SUBGENUS_SPOT_CHECK = ["Pyrobombus"]

_SPECIES_GUARD = pytest.mark.skipif(
    not SPECIES_PARQUET.exists(),
    reason="run `bash data/dbt/run.sh build --select species` first to produce species.parquet",
)


def _string_group_sum(rank_col: str, name: str) -> tuple[int, int]:
    """SUM(specimen_count), SUM(inat_obs_count) over species-mart rows for one higher taxon."""
    con = duckdb.connect()
    return con.execute(
        f"""
        SELECT COALESCE(SUM(specimen_count), 0), COALESCE(SUM(inat_obs_count), 0)
        FROM read_parquet('{SPECIES_PARQUET}')
        WHERE {rank_col} = ?
        """,
        [name],
    ).fetchone()


def _rollup_counts(rank: str, name: str) -> tuple:
    con = duckdb.connect()
    return con.execute(
        f"""
        SELECT specimen_count, inat_obs_count
        FROM read_parquet('{HIGHER_TAXA_PARQUET}')
        WHERE rank = ? AND name = ?
        """,
        [rank, name],
    ).fetchone()


@_SANDBOX_GUARD
@_SPECIES_GUARD
@pytest.mark.parametrize("name", GENUS_SPOT_CHECK)
def test_genus_rollup_matches_string_group(name):
    """Genus rollup (specimen, inat_obs) == per-species string-group SUM (PAGE-01)."""
    row = _rollup_counts("genus", name)
    assert row is not None, f"Genus '{name}' not found in higher_taxa"
    assert tuple(row) == _string_group_sum("genus", name), (
        f"Genus {name}: rollup {tuple(row)} != string-group {_string_group_sum('genus', name)}"
    )


@_SANDBOX_GUARD
@_SPECIES_GUARD
@pytest.mark.parametrize("name", TRIBE_SPOT_CHECK)
def test_tribe_rollup_matches_string_group(name):
    """Tribe rollup (specimen, inat_obs) == per-species string-group SUM (PAGE-01)."""
    row = _rollup_counts("tribe", name)
    assert row is not None, f"Tribe '{name}' not found in higher_taxa"
    assert tuple(row) == _string_group_sum("tribe", name), (
        f"Tribe {name}: rollup {tuple(row)} != string-group {_string_group_sum('tribe', name)}"
    )


@_SANDBOX_GUARD
@_SPECIES_GUARD
@pytest.mark.parametrize("name", SUBGENUS_SPOT_CHECK)
def test_subgenus_rollup_matches_string_group(name):
    """Subgenus rollup (specimen, inat_obs) == per-species string-group SUM (PAGE-01)."""
    row = _rollup_counts("subgenus", name)
    assert row is not None, f"Subgenus '{name}' not found in higher_taxa"
    assert tuple(row) == _string_group_sum("subgenus", name), (
        f"Subgenus {name}: rollup {tuple(row)} != string-group {_string_group_sum('subgenus', name)}"
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
    """EVERY genus rollup count equals SUM of its member species counts.

    Covers specimen_count, inat_obs_count, and occurrence_count for all genera
    (not just the named spot-checks). Validates no fan-out from the name-match
    JOIN (RESEARCH.md Pitfall 1) AND that the hierarchy rollup reproduces the
    pre-normalization string-grouping (PAGE-01). Requires species.parquet.
    """
    if not SPECIES_PARQUET.exists():
        pytest.skip(
            "run `bash data/dbt/run.sh build --select species` first to produce species.parquet"
        )
    con = duckdb.connect()
    # Per-species sums grouped by genus (from species mart)
    species_sums = con.execute(
        f"""
        SELECT genus,
               SUM(specimen_count)   AS spec_sum,
               SUM(inat_obs_count)   AS obs_sum,
               SUM(occurrence_count) AS occ_sum
        FROM read_parquet('{SPECIES_PARQUET}')
        WHERE genus IS NOT NULL AND genus <> ''
        GROUP BY genus
        """
    ).fetchall()
    species_sum_by_genus = {row[0]: (row[1], row[2], row[3]) for row in species_sums}

    # Rollup genus rows
    rollup_rows = con.execute(
        f"""
        SELECT name, specimen_count, inat_obs_count, occurrence_count
        FROM read_parquet('{HIGHER_TAXA_PARQUET}')
        WHERE rank = 'genus'
        """
    ).fetchall()

    mismatches = []
    for name, spec, obs, occ in rollup_rows:
        expected = species_sum_by_genus.get(name, (0, 0, 0))
        if (spec, obs, occ) != expected:
            mismatches.append((name, (spec, obs, occ), expected))

    assert not mismatches, (
        f"Genus rollup count mismatches (Pitfall 1 fan-out / PAGE-01 string-group): {mismatches[:5]}"
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
