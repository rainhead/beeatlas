"""Diff assertions comparing dbt sandbox outputs against public/data outputs (Phase 84).

Scope: occurrences.parquet (row count, schema, ecdysis_id key set, spatial assignment)
       and GeoJSON files (feature counts, property-name equality).

These run as the nightly publish gate, comparing a *fresh* build against the
*currently-live* data. The two data snapshots legitimately differ run-to-run —
new iNat/Ecdysis records grow the data, the anti-entropy pipeline shrinks it by
detecting upstream deletions — so volume/membership checks are bounded, not exact:
counts must stay within [-2%, +5%] of live (_assert_count_within_tolerance) and key/
name sets may add freely but lose at most -2% (_assert_set_drift_within_tolerance).
Structural invariants that must hold regardless of data volume stay strict: column
schema, the inner-join spatial-assignment diffs (same specimen → same county/ecoregion),
and the GeoJSON region-name sets. The gate's job is to catch a transform *regression*,
not routine data drift.

Requirements covered:
  DIFF-01: Row count and ecdysis_id/host_observation_id key-set drift bounded;
           column schema (names + types) exact.
  DIFF-02: County spatial diff (0 rows after #14 switched counties to CB 5m;
           was 84 boundary-nondeterminism rows on TIGER tl_), ecoregion_l3 diff (0 rows),
           GeoJSON feature counts, and property-name parity.

Workflow:
  1. Run: bash data/dbt/run.sh build
  2. Run: uv run --project data pytest data/tests/test_dbt_diff.py -x
"""

import json
from pathlib import Path

import duckdb
import pytest

pytestmark = pytest.mark.integration

SANDBOX = Path(__file__).resolve().parent.parent / "dbt" / "target" / "sandbox"
PUBLIC = Path(__file__).resolve().parent.parent.parent / "public" / "data"

_SANDBOX_GUARD = pytest.mark.skipif(
    not (SANDBOX / "occurrences.parquet").exists(),
    reason="[integration] sandbox outputs absent — run `bash data/dbt/run.sh build` first",
)

# Occurrence/species counts legitimately drift between publishes: new iNat
# observations and newly-databased Ecdysis records grow the set, while the
# anti-entropy pipeline can shrink it by detecting upstream-deleted observations.
# The nightly gate compares a fresh build against the currently-live data, so an
# exact-equality assertion fails on every routine data change and blocks the
# publish. We instead bound the drift: the gate exists to catch a *transform
# regression* (mass row loss or duplication), not normal data movement.
COUNT_TOLERANCE_LOWER = 0.98  # -2%: headroom for anti-entropy deletions
COUNT_TOLERANCE_UPPER = 1.05  # +5%: headroom for new observations


def _assert_count_within_tolerance(sandbox: int, public: int, label: str) -> None:
    """Assert the fresh sandbox count is within [-2%, +5%] of the live baseline."""
    lo = public * COUNT_TOLERANCE_LOWER
    hi = public * COUNT_TOLERANCE_UPPER
    pct = (sandbox / public - 1) * 100 if public else float("inf")
    assert lo <= sandbox <= hi, (
        f"{label} count {sandbox} is outside the tolerance band "
        f"[{lo:.0f}, {hi:.0f}] around live baseline {public} ({pct:+.1f}%). "
        f"Counts may drift -2%/+5% run-to-run; a larger swing signals a transform "
        f"regression or an upstream data event worth reviewing before publish."
    )


# Anti-entropy can drop a key/name when its last backing observation is deleted
# upstream, so a key-set comparison can't require exact equality either. We allow
# additions freely (the count band above bounds mass insertion) and bound only the
# *disappearances* — a large drop is the regression signature (lost join, dbt
# filter gone wrong) the gate must still catch.
SET_REMOVAL_TOLERANCE = round(1 - COUNT_TOLERANCE_LOWER, 4)  # 0.02: -2% of the baseline set may vanish


def _assert_set_drift_within_tolerance(
    only_in_sandbox: int, only_in_public: int, public_total: int, label: str
) -> None:
    """Additions are fine; disappearances vs the live baseline are bounded to -2%."""
    max_removed = public_total * SET_REMOVAL_TOLERANCE
    assert only_in_public <= max_removed, (
        f"{label}: {only_in_public} values present in live data are missing from the "
        f"fresh build (allowed up to {max_removed:.0f} = {SET_REMOVAL_TOLERANCE * 100:.0f}% "
        f"of the {public_total} live values). A larger drop signals a transform regression "
        f"or mass upstream deletion — review before publish. "
        f"({only_in_sandbox} newly-added values are expected and allowed.)"
    )

