# Phase 124: Pre-Work & Contract Cleanup - Pattern Map

**Mapped:** 2026-05-29
**Files analyzed:** 4
**Analogs found:** 4 / 4

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `data/tests/test_dbt_diff.py` | test | batch | self (docstring-only edit) | exact |
| `data/resolve_taxon_ids.py` | pipeline utility | request-response + CRUD | self (SQL extension) | exact |
| `data/tests/test_resolve_taxon_ids.py` | test | CRUD | self (fixture + new test) | exact |
| `data/run.py` | pipeline orchestrator | batch | self (STEPS reorder) | exact |

All four files already exist and are being modified surgically. No new files are created.

---

## Pattern Assignments

### `data/tests/test_dbt_diff.py` (test, docstring-only)

**Change:** PWK-01 — update stale column count in docstring.

**Exact location** (lines 53–58):
```python
@_SANDBOX_GUARD
def test_occurrences_schema_matches():
    """Column names AND types from DESCRIBE match exactly between sandbox and public (30 cols).

    Asserts the full ordered list of (column_name, data_type) pairs is identical.
    Verified baseline: 30 columns with identical names and types in both files.
    """
```

**Target text:** Replace `30 cols` with `36 cols` on line 54 and `30 columns` with `36 columns` on line 57. No logic changes.

---

### `data/resolve_taxon_ids.py` (pipeline utility, request-response + CRUD)

**Change:** PWK-02 — add third `UNION` branch to `_names_to_resolve()` SQL; update two docstrings.

**Module docstring to update** (lines 1–6):
```python
"""Phase 77 — resolve canonical_name → iNat taxon_id, persist as bridge table.

Source SQL: FULL OUTER union of checklist + ecdysis canonical_name LEFT JOIN bridge.
Pacing + retry: reuses _inat_get_with_retry from inaturalist_pipeline.
Unresolved: data/lineage_unresolved.csv with (canonical_name, reason, attempted_at).
"""
```
Replace "FULL OUTER union of checklist + ecdysis" with "FULL OUTER union of checklist + ecdysis + inat_obs".

**Core SQL pattern — current** (lines 58–71):
```python
    sql = """
        WITH u AS (
            SELECT DISTINCT canonical_name FROM checklist_data.species
            WHERE canonical_name IS NOT NULL
            UNION
            SELECT DISTINCT canonical_name FROM ecdysis_data.occurrences
            WHERE canonical_name IS NOT NULL
        )
        SELECT u.canonical_name
        FROM u
        LEFT JOIN inaturalist_data.canonical_to_taxon_id b USING (canonical_name)
        WHERE b.canonical_name IS NULL
        ORDER BY u.canonical_name
    """
```

**Core SQL pattern — target** (add third UNION branch before closing paren of CTE):
```python
    sql = """
        WITH u AS (
            SELECT DISTINCT canonical_name FROM checklist_data.species
            WHERE canonical_name IS NOT NULL
            UNION
            SELECT DISTINCT canonical_name FROM ecdysis_data.occurrences
            WHERE canonical_name IS NOT NULL
            UNION
            SELECT DISTINCT canonical_name FROM inat_obs_data.observations
            WHERE canonical_name IS NOT NULL
        )
        SELECT u.canonical_name
        FROM u
        LEFT JOIN inaturalist_data.canonical_to_taxon_id b USING (canonical_name)
        WHERE b.canonical_name IS NULL
        ORDER BY u.canonical_name
    """
```

**`_names_to_resolve` docstring** (line 50):
```python
    """FULL OUTER union of canonical names LEFT JOIN bridge, filtered by what's missing.
```
Update to: `"""FULL OUTER union of canonical names (checklist + ecdysis + inat_obs) LEFT JOIN bridge, filtered by what's missing.`

**UPSERT pattern for reference** (lines 169–180) — unchanged, shown for context only:
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

**Summary print pattern** (lines 204–210) — unchanged; PWK-03 enumeration should follow the same `print(f"...")` style:
```python
        print(  # noqa: T201
            f"resolve-taxon-ids: {n_resolved} cached, {len(unresolved)} unresolved "
            f"(see {UNRESOLVED_CSV.name})"
        )
```

---

### `data/tests/test_resolve_taxon_ids.py` (test, CRUD)

**Change:** PWK-02 — extend `resolver_db` fixture to seed `inat_obs_data.observations`; add one new test mirroring `test_names_to_resolve_unions_both_sources`.

**Fixture pattern to extend** (lines 48–85). Current fixture creates checklist and ecdysis schemas/tables only. The new schema/table lines go immediately after the existing `con.execute("CREATE TABLE ecdysis_data.occurrences...")` call (line 82):

```python
    con = duckdb.connect(db_path)
    con.execute("CREATE SCHEMA checklist_data")
    con.execute("CREATE SCHEMA ecdysis_data")
    con.execute("CREATE SCHEMA inaturalist_data")
    con.execute("CREATE TABLE checklist_data.species (canonical_name TEXT)")
    con.execute("CREATE TABLE ecdysis_data.occurrences (canonical_name TEXT)")
    # Bridge created lazily by resolve_taxon_ids via CREATE TABLE IF NOT EXISTS.
    con.close()
```

Add two lines before `con.close()`:
```python
    con.execute("CREATE SCHEMA inat_obs_data")
    con.execute("CREATE TABLE inat_obs_data.observations (canonical_name TEXT)")
```

