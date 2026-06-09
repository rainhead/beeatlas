# Phase 135: Name Reconciliation - Pattern Map

**Mapped:** 2026-06-04
**Files analyzed:** 9 new/modified artifacts
**Analogs found:** 9 / 9

---

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|
| `data/resolve_checklist_names.py` | service | batch / request-response | `data/resolve_taxon_ids.py` (`generate_inactive_remaps`, `check_resolution_gate`) | exact |
| `data/dbt/seeds/gbif_checklist_synonyms.csv` | config / seed | batch | `data/dbt/seeds/auto_synonyms.csv` + `occurrence_synonyms.csv` | exact |
| `data/checklist_name_resolution_audit.csv` | data / committed artifact | batch | `data/lineage_unresolved.csv` writer in `resolve_taxon_ids.py` | role-match |
| `data/checklist_fuzzy_review.csv` | data / committed artifact | batch | `data/inactive_unresolved.csv` writer in `resolve_taxon_ids.py` | role-match |
| `data/dbt/tests/assert_no_anthophila_homonyms.sql` | dbt test | transform | `data/dbt/tests/test_higher_rank_taxon_ids_name_rank_unique.sql` | exact |
| `data/tests/test_resolve_checklist_names.py` | test | batch | `data/tests/test_resolve_taxon_ids.py` | exact |
| `data/checklist_pipeline.py` (remove `reconcile()`) | service | CRUD | same file — `_update_occurrences_canonical_name` pattern (kept) vs `reconcile` (removed) | self |
| `data/dbt/models/intermediate/int_synonyms.sql` (add third UNION arm) | dbt model | transform | same file — existing two-arm UNION ALL + anti-join | self |
| `data/dbt/models/staging/stg_checklist__records_full.sql` | dbt model | transform | `data/dbt/models/staging/stg_checklist__species.sql` | exact |

---

## Pattern Assignments

### `data/resolve_checklist_names.py` (service, batch)

**Analog:** `data/resolve_taxon_ids.py`

**Imports pattern** (lines 1–24):
```python
import csv
import datetime as dt
import os
import time
from pathlib import Path

import duckdb

from canonical_name import normalize_scientific_name

DB_PATH = os.environ.get("DB_PATH", str(Path(__file__).parent / "beeatlas.duckdb"))
AUDIT_CSV = Path(__file__).parent / "checklist_name_resolution_audit.csv"
FUZZY_REVIEW_CSV = Path(__file__).parent / "checklist_fuzzy_review.csv"
GBIF_SEED_CSV = Path(__file__).parent / "dbt/seeds/gbif_checklist_synonyms.csv"
```
Copy the `os.environ.get("DB_PATH", ...)` idiom and `Path(__file__).parent / ...` path constants verbatim. The `from canonical_name import normalize_scientific_name` import is required before any name matching.

**`--refresh`-style flag pattern** (`resolve_taxon_ids.py` lines 489–516):

The main entry-point function takes a `refresh: bool = False` parameter and is a **no-op when `refresh=False`**. The `if __name__ == "__main__"` block reads from `sys.argv`:
```python
def resolve_checklist_names(refresh: bool = False) -> None:
    """One-time GBIF lookup for unresolved checklist names. No-op unless refresh=True."""
    if not refresh:
        return

    con = duckdb.connect(DB_PATH)
    try:
        ...
    finally:
        con.close()

if __name__ == "__main__":
    import sys
    resolve_checklist_names(refresh="--refresh-checklist" in sys.argv)
```
The `run.py` wiring mirrors the `_REFRESH_LINEAGE` pattern (look for the `if __name__ == "__main__"` block at line 513):
```python
_REFRESH_CHECKLIST = "--refresh-checklist" in sys.argv
("resolve-checklist-names", lambda: resolve_checklist_names(refresh=_REFRESH_CHECKLIST)),
```