# ---------------------------------------------------------------------------
# DIFF-01: Row count, schema, and ecdysis_id key-set equality
# ---------------------------------------------------------------------------


@_SANDBOX_GUARD
def test_occurrences_row_count_within_tolerance():
    """Sandbox occurrences.parquet row count is within [-2%, +5%] of public/data.

    Exact equality would block the nightly publish on any new/deleted observation
    (see _assert_count_within_tolerance). The band catches mass row loss or
    duplication from a transform regression while letting routine data drift through.
    """
    s = duckdb.execute(
        f"SELECT COUNT(*) FROM read_parquet('{SANDBOX}/occurrences.parquet')"
    ).fetchone()[0]
    p = duckdb.execute(
        f"SELECT COUNT(*) FROM read_parquet('{PUBLIC}/occurrences.parquet')"
    ).fetchone()[0]
    _assert_count_within_tolerance(s, p, "occurrences")


@_SANDBOX_GUARD
def test_occurrences_schema_matches():
    """Column names AND types from DESCRIBE match exactly between sandbox and public (37 cols).

    Asserts the full ordered list of (column_name, data_type) pairs is identical.
    Verified baseline: 37 columns with identical names and types in both files.
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
def test_occurrences_ecdysis_key_set_within_tolerance():
    """COUNT(DISTINCT non-null ecdysis_id) is within [-2%, +5%] of the live baseline.

    New Ecdysis specimens grow this set; anti-entropy deletions shrink it. Exact
    equality would block the publish on either, so we bound the drift instead.
    """
    s = duckdb.execute(
        f"SELECT COUNT(DISTINCT ecdysis_id) FROM read_parquet('{SANDBOX}/occurrences.parquet')"
        " WHERE ecdysis_id IS NOT NULL"
    ).fetchone()[0]
    p = duckdb.execute(
        f"SELECT COUNT(DISTINCT ecdysis_id) FROM read_parquet('{PUBLIC}/occurrences.parquet')"
        " WHERE ecdysis_id IS NOT NULL"
    ).fetchone()[0]
    _assert_count_within_tolerance(s, p, "ecdysis_id key-set")


@_SANDBOX_GUARD
def test_occurrences_ecdysis_id_drift_bounded():
    """ecdysis_ids in live but absent from the fresh build are bounded to -2%.

    Same cardinality alone does not prove the right keys moved; this checks both
    directions of the EXCEPT query. New ecdysis_ids in the fresh build are routine
    growth (allowed); ecdysis_ids that vanished vs live are bounded — a large drop
    is the regression signature (broken join, lost rows) the gate must catch.
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
    public_total = duckdb.execute(
        f"SELECT COUNT(DISTINCT ecdysis_id) FROM read_parquet('{PUBLIC}/occurrences.parquet')"
        " WHERE ecdysis_id IS NOT NULL"
    ).fetchone()[0]
    _assert_set_drift_within_tolerance(
        only_in_sandbox, only_in_public, public_total, "ecdysis_id key set"
    )


@_SANDBOX_GUARD
def test_occurrences_host_observation_id_drift_bounded():
    """host_observation_id (the `inat:<id>` sample key): disappearances bounded to -2%.

    DIFF-01 names both ecdysis_id and inat:<id> as the key sets to guard. New samples
    add host_observation_ids (allowed); samples deleted upstream by anti-entropy remove
    them (bounded). A large drop is the regression signal the gate must catch.
    """
    only_in_sandbox = duckdb.execute(
        f"""
        SELECT COUNT(*) FROM (
            SELECT host_observation_id FROM read_parquet('{SANDBOX}/occurrences.parquet')
            WHERE host_observation_id IS NOT NULL
            EXCEPT
            SELECT host_observation_id FROM read_parquet('{PUBLIC}/occurrences.parquet')
            WHERE host_observation_id IS NOT NULL
        )
        """
    ).fetchone()[0]
    only_in_public = duckdb.execute(
        f"""
        SELECT COUNT(*) FROM (
            SELECT host_observation_id FROM read_parquet('{PUBLIC}/occurrences.parquet')
            WHERE host_observation_id IS NOT NULL
            EXCEPT
            SELECT host_observation_id FROM read_parquet('{SANDBOX}/occurrences.parquet')
            WHERE host_observation_id IS NOT NULL
        )
        """
    ).fetchone()[0]
    public_total = duckdb.execute(
        f"SELECT COUNT(DISTINCT host_observation_id) FROM read_parquet('{PUBLIC}/occurrences.parquet')"
        " WHERE host_observation_id IS NOT NULL"
    ).fetchone()[0]
    _assert_set_drift_within_tolerance(
        only_in_sandbox, only_in_public, public_total, "host_observation_id key set"
    )


