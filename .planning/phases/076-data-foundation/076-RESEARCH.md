# Phase 76: Data Foundation — Research

**Researched:** 2026-05-02
**Domain:** DuckDB pipeline foundation (taxonomic checklist ingestion, iNat ancestor walk, canonical-name reconciliation)
**Confidence:** HIGH (integration points read end-to-end; live DB queried; iNat v2 endpoint probed)

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

- **D-01 — Source TSV at `data/checklists/wa_bee_checklist.tsv`.** 2,862 rows, 2 columns (`species\tcounty`), bare binomials. Commit verbatim. File extension overrides CHECK-01's `.csv`. `data/checklists/README.md` records provenance (Bartholomew et al. 2024, JHR 97; DOI 10.3897/jhr.97.129013), supplement format note, the manual extraction step, and the file's two-column shape.
- **County information** preserved in sibling table `checklist_data.species_counties(scientificName VARCHAR, county VARCHAR)`. NOT collapsed onto the species row.
- **CHECK-01 amendment required:** REQUIREMENTS.md must be edited (`.csv` → `.tsv`).
- **D-02 — Status field: only `verified` populated in v3.2.** `'likely-to-occur'` enum reserved (forward-compatible) but not populated. Footnote on CHECK-03 in REQUIREMENTS.md.
- **D-03 — Lineage extension: new function `enrich_taxon_lineage_extended()` in `data/inaturalist_pipeline.py`**, walks union of `inaturalist_data.observations.taxon__id` + `inaturalist_waba_data.observations.taxon__id`. Existing `waba_pipeline.py:enrich_taxon_lineage` UNTOUCHED. Called from `inaturalist_pipeline.py::load_observations()` after the dlt run completes (must run AFTER waba so the union covers WABA taxa).
- **D-04 — `canonicalize()` algorithm.** 5 steps applied identically wherever computed: (1) strip authority (drop everything from first `, ` or ` (Author` onward), (2) strip subgenus parens (collapse `Genus (Subgenus) species` → `Genus species`), (3) strip infraspecific markers `ssp.`/`var.`/`aff.`/`cf.`/`nr.`, (4) lowercase, (5) collapse internal whitespace to single space + trim. Materialize as actual VARCHAR column on BOTH `checklist_data.species` AND `ecdysis_data.occurrences`. Single `canonicalize(name: str) -> str` Python helper (location TBD: `data/checklist_pipeline.py` or new `data/canonical_name.py`).
- **D-05 — Warn-only unmatched policy.** `data/checklist_synonyms.csv` schema = `checklist_name,canonical_name,source` (header row required, source non-empty). Reconciliation flow: for each checklist row whose canonical_name does NOT join to any occurrence row, consult synonyms.csv; still-unmatched go to `data/checklist_unmatched.csv` (`checklist_name,canonical_name,reason`). Pipeline succeeds on non-empty unmatched; CI does NOT break.
- **Step ordering in `data/run.py STEPS`:** `("checklist", load_checklist)` lands between `anti-entropy` and `export`.
- **Test command:** `cd data && uv run pytest test_checklist_pipeline.py test_taxon_lineage.py`.
- **TAX-02 precedence:** `COALESCE(checklist, inat)` for tribe/subfamily/subgenus.
- **Pytest disagreement fixtures:** `Lasioglossum (Dialictus) zonulum` ↔ `Lasioglossum zonulum` plus an authority-bearing variant.

### Claude's Discretion

- **Where `canonicalize()` lives.** Either inside `data/checklist_pipeline.py` or a new `data/canonical_name.py`. Recommendation in §Architecture below.
- **How `canonical_name` is materialized on `ecdysis_data.occurrences`.** Three viable options (ALTER TABLE + UPDATE in checklist step; CTAS rebuild; computed view). Recommendation in §Architecture below.
- **Authority-stripping regex shape.** Empirical evidence shows the ecdysis live data carries no authority strings today, but the rule must still be defensive. Recommendation in §Pitfalls / §Code Examples.
- **Whether to run `canonicalize()` row-by-row in Python or as a DuckDB SQL expression.** Tradeoff covered below; SQL path recommended for occurrences (45 K rows), Python path recommended for checklist (2,862 rows).
- **Whether `checklist_synonyms.csv` is checked in initially with just a header or includes a placeholder comment row.** D-05 mandates header-only initial state; no further discretion.

### Deferred Ideas (OUT OF SCOPE)

- Consolidating `inaturalist_waba_data.taxon_lineage` (narrow) and the new `inaturalist_data.taxon_lineage_extended` (wide). Migrating `export.py:116` to read from the wider table is v3.3+.
- Curated `'likely-to-occur'` set (v3.3+).
- Phase 77+ aggregation, SVG maps, photo manifest, page scaffolding — all subsequent phases.
- DuckDB WASM frontend direction (separate v1.7+ track).
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID       | Description                                                                                                                                                      | Research Support                                                                                                                                  |
|----------|------------------------------------------------------------------------------------------------------------------------------------------------------------------|---------------------------------------------------------------------------------------------------------------------------------------------------|
| CHECK-01 | WA bee checklist committed at `data/checklists/wa_bee_checklist.tsv` with provenance in `data/checklists/README.md` (D-01 amends `.csv` → `.tsv`)                | TSV inspected: 2,862 rows, 2 cols, 527 unique bare binomials, 39 counties. Known shape — no parser surprises.                                      |
| CHECK-02 | `data/checklist_pipeline.py::load_checklist()` reads TSV, writes `checklist_data.species` via `CREATE OR REPLACE` (full refresh)                                  | Pattern matches `geographies_pipeline.py` (one-shot DuckDB load, no dlt). See §Architecture / Pattern 1.                                            |
| CHECK-03 | `checklist_data.species` schema: `scientificName, family, subfamily, tribe, genus, subgenus, specific_epithet, status, source_citation, notes` + `canonical_name` | Plus `canonical_name` from D-04. Status = `verified` only (D-02). Family/subfamily/tribe/subgenus left NULL on checklist side; iNat fills via TAX-02. |
| CHECK-04 | `data/run.py STEPS` includes `("checklist", load_checklist)` between `anti-entropy` and `export`                                                                  | Direct edit to `STEPS` list at `run.py:31-40`. Idempotent across re-runs.                                                                          |
| CHECK-05 | Reconciliation strips authority + subgenus parens, consults `checklist_synonyms.csv`, writes unmatched to `checklist_unmatched.csv` (warn-only per D-05)          | Algorithm specified in D-04. Unmatched flow specified in D-05. Live data has no authority — rule is defensive.                                     |
| CHECK-06 | `canonical_name` derived consistently for both checklist and occurrence rows (lowercase, single-spaced, authority-stripped); used as join key                     | Single `canonicalize()` helper. Materialized as VARCHAR column on both tables. Pytest covers each transform step + end-to-end disagreement.        |
| TAX-01   | `inaturalist_data.taxon_lineage_extended(taxon_id, family, subfamily, tribe, genus, subgenus)` from full ancestor walk                                            | iNat v2 `/v2/taxa/{ids}` confirmed to return all 4 ranks in `ancestors[]` (Halictini, Halictinae, Lasioglossum, Leuchalictus all present).         |
| TAX-02   | Tribe/subfamily/subgenus precedence: `COALESCE(checklist, inat)`                                                                                                  | Phase 76 lands the SOURCE tables. Actual COALESCE happens in Phase 77's species_export.py — Phase 76 must produce both inputs cleanly.            |
| TAX-03   | Subgenus level renders only when populated; no phantom `(no subgenus)` node                                                                                       | Display-layer concern (Phase 80 NAV-02). Phase 76's job: ensure `subgenus IS NULL` is emitted faithfully, not a sentinel string.                  |
| TAX-04   | Pytest covers `Lasioglossum (Dialictus) zonulum` ↔ `Lasioglossum zonulum` + authority variant                                                                     | Live disagreement found: iNat carries `Lasioglossum zonulus` (masculine) vs checklist `Lasioglossum zonulum` (neuter). Real-world synonym entry.    |
</phase_requirements>

## Summary

Phase 76 lands the **data spine** that Phase 77's species aggregation will FULL OUTER JOIN against. Three deliverables, each tightly scoped:

1. **Checklist ingestion.** A 2,862-row TSV (2 columns: `species`, `county`) becomes two DuckDB tables: `checklist_data.species` (one row per distinct species, 527 rows) and `checklist_data.species_counties` (the per-(species, county) original rows, preserved for Phase 77+). All 527 species are bare binomials with exactly 2 tokens and no authority strings — empirically verified — so the Python-side canonicalize is essentially `lower().strip()` for the checklist input. Status = `verified` for all rows.
2. **iNat ancestor extension.** A new `enrich_taxon_lineage_extended()` in `data/inaturalist_pipeline.py` mirrors the existing `waba_pipeline.py:109-160` pattern (batched `/v2/taxa/{ids}` calls, `CREATE OR REPLACE TABLE` + `executemany INSERT`) but writes a **wider** table `inaturalist_data.taxon_lineage_extended(taxon_id, family, subfamily, tribe, genus, subgenus)`. Source IDs = `DISTINCT NOT NULL` union of `inaturalist_data.observations.taxon__id` + `inaturalist_waba_data.observations.taxon__id` (~1,500 IDs based on live-DB counts; ~50 batches at `batch_size=30`). The existing waba narrow `taxon_lineage` table stays untouched — `export.py:116` keeps reading it.
3. **Canonical-name reconciliation.** A single `canonicalize()` Python helper applies a 5-step transform (strip authority, strip subgenus parens, strip infraspecific markers, lowercase, collapse whitespace). Materialized as a real `VARCHAR canonical_name` column on **both** `checklist_data.species` (populated at load time, every row, in the same INSERT) and `ecdysis_data.occurrences` (populated by an `ALTER TABLE ADD COLUMN IF NOT EXISTS` + `UPDATE` step run from `checklist_pipeline.py` AFTER the ecdysis pipeline has rebuilt the table earlier in the run). Reconciliation walks every checklist row, consults `checklist_synonyms.csv` (header-only initially, schema `checklist_name,canonical_name,source`), and writes still-unmatched rows to a regenerated `data/checklist_unmatched.csv` — non-empty does NOT fail the pipeline.

**Primary recommendation:** Land all three deliverables in the order above. Put `canonicalize()` in a new `data/canonical_name.py` module (single function, ~30 LOC, easy to import from both `checklist_pipeline.py` and tests; future Phase 77 species_export.py can reuse it without circular import risk).

## Architectural Responsibility Map

| Capability                                                                          | Primary Tier            | Secondary Tier | Rationale                                                                                                            |
|-------------------------------------------------------------------------------------|-------------------------|----------------|----------------------------------------------------------------------------------------------------------------------|
| Read TSV from disk and load into DuckDB                                             | Database / Pipeline     | —              | One-shot file → DuckDB; no API, no incremental cursor. Mirrors `geographies_pipeline.py`.                              |
| Walk iNat ancestor chain via HTTPS API                                              | Backend (Python)        | API (iNat v2)  | External call to `api.inaturalist.org/v2/taxa/{ids}`, batched. Mirrors `waba_pipeline.py:109-160`.                     |
| Compute `canonical_name` from a raw `scientificName` string                         | Backend (Python utility) | Database       | Pure-string transform. Recommended Python implementation; called per-row at load time.                                |
| Materialize `canonical_name` column on `checklist_data.species`                     | Database / Pipeline     | —              | Computed in Python during the same `executemany INSERT` that loads the checklist.                                     |
| Materialize `canonical_name` column on `ecdysis_data.occurrences`                   | Database / Pipeline     | —              | `ALTER TABLE ADD COLUMN IF NOT EXISTS` + `UPDATE`, run from `checklist_pipeline.py` AFTER ecdysis has been rebuilt.   |
| Reconciliation (synonyms.csv override + unmatched.csv writeback)                    | Backend (Python)        | Filesystem     | Reads/writes git-tracked CSVs in `data/`. Warn-only — never raises.                                                   |
| Validation / verification of pipeline output                                        | Test (pytest)           | —              | Programmatic DuckDB fixture per `data/tests/conftest.py`. Two new test files.                                          |

**Why this matters:** All work in this phase is server-side / pipeline-side. No frontend tier involved. The map is included for the planner to sanity-check that no task accidentally lands frontend code.

## Standard Stack

### Core (already installed — no new dependencies)

| Library                | Version  | Purpose                                                  | Why Standard                                                                       |
|------------------------|----------|----------------------------------------------------------|------------------------------------------------------------------------------------|
| `duckdb`               | `>=1.4,<2` | Embedded analytical DB; reads TSV, runs SQL, writes parquet | Already the project's data store. `data/pyproject.toml` dependency. [VERIFIED: pyproject.toml]    |
| `requests`             | latest   | HTTPS calls to iNat v2 API                                | Already used by `waba_pipeline.py` and `anti_entropy_pipeline.py`. [VERIFIED: pyproject.toml]    |
| `csv` (stdlib)         | stdlib   | Read TSV (with `delimiter='\t'`), write `unmatched.csv`   | Standard library; no install. Already used by `ecdysis_pipeline.py:54-60`.        |
| `re` (stdlib)          | stdlib   | Regex for `canonicalize()` transformation steps           | Standard library; no install.                                                      |
| `pytest`               | `>=9.0.2` | Test runner                                               | Already in `dev` dep group. Used via `cd data && uv run pytest`. [VERIFIED: pyproject.toml]    |

**Verified versions** (via `data/pyproject.toml` and `data/uv.lock` references): no new packages. Phase 76 ships zero dependency churn.

### Supporting

None. iNat v2 endpoint is consumed via `requests.get()` directly (no SDK), matching `waba_pipeline.py:131-136`.

### Alternatives Considered

| Instead of                          | Could Use                                                       | Tradeoff                                                                                                 |
|-------------------------------------|------------------------------------------------------------------|----------------------------------------------------------------------------------------------------------|
| `re` for canonicalize               | `unicodedata.normalize` for diacritic folding                   | Bee names rarely carry diacritics in the working sources; defer until first counter-example.            |
| `csv.DictReader` for TSV            | `pandas` / `polars` / `duckdb.read_csv()`                       | TSV is tiny (2,862 rows); stdlib is sufficient and avoids new deps. DuckDB-native `read_csv_auto()` would also work and is the simplest path for a one-shot load — see Code Examples §1. |
| Python `canonicalize()` helper      | DuckDB `regexp_replace()` SQL expression                        | A single source of truth in Python is testable in isolation; SQL-side regex would duplicate the rule. **Recommend Python for both checklist and ecdysis paths**, even at the cost of an extra Python loop over 45 K occurrence rows (acceptable: ~1 second on a modern laptop). The ecdysis path can also do `UPDATE … SET canonical_name = python_udf(scientific_name)` via DuckDB Python UDFs (DuckDB 1.4+ supports this). [ASSUMED — verify before committing to UDF approach]                |
| Wide `taxon_lineage_extended` schema replacing the narrow waba `taxon_lineage` | One unified table | Out of scope per CONTEXT.md deferred. Two tables coexist; `export.py:116` is untouched.            |

**Installation:**
```bash
# No new packages. Sanity-check the existing env:
cd data && uv sync
```

## Architecture Patterns

### System Architecture Diagram

```
                           ┌──────────────────────────────────────┐
                           │    data/checklists/                  │
                           │      wa_bee_checklist.tsv  (committed) │
                           │      checklist_synonyms.csv (header-only) │
                           │      README.md            (provenance)  │
                           └───────────────┬──────────────────────┘
                                           │ read at run time
                                           ▼
[ecdysis] → [ecdysis-links] → [inaturalist] → [waba] → [projects] → [anti-entropy]
                                  │             │
                                  │             └── enrich_taxon_lineage()
                                  │                  → inaturalist_waba_data.taxon_lineage  (UNTOUCHED, narrow)
                                  │
                                  └── enrich_taxon_lineage_extended()  ← NEW (D-03)
                                       reads union(inaturalist_data.observations.taxon__id,
                                                   inaturalist_waba_data.observations.taxon__id)
                                       → inaturalist_data.taxon_lineage_extended
                                          (taxon_id, family, subfamily, tribe, genus, subgenus)

                                                                 ▼
                                       ┌────────────────────────────────────┐
                                       │ ("checklist", load_checklist)  ← NEW (CHECK-04) │
                                       │                                    │
                                       │ 1. read TSV via csv.DictReader     │
                                       │ 2. aggregate per-species (DISTINCT)│
                                       │ 3. CREATE OR REPLACE TABLE         │
                                       │      checklist_data.species        │
                                       │      (10 cols + canonical_name)    │
                                       │ 4. CREATE OR REPLACE TABLE         │
                                       │      checklist_data.species_counties│
                                       │ 5. ALTER TABLE ecdysis_data.occurrences│
                                       │      ADD COLUMN IF NOT EXISTS       │
                                       │      canonical_name VARCHAR;        │
                                       │      UPDATE … using canonicalize()  │
                                       │ 6. reconcile:                       │
                                       │      JOIN checklist.canonical_name  │
                                       │           ↔ occurrences.canonical_name│
                                       │      override via synonyms.csv      │
                                       │      write unmatched.csv (warn-only)│
                                       └────────────────────┬───────────────┘
                                                            │
                                                            ▼
                                                       [export]
                                                       [feeds]
```

### Recommended Project Structure

