# Phase 127: Inactive Taxon Remapping - Pattern Map

**Mapped:** 2026-05-31
**Files analyzed:** 9 new/modified files
**Analogs found:** 9 / 9

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `data/resolve_taxon_ids.py` (extend) | service | request-response + CRUD | `data/resolve_taxon_ids.py` itself | self (extend in-place) |
| `data/run.py` (modify STEPS) | orchestrator | batch | `data/run.py` itself | self (modify in-place) |
| `data/dbt/models/intermediate/int_synonyms.sql` | dbt model | transform | `data/dbt/models/intermediate/int_species_universe.sql` | role-match (CTE UNION pattern) |
| `data/dbt/models/intermediate/int_combined.sql` (×2 repoints) | dbt model | transform | self | self (modify in-place) |
| `data/dbt/models/staging/stg_checklist__species.sql` (×1 repoint) | dbt model | transform | self | self (modify in-place) |
| `data/dbt/models/intermediate/int_species_universe.sql` (×1 repoint) | dbt model | transform | self | self (modify in-place) |
| `data/dbt/seeds/schema.yml` (add auto_synonyms entry) | dbt config | config | `data/dbt/seeds/schema.yml` itself | self (modify in-place) |
| `data/dbt/dbt_project.yml` (add auto_synonyms seed config) | dbt config | config | `data/dbt/dbt_project.yml` itself | self (modify in-place) |
| `data/.gitignore` (add 2 paths) | config | config | `data/.gitignore` itself | self (modify in-place) |
| `data/tests/test_inactive_remap.py` (new) | test | batch | `data/tests/test_resolution_gate.py` + `data/tests/test_resolve_taxon_ids.py` | role-match |

---

## Pattern Assignments

### `data/resolve_taxon_ids.py` — extend with `generate_inactive_remaps()` and `check_inactive_gate()`

**Analog:** `data/resolve_taxon_ids.py` itself (extend in-place, D-13)

**Module-level constants pattern** (lines 19-21 — copy and add new paths alongside):
```python
DB_PATH = os.environ.get("DB_PATH", str(Path(__file__).parent / "beeatlas.duckdb"))
UNRESOLVED_CSV = Path(__file__).parent / "lineage_unresolved.csv"
INAT_TAXA_URL = "https://api.inaturalist.org/v1/taxa"
```
Add after line 21:
```python
AUTO_SYNONYMS_CSV = Path(__file__).parent / "dbt/seeds/auto_synonyms.csv"
INACTIVE_UNRESOLVED_CSV = Path(__file__).parent / "inactive_unresolved.csv"
INAT_TAXA_ID_URL = "https://api.inaturalist.org/v1/taxa/{}"
```

**`check_inactive_gate()` — mirror `check_resolution_gate()` exactly** (lines 30-52):
```python
def check_resolution_gate() -> None:
    """Fail fast if any bee canonical_name is unresolved before dbt build (D-02).

    Reads lineage_unresolved.csv (written by the resolve-taxon-ids step).
    Any row whose canonical_name is NOT in KNOWN_NON_BEES is a blocking bee name:
    exits non-zero with an actionable message naming the offenders and the fix command.
    If only KNOWN_NON_BEES rows remain, prints an OK line reporting the excluded count
    (D-09: excluded rows are reported, not silently dropped).
    """
    import sys  # noqa: PLC0415 (lazy import keeps module importable without side-effects)

    rows_as_dicts = list(csv.DictReader(UNRESOLVED_CSV.open(newline="")))
    blocking = [r for r in rows_as_dicts if r["canonical_name"] not in KNOWN_NON_BEES]
    if blocking:
        names = ", ".join(r["canonical_name"] for r in blocking)
        sys.exit(
            f"resolution-gate: {len(blocking)} bee name(s) unresolved before dbt build. "
            f"Fix with: uv run python resolve_taxon_ids.py --refresh-lineage\n"
            f"Offenders: {names}"
        )
    print(  # noqa: T201
        f"resolution-gate: OK ({len(rows_as_dicts)} known non-bee rows excluded)"
    )
```
`check_inactive_gate()` copies this structure: `csv.DictReader` on `INACTIVE_UNRESOLVED_CSV`, partition blocking, `sys.exit(actionable message)` on any rows, `print("inactive-gate: OK ...")` otherwise. No KNOWN_NON_BEES equivalent — all rows are blocking.

