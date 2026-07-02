"""Phase 76 checklist loader.

Reads the WA bee checklist TSV (Bartholomew et al. 2024) and writes:
  - checklist_data.species (one row per DISTINCT species, 11 columns)
  - checklist_data.species_counties (raw per-(species, county) rows)

Both tables use CREATE OR REPLACE — full refresh on every run. No dlt cursor.

Phase 76 / D-01, D-02, D-04, D-05. Plan 05 extends this module with the
occurrences-side canonical_name materialization and the synonyms.csv-driven
reconciliation flow with checklist_unmatched.csv writeback.

Phase 135 Plan 03:
  - Added canonical_name VARCHAR to checklist_records_full (RCN-01).
  - Slash-compound rows get LCA canonical name; verbatim_name unchanged (D-05).
  - reconcile() retired per D-07; synonym path constants removed (RCN-06).
"""

import csv
import datetime
import gzip
import os
from pathlib import Path

import duckdb
import pyarrow as pa

from canonical_name import normalize_scientific_name

def _bulk_insert(
    con: duckdb.DuckDBPyConnection,
    table: str,
    columns: list[str],
    records: list[tuple],
) -> None:
    """Bulk-insert records into a DuckDB table via Apache Arrow.

    Transposes the list of tuples into columnar form, registers as an Arrow
    view on the connection, and issues a single INSERT..SELECT. This is
    significantly faster than row-by-row executemany for large row sets.

    Empty records list is a no-op, matching executemany([]) behaviour.
    DuckDB casts each Arrow column to the target table's declared type, so
    the CREATE OR REPLACE TABLE DDL remains the authoritative type source.
    """
    if not records:
        return
    cols_data = list(zip(*records))
    arrow_tbl = pa.table({name: pa.array(col) for name, col in zip(columns, cols_data)})
    col_list = ", ".join(columns)
    try:
        con.register("_bulk_arrow", arrow_tbl)
        con.execute(f"INSERT INTO {table} ({col_list}) SELECT {col_list} FROM _bulk_arrow")
    finally:
        con.unregister("_bulk_arrow")


DB_PATH = os.environ.get("DB_PATH", str(Path(__file__).parent / "beeatlas.duckdb"))
CHECKLIST_PATH = Path(__file__).parent / "checklists" / "wa_bee_checklist.tsv"
CHECKLIST_RECORDS_PATH = Path(__file__).parent / "checklists" / "wa_bee_checklist_records.tsv"
CHECKLIST_RECORDS_FULL_PATH = Path(__file__).parent / "checklists" / "checklist_records_full.csv"
TAXA_PATH = Path(__file__).parent / "raw" / "taxa.csv.gz"
SOURCE_CITATION = "Bartholomew et al. 2024, JHR 97 (DOI: 10.3897/jhr.97.129013)"

# ---------------------------------------------------------------------------
# LCA helpers for slash-compound verbatim names (RCN-05 / D-05).
# All Anthophila ancestor taxon_id = 630955 (verified from taxa.csv.gz).
# ---------------------------------------------------------------------------

_ANTHOPHILA_ANCESTOR = "630955"

# Module-level cache: loaded once per process, keyed by lowercase species name.
_TAXA_ANCESTRY: dict[str, dict] | None = None


def _load_taxa_ancestry() -> dict[str, dict]:
    """Load species-rank active Anthophila taxa from taxa.csv.gz into a dict.

    Returns: dict mapping lowercase species name -> {taxon_id: int, ancestry: str}
    Loaded once and cached in _TAXA_ANCESTRY.
    """
    global _TAXA_ANCESTRY
    if _TAXA_ANCESTRY is not None:
        return _TAXA_ANCESTRY
    result: dict[str, dict] = {}
    if not TAXA_PATH.exists():
        _TAXA_ANCESTRY = result
        return result
    anthophila_marker = f"/{_ANTHOPHILA_ANCESTOR}/"
    with gzip.open(str(TAXA_PATH), "rt", newline="") as f:
        reader = csv.reader(f, delimiter="\t")
        next(reader)  # skip header
        for row in reader:
            if len(row) < 6:
                continue
            taxon_id, ancestry, _rank_level, rank, name, active = row[:6]
            if active != "true":
                continue
            if rank not in ("species", "subspecies"):
                continue
            if anthophila_marker not in (ancestry + "/"):
                continue
            result[name.lower()] = {
                "taxon_id": int(taxon_id),
                "ancestry": ancestry,
            }
    _TAXA_ANCESTRY = result
    return result