```
data/
├── canonical_name.py            # NEW — single canonicalize() helper
├── checklist_pipeline.py        # NEW — load_checklist() + reconcile()
├── checklists/                  # NEW directory
│   ├── README.md                # NEW — Bartholomew 2024 provenance
│   └── wa_bee_checklist.tsv     # NEW — 2,862-row committed TSV
├── checklist_synonyms.csv       # NEW — header-only initial commit
├── checklist_unmatched.csv      # NEW — regenerated each pipeline run; committed
├── inaturalist_pipeline.py      # MODIFIED — add enrich_taxon_lineage_extended()
├── run.py                       # MODIFIED — add ("checklist", load_checklist) to STEPS
└── tests/
    ├── conftest.py              # MODIFIED — extend fixtures (checklist + extended lineage seed rows)
    ├── test_canonical_name.py   # NEW — unit-tests for each canonicalize() transform step
    ├── test_checklist_pipeline.py # NEW — load + reconcile end-to-end with disagreement fixtures
    └── test_taxon_lineage.py    # NEW — enrich_taxon_lineage_extended() with mocked iNat response
```

### Pattern 1: One-shot DuckDB load (mirrors `geographies_pipeline.py`)

**What:** Read a static file from disk → `CREATE OR REPLACE TABLE` → `executemany INSERT`. No dlt, no incremental cursor, no API.

**When to use:** Whenever the source is a committed file (TSV/CSV/Parquet/Shapefile) and full-refresh on every run is acceptable.

**Example (template adapted from `geographies_pipeline.py:79-117`):**
```python
# Source: data/geographies_pipeline.py + this phase's design
import csv
from pathlib import Path
from collections import defaultdict
import duckdb

from canonical_name import canonicalize

CHECKLIST_PATH = Path(__file__).parent / "checklists" / "wa_bee_checklist.tsv"
SOURCE_CITATION = "Bartholomew et al. 2024, JHR 97 (DOI: 10.3897/jhr.97.129013)"

def load_checklist() -> None:
    db_path = os.environ.get("DB_PATH", str(Path(__file__).parent / "beeatlas.duckdb"))
    con = duckdb.connect(db_path)
    try:
        con.execute("CREATE SCHEMA IF NOT EXISTS checklist_data")

        # Read TSV; aggregate per-species; collect (species, county) pairs
        species_set: set[str] = set()
        species_counties: list[tuple[str, str]] = []
        with CHECKLIST_PATH.open(newline="") as f:
            reader = csv.DictReader(f, delimiter="\t")
            for row in reader:
                sci = row["species"].strip()
                cty = row["county"].strip()
                if sci:
                    species_set.add(sci)
                    if cty:
                        species_counties.append((sci, cty))

        # Build per-species rows
        species_rows = []
        for sci in sorted(species_set):
            parts = sci.split()
            genus = parts[0] if parts else None
            specific_epithet = parts[1] if len(parts) >= 2 else None
            species_rows.append((
                sci,                          # scientificName
                None,                          # family   (TAX-02 fills via iNat)
                None,                          # subfamily (TAX-02 fills via iNat)
                None,                          # tribe    (TAX-02 fills via iNat)
                genus,                         # genus
                None,                          # subgenus (TAX-02 fills via iNat)
                specific_epithet,              # specific_epithet
                "verified",                    # status (D-02: only verified populated)
                SOURCE_CITATION,               # source_citation
                None,                          # notes
                canonicalize(sci),             # canonical_name (D-04)
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

        # Materialize canonical_name on ecdysis_data.occurrences (idempotent)
        con.execute("""
            ALTER TABLE ecdysis_data.occurrences
            ADD COLUMN IF NOT EXISTS canonical_name VARCHAR
        """)
        # Pull names → canonicalize in Python → write back. ~45K rows, ~1s.
        names = [r[0] for r in con.execute(
            "SELECT DISTINCT scientific_name FROM ecdysis_data.occurrences "
            "WHERE scientific_name IS NOT NULL AND scientific_name != ''"
        ).fetchall()]
        mapping = [(canonicalize(n), n) for n in names]
        con.executemany(
            "UPDATE ecdysis_data.occurrences SET canonical_name = ? WHERE scientific_name = ?",
            mapping,
        )

        reconcile(con)
    finally:
        con.close()
```

### Pattern 2: iNat v2 ancestor walk (mirrors `waba_pipeline.py:109-160`)

**What:** Batched calls to `https://api.inaturalist.org/v2/taxa/{comma-separated-ids}` with `fields=id,name,rank,ancestors.id,ancestors.name,ancestors.rank`. `batch_size=30` retained from the existing precedent.

**When to use:** Any time we need taxonomic context for iNat-sourced taxon IDs.

**Example:**
```python
# Source: extends data/waba_pipeline.py:109-160
import requests
import duckdb
from pathlib import Path

# Ranks we care about; everything else in ancestors is ignored.
TARGET_RANKS = {"family", "subfamily", "tribe", "genus", "subgenus"}

def enrich_taxon_lineage_extended(db_path: str) -> None:
    con = duckdb.connect(db_path)
    # Union iNat + WABA taxon IDs (D-03)
    taxon_ids = [
        row[0] for row in con.execute("""
            SELECT DISTINCT taxon__id FROM (
                SELECT taxon__id FROM inaturalist_data.observations
                WHERE taxon__id IS NOT NULL
                UNION
                SELECT taxon__id FROM inaturalist_waba_data.observations
                WHERE taxon__id IS NOT NULL
            )
        """).fetchall()
    ]
    if not taxon_ids:
        print("taxon_lineage_extended: no taxon IDs found, skipping")
        con.close()
        return

    lineage: dict[int, dict] = {}
    batch_size = 30
    for i in range(0, len(taxon_ids), batch_size):
        batch = taxon_ids[i : i + batch_size]
        ids_path = ",".join(map(str, batch))
        resp = requests.get(
            f"https://api.inaturalist.org/v2/taxa/{ids_path}",
            params={"fields": "id,name,rank,ancestors.id,ancestors.name,ancestors.rank"},
            timeout=30,
        )
        resp.raise_for_status()
        for taxon in resp.json().get("results", []):
            row = {r: None for r in TARGET_RANKS}
            # The taxon itself may be at a target rank
            if taxon.get("rank") in TARGET_RANKS:
                row[taxon["rank"]] = taxon["name"]
            for anc in taxon.get("ancestors", []):
                if anc.get("rank") in TARGET_RANKS and row[anc["rank"]] is None:
                    row[anc["rank"]] = anc["name"]
            lineage[taxon["id"]] = row

    con.execute("""
        CREATE OR REPLACE TABLE inaturalist_data.taxon_lineage_extended (
            taxon_id BIGINT PRIMARY KEY,
            family VARCHAR,
            subfamily VARCHAR,
            tribe VARCHAR,
            genus VARCHAR,
            subgenus VARCHAR
        )
    """)
    con.executemany(
        "INSERT INTO inaturalist_data.taxon_lineage_extended VALUES (?, ?, ?, ?, ?, ?)",
        [
            [tid, d["family"], d["subfamily"], d["tribe"], d["genus"], d["subgenus"]]
            for tid, d in lineage.items()
        ],
    )
    count = con.execute(
        "SELECT count(*) FROM inaturalist_data.taxon_lineage_extended"
    ).fetchone()[0]
    print(f"taxon_lineage_extended: {count} rows")
    con.close()
```

### Pattern 3: `canonicalize()` Python helper

**What:** Single function in `data/canonical_name.py`. 5 transformation steps applied in a fixed order. Pure-Python, no dependencies beyond `re`.

