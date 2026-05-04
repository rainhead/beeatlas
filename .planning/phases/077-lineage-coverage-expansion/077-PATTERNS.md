# Phase 77: Lineage Coverage Expansion — Pattern Map

**Mapped:** 2026-05-03
**Files analyzed:** 6 (2 new, 4 modified)
**Analogs found:** 6 / 6

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `data/resolve_taxon_ids.py` (NEW) | pipeline-step (HTTP-driven enricher + DDL + CSV writer) | request-response (per-name) + persistence (UPSERT) + file-I/O | `data/inaturalist_pipeline.py::enrich_taxon_lineage_extended` | exact (role + data flow) |
| `data/tests/test_resolve_taxon_ids.py` (NEW) | test (pytest, mocks `requests.get`) | request-response (mocked) | `data/tests/test_taxon_lineage_extended.py` | exact |
| `data/inaturalist_pipeline.py` (MODIFIED — `enrich_taxon_lineage_extended`) | pipeline-step (UNION-arm SQL edit) | persistence (DuckDB read) | self (lines 203-213 — surgical edit to existing fn) | self-reference |
| `data/run.py` (MODIFIED — STEPS reorder + new step + `--refresh-lineage`) | orchestration | sequential dispatch | self (lines 33-44, 100-104) | self-reference |
| `data/tests/conftest.py` (MODIFIED — bridge table DDL + 20-row fixture) | test fixture (schema + seed) | persistence (in-memory DuckDB seed) | self (lines 11-272) | self-reference |
| `data/tests/test_taxon_lineage_extended.py` (MODIFIED — add bridge-arm test) | test | request-response | self (lines 108-145 — `test_enrich_unions_both_observation_tables`) | self-reference |

**No separate DDL module is needed** — the bridge table is created via `CREATE TABLE IF NOT EXISTS` inside `resolve_taxon_ids.py`, mirroring how `enrich_taxon_lineage_extended` issues its own `CREATE OR REPLACE TABLE` (no separate migration module exists in the project; `_apply_migrations` in `run.py` is for ALTER-pattern fixups, not table creation).

## Pattern Assignments

### `data/resolve_taxon_ids.py` (NEW — pipeline-step)

**Primary analog:** `data/inaturalist_pipeline.py::enrich_taxon_lineage_extended` (lines 184-262)
**Secondary analog (CSV-write):** `data/checklist_pipeline.py::reconcile` (lines 64-123)

#### Imports pattern (mirror `inaturalist_pipeline.py:1-11` and `checklist_pipeline.py:14-26`)

```python
# data/inaturalist_pipeline.py:1-11
import os
import time
from pathlib import Path
from typing import Any, Dict

import dlt
import duckdb
import requests
from dlt.sources.rest_api import RESTAPIConfig, rest_api_resources

DB_PATH = os.environ.get('DB_PATH', str(Path(__file__).parent / 'beeatlas.duckdb'))
```

```python
# data/checklist_pipeline.py:14-26
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
```

**Apply to `resolve_taxon_ids.py`:**
- Import `_inat_get_with_retry`, `_INAT_PACE_SECONDS` from `inaturalist_pipeline` (do NOT factor a new module — A4 in RESEARCH; researcher recommendation).
- Module-level `DB_PATH` line is identical to `checklist_pipeline.py:22`.
- Module-level `UNRESOLVED_CSV = Path(__file__).parent / "lineage_unresolved.csv"` — mirrors `UNMATCHED_PATH` (line 26).

#### DDL pattern — `CREATE TABLE IF NOT EXISTS` for the bridge

**Source for "DDL inside the pipeline step":** `data/inaturalist_pipeline.py:240-249` (`CREATE OR REPLACE TABLE` for `taxon_lineage_extended`).
**Diverge here intentionally:** UPSERT requires `IF NOT EXISTS`, not `OR REPLACE` (LIN-03 cache invariant — see RESEARCH alternatives table line 200-201).