**Bridge UPSERT pattern** (lines 216-227 in `_resolve_one` — the D-10 shape to reuse):
```python
con.execute(
    """
    INSERT INTO inaturalist_data.canonical_to_taxon_id
        (canonical_name, taxon_id, resolved_at, source)
    VALUES (?, ?, current_timestamp, ?)
    ON CONFLICT (canonical_name) DO UPDATE SET
        taxon_id = EXCLUDED.taxon_id,
        resolved_at = EXCLUDED.resolved_at,
        source = EXCLUDED.source
    """,
    [canonical_name, match["id"], source],
)
```
For D-10 substitute `[lower_successor_name, successor_taxon_id, f"inat-inactive-remap:{inactive_taxon_id}"]`.

**Inactive-enumeration query pattern** (lines 258-266 — detection query to move into `generate_inactive_remaps()`):
```python
taxa_path = str(Path(__file__).parent / "raw/taxa.csv.gz")
inactive = con.execute(f"""
    SELECT b.canonical_name, b.taxon_id, t.name AS inat_name, t.active
    FROM inaturalist_data.canonical_to_taxon_id b
    LEFT JOIN read_csv('{taxa_path}', header=True) t
        ON CAST(t.taxon_id AS INTEGER) = b.taxon_id
    WHERE t.active = false
    ORDER BY b.canonical_name
""").fetchall()
```
Note: `header=True` only — no `columns=` — so `active` is auto-inferred as BOOLEAN and `WHERE t.active = false` works (Pitfall 2).

**Paced API call pattern** (lines 198-206 in `_resolve_one` — copy for taxon-detail fetch):
```python
time.sleep(_INAT_PACE_SECONDS)
try:
    resp = _inat_get_with_retry(INAT_TAXA_URL, params=params, timeout=30)
except requests.HTTPError:
    last_reason = "api_error"
    continue
```
For taxon-detail: `_inat_get_with_retry(INAT_TAXA_ID_URL.format(inactive_taxon_id), params={}, timeout=30)` — `params={}` is required (positional arg, Pitfall 6).

**CSV write pattern** (lines 247-250 — `UNRESOLVED_CSV` write; copy for both output files):
```python
with UNRESOLVED_CSV.open("w", newline="") as f:
    writer = csv.writer(f)
    writer.writerow(["canonical_name", "reason", "attempted_at"])
    writer.writerows(unresolved)
```
`auto_synonyms.csv` uses `csv.writer` with `["synonym", "accepted_name", "source"]` header — always write header even when `auto_rows` is empty (D-04).
`inactive_unresolved.csv` uses `csv.DictWriter` with fieldnames `["canonical_name", "inactive_taxon_id", "inat_name", "reason", "attempted_at"]` (D-06).

**Remove lines 258-273** from `resolve_taxon_ids()` (the existing inactive-reporting block) — these become the detection basis for `generate_inactive_remaps()` and leaving them creates confusing double-reporting against a stale dump (RESEARCH open question 1, recommendation: remove).

---

### `data/run.py` — add two STEPS entries

**Analog:** `data/run.py` itself (lines 84-107)

**STEPS pattern** (lines 84-107 — the list to modify):
```python
STEPS: list[tuple[str, Callable]] = [
    ...
    ("resolve-taxon-ids", lambda: resolve_taxon_ids(refresh=_REFRESH_LINEAGE)),
    ("resolution-gate", check_resolution_gate),       # D-02: fail fast on unresolved bee names
    ("taxa-download", download_taxa_csv),
    ("taxon-lineage-extended", load_taxon_lineage_extended),
    ...
]
```
After `taxa-download` and before `taxon-lineage-extended`, insert:
```python
    ("inactive-remap", generate_inactive_remaps),    # NEW: detect + auto-remap inactive taxa
    ("inactive-gate", check_inactive_gate),          # NEW: hard-fail on unresolvable inactives
```