**Example:**
```python
# data/canonical_name.py — NEW MODULE
import re

# Step 1: strip authority. Matches " (Author…" or ", year" or " Author, year".
# Empirically: ecdysis live data has zero authority strings (verified 2026-05-02
# against beeatlas.duckdb). The rule is defensive — checklist might in future use
# Discover Life-style names that DO carry authorities. Conservative regex:
#   - first ", " followed by 4 digits (typical "Smith, 1855" form)
#   - first " (" followed by capitalised author word (typical "(Müller, 1766)" form)
_AUTHORITY_RE = re.compile(r"\s*(?:,\s*\d{4}.*|\(\s*[A-ZÄÖÜÉÈ].*?\).*)\s*$")

# Step 2: strip subgenus parens — ONLY the first parens. Authority parens later
# in the string would already be stripped by step 1, but as a safety net we anchor
# on " (Initial-cap Word) " between two whitespace-bounded tokens.
_SUBGENUS_RE = re.compile(r"\s*\(\s*[A-Z][A-Za-zæ\-]+\s*\)\s*")

# Step 3: strip infraspecific markers. Tokenize and drop everything after the marker.
_INFRA_MARKERS = ("ssp.", "var.", "aff.", "cf.", "nr.", "subsp.")

def canonicalize(name: str | None) -> str | None:
    """Apply the 5-step canonicalization rule (D-04).

    Returns a lowercase, single-spaced binomial (or genus name for higher-rank inputs),
    or None if the input is None / empty.

    Examples:
      canonicalize("Lasioglossum (Dialictus) zonulum")         == "lasioglossum zonulum"
      canonicalize("Andrena fulva (Müller, 1766)")             == "andrena fulva"
      canonicalize("Andrena fulva Müller, 1766")               == "andrena fulva"
      canonicalize("Bombus melanopygus mixtus")                == "bombus melanopygus"  # subspecies → species
      canonicalize("Hylaeus aff. cressoni")                    == "hylaeus"             # see note*
      canonicalize("Osmia")                                    == "osmia"               # genus-only OK
      canonicalize("Andrena    cressonii  ")                   == "andrena cressonii"
      canonicalize("")                                         == None
      canonicalize(None)                                       == None

    *Note on infraspecific markers: "Hylaeus aff. cressoni" tokenizes to
    ["Hylaeus", "aff.", "cressoni"]. Step 3 drops "aff." onward, leaving only
    "Hylaeus". This is consistent with v3.2's species-level scope (CONTEXT.md
    D-04 step 3: "v3.2 is species-level only; infraspecifics fold into their
    species") — but be aware that "aff./cf./nr." MEANS the determination is
    uncertain at species level. Folding to genus is the safe default. Pytest
    must cover this case explicitly.
    """
    if name is None:
        return None
    s = name.strip()
    if not s:
        return None

    # Step 1: strip authority
    s = _AUTHORITY_RE.sub("", s)

    # Step 2: strip subgenus parens (collapse surrounding whitespace to single space)
    s = _SUBGENUS_RE.sub(" ", s)

    # Step 3: strip infraspecific markers (drop marker + everything after)
    tokens = s.split()
    cleaned: list[str] = []
    for tok in tokens:
        if tok.lower() in _INFRA_MARKERS:
            break
        cleaned.append(tok)
    # Trinomial collapse: keep only the first 2 tokens for species names.
    # Genus-only or family-only names retain their single token.
    if len(cleaned) > 2:
        cleaned = cleaned[:2]

    # Steps 4 + 5: lowercase, collapse whitespace
    s = " ".join(t.lower() for t in cleaned)
    return s or None
```

### Pattern 4: Reconciliation flow (warn-only)

**What:** For each checklist row, find a matching occurrence row by `canonical_name`. If no match, consult `checklist_synonyms.csv`. If still no match, write to `checklist_unmatched.csv`. **Never raise** — D-05.

**Example:**
```python
# Inside data/checklist_pipeline.py
import csv
from pathlib import Path

SYNONYMS_PATH = Path(__file__).parent / "checklist_synonyms.csv"
UNMATCHED_PATH = Path(__file__).parent / "checklist_unmatched.csv"

def reconcile(con: duckdb.DuckDBPyConnection) -> None:
    """Walk checklist; for each row whose canonical_name does not join any
    occurrence row, consult synonyms.csv; write still-unmatched to unmatched.csv.
    Warn-only per D-05."""
    # Load synonyms (header: checklist_name,canonical_name,source)
    synonyms: dict[str, str] = {}
    if SYNONYMS_PATH.exists():
        with SYNONYMS_PATH.open(newline="") as f:
            for row in csv.DictReader(f):
                if row.get("checklist_name") and row.get("canonical_name"):
                    synonyms[row["checklist_name"].strip()] = row["canonical_name"].strip()

    # Find checklist rows that don't join any occurrence on canonical_name
    rows = con.execute("""
        SELECT cl.scientificName, cl.canonical_name
        FROM checklist_data.species cl
        LEFT JOIN ecdysis_data.occurrences occ
            ON occ.canonical_name = cl.canonical_name
        WHERE occ.canonical_name IS NULL
        GROUP BY cl.scientificName, cl.canonical_name
    """).fetchall()

    unmatched: list[tuple[str, str, str]] = []
    for sci, canon in rows:
        if sci in synonyms:
            # Synonym override: re-attempt the join with the override canonical_name
            override = synonyms[sci]
            hit = con.execute(
                "SELECT 1 FROM ecdysis_data.occurrences WHERE canonical_name = ? LIMIT 1",
                [override],
            ).fetchone()
            if hit:
                # Optionally: UPDATE checklist_data.species SET canonical_name = override
                # WHERE scientificName = sci  -- but D-05 leaves this as planner's discretion.
                continue
            unmatched.append((sci, override, "synonym override did not join occurrences"))
        else:
            unmatched.append((sci, canon, "no occurrence row matches canonical_name"))

    # Write unmatched.csv (regenerated each run; committed as snapshots per D-05)
    with UNMATCHED_PATH.open("w", newline="") as f:
        writer = csv.writer(f)
        writer.writerow(["checklist_name", "canonical_name", "reason"])
        for row in unmatched:
            writer.writerow(row)

    print(f"reconcile: {len(unmatched)} unmatched (warn-only); see {UNMATCHED_PATH.name}")
```

### Anti-Patterns to Avoid

- **Don't compute `canonical_name` only inside `species_export.py`.** D-04 explicitly mandates it as a real column on the source tables, visible to ad-hoc queries and to Phase 77's planner.
- **Don't put `canonicalize()` inside `inaturalist_pipeline.py` or `waba_pipeline.py`.** Those modules don't need it (they only land taxon IDs and observation rows; canonicalization happens against `scientific_name` strings on the ecdysis side and against the checklist binomial). Keeping the helper in its own module avoids tangling concerns.
- **Don't migrate `inaturalist_waba_data.taxon_lineage`.** The narrow waba lineage table is consumed by `export.py:116` for Phase 76's untouched code path. Migrating it is a v3.3+ task captured in CONTEXT.md deferred ideas.
- **Don't fail the pipeline on non-empty `checklist_unmatched.csv`.** D-05 is unambiguous: warn-only. Aligns with the project's anti-entropy posture (off-WA coordinates clipped, not failed; tribe staleness tolerated).
- **Don't try to use SQL-side regex for the full canonicalize rule.** A Python helper has a single source of truth + unit tests in isolation. SQL-side regex is acceptable for a quick sanity check but should not be the canonical implementation. (DuckDB Python UDFs work but add complexity without clear benefit at this row count.)
- **Don't re-slugify in TS later.** Slugs are produced in Phase 77 from `canonical_name` via `data/feeds.py::_slugify`. Phase 76 must produce a stable `canonical_name`; if step 1's authority regex changes after Phase 77 ships, all slugs and SPA links churn.

## Don't Hand-Roll

| Problem                                       | Don't Build                                            | Use Instead                                                            | Why                                                                                                          |
|-----------------------------------------------|--------------------------------------------------------|------------------------------------------------------------------------|--------------------------------------------------------------------------------------------------------------|
| Reading TSV                                   | A custom split-on-tab loop                             | `csv.DictReader(f, delimiter="\t")`                                    | Handles quoting, BOM, empty lines correctly. Stdlib.                                                          |
| iNat v2 client                                | A new client wrapper                                    | `requests.get()` with the existing `waba_pipeline.py:131-136` shape    | Direct precedent; same `batch_size=30`; same field set with `.id` added.                                      |
| dlt cursor for the checklist                  | Adding dlt + incremental cursor for a static file      | `CREATE OR REPLACE TABLE`                                              | Full refresh is correct; the file is committed and changes only when a human edits it. Mirrors `geographies_pipeline.py`.                                                                       |
| Authority-stripping with a giant regex zoo    | Trying to handle every authority shape ever published  | Two narrow regexes (`, ` + 4-digit year; ` (` + author capital)        | Empirically the project's data has no authority strings today; build defensively but don't over-engineer.    |
| Subgenus paren matcher                        | A general nested-paren parser                          | One regex `\(\s*[A-Z][A-Za-z]+\s*\)` for one-level subgenus parens     | Bee-name parens are always one level deep; nested parens have never been observed in the project's data.     |
| Synonym table                                 | A YAML or TOML file                                     | `data/checklist_synonyms.csv` (D-05)                                   | Locked: 3-column CSV with header. Not negotiable.                                                             |
| Unmatched policy                              | A custom failure-mode flag system                       | Just write the file and `print()` the count                            | Locked: warn-only. Aligns with anti_entropy_pipeline.py posture.                                              |
| pytest scaffolding                            | A new test runner                                       | Extend `data/tests/conftest.py` fixtures                               | TEST-01..03 from v1.7 already established the programmatic DuckDB fixture pattern.                            |

**Key insight:** Phase 76 is intentionally boring. Every primitive already exists in the codebase. The only new code is the canonicalize helper, the checklist loader, and the lineage-walk function — all of which mirror existing patterns with small variations.

## Runtime State Inventory

> Phase 76 introduces new tables and a new column. It does not rename or migrate existing state. Most categories are not applicable.

