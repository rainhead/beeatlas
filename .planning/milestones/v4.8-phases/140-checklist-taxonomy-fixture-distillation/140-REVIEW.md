---
phase: 140-checklist-taxonomy-fixture-distillation
reviewed: 2026-06-06T00:00:00Z
depth: standard
files_reviewed: 4
files_reviewed_list:
  - data/checklist_pipeline.py
  - data/resolve_checklist_names.py
  - data/tests/test_checklist_pipeline.py
  - data/tests/test_resolve_checklist_names.py
findings:
  critical: 0
  warning: 2
  info: 3
  total: 5
status: issues_found
---

# Phase 140: Code Review Report

**Reviewed:** 2026-06-06
**Depth:** standard
**Files Reviewed:** 4
**Status:** issues_found

## Summary

Reviewed the Phase 140 fixture-distillation changes: the `con=None` injected-connection
seam on `load_checklist()`, the `TAXA_PATH` module-constant extraction in
`resolve_checklist_names.py`, and the rewrite of the two test files onto a module-scoped
shared in-memory fixture (`checklist_sample_db`) backed by committed micro-fixtures.

The two production seams are **behavior-preserving** and the test rewrite is **functionally
correct**. I verified by direct execution: the default suite for both files runs
44 passed / 1 expected-red (`test_at_least_13_fuzzy_candidates`, Phase 141 scope, not a
bug) / 3 skipped. The connection-injection guard is sound: `_owns_connection` is captured
before the connect, the `try`/`finally` is entered only after a successful connect, and
`con.close()` runs only when the function owns the connection. The nightly path
(`run.py` STEPS → `load_checklist()` with no args) is unchanged.

No blocking defects. Two warnings cover a genuine cross-fixture state-management fragility
(does not currently cause failures but is one ordering change away from a silent
false-pass) and a relaxed-assertion regression in coverage strength. Three info items
cover a fixture-doc mismatch and minor consistency nits.

## Warnings

### WR-01: Module-scoped fixture and `importlib.reload` mutate the same live module object — correctness depends on collection order

**File:** `data/tests/test_checklist_pipeline.py:60-126` (and `:33-57`, `:413-453`)
**Issue:**
`checklist_sample_db` (module-scoped) patches the live `checklist_pipeline` module object
in place (`mod.CHECKLIST_RECORDS_FULL_PATH = ...`, `mod.TAXA_PATH = ...`,
`mod._TAXA_ANCESTRY = None`) and stays alive for the whole module. The two
`@pytest.mark.integration` tests use the function-scoped `checklist_db` fixture, which calls
`importlib.reload(checklist_pipeline)` (line 51) — re-executing the module body and
**resetting every patched constant and the `_TAXA_ANCESTRY` cache back to production
values on the same `sys.modules` object** while the module-scoped fixture is still alive.

Today this does not cause a failure only because the shared in-memory `con` is fully
populated during `checklist_sample_db` setup (before any reload runs), and the subsequent
`checklist_sample_db` tests query that already-loaded connection rather than re-reading the
patched paths. So the *data* is frozen at setup time and survives the reload.

The fragility: this is an implicit dependency on (a) the module-scoped `con` being loaded
exactly once before the first reload, and (b) no `checklist_sample_db` test ever calling
`load_checklist(con=con)` *after* an integration test in the same session re-pointed
`CHECKLIST_RECORDS_FULL_PATH`/`TAXA_PATH` at the real 50k CSV. The two idempotency tests
(`test_load_checklist_is_idempotent:221`, `test_checklist_records_full_is_idempotent:559`)
*do* re-call `load_checklist(con=con)`; they happen to run before the integration tests in
declaration order, but a reorder (e.g. `pytest-randomly`, which the suite installs — runs
were forced with `-p no:randomly` to reproduce), a marker change, or splitting the file
would silently re-load the **real** 50k-row CSV into the shared in-memory connection. The
sample-count assertions (`null_coord == 1`, `n_none == 3`, `n >= 1`) would then either flip
to a false pass (`>= 1`) or fail confusingly far from the cause.

Additionally, after an integration test reloads the module, `_TAXA_ANCESTRY` is left
populated with the **real** `taxa.csv.gz` (~tens of thousands of entries) on the module
object; `checklist_sample_db.teardown()` then overwrites it with `old_cache` (the original
captured value, normally `None`) — so teardown masks the leak rather than the leak being
absent. The restoration is only correct because `old_cache` was captured before any reload.

