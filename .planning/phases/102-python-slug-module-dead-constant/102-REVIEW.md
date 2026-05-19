---
phase: 102-python-slug-module-dead-constant
reviewed: 2026-05-18T00:00:00Z
depth: standard
files_reviewed: 6
files_reviewed_list:
  - data/domain.py
  - data/feeds.py
  - data/species_export.py
  - data/dbt/models/intermediate/int_species_universe.sql
  - data/tests/test_domain.py
  - data/tests/test_feeds.py
findings:
  critical: 1
  warning: 2
  info: 2
  total: 5
status: issues_found
---

# Phase 102: Code Review Report

**Reviewed:** 2026-05-18T00:00:00Z
**Depth:** standard
**Files Reviewed:** 6
**Status:** issues_found

## Summary

Phase 102 promotes `_slugify` from a private function in `feeds.py` into a shared `domain.slugify`, removes the `BEE_FAMILIES` constant from `species_export.py` (now dead since SQL is the sole family filter), and wires the new module into both callers. The core refactor is clean and the byte-equivalence test in `test_domain.py` is rigorous.

One test assertion is definitively broken: `test_run_py_integration` looks up the step name `'export'` in `run.STEPS`, but that step does not exist — the step is named `'species-export'`. The `list.index()` call will raise `ValueError` and the test will error rather than pass or fail gracefully. The remaining two warnings are quality issues: a misleading module docstring on `species_export.py` and an untested slug-collision numbering edge case in `feeds.py`. Two info items cover redundant test coverage and a dead-code artifact in a comment.

## Critical Issues

### CR-01: `test_run_py_integration` references non-existent step name `'export'` — will always raise `ValueError`

**File:** `data/tests/test_feeds.py:158`
**Issue:** The test asserts that `'feeds'` comes after `'export'` in `run.STEPS`:
```python
export_idx = step_names.index('export')
```
But `run.STEPS` has no step named `'export'`. The actual step names are `'species-export'` (line 93 of `run.py`) and `'places-export'` (line 95). `list.index()` raises `ValueError` when the value is not found, so this test does not fail with an assertion error — it errors unconditionally, meaning the ordering invariant it is meant to guard is never actually checked.

**Fix:**
```python
# Change line 158:
export_idx = step_names.index('species-export')
```

## Warnings

### WR-01: Module docstring in `species_export.py` says slug is added "via `domain.slugify`" but the primary path (genus+epithet rows) bypasses `slugify` entirely

**File:** `data/species_export.py:86-87`
**Issue:** The `export_species_parquet` docstring says "appends a `slug` column via `domain.slugify`". This is only true for the fallback branch (genus-only or unknown rows, line 137). The main code path for species rows with both genus and epithet (line 134) constructs the slug as `f"{genus}/{epithet}"` directly — `slugify` is never called for those rows. The docstring creates a false invariant that could mislead a future author into thinking the slug column is always path-traversal-sanitized. The `/` in the slug is intentional (it creates the two-level `/species/genus/epithet/` URL), but it is architecturally significant and not guarded by the `slugify` safety net.

**Fix:** Correct the docstring to describe both branches:
```python
"""...
adds a ``slug`` column: ``"{genus}/{epithet}"`` for full-species rows (used as
a two-segment URL path) or ``domain.slugify(scientificName)`` for genus-only
fallbacks. The slug is written to species.parquet and species.json as-is.
"""
```

### WR-02: Slug collision numbering scheme assigns suffix starting at `2`, not `1`, which is undocumented and produces unintuitive filenames

**File:** `data/feeds.py:271-281`
**Issue:** The collision-resolution logic in `write_all_variants` initialises `seen_slugs[base_slug] = 1` on first encounter, then appends the count on collision: `slug = f'{base_slug}-{seen_slugs[base_slug]}'` (after incrementing to 2). So the first two distinct values that both map to `"jane-smith"` would produce files `collector-jane-smith.xml` and `collector-jane-smith-2.xml`. The third would be `collector-jane-smith-3.xml`. This is internally consistent but:
1. It is undocumented — a reader unfamiliar with the code would expect `-1` suffix for the first collision.
2. It is untested — no test exercises two distinct filter values that produce the same base slug. If a future refactor changes `seen_slugs[base_slug] = 1` to `= 0`, the first duplicate would silently overwrite the original file.

**Fix:** Add a test in `test_feeds.py` covering the collision path, and add a comment to the counter initialization explaining the `-2` start:
```python
seen_slugs[base_slug] = 1  # suffix starts at -2 on first collision (see below)
```
Or restructure to use a cleaner `defaultdict(int)` pattern with `+= 1` before slug construction and `if count > 1: slug = f'{base_slug}-{count}'`.

## Info

### IN-01: `test_slugify` in `test_feeds.py` duplicates tests already in `test_domain.py`

**File:** `data/tests/test_feeds.py:208-220`
**Issue:** `test_feeds.py::test_slugify` tests exactly the same inputs (`"Jane Smith"`, `""`, `"Müller"`, `"Mucera (subgenus)"`, `"../../etc/passwd"`) as `test_domain.py::test_slugify_basic`, `test_slugify_strips_punctuation`, and `test_slugify_path_traversal_safe`. Now that `slugify` is a shared domain function with its own dedicated test file, the copy in `test_feeds.py` adds no new coverage and will drift if the corpus in `test_domain.py` is extended. It should be removed.

**Fix:** Delete `test_feeds.py::test_slugify` (lines 208-220). The `from domain import slugify` import at line 16 can also be removed if no other test in the file uses it directly.

### IN-02: Comment in `int_species_universe.sql` references removed `BEE_FAMILIES` Python constant with present tense

**File:** `data/dbt/models/intermediate/int_species_universe.sql:71`
**Issue:** The comment reads "The Python `BEE_FAMILIES` constant in `species_export.py` was removed in Phase 102 (PY-02) because it was dead code." This is accurate history, but the phrasing "was removed" mixed with the live-filter description ("this SQL clause was always the real gate") reads awkwardly in context. This is a minor clarity nit — the information is correct, just inelegant.

**Fix:** Rephrase as a standalone note:
```sql
-- NOTE (Phase 102): The Python BEE_FAMILIES constant in species_export.py has been
-- removed. This WHERE clause is the sole bee-family gate in the pipeline.
```

---

_Reviewed: 2026-05-18T00:00:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