```python
# Pattern source: inaturalist_pipeline.py:240-249 — adapted for IF NOT EXISTS / UPSERT.
con.execute("""
    CREATE TABLE IF NOT EXISTS inaturalist_data.canonical_to_taxon_id (
        canonical_name TEXT PRIMARY KEY,
        taxon_id INTEGER,
        resolved_at TIMESTAMP,
        source TEXT
    )
""")
```

#### "Names to resolve" SQL — FULL OUTER union LEFT JOIN bridge

**Source:** This is new SQL (no exact analog), but the read-rows-into-Python-list shape mirrors `inaturalist_pipeline.py:203-213`:

```python
# data/inaturalist_pipeline.py:203-213
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
```

**Apply to `resolve_taxon_ids.py`:** Replace the inner UNION-of-observations with the canonical_name UNION-of-checklist-and-occurrences LEFT JOIN bridge (RESEARCH §Code Examples lines 481-495).

#### HTTP retry pattern (REUSE — do not duplicate)

**Source:** `data/inaturalist_pipeline.py:22-49` (`_inat_get_with_retry`):

```python
# data/inaturalist_pipeline.py:22-49
def _inat_get_with_retry(url: str, params: dict, *, timeout: int = 30) -> requests.Response:
    """GET with iNat-aware retry on 429 / 5xx; honors Retry-After when present.

    Raises HTTPError on non-retriable status or after _INAT_MAX_RETRIES exhausted.
    Other request exceptions propagate immediately (no retry on connect/timeout —
    those are usually upstream outages and retrying makes the failure mode noisier).
    """
    for attempt in range(_INAT_MAX_RETRIES + 1):
        resp = requests.get(url, params=params, timeout=timeout)
        if resp.status_code != 429 and resp.status_code < 500:
            resp.raise_for_status()
            return resp
        if attempt == _INAT_MAX_RETRIES:
            resp.raise_for_status()
            return resp
        wait = _INAT_BACKOFF_BASE_SECONDS * (2 ** attempt)
        retry_after = resp.headers.get("Retry-After")
        if retry_after:
            try:
                wait = max(wait, float(retry_after))
            except ValueError:
                pass
        print(  # noqa: T201
            f"iNat HTTP {resp.status_code}; sleeping {wait:.1f}s before retry "
            f"{attempt + 1}/{_INAT_MAX_RETRIES}"
        )
        time.sleep(wait)
    raise RuntimeError("unreachable")
```

**Apply to `resolve_taxon_ids.py`:** `from inaturalist_pipeline import _inat_get_with_retry, _INAT_PACE_SECONDS`. Call site:

```python
# Pattern source: inaturalist_pipeline.py:221-229
if i > 0 and _INAT_PACE_SECONDS > 0:
    time.sleep(_INAT_PACE_SECONDS)
batch = taxon_ids[i : i + batch_size]
ids_path = ",".join(map(str, batch))
resp = _inat_get_with_retry(
    f"https://api.inaturalist.org/v2/taxa/{ids_path}",
    params={"fields": "id,name,rank,ancestors.id,ancestors.name,ancestors.rank"},
    timeout=30,
)
```

