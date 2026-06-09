# Phase 136: Deduplication - Pattern Map

**Mapped:** 2026-06-08
**Files analyzed:** 7 new/modified files
**Analogs found:** 6 / 7 (collector normalization is net-new)

---

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `data/dbt/models/intermediate/int_checklist_collapsed.sql` | model | transform (CRUD) | `data/dbt/models/intermediate/int_ecdysis_base.sql` + `int_combined.sql` | role-match (GROUP BY survivor pattern derived from verified DuckDB patterns) |
| `data/dbt/models/intermediate/int_dedup_candidates.sql` | model | transform (CRUD / spatial join) | `data/dbt/models/marts/occurrences.sql` (spatial join) + `int_combined.sql` (ref() chaining) | role-match |
| `data/dbt/models/intermediate/int_checklist_dedup_status.sql` | model | transform (LEFT JOIN) | `data/dbt/models/intermediate/int_synonyms.sql` | exact |
| `data/dbt/seeds/dedup_decisions.csv` | seed | batch | `data/dbt/seeds/occurrence_synonyms.csv` | exact |
| `data/dbt/seeds/schema.yml` (add entry) | config | — | `data/dbt/seeds/schema.yml` (existing entries) | exact |
| `data/checklist_dedup.py` | service | batch / file-I/O | `data/resolve_taxon_ids.py` + `data/resolve_checklist_names.py` | exact (gate function) + role-match (CSV writer) |
| `data/tests/test_checklist_dedup.py` | test | — | `data/tests/test_resolution_gate.py` + `data/tests/test_resolve_checklist_names.py` | exact |

---

## Pattern Assignments

### `data/dbt/models/intermediate/int_checklist_collapsed.sql` (model, GROUP BY transform)

**Analog:** `data/dbt/models/intermediate/int_combined.sql` (materialization config) + verified DuckDB GROUP BY pattern

**Materialization config** (`int_combined.sql` line 11 — use TABLE not view for expensive base):
```sql
{{ config(materialized='table') }}
```

**ref() input pattern** (`stg_checklist__records_full.sql` lines 1-43 — the dedup INPUT):
```sql
FROM {{ ref('stg_checklist__records_full') }}
```

**Columns available from `stg_checklist__records_full`** (lines 19-43 of that file):
- `ObjectID`, `verbatim_name`, `canonical_name`, `lat`, `lon`
- `year`, `month`, `day`, `date_quality`, `recordedBy`
- `locality`, `family`, `coord_flag`, `taxon_id`
- No `collapsed_count` column exists yet — this is the new column.

**GROUP BY survivor pattern with `collapsed_count`** (D-03 / D-04):
```sql
{{ config(materialized='table') }}

SELECT
    MIN(ObjectID)         AS ObjectID,
    canonical_name,
    lat,
    lon,
    year,
    month,
    day,
    date_quality,
    -- D-03: NULL recordedBy rows must NOT collapse together.
    -- Use COALESCE so each NULL-collector row forms its own group.
    -- (Two NULL-collector rows at same site are NOT confirmed duplicates.)
    COALESCE(recordedBy, CAST(MIN(ObjectID) AS VARCHAR))  AS recordedBy,
    MIN(verbatim_name)    AS verbatim_name,
    MIN(locality)         AS locality,
    MIN(family)           AS family,
    MIN(coord_flag)       AS coord_flag,
    MIN(taxon_id)         AS taxon_id,
    COUNT(*)              AS collapsed_count    -- D-04: group size; 1 if unique
FROM {{ ref('stg_checklist__records_full') }}
GROUP BY canonical_name, lat, lon, year, month, day, date_quality,
         COALESCE(recordedBy, CAST(ObjectID AS VARCHAR))
```

NOTE: The `COALESCE(recordedBy, CAST(ObjectID AS VARCHAR))` expression in the GROUP BY must match the SELECT expression exactly (DuckDB requires this). Use `MIN(ObjectID)` in the SELECT but the raw `ObjectID` in GROUP BY's COALESCE — or use a CTE to add the coalesced key first.

---

### `data/dbt/models/intermediate/int_dedup_candidates.sql` (model, spatial join)

