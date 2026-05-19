# Phase 104: Semantic Reconciliation - Research

**Researched:** 2026-05-18
**Domain:** Cross-layer predicate alignment (Python pipeline, dbt SQL, TypeScript frontend)
**Confidence:** HIGH

## Summary

Phase 104 resolves a real semantic divergence between three different definitions of "confirmed (non-provisional) specimen" used across the BeeAtlas stack. The divergence is not cosmetic: `places_export.py` counts sample-only rows (iNat-only, no Ecdysis ID) as specimens, while the TypeScript frontend's `isSpecimenBacked` predicate does not. Both approaches are internally consistent; what the phase must do is pick one definition as canonical, update any diverging site, and document the choice with a test.

The `is_provisional` column in `occurrences.parquet` was introduced in Phase 66 and describes whether a WABA iNat observation awaits an Ecdysis catalog match. It is NOT a synonym for "has an Ecdysis specimen record" — `is_provisional = false` includes both Ecdysis-backed rows and iNat-only sample rows that have never had a WABA observation. This conflation is the root cause of the divergence.

The three call sites are: (1) `places_export.py:_query_counts` — uses `is_provisional = false OR is_provisional IS NULL`; (2) `src/occurrence.ts:isSpecimenBacked` — uses `ecdysis_id != null`; (3) `data/dbt/models/intermediate/int_species_occurrences_agg.sql:specimen_count` — counts rows from `ecdysis_data.occurrences` directly (always Ecdysis-only, always correct).

**Primary recommendation:** Align `places_export.py` to the narrower `ecdysis_id IS NOT NULL` predicate, matching `isSpecimenBacked`. This is the semantically correct definition. The existing `test_places_json_counts` test must be updated to exercise both the Ecdysis-backed and sample-only cases explicitly.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| "is this a confirmed specimen?" predicate | Python / dbt SQL (pipeline) | TypeScript (frontend) | The pipeline is the authority on data shape; the frontend reads what pipeline exports |
| `places_export.py` specimen count | Python pipeline | — | Reads from occurrences.parquet produced by dbt |
| `isSpecimenBacked` frontend predicate | TypeScript frontend | — | Discriminates display path; must agree with pipeline definition |
| dbt `int_species_occurrences_agg` specimen_count | dbt SQL | — | Reads directly from ecdysis_data.occurrences; structurally always Ecdysis-only |
| Test coverage of predicate semantics | pytest (Python) | Vitest (TS) | Both layers need a fixture-based assertion |

## Standard Stack

No new packages. Phase is pure refactor/doc/test work.

### Core (already in use)
| Library | Version | Purpose | Already Used By |
|---------|---------|---------|-----------------|
| pytest | in pyproject.toml | Python test runner | `data/tests/` |
| pyarrow + pyarrow.parquet | in pyproject.toml | Parquet fixture authoring | `test_places_export.py` |
| duckdb (Python) | in pyproject.toml | In-process SQL for places_export tests | `test_places_export.py` |
| vitest | package.json | TypeScript test runner | `src/tests/occurrence.test.ts` |

## Package Legitimacy Audit

No packages to install for this phase — all dependencies are already in use.

## Architecture Patterns

### The Three-Layer Divergence

#### Layer 1: `places_export.py` — OVERCOUNTS specimens

```python
# Line 54 — current (overcounting) predicate:
COUNT(CASE WHEN is_provisional = false OR is_provisional IS NULL THEN 1 END) AS specimen_count
```

`is_provisional = false` is true for ALL rows from ARM 1 of `int_combined.sql`, which includes:
- Ecdysis rows (`ecdysis_id IS NOT NULL`) — real confirmed specimens
- Sample-only rows (`ecdysis_id IS NULL`, no Ecdysis match) — **NOT confirmed specimens**

`is_provisional IS NULL` catches any legacy rows with a null value (the dbt not_null test on `is_provisional` in `schema.yml` makes this defensive but harmless today).

**Correction needed:**
```python
COUNT(CASE WHEN ecdysis_id IS NOT NULL THEN 1 END) AS specimen_count
```

#### Layer 2: `src/occurrence.ts:isSpecimenBacked` — CORRECT

```typescript
// Line 54-56 — current (correct) predicate:
export function isSpecimenBacked(row: OccurrenceRow): boolean {
  return row.ecdysis_id != null;
}
```

This directly tests the presence of an Ecdysis record. `ecdysis_id` is the `INTEGER` from `ecdysis_data.occurrences`; null means no specimen match.

No change needed here.