**Fix:** Make the cross-fixture contract explicit and order-independent. Either:
- Drop `importlib.reload` from `checklist_db` and have the integration fixture set
  `DB_PATH` + read paths via the same save/restore (`setattr`) discipline as
  `checklist_sample_db`, so no fixture ever re-executes the module body while another
  fixture's patches are live; or
- Add an `autouse` guard that asserts the module-scoped patches are intact at the start of
  each `checklist_sample_db` test (e.g. `assert mod.CHECKLIST_RECORDS_FULL_PATH ==
  FIXTURES_DIR / "checklist_sample.csv"`), turning a silent false-pass into a loud failure.

Pin determinism for this file explicitly (the repo installs `pytest-randomly`):
```python
# at module top
pytestmark = pytest.mark.order  # or document/enforce -p no:randomly for this module
```

### WR-02: Coverage-strength regression — `n >= 1` assertions can no longer detect an empty load

**File:** `data/tests/test_checklist_pipeline.py:167`, `:209`
**Issue:**
`test_load_checklist_populates_species_rows` and
`test_load_checklist_creates_species_counties_table` relaxed their row-count assertions from
`n > 100` to `n >= 1`. The stated reason (DuckDB `executemany` on 527 rows is ~3s) is
legitimate, and the structural invariants (`n_null == 0`, `n_status == 0`, column lists)
are preserved. But `n >= 1` is so loose it would pass even if the loader inserted exactly
one accidental row, or if a future bug truncated the species set. The committed
`wa_bee_checklist_sample.tsv` has a **known, fixed** species count (6 distinct species; 8
`(species, county)` rows per the fixture README). The assertion should pin the exact sample
count, not merely "non-empty," to retain regression power.

**Fix:**
```python
# species: wa_bee_checklist_sample.tsv has exactly 6 distinct species
assert n == 6, f"expected 6 distinct species in sample, got {n}"
...
# species_counties: exactly 8 (species, county) rows
assert n == 8, f"expected 8 (species, county) rows in sample, got {n}"
```
This matches the pattern already used (correctly) for `null_coord == 1` (`:497`) and
`n_none == 3` (`:546`) in the same file.

## Info

### IN-01: `taxa_subset.csv.gz` fixture README undercounts its own rows

**File:** `data/tests/fixtures/README` (describes a fixture read by both reviewed modules)
**Issue:** The README states `taxa_subset.csv.gz` "Contains only the two Anthophila species
needed for the angelicus/texanus LCA test." The actual file contains **three** rows: the
two species plus the subgenus `Agapostemon` (taxon_id 606634). The subgenus row is
load-bearing — `checklist_pipeline._lca_canonical_name()` (`:103-110`) needs it to resolve
the LCA taxon_id 606634 back to a name for the slash-compound `canonical_name`. The doc
understates the fixture and could lead a future maintainer to "trim" the subgenus row and
silently break LCA name resolution in `test_checklist_records_full_slash_rows_get_lca_canonical_name`.

**Fix:** Update the README to say three rows (two species + the subgenus LCA node), and note
the subgenus row is required by `_lca_canonical_name()`.

### IN-02: `TAXA_PATH` type differs across the two modules (`str` vs `Path`)

**File:** `data/resolve_checklist_names.py:41` vs `data/checklist_pipeline.py:33`
**Issue:** `resolve_checklist_names.TAXA_PATH` is a `str`; `checklist_pipeline.TAXA_PATH` is a
`Path`. Each is behavior-preserving within its own module (matches prior call-site usage),
so this is not a bug. But the two constants share a name and point at the same file, and the
fixture-override sites assign different types (`test_resolve_checklist_names.py:105-106`
assigns a `str`; `test_checklist_pipeline.py:100` assigns a `Path`). A future refactor that
unifies these (or copies a patch line between the two test files) could pass the wrong type.
Worth a one-line comment noting the intentional type difference, or normalizing both to
`Path` with `str()` at call sites.

### IN-03: Dead documentation-only skip stubs retained

**File:** `data/tests/test_checklist_pipeline.py:371-402`
**Issue:** Three `@pytest.mark.skip` `reconcile`-era tests remain as empty `pass` bodies
"kept as documentation only." They are not introduced by this phase, but they sit in a file
this phase rewrote and add noise to a file whose stated goal was distillation. Not a defect;
consider deleting them now that `reconcile()` is retired (the `test_no_active_reconcile_call`
/ `test_single_synonym_source` guards at `:693-743` already enforce its absence).

---

_Reviewed: 2026-06-06_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