| Category                   | Items Found                                                                                                                                                                            | Action Required                                                                                                                                                  |
|----------------------------|----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| Stored data                | `ecdysis_data.occurrences` exists in production maderas DuckDB; needs new `canonical_name` column added.                                                                               | `ALTER TABLE … ADD COLUMN IF NOT EXISTS canonical_name VARCHAR` is idempotent across re-runs. Runs from `checklist_pipeline.py` AFTER ecdysis pipeline rebuilds the table earlier in the same run. The ecdysis pipeline uses `write_disposition="replace"`, so the column is dropped and re-added every nightly run — that is fine; the `IF NOT EXISTS` guard makes the SQL safe in both cases (cold and warm DB). |
| Live service config        | None — no external services have configuration tied to this phase's identifiers.                                                                                                       | None.                                                                                                                                                            |
| OS-registered state        | None — no Windows Tasks, no launchd, no systemd. Nightly run is `data/nightly.sh` cron on maderas (per CLAUDE.md).                                                                      | None — the cron continues to call `data/run.py` unchanged.                                                                                                       |
| Secrets and env vars       | None — iNat v2 endpoints used by Phase 76 are unauthenticated (same as `waba_pipeline.py`).                                                                                            | None.                                                                                                                                                            |
| Build artifacts / installed packages | New committed files: `data/checklists/wa_bee_checklist.tsv`, `data/checklists/README.md`, `data/checklist_synonyms.csv`, `data/checklist_unmatched.csv`. None are gitignored. | Commit each as a separate atomic step. `checklist_unmatched.csv` is regenerated each pipeline run; commits represent snapshots of the unresolved set (D-05).      |

**Nothing found in category:** Live service config, OS-registered state, secrets — explicitly verified.

## Common Pitfalls

### Pitfall 1: Authority-stripping regex over-fits training-data examples

**What goes wrong:** A regex tuned to canonical examples (`Andrena fulva Müller, 1766`) silently fails on real authorities like `Bombus melanopygus auct. nec Cresson, 1864` or `Andrena fulva (O. F. Müller, 1766)` (multi-token author).
**Why it happens:** Authority strings have wide morphological variety; a regex tuned on 3 sample shapes inevitably misses a 4th.
**How to avoid:** **Run the empirical check FIRST.** This was done at research time:
```sql
-- Verified 2026-05-02 against /Users/rainhead/dev/beeatlas/data/beeatlas.duckdb
SELECT DISTINCT scientific_name FROM ecdysis_data.occurrences
WHERE regexp_matches(scientific_name, ', [0-9]{4}');  -- 0 rows
SELECT DISTINCT scientific_name FROM ecdysis_data.occurrences
WHERE scientific_name LIKE '%(%';                      -- 3 rows: subgenus-only names, no species
```
**Result: ecdysis live data has zero authority strings and only 3 paren-bearing names** (all subgenus-only without species token). The regex is therefore *defensive*, not load-bearing. Build a narrow rule that handles the 4 documented shapes in CONTEXT.md D-04 and add a unit test per shape; don't try to generalise. **Warning signs:** unit test added later that introduces a 5th shape and fails.

### Pitfall 2: Trinomial subspecies fold to genus instead of species

**What goes wrong:** `canonicalize("Bombus melanopygus mixtus")` should return `"bombus melanopygus"`, not `"bombus melanopygus mixtus"` and not `"bombus"`. A naive `tokens[:2]` is correct but only AFTER all infraspecific markers have been stripped — there's an order dependency between steps 3 and the implicit "keep first 2 tokens" rule.
**Why it happens:** The CONTEXT.md D-04 algorithm does not state the trinomial fold explicitly; it's implied by step 3 + step 4. **Empirically there are 6 ecdysis rows with trinomial names** (`Colletes consors pascoensis`, `Eucera frater frater`, `Bembix americana comata`, `Bembix americana spinolae`, `Andrena cressonii infasciata`, `Melecta pacifica fulvida`) plus iNat subspecies records (`Bombus vancouverensis nearcticus`, `Dianthidium pudicum consimile`).
**How to avoid:** Make the trinomial fold an explicit step in `canonicalize()` (see Code Examples §3 — `cleaned[:2]`). Add a pytest case for each pattern: trinomial without marker (subspecies), trinomial with marker (`Hylaeus aff. cressoni`), genus-only (`Osmia`).
**Warning signs:** Phase 77 species export's FULL OUTER JOIN produces extra rows for `bombus melanopygus` AND `bombus melanopygus mixtus` as separate species — should be one row.

### Pitfall 3: Subgenus parens regex eats the wrong parens

**What goes wrong:** A greedy or under-anchored paren regex strips authority parens (`Andrena fulva (Müller, 1766)`) when the intent was to strip ONLY the subgenus parens (`Lasioglossum (Dialictus) zonulum`).
**Why it happens:** Authority parens come AFTER the species epithet; subgenus parens come BETWEEN genus and species. They look similar.
**How to avoid:** Order matters: **strip authority FIRST (step 1), then strip subgenus parens (step 2).** After step 1 there are no authority parens left, so step 2's regex (`\(\s*[A-Z][A-Za-z]+\s*\)`) only matches subgenus parens. Pytest must cover the combined case `Lasioglossum (Dialictus) zonulum (Smith, 1853)`.
**Warning signs:** Test fixture for the authority-bearing variant collapses to genus-only string instead of `lasioglossum zonulum`.

### Pitfall 4: `enrich_taxon_lineage_extended()` missing intermediate ranks

