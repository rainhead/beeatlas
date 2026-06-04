"""Phase 76 checklist loader.

Reads the WA bee checklist TSV (Bartholomew et al. 2024) and writes:
  - checklist_data.species (one row per DISTINCT species, 11 columns)
  - checklist_data.species_counties (raw per-(species, county) rows)

Both tables use CREATE OR REPLACE — full refresh on every run. No dlt cursor.

Phase 76 / D-01, D-02, D-04, D-05. Plan 05 extends this module with the
occurrences-side canonical_name materialization and the synonyms.csv-driven
reconciliation flow with checklist_unmatched.csv writeback.
"""

import csv
import datetime
import os
from pathlib import Path

import duckdb

from canonical_name import normalize_scientific_name

DB_PATH = os.environ.get("DB_PATH", str(Path(__file__).parent / "beeatlas.duckdb"))
CHECKLIST_PATH = Path(__file__).parent / "checklists" / "wa_bee_checklist.tsv"
CHECKLIST_RECORDS_PATH = Path(__file__).parent / "checklists" / "wa_bee_checklist_records.tsv"
CHECKLIST_RECORDS_FULL_PATH = Path(__file__).parent / "checklists" / "checklist_records_full.csv"
SOURCE_CITATION = "Bartholomew et al. 2024, JHR 97 (DOI: 10.3897/jhr.97.129013)"
SYNONYMS_PATH = Path(__file__).parent / "checklist_synonyms.csv"
UNMATCHED_PATH = Path(__file__).parent / "checklist_unmatched.csv"

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


def reconcile(con: duckdb.DuckDBPyConnection) -> None:
    """Walk checklist; for rows whose canonical_name does not join any
    occurrence row, consult synonyms.csv; UPDATE checklist on synonym hit;
    write still-unmatched to checklist_unmatched.csv. Warn-only per D-05."""
    # Load synonyms.csv (header: checklist_name,canonical_name,source).
    synonyms: dict[str, str] = {}
    if SYNONYMS_PATH.exists():
        with SYNONYMS_PATH.open(newline="") as f:
            for row in csv.DictReader(f):
                cn = (row.get("checklist_name") or "").strip()
                ov = (row.get("canonical_name") or "").strip()
                if cn and ov:
                    synonyms[cn] = ov

    # Find checklist rows whose canonical_name does not join any occurrence.
    rows = con.execute("""
        SELECT cl.scientificName, cl.canonical_name
        FROM checklist_data.species cl
        LEFT JOIN ecdysis_data.occurrences occ
            ON occ.canonical_name = cl.canonical_name
        WHERE occ.canonical_name IS NULL
        GROUP BY cl.scientificName, cl.canonical_name
    """).fetchall()

    unmatched: list[tuple[str, str, str]] = []
    overrides_applied = 0
    for sci, canon in rows:
        if sci in synonyms:
            override = synonyms[sci]
            hit = con.execute(
                "SELECT 1 FROM ecdysis_data.occurrences "
                "WHERE canonical_name = ? LIMIT 1",
                [override],
            ).fetchone()
            if hit:
                # Researcher open-question-3 resolution: UPDATE the checklist
                # canonical_name to the override so downstream consumers see
                # no synonyms.csv complexity.
                con.execute(
                    "UPDATE checklist_data.species "
                    "SET canonical_name = ? WHERE scientificName = ?",
                    [override, sci],
                )
                overrides_applied += 1
                continue
            unmatched.append((sci, override, "synonym override did not join occurrences"))
        else:
            unmatched.append((sci, canon, "no occurrence row matches canonical_name"))

    # Write unmatched.csv (regenerated each run; D-05 warn-only policy).
    with UNMATCHED_PATH.open("w", newline="") as f:
        writer = csv.writer(f)
        writer.writerow(["checklist_name", "canonical_name", "reason"])
        for row in unmatched:
            writer.writerow(row)

    print(  # noqa: T201
        f"reconcile: {overrides_applied} synonym overrides applied; "
        f"{len(unmatched)} unmatched (warn-only); see {UNMATCHED_PATH.name}"
    )


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
    con.executemany(
        "INSERT INTO checklist_data.checklist_records VALUES (?, ?, ?, ?)",
        records,
    )
    count = con.execute("SELECT count(*) FROM checklist_data.checklist_records").fetchone()[0]
    print(f"checklist_records: {count} individual occurrence records loaded")  # noqa: T201


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

    Logs: one summary count line + one per-reason coord exclusion breakdown (D-04).
    """
    records: list[tuple] = []
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

            records.append((
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

    con.execute("""
        CREATE OR REPLACE TABLE checklist_data.checklist_records_full (
            ObjectID BIGINT,
            family VARCHAR,
            genus VARCHAR,
            verbatim_name VARCHAR,
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
    con.executemany(
        "INSERT INTO checklist_data.checklist_records_full VALUES "
        "(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        records,
    )

    count = con.execute(
        "SELECT count(*) FROM checklist_data.checklist_records_full"
    ).fetchone()[0]
    print(f"checklist_records_full: {count} full-fidelity occurrence records loaded")  # noqa: T201

    # Per-reason coord exclusion breakdown (D-04)
    null_c = sum(1 for r in records if r[12] == "null_coord")
    zero_c = sum(1 for r in records if r[12] == "zero_coord")
    bbox_c = sum(1 for r in records if r[12] == "out_of_bbox")
    excluded = null_c + zero_c + bbox_c
    print(  # noqa: T201
        f"checklist_records_full: {excluded} coordinates excluded "
        f"(null_coord={null_c}, zero_coord={zero_c}, out_of_bbox={bbox_c})"
    )


def load_checklist() -> None:
    """Read the WA bee checklist TSV and populate checklist_data.species
    + checklist_data.species_counties + checklist_data.checklist_records."""
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
        con.executemany(
            "INSERT INTO checklist_data.species VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
            species_rows,
        )

        con.execute("""
            CREATE OR REPLACE TABLE checklist_data.species_counties (
                scientificName VARCHAR,
                county VARCHAR
            )
        """)
        con.executemany(
            "INSERT INTO checklist_data.species_counties VALUES (?, ?)",
            species_counties,
        )

        species_count = con.execute("SELECT count(*) FROM checklist_data.species").fetchone()[0]
        sc_count = con.execute("SELECT count(*) FROM checklist_data.species_counties").fetchone()[0]
        print(f"checklist: {species_count} species, {sc_count} county records")  # noqa: T201

        _load_checklist_records(con)
        _load_checklist_records_full(con)
        _update_occurrences_canonical_name(con)
        reconcile(con)
    finally:
        con.close()


if __name__ == "__main__":
    load_checklist()
