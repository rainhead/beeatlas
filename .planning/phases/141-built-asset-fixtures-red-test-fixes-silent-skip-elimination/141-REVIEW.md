---
phase: 141-built-asset-fixtures-red-test-fixes-silent-skip-elimination
reviewed: 2026-06-06T20:34:12Z
depth: standard
files_reviewed: 8
files_reviewed_list:
  - data/tests/conftest.py
  - data/tests/test_resolve_taxon_ids.py
  - data/tests/test_species_export.py
  - data/tests/test_dbt_synonymy.py
  - data/tests/test_dbt_diff.py
  - data/tests/test_species_maps.py
  - data/tests/test_resolve_checklist_names.py
  - data/tests/test_checklist_pipeline.py
findings:
  critical: 1
  warning: 4
  info: 3
  total: 8
status: issues_found
---

# Phase 141: Code Review Report

**Reviewed:** 2026-06-06T20:34:12Z
**Depth:** standard
**Files Reviewed:** 8 (plus 3 committed fixture CSVs and 2 out-of-scope test files cross-referenced)
**Status:** issues_found

## Summary

Phase 141 is a test-honesty/distillation phase: no production code changed (verified — the diff touches only `tests/`, `fixtures/`, and `.planning/`). The core mechanisms were exercised empirically:

- The `sandbox_parquet` and `synonymy_sandbox` fixtures build parquet from committed CSVs and correctly redirect module constants via `monkeypatch.setattr` on the module object. The `month_histogram` `json_extract(...)::INTEGER[]` and `CAST(... AS BOOLEAN)` casts both verified working against DuckDB 1.x. The in-scope fast tier passes (`11 passed, 2 deselected` for `test_species_export.py` + `test_dbt_synonymy.py`).
- The D-05 hookwrapper is a correct generator (`outcome = yield`), the `report.outcome = "failed"` mutation works under pytest 9.0.3, and the filters for legitimate skips, `@integration` deselects, and xfail were verified inert in an isolated harness.
- The WR-01 `checklist_db` save/restore of `mod.DB_PATH` is correct and disjoint from the constants saved/restored by the module-scoped `checklist_sample_db`; no shared-state bleed.

The serious problem is **scope**: the D-05 guard is registered globally in `conftest.py` and fires across the *entire* suite, but Phase 141 only migrated the files in its own list. Two unmigrated, non-`@integration` files (`test_dbt_scaffold.py`, `test_higher_taxa.py`) contain asset-driven skips. I reproduced a clean checkout (sandbox parquets are untracked in git) by hiding `dbt/target/sandbox/*.parquet`: the fast tier goes **RED with 17 errors** from `test_dbt_scaffold.py` alone. This directly contradicts the phase's stated goal of "fast tier: 0 skips, 0 failures on a clean checkout." This is filed as the BLOCKER below. (Sandbox parquets were restored and the suite verified green again.)

## Critical Issues

### CR-01: D-05 guard turns the fast tier RED on a clean checkout via unmigrated files (`test_dbt_scaffold.py`)

**File:** `data/tests/conftest.py:604-642` (guard); root cause is unmigrated `data/tests/test_dbt_scaffold.py:30-32, 39-41, 117-119, 187-189, 214-216, 255-257`

**Issue:** The `pytest_runtest_makereport` hookwrapper lives in the top-level `tests/conftest.py`, so it applies to *every* test in the suite, not just the eight files in Phase 141's scope. `test_dbt_scaffold.py` has no `pytestmark = pytest.mark.integration` and no per-test `@integration` markers (verified: `grep -c integration tests/test_dbt_scaffold.py` → 0), yet ~17 of its tests are guarded by `@pytest.mark.skipif(..., reason="run \`bash data/dbt/run.sh build\` first to produce sandbox outputs")` — a reason that matches `_ASSET_SKIP_SIGNATURES[0]` exactly.

The sandbox parquets (`dbt/target/sandbox/*.parquet`) are **not tracked in git** (`git ls-files dbt/target/sandbox/` is empty), so on a clean checkout they are absent and these skips fire. The D-05 guard then rewrites each to `report.outcome = "failed"`. Reproduced by hiding the sandbox parquets and running the fast tier:

```
ERROR tests/test_dbt_scaffold.py::test_occurrences_parquet_exists - [D-05 GUARD] ...
... (17 ERROR lines total)
11 passed, 16 skipped, 2 deselected, 17 errors in 2.71s
```

The defect is masked on the current dev machine only because `dbt/target/sandbox/*.parquet` happen to exist on disk. The phase claims to *eliminate* the degraded-pass-with-skips mode, but on a clean checkout it instead produces a hard-red fast tier for files it never migrated.

