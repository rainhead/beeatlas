"""Scaffold assertions for the dbt-duckdb spike (Phase 83).

These tests run against the real data/beeatlas.duckdb and the post-build
data/dbt/target/sandbox/ artifacts produced by `bash data/dbt/run.sh build`.

Workflow:
  1. Run: bash data/dbt/run.sh build
  2. Run: uv run --project data pytest data/tests/test_dbt_scaffold.py -x

Tests guarded by @pytest.mark.skipif are skipped until `dbt build` has produced
the sandbox outputs. test_profiles_yml_declares_spatial runs always (no build required).
"""

import json
import subprocess
from pathlib import Path

import duckdb
import pytest
import yaml


SANDBOX = Path(__file__).resolve().parent.parent / "dbt" / "target" / "sandbox"


# ---------------------------------------------------------------------------
# Post-build parquet assertions (skipif guard: requires dbt build)
# ---------------------------------------------------------------------------

@pytest.mark.integration
@pytest.mark.skipif(
    not (SANDBOX / "occurrences.parquet").exists(),
    reason="run `bash data/dbt/run.sh build` first to produce sandbox outputs",
)
def test_occurrences_parquet_exists():
    """sandbox/occurrences.parquet exists after dbt build."""
    assert (SANDBOX / "occurrences.parquet").exists()


@pytest.mark.integration
@pytest.mark.skipif(
    not (SANDBOX / "occurrences.parquet").exists(),
    reason="run `bash data/dbt/run.sh build` first to produce sandbox outputs",
)
def test_occurrences_has_rows_and_zero_null_county_or_eco():
    """occurrences.parquet has rows; county and ecoregion_l3 are fully populated.

    Mirrors export.py:266-277 invariants (PORT-02 smoke).
    """
    parquet_path = str(SANDBOX / "occurrences.parquet")
    row = duckdb.execute(f"""
        SELECT
            COUNT(*) AS total,
            SUM(CASE WHEN county IS NULL THEN 1 ELSE 0 END) AS null_county,
            SUM(CASE WHEN ecoregion_l3 IS NULL THEN 1 ELSE 0 END) AS null_eco
        FROM read_parquet('{parquet_path}')
    """).fetchone()
    total, null_county, null_eco = row
    assert total >= 2, f"occurrences.parquet should have at least 2 rows, got {total}"
    assert null_county == 0, f"occurrences.parquet has {null_county} rows with null county"
    assert null_eco == 0, f"occurrences.parquet has {null_eco} rows with null ecoregion_l3"


# ---------------------------------------------------------------------------
# Post-build GeoJSON assertions (skipif guard: requires dbt build)
# ---------------------------------------------------------------------------

@pytest.mark.integration
@pytest.mark.skipif(
    not (SANDBOX / "counties.geojson").exists(),
    reason="run `bash data/dbt/run.sh build` first to produce sandbox outputs",
)
def test_counties_geojson_structural():
    """sandbox/counties.geojson is a valid FeatureCollection with NAME properties.

    WA has 39 counties; asserts >= 30 features.
    """
    geojson = json.loads((SANDBOX / "counties.geojson").read_text())
    assert geojson["type"] == "FeatureCollection"
    features = geojson["features"]
    assert len(features) >= 30, f"Expected >= 30 WA counties, got {len(features)}"
    for feature in features:
        assert "geometry" in feature, "Feature missing geometry"
        assert "NAME" in feature["properties"], "Feature missing NAME property"


@pytest.mark.integration
@pytest.mark.skipif(
    not (SANDBOX / "ecoregions.geojson").exists(),
    reason="run `bash data/dbt/run.sh build` first to produce sandbox outputs",
)
def test_ecoregions_geojson_structural():
    """sandbox/ecoregions.geojson is a valid FeatureCollection with NA_L3NAME properties."""
    geojson = json.loads((SANDBOX / "ecoregions.geojson").read_text())
    assert geojson["type"] == "FeatureCollection"
    features = geojson["features"]
    assert len(features) >= 1, "Expected at least 1 ecoregion feature"
    for feature in features:
        assert "geometry" in feature, "Feature missing geometry"
        assert "NA_L3NAME" in feature["properties"], "Feature missing NA_L3NAME property"


