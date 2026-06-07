---
phase: 142-verify-budget-green-suite-nightly-wiring
plan: 02
subsystem: data-pipeline/testing
tags: [bash, nightly, pytest, s3, integration-gate, dbt, ttier-03]

# Dependency graph
requires:
  - phase: 142-01
    provides: green @integration tier (test_at_least_13 fixed, pytest-randomly installed, fast suite randomization-hardened)
provides:
  - nightly.sh block 1c — pre-run S3 pull of published artifacts into public/data/ (regression baseline for test_dbt_diff)
  - nightly.sh block 2b — @integration hard gate before hashing/upload (TTIER-03, D-01/D-01a/D-01b)
  - First-run test_dbt_diff schema-mismatch documented as self-healing, not a defect
affects: [142-verify, 143-ci-gate]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "uv run python3 -c for manifest JSON parsing (not bash) — no fragile shell JSON"
    - "if ! uv run pytest -m integration -x ... ; then exit 1; fi — explicit gate before publish"
    - "mkdir -p $REPO_ROOT/public/data + S3 graceful-miss on manifest pull (first run = WARN not abort)"

key-files:
  created: []
  modified:
    - data/nightly.sh

key-decisions:
  - "Block 1c uses uv run python3 -c for manifest parsing — avoids fragile bash JSON (RESEARCH Do Not Hand-Roll)"
  - "species manifest key = species.json (not species.parquet) per A3 — documented in comment; species.parquet diff tests may skip in nightly (acceptable)"
  - "Block 2b uses -x (fail-fast) with --tb=short — fast abort + diagnostic output in nightly log (Pitfall 7)"
  - "Expected first-run test_dbt_diff schema failure (37-col live vs 33-col sandbox) documented as self-healing on second run"
  - "EXIT trap (DuckDB/taxa backup) left unchanged — fires on exit 1 from gate; no modification needed"

requirements-completed: [TTIER-03]

# Metrics
duration: 20min
completed: 2026-06-07
---

# Phase 142 Plan 02: Nightly @integration Gate + public/data Baseline Pull Summary

**@integration hard gate wired into nightly.sh as block 2b (exits non-zero before S3 publish on failure); block 1c pre-pulls last-night's published artifacts into public/data/ so test_dbt_diff asserts against a real regression baseline instead of silently skipping (TTIER-03, D-01/D-01a/D-01b)**

## Performance

- **Duration:** ~20 min
- **Completed:** 2026-06-07
- **Tasks:** 2 (both in single file)
- **Files modified:** 1

## Accomplishments

- Block 1c added after 1b taxa.csv.gz pull, before `# 2. Run pipelines`: pulls `manifest.json` from S3 into `/tmp/beeatlas-prev-manifest.json`, then resolves and pulls `occurrences.parquet`, `counties.geojson`, `ecoregions.geojson`, `species.json`, `seasonality.json` into `$REPO_ROOT/public/data/`. First-run (no manifest) logs WARN and continues without aborting.
- Block 2b added after `--- pipelines done ---`, before `--- hashing and uploading exports ---`: runs `uv run pytest -m integration -x --tb=short -q`; exits non-zero on any failure to block S3 publish.
- A3 documented in code comment: manifest `species` key = hashed `species.json`, not `species.parquet`; parquet-dependent diff tests may skip in nightly (skip, not fail).
- First-run schema mismatch (Phase 131: 37-col live vs 33-col sandbox) documented as expected self-healing behavior — not a defect.
- EXIT trap (lines 85–96) unchanged — DuckDB/taxa backup fires on `exit 1` from gate.
- `cd data && bash -n nightly.sh` exits 0.
- `uv run pytest -m integration` invocation confirmed at line 213, before `--- hashing and uploading exports ---` at line 227.

## Task Commits

1. **Tasks 1+2: block 1c + block 2b** - `e4cc314` (feat)
   - Both tasks target `data/nightly.sh`; committed together after both blocks verified

## Files Created/Modified

- `/home/peter/dev/beeatlas/data/nightly.sh` — 92 lines added: block 1c (pre-run S3 pull) + block 2b (integration hard gate)

## Decisions Made

- Used `uv run python3 -c` for manifest JSON parsing — per RESEARCH "Don't Hand-Roll"; bash JSON parsing is fragile
- Pulled only the 5 files that test_dbt_diff and related integration tests need: occurrences.parquet, counties.geojson, ecoregions.geojson, species.json, seasonality.json
- Did NOT invent a species.parquet manifest key (A3 resolution) — tests that depend on species.parquet will skip in nightly, which is acceptable per the plan
- Used `-x --tb=short` on the pytest gate for fast abort with diagnostics (Pitfall 7 — a comment notes that dropping -x gives full failure inventory)

## Deviations from Plan

None — plan executed exactly as written.

## Manual Verification Required (VALIDATION.md)

Per the plan's `<host_constraint>` and VALIDATION.md Manual-Only section:

- **Live forced-failure dry-run**: On maderas, temporarily inject a failing integration test, run nightly.sh, and confirm: (1) non-zero exit before S3 upload; (2) DuckDB/taxa EXIT-trap backup fires; (3) no CloudFront invalidation or healthcheck ping.
- **First-run schema mismatch**: The first nightly after deploying Plan 02 will have test_dbt_diff fail (37-col live vs 33-col sandbox). This is documented as expected. Self-heals on the second run after the operator allows one 33-col publish.

## Threat Coverage

T-142-01 (vacuous gate via skip): Mitigated — block 1c provides real public/data/ baseline; SANDBOX populated by run.py; full tier runs (D-01b).
T-142-05 (manifest path traversal): Mitigated — remote hashed values are used only as S3 key suffixes; local write paths use fixed basenames under `$REPO_ROOT/public/data`.

## Self-Check: PASSED

- `data/nightly.sh` exists and contains both blocks: FOUND
- `e4cc314` commit exists: confirmed above
- Block 1c after line 116 (taxa pull), before line 173 (run pipelines): VERIFIED (lines 118–171)
- Block 2b after line 180 (pipelines done), before line 227 (hashing/uploading): VERIFIED (lines 182–224)
- `cd data && bash -n nightly.sh` exits 0: VERIFIED
- `uv run pytest -m integration` at line 213, before hashing at line 227: VERIFIED

---
*Phase: 142-verify-budget-green-suite-nightly-wiring*
*Completed: 2026-06-07*
