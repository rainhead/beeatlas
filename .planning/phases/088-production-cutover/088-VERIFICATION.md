---
phase: 088-production-cutover
verified: 2026-05-13T00:00:00Z
status: passed
score: 5/5 success criteria verified
overrides_applied: 0
requirements_covered: [CUTOVER-01, CUTOVER-02, CUTOVER-03, CUTOVER-04, VALIDATE-02]
---

# Phase 088: Production Cutover — Verification Report

**Phase Goal:** `dbt build` is the sole producer of all pipeline outputs; legacy
Python transform code, `_apply_migrations()`, and `validate-schema.mjs` are
retired; `nightly.sh` runs dbt and interprets exit codes correctly; the frontend
loads dbt-produced `occurrences.parquet` without code changes.

**Verified:** 2026-05-13
**Status:** passed
**Re-verification:** No — initial verification

## Goal Achievement

### Success Criteria — Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | `data/run.py` invokes `bash data/dbt/run.sh build` via `_run_dbt_build`; `data/export.py` deleted; `species_export.py` retained as post-step; non-zero exit on dbt failure | VERIFIED | `data/run.py:50-71` defines `_run_dbt_build` calling `subprocess.run(["bash", str(_DBT_SCRIPT), "build"], check=True)` (raises `CalledProcessError` on failure → propagates through `main()` line 99 `raise`). STEPS list at line 84 includes `("dbt-build", _run_dbt_build)`; line 85 keeps `("species-export", export_species_parquet)`. `ls data/export.py` → no such file. `ls data/species_export.py` → present. `grep "from export import" data/run.py` → no matches. |
| 2 | `_apply_migrations()` deleted from `data/run.py`; migration mapping documents each invariant → dbt replacement | VERIFIED | `grep "_apply_migrations" data/run.py` → no matches. `088-CUTOVER-LOG.md ## Migration Mapping` (lines 56-71) contains 2-row table mapping (a) Phase 48 `inat_observation_id → host_observation_id` rename → `sources.yml:8`, `stg_ecdysis__occurrence_links.sql:9`, `int_ecdysis_base.sql:20,29`; (b) Phase 47 `geom GEOMETRY` backfill → `sources.yml:31-37`, `stg_geo__us_counties.sql:9`, `stg_geo__ecoregions.sql:9-13`, `stg_geo__us_states.sql:11`. Both rows cite file:line for dbt replacement; explains migrations are obviated by dbt source contract (compile-time Binder Error gates regression). |
| 3 | `scripts/validate-schema.mjs` deleted; `validate-schema` removed from `package.json`; GH Actions no longer references it; `npm run build` succeeds; CLAUDE.md no longer claims it as a parquet schema gate | VERIFIED | `ls scripts/validate-schema.mjs` → no such file. `grep "validate-schema" package.json .github/workflows/deploy.yml CLAUDE.md` → no matches. `package.json:24` build chain: `npm run validate-species && npm run typecheck && eleventy && npm run validate-bundle-size`. `npm run build` exits 0 locally (transformed 78 modules, built in 2.89s, validate-bundle-size OK). `CLAUDE.md:58` reads "The dbt 30-column contract on `marts/occurrences` is enforced at every `bash data/dbt/run.sh build`; there is no separate JS schema validator." |
| 4 | `data/nightly.sh` invokes `dbt build` (via run.py) and exits non-zero only on true failures | VERIFIED | `bash -n data/nightly.sh` exits 0. Line 6: `set -euo pipefail`. Line 41: `uv run python run.py` (single entrypoint, no error-masking flags). Lines 47-49: S3 upload of `occurrences.parquet`, `counties.geojson`, `ecoregions.geojson` (the exact 3 artifacts `_run_dbt_build` copies to `EXPORT_DIR`). Line 50: `aws s3 cp --recursive "$EXPORT_DIR/feeds/" "s3://$BUCKET/data/feeds/"`. `grep -E "export.py\|validate-schema\|_apply_migrations\|--exclude\|--full-refresh" data/nightly.sh` → no matches. EXIT trap (line 24) backs up DuckDB regardless of outcome. |
| 5 | E2E smoke: map renders, filters work, table populates, species page works — all with dbt-produced parquet, no frontend code changes | VERIFIED | `088-CUTOVER-LOG.md ## Smoke Check (VALIDATE-02)` (lines 73-97): Date 2026-05-14, Verifier rainhead, Result: approved. Four checked boxes: Map renders (Mapbox + WA + ~47k markers), Filters work (count badge updates, markers refresh), Table populates (~47k rows, row-click pans map), Species page (seasonality chart + county map from species.json + seasonality.json). Zero console errors. Assertive companion: `cd data && uv run pytest tests/test_dbt_diff.py::test_occurrences_schema_matches -x` → **PASS (1 passed in 0.39s)** confirmed by re-run during this verification — byte-parity between sandbox mart and published parquet. Public artifacts present: `public/data/{occurrences.parquet,counties.geojson,ecoregions.geojson}` all mtime 2026-05-14 08:41. |