# ---------------------------------------------------------------------------
# Always-run assertions (no dbt build required)
# ---------------------------------------------------------------------------

def test_profiles_yml_declares_spatial():
    """profiles.yml declares spatial in the extensions list (V-SCAFFOLD-02)."""
    profiles_path = Path(__file__).resolve().parent.parent / "dbt" / "profiles.yml"
    profiles = yaml.safe_load(profiles_path.read_text())
    extensions = profiles["beeatlas"]["outputs"]["sandbox"]["extensions"]
    assert "spatial" in extensions, (
        f"profiles.yml must declare spatial extension; got: {extensions}"
    )


# ---------------------------------------------------------------------------
# checklist.parquet assertions (CHECK-02, CHECK-04, EXT-01)
# ---------------------------------------------------------------------------

_CHECKLIST_GUARD = pytest.mark.skipif(
    not (SANDBOX / "checklist.parquet").exists(),
    reason="run `bash data/dbt/run.sh build` first to produce checklist.parquet",
)


@pytest.mark.integration
@_CHECKLIST_GUARD
def test_checklist_parquet_exists():
    """sandbox/checklist.parquet exists after dbt build (CHECK-02)."""
    assert (SANDBOX / "checklist.parquet").exists()


@pytest.mark.integration
@_CHECKLIST_GUARD
def test_checklist_row_count():
    """checklist.parquet has at least 2000 rows (CHECK-04)."""
    parquet_path = str(SANDBOX / "checklist.parquet")
    row = duckdb.execute(
        f"SELECT COUNT(*) FROM read_parquet('{parquet_path}')"
    ).fetchone()
    assert row[0] >= 2000, f"expected >= 2000 rows, got {row[0]}"


@pytest.mark.integration
@_CHECKLIST_GUARD
def test_checklist_no_null_canonical_name():
    """checklist.parquet has zero null canonical_name rows (CHECK-04)."""
    parquet_path = str(SANDBOX / "checklist.parquet")
    row = duckdb.execute(
        f"SELECT COUNT(*) FROM read_parquet('{parquet_path}')"
        " WHERE canonical_name IS NULL"
    ).fetchone()
    assert row[0] == 0, f"found {row[0]} null canonical_name rows"


@pytest.mark.integration
@_CHECKLIST_GUARD
def test_checklist_no_null_specific_epithet():
    """checklist.parquet has zero null specific_epithet rows (CHECK-04)."""
    parquet_path = str(SANDBOX / "checklist.parquet")
    row = duckdb.execute(
        f"SELECT COUNT(*) FROM read_parquet('{parquet_path}')"
        " WHERE specific_epithet IS NULL"
    ).fetchone()
    assert row[0] == 0, f"found {row[0]} null specific_epithet rows"


@pytest.mark.integration
@_CHECKLIST_GUARD
def test_checklist_family_trim():
    """checklist.parquet has no rows where TRIM(family) != family (CHECK-04)."""
    parquet_path = str(SANDBOX / "checklist.parquet")
    row = duckdb.execute(
        f"SELECT COUNT(*) FROM read_parquet('{parquet_path}')"
        " WHERE family <> TRIM(family)"
    ).fetchone()
    assert row[0] == 0, f"found {row[0]} rows where TRIM(family) != family"


