---
phase: 92-slug-migration-pipeline-prep
verified: 2026-05-15T22:45:00Z
status: human_needed
score: 6/7 must-haves verified
overrides_applied: 0
human_verification:
  - test: "Run npm run build end-to-end after pipeline regenerates public/data/species.json with new slug format"
    expected: "Build succeeds with zero validate-species warnings and no broken SVG references in the generated HTML"
    why_human: "public/data/ is gitignored; local artifacts are stale (May 14, pre-Phase-92). Phase 92 commits are not yet pushed to origin so CI has not run. The pipeline code is verified correct via live pytest runs against the sandbox parquet, but full end-to-end build verification requires fresh pipeline output that is not available on this machine."
---

# Phase 92: Slug Migration & Pipeline Prep Verification Report

**Phase Goal:** Prepare the data pipeline for slug migration — emit Genus/epithet hierarchical slugs, write SVGs into per-genus subdirectories, audit and clean species-photos.toml TOML keys to zero orphan warnings.
**Verified:** 2026-05-15T22:45:00Z
**Status:** human_needed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|---------|
| 1 | `species_export.py` emits `Genus/specificEpithet` slugs for species rows | VERIFIED | `data/species_export.py` line 144: `r['slug'] = f"{genus}/{epithet}"`. Live run against sandbox parquet: 527 species rows all have slash-format slug, 0 flat slugs. Both pytest tests GREEN. |
| 2 | `species_maps.py` writes SVGs into per-genus subdirectories (`Genus/epithet.svg`) | VERIFIED | Line 168: `out_path.parent.mkdir(parents=True, exist_ok=True)`. `test_write_species_svg_creates_subdir` PASSES with `Andrena/milwaukeensis.svg` correctly created in subdir. |
| 3 | `species_maps.py` total-size summary uses `rglob` not `glob` | VERIFIED | Line 247: `maps_dir.rglob('*.svg')`. No `glob('*.svg')` present. Invariant comment "NEVER recompute slug from scientificName here" preserved at line 200. |
| 4 | Wave 0 tests (`test_species_export.py`, `test_species_maps.py`) pass GREEN | VERIFIED | All 3 tests PASS: `test_slug_hierarchical`, `test_no_old_slug_format`, `test_write_species_svg_creates_subdir`. Confirmed by running `cd data && uv run pytest tests/test_species_export.py tests/test_species_maps.py -v`. |
| 5 | `validate-species.test.ts` fixture slug updated to `'Osmia/lignaria'` | VERIFIED | Line 14 of `src/tests/validate-species.test.ts` reads `slug: 'Osmia/lignaria'`. All 16 validate-species tests PASS. |
| 6 | `content/species-photos.toml` has zero orphan keys — `npm run validate-species` exits 0 with 0 warnings | VERIFIED | Running `node scripts/validate-species.mjs` returns `ok content/species-photos.toml (629 species, 0 warning(s))`. Audit JSON at `92-03-toml-audit.json` documents all 106 removed dispositions (all non-bee taxa). |
| 7 | Running the export pipeline end-to-end produces `species.json` where every species slug matches the hierarchical pattern | UNCERTAIN | Code produces correct slugs (verified via live python invocation: 527/527 species-level rows have slash format). BUT: `public/data/species.json` on disk is stale (May 14, before Phase 92). The file is gitignored; the pipeline ran in an executor worktree that was subsequently removed. The ground truth is the pipeline code, which is correct. The nightly pipeline on maderas will regenerate it. |

**Score:** 6/7 truths verified (truth 7 is UNCERTAIN — pipeline code is correct but local artifacts are pre-Phase-92)

### Deferred Items

No deferred items. All phase truths are either verified or uncertain on artifact state (not a future-phase concern).

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `data/species_export.py` | Hierarchical slug emission (`f"{genus}/{epithet}"`) | VERIFIED | Line 144 contains exact f-string. `_slugify` fallback at line 147. `from feeds import _slugify` retained at line 30. |
| `data/species_maps.py` | `out_path.parent.mkdir(parents=True, exist_ok=True)` + `rglob` | VERIFIED | mkdir at line 168, rglob at line 247. No flat `glob('*.svg')` remains. |
| `data/tests/test_species_export.py` | 2 test functions with `_SANDBOX_GUARD` | VERIFIED | `test_slug_hierarchical` and `test_no_old_slug_format` exist with SANDBOX guard. Both PASS against sandbox parquet. |
| `data/tests/test_species_maps.py` | 1 test function `test_write_species_svg_creates_subdir` | VERIFIED | Exists, PASSES confirming mkdir behavior. |
| `src/tests/validate-species.test.ts` | Fixture slug `'Osmia/lignaria'` at line 14 | VERIFIED | Line 14: `slug: 'Osmia/lignaria'`. All 16 tests pass. |
| `content/species-photos.toml` | All 629 keys matching `species.json` scientificName values | VERIFIED | 735 keys before, 106 non-bee-taxa orphans removed, 629 keys remain. 0 validate-species warnings. |
| `.planning/phases/92-slug-migration-pipeline-prep/92-03-toml-audit.json` | Audit report with disposition per orphan | VERIFIED | Exists. `total_toml_keys: 735`, `total_orphans: 106`, `dispositions: 106` entries (all `remove`). Each entry has `original_key`, `proposed_action`, `target_key`, `rationale`, `photo_count`. |
| `public/data/species.json` | 629 rows with hierarchical slugs | UNCERTAIN | On-disk file is from May 14 (pre-Phase-92, gitignored). Live pipeline run produces correct format. |
| `public/data/species-maps/{Genus}/*.svg` | Per-genus subdirectory tree | UNCERTAIN | On-disk directory has flat May 4 layout (gitignored). Pipeline code correctly writes to subdirs. |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `data/species_export.py` slug loop | `f"{genus}/{epithet}"` | Conditional on `genus and epithet` truthy | WIRED | Lines 141-147: genus extracted, epithet extracted, conditional f-string applied. Fallback for genus-only rows uses bare genus name. |
| `data/species_maps.py` `_write_species_svg` | `out_path.parent` (Genus/ subdir) | `out_path.parent.mkdir(parents=True, exist_ok=True)` | WIRED | Line 168 inserts mkdir before `out_path.write_text` at line 169. |
| `data/species_maps.py` `generate_species_maps` total_size | All SVGs in genus subdirs | `maps_dir.rglob('*.svg')` | WIRED | Line 247 uses rglob; no flat glob remains. |
| `content/species-photos.toml [species.*]` keys | `public/data/species.json[*].scientificName` | `scripts/validate-species.mjs` `knownNames.has(name)` | WIRED | 0 orphan warnings confirms all 629 TOML keys match known scientificName values. |
| `src/tests/validate-species.test.ts` fixture | `slug: 'Osmia/lignaria'` | Line 14 string literal | WIRED | Confirmed by reading file. All 16 tests pass. |

