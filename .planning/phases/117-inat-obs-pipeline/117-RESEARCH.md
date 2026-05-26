# Phase 117: iNat Obs Pipeline - Research

**Researched:** 2026-05-25
**Domain:** Python data pipeline — CSV ingest, DuckDB staging, Parquet export, S3/CloudFront publishing
**Confidence:** HIGH

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

- **D-01:** iNat export CSV lives at `data/raw/inat_expert_obs.csv`, committed to git with a fixed filename. Overwritten in place when refreshed. No S3 management — git log is the version history.
- **D-02:** `inat_obs.parquet` stores 12 columns: `obs_id`, `observed_on`, `lat`, `lon`, `canonical_name`, `scientific_name`, `user_login`, `image_url`, `license`, `floral_host`, `quality_grade`, `obs_url`.

### Claude's Discretion

- **Pipeline module**: New `data/inat_obs_pipeline.py`. Do NOT extend `inaturalist_pipeline.py`.
- **Step placement**: Add `"inat-obs"` to STEPS after `"ecdysis"` and before `"dbt-build"`. Exact position within that window is planner's call.
- **Dedup data source**: Exclude rows where `obs_id` matches `specimen_observation_id` in Ecdysis DuckDB tables. Planner must identify the exact table/column.
- **nightly.sh / manifest**: Add `inat_obs.parquet` to the hashed-upload block and `manifest.json` with key `"inat_obs"`.
- **Tests**: Pytest integration tests covering (a) 12-column schema, (b) dedup correctness, (c) `canonical_name` non-null for valid rows.

### Deferred Ideas (OUT OF SCOPE)

- Pytest test coverage discussion deferred — planner adds tests per established pattern.
- `quality_grade` filter UI (MAP-F02) — future milestone.
- Auto-refresh via nightly export query (PIPE-F01) — future milestone.
- Floral host taxonomy resolution (PIPE-F02) — future milestone.
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| PIPE-01 | Pipeline produces `inat_obs.parquet` from committed CSV; 10 required columns | Column mapping verified; DuckDB COPY TO PARQUET confirmed functional |
| PIPE-02 | `canonical_name` resolved via D-04 `canonicalize()` on `scientific_name` | `canonicalize()` handles None inputs, returns None for invalid; apply element-wise |
| PIPE-03 | Rows matching `specimen_observation_id` in Ecdysis excluded from output | Dedup source identified: `dbt_sandbox.int_waba_link.specimen_observation_id` (VIEW on raw waba tables); 1,407 distinct IDs in current DB |
| PIPE-04 | `floral_host` from `"field:associated species with names lookup"` column; NULL when absent | Column name confirmed in CONTEXT; OFV field_id=1711 ("Associated species with names lookup") verified in DuckDB |
| PIPE-05 | `inat_obs.parquet` available via CloudFront after nightly run | `_upload_hashed` pattern in `nightly.sh` fully understood; manifest key `"inat_obs"` confirmed |
</phase_requirements>

---

## Summary

Phase 117 adds a new Python pipeline step that reads a committed iNaturalist CSV export, applies the existing D-04 canonicalization algorithm, deduplicates against WABA-linked specimen observation IDs, and writes a 12-column `inat_obs.parquet` to EXPORT_DIR for S3 upload via the existing hashed-upload pattern in `nightly.sh`.

The pipeline is self-contained: no new packages are required, no dbt changes, no frontend changes. The two non-trivial decisions the planner must resolve are (1) the exact dedup query and (2) whether to use DuckDB `COPY TO PARQUET` or `pyarrow.parquet.write_table`. Research shows `COPY TO PARQUET` is the simpler path here (no complex type conversions needed), while pyarrow is required in `species_export.py` only because of the `INT[12]` month_histogram type.

The CSV file (`data/raw/inat_expert_obs.csv`) does not yet exist in the repository — it will be committed as part of the Wave 0 task that starts the phase.

**Primary recommendation:** Follow the `checklist_pipeline.py` pattern (read CSV → transform in Python → write to DuckDB table → COPY TO PARQUET) with `dbt_sandbox.int_waba_link` as the dedup source.