def _compute_lca(name1: str, name2: str, taxa: dict[str, dict]) -> int | None:
    """Compute LCA taxon_id for two lowercase species canonical names.

    Uses the slash-delimited ancestry path from taxa.csv.gz. LCA is the
    last common node when traversing both paths in parallel (RCN-05).
    """
    r1 = taxa.get(name1)
    r2 = taxa.get(name2)
    if r1 is None or r2 is None:
        return None
    path1 = (r1["ancestry"] + "/" + str(r1["taxon_id"])).split("/")
    path2 = (r2["ancestry"] + "/" + str(r2["taxon_id"])).split("/")
    lca = None
    for a, b in zip(path1, path2):
        if a == b:
            lca = a
        else:
            break
    return int(lca) if lca else None


def _lca_canonical_name(lca_taxon_id: int, taxa: dict[str, dict]) -> str | None:
    """Return the lowercase name for the given taxon_id from the taxa dict."""
    for name, row in taxa.items():
        if row["taxon_id"] == lca_taxon_id:
            return name
    # Taxon might be higher-rank (not in species-only cache) — fall back to None.
    # This triggers loading all ranks; for correctness, also scan lineage.
    return None


def _slash_canonical_name(verbatim_name: str) -> str | None:
    """Resolve a slash-compound verbatim name to the LCA canonical name.

    Detects '/' in verbatim_name (raw string, before normalization per Pitfall 4).
    Splits into two binomials, computes LCA from taxa.csv.gz ancestry.

    Returns: lowercase LCA canonical name, or None if LCA cannot be computed.
    """
    # Strip any trailing authority before splitting on slash.
    # E.g. "Agapostemon texanus/angelicus Cresson, 1872"
    # Strip the authority by taking everything up to any trailing " Authorname, YYYY"
    # We can reuse the genus part from verbatim_name by stripping authority words.
    # Simple approach: find the '/', extract genus from leading tokens, split epithets.
    parts = verbatim_name.strip().split()
    if not parts:
        return None

    # Find the slash-containing token (first token with '/')
    slash_idx = next((i for i, p in enumerate(parts) if "/" in p), None)
    if slash_idx is None:
        return None

    genus = parts[0]  # First token is always the genus
    slash_token = parts[slash_idx]  # e.g. "texanus/angelicus"
    epithets = slash_token.split("/")
    if len(epithets) < 2:
        return None

    epithet1 = epithets[0].strip()
    epithet2 = epithets[1].strip()
    if not epithet1 or not epithet2:
        return None

    name1 = f"{genus} {epithet1}".lower()
    name2 = f"{genus} {epithet2}".lower()

    taxa = _load_taxa_ancestry()
    lca_id = _compute_lca(name1, name2, taxa)
    if lca_id is None:
        return None

    # Look up the name for this lca_id in the taxa dict.
    lca_name = _lca_canonical_name(lca_id, taxa)
    if lca_name:
        return lca_name

    # LCA is a higher-rank node (not species-rank) — need to load all ranks.
    # Re-scan taxa.csv.gz for the exact taxon_id at any rank.
    if not TAXA_PATH.exists():
        return None
    with gzip.open(str(TAXA_PATH), "rt", newline="") as f:
        reader = csv.reader(f, delimiter="\t")
        next(reader)  # skip header
        for row in reader:
            if len(row) < 5:
                continue
            taxon_id_str, _ancestry, _rank_level, _rank, name = row[:5]
            try:
                if int(taxon_id_str) == lca_id:
                    return name.lower()
            except ValueError:
                pass
    return None


# Tight WA bounding box (D-01): no padding for border records.
_WA_LAT_MIN = 45.5
_WA_LAT_MAX = 49.0
_WA_LON_MIN = -124.85
_WA_LON_MAX = -116.9


