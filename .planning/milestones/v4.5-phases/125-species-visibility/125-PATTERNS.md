# Phase 125: Species Visibility - Pattern Map

**Mapped:** 2026-05-29
**Files analyzed:** 2 (1 modified SQL, 1 modified Python test)
**Analogs found:** 2 / 2

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `data/dbt/models/intermediate/int_species_universe.sql` | dbt intermediate model | transform (FULL OUTER JOIN + COALESCE derivation) | itself (surgical edit) | self |
| `data/tests/test_dbt_scaffold.py` | pytest unit test | batch (parquet query assertion) | itself (append new test functions) | self |

## Pattern Assignments

### `data/dbt/models/intermediate/int_species_universe.sql` (dbt intermediate, transform)

**Analog:** itself — two surgical line replacements inside the `species_universe` CTE.

**Existing COALESCE pattern for genus derivation** (lines 84-88) — shows the three-argument fallback chain already in use for optional lineage columns:

```sql
COALESCE(
    c.genus,
    tle.genus,
    split_part(COALESCE(c.canonical_name, oa.canonical_name), ' ', 1)
) AS genus,
```

This is the exact structural pattern to copy for `specific_epithet`: a two-argument COALESCE where the second arm derives from `split_part` on the canonical name. Replace the current bare assignment at line 90:

**Line 90 — BEFORE:**
```sql
c.specific_epithet AS specific_epithet,
```

**Line 90 — AFTER (copy COALESCE structure from genus derivation above):**
```sql
COALESCE(
    c.specific_epithet,
    NULLIF(split_part(COALESCE(c.canonical_name, oa.canonical_name), ' ', 2), '')
) AS specific_epithet,
```

`NULLIF(..., '')` collapses the empty string that `split_part` returns for single-token canonical names (genus-only records like `'lasioglossum'`) back to NULL. The genus derivation uses `split_part(..., ' ', 1)`; the epithet derivation uses `split_part(..., ' ', 2)`.

**Line 79 — BEFORE (scientificName):**
```sql
COALESCE(c.scientificName, oa.canonical_name) AS scientificName,
```

**Line 79 — AFTER (capitalize first letter for off-checklist rows):**
```sql
COALESCE(
    c.scientificName,
    upper(left(COALESCE(c.canonical_name, oa.canonical_name), 1)) ||
    substring(COALESCE(c.canonical_name, oa.canonical_name), 2)
) AS scientificName,
```

The inner `COALESCE(c.canonical_name, oa.canonical_name)` expression already appears on line 80 for `canonical_name` — use the same argument order. Both fixes must land in a single edit; they fix the same class of problem for different columns.

**DISTINCT ON guard** (lines 144-148) — unchanged; the COALESCE fills values on existing rows before this clause and does not introduce new duplicate rows:

```sql
SELECT DISTINCT ON (canonical_name) *
FROM species_universe
WHERE family IN ('Andrenidae', 'Apidae', 'Colletidae', 'Halictidae',
                 'Megachilidae', 'Melittidae', 'Stenotritidae')
ORDER BY canonical_name, on_checklist DESC
```

---

### `data/tests/test_dbt_scaffold.py` (pytest, batch assertion)

**Analog:** itself — append two new test functions after the existing `_CHECKLIST_GUARD` block (lines 117-183). The new tests belong to a new guard section keyed on `species.parquet`.

**Guard pattern to copy** (lines 117-120) — define a reusable `skipif` mark, then decorate each test:

```python
_CHECKLIST_GUARD = pytest.mark.skipif(
    not (SANDBOX / "checklist.parquet").exists(),
    reason="run `bash data/dbt/run.sh build` first to produce checklist.parquet",
)
```

New guard (copy structure, swap filename):

```python
_SPECIES_GUARD = pytest.mark.skipif(
    not (SANDBOX / "species.parquet").exists(),
    reason="run `bash data/dbt/run.sh build` first",
)
```

**COUNT + assert == 0 pattern** (lines 151-158) — the canonical form for "no bad rows" assertions in this file:

```python
@_CHECKLIST_GUARD
def test_checklist_no_null_specific_epithet():
    """checklist.parquet has zero null specific_epithet rows (CHECK-04)."""
    parquet_path = str(SANDBOX / "checklist.parquet")
    row = duckdb.execute(
        f"SELECT COUNT(*) FROM read_parquet('{parquet_path}')"
        " WHERE specific_epithet IS NULL"
    ).fetchone()
    assert row[0] == 0, f"found {row[0]} null specific_epithet rows"
```

New tests use the same shape — guard decorator, docstring with requirement ID, `parquet_path` local, `duckdb.execute(...).fetchone()[0]`, `assert n == 0, f"..."`:

```python
@_SPECIES_GUARD
def test_off_checklist_species_with_occurrences_have_specific_epithet():
    """All two-token off-checklist species with occurrence_count > 0 have specific_epithet (SPV-01)."""
    parquet_path = str(SANDBOX / "species.parquet")
    n = duckdb.execute(
        f"SELECT COUNT(*) FROM read_parquet('{parquet_path}') "
        "WHERE occurrence_count > 0 AND on_checklist = false "
        "AND ARRAY_LENGTH(STRING_SPLIT(canonical_name, ' ')) = 2 "
        "AND specific_epithet IS NULL"
    ).fetchone()[0]
    assert n == 0, (
        f"Expected 0 two-token off-checklist species with occurrences to lack specific_epithet, "
        f"got {n}. Fix COALESCE derivation in int_species_universe.sql."
    )


@_SPECIES_GUARD
def test_off_checklist_species_scientificname_capitalized():
    """Off-checklist species with two-token canonical names have capitalized scientificName (SPV-01)."""
    parquet_path = str(SANDBOX / "species.parquet")
    n = duckdb.execute(
        f"SELECT COUNT(*) FROM read_parquet('{parquet_path}') "
        "WHERE occurrence_count > 0 AND on_checklist = false "
        "AND ARRAY_LENGTH(STRING_SPLIT(canonical_name, ' ')) = 2 "
        "AND scientificName != upper(left(scientificName, 1)) || substring(scientificName, 2)"
    ).fetchone()[0]
    assert n == 0, (
        f"Expected 0 off-checklist species with lowercase scientificName, got {n}."
    )
```

**Import block** (lines 1-23) — no new imports needed; `duckdb`, `pytest`, and `Path` are already imported. `SANDBOX` path constant is already defined.

---

## Shared Patterns

### COALESCE with split_part for name token extraction
**Source:** `data/dbt/models/intermediate/int_species_universe.sql` lines 84-88 (genus derivation)
**Apply to:** `specific_epithet` derivation at line 90
- Outer `COALESCE(checklist_col, derived_expr)` — checklist value wins when present
- Inner expression uses `split_part(COALESCE(c.canonical_name, oa.canonical_name), ' ', N)` — same `COALESCE` argument order for canonical name throughout the CTE
- Wrap with `NULLIF(..., '')` when empty string is a sentinel for "no token" (token 2 of a single-word string)

### skipif guard + COUNT == 0 test structure
**Source:** `data/tests/test_dbt_scaffold.py` lines 117-158
**Apply to:** both new SPV-01 test functions
- Define one module-level `_SPECIES_GUARD` mark (mirrors `_CHECKLIST_GUARD` at line 117)
- Each function: guard decorator → docstring (requirement ID in parens) → `parquet_path = str(SANDBOX / "filename.parquet")` → `duckdb.execute(...).fetchone()[0]` → `assert n == 0, f"..."`

---

## No Analog Found

None. Both files are self-analogous (surgical additions to existing files whose full structure is already in context).

---

## Metadata

**Analog search scope:** `data/dbt/models/intermediate/`, `data/tests/`
**Files read:** 2 source files read in full (`int_species_universe.sql` — 149 lines, `test_dbt_scaffold.py` — 249 lines)
**Pattern extraction date:** 2026-05-29