**`check_resolution_gate()` pattern** (lines 60–83): The gate reads a committed CSV, filters for blocking rows, and calls `sys.exit()` with an actionable message. Copy the exact lazy-import of `sys`, the `csv.DictReader` read, and the `sys.exit(f"...: {len(blocking)} name(s)...\nOffenders: {names}")` message format:
```python
def check_checklist_resolution_gate() -> None:
    import sys  # noqa: PLC0415
    rows = list(csv.DictReader(AUDIT_CSV.open(newline="")))
    blocking = [r for r in rows if r["source"] == "unresolved"]
    if blocking:
        names = ", ".join(r["canonical_name"] for r in blocking[:10])
        sys.exit(
            f"checklist-resolution-gate: {len(blocking)} name(s) have no match "
            f"in any tier.\nOffenders: {names}"
        )
    print(f"checklist-resolution-gate: OK ({len(rows)} names resolved)")  # noqa: T201
```

**CSV writer pattern** (lines 250–263): Always write the header even when the row list is empty (`D-04` in `generate_inactive_remaps`). Use `_csv_safe()` on each cell:
```python
# Always write header even if rows is empty:
with AUDIT_CSV.open("w", newline="") as f:
    writer = csv.writer(f)
    writer.writerow(["verbatim_name", "canonical_name", "resolved_taxon_id",
                     "accepted_canonical_name", "source", "confidence",
                     "gbif_match_type", "notes"])
    writer.writerows(tuple(_csv_safe(v) for v in r) for r in audit_rows)
```

**`_csv_safe()` helper** (lines 46–57): Copy this verbatim — it neutralizes CSV formula injection (`=`, `+`, `-`, `@`) in spreadsheet-facing CSVs:
```python
_CSV_FORMULA_TRIGGERS = ("=", "+", "-", "@")

def _csv_safe(value: object) -> object:
    if isinstance(value, str) and value.startswith(_CSV_FORMULA_TRIGGERS):
        return "'" + value
    return value
```

**`generate_inactive_remaps()` as template for GBIF refresh loop** (lines 85–271): The structure is `con = duckdb.connect(DB_PATH)` → try/finally → query unresolved names → loop with `time.sleep(PACE)` per call → collect result rows → write CSVs after loop → `print(f"step: N done, M unresolved")` summary. Apply this exact loop structure to the GBIF refresh:
```python
# Rate pacing — match the existing pattern:
_GBIF_PACE_SECONDS = 0.3

for canonical_name in unresolved_names:
    time.sleep(_GBIF_PACE_SECONDS)
    try:
        result = pygbif.species.name_backbone(
            scientificName=canonical_name,
            kingdom='Animalia',
            verbose=True,
        )
    except Exception:
        audit_rows.append((..., 'unresolved', 0.0, 'ERROR', ''))
        continue

    diag = result.get('diagnostics', {})
    match_type = diag.get('matchType', 'NONE')
    usage = result.get('usage', {})   # ABSENT when matchType='NONE' — always .get()
    accepted_canonical = (usage.get('canonicalName') or '').lower() or None
    ...
```

**`normalize_scientific_name()` call pattern** (`checklist_pipeline.py` lines 127–159): Call on distinct values, build a mapping, apply via loop — not row-by-row inline:
```python
rows = con.execute("""
    SELECT DISTINCT verbatim_name
    FROM checklist_data.checklist_records_full
    WHERE verbatim_name IS NOT NULL
""").fetchall()
mapping = [(normalize_scientific_name(r[0]), r[0]) for r in rows]
```
Slash compounds must be detected on the raw `verbatim_name` BEFORE calling `normalize_scientific_name()`. Detection: `'/' in verbatim_name`.

---

### `data/dbt/seeds/gbif_checklist_synonyms.csv` (config/seed, batch)

**Analogs:** `data/dbt/seeds/occurrence_synonyms.csv` (column contract) and `data/dbt/seeds/auto_synonyms.csv` (generated seed pattern)

**Column contract from `occurrence_synonyms.csv` (line 1)**:
```csv
synonym,accepted_name,source
```
The three-column contract (`synonym`, `accepted_name`, `source`) is the shared contract for all synonym seeds consumed by `int_synonyms`. The new seed adds provenance columns but the first three columns must be identical to plug into the existing UNION.