**Analogs:**
- `data/dbt/models/marts/occurrences.sql` lines 24-42 — `ST_Point(lon, lat)` convention (NOT for `ST_Distance_Sphere`; see CRITICAL note below)
- `data/dbt/models/intermediate/int_combined.sql` lines 11, 47 — TABLE materialization, `ref()` chaining
- `data/dbt/models/intermediate/int_ecdysis_base.sql` lines 7-26 — Ecdysis source columns

**CRITICAL pitfall — axis order** (`136-RESEARCH.md` Pitfall 1):
The rest of the codebase uses `ST_Point(lon, lat)` for `ST_Within`. `ST_Distance_Sphere` requires `ST_Point(lat, lon)` — **latitude first**. These are INCONSISTENT. Any SQL using `ST_Distance_Sphere` must use `ST_Point(lat, lon)`.

**Materialization** (TABLE — expensive spatial join, materialize once):
```sql
{{ config(materialized='table') }}
```

**Ecdysis columns** (from `int_ecdysis_base.sql` lines 7-26):
```sql
-- Available from int_ecdysis_base:
-- ecdysis_id (INTEGER), ecdysis_lon (DOUBLE), ecdysis_lat (DOUBLE)
-- event_date (VARCHAR, as ecdysis_date alias), year (INTEGER), month (INTEGER)
-- recordedBy (VARCHAR), canonical_name (VARCHAR)
-- NOTE: there is NO day column — derive from event_date via TRY_CAST
```

**Core candidate join pattern** (D-05 through D-08 from RESEARCH.md):
```sql
{{ config(materialized='table') }}

-- D-07: 1.0 km proximity threshold (tunable constant).
-- CRITICAL: ST_Distance_Sphere uses ST_Point(lat, lon) — lat FIRST.
-- This is the OPPOSITE of ST_Point(lon, lat) used elsewhere for ST_Within.
-- Verified 2026-06-08: wrong axis order silently produces ~59km for 1 deg lat
-- instead of the correct ~111km.

WITH ecdysis_dated AS (
    SELECT
        ecdysis_id,
        ecdysis_lat,
        ecdysis_lon,
        canonical_name,
        year,
        month,
        TRY_CAST(EXTRACT('day' FROM TRY_CAST(event_date AS DATE)) AS INTEGER) AS day,
        event_date,
        recordedBy
    FROM {{ ref('int_ecdysis_base') }}
    WHERE ecdysis_lat IS NOT NULL
      AND ecdysis_lon IS NOT NULL
      AND year IS NOT NULL
      AND month IS NOT NULL        -- D-06: exclude year-only / NULL Ecdysis dates
      AND event_date IS NOT NULL
)
SELECT
    (CAST(cl.ObjectID AS VARCHAR) || '|' || CAST(ec.ecdysis_id AS VARCHAR)) AS pair_key,
    cl.ObjectID   AS checklist_ObjectID,
    ec.ecdysis_id,
    cl.canonical_name,
    cl.lat        AS checklist_lat,
    cl.lon        AS checklist_lon,
    ec.ecdysis_lat,
    ec.ecdysis_lon,
    -- CRITICAL: ST_Distance_Sphere expects ST_Point(lat, lon), not ST_Point(lon, lat)
    ST_Distance_Sphere(
        ST_Point(cl.lat, cl.lon),
        ST_Point(ec.ecdysis_lat, ec.ecdysis_lon)
    )             AS distance_m,
    cl.year       AS checklist_year,
    cl.month      AS checklist_month,
    cl.day        AS checklist_day,
    cl.date_quality,
    ec.event_date AS ecdysis_date,
    ec.year       AS ecdysis_year,
    ec.month      AS ecdysis_month,
    ec.day        AS ecdysis_day,
    cl.recordedBy AS checklist_collector,
    ec.recordedBy AS ecdysis_collector
FROM {{ ref('int_checklist_collapsed') }} cl
JOIN ecdysis_dated ec
    ON  cl.canonical_name = ec.canonical_name   -- exact accepted-name match
    AND cl.date_quality = 'full'                 -- D-06: must filter on date_quality, not just year IS NOT NULL
    AND cl.year = ec.year
    AND cl.month = ec.month
    AND (
        cl.day IS NULL
        OR ec.day IS NULL
        OR cl.day = ec.day                       -- D-06: day required only when both present
    )
    AND cl.lat IS NOT NULL
    AND cl.lon IS NOT NULL
    AND ABS(cl.lat - ec.ecdysis_lat) <= 0.012   -- bounding box prefilter (advisory)
    AND ABS(cl.lon - ec.ecdysis_lon) <= 0.016
    AND ST_Distance_Sphere(
            ST_Point(cl.lat, cl.lon),
            ST_Point(ec.ecdysis_lat, ec.ecdysis_lon)
        ) <= 1000.0                              -- D-07: DEDUP_DISTANCE_THRESHOLD_M
-- D-05: collector token-set match applied in Python (checklist_dedup.py _collectors_match)
-- int_dedup_candidates carries raw collector strings; Python filters on write
```

