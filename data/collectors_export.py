"""Export per-collector stats for the frontend (PAGE-01/02/03).

Writes ASSETS_DIR/collectors.json — a JSON array of per-WABA-collector stats,
gated by D-01 (collector_inat_login IS NOT NULL AND (ecdysis_id IS NOT NULL OR
source IN ('waba_specimen', 'waba_sample'))).

Runs AFTER dbt-build AND species-export because per-collector counts come from
ASSETS_DIR/occurrences.parquet and ASSETS_DIR/species.parquet
(Pitfall 5 — NOT from DBT_SANDBOX_DIR).

Usage:
    cd data && uv run python collectors_export.py
"""

import json
import os
from pathlib import Path

import duckdb

from domain import slugify


DB_PATH = os.environ.get("DB_PATH", str(Path(__file__).parent / "beeatlas.duckdb"))
_default_assets = str(Path(__file__).parent.parent / "public" / "data")
ASSETS_DIR = Path(os.environ.get("EXPORT_DIR", _default_assets))


# ---------------------------------------------------------------------------
# Query
# ---------------------------------------------------------------------------

_QUERY = """
    SELECT
        o.collector_inat_login                                         AS login,
        -- D-04: human display name; '@login' fallback only when NO row carries a name.
        -- MIN(recordedBy) ignores NULLs, so COALESCE the aggregate (not per-row): a
        -- per-row COALESCE would let a single NULL-recordedBy row (e.g. waba_sample) win
        -- the MIN as '@login' and mask the real name (CR-01).
        COALESCE(MIN(o.recordedBy), '@' || MIN(o.collector_inat_login)) AS display_name,
        MIN(o.recordedBy)                                              AS recordedBy,
        MIN(o.host_inat_login)                                         AS host_inat_login,
        -- D-03: specimen count = distinct ecdysis_id values
        COUNT(DISTINCT CASE WHEN o.ecdysis_id IS NOT NULL
                            THEN o.ecdysis_id END)                     AS specimen_count,
        -- D-03: sample count = distinct sample_id (ecdysis-linked)
        --       + distinct observation_id WHERE record_type='provisional_sample'
        --       (provisional_sample rows have sample_id IS NULL; Research #3)
        COUNT(DISTINCT o.sample_id)
        + COUNT(DISTINCT CASE WHEN o.record_type = 'provisional_sample'
                              THEN o.observation_id END)               AS sample_count,
        -- D-03/D-06: species count = distinct species-rank taxon_ids
        COUNT(DISTINCT CASE WHEN sp.specific_epithet IS NOT NULL
                            THEN o.taxon_id END)                       AS species_count,
        -- D-05/D-06: status split denominator = ecdysis + waba_specimen rows
        --            (samples and casual observations excluded)
        SUM(CASE WHEN (o.ecdysis_id IS NOT NULL OR o.record_type = 'waba_specimen')
                 THEN 1 ELSE 0 END)                                    AS status_denominator,
        -- D-06: "identified" = species-rank determination (specific_epithet IS NOT NULL)
        --       NOT keyed on id_date (D-07)
        SUM(CASE WHEN (o.ecdysis_id IS NOT NULL OR o.record_type = 'waba_specimen')
                      AND sp.specific_epithet IS NOT NULL
                 THEN 1 ELSE 0 END)                                    AS status_identified,
        SUM(CASE WHEN (o.ecdysis_id IS NOT NULL OR o.record_type = 'waba_specimen')
                      AND sp.specific_epithet IS NULL
                 THEN 1 ELSE 0 END)                                    AS status_awaiting
    FROM read_parquet(?) o
    LEFT JOIN read_parquet(?) sp ON sp.taxon_id = o.taxon_id
    WHERE o.collector_inat_login IS NOT NULL
      AND (o.ecdysis_id IS NOT NULL OR o.record_type IN ('waba_specimen', 'provisional_sample'))
    GROUP BY o.collector_inat_login
    ORDER BY o.collector_inat_login
"""


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def export_collectors(con: duckdb.DuckDBPyConnection | None = None) -> None:
    """Export collectors.json to ASSETS_DIR.

    If con is None, opens a DuckDB connection to DB_PATH and closes it on
    completion. Callers may pass an existing connection if they wish to reuse
    one (e.g. in tests).

    Reads ASSETS_DIR/occurrences.parquet and ASSETS_DIR/species.parquet
    (NOT from dbt sandbox — Pitfall 5).

    Raises FileNotFoundError if either parquet is absent (run dbt-build and
    species-export first).
    """
    _owned = False
    if con is None:
        con = duckdb.connect(DB_PATH)
        _owned = True

    try:
        ASSETS_DIR.mkdir(parents=True, exist_ok=True)

        occ_parquet = ASSETS_DIR / "occurrences.parquet"
        species_parquet = ASSETS_DIR / "species.parquet"

        if not occ_parquet.exists():
            raise FileNotFoundError(
                f"{occ_parquet} not found — run dbt before collectors-export"
            )
        if not species_parquet.exists():
            raise FileNotFoundError(
                f"{species_parquet} not found — run species-export before collectors-export"
            )

        rows = con.execute(
            _QUERY,
            [str(occ_parquet), str(species_parquet)],
        ).fetchall()

        records = []
        for row in rows:
            (
                login, display_name, recorded_by, host_inat_login,
                specimen_count, sample_count, species_count,
                status_denominator, status_identified, status_awaiting,
            ) = row
            records.append({
                "login": login,
                "display_name": display_name,
                "recordedBy": recorded_by,           # may be None for sample-host-only
                "host_inat_login": host_inat_login,
                # Per-collector Atom feed (data/feeds.py keys collector feeds by
                # slugify(recorded_by); byte-match that filename here). None when
                # recordedBy is null (sample-host-only collectors have no determination feed).
                "atom_feed_url": (
                    f"/data/feeds/collector-{slugify(recorded_by)}.xml"
                    if recorded_by else None
                ),
                "specimen_count": int(specimen_count),
                "sample_count": int(sample_count),
                "species_count": int(species_count),
                "status_denominator": int(status_denominator),
                "status_identified": int(status_identified),
                "status_awaiting": int(status_awaiting),
            })

        out_path = ASSETS_DIR / "collectors.json"
        out_path.write_text(json.dumps(records, indent=2), encoding="utf-8")
        print(  # noqa: T201
            f"  collectors.json: {len(records):,} collectors, "
            f"{out_path.stat().st_size:,} bytes"
        )
    finally:
        if _owned:
            con.close()


def export_collectors_step() -> None:
    """Zero-argument wrapper for inclusion in run.py STEPS list."""
    con = duckdb.connect(DB_PATH)
    try:
        export_collectors(con)
    finally:
        con.close()


if __name__ == "__main__":
    export_collectors_step()