**Fix:** Bring the unmigrated asset-skipping files into the phase's regime. Either tag the build-dependent tests `@pytest.mark.integration` (so they are deselected, not skipped) or convert them to committed-fixture-backed fast-tier tests, mirroring the `sandbox_parquet` pattern. Minimum viable fix — add a module-level marker to each affected file:

```python
# top of data/tests/test_dbt_scaffold.py (and test_higher_taxa.py)
pytestmark = pytest.mark.integration
```

Then re-run with the sandbox absent to confirm `0 errors, 0 unexpected skips, N deselected`. (Note: `test_dbt_scaffold.py` also has non-asset tests like `test_profiles_yml_declares_spatial` that do not need the sandbox — a blanket module marker would over-deselect those; prefer per-guard tagging or per-test markers there.)

## Warnings

### WR-01: D-05 false-negative — `test_higher_taxa.py` build-gated tests silently skip (defeats TFIX-04 for that file)

**File:** `data/tests/conftest.py:604-608` (signatures); `data/tests/test_higher_taxa.py:62`

**Issue:** `test_higher_taxa.py`'s primary species-parquet guard uses the reason `"run \`bash data/dbt/run.sh build --select species\` first to produce species.parquet"`. The signature `_ASSET_SKIP_SIGNATURES[0]` is `"run \`bash data/dbt/run.sh build\`"` — with a closing backtick immediately after `build`. Because the real reason has ` --select species` *before* the backtick, the substring does **not** match (verified: `'run \`bash data/dbt/run.sh build\`' in reason` → `False`). These non-`@integration` tests therefore skip silently on a clean checkout — exactly the false-negative TFIX-04 is meant to catch. The guard's substring set is brittle to benign wording variants of the same "run dbt build" instruction.

**Fix:** Either (a) tag `test_higher_taxa.py` build-gated tests `@pytest.mark.integration` as part of completing CR-01, and/or (b) make the signature match more robust to argument variants, e.g. match the stable stem `"data/dbt/run.sh build"` rather than the back-ticked exact phrase:

```python
_ASSET_SKIP_SIGNATURES = (
    "data/dbt/run.sh build",          # matches plain + `--select` variants
    "run species-export first",
    "species_export.py",
)
```

Be aware that broadening the stem increases the blast radius of CR-01 — fix CR-01 (tag/fixture the unmigrated files) before broadening, or the broadened matcher will red even more skips.

### WR-02: `sandbox_parquet` reimplements (not patches) production `_build_higher_taxa`, risking silent drift

**File:** `data/tests/test_species_export.py:105-126`; production at `data/species_export.py:135-168`

**Issue:** The fixture replaces `se_mod._build_higher_taxa` with a full reimplementation `_fixture_build_higher_taxa` that copies the production body (read parquet → build dicts → write `higher_taxa.json`) and drops only the `assert subfamily_count == 12`. The flagged concern (141-03) is valid: this is not a narrow patch of the count assertion — it is a parallel copy of the function. If production `_build_higher_taxa` changes its `SELECT`/`ORDER BY`, output filename, JSON serialization options, or adds logic (e.g. a new invariant or a column transform), the fixture copy silently diverges and the three fast-tier tests that consume `sandbox_parquet` (`test_higher_rank_taxon_ids_not_written`, `test_export_runs_collision_check_clean`, plus the slug tests) keep passing against stale, reimplemented behavior. The real `==12` check is correctly retained in the `@integration` `test_higher_taxa_json_written_and_12_subfamilies`, so the count regression itself is still covered — but any *other* regression inside `_build_higher_taxa` is now invisible to the fast tier.

**Fix:** Prefer patching the single offending assertion rather than reimplementing the function. Cleanest options: (a) extract the `==12` check into a small helper in production (`_assert_bee_subfamily_count(rows)`) and monkeypatch only that helper to a no-op in the fixture; or (b) parameterize the expected count so the fixture can pass `expected_subfamilies=2`. Either keeps the fast tier exercising the real read/write/serialize path. If reimplementation must stay, add a comment pinning it to the production line range and a CI check that the two bodies stay in sync.

### WR-03: `test_inat_obs_count_uses_synonymized_canonical_name` cannot fail on the texanus=0 invariant with the current fixture

**File:** `data/tests/test_dbt_synonymy.py:129-163`; fixture at lines 67-76

**Issue:** The test's headline claim is that `inat_obs_count` for `agapostemon texanus` is 0 (rolled up under `subtilior`). But `species_fixture.csv` contains no `agapostemon texanus` row at all, so `texanus_count_row is None` and the entire `texanus` assertion (lines 146-151) is skipped by the `if texanus_count_row is not None:` guard. The test then only asserts that the `subtilior` row exists with `inat_obs_count >= 0` — a near-tautology (any non-negative integer passes). The synonymy roll-up behavior the test name advertises is not actually exercised by the fast-tier fixture; it is only really tested in the dbt-built `@integration` path. This is an over-claiming test, not a correctness bug, but it weakens confidence that SYN-03 is covered in the fast tier.