---

### `data/dbt/models/intermediate/int_checklist_dedup_status.sql` (model, LEFT JOIN)

**Analog:** `data/dbt/models/intermediate/int_synonyms.sql` (lines 1-22) — exact match

**Pattern from `int_synonyms.sql` lines 1-22:**
```sql
-- int_synonyms uses `materialized='view'` — appropriate for a joinable status view
{{ config(materialized='view') }}

-- LEFT JOIN pattern: ref() to both the base table and the seed
SELECT synonym, accepted_name, source FROM {{ ref('occurrence_synonyms') }}
UNION ALL
SELECT a.synonym, a.accepted_name, a.source
FROM {{ ref('auto_synonyms') }} a
LEFT JOIN {{ ref('occurrence_synonyms') }} m ON m.synonym = a.synonym
WHERE m.synonym IS NULL
```

**Apply to `int_checklist_dedup_status.sql`** — expose `dedup_status` on the collapsed set via LEFT JOIN through candidates to seed:
```sql
{{ config(materialized='view') }}

-- Exposes dedup_status on each collapsed checklist record (D-01/D-03).
-- NULL dedup_status = unreviewed candidate or no candidate at all.
-- 'confirmed' = at least one pair confirmed by curator (D-08: ANY confirmed suppresses).
-- Phase 137 filters: WHERE dedup_status IS DISTINCT FROM 'confirmed'
SELECT
    cl.*,
    CASE
        WHEN bool_or(dd.dedup_status = 'confirmed')
             OVER (PARTITION BY cl.ObjectID)
        THEN 'confirmed'
        ELSE MAX(dd.dedup_status) OVER (PARTITION BY cl.ObjectID)
    END AS dedup_status
FROM {{ ref('int_checklist_collapsed') }} cl
LEFT JOIN {{ ref('int_dedup_candidates') }} cand
    ON cand.checklist_ObjectID = cl.ObjectID
LEFT JOIN {{ ref('dedup_decisions') }} dd
    ON dd.pair_key = cand.pair_key
```

---

### `data/dbt/seeds/dedup_decisions.csv` (seed, committed curator data)

**Analog:** `data/dbt/seeds/occurrence_synonyms.csv` (lines 1-2) — exact match

**Pattern from `occurrence_synonyms.csv`:**
```csv
synonym,accepted_name,source
agapostemon texanus,agapostemon subtilior,Portman et al. 2024
```

**Apply to `dedup_decisions.csv`** — header-only initial commit; same column count discipline:
```csv
pair_key,dedup_status,note
```

The `pair_key` format is `"<ObjectID>|<ecdysis_id>"` as a VARCHAR string (D-02). The `note` column is free-text curator rationale (optional but encouraged per RESEARCH Pattern 3).

---

### `data/dbt/seeds/schema.yml` (add entry for `dedup_decisions`)

**Analog:** `data/dbt/seeds/schema.yml` lines 1-54 — exact structure

**Pattern from `schema.yml` lines 3-14 (`occurrence_synonyms` entry):**
```yaml
version: 2

seeds:
  - name: occurrence_synonyms
    columns:
      - name: synonym
        data_tests:
          - not_null
          - unique
      - name: accepted_name
        data_tests:
          - not_null
      - name: source
        description: "Citation for the synonymy decision (e.g., 'Portman et al. 2024')"
```