---

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| CSV ingest & transformation | Python pipeline | DuckDB (staging table) | File-based ingest; DuckDB handles all SQL transforms |
| Deduplication against Ecdysis | DuckDB query | — | `dbt_sandbox.int_waba_link` is a VIEW on raw waba tables; readable after waba step runs |
| Parquet output | DuckDB COPY TO PARQUET | — | No complex type conversions; simpler than pyarrow for flat schema |
| S3 upload & CloudFront | `nightly.sh` bash | — | `_upload_hashed` pattern; manifest.json construction; all existing infrastructure |
| Canonicalization | `canonical_name.py` (pure Python) | — | Import `canonicalize()` directly; do not re-implement |

---

## Standard Stack

### Core (no new packages required)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `duckdb` | 1.5.2 [VERIFIED: local env] | CSV read, SQL transforms, COPY TO PARQUET | Already in pyproject.toml; supports all required operations |
| `canonical_name.canonicalize` | — (project module) | D-04 canonicalization of `scientific_name` | Single source of truth for JOIN keys; handles None inputs |
| Python `csv` module | stdlib | CSV header inspection / fallback | Available without install |

No new packages are needed for this phase. All dependencies are already in `data/pyproject.toml`. [VERIFIED: local env — `duckdb>=1.4,<2`, `pyarrow>=12` already present]

### Installation

```bash
# No new packages — existing pyproject.toml dependencies are sufficient
# Run inside data/ to confirm environment:
uv sync
```

---

## Package Legitimacy Audit

No new packages are installed in this phase. All functionality uses existing project dependencies.

| Package | Registry | Notes | Disposition |
|---------|----------|-------|-------------|
| duckdb | PyPI | Already in pyproject.toml; used throughout pipeline | Existing |
| pyarrow | PyPI | Already in pyproject.toml; available if needed | Existing |

**Packages removed due to slopcheck [SLOP] verdict:** none
**Packages flagged as suspicious [SUS]:** none

---

## Architecture Patterns

### System Architecture Diagram

```
data/raw/inat_expert_obs.csv
         │
         ▼ (csv.DictReader)
inat_obs_pipeline.load_inat_obs()
         │
         ├── canonicalize(scientific_name) ──► canonical_name
         │
         ├── DEDUP: obs_id NOT IN (
         │         SELECT specimen_observation_id
         │         FROM dbt_sandbox.int_waba_link
         │         WHERE specimen_observation_id IS NOT NULL)
         │
         ├── floral_host ← row.get('field:associated species with names lookup')
         │
         ├── obs_url ← f"https://www.inaturalist.org/observations/{obs_id}"
         │
         ▼
  inat_obs_data.observations (DuckDB staging table — CREATE OR REPLACE)
         │
         ▼ (COPY TO PARQUET)
  $EXPORT_DIR/inat_obs.parquet
         │
         ▼ (nightly.sh _upload_hashed)
  s3://$BUCKET/data/inat_obs-{hash}.parquet
  + manifest.json update
         │
         ▼
  CloudFront /data/manifest.json (invalidated)
```

### Recommended Project Structure

```
data/
├── inat_obs_pipeline.py       # NEW — the pipeline module
├── raw/
│   └── inat_expert_obs.csv    # NEW — committed CSV export (Wave 0)
├── tests/
│   └── test_inat_obs_pipeline.py  # NEW — integration tests (Wave 0)
└── run.py                     # MODIFIED — add "inat-obs" step
```

Plus modifications to `data/nightly.sh` for upload + manifest.

### Pattern 1: File-Based Pipeline Step (from `checklist_pipeline.py`)

**What:** Open CSV, iterate rows, accumulate Python list of tuples, create DuckDB table, insert via `executemany`, then write output.
**When to use:** File-based ingest where the source doesn't require API calls.

```python
# Source: data/checklist_pipeline.py (project codebase) [VERIFIED: codebase]
import csv
import os
from pathlib import Path
import duckdb
from canonical_name import canonicalize

DB_PATH = os.environ.get("DB_PATH", str(Path(__file__).parent / "beeatlas.duckdb"))
CSV_PATH = Path(__file__).parent / "raw" / "inat_expert_obs.csv"
_EXPORT_DIR = Path(os.environ.get("EXPORT_DIR",
    str(Path(__file__).parent.parent / "public" / "data")))

def load_inat_obs() -> None:
    con = duckdb.connect(DB_PATH)
    try:
        # Read CSV, transform, deduplicate, write to DuckDB
        # ...
        # Write parquet
        _EXPORT_DIR.mkdir(parents=True, exist_ok=True)
        con.execute(
            f"COPY inat_obs_data.observations TO '{_EXPORT_DIR}/inat_obs.parquet' "
            "(FORMAT PARQUET, CODEC SNAPPY)"
        )
    finally:
        con.close()
```