def _parse_checklist_date(raw: str) -> tuple[int | None, int | None, int | None, str]:
    """Parse a raw Date cell from checklist_records_full.csv.

    Returns (year, month, day, date_quality) where date_quality is one of:
      'full'      — parsed to year, month, day (43,602 ISO datetimes + 64 ISO dates +
                    291 M/D/YYYY in the current file)
      'year_only' — parsed to year only (0 rows in current file; kept for robustness,
                    D-07)
      'none'      — empty/whitespace/unparseable (6,689 empty in current file, D-07)

    Parsing strategy (D-09, stdlib-first; dateparser retained only as documented
    fallback tier — the current file is 100% handled by stdlib):
      1. ISO datetime via datetime.datetime.fromisoformat() — drops time component (D-05)
      2. ISO date via datetime.date.fromisoformat()
      3. M/D/YYYY via strptime('%m/%d/%Y') — US month-first, deterministic (D-08)
      4. Pure-year integer branch — 'year_only' quality (D-07)
      5. Empty/unparseable — all-None + 'none' quality (D-07)

    NOTE: datetime.date/datetime.datetime handle pre-1900 dates correctly (e.g.
    date(1812, 6, 18) is valid). The 1900 floor only applies to strftime, not to
    fromisoformat or the date/datetime constructors themselves (D-09).
    """
    stripped = (raw or "").strip()
    if not stripped:
        return (None, None, None, "none")

    # 1. ISO datetime (most common: 43,602 rows like 1991-07-12T00:00:00)
    if "T" in stripped:
        try:
            dt = datetime.datetime.fromisoformat(stripped)
            return (dt.year, dt.month, dt.day, "full")
        except ValueError:
            pass

    # 2. ISO date (64 rows like 1991-07-12 or pre-1900 1812-06-18)
    if stripped.count("-") >= 2:
        try:
            d = datetime.date.fromisoformat(stripped)
            return (d.year, d.month, d.day, "full")
        except ValueError:
            pass

    # 3. M/D/YYYY — US month-first (291 rows like 6/14/1905) — deterministic (D-08)
    if "/" in stripped:
        try:
            d = datetime.datetime.strptime(stripped, "%m/%d/%Y")
            return (d.year, d.month, d.day, "full")
        except ValueError:
            pass

    # 4. Pure-year integer branch (0 rows in current file; 'year_only' kept for D-07)
    try:
        year = int(stripped)
        if 1000 <= year <= 9999:  # sanity-check for 4-digit year
            return (year, None, None, "year_only")
    except ValueError:
        pass

    # 5. Unparseable — all-None + 'none' (fallback; dateparser could be tried here)
    return (None, None, None, "none")


def _coord_flag(lat: float | None, lon: float | None) -> str:
    """Classify a coordinate pair from the checklist CSV.

    Returns one of:
      'null_coord'   — either lat or lon is None (empty source cell, D-03)
      'zero_coord'   — both lat == 0 and lon == 0 (Gulf-of-Guinea guard, PITFALLS #3)
      'valid'        — falls within the tight WA bounding box (D-01)
      'out_of_bbox'  — non-null, non-zero, but outside the tight WA bbox (D-01)

    Order matters: null check FIRST, then zero check, THEN bbox membership (PITFALLS
    #3: a (0, 0) point passes the bbox test if zero_coord check is skipped).
    """
    # 1. Null check (either coord missing)
    if lat is None or lon is None:
        return "null_coord"

    # 2. Zero-coordinate Gulf-of-Guinea guard — checked BEFORE the bbox test
    if lat == 0 and lon == 0:
        return "zero_coord"

    # 3. Tight WA bbox membership (inclusive bounds, D-01)
    if _WA_LAT_MIN <= lat <= _WA_LAT_MAX and _WA_LON_MIN <= lon <= _WA_LON_MAX:
        return "valid"

    return "out_of_bbox"


def _update_occurrences_canonical_name(con: duckdb.DuckDBPyConnection) -> None:
    """Materialize canonical_name on ecdysis_data.occurrences (D-04).

    The ecdysis pipeline uses write_disposition='replace', so this column is
    dropped and re-added on every nightly run. The IF NOT EXISTS guard keeps
    the SQL safe in both cold and warm DB states (per RESEARCH.md
    Runtime State Inventory).

    Pure-Python canonicalize is called per DISTINCT scientific_name (~few
    thousand distinct values out of ~45K rows), then mapped back via UPDATE.
    """
    con.execute(
        "ALTER TABLE ecdysis_data.occurrences "
        "ADD COLUMN IF NOT EXISTS canonical_name VARCHAR"
    )
    rows = con.execute("""
        SELECT DISTINCT scientific_name FROM ecdysis_data.occurrences
        WHERE scientific_name IS NOT NULL AND scientific_name != ''
    """).fetchall()
    mapping: list[tuple[str | None, str]] = [
        (normalize_scientific_name(r[0]), r[0]) for r in rows
    ]
    if mapping:
        con.executemany(
            "UPDATE ecdysis_data.occurrences "
            "SET canonical_name = ? WHERE scientific_name = ?",
            mapping,
        )
    updated = con.execute(
        "SELECT count(*) FROM ecdysis_data.occurrences "
        "WHERE canonical_name IS NOT NULL"
    ).fetchone()[0]
    print(f"occurrences canonical_name: {updated} rows updated")  # noqa: T201