**Apply to `schema.yml`** — add after the last existing seed entry:
```yaml
  - name: dedup_decisions
    description: "Curator-confirmed cross-source deduplication decisions (Phase 136 / D-01). pair_key = '<ObjectID>|<ecdysis_id>'. Unreviewed pairs have no row; only 'confirmed' suppresses a point."
    columns:
      - name: pair_key
        description: "Composite key: '<checklist ObjectID>|<ecdysis_id>' — human-readable, stable (D-02)."
        data_tests:
          - not_null
          - unique
      - name: dedup_status
        data_tests:
          - not_null
          - accepted_values:
              values: ['confirmed', 'rejected']
      - name: note
        description: "Free-text curator rationale for the decision."
```

---

### `data/checklist_dedup.py` (service, batch / file-I/O)

**Analogs:**
- `data/resolve_taxon_ids.py` lines 1-110 — module structure, path constants, `_csv_safe()`, `check_resolution_gate()` gate function
- `data/resolve_checklist_names.py` lines 1-60 — module-level constants pattern, `AUDIT_CSV` path, CSV writer structure

**Module-level path constants** (copy from `resolve_taxon_ids.py` lines 34-47 and `resolve_checklist_names.py` lines 37-43):
```python
import csv
import os
import re
from pathlib import Path

import duckdb

DB_PATH = os.environ.get("DB_PATH", str(Path(__file__).parent / "beeatlas.duckdb"))

DEDUP_CANDIDATE_CSV = Path(__file__).parent / "dedup_candidate_pairs.csv"
DEDUP_DECISIONS_CSV = Path(__file__).parent / "dbt" / "seeds" / "dedup_decisions.csv"

# D-07: 1.0 km proximity threshold (tunable named constant).
DEDUP_DISTANCE_THRESHOLD_M = 1000.0
```

**`_csv_safe()` — copy verbatim** from `resolve_taxon_ids.py` lines 63-80 (identical copy also in `resolve_checklist_names.py` lines 51-60):
```python
_CSV_FORMULA_TRIGGERS = ("=", "+", "-", "@")

def _csv_safe(value: object) -> object:
    """Neutralize CSV formula-injection for a single cell (WR-03).

    If a string value begins with a spreadsheet formula trigger (=+-@), prefix it
    with a single quote so a spreadsheet treats it as literal text. Non-strings
    (e.g. integer taxon IDs) pass through unchanged.
    """
    if isinstance(value, str) and value.startswith(_CSV_FORMULA_TRIGGERS):
        return "'" + value
    return value
```

**`check_dedup_gate()` — copy structure from `check_resolution_gate()`** (`resolve_taxon_ids.py` lines 83-110):
```python
def check_resolution_gate() -> None:
    """Fail fast if any bee canonical_name is unresolved before dbt build (D-02)."""
    import sys

    rows_as_dicts = list(csv.DictReader(UNRESOLVED_CSV.open(newline="")))
    blocking = [r for r in rows_as_dicts if r["canonical_name"] not in KNOWN_NON_BEES]
    if blocking:
        names = ", ".join(r["canonical_name"] for r in blocking)
        sys.exit(
            f"resolution-gate: {len(blocking)} bee name(s) unresolved before dbt build. "
            f"Fix with: DB_PATH={DB_PATH} uv run python resolve_taxon_ids.py --refresh-lineage\n"
            f"Offenders: {names}"
        )
    print(
        f"resolution-gate: OK ({len(rows_as_dicts)} known non-bee rows excluded)"
    )
```

The gate for Phase 136 (`check_dedup_gate()`) should follow the same shape: read both CSVs, find confirmed decisions whose `pair_key` no longer appears in the regenerated candidates, call `sys.exit()` with an actionable message naming the orphans, otherwise print `"dedup-gate: OK"`.

**`write_dedup_candidates()` — CSV writer pattern** (from `resolve_checklist_names.py` lines 37-60 structure + RESEARCH Pattern 4):

The writer queries `dbt_sandbox.int_dedup_candidates`, applies `_collectors_match()` in Python (D-05), and writes `dedup_candidate_pairs.csv`. Use `csv.DictWriter` with `_csv_safe()` applied per cell, matching the `resolve_taxon_ids.py` / `resolve_checklist_names.py` write convention.

**Collector normalization — NET-NEW, no existing analog** (D-05):