**What goes wrong:** The iNat v2 ancestors array sometimes omits a rank (e.g., a genus has no parent tribe in iNat's taxonomy). Code that assumes "5 target ranks always present" produces NULLs unexpectedly or, worse, off-by-one rank assignments.
**Why it happens:** Bee taxonomy is denser than other Insecta — iNat usually has tribe but not always. Probing `Megachile` (taxon 52784) returns subfamily=`Megachilinae`, tribe=`Megachilini`, but `Termitoidae` (taxon 118903) is an epifamily with no family, no subfamily, no tribe.
**How to avoid:** Use the rank as the dictionary key (D-03 pattern in Code Examples §2). Each rank field defaults to `None`. Only assign when `anc.rank in TARGET_RANKS`. The 5-column INSERT writes None where absent — DuckDB stores NULL.
**Warning signs:** A non-bee taxon ID accidentally in the union (e.g., a Plantae sample observation) produces a half-empty row. This is fine — Phase 77's join filters by the ecdysis side anyway.

### Pitfall 5: `canonical_name` column lost on next ecdysis pipeline run

**What goes wrong:** `data/ecdysis_pipeline.py` uses `write_disposition="replace"` (read at `ecdysis_pipeline.py:78`), which DROPs the `occurrences` table on every nightly run. If `canonical_name` was added by a one-time migration in `_apply_migrations()`, it would survive only the first run.
**Why it happens:** dlt's "replace" disposition is a full table rebuild. Schema changes outside dlt are blown away.
**How to avoid:** **Re-add the column in `checklist_pipeline.py`** every run. `ALTER TABLE … ADD COLUMN IF NOT EXISTS` is the right primitive — it's a no-op when the column already exists, and the `UPDATE` is the actual work. Step ordering (`ecdysis` → `inaturalist` → `waba` → `projects` → `anti-entropy` → `checklist` → `export`) guarantees the table exists before the ALTER.
**Warning signs:** Two consecutive nightly runs produce different occurrence_count totals because canonical_name is NULL on the second run (or, worse, the first run was the only one that produced output).

### Pitfall 6: Synonym override loop runs before canonicalize, not after

**What goes wrong:** `checklist_synonyms.csv` has columns `checklist_name` and `canonical_name`. A reviewer might naturally write the override as `Lasioglossum (Dialictus) zonulum,lasioglossum zonulum,citation` (the canonical_name column already canonicalized) or as `Lasioglossum (Dialictus) zonulum,Lasioglossum zonulum,citation` (un-canonicalized). The reconciliation code must canonicalize the override consistently OR the CSV header must explicitly require pre-canonicalized values.
**Why it happens:** D-05 says: "Reviewer is responsible for computing it consistently with the canonicalize() rule." This is a documentation contract that depends on reviewer discipline.
**How to avoid:** Defensively `canonicalize()` the override at read time inside `reconcile()`. Adds 2 LOC; eliminates the foot-gun. Document this in the CSV header comment too.
**Warning signs:** Synonym entries that look correct but never resolve; `checklist_unmatched.csv` keeps regenerating the same row.

### Pitfall 7: Reconciliation step queries against an EMPTY ecdysis_data.occurrences

**What goes wrong:** On a fresh DB (no ecdysis data yet), `reconcile()` finds zero matches for every checklist row and writes 527 unmatched rows.
**Why it happens:** `data/run.py` STEPS run sequentially; `("ecdysis", load_ecdysis)` runs first. But on a brand-new clone with `--full-reload` or a missing DB, the sequence is correct and the table is populated before checklist runs. **Edge case:** running `python data/checklist_pipeline.py` standalone (not via `run.py`) bypasses ecdysis.
**How to avoid:** Either (a) document that `checklist_pipeline.py` requires ecdysis to have run first (preferred — matches the existing pattern of `geographies_pipeline.py` not being in the nightly STEPS but invoked manually), or (b) guard `reconcile()` with `SELECT count(*) FROM ecdysis_data.occurrences` and skip gracefully if zero. Recommended: do (a) only — keep the reconcile body clean. Tests use the conftest.py fixture which seeds occurrences before the test runs.
**Warning signs:** Empty reconciliation in CI suggests test fixture order is wrong.

### Pitfall 8: New tests don't get picked up by `uv run pytest test_X.py test_Y.py`

**What goes wrong:** The CONTEXT.md test command is `cd data && uv run pytest test_checklist_pipeline.py test_taxon_lineage.py`. But existing tests live under `data/tests/test_*.py`. If the new tests follow the existing layout (`data/tests/test_checklist_pipeline.py`), the command must say `tests/test_checklist_pipeline.py tests/test_taxon_lineage.py`.
**Why it happens:** CONTEXT.md test command was drafted before checking the directory layout.
**How to avoid:** Place new tests under `data/tests/` per the existing convention. Update the test command to `cd data && uv run pytest tests/test_checklist_pipeline.py tests/test_taxon_lineage.py` OR rely on `pyproject.toml`'s `testpaths = ["tests"]` and run `cd data && uv run pytest tests/test_checklist_pipeline.py tests/test_taxon_lineage.py`. Verify with the planner whether the path-prefix is acceptable; the requirement language in ROADMAP says exactly the unprefixed form so the plan should put the tests at `data/tests/` AND update the success-criteria language OR add a phase-time decision to use `tests/` paths.
**Warning signs:** `uv run pytest test_checklist_pipeline.py` returns "no tests found".

### Pitfall 9: iNat API rate-limiting on the new lineage walk

**What goes wrong:** ~1,500 distinct taxon IDs in the union ÷ batch_size=30 = ~50 GET requests. Each call to `/v2/taxa/{ids}` is unauthenticated. iNat's documented soft limit is 60 req/min, so 50 calls is fine, but a buggy run that loops over all 45 K occurrence rows by mistake would hit the limit instantly.
**Why it happens:** A typo in the SELECT (forgetting DISTINCT) or in the loop bound.
**How to avoid:** Hard-cap the loop with an `assert len(taxon_ids) < 5000, "sanity check failed"` before the API loop. Existing `waba_pipeline.py:enrich_taxon_lineage` doesn't have this guard but operates on a smaller set (~417 IDs); the wider extended set deserves the assert.
**Warning signs:** Pipeline takes >10 minutes (should be <2 min for the lineage step); HTTP 429 from iNat.

### Pitfall 10: The 6 trinomial ecdysis names join inconsistently

**What goes wrong:** `Eucera frater frater` (subspecies) canonicalizes to `eucera frater`. The checklist has `Eucera frater` → `eucera frater`. Join works for THIS case. But `Bombus melanopygus mixtus` canonicalizes to `bombus melanopygus`, while the checklist might have `Bombus mixtus` (sister species, not subspecies) → `bombus mixtus`. The two species collide on the WRONG canonical name.
**Why it happens:** Trinomial fold is lossy. Some "subspecies" in older literature have been elevated to species (`Bombus mixtus` is now treated as a separate species, not a subspecies of `B. melanopygus`).
**How to avoid:** This is a known biological-data hazard, not a code hazard. Test fixture must include at least one trinomial that folds to a binomial PRESENT in the checklist (correct case) and one that DOESN'T (incorrect case → goes to unmatched.csv). Reviewer adds a synonyms.csv entry to override.
**Warning signs:** A volunteer reports "I see specimens for Bombus melanopygus but the card shows zero" — suspect a trinomial fold issue.

## Code Examples

Verified patterns from local source files and live API probes.

### Example 1: TSV load via DuckDB native (alternative to csv.DictReader)

```python
# Source: experiment with DuckDB read_csv_auto on the actual file
import duckdb
con = duckdb.connect(":memory:")
con.execute("""
    CREATE TABLE raw AS
    SELECT species, county
    FROM read_csv_auto(
        'data/checklists/wa_bee_checklist.tsv',
        delim='\t',
        header=true,
        types={'species': 'VARCHAR', 'county': 'VARCHAR'}
    )
""")
# 2862 rows confirmed; 527 distinct species; 39 distinct counties.
```
This is a viable alternative to `csv.DictReader`; either works. csv.DictReader has the advantage of letting `canonicalize()` run inside the same Python loop without a round-trip through DuckDB.

### Example 2: Existing waba lineage pattern (the template for D-03)

```python
# Source: data/waba_pipeline.py:127-145
batch_size = 30
for i in range(0, len(taxon_ids), batch_size):
    batch = taxon_ids[i : i + batch_size]
    ids_path = ",".join(map(str, batch))
    resp = requests.get(
        f"https://api.inaturalist.org/v2/taxa/{ids_path}",
        params={"fields": "id,name,rank,ancestors.name,ancestors.rank"},
        timeout=30,
    )
    resp.raise_for_status()
    for taxon in resp.json().get("results", []):
        # ... walk ancestors
```
The new `enrich_taxon_lineage_extended` differs in two ways: (a) `ancestors.id` is added to the field set (cheap, future-proof), (b) the rank set widens from `{genus, family}` to `{family, subfamily, tribe, genus, subgenus}`.

### Example 3: pytest fixture extension (mirrors `data/tests/conftest.py:108-227`)

```python
# Inside data/tests/conftest.py — extend _create_tables() and _seed_data()

# Add to _create_schemas():
con.execute("CREATE SCHEMA checklist_data")

# Add to _create_tables():
con.execute("""
    CREATE TABLE checklist_data.species (
        scientificName VARCHAR PRIMARY KEY,
        family VARCHAR, subfamily VARCHAR, tribe VARCHAR,
        genus VARCHAR, subgenus VARCHAR, specific_epithet VARCHAR,
        status VARCHAR, source_citation VARCHAR, notes VARCHAR,
        canonical_name VARCHAR NOT NULL
    )
""")
con.execute("""
    CREATE TABLE checklist_data.species_counties (
        scientificName VARCHAR, county VARCHAR
    )
""")
con.execute("""
    CREATE TABLE inaturalist_data.taxon_lineage_extended (
        taxon_id BIGINT PRIMARY KEY,
        family VARCHAR, subfamily VARCHAR, tribe VARCHAR,
        genus VARCHAR, subgenus VARCHAR
    )
""")
# Note: ecdysis_data.occurrences in the existing fixture (conftest.py:38-50) needs
# `canonical_name VARCHAR` added to its column list and seeded value.

# Add to _seed_data() — disagreement fixtures (TAX-04):
# Case A: subgenus-paren disagreement
con.execute("""
    INSERT INTO checklist_data.species VALUES
    ('Lasioglossum zonulum', NULL, NULL, NULL, 'Lasioglossum', NULL, 'zonulum',
     'verified', 'Bartholomew et al. 2024', NULL, 'lasioglossum zonulum')
""")
con.execute("""
    INSERT INTO checklist_data.species_counties VALUES
    ('Lasioglossum zonulum', 'King'),
    ('Lasioglossum zonulum', 'Pierce')
""")
# An ecdysis occurrence with the subgenus-paren form (the disagreement)
con.execute("""
    INSERT INTO ecdysis_data.occurrences (id, occurrence_id, ..., scientific_name, ..., canonical_name)
    VALUES ('xxx', 'uuid-x', ..., 'Lasioglossum (Dialictus) zonulum', ..., 'lasioglossum zonulum')
""")

# Case B: authority-bearing variant
con.execute("""
    INSERT INTO checklist_data.species VALUES
    ('Andrena fulva', NULL, NULL, NULL, 'Andrena', NULL, 'fulva',
     'verified', 'Bartholomew et al. 2024', NULL, 'andrena fulva')
""")
con.execute("""
    INSERT INTO ecdysis_data.occurrences (..., scientific_name, ..., canonical_name)
    VALUES (..., 'Andrena fulva (Müller, 1766)', ..., 'andrena fulva')
""")

# Add to inaturalist_data.taxon_lineage_extended:
con.execute("""
    INSERT INTO inaturalist_data.taxon_lineage_extended VALUES
    (1453118, 'Halictidae', 'Halictinae', 'Halictini', 'Lasioglossum', 'Leuchalictus'),
    (52784,   'Megachilidae', 'Megachilinae', 'Megachilini', 'Megachile', NULL)
""")
```

### Example 4: Idempotent ALTER TABLE on `ecdysis_data.occurrences`

```python
# DuckDB 1.4+ supports ADD COLUMN IF NOT EXISTS (verify against
# https://duckdb.org/docs/sql/statements/alter_table) [VERIFIED via DuckDB
# changelog: ADD COLUMN IF NOT EXISTS available since 0.10.0]
con.execute("""
    ALTER TABLE ecdysis_data.occurrences
    ADD COLUMN IF NOT EXISTS canonical_name VARCHAR
""")
# Then UPDATE — this re-runs every nightly because dlt's replace blows away the
# table and the column needs to be re-added each time.
```

## State of the Art

| Old Approach                                            | Current Approach                                                                | When Changed                | Impact                                                                                 |
|---------------------------------------------------------|----------------------------------------------------------------------------------|------------------------------|----------------------------------------------------------------------------------------|
| WABA-only narrow lineage `(taxon_id, genus, family)`    | Wider `(taxon_id, family, subfamily, tribe, genus, subgenus)` for ALL iNat taxa | Phase 76 (D-03)              | Phase 77 species_export can build genus + subgenus + tribe nav without WABA dependency |
| Authority strings buried in `scientificName`            | Explicit `canonical_name` column on both checklist and occurrences              | Phase 76 (D-04)              | Stable join key; slugs stable across runs; SPA links survive authority changes         |
| Implicit subspecies fold by accident in display layer   | Explicit trinomial fold in `canonicalize()`                                     | Phase 76 (D-04 step 3 + 6 trinomials in live data) | One canonical species per biological entity; FULL OUTER JOIN math is correct           |
| Hand-wave on "name disagreement" between sources        | Synonyms.csv override + warn-only unmatched.csv sidecar                         | Phase 76 (D-05)              | Reviewer-driven curation flow; pipeline never breaks on name drift                     |

**Deprecated/outdated:**
- Reading authority-bearing names from ecdysis: empirically there are none today, but historical retros (PITFALLS #19) indicate it has happened. The new `canonical_name` column means future authority leaks no longer break the join.

## Assumptions Log

| #  | Claim                                                                                                                          | Section                       | Risk if Wrong                                                                            |
|----|--------------------------------------------------------------------------------------------------------------------------------|-------------------------------|------------------------------------------------------------------------------------------|
| A1 | DuckDB 1.4 supports `ALTER TABLE … ADD COLUMN IF NOT EXISTS` syntax                                                            | §Code Examples 4              | If unsupported, planner uses a manual `INFORMATION_SCHEMA.COLUMNS` check before ALTER.   |
| A2 | DuckDB Python UDFs are not needed for this phase (Python-side update is fast enough at 45K rows)                                | §Standard Stack alternatives  | If wall time matters, switch to a `regexp_replace` SQL approach. Phase 77 perf irrelevant. |
| A3 | iNat v2 returns subgenus in `ancestors[]` for Halictidae species                                                              | §iNat ancestor walk           | VERIFIED via live probe of taxon 1453118 (`Lasioglossum zonulus`) on 2026-05-02.         |
| A4 | The ecdysis pipeline always runs before the checklist pipeline in a clean run                                                | §Pitfall 7                    | If `python data/checklist_pipeline.py` is run standalone with empty DB, reconcile() writes 527 spurious unmatched rows. Document the requirement; tests cover it via fixtures. |
| A5 | iNat does not impose a per-IP daily quota that ~50 batched calls would breach                                                  | §Pitfall 9                    | If quota hit, the existing waba_pipeline already would have hit it; observed-fine pattern. |
| A6 | The phrase "infraspecific markers" in D-04 covers `ssp.`, `var.`, `aff.`, `cf.`, `nr.`, plus `subsp.` (variant of `ssp.`)        | §Pattern 3                    | If `subsp.` is intentional out, plan must align tests to the strict list.                |
| A7 | The trinomial fold is implied by D-04 (steps 3 + 4 don't explicitly cover non-marker trinomials but 6 live ecdysis rows require it) | §Pitfall 2                  | Plan must surface this to user as an explicit step-3 sub-rule and add a pytest case.     |

## Open Questions (RESOLVED 2026-05-02 by gsd-planner)

1. **Where does `canonicalize()` live: `data/checklist_pipeline.py` or new `data/canonical_name.py`?**
   - **RESOLVED:** new `data/canonical_name.py` (Plan 076-02). Single-function module imported by 03/05/06; tests at `data/tests/test_canonical_name.py`.

2. **Does the test-command path in CONTEXT.md need updating?**
   - **RESOLVED:** tests live at `data/tests/test_checklist_pipeline.py` and `data/tests/test_taxon_lineage.py`; canonical command form is `cd data && uv run pytest tests/test_*.py` (the `tests/`-prefixed form). ROADMAP.md Success Criterion 5's bare-filename phrasing has been amended to match.

3. **Should the synonym override UPDATE the canonical_name on `checklist_data.species`?**
   - **RESOLVED:** Yes — `reconcile()` UPDATEs the column at reconcile time (Plan 076-05). Downstream consumers see no synonyms.csv complexity.

4. **`checklist_unmatched.csv` git-commit cadence?**
   - **RESOLVED:** Plan 01 commits the header-only seed (no stale entries). Plan 05 Task 2 regenerates the first real snapshot at the end of the phase. The file regenerates each pipeline run; commits are manual snapshots.

## Environment Availability

| Dependency                                | Required By                             | Available           | Version    | Fallback |
|-------------------------------------------|------------------------------------------|---------------------|------------|----------|
| Python                                    | All `data/` modules                      | ✓                   | 3.14+      | —        |
| `uv`                                      | `cd data && uv run …`                    | ✓                   | latest     | —        |
| `duckdb`                                  | All DB operations                        | ✓ (in pyproject)    | >=1.4,<2   | —        |
| `requests`                                | iNat v2 client                           | ✓ (in pyproject)    | latest     | —        |
| iNat v2 API (`api.inaturalist.org`)       | `enrich_taxon_lineage_extended`          | ✓ (verified live)   | v2 schema  | If down at run time, lineage_extended is empty; warn and continue (mirrors existing waba_pipeline behavior — actually waba would FAIL on `raise_for_status`; consider whether to soften this) |
| `data/beeatlas.duckdb`                    | Local dev runs                           | ✓                   | 105 MB     | —        |
| Source TSV (`~/Downloads/...(3).tsv`)     | Initial commit                           | ✓                   | 2862 rows  | —        |
| `pytest`                                  | Test runner                              | ✓ (in dev deps)     | >=9.0.2    | —        |

**Missing dependencies with no fallback:** None.

**Missing dependencies with fallback:** None.

All required tooling is present. No installation steps needed in the plan.

## Validation Architecture

> Per `.planning/config.json`, nyquist_validation defaults to enabled (key absent treated as enabled).

### Test Framework

| Property         | Value                                                                          |
|------------------|--------------------------------------------------------------------------------|
| Framework        | pytest 9.0.2+                                                                  |
| Config file      | `data/pyproject.toml` (`[tool.pytest.ini_options] testpaths = ["tests"]`)       |
| Quick run command | `cd data && uv run pytest tests/test_canonical_name.py -x`                     |
| Full suite command | `cd data && uv run pytest`                                                    |

### Phase Requirements → Test Map

| Req ID    | Behavior                                                                                                   | Test Type   | Automated Command                                                                              | File Exists?              |
|-----------|------------------------------------------------------------------------------------------------------------|-------------|------------------------------------------------------------------------------------------------|---------------------------|
| CHECK-02  | `load_checklist()` produces correct row count + schema for `checklist_data.species`                        | unit        | `cd data && uv run pytest tests/test_checklist_pipeline.py::test_load_creates_species_table -x` | ❌ Wave 0                |
| CHECK-03  | All 10 columns present + `canonical_name`; status="verified" for all rows                                  | unit        | `cd data && uv run pytest tests/test_checklist_pipeline.py::test_species_schema -x`            | ❌ Wave 0                |
| CHECK-04  | `STEPS` list contains `("checklist", load_checklist)` between `anti-entropy` and `export`                  | unit        | `cd data && uv run pytest tests/test_checklist_pipeline.py::test_run_steps_ordering -x`         | ❌ Wave 0                |
| CHECK-05  | Unmatched checklist rows go to `checklist_unmatched.csv`; pipeline does not raise on non-empty             | integration | `cd data && uv run pytest tests/test_checklist_pipeline.py::test_warn_only_unmatched -x`        | ❌ Wave 0                |
| CHECK-06  | Single canonicalize() helper produces identical output for checklist + occurrence inputs                   | unit        | `cd data && uv run pytest tests/test_canonical_name.py -x`                                     | ❌ Wave 0                |
| CHECK-06  | `canonicalize()` idempotence: `canonicalize(canonicalize(x)) == canonicalize(x)`                           | unit        | `cd data && uv run pytest tests/test_canonical_name.py::test_idempotent -x`                    | ❌ Wave 0                |
| TAX-01    | `taxon_lineage_extended` table has 6-col schema; populated from mocked iNat v2 response                    | unit        | `cd data && uv run pytest tests/test_taxon_lineage.py::test_lineage_columns -x`                | ❌ Wave 0                |
| TAX-01    | Ancestor walk handles missing intermediate ranks (no tribe → tribe=NULL)                                   | unit        | `cd data && uv run pytest tests/test_taxon_lineage.py::test_missing_rank_is_null -x`            | ❌ Wave 0                |
| TAX-04    | Disagreement: `Lasioglossum (Dialictus) zonulum` ↔ `Lasioglossum zonulum` join via canonical_name          | integration | `cd data && uv run pytest tests/test_checklist_pipeline.py::test_subgenus_disagreement -x`     | ❌ Wave 0                |
| TAX-04    | Authority variant: `Andrena fulva (Müller, 1766)` ↔ `Andrena fulva` join via canonical_name                | integration | `cd data && uv run pytest tests/test_checklist_pipeline.py::test_authority_disagreement -x`    | ❌ Wave 0                |
| (cross-cutting) | Trinomial fold: `Eucera frater frater` → `eucera frater`                                              | unit        | `cd data && uv run pytest tests/test_canonical_name.py::test_trinomial_fold -x`                | ❌ Wave 0                |
| (cross-cutting) | Infraspecific marker fold: `Hylaeus aff. cressoni` → `hylaeus`                                         | unit        | `cd data && uv run pytest tests/test_canonical_name.py::test_infraspecific_marker -x`           | ❌ Wave 0                |
| (cross-cutting) | Higher-rank input passthrough: `canonicalize("Osmia") == "osmia"`                                       | unit        | `cd data && uv run pytest tests/test_canonical_name.py::test_genus_only -x`                    | ❌ Wave 0                |
| (cross-cutting) | Empty/None input: `canonicalize("") is None` and `canonicalize(None) is None`                          | unit        | `cd data && uv run pytest tests/test_canonical_name.py::test_empty_input -x`                   | ❌ Wave 0                |

### Sampling Rate

- **Per task commit:** `cd data && uv run pytest tests/test_canonical_name.py -x` (≤2s — pure-Python unit tests)
- **Per wave merge:** `cd data && uv run pytest tests/test_canonical_name.py tests/test_checklist_pipeline.py tests/test_taxon_lineage.py` (≤30s — adds DuckDB fixture)
- **Phase gate:** `cd data && uv run pytest` (full suite — ensures Phase 76 doesn't regress existing test_export.py / test_feeds.py / test_transforms.py)

### Wave 0 Gaps

- [ ] `data/tests/test_canonical_name.py` — covers CHECK-06 + cross-cutting transform rules (idempotence, trinomial, marker, genus-only, empty)
- [ ] `data/tests/test_checklist_pipeline.py` — covers CHECK-02..05 + TAX-04 disagreement fixtures
- [ ] `data/tests/test_taxon_lineage.py` — covers TAX-01 (mocked iNat response, missing-rank handling)
- [ ] `data/tests/conftest.py` — extend `_create_schemas` (add `checklist_data`), `_create_tables` (add `checklist_data.species`, `checklist_data.species_counties`, `inaturalist_data.taxon_lineage_extended`; add `canonical_name` column to `ecdysis_data.occurrences`), and `_seed_data` (add disagreement fixture rows)
- [ ] Mock iNat v2 response fixture file (e.g. `data/tests/fixtures/inat_v2_taxa_response.json`) so `test_taxon_lineage.py` runs offline. Pattern: pytest's `requests-mock` is heavyweight; use `unittest.mock.patch('requests.get')` returning a hand-built dict — matches the existing test style.

> Framework install: not needed; pytest is already in `dev` dep group.

## Project Constraints (from CLAUDE.md)

The following directives from `./CLAUDE.md` apply to this phase. Plans that contradict them must be revised:

- **Static hosting only — no server runtime at any layer.** Phase 76 is pipeline-only and runs at build/cron time, not at request time. ✓ compliant.
- **Python 3.14+** (`data/pyproject.toml`). All new modules must declare 3.14-compatible syntax. ✓ no language-version concerns.
- **AWS deploy via GitHub OIDC** — irrelevant to Phase 76 (no infrastructure changes).
- **`speicmenLayer` typo in `bee-map.ts` is intentionally deferred — do not fix incidentally.** Irrelevant — Phase 76 doesn't touch frontend.
- **`data/` uses `uv` for tests** (`cd data && uv run pytest`). ✓ already reflected in §Validation Architecture.
- **Don't force-add gitignored files.** Critical: `data/checklist_unmatched.csv` is **not** gitignored per D-05 (it's committed as a snapshot). Plans must NOT add it to `.gitignore`. The TSV checklist `data/checklists/wa_bee_checklist.tsv` is also committed (not gitignored).
- **READMEs concise, link don't duplicate.** Applies to `data/checklists/README.md` — record provenance + extraction step + link to JHR DOI; do not transcribe the supplement's content.
- **Domain vocabulary** (CLAUDE.md): "Specimen" / "Sample" / "Floral host" / "Observation" / "Occurrence record" / "Collection event" — Phase 76 uses "occurrence" in the DuckDB sense (`ecdysis_data.occurrences` is the table; rows there are mostly specimens but the term is the technical schema name). Keep documentation language consistent with this convention.
- **Architecture invariants — state ownership, style cache, filter race guard, ID format** — irrelevant to Phase 76 (frontend invariants).

## Sources

### Primary (HIGH confidence)
- **`data/run.py:31-90`** — STEPS list, `_apply_migrations()` pattern. Read end-to-end.
- **`data/waba_pipeline.py:109-160`** — `enrich_taxon_lineage` template, iNat v2 endpoint shape (`fields=id,name,rank,ancestors.name,ancestors.rank`, `batch_size=30`). Read end-to-end.
- **`data/inaturalist_pipeline.py:114`** — `load_observations()` insertion point for `enrich_taxon_lineage_extended()` call. Read end-to-end.
- **`data/ecdysis_pipeline.py:78`** — confirms `write_disposition="replace"` for occurrences (column survives via re-add per run).
- **`data/geographies_pipeline.py:79-117`** — one-shot DuckDB load template (no dlt). Read end-to-end.
- **`data/anti_entropy_pipeline.py`** — warn-only posture precedent. Read end-to-end.
- **`data/export.py:116`** — current consumer of narrow `inaturalist_waba_data.taxon_lineage`. Read end-to-end.
- **`data/tests/conftest.py:1-227`** — existing programmatic DuckDB fixture pattern. Read end-to-end.
- **`data/pyproject.toml`** — verified Python 3.14+, duckdb >=1.4, dlt, requests, pytest deps. No new packages needed.
- **Live iNat v2 probe** (`https://api.inaturalist.org/v2/taxa/52784,118903` on 2026-05-02) — confirms ancestor structure includes `subfamily`, `tribe`. [VERIFIED: live API call]
- **Live iNat v2 probe** (`https://api.inaturalist.org/v2/taxa/1453118?fields=...ancestors.rank` on 2026-05-02) — confirms `Lasioglossum zonulus` (sic — note iNat's masculine form) has `subgenus=Leuchalictus` in ancestors. [VERIFIED: live API call]
- **Live DB query** (`/Users/rainhead/dev/beeatlas/data/beeatlas.duckdb`, 105 MB, 2026-05-02) — 564 distinct ecdysis scientific_name values; 0 carry authority/comma+year; only 3 carry parens (subgenus-only without species); 6 trinomial subspecies present; 452 distinct binomials. [VERIFIED: live query]
- **TSV inspection** (`/Users/rainhead/Downloads/washington_bees(3).tsv`) — 2,862 rows, 527 unique species (all 2-token bare binomials, no parens, no markers, no authorities), 39 unique counties. [VERIFIED: shell tools]

### Secondary (MEDIUM confidence)
- **`.planning/research/SUMMARY.md`** — milestone-wide synthesis; Phase 76 placement and integration shape.
- **`.planning/research/PITFALLS.md`** Pitfalls #2, #4, #19 — checklist↔ecdysis name disagreement, authority leak. Direct precedent for the canonical_name column design.
- **`data/README.md`** — referenced for nightly cron context (CLAUDE.md cross-ref).

### Tertiary (LOW confidence)
- **DuckDB `ADD COLUMN IF NOT EXISTS`** support. [ASSUMED] available since 0.10.0 per release notes — planner should verify against `https://duckdb.org/docs/sql/statements/alter_table` before committing.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — zero new packages; every primitive verified in pyproject.toml.
- Architecture: HIGH — every integration file read end-to-end; live DB queried; iNat API probed.
- Pitfalls: HIGH — existing PITFALLS.md research + 6 trinomial cases empirically observed in live data + iNat name-form disagreement (`Lasioglossum zonulus` vs checklist `Lasioglossum zonulum`) discovered during research.
- Validation: HIGH — all phase requirements mapped to a runnable pytest command; all gaps explicitly listed for Wave 0.

**Research date:** 2026-05-02
**Valid until:** 2026-06-02 (30 days for stable pipeline; iNat API responses verified live and unlikely to change shape)
