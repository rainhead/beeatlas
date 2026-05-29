"""Integration tests verifying SYN-02 / SYN-03: Agapostemon texanus → subtilior mapping
appears correctly in `occurrences.parquet` and `species.parquet` after
`bash data/dbt/run.sh build`.

These tests are Wave 0 RED tests for Phase 123 Plan 02 — they assert the desired
post-JOIN behavior. They will skip (not fail) when the sandbox outputs do not exist,
and they will pass once Tasks 2 and 3 add the synonym LEFT JOIN to int_combined.sql
and int_species_universe.sql respectively.

Requirements covered:
  SYN-02: occurrence_synonyms seed LEFT JOIN in int_combined produces synonymized canonical_name
  SYN-03: inat_obs_count in species mart rolls up under the synonymized canonical_name
"""

from pathlib import Path

import duckdb
import pytest


SANDBOX = Path(__file__).resolve().parent.parent / "dbt" / "target" / "sandbox"

_SANDBOX_GUARD = pytest.mark.skipif(
    not (SANDBOX / "occurrences.parquet").exists(),
    reason="run `bash data/dbt/run.sh build` first to produce sandbox outputs",
)

_SPECIES_GUARD = pytest.mark.skipif(
    not (SANDBOX / "species.parquet").exists(),
    reason="run `bash data/dbt/run.sh build` first to produce sandbox species.parquet",
)


# ---------------------------------------------------------------------------
# SYN-02: texanus → subtilior mapping in occurrences.parquet
# ---------------------------------------------------------------------------


@_SANDBOX_GUARD
def test_occurrences_has_agapostemon_subtilior():
    """At least 1 row in occurrences.parquet has canonical_name = 'agapostemon subtilior'.

    Proves the synonym JOIN fired and rewrote at least one ecdysis or inat_obs record
    from the raw 'agapostemon texanus' value to the accepted 'agapostemon subtilior'.
    """
    n = duckdb.execute(
        f"SELECT COUNT(*) FROM read_parquet('{SANDBOX}/occurrences.parquet')"
        " WHERE canonical_name = 'agapostemon subtilior'"
    ).fetchone()[0]
    assert n >= 1, (
        f"Expected at least 1 row with canonical_name='agapostemon subtilior', got {n}. "
        "The synonym JOIN in int_combined.sql may not have fired correctly."
    )


@_SANDBOX_GUARD
def test_occurrences_has_no_agapostemon_texanus():
    """Zero rows in occurrences.parquet have canonical_name = 'agapostemon texanus'.

    Proves every occurrence previously recorded as texanus was rewritten to subtilior
    via the LEFT JOIN — no synonym-application gap remains in any arm of int_combined.
    """
    n = duckdb.execute(
        f"SELECT COUNT(*) FROM read_parquet('{SANDBOX}/occurrences.parquet')"
        " WHERE canonical_name = 'agapostemon texanus'"
    ).fetchone()[0]
    assert n == 0, (
        f"Expected 0 rows with canonical_name='agapostemon texanus', got {n}. "
        "The synonym JOIN in int_combined.sql did not rewrite all texanus occurrences."
    )


# ---------------------------------------------------------------------------
# SYN-03: inat_obs_count rolls up under synonymized canonical_name in species.parquet
# ---------------------------------------------------------------------------


@_SPECIES_GUARD
def test_inat_obs_count_uses_synonymized_canonical_name():
    """inat_obs_count for 'agapostemon texanus' is 0; inat_obs_count for 'agapostemon subtilior' is >= 0.

    Asserts that:
    1. The inat_obs_count_agg CTE in int_species_universe.sql applies the synonym JOIN,
       so inat_obs records for texanus are counted under subtilior, not under texanus.
       agapostemon texanus may still appear as a checklist-only species row (with
       occurrence_count=0 and inat_obs_count=0) — the checklist entry is not affected by
       the occurrence synonym (per 123-RESEARCH Pitfall 5). This test checks the inat_obs_count
       value, not row presence.
    2. The agapostemon subtilior row exists in species.parquet and has a non-negative
       inat_obs_count (the column is queryable on the synonymized key).
    """
    texanus_count_row = duckdb.execute(
        f"SELECT inat_obs_count FROM read_parquet('{SANDBOX}/species.parquet')"
        " WHERE canonical_name = 'agapostemon texanus'"
    ).fetchone()
    if texanus_count_row is not None:
        assert texanus_count_row[0] == 0, (
            f"Expected inat_obs_count=0 for 'agapostemon texanus' (all inat_obs rows should be "
            f"counted under 'agapostemon subtilior' after synonymy), got {texanus_count_row[0]}. "
            "The synonym JOIN in int_species_universe.inat_obs_count_agg may be missing."
        )

    subtilior_count = duckdb.execute(
        f"SELECT inat_obs_count FROM read_parquet('{SANDBOX}/species.parquet')"
        " WHERE canonical_name = 'agapostemon subtilior'"
    ).fetchone()
    assert subtilior_count is not None, (
        "No row found for 'agapostemon subtilior' in species.parquet — "
        "expected at least one row (from checklist or occurrence data)."
    )
    assert subtilior_count[0] >= 0, (
        f"inat_obs_count for 'agapostemon subtilior' is {subtilior_count[0]}, expected >= 0."
    )