### Pattern 2: Dedup via NOT IN against `dbt_sandbox.int_waba_link`

**What:** The specimen_observation_id values are iNat obs IDs of WABA participant specimen photos. These IDs are already represented via the Ecdysis/WABA pipeline path. Expert obs with matching IDs must be excluded.

**Dedup source:** `dbt_sandbox.int_waba_link.specimen_observation_id`

This is a VIEW chain: `dbt_sandbox.int_waba_link` → `dbt_sandbox.stg_waba__observations` → `beeatlas.inaturalist_waba_data.observations`. [VERIFIED: codebase — view definition confirmed via `information_schema.views`]

After the `waba` step in `run.py` runs, `inaturalist_waba_data.observations` is fresh. Since `inat-obs` runs after `ecdysis` (which implies waba also ran), this VIEW is safe to query.

**Current counts (local DB):**
- Distinct `specimen_observation_id` values: 1,407 [VERIFIED: live DuckDB query]
- The 821 overlaps mentioned in CONTEXT are relative to the 45,354-row CSV export

```python
# Load dedup set once, before row iteration
excluded_ids: set[int] = set()
dedup_rows = con.execute("""
    SELECT DISTINCT CAST(specimen_observation_id AS BIGINT)
    FROM dbt_sandbox.int_waba_link
    WHERE specimen_observation_id IS NOT NULL
""").fetchall()
excluded_ids = {r[0] for r in dedup_rows}
```

**Fallback if dbt_sandbox is absent (first run):**

```python
# Equivalent query on raw tables
dedup_rows = con.execute("""
    SELECT DISTINCT waba.id
    FROM inaturalist_waba_data.observations waba
    JOIN inaturalist_waba_data.observations__ofvs ofv ON ofv._dlt_root_id = waba._dlt_id
    WHERE ofv.field_id = 18116 AND ofv.value != '' AND ofv.value IS NOT NULL
""").fetchall()
```

The planner should use the `dbt_sandbox.int_waba_link` path (simpler, mirrors the dbt model intent) with a `try/except` fallback to the raw tables if the schema doesn't exist. [VERIFIED: codebase — view confirmed functional]

### Pattern 3: `_upload_hashed` in `nightly.sh`

**What:** Uploads parquet with content-hash suffix, prints hashed filename, adds to manifest heredoc.
**Pattern (copy verbatim):**

```bash
# Source: data/nightly.sh lines 139-148, 150-170 [VERIFIED: codebase]
inat_obs_name=$(_upload_hashed "$EXPORT_DIR/inat_obs.parquet" "inat_obs")

cat > "$EXPORT_DIR/manifest.json" <<JSON
{
  "occurrences": "$occ_name",
  ...
  "inat_obs": "$inat_obs_name",
  "generated_at": "$(_ts)"
}
JSON
```

### Pattern 4: CSV Column Mapping

iNaturalist observation export CSV standard columns [ASSUMED — based on training knowledge; exact column names in the actual CSV should be confirmed when the CSV is committed]:

| iNat CSV Column | Output Column | Type | Notes |
|----------------|---------------|------|-------|
| `id` | `obs_id` | BIGINT | Integer observation ID |
| `observed_on` | `observed_on` | DATE or VARCHAR | Format: `YYYY-MM-DD` |
| `latitude` | `lat` | DOUBLE | |
| `longitude` | `lon` | DOUBLE | |
| `scientific_name` | `scientific_name` | VARCHAR | Also source for `canonical_name` |
| — | `canonical_name` | VARCHAR | `canonicalize(scientific_name)` |
| `user_login` | `user_login` | VARCHAR | |
| `image_url` | `image_url` | VARCHAR | First photo thumbnail URL |
| `license` | `license` | VARCHAR | e.g., `CC BY` or `CC0` |
| `field:associated species with names lookup` | `floral_host` | VARCHAR | NULL when absent |
| `quality_grade` | `quality_grade` | VARCHAR | `research`, `needs_id`, or `casual` |
| — | `obs_url` | VARCHAR | `https://www.inaturalist.org/observations/{id}` |