**Extended header for `gbif_checklist_synonyms.csv`**:
```csv
synonym,accepted_name,source,gbif_usage_key,gbif_match_type,gbif_confidence
```
`int_synonyms` only selects `synonym, accepted_name, source`; the extra columns are seed-level metadata ignored by the view.

**`schema.yml` entry to add** (pattern from `data/dbt/seeds/schema.yml` lines 1–26): Each seed needs `not_null` + `unique` tests on `synonym` and `not_null` on `accepted_name`. The `source` column gets a description:
```yaml
  - name: gbif_checklist_synonyms
    columns:
      - name: synonym
        data_tests:
          - not_null
          - unique
      - name: accepted_name
        data_tests:
          - not_null
      - name: source
        description: "Auto-generated GBIF backbone match: 'gbif-backbone:{usage_key}'"
```

**Always-write-header pattern** (`generate_inactive_remaps` lines 249–255): Even when the GBIF lookup finds no synonyms, write the CSV with header only so the seed is always loadable by dbt.

---

### `data/checklist_name_resolution_audit.csv` + `data/checklist_fuzzy_review.csv` (data artifacts, batch)

**Analog:** `data/lineage_unresolved.csv` writer (lines 497–501) and `data/inactive_unresolved.csv` writer (lines 256–263) in `resolve_taxon_ids.py`

**Writer pattern for `lineage_unresolved.csv`** (lines 497–501):
```python
with UNRESOLVED_CSV.open("w", newline="") as f:
    writer = csv.writer(f)
    writer.writerow(["canonical_name", "reason", "attempted_at"])
    writer.writerows(unresolved)
```

**Writer pattern for `inactive_unresolved.csv`** (lines 256–263): Uses `csv.DictWriter` when the row dict has named fields:
```python
with INACTIVE_UNRESOLVED_CSV.open("w", newline="") as f:
    fieldnames = ["canonical_name", "inactive_taxon_id", "inat_name", "reason", "attempted_at"]
    writer = csv.DictWriter(f, fieldnames=fieldnames)
    writer.writeheader()
    writer.writerows(
        {k: _csv_safe(v) for k, v in r.items()} for r in triage_rows
    )
```

Use `csv.DictWriter` for the audit CSV (8 named columns) and wrap each value with `_csv_safe()`. The fuzzy-review CSV is simpler (5 columns); either writer style works.

**Audit CSV column contract** (from RESEARCH.md §RCN-02):
```python
fieldnames = [
    "verbatim_name", "canonical_name", "resolved_taxon_id",
    "accepted_canonical_name", "source", "confidence",
    "gbif_match_type", "notes",
]
```

**Fuzzy-review CSV column contract** (from RESEARCH.md §RCN-04):
```python
fieldnames = [
    "verbatim_name", "canonical_name", "fuzzy_candidate",
    "fuzzy_score", "fuzzy_candidate_taxon_id",
]
```

---

### `data/dbt/tests/assert_no_anthophila_homonyms.sql` (dbt test, transform)

**Analog:** `data/dbt/tests/test_higher_rank_taxon_ids_name_rank_unique.sql` (lines 1–7)

The existing pattern for a "fail-if-any-row" dbt singular test:
```sql
-- Singular test: (name, rank) is unique in stg_inat__higher_rank_taxon_ids.
-- Fails (returns rows) if any (name, rank) combination appears more than once.
SELECT name, rank, COUNT(*) AS cnt
FROM {{ ref('stg_inat__higher_rank_taxon_ids') }}
GROUP BY name, rank
HAVING COUNT(*) > 1
```

Apply the same `GROUP BY ... HAVING COUNT(*) > 1` zero-row assertion pattern to canonical names in `int_combined`. Reference via `{{ ref(...) }}`, not `source(...)`, for DAG lineage. The `{{ config(severity='warn') }}` override from `test_lin05_lineage_coverage.sql` (line 23) is available if a hard-fail is too strict — but RCN-07 demands a hard-fail, so omit `severity='warn'`.