def _load_checklist_records(con: duckdb.DuckDBPyConnection) -> None:
    """Load individual occurrence records from wa_bee_checklist_records.tsv
    into checklist_data.checklist_records (scientificName, county, year, month).

    One row per specimen record from the original CSV; year/month may be NULL
    for records with missing or unparseable dates. Used by the dbt checklist
    mart to populate real year/month values instead of NULL placeholders.
    """
    records: list[tuple] = []
    with CHECKLIST_RECORDS_PATH.open(newline="") as f:
        reader = csv.DictReader(f, delimiter="\t")
        for row in reader:
            sci = (row.get("species") or "").strip()
            cty = (row.get("county") or "").strip()
            yr_str = (row.get("year") or "").strip()
            mo_str = (row.get("month") or "").strip()
            if not sci:
                continue
            year = int(yr_str) if yr_str.isdigit() else None
            month = int(mo_str) if mo_str.isdigit() else None
            records.append((sci, cty, year, month))

    con.execute("""
        CREATE OR REPLACE TABLE checklist_data.checklist_records (
            scientificName VARCHAR,
            county VARCHAR,
            year BIGINT,
            month BIGINT
        )
    """)
    _bulk_insert(
        con,
        "checklist_data.checklist_records",
        ["scientificName", "county", "year", "month"],
        records,
    )
    count = con.execute("SELECT count(*) FROM checklist_data.checklist_records").fetchone()[0]
    print(f"checklist_records: {count} individual occurrence records loaded")  # noqa: T201


def _compute_canonical_names_for_records(
    verbatim_names: list[str | None],
) -> dict[str | None, str | None]:
    """Build a verbatim_name -> canonical_name mapping for checklist_records_full rows.

    Mirrors the _update_occurrences_canonical_name() pattern: operate on
    DISTINCT values to avoid redundant work, then map back.

    Per RCN-01 / D-05:
    - Non-slash rows: canonical_name = normalize_scientific_name(verbatim_name)
    - Slash rows ('/' in verbatim_name): canonical_name = LCA accepted name
      (verbatim_name unchanged). Slash detection is BEFORE normalization (Pitfall 4).
    - None or empty verbatim_name: canonical_name = None
    """
    distinct = set(verbatim_names)
    mapping: dict[str | None, str | None] = {}
    for vn in distinct:
        if vn is None:
            mapping[None] = None
            continue
        # Slash detection: must precede normalize_scientific_name() (RESEARCH Pitfall 4)
        if "/" in vn:
            lca = _slash_canonical_name(vn)
            mapping[vn] = lca  # None if LCA cannot be resolved
        else:
            mapping[vn] = normalize_scientific_name(vn)
    return mapping