### Data-Flow Trace (Level 4)

Not applicable for this phase — all artifacts are pipeline scripts and test files, not UI components rendering dynamic data.

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| `species_export.py` emits `Genus/epithet` slugs | Live python invocation against sandbox parquet | 527/527 species rows have slash slug, 0 flat slugs | PASS |
| `_write_species_svg` creates Genus/ subdir | `uv run pytest tests/test_species_maps.py -v` | 1 PASSED | PASS |
| validate-species exits 0 with 0 warnings | `node scripts/validate-species.mjs` | `629 species, 0 warning(s)` | PASS |
| validate-species.test.ts 16 tests pass | `npm test -- --run src/tests/validate-species.test.ts` | 16 passed | PASS |
| TypeScript typecheck passes | `npm run typecheck` | exit 0 (tsc --noEmit) | PASS |
| Full pytest suite (excluding pre-existing failure) | `cd data && uv run pytest -q` | 121 passed, 1 failed (pre-existing `test_run_py_integration`), 2 skipped | PASS |

### Probe Execution

No probes declared in PLAN frontmatter. No conventional `scripts/*/tests/probe-*.sh` found.

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|----------|
| PIPE-03 | 92-01, 92-02, 92-03 | `species_export.py` updates slug to `Genus/specificEpithet`; `species-photos.toml` keys migrated to match | SATISFIED | Slug emission code verified + all 3 tests GREEN + 0 TOML orphan warnings |

PIPE-03 is the only requirement mapped to Phase 92 in REQUIREMENTS.md. All three plans claim it. The implementation satisfies both sub-requirements: (a) slug format in `species_export.py` and (b) TOML key cleanup with zero orphan warnings.

**Requirement interpretation note:** PIPE-03 states "species-photos.toml keys are migrated to match." The PLAN explicitly resolved this as: TOML keys should match `scientificName` values (not be rekeyed to `Genus/epithet` slug format), because `_data/photos.js` and `species.njk` look up photos by `sp.scientificName`, not `sp.slug`. This interpretation is correct given how the template works (`photoEntry = photos[sp.scientificName]` at line 32 of `_pages/species.njk`). The ROADMAP SC 2 wording "keys match the new hierarchical slug format" is loosely worded and the plan's interpretation (zero orphans, all keys are valid scientificName values) is the functionally correct one.

No orphaned requirements — PIPE-03 is the only requirement claimed and it is satisfied.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| — | — | None found | — | — |

No `TBD`, `FIXME`, `XXX`, `TODO`, `HACK`, or `PLACEHOLDER` markers found in any modified file. No empty implementations or stub patterns detected.

### Human Verification Required

#### 1. End-to-End Build with Regenerated Pipeline Output

**Test:** Run `cd data && uv run python run.py` (requires `bash data/dbt/run.sh build` first), then run `npm run build`.
**Expected:** `public/data/species.json` has 629 rows all with `Genus/epithet` or bare-genus slugs. `public/data/species-maps/` contains per-genus subdirectories (e.g., `Andrena/milwaukeensis.svg`). `npm run build` exits 0.
**Why human:** `public/data/` is gitignored. The local artifacts are stale (May 14, pre-Phase-92). The pipeline code changes are verified correct, but confirming the full `npm run build` chain (validate-species + typecheck + eleventy + validate-bundle-size) with freshly generated `species.json` containing new-format slugs requires running the pipeline locally or waiting for the nightly cron on maderas. Phase 92 commits are not yet pushed to origin so GitHub CI has not run. Note: typecheck and validate-species already pass; the open question is specifically whether eleventy builds cleanly with new-format slugs in `species.json`.

### Gaps Summary

No BLOCKERs. The code changes are all present and correct:

- `species_export.py` emits `Genus/epithet` slugs (verified by code reading and live pipeline invocation)
- `species_maps.py` creates parent subdirectories before writing SVGs (verified by code reading and passing test)
- `species_maps.py` uses `rglob` for total-size accounting (verified by code reading)
- All Wave 0 tests PASS GREEN against the sandbox parquet
- TOML cleanup complete: 106 non-bee-taxa orphans removed, 629 keys remain, 0 warnings

The only human verification item is confirming the full `npm run build` pipeline with freshly-generated artifacts. This is a confirmation step rather than a blocking uncertainty — the underlying pipeline code correctness is verified.

---

_Verified: 2026-05-15T22:45:00Z_
_Verifier: Claude (gsd-verifier)_