**Target pattern for `assert_no_anthophila_homonyms.sql`**:
```sql
-- Singular dbt test: RCN-07 — no canonical_name within Anthophila maps to >1 taxon_id.
-- Anthophila ancestor taxon_id = 630955 (verified from taxa.csv.gz).
-- Returns rows (fails build) if any canonical_name is ambiguous.
WITH anthophila_ids AS (
    SELECT CAST(t.taxon_id AS INTEGER) AS taxon_id
    FROM read_csv('{{ env_var("TAXA_PATH") }}', header=True, delim='\t') t
    WHERE t.ancestry LIKE '%/630955/%'
      AND t.active = 'true'
),
multi_taxon AS (
    SELECT
        c.canonical_name,
        COUNT(DISTINCT c.taxon_id) AS taxon_id_count
    FROM {{ ref('int_combined') }} c
    WHERE c.taxon_id IS NOT NULL
      AND c.taxon_id IN (SELECT taxon_id FROM anthophila_ids)
    GROUP BY c.canonical_name
    HAVING COUNT(DISTINCT c.taxon_id) > 1
)
SELECT * FROM multi_taxon
```
Note: inspect how other tests in this project reference `taxa.csv.gz` (the existing `generate_inactive_remaps` uses a `taxa_path` string variable built in Python, not a dbt env_var). The planner should choose the access pattern that fits the dbt execution context — direct `read_csv()` with a dbt variable or a pre-seeded staging model.

---

### `data/tests/test_resolve_checklist_names.py` (test, batch)

**Analog:** `data/tests/test_resolve_taxon_ids.py`

**Test file structure** (lines 1–88): The entire file is the template. Key fixtures and conventions:

**Module-level mock helpers** (lines 14–45):
```python
def _fake_taxa_search_response(results: list[dict]) -> MagicMock:
    resp = MagicMock()
    resp.status_code = 200
    resp.raise_for_status = MagicMock()
    resp.json.return_value = {"total_results": len(results), "results": results}
    return resp
```
For the checklist tests, there is no `requests.get` to mock — instead mock `pygbif.species.name_backbone`. Build an equivalent helper:
```python
def _fake_gbif_response(match_type: str, canonical_name: str | None = None,
                         confidence: int = 99) -> dict:
    if match_type == 'NONE':
        return {'diagnostics': {'matchType': 'NONE', 'confidence': 0}, 'synonym': False}
    return {
        'usage': {'canonicalName': canonical_name, 'key': '12345', 'status': 'ACCEPTED'},
        'diagnostics': {'matchType': match_type, 'confidence': confidence},
        'synonym': False,
    }
```

**Isolated DuckDB fixture** (lines 48–87): The `resolver_db` fixture creates a `tmp_path / "resolver.duckdb"`, patches `DB_PATH` via `monkeypatch.setenv("DB_PATH", db_path)`, and reloads the module. Copy this approach; for `resolve_checklist_names.py` there is no `_INAT_PACE_SECONDS` to patch but the GBIF pace constant needs to be zeroed:
```python
@pytest.fixture
def checklist_resolver_db(tmp_path, monkeypatch):
    db_path = str(tmp_path / "checklist_resolver.duckdb")
    monkeypatch.setenv("DB_PATH", db_path)
    import resolve_checklist_names
    importlib.reload(resolve_checklist_names)
    monkeypatch.setattr(resolve_checklist_names, "_GBIF_PACE_SECONDS", 0.0)
    monkeypatch.setattr(resolve_checklist_names, "AUDIT_CSV",
                        tmp_path / "audit.csv")
    monkeypatch.setattr(resolve_checklist_names, "FUZZY_REVIEW_CSV",
                        tmp_path / "fuzzy_review.csv")
    monkeypatch.setattr(resolve_checklist_names, "GBIF_SEED_CSV",
                        tmp_path / "gbif_checklist_synonyms.csv")
    con = duckdb.connect(db_path)
    con.execute("CREATE SCHEMA checklist_data")
    # ... seed minimal checklist_records_full rows
    con.close()
    return tmp_path, resolve_checklist_names
```