@pytest.mark.integration
@_CHECKLIST_GUARD
def test_checklist_source_constant():
    """Every row in checklist.parquet has source='checklist' (EXT-01)."""
    parquet_path = str(SANDBOX / "checklist.parquet")
    row = duckdb.execute(
        f"SELECT COUNT(DISTINCT source) FROM read_parquet('{parquet_path}')"
    ).fetchone()
    assert row[0] == 1, f"expected 1 distinct source value, got {row[0]}"
    val = duckdb.execute(
        f"SELECT DISTINCT source FROM read_parquet('{parquet_path}')"
    ).fetchone()[0]
    assert val == "checklist", f"expected source='checklist', got '{val}'"


# Retired v4.7 (Phase 137): checklist records now intentionally enter int_combined as
# source='checklist'; the Phase 111 isolation invariant (checklist exclusion) was
# deliberately reversed once coordinates were confirmed present. See STATE.md §Decisions.
# This function body has been re-baselined: ceiling raised to absorb ~20K checklist rows
# and a positive source='checklist' existence assertion added (PRO-03).
@pytest.mark.integration
@pytest.mark.skipif(
    not (SANDBOX / "occurrences.parquet").exists(),
    reason="run `bash data/dbt/run.sh build` first to produce sandbox outputs",
)
def test_occurrences_row_count_not_inflated_by_checklist():
    """occurrences.parquet row count is within the expected range (Phase 137 re-baselined).

    Baseline post-Phase-137 (v4.7): ~92,802 existing rows + ~20K checklist rows ≈ ~112K.
    Ceiling set generously to 160,000 to absorb natural data growth while still catching
    accidental row explosions (e.g., a runaway JOIN in int_combined).

    Retired v4.7 (Phase 137): the old assertion "Checklist records MUST NOT enter
    int_combined" has been reversed. Checklist records now intentionally enter as
    record_type='checklist'. See STATE.md §Decisions for the v4.7 reversal rationale.
    (Phase 170: the `source` column was replaced by `tier`+`record_type`.)
    """
    parquet_path = str(SANDBOX / "occurrences.parquet")
    row = duckdb.execute(
        f"SELECT COUNT(*) FROM read_parquet('{parquet_path}')"
    ).fetchone()
    assert row[0] <= 160_000, (
        f"occurrences.parquet has {row[0]} rows — unexpectedly large; "
        "verify no runaway JOIN occurred in int_combined"
    )
    # Positive assertion: record_type='checklist' rows must exist in occurrences.parquet (PRO-03).
    # Retired v4.7 (Phase 137): checklist records now intentionally promoted from
    # int_checklist_dedup_status as ARM 4 of int_combined.
    checklist_count = duckdb.execute(
        f"SELECT COUNT(*) FROM read_parquet('{parquet_path}') WHERE record_type='checklist'"
    ).fetchone()[0]
    # Floor (not merely > 0): ~19,929 checklist rows are expected post-collapse. A bare
    # `> 0` would pass even if an over-aggressive dedup seed or an inverted ARM 4 filter
    # silently suppressed nearly all of them. 10,000 is comfortably below the real volume
    # and far above noise. (WR-03)
    assert checklist_count >= 10_000, (
        f"occurrences.parquet has only {checklist_count} record_type='checklist' rows — "
        "unexpectedly few; verify dedup suppression and the ARM 4 filter in int_combined"
    )


# ---------------------------------------------------------------------------
# OCC-01 / PROV-01: tier + record_type column assertions
# (Phase 170 replaced the `source` enum with orthogonal `tier`+`record_type`.)
# ---------------------------------------------------------------------------

_OCCURRENCES_GUARD = pytest.mark.skipif(
    not (SANDBOX / "occurrences.parquet").exists(),
    reason="run `bash data/dbt/run.sh build` first to produce sandbox outputs",
)


