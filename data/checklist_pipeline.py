"""Phase 76 checklist loader.

Reads the WA bee checklist TSV (Bartholomew et al. 2024) and writes:
  - checklist_data.species (one row per DISTINCT species, 11 columns)
  - checklist_data.species_counties (raw per-(species, county) rows)

Both tables use CREATE OR REPLACE — full refresh on every run. No dlt cursor.

Phase 76 / D-01, D-02, D-04. canonical_name materialization on the occurrences
side and synonyms-based reconciliation are handled by Plan 05.
"""

import csv
import os
from pathlib import Path

import duckdb

from canonical_name import canonicalize

DB_PATH = os.environ.get("DB_PATH", str(Path(__file__).parent / "beeatlas.duckdb"))
CHECKLIST_PATH = Path(__file__).parent / "checklists" / "wa_bee_checklist.tsv"
SOURCE_CITATION = "Bartholomew et al. 2024, JHR 97 (DOI: 10.3897/jhr.97.129013)"


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
    finally:
        con.close()


if __name__ == "__main__":
    load_checklist()
