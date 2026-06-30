"""Export per-species aggregates and JSON sidecars for the Species Tab.

Reads dbt-produced sandbox/species.parquet and sandbox/occurrences.parquet,
adds slug via domain.slugify, emits six artifacts:
  - species.parquet              (23 cols incl. taxon_id + slug)
  - species.json                 (flat array — Eleventy _data/species.js consumer)
  - seasonality.json             (species → bucket → INT[12] — VIZ-04 lookup)
  - photos.json                  (per-species CC-licensed iNat photo list — D-07/D-08)
  - higher_taxa.json             (dbt rollup: all higher-rank taxa with counts + membership — D-03)

higher_rank_taxon_ids.json is retired (D-03). higher_taxa.json supersedes it.

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

from domain import slugify  # Phase 78 D-01: byte-for-byte slug invariant (Phase 102 PY-01: promoted from private feeds helper)


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


# AGG-02: 23 columns in canonical order. Used for both parquet schema and the
# JSON projection so the two artifacts agree on key ordering.
SPECIES_COLUMNS = [
    'scientificName', 'canonical_name', 'family', 'subfamily', 'tribe',
    'genus', 'subgenus', 'specific_epithet', 'on_checklist', 'status',
    'occurrence_count', 'specimen_count', 'provisional_count',
    'first_occurrence_date', 'last_occurrence_date', 'month_histogram',
    'county_count', 'ecoregion_count', 'checklist_count', 'checklist_record_count',
    'inat_obs_count', 'taxon_id', 'slug',
]

_ZERO_HIST = [0] * 12

# Phase 174 D-02: the 11 trait fields merged from species_traits.parquet into
# species_rows (and therefore into species.json) via Path B.
# NOT in SPECIES_COLUMNS — trait fields bypass the pyarrow schema write and
# reach species.json only through _jsonify_rows() serializing all dict keys.
_TRAIT_FIELDS = [
    'sociality', 'sociality_source',
    'nesting', 'nesting_source',
    'diet_breadth', 'diet_breadth_source',
    'host_plant_family', 'host_plant_detail',
    'native_status',
    'host_bees', 'host_bee_count',
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


def _check_slug_collisions(higher_taxa_rows: list[dict], species_rows: list[dict]) -> None:
    """Hard-fail if any two distinct taxa produce the same public URL (D-07).

    Called in export_species_parquet() after all taxon names and species slugs
    are resolved. Enumerates every taxon's public URL across ALL ranks and raises
    a descriptive AssertionError on any collision between distinct taxa.
    No auto-suffix — collisions require deliberate human resolution.

    URL scheme per rank (raw capitalized names; only species slugs are lowercased
    via domain.slugify — see CONTEXT.md §Established Patterns):
      genus     -> /species/{name}/
      subgenus  -> /species/{genus}/{name}/
      tribe     -> /species/tribe/{name}/
      subfamily -> /species/subfamily/{name}/
      species   -> /species/{slug}/  (slug already Genus/epithet format)
    """
    _rank_url = {
        'genus':     lambda t: f"/species/{t['name']}/",
        'subgenus':  lambda t: f"/species/{t['genus']}/{t['name']}/",
        'tribe':     lambda t: f"/species/tribe/{t['name']}/",
        'subfamily': lambda t: f"/species/subfamily/{t['name']}/",
    }
    seen: dict[str, tuple] = {}  # url -> (taxon_id, rank, name)
    for row in higher_taxa_rows:
        url = _rank_url[row['rank']](row)
        key = (row['taxon_id'], row['rank'], row['name'])
        if url in seen and seen[url] != key:
            raise AssertionError(
                f"Slug collision: {seen[url]!r} and {key!r} both produce URL {url!r}. "
                f"Resolve the genuine name clash deliberately — no auto-suffix."
            )
        seen[url] = key
    for sp in species_rows:
        # Skip genus-only rows (specific_epithet is None) — they do not generate
        # pages and their genus-name slug would collide with the genus taxon URL
        # by design (mirrors speciesList filter in _data/species.js line 99).
        if not sp.get('specific_epithet') and '/' not in str(sp.get('slug', '')):
            continue
        url = f"/species/{sp['slug']}/"
        key = (sp['taxon_id'], 'species', sp['canonical_name'])
        if url in seen and seen[url] != key:
            raise AssertionError(
                f"Slug collision between species {key!r} and {seen[url]!r} at URL {url!r}. "
                f"Resolve the genuine name clash deliberately — no auto-suffix."
            )
        seen[url] = key


def _build_higher_taxa(con: duckdb.DuckDBPyConnection) -> list[dict]:
    """Read dbt higher_taxa.parquet, emit public/data/higher_taxa.json.

    Replaces _build_higher_rank_taxon_ids (D-03 retirement). The dbt rollup
    already carries taxon_ids for all higher ranks plus member counts and
    membership edges — it supersedes the old flat name→taxon_id lookup.

    Returns the list of row dicts for use in the slug collision check.
    Raises FileNotFoundError if higher_taxa.parquet is absent (run dbt build first).
    """
    higher_taxa_parquet = DBT_SANDBOX_DIR / 'higher_taxa.parquet'
    if not higher_taxa_parquet.exists():
        raise FileNotFoundError(
            f"species_export requires {higher_taxa_parquet}; "
            f"run `bash data/dbt/run.sh build` first to produce the dbt mart"
        )
    rows = con.execute(
        f"SELECT * FROM read_parquet('{higher_taxa_parquet}') ORDER BY rank, name"
    ).fetchall()
    cols = [d[0] for d in con.description]
    higher_taxa_rows = [dict(zip(cols, r)) for r in rows]

    out = ASSETS_DIR / "higher_taxa.json"
    out.write_text(
        json.dumps(higher_taxa_rows, sort_keys=True, indent=2),
        encoding='utf-8',
    )
    print(f"  higher_taxa.json: {len(higher_taxa_rows):,} rows, {out.stat().st_size:,} bytes")
    assert len(higher_taxa_rows) > 0, "higher_taxa.json must be non-empty"
    subfamily_count = sum(1 for r in higher_taxa_rows if r['rank'] == 'subfamily')
    assert subfamily_count == 12, (
        f"higher_taxa.json: expected 12 bee subfamilies, got {subfamily_count}"
    )
    return higher_taxa_rows


def export_species_parquet(con: duckdb.DuckDBPyConnection) -> None:
    """Build species.parquet + species.json + seasonality.json + photos.json + higher_taxa.json.

    Reads ``DBT_SANDBOX_DIR/species.parquet`` (22 cols incl. taxon_id, produced by
    ``bash data/dbt/run.sh build``) and appends a ``slug`` column via
    ``domain.slugify``. Also reads ``DBT_SANDBOX_DIR/occurrences.parquet``
    for the per-occurrence seasonality bucket accumulation.

    Writes six artifacts to ASSETS_DIR:
      - species.parquet             (23 cols including taxon_id + slug)
      - species.json                (json.dumps sort_keys=True, indent=2)
      - seasonality.json            (json.dumps sort_keys=True, separators=(',', ':'))
      - photos.json                 (CC-licensed iNat obs photos, keyed by canonical_name)
      - higher_taxa.json            (dbt rollup: all higher-rank taxa with counts + membership, D-03)

    ``higher_rank_taxon_ids.json`` is retired (D-03) — use ``higher_taxa.json`` instead.

    Runs ``_check_slug_collisions`` after slug computation to hard-fail on any
    duplicate public URL across all ranks (D-07, PAGE-03).

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

    # Read the 22-col dbt mart (no slug). Exclude the last SPECIES_COLUMNS entry
    # ('slug') since the dbt mart does not have it yet.
    mart_cols = ', '.join(SPECIES_COLUMNS[:-1])
    fetched = con.execute(
        f"SELECT {mart_cols} FROM read_parquet('{species_parquet_in}') ORDER BY canonical_name"
    ).fetchall()
    fetched_cols = [d[0] for d in con.description]
    species_rows = [dict(zip(fetched_cols, row)) for row in fetched]

    # AGG-03: compute slug in Python via the canonical slugify (no SQL slug;
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
            r['slug'] = genus if genus else slugify(r['scientificName'])
        if r.get('month_histogram') is None:
            r['month_histogram'] = list(_ZERO_HIST)

    # Phase 174 D-03 Path B: merge species_traits.parquet into species_rows by
    # canonical_name. SPECIES_COLUMNS and the pyarrow schema are NOT changed —
    # trait fields enter species.json via _jsonify_rows() serializing ALL dict keys.
    # Graceful degradation: warn and null-fill when parquet absent (local dev without
    # full dbt build); do NOT hard-fail (RESEARCH Open Question 2 resolved: warn-and-proceed).
    traits_parquet = DBT_SANDBOX_DIR / 'species_traits.parquet'
    if traits_parquet.exists():
        trait_rows = con.execute(
            f"SELECT * FROM read_parquet('{traits_parquet}')"
        ).fetchall()
        trait_cols = [d[0] for d in con.description]
        traits_by_name = {
            dict(zip(trait_cols, r))['canonical_name']: dict(zip(trait_cols, r))
            for r in trait_rows
        }
        for r in species_rows:
            t = traits_by_name.get(r['canonical_name'], {})
            for field in _TRAIT_FIELDS:
                r[field] = t.get(field)
    else:
        print("  WARNING: species_traits.parquet not found — trait fields omitted from species.json")
        for r in species_rows:
            for field in _TRAIT_FIELDS:
                r[field] = None

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
        ('checklist_count', pa.int64()),
        ('checklist_record_count', pa.int64()),
        ('inat_obs_count', pa.int64()),
        ('taxon_id', pa.int32()),
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

    # ---- AGG-06: photos.json ------------------------------------------------
    # Per-species list of CC-licensed iNat observation photos.
    # Structure: { "Canonical Name": [{"license": "...", "url": "..."}, ...] }
    # D-07/D-08: keyed by canonical_name, CC-licensed only.
    # inat_obs_data schema is populated by inat_obs_pipeline.load_inat_obs(con)
    # earlier in the nightly pipeline. If absent (e.g. test/dev context), write
    # an empty dict and warn rather than crashing the entire export.
    photos: dict[str, list[dict]] = {}
    try:
        photos_rows = con.execute("""
            SELECT canonical_name, image_url, license
            FROM inat_obs_data.observations
            WHERE license IS NOT NULL AND license != 'all rights reserved'
              AND image_url IS NOT NULL
            ORDER BY canonical_name
        """).fetchall()
        for canon, url, license_ in photos_rows:
            if canon not in photos:
                photos[canon] = []
            photos[canon].append({"license": license_, "url": url})
    except Exception as exc:  # noqa: BLE001
        print(f"  photos.json: WARNING — inat_obs_data.observations not available ({exc}); writing empty dict")
    photos_out = ASSETS_DIR / "photos.json"
    photos_out.write_text(
        json.dumps(photos, sort_keys=True, indent=2),
        encoding='utf-8',
    )
    print(f"  photos.json: {len(photos):,} species, {photos_out.stat().st_size:,} bytes")

    # ---- D-03: higher_taxa.json (replaces higher_rank_taxon_ids.json) -------
    # Reads DBT_SANDBOX_DIR/higher_taxa.parquet produced by the new dbt rollup.
    # Carries taxon_ids + counts + membership for all higher ranks. Runs the
    # slug-collision hard-fail gate (D-07) after all slugs are known.
    higher_taxa_rows = _build_higher_taxa(con)
    _check_slug_collisions(higher_taxa_rows, species_rows)


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