**New test pattern** — copy structure from `test_names_to_resolve_unions_both_sources` (lines 135–161):
```python
def test_names_to_resolve_unions_both_sources(resolver_db):
    db_path, mod = resolver_db
    con = duckdb.connect(db_path)
    # A in checklist only, B in occurrences only, C in both.
    con.execute(
        "INSERT INTO checklist_data.species VALUES ('aaa species'), ('ccc species')"
    )
    con.execute(
        "INSERT INTO ecdysis_data.occurrences VALUES "
        "('bbb species'), ('ccc species'), ('ccc species')"
    )
    con.close()

    responses = [
        _fake_taxa_search_response([_matching_taxon(1, "aaa species")]),
        _fake_taxa_search_response([_matching_taxon(2, "bbb species")]),
        _fake_taxa_search_response([_matching_taxon(3, "ccc species")]),
    ]
    with patch(
        "inaturalist_pipeline.requests.get", side_effect=responses
    ) as mock_get:
        mod.resolve_taxon_ids()

    # 3 distinct names → 3 calls (NOT 4 — duplicates collapsed by UNION).
    assert mock_get.call_count == 3
    queries = [c.kwargs["params"]["q"] for c in mock_get.call_args_list]
    assert sorted(queries) == ["aaa species", "bbb species", "ccc species"]
```

New test should seed a name **only** in `inat_obs_data.observations` (not in checklist or ecdysis) and assert it appears in the names-to-resolve set, following the same `mock_get.call_count` and `sorted(queries)` assertion style.

**Helper for seeding inat_obs_data** (follows same pattern as existing fixture inserts):
```python
    con.execute("INSERT INTO inat_obs_data.observations VALUES ('ddd species')")
```

---

### `data/run.py` (pipeline orchestrator, batch)

**Change:** STEPS ordering — move `inat-obs` to run before `resolve-taxon-ids`.

**Current STEPS list** (lines 84–106), relevant slice:
```python
STEPS: list[tuple[str, Callable]] = [
    ("ecdysis", load_ecdysis),
    ("ecdysis-links", load_links),
    ("inaturalist", load_inaturalist_observations),
    ("waba", load_waba_observations),
    ("projects", load_projects),
    ("anti-entropy", run_anti_entropy),
    ("checklist", load_checklist),
    ("resolve-taxon-ids", lambda: resolve_taxon_ids(refresh=_REFRESH_LINEAGE)),
    ("taxa-download", download_taxa_csv),
    ("taxon-lineage-extended", load_taxon_lineage_extended),
    ("places-validation", validate_places_step),
    ("places-load", load_places_step),
    ("inat-obs", load_inat_obs),
    ...
]
```

**Target ordering** — move `("inat-obs", load_inat_obs)` to immediately before `("resolve-taxon-ids", ...)`. The simplest safe position is directly after `("checklist", load_checklist)`:

```python
    ("checklist", load_checklist),
    ("inat-obs", load_inat_obs),
    ("resolve-taxon-ids", lambda: resolve_taxon_ids(refresh=_REFRESH_LINEAGE)),
    ("taxa-download", download_taxa_csv),
    ("taxon-lineage-extended", load_taxon_lineage_extended),
    ("places-validation", validate_places_step),
    ("places-load", load_places_step),
    # inat-obs no longer here
```

**Module docstring** (lines 7–9) also lists the step order in prose — update to reflect the new position of `inat-obs`:
```
    ecdysis -> ecdysis-links -> inaturalist -> waba -> projects ->
    anti-entropy -> checklist -> resolve-taxon-ids -> taxa-download ->
    taxon-lineage-extended -> places-validation -> places-load -> inat-obs ->
```
Change to:
```
    ecdysis -> ecdysis-links -> inaturalist -> waba -> projects ->
    anti-entropy -> checklist -> inat-obs -> resolve-taxon-ids -> taxa-download ->
    taxon-lineage-extended -> places-validation -> places-load ->
```

---

## Shared Patterns

### DuckDB print summary
**Source:** `data/resolve_taxon_ids.py` lines 204–210
**Apply to:** PWK-03 inactive-taxon enumeration output
```python
        print(  # noqa: T201
            f"resolve-taxon-ids: {n_resolved} cached, {len(unresolved)} unresolved "
            f"(see {UNRESOLVED_CSV.name})"
        )
```
Match this `print(  # noqa: T201` pattern (comment on the same line as `print`) for any new summary output added in `resolve_taxon_ids.py`.

### DuckDB connection pattern
**Source:** `data/resolve_taxon_ids.py` lines 192–213
**Apply to:** Any inline PWK-03 enumeration query added to `resolve_taxon_ids.py`
```python
    con = duckdb.connect(DB_PATH)
    try:
        ...
    finally:
        con.close()
```

### Pytest fixture DuckDB schema seeding
**Source:** `data/tests/test_resolve_taxon_ids.py` lines 77–84
**Apply to:** New `inat_obs_data.observations` table in `resolver_db` fixture
```python
    con = duckdb.connect(db_path)
    con.execute("CREATE SCHEMA checklist_data")
    con.execute("CREATE SCHEMA ecdysis_data")
    con.execute("CREATE SCHEMA inaturalist_data")
    con.execute("CREATE TABLE checklist_data.species (canonical_name TEXT)")
    con.execute("CREATE TABLE ecdysis_data.occurrences (canonical_name TEXT)")
    con.close()
```

### `_fake_taxa_search_response` / `_matching_taxon` helpers
**Source:** `data/tests/test_resolve_taxon_ids.py` lines 14–45
**Apply to:** New test for inat_obs UNION branch — reuse these unchanged.

---

## No Analog Found

None. All four files are self-analogous (surgical modifications to existing files).

---

## Metadata

**Analog search scope:** `data/resolve_taxon_ids.py`, `data/tests/test_resolve_taxon_ids.py`, `data/tests/test_dbt_diff.py`, `data/run.py`
**Files scanned:** 4 (all source files read in full; all ≤ 650 lines)
**Pattern extraction date:** 2026-05-29