def _load_checklist_records_full(con: duckdb.DuckDBPyConnection) -> None:
    """Load full-fidelity occurrence records from checklist_records_full.csv
    into checklist_data.checklist_records_full.

    All 50,646 rows are kept — invalid coordinates are tagged via coord_flag
    (valid/null_coord/zero_coord/out_of_bbox), never dropped (D-03).
    Dates are normalized into (year, month, day, date_quality) via
    _parse_checklist_date() (D-05/D-07/D-08/D-09).

    Reads Latitude/Longitude source columns ONLY; x/y redundant columns are
    ignored (D-02). verbatim_name = raw 'Scientific Name' with authority,
    stored unmodified — do NOT call normalize_scientific_name() on it (D-12).

    Phase 135: canonical_name column added (RCN-01). Slash-compound rows
    carry the LCA's accepted canonical name; verbatim_name unchanged (D-05).
    Column is included in CREATE OR REPLACE TABLE (avoids ALTER-ADD-COLUMN
    re-run failure — RESEARCH Pitfall 5).

    Logs: one summary count line + one per-reason coord exclusion breakdown (D-04).
    """
    raw_rows: list[tuple] = []
    verbatim_names: list[str | None] = []
    with CHECKLIST_RECORDS_FULL_PATH.open(newline="") as f:
        reader = csv.DictReader(f)  # comma-delimited (not TSV)
        for row in reader:
            object_id_str = (row.get("ObjectID") or "").strip()
            object_id = int(object_id_str) if object_id_str.isdigit() else None
            family = (row.get("Family") or "").strip() or None
            genus = (row.get("Genus") or "").strip() or None
            verbatim_name = (row.get("Scientific Name") or "").strip() or None
            locality = (row.get("Locality") or "").strip() or None
            recorded_by = (row.get("recordedBy") or "").strip() or None

            # Coordinates: parse to float or None (D-02: use Lat/Lon only, ignore x/y)
            lat_str = (row.get("Latitude") or "").strip()
            lon_str = (row.get("Longitude") or "").strip()
            try:
                lat: float | None = float(lat_str) if lat_str else None
            except ValueError:
                lat = None
            try:
                lon: float | None = float(lon_str) if lon_str else None
            except ValueError:
                lon = None

            # Date: normalize to (year, month, day, date_quality)
            raw_date = row.get("Date") or ""
            year, month, day, date_quality = _parse_checklist_date(raw_date)

            # Coord flag: classify coordinate quality (D-03, PITFALLS #3)
            cf = _coord_flag(lat, lon)

            raw_rows.append((
                object_id,    # ObjectID BIGINT
                family,       # family VARCHAR
                genus,        # genus VARCHAR
                verbatim_name,  # verbatim_name VARCHAR (raw, unmodified, with authority)
                locality,     # locality VARCHAR
                lat,          # latitude DOUBLE
                lon,          # longitude DOUBLE
                recorded_by,  # recordedBy VARCHAR
                year,         # year BIGINT
                month,        # month BIGINT
                day,          # day BIGINT
                date_quality,  # date_quality VARCHAR
                cf,           # coord_flag VARCHAR
            ))
            verbatim_names.append(verbatim_name)

    # Build canonical_name mapping from distinct verbatim_names (RCN-01).
    canonical_map = _compute_canonical_names_for_records(verbatim_names)

    # Assemble final records: insert canonical_name after verbatim_name (index 3).
    # Schema column order: ObjectID, family, genus, verbatim_name, canonical_name,
    #   locality, latitude, longitude, recordedBy, year, month, day,
    #   date_quality, coord_flag (14 columns).
    records: list[tuple] = []
    for raw in raw_rows:
        (
            object_id, family, genus, verbatim_name,
            locality, lat, lon, recorded_by,
            year, month, day, date_quality, cf,
        ) = raw
        canon = canonical_map.get(verbatim_name)
        records.append((
            object_id,      # ObjectID BIGINT
            family,         # family VARCHAR
            genus,          # genus VARCHAR
            verbatim_name,  # verbatim_name VARCHAR (raw, unmodified)
            canon,          # canonical_name VARCHAR (RCN-01)
            locality,       # locality VARCHAR
            lat,            # latitude DOUBLE
            lon,            # longitude DOUBLE
            recorded_by,    # recordedBy VARCHAR
            year,           # year BIGINT
            month,          # month BIGINT
            day,            # day BIGINT
            date_quality,   # date_quality VARCHAR
            cf,             # coord_flag VARCHAR
        ))

    con.execute("""
        CREATE OR REPLACE TABLE checklist_data.checklist_records_full (
            ObjectID BIGINT,
            family VARCHAR,
            genus VARCHAR,
            verbatim_name VARCHAR,
            canonical_name VARCHAR,
            locality VARCHAR,
            latitude DOUBLE,
            longitude DOUBLE,
            recordedBy VARCHAR,
            year BIGINT,
            month BIGINT,
            day BIGINT,
            date_quality VARCHAR,
            coord_flag VARCHAR
        )
    """)
    _bulk_insert(
        con,
        "checklist_data.checklist_records_full",
        [
            "ObjectID", "family", "genus", "verbatim_name", "canonical_name",
            "locality", "latitude", "longitude", "recordedBy",
            "year", "month", "day", "date_quality", "coord_flag",
        ],
        records,
    )

    count = con.execute(
        "SELECT count(*) FROM checklist_data.checklist_records_full"
    ).fetchone()[0]
    print(f"checklist_records_full: {count} full-fidelity occurrence records loaded")  # noqa: T201

    # Per-reason coord exclusion breakdown (D-04)
    # coord_flag is at index 13 in the new 14-column tuple.
    null_c = sum(1 for r in records if r[13] == "null_coord")
    zero_c = sum(1 for r in records if r[13] == "zero_coord")
    bbox_c = sum(1 for r in records if r[13] == "out_of_bbox")
    excluded = null_c + zero_c + bbox_c
    print(  # noqa: T201
        f"checklist_records_full: {excluded} coordinates excluded "
        f"(null_coord={null_c}, zero_coord={zero_c}, out_of_bbox={bbox_c})"
    )