No collector normalizer exists in the codebase (`canonical_name.py`'s `normalize_scientific_name()` normalizes taxa, not people — confirmed at lines 73-100). The token-set + initials-awareness logic is entirely net-new Python. Implement as two private helpers `_normalize_collector()` and `_collectors_match()` in `checklist_dedup.py`. The algorithm design is in RESEARCH.md Pattern 2 (lines 322-364).

---

### `run.py` (modification — add imports + STEPS entry)

**Analog:** `data/run.py` lines 30-48 (import block) + lines 84-109 (STEPS list)

**Import block pattern** (lines 30-48):
```python
from resolve_taxon_ids import resolve_taxon_ids, check_resolution_gate, generate_inactive_remaps, check_inactive_gate
```
Add analogously:
```python
from checklist_dedup import write_dedup_candidates, check_dedup_gate
```

**STEPS insertion pattern** (lines 84-109):

The current STEPS list is:
```python
("dbt-build", _run_dbt_build),
("generate-sqlite", generate_sqlite_export),
```

The new steps must run AFTER `dbt-build` (candidates require the built `dbt_sandbox.int_dedup_candidates`) and BEFORE `generate-sqlite`. Following the gate pattern of `("resolution-gate", check_resolution_gate)` immediately after its producer step:

```python
("dbt-build", _run_dbt_build),
("dedup-candidates", write_dedup_candidates),   # DUP-02: write dedup_candidate_pairs.csv
("dedup-gate", check_dedup_gate),               # DUP-03: assert no orphaned confirmed pairs
("generate-sqlite", generate_sqlite_export),
```

---

### `data/tests/test_checklist_dedup.py` (test)

**Analog:** `data/tests/test_resolution_gate.py` (lines 1-67) — exact structure for gate tests
**Analog:** `data/tests/test_resolve_checklist_names.py` lines 65-138 — isolated DuckDB fixture pattern

**File header pattern** (from `test_resolution_gate.py` lines 1-14):
```python
"""Wave-0 resolution-gate failure-path tests (D-02, D-09).

Tests pin the behavior of check_resolution_gate() and KNOWN_NON_BEES defined in
resolve_taxon_ids.py (added by Task 2). Both tests are RED until Task 2 lands ...
"""

import csv
import pytest
import resolve_taxon_ids as r
```

**Gate test pattern** (from `test_resolution_gate.py` lines 28-67):
```python
def _write_csv(tmp_path, rows):
    """Write a lineage_unresolved.csv with header 'canonical_name' and given rows."""
    csv_path = tmp_path / "lineage_unresolved.csv"
    with csv_path.open("w", newline="") as f:
        writer = csv.writer(f)
        writer.writerow(["canonical_name"])
        for name in rows:
            writer.writerow([name])
    return csv_path


def test_gate_blocks_unresolved_bee(tmp_path, monkeypatch):
    """..."""
    csv_path = _write_csv(tmp_path, [bee_name])
    monkeypatch.setattr(r, "UNRESOLVED_CSV", csv_path)

    with pytest.raises(SystemExit) as excinfo:
        r.check_resolution_gate()

    assert bee_name in str(excinfo.value)


def test_gate_allows_known_non_bees_only(tmp_path, monkeypatch, capsys):
    """..."""
    monkeypatch.setattr(r, "UNRESOLVED_CSV", csv_path)
    r.check_resolution_gate()
    captured = capsys.readouterr()
    assert "resolution-gate: OK" in captured.out
```

**Isolated DuckDB fixture pattern** (from `test_resolve_checklist_names.py` lines 65-138):
```python
@pytest.fixture
def checklist_resolver_db(tmp_path, monkeypatch):
    """Isolated DuckDB fixture for resolve_checklist_names tests."""
    db_path = str(tmp_path / "checklist_resolver.duckdb")
    monkeypatch.setenv("DB_PATH", db_path)

    import resolve_checklist_names
    importlib.reload(resolve_checklist_names)

    # Zero pacing and redirect file outputs to tmp_path.
    monkeypatch.setattr(resolve_checklist_names, "_GBIF_PACE_SECONDS", 0.0)
    monkeypatch.setattr(resolve_checklist_names, "AUDIT_CSV", tmp_path / "audit.csv")

    # Seed minimal DB schema.
    con = duckdb.connect(db_path)
    con.execute("CREATE SCHEMA checklist_data")
    con.execute("""CREATE TABLE checklist_data.checklist_records_full (...) """)
```

**Apply to `test_checklist_dedup.py`:**
- For DUP-01/DUP-02 SQL tests: create an isolated in-memory DuckDB (no `fixture_db` session fixture needed — avoids the 38-schema setup), load spatial (`con.execute("INSTALL spatial; LOAD spatial")`), create minimal `stg_checklist__records_full`-shaped tables, execute the SQL from `int_checklist_collapsed` and `int_dedup_candidates` as raw SQL against those tables.
- For gate tests (DUP-03): use `tmp_path` + `monkeypatch` to write synthetic CSVs and patch `checklist_dedup.DEDUP_CANDIDATE_CSV` / `checklist_dedup.DEDUP_DECISIONS_CSV`, mirroring `test_resolution_gate.py` exactly.
- For collector normalization (D-05): pure Python unit tests, no DB needed.
- Spatial load pattern (from `conftest.py` lines 545-565 — applies to any NEW connection that needs spatial):
```python
con = duckdb.connect(":memory:")
con.execute("INSTALL spatial; LOAD spatial")
```

---

## Shared Patterns

### `_csv_safe()` formula-injection guard
**Source:** `data/resolve_taxon_ids.py` lines 63-80 (canonical copy); identical in `data/resolve_checklist_names.py` lines 51-60
**Apply to:** `data/checklist_dedup.py` — copy verbatim; apply to every string cell written to `dedup_candidate_pairs.csv` (collector names from source data may contain `=`, `+`, `-`, `@`).

### DB_PATH module-level constant
**Source:** `data/resolve_taxon_ids.py` line 34; `data/resolve_checklist_names.py` line 37
**Apply to:** `data/checklist_dedup.py`
```python
DB_PATH = os.environ.get("DB_PATH", str(Path(__file__).parent / "beeatlas.duckdb"))
```

### dbt `{{ config(materialized='table') }}` for intermediate joins
**Source:** `data/dbt/models/intermediate/int_combined.sql` line 11
**Apply to:** `int_checklist_collapsed.sql` (expensive GROUP BY), `int_dedup_candidates.sql` (expensive spatial join). Use `materialized='view'` only for `int_checklist_dedup_status.sql` (cheap LEFT JOIN over already-materialized tables — mirrors `int_synonyms.sql` line 8).

### `sys.exit()` fail-fast gate
**Source:** `data/resolve_taxon_ids.py` lines 100-110
**Apply to:** `check_dedup_gate()` in `data/checklist_dedup.py` — same pattern: collect offenders, `sys.exit(f"dedup-gate: {len(orphans)} ...")`, else `print("dedup-gate: OK ...")`.

### `monkeypatch.setattr` path redirection in tests
**Source:** `data/tests/test_resolve_checklist_names.py` lines 98-115; `data/tests/test_resolution_gate.py` lines 37-38
**Apply to:** `data/tests/test_checklist_dedup.py` — use `monkeypatch.setattr(checklist_dedup, "DEDUP_CANDIDATE_CSV", ...)` and `monkeypatch.setattr(checklist_dedup, "DEDUP_DECISIONS_CSV", ...)` to redirect gate function file reads to `tmp_path`.

### `importlib.reload()` for module-level constant isolation
**Source:** `data/tests/test_resolve_checklist_names.py` lines 94-95
**Apply to:** `data/tests/test_checklist_dedup.py` for any test that needs `DB_PATH` redirection — `monkeypatch.setenv("DB_PATH", ...)` then `importlib.reload(checklist_dedup)`.

---

## No Analog Found

| File | Role | Data Flow | Reason |
|------|------|-----------|--------|
| `_normalize_collector()` / `_collectors_match()` in `checklist_dedup.py` | utility (Python) | transform | No collector normalizer exists. `canonical_name.py:normalize_scientific_name()` normalizes taxa, not people. Token-set with initials-awareness (`J Smith` ≈ `John Smith`) is entirely net-new. Implement per RESEARCH.md Pattern 2 lines 322-364. |

---

## Metadata

**Analog search scope:** `data/dbt/models/intermediate/`, `data/dbt/models/staging/`, `data/dbt/models/marts/`, `data/dbt/seeds/`, `data/tests/`, `data/resolve_taxon_ids.py`, `data/resolve_checklist_names.py`, `data/canonical_name.py`, `data/run.py`, `data/tests/conftest.py`
**Files read:** 14 source files
**Pattern extraction date:** 2026-06-08