**IMPORTANT:** The Wave 0 task that commits `data/raw/inat_expert_obs.csv` must verify the actual CSV header row matches these expected column names before the transform code is written. The planner should include a "read CSV header, assert expected columns exist" task.

### Anti-Patterns to Avoid

- **Extending `inaturalist_pipeline.py`:** That module handles iNat API calls for WABA enrichment. Different concern. [CITED: CONTEXT.md D-discretion]
- **Running dbt before inat-obs:** `inat-obs` runs before `dbt-build`; do NOT call `bash data/dbt/run.sh build` from within `load_inat_obs()`.
- **Hardcoding EXPORT_DIR:** Use `os.environ.get("EXPORT_DIR", ...)` as done in `feeds.py` and `places_export.py`.
- **Using pyarrow for parquet write:** DuckDB `COPY TO PARQUET` is sufficient here. pyarrow is only needed when writing columns with complex DuckDB types (e.g., `INT[12]` in `species_export.py`).
- **Querying `dbt_sandbox.occurrences` for dedup:** That table is an `external` materialization that reads from `target/sandbox/occurrences.parquet`, which may not exist before `dbt-build` runs.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Taxonomic name canonicalization | Custom string-processing | `canonical_name.canonicalize()` | D-04 algorithm is locked; re-implementation will introduce subtle divergence |
| Content-hashed S3 upload | Custom hash+upload | `_upload_hashed` bash function in `nightly.sh` | Already handles SHA256, Cache-Control immutable, S3 path convention |
| Parquet schema enforcement | Manual column validation | DuckDB `CREATE TABLE` with explicit types + `COPY TO PARQUET` | DuckDB enforces schema at insert time |

**Key insight:** The entire pipeline infrastructure (DuckDB, nightly.sh upload pattern, manifest.json, EXPORT_DIR convention) already exists. This phase is additive, not architectural.

---

## Runtime State Inventory

This is a greenfield pipeline step (no rename/refactor). No runtime state migration is needed.

- **Stored data:** None — `inat_obs_data` schema is new; first run creates it with `CREATE OR REPLACE`.
- **Live service config:** None.
- **OS-registered state:** None.
- **Secrets/env vars:** None — uses existing `DB_PATH`, `EXPORT_DIR`, `AWS_PROFILE`, `BUCKET` env vars.
- **Build artifacts:** None.

---

## Common Pitfalls

### Pitfall 1: Schema May Not Exist on First Run
**What goes wrong:** `CREATE TABLE inat_obs_data.observations` fails because the schema doesn't exist yet.
**Why it happens:** Unlike `ecdysis_data` (created by ecdysis pipeline) or `checklist_data` (created by checklist pipeline), `inat_obs_data` is new and has no prior creator.
**How to avoid:** Add `con.execute("CREATE SCHEMA IF NOT EXISTS inat_obs_data")` before the table create, as done in `load_checklist()` and other pipeline steps. [VERIFIED: codebase — `CREATE SCHEMA IF NOT EXISTS` pattern used in checklist_pipeline.py line 170]
**Warning signs:** `Catalog Error: Schema 'inat_obs_data' does not exist!`

### Pitfall 2: `dbt_sandbox` May Not Exist on First-Ever Run
**What goes wrong:** Dedup query on `dbt_sandbox.int_waba_link` fails because `dbt_sandbox` schema doesn't exist.
**Why it happens:** `dbt_sandbox` is created by `dbt-build`; on a completely fresh DuckDB (no prior S3 snapshot), the schema is absent when `inat-obs` step runs.
**How to avoid:** Wrap the dedup query in a `try/except` that falls back to the raw `inaturalist_waba_data` query (shown in Pattern 2 above). In production, nightly.sh pulls the DuckDB from S3 before running pipelines, so `dbt_sandbox` will always exist after the first successful run. [VERIFIED: nightly.sh lines 99-105]
**Warning signs:** `Catalog Error: Schema 'dbt_sandbox' does not exist!`

