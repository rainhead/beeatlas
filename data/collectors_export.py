"""Export per-collector stats for the frontend (PAGE-01/02/03).

Writes ASSETS_DIR/collectors.json — a JSON array of per-WABA-collector stats,
gated by D-01 (collector_inat_login IS NOT NULL AND (ecdysis_id IS NOT NULL OR
source IN ('waba_specimen', 'waba_sample'))).

Runs AFTER dbt-build AND species-export because per-collector counts come from
ASSETS_DIR/occurrences.parquet and ASSETS_DIR/species.parquet
(Pitfall 5 — NOT from DBT_SANDBOX_DIR).

Query split:
    _QUERY        — existing D-01 gate metrics (specimen/sample/species counts,
                    status split).  Predicate: ecdysis_id IS NOT NULL OR
                    record_type IN ('waba_specimen', 'provisional_sample').
    _ACCOM_QUERY  — accomplishment aggregations (active_since, seasons_count,
                    county/ecoregion names + counts).  Predicate: tier='atlas',
                    which includes uncatalogued atlas specimens (record_type=
                    'specimen', ecdysis_id IS NULL) that the old predicate drops.
    _SPECIES_QUERY — species-rank species list grouped by genus.
                    Predicate: tier='atlas'.  Uses cased scientificName.

Usage:
    cd data && uv run python collectors_export.py
"""

import json
import os
from collections import defaultdict
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
        -- Use the MOST RECENT recordedBy (arg_max by year), not MIN: a person's recorded
        -- name can change over time (marriage, spelling) — show their latest. The FILTER
        -- skips NULL-recordedBy rows (e.g. waba_sample) so a single nameless row can't win
        -- and mask the real name (CR-01); COALESCE the aggregate, not per-row.
        COALESCE(
            arg_max(o.recordedBy, o.year) FILTER (WHERE o.recordedBy IS NOT NULL),
            '@' || MIN(o.collector_inat_login)
        )                                                              AS display_name,
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


# ACCOM-01/03/04 — accomplishment aggregations over tier='atlas' rows.
# Use tier='atlas' (not the ecdysis_id-based D-01 predicate) to include
# atlas specimens collected-but-not-yet-catalogued (record_type='specimen',
# tier='atlas', ecdysis_id IS NULL) — UAT bug fix.
_ACCOM_QUERY = """
    SELECT
        o.collector_inat_login                                              AS login,
        -- D-05: earliest collection year (NOT id_date).
        -- COALESCE applied to MIN aggregate, NOT inside MIN — per feedback_min_coalesce_aggregation.
        MIN(o.year)                                                         AS active_since,
        COUNT(DISTINCT o.year)                                              AS seasons_count,
        -- Sorted distinct non-null county and ecoregion name lists for display.
        list_sort(array_agg(DISTINCT o.county) FILTER (WHERE o.county IS NOT NULL))
                                                                            AS county_names,
        list_sort(array_agg(DISTINCT o.ecoregion_l3) FILTER (WHERE o.ecoregion_l3 IS NOT NULL))
                                                                            AS ecoregion_names,
        COUNT(DISTINCT o.county) FILTER (WHERE o.county IS NOT NULL)        AS county_count,
        COUNT(DISTINCT o.ecoregion_l3) FILTER (WHERE o.ecoregion_l3 IS NOT NULL)
                                                                            AS ecoregion_count
    FROM read_parquet(?) o
    WHERE o.collector_inat_login IS NOT NULL
      AND o.tier = 'atlas'
    GROUP BY o.collector_inat_login
"""


# ACCOM-02 / D-04: species-rank species list per collector.
# Predicate: tier='atlas' (consistent with _ACCOM_QUERY — includes uncatalogued specimens).
# Uses cased sp.scientificName (NOT lowercase sp.canonical_name).
# count = the collector's atlas records of that species (rendered "N specimens"
# in the template — operator chose the explicit unit over the bare parenthetical).
_SPECIES_QUERY = """
    SELECT
        o.collector_inat_login                                            AS login,
        sp.genus,
        sp.scientificName,
        sp.slug,
        COUNT(*)                                                          AS occ_count
    FROM read_parquet(?) o
    LEFT JOIN read_parquet(?) sp ON sp.taxon_id = o.taxon_id
    WHERE o.collector_inat_login IS NOT NULL
      AND o.tier = 'atlas'
      AND sp.specific_epithet IS NOT NULL
    GROUP BY o.collector_inat_login, sp.genus, sp.scientificName, sp.slug
    ORDER BY o.collector_inat_login, sp.genus, sp.scientificName
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

        # ACCOM-01/03/04: accomplishment aggregations over tier='atlas'.
        # Separate from _QUERY to include uncatalogued atlas specimens
        # (ecdysis_id IS NULL, record_type='specimen', tier='atlas') — UAT bug fix.
        _ACCOM_DEFAULT = {
            "active_since": None,
            "seasons_count": 0,
            "county_names": [],
            "ecoregion_names": [],
            "county_count": 0,
            "ecoregion_count": 0,
        }
        accom_rows = con.execute(
            _ACCOM_QUERY,
            [str(occ_parquet)],
        ).fetchall()
        accom_by_login: dict[str, dict] = {}
        for row in accom_rows:
            (
                login_ac, active_since, seasons_count,
                county_names, ecoregion_names,
                county_count, ecoregion_count,
            ) = row
            accom_by_login[login_ac] = {
                "active_since": int(active_since) if active_since is not None else None,
                "seasons_count": int(seasons_count),
                "county_names": list(county_names) if county_names is not None else [],
                "ecoregion_names": list(ecoregion_names) if ecoregion_names is not None else [],
                "county_count": int(county_count),
                "ecoregion_count": int(ecoregion_count),
            }
        for rec in records:
            rec.update(accom_by_login.get(rec["login"], _ACCOM_DEFAULT))

        # ACCOM-02 / D-04: species-rank species list grouped by genus.
        # Run _SPECIES_QUERY with the same parquet parameters, then group:
        #   login → genus → list of {name (cased scientificName), slug, count}
        # SQL ORDER BY login, genus, scientificName ensures insertion order is correct;
        # sorted() on genus_dict makes genera alphabetical (D-04).
        # count = the collector's atlas records of that species; rendered "N specimens".
        species_rows = con.execute(
            _SPECIES_QUERY,
            [str(occ_parquet), str(species_parquet)],
        ).fetchall()

        species_by_login: dict[str, dict[str, list]] = defaultdict(lambda: defaultdict(list))
        for login_sp, genus, scientific_name, slug, occ_count in species_rows:
            species_by_login[login_sp][genus].append({
                "name": scientific_name,
                "slug": slug,
                "count": int(occ_count),
            })

        for rec in records:
            genus_dict = species_by_login.get(rec["login"], {})
            rec["species_by_genus"] = [
                {
                    "genus": genus,
                    "species": sorted(species_list, key=lambda x: x["name"]),
                }
                for genus, species_list in sorted(genus_dict.items())
            ]

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