# ---------------------------------------------------------------------------
# DIFF-02: Spatial join discrepancies and GeoJSON parity
# ---------------------------------------------------------------------------


@_SANDBOX_GUARD
def test_occurrences_county_spatial_diff():
    """Rows where sandbox.county != public.county (joined on ecdysis_id) must equal 0.

    Issue #14 / quick task 260514-fp3 switched the county data source from
    TIGER tl_2024_us_county (which had ~192 km² of overlap polygons between
    adjacent WA counties at the Benton/Grant and Chelan/King boundaries,
    plus 69 other adjacencies) to Census Cartographic Boundary 1:5M (cb_5m),
    which is topology-clean. The 84 boundary-nondeterminism rows that were
    pinned empirically before that switch are now 0.

    If this count grows above 0 again, investigate whether: (1) a new
    boundary-overlap case has been introduced upstream, (2) the spatial
    extension's ST_Within tiebreaking has changed, or (3) the WA county
    set has changed.
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

    if n != 0:
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
        raise AssertionError(
            f"County diff count is {n}, expected 0 (post-#14 CB 5m clean topology).\n"
            f"Sample divergent rows (ecdysis_id, sandbox_county, public_county):\n"
            f"{sample}"
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
    """public ecoregions.geojson keeps every distinct L3 region from the sandbox.

    topology-postprocess (mapshaper -clean gap-fill-area=0.01km2, #14) intentionally
    folds sub-hectare sliver polygons into surrounding water, so public has the
    same-or-fewer features than the pre-postprocess sandbox (currently 64 of 66 —
    2 sub-hectare "Strait of Georgia/Puget Lowland" rocks dropped). The invariant is
    therefore NOT equal counts but that simplification never drops a whole named L3
    region: public <= sandbox AND the distinct NA_L3NAME set is preserved.
    """
    s = json.loads((SANDBOX / "ecoregions.geojson").read_text())
    p = json.loads((PUBLIC / "ecoregions.geojson").read_text())
    s_names = {f["properties"]["NA_L3NAME"] for f in s["features"]}
    p_names = {f["properties"]["NA_L3NAME"] for f in p["features"]}
    assert len(p["features"]) <= len(s["features"]), (
        f"public ecoregions has MORE features than sandbox: "
        f"sandbox={len(s['features'])}, public={len(p['features'])}"
    )
    assert s_names == p_names, (
        f"topology-postprocess dropped a whole L3 region.\n"
        f"Only in sandbox: {sorted(s_names - p_names)}\n"
        f"Only in public:  {sorted(p_names - s_names)}"
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
    """The distinct set of region names is identical between sandbox and public/data.

    For counties: the NAME property (39 WA county names, each unique).
    For ecoregions: the NA_L3NAME property (9 distinct L3 region names).

    Compares distinct SETS, not per-feature lists: topology-postprocess folds
    sub-hectare sliver polygons (extra duplicate-named features) into surrounding
    water, so per-feature multisets can legitimately differ between sandbox and
    public, but no distinct region name may appear or disappear. Counties have one
    feature per name, so set-equality is equivalent to list-equality there.
    """
    s_data = json.loads((SANDBOX / filename).read_text())
    p_data = json.loads((PUBLIC / filename).read_text())
    s_names = {f["properties"][prop] for f in s_data["features"]}
    p_names = {f["properties"][prop] for f in p_data["features"]}
    assert s_names == p_names, (
        f"{filename} '{prop}' distinct name sets differ.\n"
        f"Only in sandbox: {sorted(s_names - p_names)}\n"
        f"Only in public:  {sorted(p_names - s_names)}"
    )


# PORT-01: Species artifact diff tests

SANDBOX_SPECIES_PARQUET_GUARD = pytest.mark.skipif(
    not (SANDBOX / "species.parquet").exists(),
    reason="run `bash data/dbt/run.sh build` first to produce sandbox species.parquet",
)


@SANDBOX_SPECIES_PARQUET_GUARD
def test_species_parquet_row_count_within_tolerance():
    """Sandbox species.parquet row count is within [-2%, +5%] of public/data.

    Species follow occurrences: new taxa appear as observations are identified, and
    a species drops out when its last backing record is deleted. Bound the drift
    rather than require exact equality.
    """
    s = duckdb.execute(
        f"SELECT COUNT(*) FROM read_parquet('{SANDBOX}/species.parquet')"
    ).fetchone()[0]
    p = duckdb.execute(
        f"SELECT COUNT(*) FROM read_parquet('{PUBLIC}/species.parquet')"
    ).fetchone()[0]
    _assert_count_within_tolerance(s, p, "species")


@SANDBOX_SPECIES_PARQUET_GUARD
def test_species_parquet_schema_matches():
    """Public schema equals sandbox schema PLUS appended slug column.

    The dbt mart writes a 21-column species.parquet to data/dbt/target/sandbox/.
    species_export.py reads it, appends a slug column via feeds._slugify, and
    writes the resulting 22-column file to public/data/species.parquet
    (Phase 86 Plan 05 contract). This test asserts the 21 sandbox cols equal
    the first 21 public cols in order and types, and that the 22nd public col
    is ('slug', 'VARCHAR').
    """
    s_cols = [(r[0], r[1]) for r in duckdb.execute(
        f"DESCRIBE SELECT * FROM read_parquet('{SANDBOX}/species.parquet')"
    ).fetchall()]
    p_cols = [(r[0], r[1]) for r in duckdb.execute(
        f"DESCRIBE SELECT * FROM read_parquet('{PUBLIC}/species.parquet')"
    ).fetchall()]
    assert p_cols[:-1] == s_cols, (
        f"Sandbox/public column prefix mismatch.\n"
        f"Sandbox only: {[c for c in s_cols if c not in p_cols]}\n"
        f"Public[:-1] only: {[c for c in p_cols[:-1] if c not in s_cols]}"
    )
    assert p_cols[-1] == ('slug', 'VARCHAR'), (
        f"Expected last public column to be ('slug', 'VARCHAR'); got {p_cols[-1]!r}"
    )


@SANDBOX_SPECIES_PARQUET_GUARD
def test_species_canonical_name_drift_bounded():
    """canonical_name anti-join: newly-identified taxa allowed, disappearances bounded to -2%.

    Re-identified specimens and new observations introduce canonical_names (allowed);
    a name leaves only when its last record is deleted (bounded). A large drop is the
    regression signature the gate must catch.
    """
    only_in_sandbox = duckdb.execute(f"""
        SELECT COUNT(*) FROM (
            SELECT canonical_name FROM read_parquet('{SANDBOX}/species.parquet')
            EXCEPT
            SELECT canonical_name FROM read_parquet('{PUBLIC}/species.parquet')
        )
    """).fetchone()[0]
    only_in_public = duckdb.execute(f"""
        SELECT COUNT(*) FROM (
            SELECT canonical_name FROM read_parquet('{PUBLIC}/species.parquet')
            EXCEPT
            SELECT canonical_name FROM read_parquet('{SANDBOX}/species.parquet')
        )
    """).fetchone()[0]
    public_total = duckdb.execute(
        f"SELECT COUNT(DISTINCT canonical_name) FROM read_parquet('{PUBLIC}/species.parquet')"
    ).fetchone()[0]
    _assert_set_drift_within_tolerance(
        only_in_sandbox, only_in_public, public_total, "species canonical_name set"
    )


@pytest.mark.skipif(
    not (SANDBOX / "species.json").exists(),
    reason="run species JSON post-step first",
)
def test_species_json_matches():
    """sandbox/species.json content == public/data/species.json (byte-comparable)."""
    s = (SANDBOX / "species.json").read_bytes()
    p = (PUBLIC / "species.json").read_bytes()
    assert s == p, "species.json content differs between sandbox and public"


@pytest.mark.skipif(
    not (SANDBOX / "seasonality.json").exists(),
    reason="run species JSON post-step first",
)
def test_seasonality_json_matches():
    """sandbox/seasonality.json content == public/data/seasonality.json (byte-comparable)."""
    s = (SANDBOX / "seasonality.json").read_bytes()
    p = (PUBLIC / "seasonality.json").read_bytes()
    assert s == p, "seasonality.json content differs between sandbox and public"