### Pitfall 3: iNat CSV `id` Column is a Float in Some Readers
**What goes wrong:** Python csv module reads all values as strings; `int(row['id'])` works correctly. But if someone uses pandas or DuckDB `read_csv_auto`, the `id` column may be inferred as `DOUBLE` due to large integer values.
**Why it happens:** Large integers (iNat obs IDs are ~9-digit integers) near float precision boundaries.
**How to avoid:** Use Python `csv.DictReader` (reads all as str; cast with `int()`) or explicit `TYPES` in DuckDB `read_csv`. [ASSUMED — based on general knowledge of CSV parsing behavior]
**Warning signs:** `obs_id` values like `163069968.0` instead of `163069968`.

### Pitfall 4: `floral_host` Column May Be Absent in CSV if Not Exported
**What goes wrong:** `row.get('field:associated species with names lookup')` returns `None` even for rows that have the field, because the export didn't include that OFV column.
**Why it happens:** iNat export requires explicitly selecting OFV columns to include; if the export was generated without selecting this field, the column will be absent from the CSV header.
**How to avoid:** The Wave 0 task that commits the CSV should verify the column exists in the header. The pipeline code must use `.get()` (not `[]`) and store NULL gracefully when the column is absent.
**Warning signs:** All `floral_host` values are NULL when some should be populated.

### Pitfall 5: `canonical_name` is NULL for Rows with Higher-Rank IDs
**What goes wrong:** Some iNat observations are identified only to genus or family level. `canonicalize("Andrena")` returns `"andrena"` (not NULL), but `canonicalize("Halictidae")` also returns `"halictidae"`. The requirement (SC-2) says canonical_name must be non-null for every row.
**Why it happens:** `canonicalize()` returns None only for None/empty/whitespace inputs. Any non-empty scientific_name produces a non-null result.
**How to avoid:** No action needed — `canonicalize()` handles all non-empty strings. The SC-2 assertion (canonical_name non-null) will pass for all rows where `scientific_name` is non-empty. For rows where `scientific_name` is NULL or empty in the CSV, the row should either be excluded or flagged. [VERIFIED: codebase — `canonicalize()` behavior confirmed by direct test]
**Warning signs:** `canonical_name IS NULL` rows appearing in output when `scientific_name` is non-empty.

---

## Code Examples

### Complete Module Skeleton

