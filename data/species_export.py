"""Export per-species aggregates and JSON sidecars for the Species Tab.

Produces three artifacts in public/data/:
  - species.parquet    (one row per species in the FULL OUTER union)
  - species.json       (flat array — Eleventy _data/species.js consumer)
  - seasonality.json   (species → bucket → INT[12] — VIZ-04 lookup)

Runs in run.py STEPS as ("species-export", export_species_parquet) AFTER
"export" (which writes occurrences.parquet w/ canonical_name) and BEFORE
"feeds" (which uses public/data/feeds/).

Usage:
    cd data && uv run python species_export.py
"""

import json
import os
from collections import defaultdict
from pathlib import Path

import duckdb
import pyarrow as pa
import pyarrow.parquet as pq

from feeds import _slugify  # Phase 78 D-01: byte-for-byte slug invariant


DB_PATH = os.environ.get('DB_PATH', str(Path(__file__).parent / 'beeatlas.duckdb'))
_default_assets = str(Path(__file__).parent.parent / 'public' / 'data')
ASSETS_DIR = Path(os.environ.get('EXPORT_DIR', _default_assets))


# Anthophila — the seven recognized bee families. Non-bee Hymenoptera
# (and any other order) get filtered out of species artifacts so the
# species page tree stays bee-only. Specimens of non-bee insects still
# flow through occurrences.parquet for the map.
BEE_FAMILIES = (
    'Andrenidae', 'Apidae', 'Colletidae', 'Halictidae',
    'Megachilidae', 'Melittidae', 'Stenotritidae',
)


# AGG-02: 19 columns in canonical order. Used for both parquet schema and the
# JSON projection so the two artifacts agree on key ordering.
SPECIES_COLUMNS = [
    'scientificName', 'canonical_name', 'family', 'subfamily', 'tribe',
    'genus', 'subgenus', 'specific_epithet', 'on_checklist', 'status',
    'occurrence_count', 'specimen_count', 'provisional_count',
    'first_occurrence_date', 'last_occurrence_date', 'month_histogram',
    'county_count', 'ecoregion_count', 'slug',
]


def _jsonify_rows(rows: list[dict]) -> list[dict]:
    """Convert DuckDB rows to JSON-safe dicts.

    - datetime.date / datetime.datetime → ISO string (handles
      ``first_occurrence_date`` / ``last_occurrence_date``).
    - month_histogram (list of int) passes through.
    - all other values pass through unchanged.
    """
    out = []
    for r in rows:
        j = {}
        for k, v in r.items():
            if v is None:
                j[k] = None
            elif hasattr(v, 'isoformat'):
                j[k] = v.isoformat()
            else:
                j[k] = v
        out.append(j)
    return out