#### Layer 3: `int_species_occurrences_agg.sql:specimen_count` — CORRECT

```sql
-- Line 15 — correct predicate (reads Ecdysis source directly):
CAST(SUM(CASE WHEN id IS NOT NULL THEN 1 ELSE 0 END) AS BIGINT) AS specimen_count
```

This reads `ecdysis_data.occurrences` (the raw Ecdysis table), not `int_combined`. Every row in that table is an Ecdysis specimen. `id IS NOT NULL` is always true because the table has a non-null primary key — this is a COUNT(*) equivalent. No sample-only rows appear here. [VERIFIED: direct reading of int_species_occurrences_agg.sql]

### Recommended Project Structure

No structural changes. This phase touches:
- `data/places_export.py` — fix `_query_counts` predicate
- `data/tests/test_places_export.py` — update/extend `test_places_json_counts` fixture + assertion
- `src/occurrence.ts` (or a nearby comment) — add authoritative comment citing this layer
- Possibly `data/dbt/models/intermediate/int_species_occurrences_agg.sql` — add comment linking to the canonical definition

### Pattern: Canonical Definition Comment

The SEM-01 requirement calls for a code comment citing which layer is authoritative. The recommended placement is `src/occurrence.ts` since it already has detailed JSDoc and is the TypeScript authority. A matching comment in `places_export.py` links back to it.

```python
# Confirmed (non-provisional) specimen predicate:
# A row is a confirmed specimen when ecdysis_id IS NOT NULL.
# This matches isSpecimenBacked() in src/occurrence.ts, which is the
# canonical cross-layer definition. Do NOT use is_provisional = false —
# that is true for both Ecdysis rows AND sample-only iNat rows (ecdysis_id IS NULL,
# is_provisional = false). Authoritative layer: TypeScript occurrence.ts.
COUNT(CASE WHEN ecdysis_id IS NOT NULL THEN 1 END) AS specimen_count,
```

### Pattern: Updating the pytest Fixture

The existing `test_places_json_counts` fixture uses only `is_provisional=False` rows and never exercises `ecdysis_id`. It must be updated (or a new test added) that explicitly covers all three row types:

| Row type | ecdysis_id | is_provisional | Counts as specimen? |
|----------|-----------|----------------|---------------------|
| Ecdysis-backed | non-null | False | YES |
| Sample-only | null | False | NO |
| Provisional WABA | null | True | NO |

The parquet fixture in `_write_test_occurrences_parquet` needs an `ecdysis_id` column added. The PyArrow schema and seed rows must distinguish Ecdysis-backed from sample-only rows.

**Key constraint:** `_write_test_occurrences_parquet` creates a minimal schema with only `place_slug`, `is_provisional`, `sample_id`. The `ecdysis_id` column must be added to match the actual `occurrences.parquet` schema. [VERIFIED: direct reading of test_places_export.py]

### Pattern: Vitest Test (Optional)

SEM-01 says "a pytest or Vitest test" — singular. Since `isSpecimenBacked` in `src/occurrence.ts` is already covered by `src/tests/occurrence.test.ts` (which tests all three row types), the Vitest side is already covered. The gap is on the pytest side: `test_places_export.py` does not assert that sample-only rows are excluded from `specimen_count`.

The planner may choose to cover SEM-01 with the pytest test alone, since the Vitest predicate tests already exist.

### Anti-Patterns to Avoid

- **Using `is_provisional = false` as specimen predicate:** Conflates sample-only rows with confirmed specimens. The `is_provisional` flag was introduced to mark unmatched WABA provisional rows — its inverse does not mean "has an Ecdysis record."
- **Relying on NULL check for is_provisional:** `is_provisional` has a `not_null` dbt test; the `OR is_provisional IS NULL` guard in the current code is defensive dead code going forward.
- **Changing the TypeScript predicate:** `isSpecimenBacked` is already correct and already tested. The fix belongs in `places_export.py`, not in the frontend.

## Don't Hand-Roll

No hand-rolling risk in this phase. All building blocks exist.

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Parquet fixture with ecdysis_id | Custom serializer | PyArrow `pa.schema` + `pa.table` | Already the pattern in test_places_export.py |

## Common Pitfalls

### Pitfall 1: Test fixture doesn't cover the diverging case

**What goes wrong:** The test passes even after fixing the predicate because the fixture only contains non-provisional rows (all of which happen to have ecdysis_id set in the test).

**Why it happens:** The existing `_write_test_occurrences_parquet` fixture adds two `is_provisional=False` rows but doesn't distinguish Ecdysis-backed from sample-only. After the predicate fix, the test would still pass whether `ecdysis_id` is null or not, because all test rows have the same `is_provisional=False` value.

