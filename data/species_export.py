"""Export per-species aggregates and JSON sidecars for the Species Tab.

Reads dbt-produced sandbox/species.parquet and sandbox/occurrences.parquet,
adds slug via feeds._slugify, emits three artifacts:
  - species.parquet    (19 cols incl. slug)
  - species.json       (flat array — Eleventy _data/species.js consumer)
  - seasonality.json   (species → bucket → INT[12] — VIZ-04 lookup)

Run AFTER ``bash data/dbt/run.sh build`` (which writes
DBT_SANDBOX_DIR/species.parquet and DBT_SANDBOX_DIR/occurrences.parquet).

In run.py STEPS this is called as ("species-export", export_species_parquet)
BEFORE "feeds" (which uses public/data/feeds/).

Usage:
    cd data && uv run python species_export.py
    # or, for diff-harness verification:
    EXPORT_DIR=data/dbt/target/sandbox uv run python species_export.py
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

# DBT_SANDBOX_DIR: the directory where dbt writes its external mart outputs.
# Independent of EXPORT_DIR (the write path). In production, dbt builds to
# data/dbt/target/sandbox/ and species_export.py writes to public/data/.
# In the diff harness (EXPORT_DIR=data/dbt/target/sandbox), both paths coincide.
DBT_SANDBOX_DIR = Path(os.environ.get(
    'DBT_SANDBOX_DIR',
    str(Path(__file__).parent / 'dbt' / 'target' / 'sandbox'),
))


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

_ZERO_HIST = [0] * 12


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

    Reads ``DBT_SANDBOX_DIR/species.parquet`` (18 cols, produced by
    ``bash data/dbt/run.sh build``) and appends a ``slug`` column via
    ``feeds._slugify``. Also reads ``DBT_SANDBOX_DIR/occurrences.parquet``
    for the per-occurrence seasonality bucket accumulation.

    Writes three artifacts to ASSETS_DIR:
      - species.parquet  (19 cols including slug)
      - species.json     (json.dumps sort_keys=True, indent=2)
      - seasonality.json (json.dumps sort_keys=True, separators=(',', ':'))

    The write path (ASSETS_DIR) is controlled by the EXPORT_DIR env var.
    The read path (DBT_SANDBOX_DIR) defaults to data/dbt/target/sandbox and
    is controlled by the DBT_SANDBOX_DIR env var. The two are independent.
    """
    species_parquet_in = DBT_SANDBOX_DIR / 'species.parquet'
    if not species_parquet_in.exists():
        raise FileNotFoundError(
            f"species_export requires {species_parquet_in}; "
            f"run `bash data/dbt/run.sh build` first to produce the dbt mart"
        )

    occurrences_parquet_in = DBT_SANDBOX_DIR / 'occurrences.parquet'
    if not occurrences_parquet_in.exists():
        raise FileNotFoundError(
            f"species_export requires {occurrences_parquet_in}; "
            f"run `bash data/dbt/run.sh build` first to produce the dbt mart"
        )

    ASSETS_DIR.mkdir(parents=True, exist_ok=True)

    # Read the 18-col dbt mart (no slug). Exclude the last SPECIES_COLUMNS entry
    # ('slug') since the dbt mart does not have it yet.
    mart_cols = ', '.join(SPECIES_COLUMNS[:-1])
    fetched = con.execute(
        f"SELECT {mart_cols} FROM read_parquet('{species_parquet_in}') ORDER BY canonical_name"
    ).fetchall()
    fetched_cols = [d[0] for d in con.description]
    species_rows = [dict(zip(fetched_cols, row)) for row in fetched]

    # AGG-03: compute slug in Python via the canonical _slugify (no SQL slug;
    # avoids drift from the path-traversal-safe Python implementation).
    # Backfill NULL month_histogram (checklist-only rows) with [0]*12 — DuckDB
    # COALESCE on INTEGER[12] is unimplemented in 1.4.x, so fix in Python.
    # (The dbt CASE expression in int_species_universe should handle this now,
    # but the defensive backfill stays in case any row slips through with NULL.)
    for r in species_rows:
        genus = r.get('genus') or ''
        epithet = r.get('specific_epithet') or ''
        if genus and epithet:
            r['slug'] = f"{genus}/{epithet}"
        else:
            # Genus-only rows (102 rows in production, none on_checklist)
            r['slug'] = genus if genus else _slugify(r['scientificName'])
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
    # Pitfall #4: reads from DBT_SANDBOX_DIR/occurrences.parquet (the dbt mart),
    # NOT from ASSETS_DIR/occurrences.parquet, to keep diff comparison clean
    # (production ASSETS_DIR = public/data/ which may differ from the sandbox).
    seasonality: dict[str, dict[str, list[int]]] = defaultdict(
        lambda: defaultdict(lambda: [0] * 12)
    )
    seas_rows = con.execute(
        f"""
        SELECT canonical_name, county, ecoregion_l3, TRY_CAST(month AS INT) - 1 AS m_idx
        FROM read_parquet('{occurrences_parquet_in}')
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