@pytest.mark.integration
@_OCCURRENCES_GUARD
def test_occurrences_tier_and_record_type_columns():
    """occurrences.parquet has non-null tier and record_type columns (OCC-01 / PROV-01)."""
    parquet_path = str(SANDBOX / "occurrences.parquet")
    null_tier = duckdb.execute(
        f"SELECT COUNT(*) FROM read_parquet('{parquet_path}') WHERE tier IS NULL"
    ).fetchone()[0]
    null_rt = duckdb.execute(
        f"SELECT COUNT(*) FROM read_parquet('{parquet_path}') WHERE record_type IS NULL"
    ).fetchone()[0]
    assert null_tier == 0, f"occurrences.parquet has {null_tier} rows with null tier"
    assert null_rt == 0, f"occurrences.parquet has {null_rt} rows with null record_type"


@pytest.mark.integration
@_OCCURRENCES_GUARD
def test_inat_expert_rows_in_occurrences():
    """occurrences.parquet contains rows with record_type='inat_expert' (OCC-01).

    Phase 170 renamed the `inat_obs` record_type value to `inat_expert` (the occ_id
    prefix `inat_obs:` is intentionally unchanged).
    """
    parquet_path = str(SANDBOX / "occurrences.parquet")
    row = duckdb.execute(f"""
        SELECT COUNT(*) FROM read_parquet('{parquet_path}') WHERE record_type = 'inat_expert'
    """).fetchone()
    assert row[0] > 0, "Expected inat_expert rows in occurrences.parquet"


@pytest.mark.integration
@_OCCURRENCES_GUARD
def test_record_type_and_tier_no_unexpected_values():
    """Every occurrences row has a recognized record_type and tier (OCC-01 + PROV-01).

    Phase 170: record_type ∈ {specimen, waba_specimen, provisional_sample, inat_expert,
    checklist}; tier ∈ {atlas, other}.
    """
    parquet_path = str(SANDBOX / "occurrences.parquet")
    bad_rt = duckdb.execute(f"""
        SELECT COUNT(*) FROM read_parquet('{parquet_path}')
        WHERE record_type NOT IN ('specimen', 'waba_specimen', 'provisional_sample', 'inat_expert', 'checklist')
    """).fetchone()[0]
    bad_tier = duckdb.execute(f"""
        SELECT COUNT(*) FROM read_parquet('{parquet_path}')
        WHERE tier NOT IN ('atlas', 'other')
    """).fetchone()[0]
    assert bad_rt == 0, f"Found {bad_rt} rows with unexpected record_type values"
    assert bad_tier == 0, f"Found {bad_tier} rows with unexpected tier values"


# ---------------------------------------------------------------------------
# species.parquet assertions (SPV-01)
# ---------------------------------------------------------------------------

_SPECIES_GUARD = pytest.mark.skipif(
    not (SANDBOX / "species.parquet").exists(),
    reason="run `bash data/dbt/run.sh build` first",
)


@pytest.mark.integration
@_SPECIES_GUARD
def test_off_checklist_species_with_occurrences_have_specific_epithet():
    """All two-token off-checklist species with occurrence_count > 0 have specific_epithet (SPV-01)."""
    parquet_path = str(SANDBOX / "species.parquet")
    n = duckdb.execute(
        f"SELECT COUNT(*) FROM read_parquet('{parquet_path}') "
        "WHERE occurrence_count > 0 AND on_checklist = false "
        "AND ARRAY_LENGTH(STRING_SPLIT(canonical_name, ' ')) = 2 "
        "AND specific_epithet IS NULL"
    ).fetchone()[0]
    assert n == 0, (
        f"Expected 0 two-token off-checklist species with occurrences to lack specific_epithet, "
        f"got {n}. Fix COALESCE derivation in int_species_universe.sql."
    )


@pytest.mark.integration
@_SPECIES_GUARD
def test_off_checklist_species_scientificname_capitalized():
    """Off-checklist species with two-token canonical names have capitalized scientificName (SPV-01)."""
    parquet_path = str(SANDBOX / "species.parquet")
    n = duckdb.execute(
        f"SELECT COUNT(*) FROM read_parquet('{parquet_path}') "
        "WHERE occurrence_count > 0 AND on_checklist = false "
        "AND ARRAY_LENGTH(STRING_SPLIT(canonical_name, ' ')) = 2 "
        "AND scientificName != upper(left(scientificName, 1)) || substring(scientificName, 2)"
    ).fetchone()[0]
    assert n == 0, (
        f"Expected 0 off-checklist species with lowercase scientificName, got {n}."
    )