**How to avoid:** Add a third fixture row: `ecdysis_id=None, is_provisional=False` (sample-only). Assert that `specimen_count == 1` (only the Ecdysis-backed row counts), not `2`.

**Warning signs:** Test passes before and after the SQL change — means the fixture doesn't distinguish the two cases.

### Pitfall 2: `ecdysis_id` column absent from minimal test parquet

**What goes wrong:** `_write_test_occurrences_parquet` writes a parquet with only 3 columns (`place_slug`, `is_provisional`, `sample_id`). The DuckDB query in `_query_counts` would fail with "column ecdysis_id not found" after the predicate change.

**How to avoid:** Add `ecdysis_id` to the PyArrow schema in the test fixture helper alongside the predicate change.

### Pitfall 3: Fixing the wrong layer (TypeScript)

**What goes wrong:** Someone changes `isSpecimenBacked` to use `!row.is_provisional` instead of `row.ecdysis_id != null`, "aligning" it to the wrong anchor.

**Why it's wrong:** `!is_provisional` returns true for sample-only rows. The sidebar's "identification pending" rendering (`isSampleOnly`) would then misclassify. The TypeScript predicates are already correct.

**How to avoid:** The authoritative comment should make the direction of change explicit: `places_export.py` moves toward `isSpecimenBacked`, not the reverse.

### Pitfall 4: `dbt build` required after any `.sql` change

**What goes wrong:** Any SQL change to dbt models is not reflected in pytest until `dbt build` runs.

**How to avoid:** Per STATE.md guardrail: "`dbt build` required after ANY `.sql` change under `data/dbt/`". If the plan adds a comment to `int_species_occurrences_agg.sql`, a `dbt build` step is required before verifying.

## Code Examples

### Current places_export.py predicate (overcounting)
```python
# Source: data/places_export.py line 54
COUNT(CASE WHEN is_provisional = false OR is_provisional IS NULL THEN 1 END) AS specimen_count,
```

### Corrected predicate
```python
# Confirmed (non-provisional) specimen predicate:
# A row is a confirmed specimen when ecdysis_id IS NOT NULL.
# This matches isSpecimenBacked() in src/occurrence.ts (the canonical cross-layer definition).
# Do NOT use `is_provisional = false` — that includes sample-only iNat rows (ecdysis_id IS NULL).
COUNT(CASE WHEN ecdysis_id IS NOT NULL THEN 1 END) AS specimen_count,
```

### Updated test fixture schema
```python
# Source: data/tests/test_places_export.py (to be updated)
schema = pa.schema([
    ("place_slug", pa.string()),
    ("ecdysis_id", pa.int64()),      # ADD: discriminates Ecdysis vs sample-only
    ("is_provisional", pa.bool_()),
    ("sample_id", pa.int64()),
])
table = pa.table(
    {
        "place_slug":    ["test-place", "test-place", "test-place", None],
        "ecdysis_id":    [42,           None,          None,         99],   # row 1: Ecdysis; rows 2+3: non-Ecdysis
        "is_provisional":[False,        False,          True,         False],
        "sample_id":     [10,           10,             None,         20],
    },
    schema=schema,
)
# Expected: specimen_count == 1 (ecdysis_id IS NOT NULL), sample_count == 1 (DISTINCT sample_id=10)
```