**Fix:** Either rename/scope the fast-tier assertion to what it genuinely checks ("subtilior row is present and inat_obs_count is queryable"), or add a `texanus` row to `species_fixture.csv` with `inat_obs_count=0` so the conditional branch actually executes and can fail. Document explicitly that the roll-up (texanus inat_obs counted under subtilior) is an `@integration`-only assertion if the fixture cannot express it.

### WR-04: D-05 guard mutates `report.longrepr` but skip-phase reports surface as ERROR, obscuring intent

**File:** `data/tests/conftest.py:636-641`

**Issue:** For `@pytest.mark.skipif`-decorated tests, the skip is reported during the **setup** phase. Setting `report.outcome = "failed"` on a setup-phase report makes pytest classify it as an "ERROR at setup", not a "FAILURE" (verified empirically). Runtime `pytest.skip()` calls (call phase) become FAILUREs. Both are non-zero exit, so TFIX-04's enforcement intent holds — but the mixed ERROR/FAILURE presentation for what is conceptually one class of defect is confusing, and a reader seeing "ERROR at setup of test_x" may misdiagnose it as a fixture bug rather than a D-05 policy violation. The custom `[D-05 GUARD]` longrepr does appear, which mitigates this, but the pytest-level category is still "error".

**Fix:** Acceptable as-is for enforcement, but consider documenting in the hookwrapper docstring that `skipif`-decorated tests surface as setup ERRORs (not FAILUREs) so future maintainers do not chase a phantom fixture failure. No code change strictly required.

## Info

### IN-01: Committed `occurrences_fixture.csv` is unused dead fixture data

**File:** `data/tests/fixtures/occurrences_fixture.csv`

**Issue:** Neither `sandbox_parquet` (test_species_export.py — builds occurrences via `CREATE TABLE occ_staging ... INSERT ... COPY`) nor `synonymy_sandbox` (test_dbt_synonymy.py — same in-test build) reads `occurrences_fixture.csv`. The file's own header comment says it covers the two `test_dbt_synonymy` occurrence assertions, but those tests get their occurrences from the in-test `CREATE TABLE`/`INSERT`, not from this CSV. The committed CSV is currently dead.

**Fix:** Either wire `synonymy_sandbox` to `read_csv` this committed fixture (which would make the test's data provenance auditable in-repo, the apparent intent), or delete the file to avoid a misleading "this is the source of truth" artifact.

### IN-02: Redundant `monkeypatch.setenv("DB_PATH", ...)` in `checklist_db` after WR-01 refactor

**File:** `data/tests/test_checklist_pipeline.py:54`

**Issue:** WR-01 replaced `importlib.reload()` with direct `mod.DB_PATH = db_path` save/restore. `load_checklist()` connects via the module global `DB_PATH` (verified `checklist_pipeline.py:528 con = duckdb.connect(DB_PATH)`), not by re-reading the env var. With the reload gone, the `monkeypatch.setenv("DB_PATH", db_path)` on line 54 no longer has any effect on the code path under test. It is harmless (monkeypatch auto-restores) but misleading — it implies the env var matters here when only the direct attribute set does.

**Fix:** Drop the `monkeypatch.setenv("DB_PATH", db_path)` line, or add a one-line comment that it is retained only for defensiveness against any future env-reading code path.

### IN-03: `test_resolve_taxon_ids.py` D-06 fixture still uses `importlib.reload` while sibling fixtures moved to save/restore

**File:** `data/tests/test_resolve_taxon_ids.py:61, 67`

**Issue:** The `resolver_db` fixture still calls `importlib.reload(inaturalist_pipeline)` and `importlib.reload(resolve_taxon_ids)`. WR-01 documents that `importlib.reload()` re-executes the module body and "clobbers any patches set by [a module-scoped fixture] when tests run in random order (pytest-randomly)." `test_resolve_taxon_ids.py` has no module-scoped peer fixture, so there is no concrete bleed here today — but the inconsistency with the WR-01 discipline is a latent hazard if a module-scoped fixture is ever added to this file, and it contradicts the rationale recorded in the `checklist_db` docstring. Not a defect in this phase's scope; noted for consistency.

**Fix:** No action required for Phase 141. If reload-vs-save/restore is meant to be a project-wide convention, schedule `resolver_db` for the same treatment in a follow-up.

---

_Reviewed: 2026-06-06T20:34:12Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
