---
phase: 141-built-asset-fixtures-red-test-fixes-silent-skip-elimination
verified: 2026-06-06T20:39:56Z
status: gaps_found
score: 4/6 must-haves verified
gaps:
  - truth: "The formerly-skipped dbt/parquet scaffold, diff, higher-taxa, and species-export assertions now run and pass on a clean checkout (SC-1)"
    status: failed
    reason: "test_dbt_scaffold.py and test_higher_taxa.py were never migrated. On a clean checkout (sandbox parquets absent): test_dbt_scaffold.py produces 19 D-05 ERRORs (its skip reasons match the guard signature); test_higher_taxa.py produces 16 silent SKIPs (its reasons include '--select higher_taxa' / '--select species' which do NOT match the guard signature due to argument variants). Reproduced: '1 passed, 16 skipped, 19 errors in 1.88s' with sandbox hidden."
    artifacts:
      - path: "data/tests/test_dbt_scaffold.py"
        issue: "No @integration marker on any test; all skipif guards use the D-05-matching reason string 'run `bash data/dbt/run.sh build` first to produce sandbox outputs'; these become 19 ERRORs on clean checkout"
      - path: "data/tests/test_higher_taxa.py"
        issue: "No @integration marker on any test; _SANDBOX_GUARD reason includes '--select higher_taxa' so it does NOT match the D-05 signature; tests silently skip on clean checkout (guard false-negative)"
    missing:
      - "Add pytestmark = pytest.mark.integration (or per-test @integration markers) to test_dbt_scaffold.py to deselect sandbox-gated tests from the fast tier — note test_profiles_yml_declares_spatial runs without a sandbox and should NOT be tagged"
      - "Add pytestmark = pytest.mark.integration (or per-test @integration markers) to test_higher_taxa.py for all _SANDBOX_GUARD and _SPECIES_GUARD decorated tests"
      - "Either fix the D-05 signature to match '--select' variants ('data/dbt/run.sh build' as stem), OR accept that test_higher_taxa.py's false-negative is covered once the @integration tags land"

  - truth: "A clean-checkout fast run reports 0 silent asset-driven skips; all remaining conditional skips are visible in the summary and confined to the integration tier (SC-5)"
    status: failed
    reason: "Two failure modes remain on a clean checkout: (a) test_dbt_scaffold.py produces 19 ERRORs (not the intended deselection), making the fast tier red; (b) test_higher_taxa.py produces 16 silent SKIPs because the D-05 guard's signatures do not match '--select' skip-reason variants — this is a guard false-negative that exactly defeats TFIX-04's stated acceptance criterion."
    artifacts:
      - path: "data/tests/conftest.py"
        issue: "_ASSET_SKIP_SIGNATURES[0] = 'run `bash data/dbt/run.sh build`' does not match 'run `bash data/dbt/run.sh build --select higher_taxa`' because the closing backtick appears after 'build' not after the argument; 16 test_higher_taxa.py skips pass through the guard undetected"
    missing:
      - "Fix _ASSET_SKIP_SIGNATURES to use the stable stem 'data/dbt/run.sh build' (without the closing backtick) so --select variants also match; or add explicit signature variants for the --select forms"
---

# Phase 141: Built-Asset Fixtures, Red-Test Fixes & Silent-Skip Elimination — Verification Report