### Canonical definition comment in occurrence.ts
```typescript
// Source: src/occurrence.ts — canonical cross-layer definition (SEM-01)
/**
 * True when the occurrence has an Ecdysis specimen record.
 *
 * This is the canonical "confirmed specimen" predicate across all layers:
 * - TypeScript: `row.ecdysis_id != null`  (this function)
 * - Python:     `CASE WHEN ecdysis_id IS NOT NULL THEN 1 END`  (places_export.py)
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

## State of the Art

| Old Approach | Current Approach | Impact |
|--------------|------------------|--------|
| `is_provisional = false` as specimen gate | `ecdysis_id IS NOT NULL` | Excludes sample-only rows from specimen count |

**Deprecated/outdated:**
- `is_provisional = false OR is_provisional IS NULL` in `places_export.py`: overcounts; replace with `ecdysis_id IS NOT NULL`.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `ecdysis_id` is present in `occurrences.parquet` (the file read by `places_export.py`) | Code Examples | If absent, the SQL fix would fail at runtime. Verified by reading `occurrences.sql` SELECT list — `j.ecdysis_id` is included. [VERIFIED: direct reading of occurrences.sql line 84] |
| A2 | No place page or frontend path reads `specimen_count` from `places.json` for selection filtering (only Eleventy templates render it as text) | Architecture | If frontend filtered by place specimen_count, an overcounting change would affect filter behavior. Reading of bee-filter-panel.ts confirms `places_meta` is only used to resolve place names (slug→name), not counts. [VERIFIED: direct reading of bee-filter-panel.ts lines 581-594] |

**If this table is empty:** Not applicable — two assumptions documented.

## Open Questions (RESOLVED)

1. **Should `test_places_json_counts` be modified in-place or should a new focused test be added?**
   - RESOLVED: extend in-place (Task 1). Update the fixture helper to add `ecdysis_id` column and a sample-only row; update the assertion to expect `specimen_count == 1`.

2. **Should `int_species_occurrences_agg.sql` get a comment?**
   - RESOLVED: yes, add the comment (Task 3). Completes the cross-reference chain; costs only a `dbt build` invocation.

## Environment Availability

Step 2.6: All tools already verified by prior phases (pytest, dbt, vitest). No new dependencies.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | pytest (Python), vitest (TypeScript) |
| Config file | `data/pyproject.toml` (pytest), `vitest.config.ts` |
| Quick run command | `cd data && uv run pytest data/tests/test_places_export.py -x` |
| Full suite command | `cd data && uv run pytest && npm test` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| SEM-01 | `places_export.py` specimen count excludes sample-only rows | unit (pytest) | `cd data && uv run pytest data/tests/test_places_export.py::test_places_json_counts -x` | ✅ exists, needs update |
| SEM-01 | `isSpecimenBacked` returns false for sample-only rows | unit (vitest) | `npm test -- src/tests/occurrence.test.ts` | ✅ already passes |
| SEM-01 | Canonical comment present in `occurrence.ts` | static-grep | `grep -A5 "Authoritative layer" src/occurrence.ts` | ❌ Wave 0 |

### Sampling Rate
- **Per task commit:** `cd data && uv run pytest data/tests/test_places_export.py -x`
- **Per wave merge:** `cd data && uv run pytest && npm test`
- **Phase gate:** Full suite green before `/gsd-verify-phase`

### Wave 0 Gaps
- [ ] `src/occurrence.ts` canonical comment block (SEM-01 success criterion 1) — no new file, just a comment addition
- [ ] `data/tests/test_places_export.py` fixture update with `ecdysis_id` column (SEM-01 success criterion 3)

## Security Domain

No security-relevant changes. This phase modifies a comment, one SQL predicate in a Python string, and a test fixture. No authentication, session management, access control, input validation, or cryptography involved.

## Sources

### Primary (HIGH confidence)
- Direct reading of `data/places_export.py` — `_query_counts` function, lines 50–61
- Direct reading of `src/occurrence.ts` — `isSpecimenBacked`, `isSampleOnly`, `isProvisional` functions
- Direct reading of `data/dbt/models/intermediate/int_combined.sql` — ARM 1 sets `is_provisional = FALSE` for both Ecdysis and sample-only rows
- Direct reading of `data/dbt/models/intermediate/int_species_occurrences_agg.sql` — reads `ecdysis_data.occurrences` directly
- Direct reading of `data/tests/test_places_export.py` — existing fixture schema confirms `ecdysis_id` is absent
- Direct reading of `src/tests/occurrence.test.ts` — Vitest tests for `isSpecimenBacked` already cover all three row types

### Secondary (MEDIUM confidence)
- `.planning/STATE.md` KEY GUARDRAILS: `dbt build` required after any `.sql` change

## Metadata

**Confidence breakdown:**
- Predicate analysis: HIGH — read all three diverging sites directly
- Fix direction: HIGH — `isSpecimenBacked` is clearly correct; `places_export.py` is the outlier
- Test pattern: HIGH — `test_places_export.py` pattern (PyArrow parquet fixture + DuckDB query) is established and working

**Research date:** 2026-05-18
**Valid until:** 60 days (stable codebase, no external dependencies)

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| SEM-01 | A single canonical "confirmed (non-provisional) specimen" predicate chosen and documented; `places_export.py` and the diverging frontend or SQL site updated to agree; a test confirms the chosen semantics hold | Canonical predicate is `ecdysis_id IS NOT NULL` (matches `isSpecimenBacked`). Fix: update `places_export.py:_query_counts`. Test: extend `test_places_json_counts` with explicit ecdysis_id fixture column. Comment: add cross-layer canonical comment in `occurrence.ts`. |
</phase_requirements>