**No-op test pattern** (analog: `test_second_run_makes_no_api_calls`, lines 277–295): Test that `resolve_checklist_names(refresh=False)` makes zero GBIF calls:
```python
def test_noop_without_refresh(checklist_resolver_db, monkeypatch):
    tmp_path, mod = checklist_resolver_db
    import pygbif
    with patch.object(pygbif.species, "name_backbone") as mock_gbif:
        mod.resolve_checklist_names(refresh=False)
    assert mock_gbif.call_count == 0
```

**LCA test** — pure-function, no DuckDB needed:
```python
def test_slash_lca_is_subgenus_not_genus():
    """RCN-05: texanus/angelicus LCA is 606634 (subgenus), NOT 50086 (genus)."""
    from resolve_checklist_names import compute_lca
    # Minimal taxa dict with preloaded ancestry paths (no file I/O in unit test)
    taxa = {
        'agapostemon angelicus': {'taxon_id': 270393,
                                   'ancestry': '48460/1/47120/372739/630955/52747/50086/606634'},
        'agapostemon texanus':   {'taxon_id': 1581468,
                                   'ancestry': '48460/1/47120/372739/630955/52747/50086/606634/1581466'},
    }
    assert compute_lca('agapostemon angelicus', 'agapostemon texanus', taxa) == 606634
```

**Gate test** (analog: `check_resolution_gate` tested implicitly via unresolved CSV content): Write a known audit CSV with one `unresolved` row and assert `sys.exit` is called.

**Test for `test_canonical_name.py` additions** (analog: `test_canonicalize_*` pure-function tests, lines 21–171): Any new normalization edge cases for authority strip on checklist verbatim names go in this file as pure-function tests — no fixture needed.

---

### `data/checklist_pipeline.py` — retire `reconcile()` and `SYNONYMS_PATH` (service, CRUD)

**Analog:** The `_update_occurrences_canonical_name()` function in the same file (lines 127–159) shows the "kept" pattern. The `reconcile()` function (lines 162–221) is what gets removed.

**What to remove:**
- `SYNONYMS_PATH` constant (line 28)
- `UNMATCHED_PATH` constant (line 29)  
- `reconcile()` function body (lines 162–221)
- Call site `reconcile(con)` in `load_checklist()` (line 439)

**`load_checklist()` after removal** — the function tail should read:
```python
        _load_checklist_records(con)
        _load_checklist_records_full(con)
        _update_occurrences_canonical_name(con)
        # reconcile() removed per D-07: checklist synonym resolution now flows
        # through occurrence_synonyms / int_synonyms (RCN-06).
    finally:
        con.close()
```

**Adding `canonical_name` column to `_load_checklist_records_full()`**: Follow the `_update_occurrences_canonical_name` pattern (lines 127–159) — call `normalize_scientific_name()` on distinct values, build a mapping, then apply. For slash compounds, apply LCA resolution before normalizing. The `CREATE OR REPLACE TABLE` schema (lines 324–340) must gain a `canonical_name VARCHAR` column so the column is always fresh on re-run (avoids the `ALTER TABLE ADD COLUMN IF NOT EXISTS` pitfall):
```python
con.execute("""
    CREATE OR REPLACE TABLE checklist_data.checklist_records_full (
        ObjectID BIGINT,
        family VARCHAR,
        genus VARCHAR,
        verbatim_name VARCHAR,
        canonical_name VARCHAR,   -- NEW: normalize_scientific_name(verbatim_name)
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
```

---

### `data/dbt/models/intermediate/int_synonyms.sql` — add third UNION arm (dbt model, transform)

**Analog:** The file itself (current content, all 16 lines)

