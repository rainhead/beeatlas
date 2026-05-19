# Phase 104: Semantic Reconciliation - Pattern Map

**Mapped:** 2026-05-18
**Files analyzed:** 3
**Analogs found:** 3 / 3

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `data/places_export.py` | utility | transform (SQL string in Python) | `data/places_export.py` itself — in-place fix | exact |
| `data/tests/test_places_export.py` | test | batch (PyArrow fixture → DuckDB → assert) | `data/tests/test_places_export.py` itself — in-place update | exact |
| `src/occurrence.ts` | utility | transform | `src/occurrence.ts` itself — comment addition only | exact |

All three files are in-place modifications. No new files are created.

---

## Pattern Assignments

### `data/places_export.py` — fix `_query_counts` predicate (lines 50–62)

**Analog:** `data/places_export.py` (same file)

**Current predicate** (line 54 — the line being replaced):
```python
COUNT(CASE WHEN is_provisional = false OR is_provisional IS NULL THEN 1 END) AS specimen_count,
```

**Replacement predicate with canonical comment** (lines 53–54 become):
```python
-- Confirmed specimen predicate: ecdysis_id IS NOT NULL.
-- Matches isSpecimenBacked() in src/occurrence.ts (canonical cross-layer definition).
-- Do NOT use is_provisional = false — that is true for both Ecdysis-backed rows AND
-- sample-only iNat rows (ecdysis_id IS NULL, is_provisional = false).
COUNT(CASE WHEN ecdysis_id IS NOT NULL THEN 1 END) AS specimen_count,
```

Note: the comment goes inside the SQL string (it is a `/* */` or `--` SQL comment). The surrounding Python structure (lines 50–62) stays unchanged — only the one `COUNT(CASE WHEN …)` expression changes.

**Surrounding context to preserve** (lines 50–62):
```python
rows = con.execute(
    """
    SELECT
        place_slug,
        COUNT(CASE WHEN is_provisional = false OR is_provisional IS NULL THEN 1 END) AS specimen_count,
        COUNT(DISTINCT CASE WHEN sample_id IS NOT NULL THEN sample_id END) AS sample_count
    FROM read_parquet(?)
    WHERE place_slug IS NOT NULL
    GROUP BY place_slug
    """,
    [str(parquet_path)],
).fetchall()
```

---

### `data/tests/test_places_export.py` — update `_write_test_occurrences_parquet` and `test_places_json_counts`

**Analog:** `data/tests/test_places_export.py` (same file)

**Current fixture helper** (lines 64–89 — the section being updated):
```python
def _write_test_occurrences_parquet(tmp_path: Path) -> Path:
    """Write a small occurrences.parquet with known counts for test-place.

    Three rows:
        ('test-place', False, 42)   — non-provisional, sample 42
        ('test-place', False, 42)   — same sample as above (sample_count = DISTINCT → 1)
        (None, False, 99)           — outside any place (excluded from counts)

    Expected: specimen_count == 2, sample_count == 1
    """
    schema = pa.schema([
        ("place_slug", pa.string()),
        ("is_provisional", pa.bool_()),
        ("sample_id", pa.int64()),
    ])
    table = pa.table(
        {
            "place_slug": ["test-place", "test-place", None],
            "is_provisional": [False, False, False],
            "sample_id": [42, 42, 99],
        },
        schema=schema,
    )
    out_path = tmp_path / "occurrences.parquet"
    pq.write_table(table, out_path)
    return out_path
```

**Updated fixture helper** — add `ecdysis_id` column, add sample-only row, update docstring:
```python
def _write_test_occurrences_parquet(tmp_path: Path) -> Path:
    """Write a small occurrences.parquet with known counts for test-place.

    Four rows covering all three row types:
        ('test-place', 42,   False, 10)  — Ecdysis-backed → counts as specimen
        ('test-place', None, False, 10)  — sample-only (ecdysis_id=None, is_provisional=False)
        ('test-place', None, True,  None)— provisional WABA → not a specimen
        (None,         99,   False, 20)  — outside any place (excluded from counts)

    Expected: specimen_count == 1 (only row 1), sample_count == 1 (DISTINCT sample_id=10)
    """
    schema = pa.schema([
        ("place_slug", pa.string()),
        ("ecdysis_id", pa.int64()),
        ("is_provisional", pa.bool_()),
        ("sample_id", pa.int64()),
    ])
    table = pa.table(
        {
            "place_slug":     ["test-place", "test-place", "test-place", None],
            "ecdysis_id":     [42,           None,          None,         99],
            "is_provisional": [False,        False,         True,         False],
            "sample_id":      [10,           10,            None,         20],
        },
        schema=schema,
    )
    out_path = tmp_path / "occurrences.parquet"
    pq.write_table(table, out_path)
    return out_path
```

