"""Diff assertions comparing dbt sandbox outputs against public/data outputs (Phase 84).

Scope: occurrences.parquet (row count, schema, ecdysis_id key set, spatial assignment)
       and GeoJSON files (feature counts, property-name equality).

Requirements covered:
  DIFF-01: Row count, column schema (names + types), and ecdysis_id key-set equality.
  DIFF-02: County spatial diff (84 boundary-nondeterminism rows), ecoregion_l3 diff (0 rows),
           GeoJSON feature counts, and property-name parity.

Workflow:
  1. Run: bash data/dbt/run.sh build
  2. Run: uv run --project data pytest data/tests/test_dbt_diff.py -x
"""

import json
from pathlib import Path

import duckdb
import pytest


SANDBOX = Path(__file__).resolve().parent.parent / "dbt" / "target" / "sandbox"
PUBLIC = Path(__file__).resolve().parent.parent.parent / "public" / "data"

_SANDBOX_GUARD = pytest.mark.skipif(
    not (SANDBOX / "occurrences.parquet").exists(),
    reason="run `bash data/dbt/run.sh build` first to produce sandbox outputs",
)

# ---------------------------------------------------------------------------
# DIFF-01: Row count, schema, and ecdysis_id key-set equality
# ---------------------------------------------------------------------------


@_SANDBOX_GUARD
def test_occurrences_row_count_matches():
    """Sandbox occurrences.parquet has the same row count as public/data/occurrences.parquet.

    Verified baseline: both 47,883 rows.
    """
    s = duckdb.execute(
        f"SELECT COUNT(*) FROM read_parquet('{SANDBOX}/occurrences.parquet')"
    ).fetchone()[0]
    p = duckdb.execute(
        f"SELECT COUNT(*) FROM read_parquet('{PUBLIC}/occurrences.parquet')"
    ).fetchone()[0]
    assert s == p, f"Row count mismatch: sandbox={s}, public={p}"


@_SANDBOX_GUARD
def test_occurrences_schema_matches():
    """Column names AND types from DESCRIBE match exactly between sandbox and public (33 cols).

    Asserts the full ordered list of (column_name, data_type) pairs is identical.
    Verified baseline: 33 columns with identical names and types in both files.
    """
    s_cols = [
        (r[0], r[1])
        for r in duckdb.execute(
            f"DESCRIBE SELECT * FROM read_parquet('{SANDBOX}/occurrences.parquet')"
        ).fetchall()
    ]
    p_cols = [
        (r[0], r[1])
        for r in duckdb.execute(
            f"DESCRIBE SELECT * FROM read_parquet('{PUBLIC}/occurrences.parquet')"
        ).fetchall()
    ]
    assert s_cols == p_cols, (
        f"Schema mismatch (column_name, data_type) pairs differ.\n"
        f"Sandbox only: {[c for c in s_cols if c not in p_cols]}\n"
        f"Public only:  {[c for c in p_cols if c not in s_cols]}"
    )


@_SANDBOX_GUARD
def test_occurrences_ecdysis_key_set_matches():
    """COUNT(DISTINCT ecdysis_id) WHERE ecdysis_id IS NOT NULL is identical in both files.

    Verified baseline: 46,090 distinct ecdysis_ids in both.
    """
    s = duckdb.execute(
        f"SELECT COUNT(DISTINCT ecdysis_id) FROM read_parquet('{SANDBOX}/occurrences.parquet')"
        " WHERE ecdysis_id IS NOT NULL"
    ).fetchone()[0]
    p = duckdb.execute(
        f"SELECT COUNT(DISTINCT ecdysis_id) FROM read_parquet('{PUBLIC}/occurrences.parquet')"
        " WHERE ecdysis_id IS NOT NULL"
    ).fetchone()[0]
    assert s == p, f"ecdysis_id key-set size mismatch: sandbox={s}, public={p}"


@_SANDBOX_GUARD
def test_occurrences_ecdysis_id_join_full():
    """Full anti-join: ecdysis_ids present in one file but absent in the other must be 0.

    Same cardinality alone does not prove identical key sets; this test checks both
    directions of the EXCEPT query (sandbox minus public and public minus sandbox).
    Verified baseline: 0 rows in both directions.
    """
    only_in_sandbox = duckdb.execute(
        f"""
        SELECT COUNT(*) FROM (
            SELECT ecdysis_id FROM read_parquet('{SANDBOX}/occurrences.parquet')
            WHERE ecdysis_id IS NOT NULL
            EXCEPT
            SELECT ecdysis_id FROM read_parquet('{PUBLIC}/occurrences.parquet')
            WHERE ecdysis_id IS NOT NULL
        )
        """
    ).fetchone()[0]
    only_in_public = duckdb.execute(
        f"""
        SELECT COUNT(*) FROM (
            SELECT ecdysis_id FROM read_parquet('{PUBLIC}/occurrences.parquet')
            WHERE ecdysis_id IS NOT NULL
            EXCEPT
            SELECT ecdysis_id FROM read_parquet('{SANDBOX}/occurrences.parquet')
            WHERE ecdysis_id IS NOT NULL
        )
        """
    ).fetchone()[0]
    assert only_in_sandbox == 0, (
        f"{only_in_sandbox} ecdysis_ids are in sandbox but not public (expected 0)"
    )
    assert only_in_public == 0, (
        f"{only_in_public} ecdysis_ids are in public but not sandbox (expected 0)"
    )


# ---------------------------------------------------------------------------
# DIFF-02: Spatial join discrepancies and GeoJSON parity
# ---------------------------------------------------------------------------