**Phase Goal:** Tests that previously required un-checked-in built assets now run on a clean checkout using committed fixtures; the ~19 red tests are green; no test silently skips due to a missing asset in the fast tier; full-data checks are tagged @pytest.mark.integration.
**Verified:** 2026-06-06T20:39:56Z
**Status:** gaps_found
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths (ROADMAP SC-1 through SC-6)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| SC-1 | Scaffold, diff, higher-taxa, and species-export assertions run and pass on a clean checkout | FAILED | Reproduced: with sandbox parquets hidden, `pytest tests/test_dbt_scaffold.py tests/test_higher_taxa.py -m 'not integration' -q -rs` → 1 passed, 16 skipped, 19 errors. test_dbt_scaffold.py and test_higher_taxa.py were never migrated. |
| SC-2 | ~16 test_resolve_taxon_ids.py tests pass (resolver_db provides dbt_sandbox.occurrence_synonyms) | VERIFIED | `pytest tests/test_resolve_taxon_ids.py -m 'not integration' -q` → 19 passed |
| SC-3 | test_dbt_diff.py failures resolved (fixture-based or loud explicit skip, no silent pass) | VERIFIED | `pytest tests/test_dbt_diff.py -m 'not integration' -q` → 16 deselected; module-level pytestmark = pytest.mark.integration confirmed in file |
| SC-4 | test_at_least_13_fuzzy_candidates failure in test_resolve_checklist_names.py is fixed | VERIFIED | `pytest tests/test_resolve_checklist_names.py -m 'not integration' -q` → 6 passed, 1 deselected; the fuzzy test is tagged @integration and >=13 threshold is retained unweakened |
| SC-5 | Clean-checkout fast run reports 0 silent asset-driven skips; all remaining conditional skips visible and confined to integration tier | FAILED | 16 silent skips from test_higher_taxa.py (D-05 guard false-negative: '--select' variants don't match the signature); 19 errors from test_dbt_scaffold.py (guard fires correctly but produces errors instead of clean deselection). Neither file was migrated. |
| SC-6 | Genuine full-data checks tagged @pytest.mark.integration; pass when run against real built data | VERIFIED | test_dbt_diff.py: module-level integration marker confirmed. test_at_least_13_fuzzy_candidates: @integration confirmed, >=13 retained. test_species_maps: @integration on test_generate_group_maps_emits_subfamily_svgs confirmed. test_species_export / test_dbt_synonymy @integration assertions confirmed deselected from fast tier. |

**Score:** 4/6 truths verified

---

## Clean-Checkout Reproduction

The critical finding was independently reproduced in this verification session:

**Method:** Moved all files in `data/dbt/target/sandbox/` (untracked in git; confirmed via `git ls-files data/dbt/target/sandbox/` → empty) to `/tmp/sandbox_backup/`, ran the targeted test command, then restored. Git status confirmed clean after restore.

**Command:**
```
uv run pytest tests/test_dbt_scaffold.py tests/test_higher_taxa.py -m 'not integration' -q -rs
```

**Result:**
```
1 passed, 16 skipped, 19 errors in 1.88s
```

- **19 errors** from test_dbt_scaffold.py: D-05 guard fires on 19 tests whose skip reason `"run \`bash data/dbt/run.sh build\` first to produce sandbox outputs"` matches `_ASSET_SKIP_SIGNATURES[0]` exactly. The guard correctly detects asset-driven skips but these tests were never tagged @integration or given fixtures — so the fast tier goes hard-RED.
- **16 skips** from test_higher_taxa.py: D-05 guard does NOT fire because skip reasons include `--select higher_taxa` and `--select species` before the closing backtick, breaking the substring match. These pass through as silent skips — exactly the behavior the guard was designed to prevent.

This is a scope defect: the D-05 guard was installed globally but only 8 of the affected test files were migrated. Two files (`test_dbt_scaffold.py`, `test_higher_taxa.py`) that SC-1 explicitly names remained unaddressed.

---

## Gaps Detail

### Gap 1 (BLOCKER): test_dbt_scaffold.py and test_higher_taxa.py unmigrated (SC-1, SC-5)

These files are mentioned by name in SC-1 ("scaffold" and "higher-taxa" assertions) but Phase 141's four plans never touched them. The plans' `files_modified` lists do not include either file; the SUMMARY files confirm no changes were made to them.

**test_dbt_scaffold.py:** 0 occurrences of `integration` (grep confirmed). Contains 19 build-gated tests using `@pytest.mark.skipif` with reasons matching the D-05 signature. One test (`test_profiles_yml_declares_spatial`) runs without a sandbox and should remain in the fast tier.

**test_higher_taxa.py:** 0 occurrences of `integration` (grep confirmed). Contains 16 build-gated tests using two guards: `_SANDBOX_GUARD` (reason includes `--select higher_taxa`) and `_SPECIES_GUARD` (reason includes `--select species`). Neither reason matches the D-05 signature substring, so all 16 skip silently on a clean checkout.

**Minimum viable fix for both files:** Add `pytestmark = pytest.mark.integration` at module level (or per-test markers for the non-sandbox tests that should remain fast). This causes the build-gated tests to be deselected from the fast tier rather than skipped or errored.

**Important caveat (from CR-01 in the code review):** `test_dbt_scaffold.py::test_profiles_yml_declares_spatial` does not require a sandbox build — a blanket module marker would incorrectly deselect it. Per-test markers or a partial exclusion are needed for that file.

### Gap 2 (BLOCKER): D-05 guard false-negative for --select variants (SC-5, WR-01 in REVIEW)

`_ASSET_SKIP_SIGNATURES[0]` is `"run \`bash data/dbt/run.sh build\`"` (with closing backtick immediately after `build`). The `test_higher_taxa.py` `_SPECIES_GUARD` reason is `"run \`bash data/dbt/run.sh build --select species\` first..."` — the closing backtick appears after the argument, not after `build`, so the substring match is False. Verified with Python:

```python
sig = "run `bash data/dbt/run.sh build`"
reason = "run `bash data/dbt/run.sh build --select species` first to produce species.parquet"
print(sig in reason)  # False
```

This means any test file that uses `--select` argument variants in its skip reasons bypasses the D-05 guard. The guard's false-negative range extends to any future file that follows the same pattern.

**Fix:** Replace the backtick-delimited exact phrase with the stable stem `"data/dbt/run.sh build"` (no backtick), which matches both bare and `--select` variants. Note: fix CR-01 first (tag the unmigrated files @integration) before broadening the signature — otherwise the broadened matcher will convert even more skips to errors before those files are tagged.

---

## What DID Pass

The 8 files in-scope for Phase 141's four plans are green in the fast tier:

| File | Fast-tier result | Notes |
|------|-----------------|-------|
| test_resolve_taxon_ids.py | 19 passed | resolver_db fixture provides dbt_sandbox.occurrence_synonyms |
| test_species_export.py | 8 passed, 2 deselected | sandbox_parquet fixture; @integration on higher_taxa_json count assertion |
| test_dbt_synonymy.py | 3 passed | synonymy_sandbox fixture; @integration deselects |
| test_checklist_pipeline.py | 38 passed, 3 skipped, 2 deselected | checklist_db save/restore; exact 6/8 count assertions |
| test_dbt_diff.py | 16 deselected | module-level pytestmark = integration |
| test_resolve_checklist_names.py | 6 passed, 1 deselected | fuzzy test @integration, >=13 threshold retained |

Committed fixture CSVs (`species_fixture.csv`, `higher_taxa_fixture.csv`, `occurrences_fixture.csv`) exist in `data/tests/fixtures/`. No production code was changed. The D-05 guard mechanism itself is technically correct — it fires as a generator, mutates `report.outcome`, and exempts @integration tests and xfail outcomes properly.

---

## Warnings (Non-Blocking)

These come from the code review (141-REVIEW.md) and are documented here for the gap-closure plan's awareness:

**WR-02: `sandbox_parquet` reimplements `_build_higher_taxa` (risk of silent drift).** The fixture replaces the production function with a full copy rather than patching only the `==12` assertion. If the production function changes, the fast-tier tests can silently diverge. The `==12` check is correctly retained as an @integration assertion. Recommended fix: extract the count assertion into a patchable helper, or add a comment pinning the reimplementation to the production line range.

**WR-03: `test_inat_obs_count_uses_synonymized_canonical_name` cannot fail on the texanus=0 invariant.** `species_fixture.csv` has no texanus row, so the conditional branch guarding the texanus assertion is never entered. The test only verifies that the subtilior row exists with `inat_obs_count >= 0` — a near-tautology. The synonymy roll-up behavior is not exercised in the fast tier. Fix: add a texanus row with `inat_obs_count=0` to the fixture, or rename the test to reflect what it actually checks.

---

## Requirements Coverage

| Requirement | Description | Status | Evidence |
|-------------|-------------|--------|----------|
| TFIXTURE-03 | Tests dependent on dbt sandbox parquets run on clean checkout via committed fixtures | PARTIAL | 8 migrated files pass; test_dbt_scaffold.py and test_higher_taxa.py (both named in SC-1) not migrated |
| TFIX-01 | ~16 test_resolve_taxon_ids.py failures fixed | SATISFIED | 19 passed |
| TFIX-02 | test_dbt_diff.py failures resolved (no silent pass) | SATISFIED | All 16 deselected via module-level @integration |
| TFIX-03 | test_at_least_13_fuzzy_candidates fixed | SATISFIED | @integration tagged, >=13 retained |
| TFIX-04 | 0 silent asset-driven skips in fast-tier clean-checkout run | FAILED | 16 silent skips in test_higher_taxa.py (guard false-negative); test_dbt_scaffold.py produces 19 errors instead of clean deselection |
| TTIER-02 | Full-data checks tagged @integration; pass against real data | SATISFIED | test_dbt_diff (module marker), fuzzy (per-test), species_maps (per-test), species_export/synonymy counts (per-test) |

---

## Gaps Summary

Phase 141 achieved its goal for 6 of 8 in-scope test files and all of SC-2, SC-3, SC-4, SC-6. The phase fails SC-1 and SC-5 because two files explicitly named in the phase goal (`test_dbt_scaffold.py` and `test_higher_taxa.py`) were never migrated. The D-05 guard was installed globally and correctly detects asset-driven skips in the 8 migrated files, but its signature set does not cover `--select` argument variants in skip reasons, producing a guard false-negative for all of `test_higher_taxa.py`.

The fast tier is only green locally because `dbt/target/sandbox/*.parquet` happen to exist on disk. On a clean checkout these files cause either hard ERRORs (`test_dbt_scaffold.py`) or silent SKIPs (`test_higher_taxa.py`), directly contradicting the phase goal and TFIX-04's acceptance criterion.

**Root cause:** Scope gap — the four plans' `files_modified` lists never included `test_dbt_scaffold.py` or `test_higher_taxa.py`, yet these files are covered by the D-05 guard (one matches it, one exposes its false-negative range) and are named in SC-1.

**Gap-closure actions for the remediation plan:**
1. Tag `test_dbt_scaffold.py` build-gated tests @integration (carefully preserving `test_profiles_yml_declares_spatial` in the fast tier)
2. Tag `test_higher_taxa.py` build-gated tests @integration
3. Fix `_ASSET_SKIP_SIGNATURES[0]` stem to `"data/dbt/run.sh build"` to catch `--select` variants
4. Verify with sandbox absent: `uv run pytest tests/test_dbt_scaffold.py tests/test_higher_taxa.py -m 'not integration' -q` → 1 passed, N deselected, 0 errors, 0 skips

---

_Verified: 2026-06-06T20:39:56Z_
_Verifier: Claude (gsd-verifier)_