**Current count assertion** (lines 160–167 — the lines being updated):
```python
    r = records[0]
    # Two non-provisional rows for test-place → specimen_count == 2
    assert r["specimen_count"] == 2, (
        f"Expected specimen_count == 2, got {r['specimen_count']}"
    )
    # Both rows have same sample_id=42 → DISTINCT count == 1
    assert r["sample_count"] == 1, (
        f"Expected sample_count == 1, got {r['sample_count']}"
    )
```

**Updated count assertion** — specimen_count drops from 2 to 1 (only Ecdysis-backed row):
```python
    r = records[0]
    # Only the Ecdysis-backed row (ecdysis_id IS NOT NULL) counts as a specimen.
    # Sample-only (ecdysis_id=None, is_provisional=False) and provisional rows are excluded.
    assert r["specimen_count"] == 1, (
        f"Expected specimen_count == 1 (Ecdysis-backed only), got {r['specimen_count']}"
    )
    # Both test-place rows with sample_id share sample_id=10 → DISTINCT count == 1
    assert r["sample_count"] == 1, (
        f"Expected sample_count == 1, got {r['sample_count']}"
    )
```

**PyArrow import pattern** (lines 15–16 — already present, no change needed):
```python
import pyarrow as pa
import pyarrow.parquet as pq
```

---

### `src/occurrence.ts` — add canonical cross-layer comment to `isSpecimenBacked`

**Analog:** `src/occurrence.ts` (same file)

**Current JSDoc block** (lines 48–56 — the section being updated):
```typescript
/**
 * True when the occurrence has an Ecdysis specimen record.
 *
 * This is the primary discriminant between the specimen-backed arm and
 * the non-specimen arm (iNat-only sample or provisional record).
 */
export function isSpecimenBacked(row: OccurrenceRow): boolean {
  return row.ecdysis_id != null;
}
```

**Updated JSDoc block** — add cross-layer canonical comment:
```typescript
/**
 * True when the occurrence has an Ecdysis specimen record.
 *
 * This is the canonical "confirmed specimen" predicate across all layers:
 * - TypeScript: `row.ecdysis_id != null`  (this function)
 * - Python:     `CASE WHEN ecdysis_id IS NOT NULL THEN 1 END`  (places_export.py `_query_counts`)
 * - dbt SQL:    `int_species_occurrences_agg` counts ecdysis_data.occurrences directly
 *
 * Do NOT use `!row.is_provisional` as a synonym — `is_provisional = false` is true
 * for both Ecdysis-backed rows AND sample-only iNat rows (ecdysis_id == null).
 * Authoritative layer: this function. Other layers must agree with this definition.
 */
export function isSpecimenBacked(row: OccurrenceRow): boolean {
  return row.ecdysis_id != null;
}
```

**Existing JSDoc style to copy from** (lines 13–27 — `occIdFromRow`, same file):
```typescript
/**
 * Construct a prefixed occurrence ID from a row.
 *
 * Returns `'ecdysis:N'` when the row has an Ecdysis specimen record,
 * `'inat:N'` when it has an iNaturalist observation but no Ecdysis record,
 * or `null` when both IDs are null (e.g. provisional rows with no observation_id).
 *
 * The `string | null` return type matches the existing `rowOccId` contract
 * in `src/bee-table.ts` — callers retain their existing null-check logic.
 */
```

---

## Shared Patterns

### PyArrow Parquet Fixture Pattern
**Source:** `data/tests/test_places_export.py` lines 74–88
**Apply to:** `_write_test_occurrences_parquet` update

The established pattern is:
1. Declare `schema = pa.schema([...])` with explicit column types
2. Build `table = pa.table({...}, schema=schema)` with parallel column arrays
3. Call `pq.write_table(table, out_path)` and return `out_path`

New `ecdysis_id` column uses `pa.int64()` (matches `sample_id` type; nullable by default in Arrow).

### DuckDB Parameterized Query Pattern
**Source:** `data/places_export.py` lines 50–61
**Apply to:** `_query_counts` fix

The query uses `read_parquet(?)` with `[str(parquet_path)]` as the parameter list. The SQL string is a triple-quoted Python string. SQL comments (`--`) are valid inside the triple-quoted string and will be passed to DuckDB unchanged.

### Pytest monkeypatch + importlib.reload Pattern
**Source:** `data/tests/test_places_export.py` lines 92–104 (`_setup_env`)
**Apply to:** All three test functions (already established; no change needed)

```python
def _setup_env(tmp_path: Path, monkeypatch) -> object:
    monkeypatch.setenv("DB_PATH", str(tmp_path / "test.duckdb"))
    monkeypatch.setenv("EXPORT_DIR", str(tmp_path))
    import places_export  # noqa: PLC0415
    importlib.reload(places_export)
    ...
    return places_export
```

Module reload after env patch ensures `ASSETS_DIR` and `DB_PATH` module constants pick up the test values.

---

## No Analog Found

None. All three files are in-place modifications with direct self-analogy.

---

## Metadata

**Analog search scope:** `data/places_export.py`, `data/tests/test_places_export.py`, `src/occurrence.ts`
**Files scanned:** 3 (all three modification targets; no other analogs needed)
**Pattern extraction date:** 2026-05-18