def export_species_parquet(con: duckdb.DuckDBPyConnection) -> None:
    """Build species.parquet + species.json + seasonality.json.

    Reads ``ecdysis_data.occurrences`` for the per-species temporal aggregates
    and ``public/data/occurrences.parquet`` (written by export.py) for the
    geographic aggregates (county / ecoregion counts) and seasonality buckets.
    Joins the FULL OUTER union of checklist + ecdysis with the Phase 77
    canonical_name → taxon_id bridge and the Phase 76 taxon_lineage_extended
    table to backfill family / subfamily / tribe / genus / subgenus per the
    TAX-02 / D-01 precedence (checklist first, iNat lineage second, fallback
    third).
    """
    occurrences_parquet = ASSETS_DIR / "occurrences.parquet"
    if not occurrences_parquet.exists():
        # Pitfall #8: clear failure when run before export.py has written its parquet.
        raise FileNotFoundError(
            f"species_export requires {occurrences_parquet}; run export.export_occurrences_parquet first"
        )

    ASSETS_DIR.mkdir(parents=True, exist_ok=True)

    # CTE 1: occ_with_geo — county / ecoregion / month per occurrence (from parquet).
    con.execute(
        f"""
        CREATE OR REPLACE TEMP VIEW occ_with_geo AS
        SELECT canonical_name, county, ecoregion_l3, year, month
        FROM read_parquet('{occurrences_parquet}')
        WHERE canonical_name IS NOT NULL
        """
    )

    # SQL-quoted IN-list of bee families for the species_universe filter.
    _bee_families_sql = ", ".join(f"'{f}'" for f in BEE_FAMILIES)

    # The aggregation query — single multi-CTE producing the final per-species row.
    #
    # Note: provisional_count is 0 until the WABA pipeline materializes
    # canonical_name on provisional rows (deferred per CONTEXT). When that
    # lands, the provisional_agg CTE picks it up automatically.
    species_query = f"""
        WITH occurrences_agg AS (
            SELECT
                canonical_name,
                COUNT(*) AS occurrence_count,
                SUM(CASE WHEN id IS NOT NULL THEN 1 ELSE 0 END) AS specimen_count,
                MIN(TRY_CAST(event_date AS DATE)) AS first_occurrence_date,
                MAX(TRY_CAST(event_date AS DATE)) AS last_occurrence_date,
                list_value(
                    SUM(CASE WHEN TRY_CAST(month AS INT) =  1 THEN 1 ELSE 0 END),
                    SUM(CASE WHEN TRY_CAST(month AS INT) =  2 THEN 1 ELSE 0 END),
                    SUM(CASE WHEN TRY_CAST(month AS INT) =  3 THEN 1 ELSE 0 END),
                    SUM(CASE WHEN TRY_CAST(month AS INT) =  4 THEN 1 ELSE 0 END),
                    SUM(CASE WHEN TRY_CAST(month AS INT) =  5 THEN 1 ELSE 0 END),
                    SUM(CASE WHEN TRY_CAST(month AS INT) =  6 THEN 1 ELSE 0 END),
                    SUM(CASE WHEN TRY_CAST(month AS INT) =  7 THEN 1 ELSE 0 END),
                    SUM(CASE WHEN TRY_CAST(month AS INT) =  8 THEN 1 ELSE 0 END),
                    SUM(CASE WHEN TRY_CAST(month AS INT) =  9 THEN 1 ELSE 0 END),
                    SUM(CASE WHEN TRY_CAST(month AS INT) = 10 THEN 1 ELSE 0 END),
                    SUM(CASE WHEN TRY_CAST(month AS INT) = 11 THEN 1 ELSE 0 END),
                    SUM(CASE WHEN TRY_CAST(month AS INT) = 12 THEN 1 ELSE 0 END)
                )::INTEGER[12] AS month_histogram
            FROM ecdysis_data.occurrences
            WHERE canonical_name IS NOT NULL
            GROUP BY canonical_name
        ),
        provisional_agg AS (
            -- provisional_count is 0 until WABA pipeline materializes
            -- canonical_name on provisional rows (deferred per CONTEXT).
            SELECT canonical_name, COUNT(*) AS provisional_count
            FROM read_parquet('{occurrences_parquet}')
            WHERE is_provisional = TRUE AND canonical_name IS NOT NULL
            GROUP BY canonical_name
        ),
        geo_agg AS (
            SELECT
                canonical_name,
                COUNT(DISTINCT county) AS county_count,
                COUNT(DISTINCT ecoregion_l3) AS ecoregion_count
            FROM occ_with_geo
            GROUP BY canonical_name
        ),
        species_universe AS (
            SELECT
                COALESCE(c.scientificName, oa.canonical_name) AS scientificName,
                COALESCE(c.canonical_name, oa.canonical_name) AS canonical_name,
                COALESCE(c.family, tle.family) AS family,
                COALESCE(c.subfamily, tle.subfamily) AS subfamily,
                COALESCE(c.tribe, tle.tribe) AS tribe,
                COALESCE(
                    c.genus,
                    tle.genus,
                    split_part(COALESCE(c.canonical_name, oa.canonical_name), ' ', 1)
                ) AS genus,
                COALESCE(c.subgenus, tle.subgenus) AS subgenus,
                c.specific_epithet AS specific_epithet,
                c.scientificName IS NOT NULL AS on_checklist,
                c.status AS status,
                COALESCE(oa.occurrence_count, 0) AS occurrence_count,
                COALESCE(oa.specimen_count, 0) AS specimen_count,
                COALESCE(pa.provisional_count, 0) AS provisional_count,
                oa.first_occurrence_date AS first_occurrence_date,
                oa.last_occurrence_date AS last_occurrence_date,
                -- NULL histograms (checklist-only rows) are filled with [0]*12
                -- in Python before parquet write — DuckDB COALESCE on
                -- INTEGER[12] is not implemented (1.4.x).
                oa.month_histogram AS month_histogram,
                COALESCE(ga.county_count, 0) AS county_count,
                COALESCE(ga.ecoregion_count, 0) AS ecoregion_count
            FROM checklist_data.species c
            FULL OUTER JOIN occurrences_agg oa
                ON oa.canonical_name = c.canonical_name
            LEFT JOIN inaturalist_data.canonical_to_taxon_id ctt
                ON ctt.canonical_name = COALESCE(c.canonical_name, oa.canonical_name)
            LEFT JOIN inaturalist_data.taxon_lineage_extended tle
                ON tle.taxon_id = ctt.taxon_id
            LEFT JOIN provisional_agg pa
                ON pa.canonical_name = COALESCE(c.canonical_name, oa.canonical_name)
            LEFT JOIN geo_agg ga
                ON ga.canonical_name = COALESCE(c.canonical_name, oa.canonical_name)
        )
        -- Pitfall #7: collapse any accidental duplicate canonical_name rows,
        -- preferring the checklist-favoring row when both arms produce one.
        --
        -- Restrict to the seven Anthophila families (BEE_FAMILIES). Non-bee
        -- byproducts of sample collection (other Hymenoptera, beetles, flies,
        -- moths, etc., plus order-rank-only IDs whose family never resolved)
        -- have no place in a bee species tree. The underlying occurrences
        -- still flow through occurrences.parquet for the map.
        SELECT DISTINCT ON (canonical_name) *
        FROM species_universe
        WHERE family IN ({_bee_families_sql})
        ORDER BY canonical_name, on_checklist DESC
    """

    fetched = con.execute(species_query).fetchall()
    fetched_cols = [d[0] for d in con.description]
    species_rows = [dict(zip(fetched_cols, row)) for row in fetched]

    # AGG-03: compute slug in Python via the canonical _slugify (no SQL slug;
    # avoids drift from the path-traversal-safe Python implementation).
    # Backfill NULL month_histogram (checklist-only rows) with [0]*12 — DuckDB
    # COALESCE on INTEGER[12] is unimplemented in 1.4.x, so fix in Python.
    _ZERO_HIST = [0] * 12
    for r in species_rows:
        r['slug'] = _slugify(r['scientificName'])
        if r.get('month_histogram') is None:
            r['month_histogram'] = list(_ZERO_HIST)

    # Build the parquet via pyarrow so the in-memory slug column lands on disk
    # without a temp DuckDB table that would lose the INT[12] type. Convert
    # month_histogram to a pyarrow list_<int32> column explicitly.
    columns = {col: [] for col in SPECIES_COLUMNS}
    for r in species_rows:
        for col in SPECIES_COLUMNS:
            columns[col].append(r.get(col))

    schema = pa.schema([
        ('scientificName', pa.string()),
        ('canonical_name', pa.string()),
        ('family', pa.string()),
        ('subfamily', pa.string()),
        ('tribe', pa.string()),
        ('genus', pa.string()),
        ('subgenus', pa.string()),
        ('specific_epithet', pa.string()),
        ('on_checklist', pa.bool_()),
        ('status', pa.string()),
        ('occurrence_count', pa.int64()),
        ('specimen_count', pa.int64()),
        ('provisional_count', pa.int64()),
        ('first_occurrence_date', pa.date32()),
        ('last_occurrence_date', pa.date32()),
        ('month_histogram', pa.list_(pa.int32())),
        ('county_count', pa.int64()),
        ('ecoregion_count', pa.int64()),
        ('slug', pa.string()),
    ])
    table = pa.table(columns, schema=schema)

    species_parquet = ASSETS_DIR / "species.parquet"
    pq.write_table(table, species_parquet, compression='snappy')

    # Verify post-write (mirrors data/export.py:262-273 print + assert pattern).
    row = con.execute(f"""
        SELECT COUNT(*) AS total,
               COUNT(*) - COUNT(DISTINCT canonical_name) AS dups
        FROM read_parquet('{species_parquet}')
    """).fetchone()
    total, dups = row
    print(f"  species.parquet: {total:,} rows, {species_parquet.stat().st_size:,} bytes")
    assert total > 0, "species.parquet must be non-empty"
    assert dups == 0, f"species.parquet has {dups} duplicate canonical_name rows"

    # ---- AGG-04: species.json ------------------------------------------------
    # Keep keys sorted for byte-for-byte idempotency across runs (Pitfall #6).
    # indent=2 keeps the file diff-friendly; the on-disk size is ~150 KB at
    # production scale.
    species_json_out = ASSETS_DIR / "species.json"
    species_json_out.write_text(
        json.dumps(_jsonify_rows(species_rows), sort_keys=True, indent=2),
        encoding='utf-8',
    )
    print(
        f"  species.json: {len(species_rows):,} rows, "
        f"{species_json_out.stat().st_size:,} bytes"
    )

    # ---- AGG-05: seasonality.json -------------------------------------------
    # Nested species → bucket → INT[12] for VIZ-04 lookup. Tight separators
    # (Pattern 3) shave ~30% off the on-disk size.
    seasonality: dict[str, dict[str, list[int]]] = defaultdict(
        lambda: defaultdict(lambda: [0] * 12)
    )
    seas_rows = con.execute(
        f"""
        SELECT canonical_name, county, ecoregion_l3, TRY_CAST(month AS INT) - 1 AS m_idx
        FROM read_parquet('{occurrences_parquet}')
        WHERE canonical_name IS NOT NULL AND month IS NOT NULL
        """
    ).fetchall()
    for canon, county, eco, m in seas_rows:
        if m is None or not (0 <= m < 12):
            continue
        seasonality[canon]["_total"][m] += 1
        if county:
            seasonality[canon][f"county:{county}"][m] += 1
        if eco:
            seasonality[canon][f"ecoregion_l3:{eco}"][m] += 1

    out_seas = {
        k: dict(sorted(v.items())) for k, v in sorted(seasonality.items())
    }
    seas_out = ASSETS_DIR / "seasonality.json"
    seas_out.write_text(
        json.dumps(out_seas, sort_keys=True, separators=(',', ':')),
        encoding='utf-8',
    )
    seas_size = seas_out.stat().st_size
    print(f"  seasonality.json: {len(out_seas):,} species, {seas_size:,} bytes")
    assert seas_size < 6 * 1024 * 1024, (
        f"seasonality.json exceeded 6 MB budget ({seas_size:,} bytes)"
    )


def main() -> None:
    """Build species.parquet + species.json + seasonality.json from beeatlas.duckdb."""
    print("Connecting to DuckDB...")
    con = duckdb.connect(DB_PATH)
    con.execute("INSTALL spatial; LOAD spatial;")
    print("Exporting species artifacts:")
    export_species_parquet(con)
    con.close()
    print("Done.")


if __name__ == "__main__":
    main()