For Phase 77 the URL changes to `https://api.inaturalist.org/v1/taxa` and params to `{"q": canonical_name, "rank": rank}`. Pacing sleep stays unconditional (Pitfall #3 in RESEARCH).

#### Per-row UPSERT (partial-write safe — diverges from Phase 76's batch `executemany`)

**Source for `executemany` shape we deliberately do NOT copy:** `inaturalist_pipeline.py:250-256` (batch insert).
**Why diverge:** RESEARCH alternatives table (line 202) — at ≤1 req/sec a crash mid-loop should leave a partially-warm cache; per-row UPSERT achieves that, batch does not.

```python
# Pattern source: RESEARCH §Pattern 2, novel SQL (no in-repo analog for ON CONFLICT).
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
    [canonical_name, taxon_id, source],
)
```

#### CSV-writer pattern for `lineage_unresolved.csv`

**Source:** `data/checklist_pipeline.py:113-118` (`reconcile()` writes `checklist_unmatched.csv`):

```python
# data/checklist_pipeline.py:113-118
with UNMATCHED_PATH.open("w", newline="") as f:
    writer = csv.writer(f)
    writer.writerow(["checklist_name", "canonical_name", "reason"])
    for row in unmatched:
        writer.writerow(row)
```

**Apply to `resolve_taxon_ids.py`:** Same shape; header is `["canonical_name", "reason", "attempted_at"]`. Regenerated each run (overwrite mode `"w"`). Mirrors LIN-04.

#### Connection lifecycle (try/finally close)

**Source:** `data/inaturalist_pipeline.py:201-262` and `checklist_pipeline.py:129-202` — both wrap pipeline-step bodies in `con = duckdb.connect(DB_PATH); try: ... finally: con.close()`. New file follows identical shape.

#### Print/log pattern (`# noqa: T201`)

**Source:** `inaturalist_pipeline.py:215, 260` and `checklist_pipeline.py:61, 120-122, 197`. Single trailing `print(...)` summary line with `# noqa: T201` to silence ruff. Phase 77 should print `f"resolve-taxon-ids: {n_resolved} cached, {len(unresolved)} unresolved (see {UNRESOLVED_CSV.name})"`.

---

### `data/tests/test_resolve_taxon_ids.py` (NEW — test file)

**Analog:** `data/tests/test_taxon_lineage_extended.py` (entire file — 377 lines).

#### Module imports + isolated-DB fixture pattern

**Source:** `test_taxon_lineage_extended.py:15-51`:

```python
# data/tests/test_taxon_lineage_extended.py:15-51
from unittest.mock import patch, MagicMock

import duckdb
import pytest


@pytest.fixture
def lineage_db(tmp_path, monkeypatch):
    """Isolated DuckDB with both observation tables present.

    inaturalist_pipeline reads DB_PATH at module import time; we reload the
    module after patching the env so its DB_PATH constant points at the temp DB.
    """
    db_path = str(tmp_path / "lineage.duckdb")
    monkeypatch.setenv("DB_PATH", db_path)
    import importlib
    import inaturalist_pipeline
    importlib.reload(inaturalist_pipeline)
    # Zero pacing/backoff so multi-batch + retry tests stay fast.
    monkeypatch.setattr(inaturalist_pipeline, "_INAT_PACE_SECONDS", 0.0)
    monkeypatch.setattr(inaturalist_pipeline, "_INAT_BACKOFF_BASE_SECONDS", 0.0)

    con = duckdb.connect(db_path)
    con.execute("CREATE SCHEMA inaturalist_data")
    con.execute("CREATE SCHEMA inaturalist_waba_data")
    con.execute("""
        CREATE TABLE inaturalist_data.observations (
            taxon__id BIGINT
        )
    """)
    con.execute("""
        CREATE TABLE inaturalist_waba_data.observations (
            taxon__id BIGINT
        )
    """)
    con.close()
    return db_path, inaturalist_pipeline
```

**Apply to `test_resolve_taxon_ids.py`:**
- Replicate the `tmp_path` + `monkeypatch.setenv("DB_PATH", ...)` + `importlib.reload(...)` shape, but reload `resolve_taxon_ids` (and `inaturalist_pipeline` because `_INAT_PACE_SECONDS` is imported at module-load time — see A4 in RESEARCH).
- Bootstrap schemas `checklist_data`, `ecdysis_data`, `inaturalist_data`; create `species`, `occurrences (canonical_name VARCHAR)`, and let `resolve_taxon_ids._ensure_bridge_table` create the bridge.
- **Important per A4:** ALSO `monkeypatch.setattr(resolve_taxon_ids, "_INAT_PACE_SECONDS", 0.0)` because `from inaturalist_pipeline import _INAT_PACE_SECONDS` snapshots the value at import. Patching only the source module is insufficient.

#### `_fake_inat_response` helper (REUSE shape)

**Source:** `test_taxon_lineage_extended.py:54-61`:

```python
# data/tests/test_taxon_lineage_extended.py:54-61
def _fake_inat_response(taxa: list[dict]) -> MagicMock:
    """Build a MagicMock that mimics requests.Response with a results array."""
    resp = MagicMock()
    resp.status_code = 200
    resp.headers = {}
    resp.raise_for_status = MagicMock()
    resp.json.return_value = {"results": taxa}
    return resp
```

**Apply:** Copy verbatim into `test_resolve_taxon_ids.py`. Wrap responses with `total_results` so `data["total_results"]` works:

```python
def _fake_taxa_search_response(results: list[dict]) -> MagicMock:
    resp = MagicMock()
    resp.status_code = 200
    resp.headers = {}
    resp.raise_for_status = MagicMock()
    resp.json.return_value = {"total_results": len(results), "results": results}
    return resp
```

#### `_throttled_response` helper (REUSE)

**Source:** `test_taxon_lineage_extended.py:289-297`:

```python
# data/tests/test_taxon_lineage_extended.py:289-297
def _throttled_response(status: int = 429, *, retry_after: str | None = None) -> MagicMock:
    """Build a MagicMock requests.Response that raises on raise_for_status()."""
    import requests as _r
    resp = MagicMock()
    resp.status_code = status
    resp.headers = {"Retry-After": retry_after} if retry_after else {}
    err = _r.exceptions.HTTPError(f"{status} for testing", response=resp)
    resp.raise_for_status = MagicMock(side_effect=err)
    return resp
```

**Apply:** Copy verbatim. Used for retry/backoff tests (LIN-02) and for the `'api_error'` unresolved-row path (LIN-04).

#### Mock-the-boundary pattern

**Source:** `test_taxon_lineage_extended.py:88, 167, 197, 313, 350` — every test patches `inaturalist_pipeline.requests.get`, never the helper:

```python
# data/tests/test_taxon_lineage_extended.py:88
with patch("inaturalist_pipeline.requests.get", return_value=_fake_inat_response(fake_taxa)):
    mod.enrich_taxon_lineage_extended(db_path)
```

**Apply to `test_resolve_taxon_ids.py`:** Patch `inaturalist_pipeline.requests.get` (NOT `resolve_taxon_ids.requests.get`) — `resolve_taxon_ids` imports and calls `_inat_get_with_retry`, which calls `requests.get` from `inaturalist_pipeline`'s namespace. RESEARCH Pitfall #4 makes this load-bearing.

#### Side-effect list pattern (multi-call sequencing)

**Source:** `test_taxon_lineage_extended.py:108-130, 308-313` — `side_effect=responses` with a per-call list. Apply to:
- 429 → 429 → 200 retry test (LIN-02).
- "second run = zero new calls" idempotency test (LIN-03): `mock_get.call_count == 0` on second invocation.
- Mixed-name fixture for `_pick_match` ladder (D-02).

#### `_zero_inat_pacing` autouse (already exists — confirm coverage)

**Source:** `data/tests/conftest.py:375-385`:

```python
# data/tests/conftest.py:375-385
@pytest.fixture(autouse=True)
def _zero_inat_pacing(monkeypatch):
    """Zero iNat retry/pacing constants so tests don't real-time-sleep."""
    try:
        import inaturalist_pipeline
    except ImportError:
        return
    monkeypatch.setattr(inaturalist_pipeline, "_INAT_PACE_SECONDS", 0.0, raising=False)
    monkeypatch.setattr(
        inaturalist_pipeline, "_INAT_BACKOFF_BASE_SECONDS", 0.0, raising=False
    )
```

**Apply (per A4):** Extend this fixture in `conftest.py` to also patch the `resolve_taxon_ids` module's local binding once that module exists:

```python
# Extension to add after line 385:
try:
    import resolve_taxon_ids
    monkeypatch.setattr(resolve_taxon_ids, "_INAT_PACE_SECONDS", 0.0, raising=False)
except ImportError:
    pass
```

---

### `data/inaturalist_pipeline.py` (MODIFIED — UNION-arm in `enrich_taxon_lineage_extended`)

**Self-reference:** lines 203-213 of the same file.

#### Current SQL (read-first)

```python
# data/inaturalist_pipeline.py:203-213
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
```

#### Edit (Pitfall #2 fix — additive UNION arm)

```python
# data/inaturalist_pipeline.py — replacement for lines 204-212
taxon_ids = [
    row[0] for row in con.execute("""
        SELECT DISTINCT taxon__id FROM (
            SELECT taxon__id FROM inaturalist_data.observations
            WHERE taxon__id IS NOT NULL
            UNION
            SELECT taxon__id FROM inaturalist_waba_data.observations
            WHERE taxon__id IS NOT NULL
            UNION
            SELECT taxon_id AS taxon__id
            FROM inaturalist_data.canonical_to_taxon_id
            WHERE taxon_id IS NOT NULL
        )
    """).fetchall()
]
```

**Note for planner:** The bridge table may not exist yet on first cold-start of this step — but the STEPS reorder (see `run.py` patterns below) puts `resolve-taxon-ids` (which creates the bridge with `CREATE TABLE IF NOT EXISTS`) before `taxon-lineage-extended`. After reorder, the bridge always exists by the time this query runs. **No defensive `IF EXISTS` guard needed inside the SQL** — the upstream STEPS contract enforces it.

**Update the docstring** on lines 184-198 to mention the bridge-arm. Existing docstring (lines 188-191) lists two source tables — extend to three.

---

### `data/run.py` (MODIFIED — STEPS list + `--refresh-lineage` flag)

**Self-reference:** lines 22-44, 100-104.

#### Current import + STEPS (read-first)

```python
# data/run.py:22-44
from geographies_pipeline import load_geographies
from ecdysis_pipeline import load_ecdysis, load_links
from inaturalist_pipeline import load_observations as load_inaturalist_observations
from inaturalist_pipeline import enrich_taxon_lineage_extended
from waba_pipeline import load_observations as load_waba_observations
from projects_pipeline import load_projects
from anti_entropy_pipeline import run_anti_entropy
from checklist_pipeline import load_checklist
from export import main as export_all
from feeds import main as generate_feeds

STEPS: list[tuple[str, Callable]] = [
    ("ecdysis", load_ecdysis),
    ("ecdysis-links", load_links),
    ("inaturalist", load_inaturalist_observations),
    ("waba", load_waba_observations),
    ("taxon-lineage-extended", enrich_taxon_lineage_extended),
    ("projects", load_projects),
    ("anti-entropy", run_anti_entropy),
    ("checklist", load_checklist),
    ("export", export_all),
    ("feeds", generate_feeds),
]
```

#### Reorder + new step (per RESEARCH §D-06 + Pitfall #2 option A)

Move `("taxon-lineage-extended", ...)` from index 4 to index 9 (after `resolve-taxon-ids`). Add new import + new step:

```python
# data/run.py — replacement around lines 22-44
from checklist_pipeline import load_checklist
from resolve_taxon_ids import resolve_taxon_ids        # NEW
from export import main as export_all
from feeds import main as generate_feeds

STEPS: list[tuple[str, Callable]] = [
    ("ecdysis", load_ecdysis),
    ("ecdysis-links", load_links),
    ("inaturalist", load_inaturalist_observations),
    ("waba", load_waba_observations),
    ("projects", load_projects),
    ("anti-entropy", run_anti_entropy),
    ("checklist", load_checklist),
    ("resolve-taxon-ids", resolve_taxon_ids),                  # NEW
    ("taxon-lineage-extended", enrich_taxon_lineage_extended), # MOVED — runs after bridge
    ("export", export_all),
    ("feeds", generate_feeds),
]
```

**Loop body still calls `fn()` with zero args** (line 104). The `--refresh-lineage` flag therefore needs a wrapper, not a positional arg:

#### `--refresh-lineage` flag pattern

**Source:** `data/inaturalist_pipeline.py:266-267`:

```python
# data/inaturalist_pipeline.py:266-267
if __name__ == "__main__":
    import sys
    load_observations(full_reload="--full-reload" in sys.argv)
```

**Apply (recommended, per RESEARCH §D-06 option A):** in `run.py`, replace the bare `("resolve-taxon-ids", resolve_taxon_ids)` tuple with a closure that captures the flag at module load:

```python
# data/run.py — near line 14 (after imports)
import sys
_REFRESH_LINEAGE = "--refresh-lineage" in sys.argv

# In STEPS list:
("resolve-taxon-ids", lambda: resolve_taxon_ids(refresh=_REFRESH_LINEAGE)),
```

**Alternative shape considered:** parse argv inside `main()` and thread the flag through. Reject — wider blast radius (every step would need to accept kwargs). Researcher's recommendation is "(A) sys.argv substring match — minimal lift" (RESEARCH line 175).

---

### `data/tests/conftest.py` (MODIFIED — bridge table + 20-row fixture)

**Self-reference:** lines 11-145 (`_create_schemas` + `_create_tables`), lines 148-350 (`_seed_data`), lines 375-385 (`_zero_inat_pacing`).

#### Existing schema/table creation pattern

```python
# data/tests/conftest.py:11-17 (schemas)
def _create_schemas(con: duckdb.DuckDBPyConnection) -> None:
    con.execute("CREATE SCHEMA geographies")
    con.execute("CREATE SCHEMA ecdysis_data")
    con.execute("CREATE SCHEMA inaturalist_data")
    con.execute("CREATE SCHEMA inaturalist_waba_data")
    con.execute("CREATE SCHEMA checklist_data")
```

```python
# data/tests/conftest.py:137-145 (existing taxon_lineage_extended table — EXACT analog for bridge)
con.execute("""
    CREATE TABLE inaturalist_data.taxon_lineage_extended (
        taxon_id BIGINT,
        family VARCHAR,
        subfamily VARCHAR,
        tribe VARCHAR,
        genus VARCHAR,
        subgenus VARCHAR
    )
""")
```

**Apply (extend `_create_tables`):**

```python
con.execute("""
    CREATE TABLE inaturalist_data.canonical_to_taxon_id (
        canonical_name TEXT PRIMARY KEY,
        taxon_id INTEGER,
        resolved_at TIMESTAMP,
        source TEXT
    )
""")
```

#### Existing seed pattern (multi-row INSERT VALUES)

```python
# data/tests/conftest.py:346-350 (taxon_lineage_extended seed — ideal shape to copy)
con.execute("""
    INSERT INTO inaturalist_data.taxon_lineage_extended VALUES
        (100001, 'Apidae', 'Apinae', 'Eucerini', 'Eucera', NULL),
        (100002, 'Halictidae', 'Halictinae', 'Halictini', 'Lasioglossum', 'Dialictus')
""")
```

**Apply (LIN-05 ≥95% threshold fixture, per RESEARCH §"LIN-05 threshold fixture composition"):**
- Add 20 canonical_name rows to `inaturalist_data.canonical_to_taxon_id` and corresponding `taxon_lineage_extended` rows.
- Of 20 mapped names, 19 must have non-NULL family in `taxon_lineage_extended` (= 95% floor).
- Names should appear in the FULL OUTER union: split between `checklist_data.species` (already seeded — see lines 305-316) and `ecdysis_data.occurrences` (lines 327-343). Mix: ~10 checklist-only, ~5 occurrence-only, ~5 both.

#### `_zero_inat_pacing` extension (per A4)

See "Apply" block under `test_resolve_taxon_ids.py` § _zero_inat_pacing autouse — extend `conftest.py:375-385` to also patch the new module's snapshot of `_INAT_PACE_SECONDS`.

---

### `data/tests/test_taxon_lineage_extended.py` (MODIFIED — bridge-arm test)

**Self-reference:** lines 108-145 (`test_enrich_unions_both_observation_tables`).

#### Closest-existing-test pattern

```python
# data/tests/test_taxon_lineage_extended.py:108-145
def test_enrich_unions_both_observation_tables(lineage_db):
    db_path, mod = lineage_db
    con = duckdb.connect(db_path)
    # 100001 only in inaturalist_data; 200002 only in waba; 300003 in both; NULL ignored.
    con.execute("INSERT INTO inaturalist_data.observations VALUES (100001), (300003), (NULL)")
    con.execute("INSERT INTO inaturalist_waba_data.observations VALUES (200002), (300003), (NULL)")
    con.close()

    captured_ids: list[str] = []

    def _fake_get(url, params=None, timeout=None):
        captured_ids.append(url.rsplit("/", 1)[-1])
        return _fake_inat_response(
            [
                {"id": 100001, "name": "Eucera", "rank": "genus", "ancestors": []},
                {"id": 200002, "name": "Osmia", "rank": "genus", "ancestors": []},
                {"id": 300003, "name": "Bombus", "rank": "genus", "ancestors": []},
            ]
        )

    with patch("inaturalist_pipeline.requests.get", side_effect=_fake_get):
        mod.enrich_taxon_lineage_extended(db_path)
    ...
    assert sent_ids == {"100001", "200002", "300003"}
```

**Apply:** Add a sibling test `test_enrich_includes_bridge_taxon_ids` that:
1. Adds the bridge table to the `lineage_db` fixture (or extends fixture creation in this file's local fixture, since `lineage_db` is local to this test module — lines 22-51).
2. Inserts a row in `inaturalist_data.canonical_to_taxon_id` with a `taxon_id` not in either observations table.
3. Asserts the captured `ids_path` URL segment includes that taxon_id.

The fixture extension is straightforward — append to `lineage_db` body (line 49):

```python
con.execute("""
    CREATE TABLE inaturalist_data.canonical_to_taxon_id (
        canonical_name TEXT PRIMARY KEY,
        taxon_id INTEGER,
        resolved_at TIMESTAMP,
        source TEXT
    )
""")
```

---

## Shared Patterns

### Pattern A — DuckDB connection lifecycle

**Source files:** `data/inaturalist_pipeline.py:201-262`, `data/checklist_pipeline.py:129-202`.
**Apply to:** Every pipeline-step function, including `resolve_taxon_ids`.

```python
con = duckdb.connect(DB_PATH)
try:
    # ... step body ...
finally:
    con.close()
```

### Pattern B — Module-level `DB_PATH` constant from env

**Source:** `data/inaturalist_pipeline.py:11`, `data/checklist_pipeline.py:22`.

```python
DB_PATH = os.environ.get("DB_PATH", str(Path(__file__).parent / "beeatlas.duckdb"))
```

**Apply to:** `data/resolve_taxon_ids.py`. Enables the test-fixture `monkeypatch.setenv("DB_PATH", ...)` + `importlib.reload(...)` idiom.

### Pattern C — `print(...) # noqa: T201` summary line

**Source:** `inaturalist_pipeline.py:215, 260`; `checklist_pipeline.py:61, 120-122, 197`.
**Apply to:** All new pipeline-step functions; surface counts and unresolved-CSV name in a single trailing line.

### Pattern D — Mock the HTTP boundary, not the helper

**Source:** `test_taxon_lineage_extended.py` (every test). Always:

```python
with patch("inaturalist_pipeline.requests.get", side_effect=responses):
    ...
```

**Apply to:** Every new test in `test_resolve_taxon_ids.py` and the new test in `test_taxon_lineage_extended.py`. NEVER `patch("inaturalist_pipeline._inat_get_with_retry", ...)` — that bypasses the retry path Phase 76 already proves out (Pitfall #4 in RESEARCH).

### Pattern E — `importlib.reload` for env-snapshotted module constants

**Source:** `test_taxon_lineage_extended.py:30-32`, `test_checklist_reconcile.py:13-18`.

```python
@pytest.fixture
def reload_pipeline(tmp_path, monkeypatch):
    monkeypatch.setenv("DB_PATH", str(tmp_path / "test.duckdb"))
    import resolve_taxon_ids
    importlib.reload(resolve_taxon_ids)
    return resolve_taxon_ids
```

**Apply to:** `test_resolve_taxon_ids.py` — needed because `DB_PATH` and `_INAT_PACE_SECONDS` are read at module-import time.

### Pattern F — CSV writer with overwrite-each-run semantics

**Source:** `data/checklist_pipeline.py:113-118`.
**Apply to:** `data/resolve_taxon_ids.py` writing `lineage_unresolved.csv`. Mode `"w"` (not `"a"`) — file is regenerated, like `checklist_unmatched.csv`. **Header columns:** `["canonical_name", "reason", "attempted_at"]` (per CONTEXT.md / LIN-04).

## No Analog Found

| File | Role | Data Flow | Reason |
|------|------|-----------|--------|
| (none) | — | — | All Phase 77 code maps cleanly to existing analogs in `data/` and `data/tests/`. |

**`ON CONFLICT DO UPDATE` SQL has no in-repo precedent** — Phase 76 used `CREATE OR REPLACE TABLE` instead. This is novel SQL but well-documented in DuckDB ≥0.7 (RESEARCH Assumption A5). Treat the literal SQL block in §"Per-row UPSERT" above as the authoritative pattern.

## Additional Planning Notes

### `lineage_unresolved.csv` is tracked in git, not gitignored

**Verified 2026-05-03:**

```
$ git ls-files data/checklist_unmatched.csv data/checklist_synonyms.csv
data/checklist_synonyms.csv
data/checklist_unmatched.csv
```

`data/.gitignore` does NOT cover `*.csv`. `checklist_unmatched.csv` IS tracked. **Implication for planner:** RESEARCH Assumption A3 ("`data/.gitignore` covers `*.csv`") is FALSE. Two viable choices, both consistent with prior precedent:

- **Match `checklist_unmatched.csv` precedent:** track `data/lineage_unresolved.csv` in git (regenerated each run; small file; auditable diff). **Recommended** — matches existing convention.
- **Diverge:** add `lineage_unresolved.csv` to `data/.gitignore`. Reject — splits the convention.

### No new DDL module is appropriate

`run.py:_apply_migrations` (lines 47-94) handles ALTER-style fixups for the live DB, NOT new-table creation. New tables are created inside their owning pipeline-step (e.g., `taxon_lineage_extended` is created inline at `inaturalist_pipeline.py:241-249`). Phase 77's bridge table follows the same pattern — DDL lives at the top of `resolve_taxon_ids.py` in a `_ensure_bridge_table(con)` helper, called once per `resolve_taxon_ids()` invocation.

## Metadata

**Analog search scope:** `data/` and `data/tests/` (the only directories that contain pipeline-tier Python).
**Files scanned:** 12 (full reads of `inaturalist_pipeline.py`, `run.py`, `checklist_pipeline.py`, `canonical_name.py`, `tests/conftest.py`, `tests/test_taxon_lineage_extended.py`; partial of `tests/test_checklist_reconcile.py`; directory listing of `data/` + `data/tests/`).
**Pattern extraction date:** 2026-05-03

## PATTERN MAPPING COMPLETE