**Import line to add** (after line 37 — mirrors the `check_resolution_gate` import):
```python
from resolve_taxon_ids import resolve_taxon_ids, check_resolution_gate
```
Extend to:
```python
from resolve_taxon_ids import resolve_taxon_ids, check_resolution_gate, generate_inactive_remaps, check_inactive_gate
```

---

### `data/dbt/models/intermediate/int_synonyms.sql` (NEW)

**Analog:** `data/dbt/models/intermediate/int_species_universe.sql` (UNION + CTE structure); `data/dbt/models/staging/stg_checklist__species.sql` (materialized='view' for a pass-through/combining model)

**Materialization pattern** from `stg_checklist__species.sql` (line 10):
```sql
{{ config(materialized='view') }}
```
`int_synonyms` is a pure view — no need for table materialization (no spatial joins on top of it; the consumers are already tables).

**UNION ALL + ANTI JOIN pattern** (synthesized from RESEARCH.md D-02 and verified SQL idiom):
```sql
-- data/dbt/models/intermediate/int_synonyms.sql
-- Manual entries take precedence over auto entries when synonym matches (ITR-04).
-- Anti-join on synonym column: manual wins by exclusion of matching auto rows.
{{ config(materialized='view') }}

SELECT synonym, accepted_name, source FROM {{ ref('occurrence_synonyms') }}
UNION ALL
SELECT a.synonym, a.accepted_name, a.source
FROM {{ ref('auto_synonyms') }} a
LEFT JOIN {{ ref('occurrence_synonyms') }} m ON m.synonym = a.synonym
WHERE m.synonym IS NULL
```
The ANTI JOIN (`LEFT JOIN ... WHERE m.synonym IS NULL`) is the only new pattern in this codebase. The `ref()` macro usage matches the existing `stg_checklist__species.sql` style.

---

### `data/dbt/models/intermediate/int_combined.sql` — repoint ×2

**Lines to change** (53 and 169 — verbatim search-and-replace):

Line 53:
```sql
LEFT JOIN {{ ref('occurrence_synonyms') }} syn_e ON syn_e.synonym = e.canonical_name
```
→
```sql
LEFT JOIN {{ ref('int_synonyms') }} syn_e ON syn_e.synonym = e.canonical_name
```

Line 169:
```sql
LEFT JOIN {{ ref('occurrence_synonyms') }} syn_io ON syn_io.synonym = io.canonical_name
```
→
```sql
LEFT JOIN {{ ref('int_synonyms') }} syn_io ON syn_io.synonym = io.canonical_name
```

The JOIN shape (`COALESCE(syn_e.accepted_name, e.canonical_name)` at lines 43 and 161) is unchanged.

---

### `data/dbt/models/staging/stg_checklist__species.sql` — repoint ×1

**Line to change** (line 31):
```sql
LEFT JOIN {{ ref('occurrence_synonyms') }} syn ON syn.synonym = s.canonical_name
```
→
```sql
LEFT JOIN {{ ref('int_synonyms') }} syn ON syn.synonym = s.canonical_name
```

The `COALESCE(syn.accepted_name, s.canonical_name)` at line 17 is unchanged.

---

### `data/dbt/models/intermediate/int_species_universe.sql` — repoint ×1

**Line to change** (line 61, inside `inat_obs_count_agg` CTE):
```sql
LEFT JOIN {{ ref('occurrence_synonyms') }} syn ON syn.synonym = io.canonical_name
```
→
```sql
LEFT JOIN {{ ref('int_synonyms') }} syn ON syn.synonym = io.canonical_name
```

The `COALESCE(syn.accepted_name, io.canonical_name)` at line 58 is unchanged.

---

### `data/dbt/seeds/schema.yml` — add `auto_synonyms` entry

**Analog:** `data/dbt/seeds/schema.yml` (lines 4-14 — the existing `occurrence_synonyms` seed entry):
```yaml
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
Add after the `occurrence_synonyms` block (same indentation, same structure):
```yaml
  - name: auto_synonyms
    columns:
      - name: synonym
        data_tests:
          - not_null
          - unique
      - name: accepted_name
        data_tests:
          - not_null
      - name: source
        description: "Auto-generated: 'inat-inactive-remap:{inactive_taxon_id}'"