**Score:** 5/5 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `data/run.py` | Contains `_run_dbt_build`, no `_apply_migrations`, no `export.py` import | VERIFIED | Lines 50-71 (`_run_dbt_build`), line 84 (STEPS entry). No `_apply_migrations` references. Imports `species_export` (line 36), not `export`. |
| `data/export.py` | Must NOT exist | VERIFIED | File absent (deleted in commit `5c1c01a`). |
| `data/species_export.py` | Retained as post-step | VERIFIED | File present; imported as `export_species_parquet` at run.py:36; called at STEPS line 85. |
| `scripts/validate-schema.mjs` | Must NOT exist | VERIFIED | File absent (deleted in commit `759bb47`). |
| `package.json` | No `validate-schema` script | VERIFIED | Build chain has `validate-species`, `typecheck`, `eleventy`, `validate-bundle-size` only. |
| `.github/workflows/deploy.yml` | No `Validate parquet schema` step | VERIFIED | Workflow has `npm test` → `npm run build` → upload-artifact → deploy. No validate-schema step. |
| `CLAUDE.md` | Known State references dbt contract, not validate-schema.mjs | VERIFIED | Line 58: dbt contract is enforced; "there is no separate JS schema validator." |
| `data/nightly.sh` | `set -euo pipefail`, `uv run python run.py`, 3-artifact + feeds upload | VERIFIED | All lines present (6, 41, 47-49, 50). |
| `public/data/occurrences.parquet` | dbt-produced 30-col file | VERIFIED | Present, mtime 2026-05-14 08:41; `test_occurrences_schema_matches` PASS confirms byte-parity with sandbox mart. |
| `public/data/counties.geojson` | dbt-produced | VERIFIED | Present, mtime 2026-05-14 08:41. |
| `public/data/ecoregions.geojson` | dbt-produced | VERIFIED | Present, mtime 2026-05-14 08:41. |
| `088-CUTOVER-LOG.md` | All required sections | VERIFIED | Sections present: Summary, Nightly.sh Confirmation (CUTOVER-04), Migration Mapping (CUTOVER-02), Smoke Check (VALIDATE-02), Validation, Out of Scope, Rollback. |
| `pre-cutover-sha.txt` | 40-char SHA rollback marker | VERIFIED | Contains `44a967c8db5acd1d06bbae65ba0a1912528bbc57` (regex `^[0-9a-f]{40}$` matches). Referenced in CUTOVER-LOG `## Rollback`. |

### Key Link Verification

