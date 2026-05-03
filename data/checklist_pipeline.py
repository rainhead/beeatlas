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
import os
from pathlib import Path

import duckdb

from canonical_name import canonicalize

DB_PATH = os.environ.get("DB_PATH", str(Path(__file__).parent / "beeatlas.duckdb"))
CHECKLIST_PATH = Path(__file__).parent / "checklists" / "wa_bee_checklist.tsv"
SOURCE_CITATION = "Bartholomew et al. 2024, JHR 97 (DOI: 10.3897/jhr.97.129013)"
SYNONYMS_PATH = Path(__file__).parent / "checklist_synonyms.csv"
UNMATCHED_PATH = Path(__file__).parent / "checklist_unmatched.csv"


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
        (canonicalize(r[0]), r[0]) for r in rows
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


def load_checklist() -> None:
    """Read the WA bee checklist TSV and populate checklist_data.species
    + checklist_data.species_counties."""
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
                canonicalize(sci),          # canonical_name (D-04)
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

        _update_occurrences_canonical_name(con)
        reconcile(con)
    finally:
        con.close()


if __name__ == "__main__":
    load_checklist()