```
The `unique` test on `synonym` is correct — auto-remap writes at most one row per canonical_name (one inactive taxon, one successor); manual precedence removes duplicates in `int_synonyms`, but the seed itself should also have unique synonyms.

---

### `data/dbt/dbt_project.yml` — add `auto_synonyms` seed column_types

**Analog:** `data/dbt/dbt_project.yml` (lines 23-27 — the existing `occurrence_synonyms` seeds section):
```yaml
seeds:
  beeatlas:
    occurrence_synonyms:
      +column_types:
        synonym: varchar
        accepted_name: varchar
        source: varchar
```
Add the `auto_synonyms` block at the same level:
```yaml
    auto_synonyms:
      +column_types:
        synonym: varchar
        accepted_name: varchar
        source: varchar
```

---

### `data/.gitignore` — add two paths

**Analog:** `data/.gitignore` (lines 12-15 — existing `lineage_unresolved.csv` and `raw/taxa.csv.gz` entries):
```
# Pipeline writeback files — regenerated each run, not version-controlled
checklist_unmatched.csv
lineage_unresolved.csv
raw/taxa.csv.gz
raw/taxa.csv.gz.tmp
raw/taxa_cache.json
```
Add two lines to the `# Pipeline writeback files` block:
```
inactive_unresolved.csv
dbt/seeds/auto_synonyms.csv
```
The gitignore entry for `auto_synonyms.csv` must be `dbt/seeds/auto_synonyms.csv` (relative to `data/`), not just `auto_synonyms.csv` — matching the path-relative convention already used for `raw/taxa.csv.gz` (Pitfall 5).

---

### `data/tests/test_inactive_remap.py` (NEW)

**Analog:** `data/tests/test_resolution_gate.py` (gate test structure) + `data/tests/test_resolve_taxon_ids.py` (fixture + mock pattern)

**Fixture pattern** from `test_resolve_taxon_ids.py` lines 48-87 (`resolver_db` fixture — the canonical template):
```python
@pytest.fixture
def resolver_db(tmp_path, monkeypatch):
    db_path = str(tmp_path / "resolver.duckdb")
    monkeypatch.setenv("DB_PATH", db_path)

    import inaturalist_pipeline
    importlib.reload(inaturalist_pipeline)
    monkeypatch.setattr(inaturalist_pipeline, "_INAT_PACE_SECONDS", 0.0)
    monkeypatch.setattr(inaturalist_pipeline, "_INAT_BACKOFF_BASE_SECONDS", 0.0)

    import resolve_taxon_ids
    importlib.reload(resolve_taxon_ids)
    monkeypatch.setattr(resolve_taxon_ids, "_INAT_PACE_SECONDS", 0.0)
    monkeypatch.setattr(resolve_taxon_ids, "UNRESOLVED_CSV", tmp_path / "lineage_unresolved.csv")

    con = duckdb.connect(db_path)
    con.execute("CREATE SCHEMA inaturalist_data")
    # ... seed schemas
    con.close()
    return db_path, resolve_taxon_ids
```
New `inactive_remap_db` fixture extends this: also monkeypatches `AUTO_SYNONYMS_CSV` and `INACTIVE_UNRESOLVED_CSV` to `tmp_path`, and pre-seeds the bridge with a synthetic inactive taxon (taxon_id=99000 → `active=false`).

**MINI_TAXA_TSV fixture pattern** from `test_taxa_pipeline.py` lines 27-39:
```python
MINI_TAXA_TSV = (
    "taxon_id\tancestry\trank_level\trank\tname\tactive\n"
    "630955\t...\t57\tsuperfamily\tAnthophila\ttrue\n"
    ...
)
```
For inactive-remap tests:
```python
MINI_TAXA_TSV_WITH_INACTIVE = (
    "taxon_id\tancestry\trank_level\trank\tname\tactive\n"
    "99001\t48460/1/.../630955\t10\tspecies\tBombus newspecies\ttrue\n"
    "99000\t48460/1/.../630955\t10\tspecies\tBombus oldspecies\tfalse\n"
)
```
Written as a gzipped file at `tmp_path / "raw/taxa.csv.gz"` (matching the `taxa_path` computed in `generate_inactive_remaps()`).