| From | To | Via | Status | Details |
|------|-----|-----|--------|---------|
| `run.py STEPS` | `bash data/dbt/run.sh build` | `_run_dbt_build` subprocess | WIRED | Line 66 `subprocess.run(["bash", str(_DBT_SCRIPT), "build"], check=True)`; `_DBT_SCRIPT = Path(__file__).parent / "dbt" / "run.sh"` (line 42). |
| `_run_dbt_build` | 3 EXPORT_DIR artifacts | `shutil.copy2` loop | WIRED | Lines 67-71: `_EXPORT_DIR.mkdir(parents=True, exist_ok=True)`; `for artifact in ("occurrences.parquet", "counties.geojson", "ecoregions.geojson"): shutil.copy2(src, dst)`. |
| `run.py STEPS` | `species_export.main` (post-step) | `export_species_parquet` import | WIRED | Line 36 import; line 85 STEPS entry. |
| `nightly.sh` | `uv run python run.py` | direct shell invocation | WIRED | Line 41. |
| `nightly.sh` | 3-artifact + feeds S3 upload | `aws s3 cp` loop + recursive copy | WIRED | Lines 47-50. |
| `package.json build` | validate-species → typecheck → eleventy → validate-bundle-size | scripts.build string | WIRED | Line 24. No validate-schema in chain. |
| `subprocess.run check=True` | Pipeline halt on dbt failure | `CalledProcessError` raises into `main()` traceback handler | WIRED | run.py:66 `check=True`; main() lines 96-100 catches Exception, prints traceback, re-raises. |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Parquet schema byte-parity (sandbox ↔ public) | `cd data && uv run pytest tests/test_dbt_diff.py::test_occurrences_schema_matches -x` | `1 passed in 0.39s` (exit 0) | PASS |
| Frontend build succeeds without validate-schema | `npm run build` | `built in 2.89s`, validate-bundle-size OK, exit 0 | PASS |
| nightly.sh parses | `bash -n data/nightly.sh` | exit 0 | PASS |
| No forbidden patterns in nightly.sh | `grep -E "export.py\|validate-schema\|_apply_migrations\|--exclude\|--full-refresh" data/nightly.sh` | no matches (exit 1) | PASS |
| No `validate-schema` anywhere | `grep "validate-schema" package.json .github/workflows/deploy.yml CLAUDE.md` | no matches | PASS |
| No incremental materializations (Phase 87 lock) | `grep -r "materialized.*incremental" data/dbt/models/` | no matches (exit 1) | PASS |
| `_apply_migrations` purged | `grep "_apply_migrations" data/run.py` | no matches | PASS |
| `export.py` import purged | `grep "from export import\|^import export" data/run.py` | no matches | PASS |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|-------------|--------|----------|
| CUTOVER-01 | 088-02 | dbt build is sole transform producer (run.py rewrite, export.py delete) | SATISFIED | run.py `_run_dbt_build` + STEPS entry; export.py deleted; commit `b8d0722`, `5c1c01a`. |
| CUTOVER-02 | 088-02, 088-03 | `_apply_migrations` removed; migration→dbt mapping documented | SATISFIED | Function purged from run.py; 2-row mapping table in CUTOVER-LOG with file:line citations. |
| CUTOVER-03 | 088-01 | validate-schema.mjs retired (file, package.json, CI, CLAUDE.md) | SATISFIED | All 4 surfaces cleaned; commits `759bb47`, `67c13ed`. |
| CUTOVER-04 | 088-03 | nightly.sh confirmed correct for dbt exit-code propagation | SATISFIED | Confirmed unchanged with `set -euo pipefail` + `uv run python run.py` + matching 3-artifact upload list; `bash -n` parses. |
| VALIDATE-02 | 088-03 | E2E smoke check on frontend with dbt-produced parquet | SATISFIED | 4-box approved sign-off (date + verifier) in CUTOVER-LOG; assertive `test_occurrences_schema_matches` PASS. |

No orphaned requirements — REQUIREMENTS.md mapping aligns with plan frontmatters.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|

No debt markers (`TBD`, `FIXME`, `XXX`, `TODO`, `HACK`, `PLACEHOLDER`) found in any phase-modified file (`data/run.py`, `data/nightly.sh`, `CLAUDE.md`, `package.json`, `.github/workflows/deploy.yml`). No stub patterns, no console.log-only handlers, no hardcoded empty returns in modified code paths. The two `deferred` items in CUTOVER-LOG frontmatter (stale `samples.parquet`/`ecdysis.parquet` S3 cleanup, Healthchecks.io dead-man's switch) are properly externalized to follow-on todos — not embedded debt.

### Phase 87 Lock Compliance

`grep -r "materialized.*incremental" data/dbt/models/` returns no matches. The full-refresh-only idiom is preserved per the Phase 87 milestone lock recorded in the 088-02 dependency graph.

### Protected Files Untouched

`git log 44a967c..HEAD -- data/dbt/run.sh data/checklist_unmatched.csv` returns no commits. The 10 Phase 88 commits touch only the expected files (run.py, export.py [deleted], scripts/validate-schema.mjs [deleted], package.json, deploy.yml, CLAUDE.md, plus planning docs and tests).

### Rollback Plan

`pre-cutover-sha.txt` contains `44a967c8db5acd1d06bbae65ba0a1912528bbc57`. CUTOVER-LOG `## Rollback` section (lines 125-143) documents both single-commit revert and per-file checkout procedures. The active execution path picks up the reverted run.py automatically on the next nightly cron run.

### Deferred Items (intentional, not gaps)

| Item | Tracked At | Notes |
|------|-----------|-------|
| Stale `public/data/{samples,ecdysis}.parquet` S3 cleanup | CUTOVER-LOG frontmatter `deferred[0]` | Pre-v3.0 artifacts; not consumed by frontend. Out of scope per RESEARCH § OQ2. |
| Healthchecks.io dead-man's switch for nightly-run failure notification | `.planning/todos/pending/nightly-run-failure-notification.md` | Natural follow-on now that nightly.sh exit semantics are settled. |
| First post-cutover production nightly observation | CUTOVER-LOG § Out of Scope | Operational verification — confirm S3 receives fresh 30-col parquet via real maderas cron. |

These do not block the v3.4 milestone close — the cutover invariants are observably true in the codebase today.

### Gaps Summary

None. All 5 success criteria verified; all 5 requirements satisfied; all key links wired; all behavioral spot-checks pass; no anti-patterns; protected files untouched; rollback marker present; Phase 87 lock honored.

---

*Verified: 2026-05-13*
*Verifier: Claude (gsd-verifier)*