**Current pattern** (`int_synonyms.sql` lines 8–16): The anti-join pattern where `occurrence_synonyms` always wins over `auto_synonyms`:
```sql
{{ config(materialized='view') }}

SELECT synonym, accepted_name, source FROM {{ ref('occurrence_synonyms') }}
UNION ALL
SELECT a.synonym, a.accepted_name, a.source
FROM {{ ref('auto_synonyms') }} a
LEFT JOIN {{ ref('occurrence_synonyms') }} m ON m.synonym = a.synonym
WHERE m.synonym IS NULL
```

**Third arm to add**: Same anti-join — `occurrence_synonyms` wins over `gbif_checklist_synonyms`. The new arm also anti-joins against `auto_synonyms` so a manual entry supersedes both auto sources:
```sql
UNION ALL
SELECT g.synonym, g.accepted_name, g.source
FROM {{ ref('gbif_checklist_synonyms') }} g
LEFT JOIN {{ ref('occurrence_synonyms') }} m ON m.synonym = g.synonym
LEFT JOIN {{ ref('auto_synonyms') }} a ON a.synonym = g.synonym
WHERE m.synonym IS NULL
  AND a.synonym IS NULL
```

---

### `data/dbt/models/staging/stg_checklist__records_full.sql` (dbt model, transform)

**Analog:** `data/dbt/models/staging/stg_checklist__species.sql` (all 31 lines)

**`stg_checklist__species.sql` core pattern** (lines 10–31): `{{ config(materialized='view') }}`, source reference, `LEFT JOIN {{ ref('int_synonyms') }}` on `synonym = s.canonical_name`, `COALESCE(syn.accepted_name, ...)` to apply the synonym:
```sql
{{ config(materialized='view') }}

SELECT
    COALESCE(syn.accepted_name, s.canonical_name) AS canonical_name,
    ...
FROM {{ source('checklist_data', 'species') }} s
LEFT JOIN {{ ref('int_synonyms') }} syn ON syn.synonym = s.canonical_name
```

**`stg_checklist__records_full.sql` will follow the same shape** but references `checklist_records_full` (which must be added to `sources.yml`) and also JOINs `stg_inat__canonical_to_taxon_id` to resolve `taxon_id`:
```sql
{{ config(materialized='view') }}

SELECT
    cr.ObjectID,
    cr.verbatim_name,
    COALESCE(syn.accepted_name, cr.canonical_name) AS canonical_name,
    cr.latitude    AS lat,
    cr.longitude   AS lon,
    cr.year,
    cr.month,
    cr.day,
    cr.date_quality,
    cr.recordedBy,
    cr.locality,
    cr.family,
    cr.coord_flag,
    COALESCE(ctt.taxon_id, g.taxon_id)::INTEGER AS taxon_id
FROM {{ source('checklist_data', 'checklist_records_full') }} cr
LEFT JOIN {{ ref('int_synonyms') }} syn
    ON syn.synonym = cr.canonical_name
LEFT JOIN {{ ref('stg_inat__canonical_to_taxon_id') }} ctt
    ON ctt.canonical_name = COALESCE(syn.accepted_name, cr.canonical_name)
LEFT JOIN {{ ref('stg_inat__genus_taxon_ids') }} g
    ON ctt.taxon_id IS NULL
   AND position(' ' IN COALESCE(syn.accepted_name, cr.canonical_name)) = 0
   AND g.genus_name = COALESCE(syn.accepted_name, cr.canonical_name)
WHERE cr.coord_flag = 'valid'
```

**`sources.yml` addition required** (Pitfall 8 from RESEARCH.md): Add `checklist_records_full` to the `checklist_data` source block in `data/dbt/models/sources.yml` lines 24–29:
```yaml
  - name: checklist_data
    schema: checklist_data
    tables:
      - name: species
      - name: species_counties
      - name: checklist_records
      - name: checklist_records_full   # NEW: Phase 135
```

---

## Shared Patterns

### Resolution gate (fail fast on blocking rows)
**Source:** `data/resolve_taxon_ids.py` lines 60–83 (`check_resolution_gate()`)
**Apply to:** `resolve_checklist_names.py` `check_checklist_resolution_gate()`