**Mock response factory pattern** from `test_resolve_taxon_ids.py` lines 14-22:
```python
def _fake_taxa_search_response(results: list[dict]) -> MagicMock:
    resp = MagicMock()
    resp.status_code = 200
    resp.headers = {}
    resp.raise_for_status = MagicMock()
    resp.json.return_value = {"total_results": len(results), "results": results}
    return resp
```
For taxon-detail endpoint, the `results` list contains dicts with `current_synonymous_taxon_ids`:
```python
def _fake_taxon_detail_response(successor_ids: list[int] | None) -> MagicMock:
    resp = MagicMock()
    resp.status_code = 200
    resp.headers = {}
    resp.raise_for_status = MagicMock()
    resp.json.return_value = {
        "results": [{"current_synonymous_taxon_ids": successor_ids}]
    }
    return resp
```

**Mock patch target** from `test_resolve_taxon_ids.py` line 116-118 — always patch at the `requests.get` boundary:
```python
with patch("inaturalist_pipeline.requests.get", side_effect=responses) as mock_get:
    mod.resolve_taxon_ids()
```

**Gate test pattern** from `test_resolution_gate.py` lines 28-44:
```python
def test_gate_blocks_unresolved_bee(tmp_path, monkeypatch):
    csv_path = _write_csv(tmp_path, [bee_name])
    monkeypatch.setattr(r, "UNRESOLVED_CSV", csv_path)

    with pytest.raises(SystemExit) as excinfo:
        r.check_resolution_gate()

    assert bee_name in str(excinfo.value)
```
`test_inactive_gate_blocks` copies this: writes rows to `INACTIVE_UNRESOLVED_CSV`, asserts `SystemExit`, checks `canonical_name` in message.

**Pre-existing test failure note:** The `resolver_db` fixture does NOT create `dbt_sandbox.occurrence_synonyms`, causing 16 tests in `test_resolve_taxon_ids.py` to fail (`CatalogException`). The new `inactive_remap_db` fixture must NOT call `resolve_taxon_ids()` — test `generate_inactive_remaps()` in isolation (option b from RESEARCH Pitfall 4). If fixing the pre-existing failures is in scope, add `dbt_sandbox` schema + `occurrence_synonyms` table creation to the `resolver_db` fixture.

---

## Shared Patterns

### DuckDB connection open/close pattern
**Source:** `data/resolve_taxon_ids.py` lines 240-275
**Apply to:** `generate_inactive_remaps()`
```python
con = duckdb.connect(DB_PATH)
try:
    # ... work ...
finally:
    con.close()
```
Always use `try/finally` with `con.close()`.

### Lazy `import sys` in gate functions
**Source:** `data/resolve_taxon_ids.py` line 39
**Apply to:** `check_inactive_gate()`
```python
import sys  # noqa: PLC0415 (lazy import keeps module importable without side-effects)
```

### `print()` with `# noqa: T201` for pipeline step output
**Source:** `data/resolve_taxon_ids.py` lines 50, 254, 267
**Apply to:** `generate_inactive_remaps()`, `check_inactive_gate()`
```python
print(  # noqa: T201
    f"inactive-remap: {len(auto_rows)} auto-remapped, {len(triage_rows)} unresolved"
)
```

### `dbt seed` column_types enforcement
**Source:** `data/dbt/dbt_project.yml` lines 22-27
**Apply to:** `auto_synonyms` seed registration
All three seed columns (`synonym`, `accepted_name`, `source`) must be declared `varchar` in `dbt_project.yml` seeds section to prevent DuckDB from inferring numeric types from the header-only CSV.

---

## No Analog Found

No files in this phase lack a codebase analog. All patterns have direct predecessors.

---

## Metadata

**Analog search scope:** `data/resolve_taxon_ids.py`, `data/run.py`, `data/dbt/models/intermediate/`, `data/dbt/models/staging/`, `data/dbt/seeds/`, `data/dbt/dbt_project.yml`, `data/.gitignore`, `data/tests/`
**Files scanned:** 12
**Pattern extraction date:** 2026-05-31