@_SANDBOX_GUARD
def test_occurrences_county_spatial_diff():
    """Rows where sandbox.county != public.county (joined on ecdysis_id) must equal 84.

    DIFF-03 classification: semantic divergence to investigate.
    Root cause: ST_Within returns True for two polygons simultaneously at the
    Benton/Grant and Chelan/King county boundaries. Neither export.py nor dbt
    deduplicates the with_county LEFT JOIN before the fallback path — both
    implementations are nondeterministic at these boundary edges.

    The expected value 84 is pinned empirically (pre-research baseline). If this
    count changes, investigate new boundary-overlap cases or a change in the
    geometry data.
    """
    n = duckdb.execute(
        f"""
        SELECT COUNT(*) AS diff_rows
        FROM read_parquet('{SANDBOX}/occurrences.parquet') s
        JOIN read_parquet('{PUBLIC}/occurrences.parquet') p
          ON s.ecdysis_id = p.ecdysis_id
         AND s.ecdysis_id IS NOT NULL
         AND p.ecdysis_id IS NOT NULL
        WHERE s.county != p.county
        """
    ).fetchone()[0]

    if n != 84:
        # Diagnostic: show up to 10 divergent rows for investigation.
        sample = duckdb.execute(
            f"""
            SELECT s.ecdysis_id, s.county AS sandbox_county, p.county AS public_county
            FROM read_parquet('{SANDBOX}/occurrences.parquet') s
            JOIN read_parquet('{PUBLIC}/occurrences.parquet') p
              ON s.ecdysis_id = p.ecdysis_id
             AND s.ecdysis_id IS NOT NULL
             AND p.ecdysis_id IS NOT NULL
            WHERE s.county != p.county
            LIMIT 10
            """
        ).fetchall()
        assert n == 84, (
            f"County diff count is {n}, expected 84 boundary-nondeterminism rows.\n"
            f"Sample divergent rows (ecdysis_id, sandbox_county, public_county):\n"
            f"{sample}"
        )

    assert n == 84, (
        f"County diff count is {n}, expected 84 boundary-nondeterminism rows."
    )


@_SANDBOX_GUARD
def test_occurrences_ecoregion_spatial_diff():
    """Rows where sandbox.ecoregion_l3 != public.ecoregion_l3 must be 0.

    Verified baseline: 0 rows differ in ecoregion_l3 assignment.
    """
    n = duckdb.execute(
        f"""
        SELECT COUNT(*) AS diff_rows
        FROM read_parquet('{SANDBOX}/occurrences.parquet') s
        JOIN read_parquet('{PUBLIC}/occurrences.parquet') p
          ON s.ecdysis_id = p.ecdysis_id
         AND s.ecdysis_id IS NOT NULL
         AND p.ecdysis_id IS NOT NULL
        WHERE s.ecoregion_l3 != p.ecoregion_l3
        """
    ).fetchone()[0]
    assert n == 0, f"{n} rows differ in ecoregion_l3 (expected 0)"


@pytest.mark.skipif(
    not (SANDBOX / "counties.geojson").exists(),
    reason="run `bash data/dbt/run.sh build` first to produce sandbox outputs",
)
def test_counties_geojson_feature_count_matches():
    """counties.geojson has the same feature count in sandbox and public/data (both 39)."""
    s = json.loads((SANDBOX / "counties.geojson").read_text())
    p = json.loads((PUBLIC / "counties.geojson").read_text())
    assert len(s["features"]) == len(p["features"]), (
        f"counties.geojson feature count mismatch: sandbox={len(s['features'])}, "
        f"public={len(p['features'])}"
    )


@pytest.mark.skipif(
    not (SANDBOX / "ecoregions.geojson").exists(),
    reason="run `bash data/dbt/run.sh build` first to produce sandbox outputs",
)
def test_ecoregions_geojson_feature_count_matches():
    """ecoregions.geojson has the same feature count in sandbox and public/data (both 66)."""
    s = json.loads((SANDBOX / "ecoregions.geojson").read_text())
    p = json.loads((PUBLIC / "ecoregions.geojson").read_text())
    assert len(s["features"]) == len(p["features"]), (
        f"ecoregions.geojson feature count mismatch: sandbox={len(s['features'])}, "
        f"public={len(p['features'])}"
    )


@pytest.mark.skipif(
    not (SANDBOX / "counties.geojson").exists(),
    reason="run `bash data/dbt/run.sh build` first to produce sandbox outputs",
)
@pytest.mark.parametrize(
    "filename, prop",
    [
        ("counties.geojson", "NAME"),
        ("ecoregions.geojson", "NA_L3NAME"),
    ],
)
def test_geojson_property_names_match(filename, prop):
    """Sorted property-value lists are exactly equal between sandbox and public/data.

    For counties: checks the NAME property (39 WA county names).
    For ecoregions: checks the NA_L3NAME property (66 L3 ecoregion names).
    Verified baseline: name lists match exactly in both files.
    """
    s_data = json.loads((SANDBOX / filename).read_text())
    p_data = json.loads((PUBLIC / filename).read_text())
    s_names = sorted(f["properties"][prop] for f in s_data["features"])
    p_names = sorted(f["properties"][prop] for f in p_data["features"])
    assert s_names == p_names, (
        f"{filename} '{prop}' name lists differ.\n"
        f"Only in sandbox: {[n for n in s_names if n not in p_names]}\n"
        f"Only in public:  {[n for n in p_names if n not in s_names]}"
    )