Pattern: lazy `import sys`, `csv.DictReader` read from committed CSV, filter for blocking rows, `sys.exit(f"gate: {len} name(s)...\nOffenders: {names}")`, else `print("gate: OK")`.

### CSV write with formula-injection guard
**Source:** `data/resolve_taxon_ids.py` lines 46–57 (`_csv_safe()`), lines 250–263
**Apply to:** all CSV writers in `resolve_checklist_names.py`

Copy `_csv_safe()` verbatim. Wrap every cell in every curator-facing CSV (audit, fuzzy-review, GBIF seed) with `_csv_safe()`.

### Always-write-header seed pattern
**Source:** `data/resolve_taxon_ids.py` line 250 comment ("D-04: always write header, even when auto_rows is empty")
**Apply to:** `gbif_checklist_synonyms.csv` writer in `resolve_checklist_names.py`

```python
GBIF_SEED_CSV.parent.mkdir(parents=True, exist_ok=True)
with GBIF_SEED_CSV.open("w", newline="") as f:
    writer = csv.writer(f)
    writer.writerow(["synonym", "accepted_name", "source",
                     "gbif_usage_key", "gbif_match_type", "gbif_confidence"])
    writer.writerows(...)
```

### `duckdb.connect(DB_PATH)` try/finally close
**Source:** `resolve_taxon_ids.py` lines 490–510, `checklist_pipeline.py` lines 363–441
**Apply to:** all DuckDB-using functions in `resolve_checklist_names.py`

```python
con = duckdb.connect(DB_PATH)
try:
    ...
finally:
    con.close()
```

### Anti-join precedence in `int_synonyms`
**Source:** `data/dbt/models/intermediate/int_synonyms.sql` lines 10–16
**Apply to:** the new third UNION arm in `int_synonyms.sql`

`occurrence_synonyms` (curated) beats `auto_synonyms` (iNat inactive remap) beats `gbif_checklist_synonyms` (GBIF auto). Each lower-priority arm anti-joins against all higher-priority arms using `WHERE m.synonym IS NULL`.

### Isolated DuckDB fixture in tests
**Source:** `data/tests/test_resolve_taxon_ids.py` lines 48–87 (`resolver_db` fixture)
**Apply to:** `data/tests/test_resolve_checklist_names.py`

Use `tmp_path / "checklist_resolver.duckdb"`, `monkeypatch.setenv("DB_PATH", ...)`, `importlib.reload(module)`, and `monkeypatch.setattr(mod, "AUDIT_CSV", tmp_path / "audit.csv")` to redirect all file writes into `tmp_path`. This avoids the `dbt_sandbox` dependency (18 pre-existing failures that are out of scope per Deferred).

### `source` precedence in `int_synonyms` test
**Source:** `data/tests/test_canonical_name.py` lines 148–170 (`test_apply_synonym_*`)
**Apply to:** RCN-06 test in `data/tests/test_checklist_pipeline.py`

The `test_apply_synonym_loads_agapostemon_from_csv` test (line 162) monkeypatches `_SYNONYMS = None` to force a re-read from disk, confirming the seed file content. Apply the same inspection approach to assert that `reconcile()` is absent from `load_checklist()` using `inspect.getsource()`.

---

## No Analog Found

All files have analogs in the existing codebase. No greenfield patterns required.

---

## Metadata

**Analog search scope:** `data/resolve_taxon_ids.py`, `data/checklist_pipeline.py`, `data/canonical_name.py`, `data/dbt/models/intermediate/int_synonyms.sql`, `data/dbt/models/staging/stg_checklist__species.sql`, `data/dbt/seeds/occurrence_synonyms.csv`, `data/dbt/seeds/auto_synonyms.csv`, `data/dbt/seeds/schema.yml`, `data/dbt/models/sources.yml`, `data/dbt/tests/*.sql`, `data/tests/test_resolve_taxon_ids.py`, `data/tests/test_canonical_name.py`
**Files scanned:** 12
**Pattern extraction date:** 2026-06-04