@pytest.mark.integration
@_SPECIES_GUARD
def test_species_taxon_id_non_null():
    """species.parquet: zero rows with null taxon_id (TID-01)."""
    parquet_path = str(SANDBOX / "species.parquet")
    n = duckdb.execute(
        f"SELECT COUNT(*) FROM read_parquet('{parquet_path}') WHERE taxon_id IS NULL"
    ).fetchone()[0]
    assert n == 0, f"Expected 0 null taxon_id rows in species.parquet, got {n}"


@pytest.mark.integration
@_OCCURRENCES_GUARD
def test_occurrences_taxon_id_non_null():
    """occurrences.parquet: zero rows with null taxon_id for EVERY named row (TID-02, re-scoped Phase 128).

    A "named row" is any row carrying a canonical_name (single-token genus OR two-token species).
    Phase 128 (D-04) re-scopes TID-02 from "species-level only" to "every identified row": under
    the Animalia genus rule every single-token genus name now resolves to its genus self-row
    taxon_id (bees AND non-bee aculeates like bembix), so the named-row NULL count must be 0.

    Truly-unidentified rows (NULL/empty canonical_name — the ~21.6k ecdysis specimens with no name
    to look up) are excluded; they legitimately stay NULL. The only named exceptions are the 3
    unresolvable ecdysis species (anthidiellum robertsoni, lasioglossum aspilurus, osmia phaceliae —
    0 iNat API results; tracked in lineage_unresolved.csv), excluded via _KNOWN_UNRESOLVABLE.
    No non-bee-genera exclusion is needed (D-02/D-07 — every genus name resolves under Animalia).
    """
    parquet_path = str(SANDBOX / "occurrences.parquet")
    # Exclude known ecdysis data-quality names that cannot be resolved via iNat API
    _KNOWN_UNRESOLVABLE = (
        "'anthidiellum robertsoni', 'lasioglossum aspilurus', 'osmia phaceliae'"
    )
    n = duckdb.execute(
        f"SELECT COUNT(*) FROM read_parquet('{parquet_path}') "
        f"WHERE canonical_name IS NOT NULL AND canonical_name <> '' "
        f"AND canonical_name NOT IN ({_KNOWN_UNRESOLVABLE}) "
        f"AND taxon_id IS NULL"
    ).fetchone()[0]
    assert n == 0, f"Expected 0 null taxon_id rows for named occurrences, got {n}"


@pytest.mark.integration
@_OCCURRENCES_GUARD
@_SPECIES_GUARD
def test_taxon_id_consistency():
    """occurrences.taxon_id == species.taxon_id for matching species-level canonical_names (D-03/D-06).

    Phase 128 (D-06): scoped to species-level (two-token) occurrences. Genus-level rows now carry a
    genus self-row taxon_id which is NOT a species mart row, so an unscoped USING(canonical_name)
    join could create false mismatches. The `LIKE '% %'` guard restricts the invariant to the
    species-level rows it was designed for.
    """
    occ_path = str(SANDBOX / "occurrences.parquet")
    sp_path = str(SANDBOX / "species.parquet")
    n = duckdb.execute(f"""
        SELECT COUNT(*) FROM read_parquet('{occ_path}') o
        JOIN read_parquet('{sp_path}') s USING (canonical_name)
        WHERE o.canonical_name LIKE '% %'      -- species-level only (D-06)
          AND o.taxon_id != s.taxon_id
    """).fetchone()[0]
    assert n == 0, f"Expected 0 taxon_id mismatches between occurrences and species, got {n}"