```python
# Source: follows data/checklist_pipeline.py pattern [VERIFIED: codebase]
"""Phase 117 iNat expert observations pipeline.

Reads the committed iNat CSV export (data/raw/inat_expert_obs.csv), applies
D-04 canonicalization to scientific_name, deduplicates against WABA-linked
specimen_observation_ids, and writes inat_obs.parquet to EXPORT_DIR.

Phase 117 / PIPE-01..05.
"""
import csv
import os
from pathlib import Path

import duckdb

from canonical_name import canonicalize

DB_PATH = os.environ.get("DB_PATH", str(Path(__file__).parent / "beeatlas.duckdb"))
CSV_PATH = Path(__file__).parent / "raw" / "inat_expert_obs.csv"
_EXPORT_DIR = Path(os.environ.get(
    "EXPORT_DIR",
    str(Path(__file__).parent.parent / "public" / "data"),
))

_FLORAL_HOST_FIELD = "field:associated species with names lookup"
_OBS_URL_PREFIX = "https://www.inaturalist.org/observations/"


def _load_excluded_ids(con: duckdb.DuckDBPyConnection) -> set[int]:
    """Return set of iNat obs IDs that are already represented as Ecdysis specimens.

    Queries dbt_sandbox.int_waba_link (VIEW on raw waba tables), falling back
    to raw inaturalist_waba_data query if dbt_sandbox schema is absent (first run).
    """
    try:
        rows = con.execute("""
            SELECT DISTINCT CAST(specimen_observation_id AS BIGINT)
            FROM dbt_sandbox.int_waba_link
            WHERE specimen_observation_id IS NOT NULL
        """).fetchall()
    except duckdb.CatalogException:
        # dbt_sandbox absent on first-ever run; query raw tables
        rows = con.execute("""
            SELECT DISTINCT waba.id
            FROM inaturalist_waba_data.observations waba
            JOIN inaturalist_waba_data.observations__ofvs ofv
                ON ofv._dlt_root_id = waba._dlt_id
            WHERE ofv.field_id = 18116 AND ofv.value != '' AND ofv.value IS NOT NULL
        """).fetchall()
    return {r[0] for r in rows}


def load_inat_obs() -> None:
    """Read inat_expert_obs.csv and write inat_obs.parquet to EXPORT_DIR."""
    con = duckdb.connect(DB_PATH)
    try:
        excluded_ids = _load_excluded_ids(con)
        con.execute("CREATE SCHEMA IF NOT EXISTS inat_obs_data")

        rows: list[tuple] = []
        with CSV_PATH.open(newline="", encoding="utf-8") as f:
            reader = csv.DictReader(f)
            for row in reader:
                obs_id = int(row["id"])
                if obs_id in excluded_ids:
                    continue
                sci_name = (row.get("scientific_name") or "").strip() or None
                rows.append((
                    obs_id,
                    row.get("observed_on") or None,
                    float(row["latitude"]) if row.get("latitude") else None,
                    float(row["longitude"]) if row.get("longitude") else None,
                    canonicalize(sci_name),
                    sci_name,
                    row.get("user_login") or None,
                    row.get("image_url") or None,
                    row.get("license") or None,
                    row.get(_FLORAL_HOST_FIELD) or None,
                    row.get("quality_grade") or None,
                    f"{_OBS_URL_PREFIX}{obs_id}",
                ))

        con.execute("""
            CREATE OR REPLACE TABLE inat_obs_data.observations (
                obs_id BIGINT,
                observed_on DATE,
                lat DOUBLE,
                lon DOUBLE,
                canonical_name VARCHAR,
                scientific_name VARCHAR,
                user_login VARCHAR,
                image_url VARCHAR,
                license VARCHAR,
                floral_host VARCHAR,
                quality_grade VARCHAR,
                obs_url VARCHAR
            )
        """)
        con.executemany(
            "INSERT INTO inat_obs_data.observations VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
            rows,
        )
        total = con.execute("SELECT count(*) FROM inat_obs_data.observations").fetchone()[0]
        null_canon = con.execute(
            "SELECT count(*) FROM inat_obs_data.observations "
            "WHERE canonical_name IS NULL AND scientific_name IS NOT NULL"
        ).fetchone()[0]
        print(f"inat_obs: {total:,} rows loaded ({len(excluded_ids)} deduped); "
              f"{null_canon} rows with null canonical_name (scientific_name present)")

        _EXPORT_DIR.mkdir(parents=True, exist_ok=True)
        out_path = _EXPORT_DIR / "inat_obs.parquet"
        con.execute(
            f"COPY inat_obs_data.observations TO '{out_path}' (FORMAT PARQUET, CODEC SNAPPY)"
        )
        print(f"  inat_obs.parquet: {out_path.stat().st_size:,} bytes")
    finally:
        con.close()
```

### nightly.sh Addition

```bash
# Source: data/nightly.sh pattern [VERIFIED: codebase]
# Add after checklist_name= line:
inat_obs_name=$(_upload_hashed "$EXPORT_DIR/inat_obs.parquet" "inat_obs")

# Update manifest.json heredoc to include:
#   "inat_obs": "$inat_obs_name",
```

### run.py Addition

```python
# Source: data/run.py STEPS list pattern [VERIFIED: codebase]
from inat_obs_pipeline import load_inat_obs

# Add to STEPS between "waba" (or "projects") and "dbt-build":
("inat-obs", load_inat_obs),
```

### Test Skeleton

