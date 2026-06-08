"""UIX-04: Assert species.checklist_count equals deduped int_checklist_dedup_status count.

Wave 0 Nyquist scaffold for Phase 138 Plan 01. Written against TARGET behavior
(post-Plan-02 CTE fix). This test is intentionally RED until Plan 02 replaces
the checklist_count_agg CTE in int_species_universe.sql to read from
int_checklist_dedup_status instead of the old county-level checklist mart.

Assertion: for each canonical_name, the checklist_count field in the species
mart equals COUNT(*) from int_checklist_dedup_status WHERE:
  - canonical_name IS NOT NULL
  - dedup_status IS DISTINCT FROM 'confirmed'
  - lat IS NOT NULL AND lon IS NOT NULL

These are the exact filters that should drive UIX-04's count (see 138-RESEARCH.md §1).
Currently, checklist_count_agg reads ref('checklist') (county-level mart, 42,218 rows)
which gives materially different counts (e.g., Bombus mixtus: 4,095 old vs 1,413 new).

Prerequisites: beeatlas.duckdb must contain a materialized species mart and
int_checklist_dedup_status view/table. Run `bash data/dbt/run.sh build` first.
"""

import os
from pathlib import Path

import duckdb
import pytest

# ---------------------------------------------------------------------------
# DB_PATH resolution — mirrors the pattern used by checklist_pipeline tests
# ---------------------------------------------------------------------------
_REPO_ROOT = Path(__file__).resolve().parents[2]
_DEFAULT_DB = _REPO_ROOT / "data" / "beeatlas.duckdb"
DB_PATH = os.environ.get("DB_PATH", str(_DEFAULT_DB))

# Path to dbt target sandbox where species.parquet is written
_DBT_SANDBOX = _REPO_ROOT / "data" / "dbt" / "target" / "sandbox"


@pytest.mark.integration
def test_checklist_count_matches_dedup_status_count():
    """UIX-04: checklist_count in species mart equals deduped int_checklist_dedup_status count.

    Reads:
    - int_checklist_dedup_status (dbt intermediate model — DuckDB view or table)
    - species.parquet (dbt mart output)

    Asserts: for every canonical_name, species.checklist_count ==
    COUNT(*) from int_checklist_dedup_status with the dedup/coord filters.

    RED until Plan 02 re-sources checklist_count_agg in int_species_universe.sql.
    """
    species_parquet = _DBT_SANDBOX / "species.parquet"
    if not species_parquet.exists():
        pytest.skip(
            "[integration] sandbox species.parquet absent — run `bash data/dbt/run.sh build` first"
        )
    if not Path(DB_PATH).exists():
        pytest.skip(
            f"[integration] DuckDB absent at {DB_PATH} — run `bash data/dbt/run.sh build` first"
        )

    con = duckdb.connect(DB_PATH, read_only=True)
    try:
        # Compute expected counts from int_checklist_dedup_status
        # Filter: dedup_status IS DISTINCT FROM 'confirmed' AND lat/lon not null
        # (These are the filters from RESEARCH.md §1 and the planned CTE fix.)
        rows = con.execute("""
            SELECT canonical_name, COUNT(*) AS expected_count
            FROM dbt_sandbox.int_checklist_dedup_status
            WHERE canonical_name IS NOT NULL
              AND dedup_status IS DISTINCT FROM 'confirmed'
              AND lat IS NOT NULL
              AND lon IS NOT NULL
            GROUP BY canonical_name
        """).fetchall()
    finally:
        con.close()

    dedup_counts = {name: int(count) for name, count in rows}

    # Read actual checklist_count from species.parquet (the mart output)
    con2 = duckdb.connect()
    try:
        species_rows = con2.execute(f"""
            SELECT canonical_name, checklist_count AS actual_count
            FROM read_parquet('{species_parquet}')
            WHERE checklist_count IS NOT NULL AND checklist_count > 0
        """).fetchall()
    finally:
        con2.close()

    species_counts = {name: int(count) for name, count in species_rows}

    # Assert equality for species that appear in both datasets.
    # Note: some checklist records (in int_checklist_dedup_status) may belong to species
    # not present in stg_checklist__species AND with no other occurrences — these species
    # are absent from species.parquet entirely (int_species_universe starts from a FULL
    # OUTER JOIN of stg_checklist__species + occ_agg). That is expected pipeline behavior,
    # not a count mismatch. We only assert equality for species present in species.parquet.
    mismatches = [
        (name, dedup_counts[name], species_counts[name])
        for name in species_counts
        if name in dedup_counts and dedup_counts[name] != species_counts[name]
    ]
    assert len(mismatches) == 0, (
        f"UIX-04: checklist_count mismatch for {len(mismatches)} species in species.parquet.\n"
        f"Top mismatches (name, expected_from_dedup_status, actual_in_species_parquet):\n"
        + "\n".join(str(m) for m in mismatches[:5])
    )