def load_checklist(con: "duckdb.DuckDBPyConnection | None" = None) -> None:
    """Read the WA bee checklist TSV and populate checklist_data.species
    + checklist_data.species_counties + checklist_data.checklist_records.

    When called with no arguments (the nightly path), creates and closes its
    own DB_PATH connection. Pass an existing connection via ``con`` to inject
    a shared in-memory connection for testing (D-05).
    """
    _owns_connection = con is None
    if _owns_connection:
        con = duckdb.connect(DB_PATH)
    try:
        con.execute("CREATE SCHEMA IF NOT EXISTS checklist_data")

        species_set: set[str] = set()
        species_counties: list[tuple[str, str]] = []
        with CHECKLIST_PATH.open(newline="") as f:
            reader = csv.DictReader(f, delimiter="\t")
            for row in reader:
                sci = (row.get("species") or "").strip()
                cty = (row.get("county") or "").strip()
                if sci:
                    species_set.add(sci)
                    if cty:
                        species_counties.append((sci, cty))

        species_rows: list[tuple] = []
        for sci in sorted(species_set):
            parts = sci.split()
            genus = parts[0] if parts else None
            specific_epithet = parts[1] if len(parts) >= 2 else None
            species_rows.append((
                sci,                        # scientificName
                None,                       # family    (TAX-02 fills via iNat lineage in Phase 77)
                None,                       # subfamily
                None,                       # tribe
                genus,                      # genus
                None,                       # subgenus
                specific_epithet,           # specific_epithet
                "verified",                 # status (D-02)
                SOURCE_CITATION,            # source_citation
                None,                       # notes
                normalize_scientific_name(sci),          # canonical_name (D-04)
            ))

        con.execute("""
            CREATE OR REPLACE TABLE checklist_data.species (
                scientificName VARCHAR PRIMARY KEY,
                family VARCHAR,
                subfamily VARCHAR,
                tribe VARCHAR,
                genus VARCHAR,
                subgenus VARCHAR,
                specific_epithet VARCHAR,
                status VARCHAR CHECK (status IN ('verified', 'likely-to-occur')),
                source_citation VARCHAR,
                notes VARCHAR,
                canonical_name VARCHAR NOT NULL
            )
        """)
        _bulk_insert(
            con,
            "checklist_data.species",
            [
                "scientificName", "family", "subfamily", "tribe", "genus",
                "subgenus", "specific_epithet", "status", "source_citation",
                "notes", "canonical_name",
            ],
            species_rows,
        )

        con.execute("""
            CREATE OR REPLACE TABLE checklist_data.species_counties (
                scientificName VARCHAR,
                county VARCHAR
            )
        """)
        _bulk_insert(
            con,
            "checklist_data.species_counties",
            ["scientificName", "county"],
            species_counties,
        )

        species_count = con.execute("SELECT count(*) FROM checklist_data.species").fetchone()[0]
        sc_count = con.execute("SELECT count(*) FROM checklist_data.species_counties").fetchone()[0]
        print(f"checklist: {species_count} species, {sc_count} county records")  # noqa: T201

        _load_checklist_records(con)
        _load_checklist_records_full(con)
        _update_occurrences_canonical_name(con)
        # D-07 / RCN-06: the old disjoint synonym step was retired here.
        # Synonym resolution now flows through occurrence_synonyms / int_synonyms.
    finally:
        if _owns_connection:
            con.close()


if __name__ == "__main__":
    load_checklist()