```python
# Source: follows data/tests/test_checklist_pipeline.py pattern [VERIFIED: codebase]
import csv
import duckdb
import pytest
from inat_obs_pipeline import load_inat_obs, CSV_PATH, _FLORAL_HOST_FIELD

@pytest.fixture
def inat_obs_db(tmp_path, monkeypatch):
    """Isolated DuckDB. Pre-seed inaturalist_waba_data for dedup."""
    db_path = str(tmp_path / "test.duckdb")
    monkeypatch.setenv("DB_PATH", db_path)
    monkeypatch.setenv("EXPORT_DIR", str(tmp_path))

    import importlib, inat_obs_pipeline
    importlib.reload(inat_obs_pipeline)

    con = duckdb.connect(db_path)
    con.execute("CREATE SCHEMA inaturalist_waba_data")
    con.execute("CREATE TABLE inaturalist_waba_data.observations (id BIGINT)")
    con.execute("CREATE TABLE inaturalist_waba_data.observations__ofvs ("
                "_dlt_root_id VARCHAR, field_id BIGINT, name VARCHAR, "
                "value VARCHAR, _dlt_id VARCHAR)")
    con.close()

    # Write minimal CSV with known rows
    csv_path = tmp_path / "inat_expert_obs.csv"
    monkeypatch.setattr(inat_obs_pipeline, "CSV_PATH", csv_path)
    return db_path, tmp_path, inat_obs_pipeline

def test_schema_has_12_columns(inat_obs_db, ...):
    # assert output parquet has exactly 12 columns

def test_dedup_excludes_specimen_obs_id(inat_obs_db, ...):
    # seed a known specimen_observation_id in waba tables
    # include that obs_id in CSV; assert it's absent from output

def test_canonical_name_non_null_for_valid_rows(inat_obs_db, ...):
    # rows with non-empty scientific_name must have non-null canonical_name
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Legacy Python export.py | dbt as sole transform producer | v3.4 (Phase 88) | inat_obs_pipeline writes to its own `inat_obs_data` schema, separate from dbt models |
| DuckDB WASM frontend | wa-sqlite + hyparquet | v2.6 (Phase 59-61) | Parquet served via CloudFront; inat_obs.parquet follows same pattern as occurrences.parquet |

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | iNat CSV export columns include: `id`, `observed_on`, `latitude`, `longitude`, `scientific_name`, `user_login`, `image_url`, `license`, `quality_grade`, `field:associated species with names lookup` | Standard Stack / Code Examples | If column names differ, CSV row mapping fails; mitigated by Wave 0 "verify CSV header" task |
| A2 | `license` is the correct column name in the iNat CSV export (not `license_code`) | Code Examples | If `license_code` is used instead, `floral_host` maps correctly but `license` reads as NULL |
| A3 | Python `csv.DictReader` reads large integers correctly as strings (no float precision loss) | Pitfall 3 | If not handled, `obs_id` may have precision errors for large IDs |

**If this table is empty:** All claims in this research were verified or cited — no user confirmation needed.
*(This table is not empty — A1 and A2 should be confirmed when the actual CSV is committed.)*

---

## Open Questions

1. **CSV Header Verification**
   - What we know: CONTEXT confirms the floral_host source field name; standard iNat CSV column names are well-established from training knowledge.
   - What's unclear: The actual column names in the specific CSV export that will be committed to `data/raw/inat_expert_obs.csv` (export may vary by iNat export tool version or selected columns).
   - Recommendation: Wave 0 task should print the CSV header and assert expected columns before any transform code is written. The pipeline should fail fast with a clear error if a required column is missing.

2. **Dedup Query Robustness**
   - What we know: `dbt_sandbox.int_waba_link` is a VIEW on raw tables; readable after `waba` step.
   - What's unclear: Whether to guard against `dbt_sandbox` schema absence with `try/except` or `IF EXISTS` SQL.
   - Recommendation: Use `try/except duckdb.CatalogException` as shown in code example. In production, the schema always exists (DuckDB pulled from S3).

---

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Python 3.14+ | Pipeline module | ✓ | 3.14 (via uv) | — |
| duckdb >= 1.4 | COPY TO PARQUET, SQL transforms | ✓ | 1.5.2 [VERIFIED] | — |
| pyarrow >= 12 | Available if needed | ✓ | 24.0.0 [VERIFIED] | Not needed for this phase |
| AWS CLI | nightly.sh S3 upload | ✓ (nightly.sh env) | — | — |
| `data/raw/inat_expert_obs.csv` | load_inat_obs() | NOT YET — Wave 0 task | — | Phase cannot run without it |

**Missing dependencies with no fallback:**
- `data/raw/inat_expert_obs.csv` — must be committed in Wave 0 before any other plan can run.

---

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | pytest 9.0.2+ (data/pyproject.toml dev group) |
| Config file | `data/pyproject.toml` `[tool.pytest.ini_options]` with `testpaths = ["tests"]` |
| Quick run command | `cd data && uv run pytest tests/test_inat_obs_pipeline.py -x` |
| Full suite command | `cd data && uv run pytest tests/ -x` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| PIPE-01 | Output parquet has all 12 columns | integration | `uv run pytest tests/test_inat_obs_pipeline.py::test_schema_has_12_columns -x` | ❌ Wave 0 |
| PIPE-02 | canonical_name non-null for valid rows | integration | `uv run pytest tests/test_inat_obs_pipeline.py::test_canonical_name_non_null -x` | ❌ Wave 0 |
| PIPE-03 | Dedup excludes known specimen_observation_id row | integration | `uv run pytest tests/test_inat_obs_pipeline.py::test_dedup_excludes_specimen_obs -x` | ❌ Wave 0 |
| PIPE-04 | floral_host populated from OFV column; NULL when absent | integration | `uv run pytest tests/test_inat_obs_pipeline.py::test_floral_host_mapping -x` | ❌ Wave 0 |
| PIPE-05 | nightly.sh inat_obs upload+manifest (manual) | manual | Run nightly.sh in staging | N/A |

### Sampling Rate

- **Per task commit:** `cd data && uv run pytest tests/test_inat_obs_pipeline.py -x`
- **Per wave merge:** `cd data && uv run pytest tests/ -x`
- **Phase gate:** Full suite green before `/gsd-verify-work`

### Wave 0 Gaps

- [ ] `data/raw/inat_expert_obs.csv` — the CSV must be committed before tests or pipeline code can run
- [ ] `data/tests/test_inat_obs_pipeline.py` — covers PIPE-01, PIPE-02, PIPE-03, PIPE-04
- [ ] No new framework install needed — pytest already in dev dependencies

---

## Security Domain

This phase has no user-facing authentication, session management, or API endpoints. The only external interaction is S3 upload (existing AWS credential pattern). Input validation applies:

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no | — |
| V3 Session Management | no | — |
| V4 Access Control | no | — |
| V5 Input Validation | yes (limited) | Validate CSV column presence on open; cast `id` to int explicitly |
| V6 Cryptography | no | — |

The CSV is a committed git file (trusted input). Validation focus is on schema correctness, not injection defense.

---

## Sources

### Primary (HIGH confidence)

- `data/checklist_pipeline.py` — canonical pattern for file-based pipeline step [VERIFIED: codebase]
- `data/nightly.sh` — `_upload_hashed` function, manifest.json pattern [VERIFIED: codebase]
- `data/run.py` — STEPS list, module import pattern [VERIFIED: codebase]
- `data/canonical_name.py` — `canonicalize()` behavior including None handling [VERIFIED: codebase + direct test]
- `data/dbt/models/intermediate/int_waba_link.sql` — specimen_observation_id source [VERIFIED: codebase]
- Live DuckDB queries on `data/beeatlas.duckdb` — schema, view definitions, row counts [VERIFIED: live queries]
- `data/pyproject.toml` — dependency versions, pytest configuration [VERIFIED: codebase]
- `data/tests/conftest.py` + `test_checklist_pipeline.py` — test fixture patterns [VERIFIED: codebase]

### Secondary (MEDIUM confidence)

- iNaturalist CSV export column naming convention (`id`, `scientific_name`, `observed_on`, `latitude`, `longitude`, `user_login`, `image_url`, `license`, `quality_grade`, `field:*`) [ASSUMED — training knowledge; to be verified against actual CSV in Wave 0]

### Tertiary (LOW confidence)

- None.

---

## Metadata

**Confidence breakdown:**
- Standard Stack: HIGH — no new packages; existing duckdb/pyarrow verified in local env
- Architecture: HIGH — all patterns verified against existing codebase
- Dedup source: HIGH — live DuckDB queries confirmed `dbt_sandbox.int_waba_link` view chain
- CSV column names: ASSUMED (medium risk) — confirmed by CONTEXT for `field:associated species with names lookup`; other columns based on training knowledge

**Research date:** 2026-05-25
**Valid until:** 2026-07-01 (stable dependencies; CSV format may vary on first commit)
