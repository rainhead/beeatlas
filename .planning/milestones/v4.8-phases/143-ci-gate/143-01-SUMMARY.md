---
phase: 143-ci-gate
plan: 01
status: complete
requirements: [TCI-01, TCI-02]
self_check: passed
completed: 2026-06-07
---

# Phase 143 Plan 01 — Summary

## What was built

A new, fully independent GitHub Actions workflow — `.github/workflows/python-tests.yml` —
that runs the fast (`-m "not integration"`) `data/` pytest tier on every branch push,
fails the build on any test failure, and hard-bounds the suite runtime to under 5 minutes.
Python tests are no longer invisible in CI.

**Covers:** TCI-01 (CI runs the fast suite on push, red on failure) and TCI-02 (hard <5 min
budget gate).

## Key files

- **created** `.github/workflows/python-tests.yml` — independent Python fast-suite CI gate.
  - Trigger: `on: push: branches: ['**']`, no `pull_request` (D-02/D-02a — mirrors deploy.yml).
  - `permissions: contents: read` only; no cloud credentials, no secrets (D-01 least privilege).
  - `defaults.run.working-directory: data`; `actions/checkout@v6` with **`lfs: true`**;
    `astral-sh/setup-uv@fac544c0…` (`# v8.2.0`, `enable-cache: true`, `working-directory: data`
    → reads `data/.python-version` = 3.14); `uv sync --frozen`; a spatial-extension install
    step; then `uv run pytest --tb=short -q --durations=10` under **`timeout-minutes: 5` on
    that step only** (D-03).

## Verification (success criterion 4)

- **Green CI run observed end-to-end** on a real push of branch `ci-gate-python-tests`:
  https://github.com/rainhead/beeatlas/actions/runs/27101572396 — `conclusion: success`,
  `gh run watch --exit-status` → 0. All steps green.
- **TCI-02 headroom:** the `Run fast pytest suite` step took **17 s** (18:50:31→18:50:48Z),
  vs the 300 s (5 min) hard gate — comfortable headroom; the `timeout-minutes: 5` structural
  gate is in place on the pytest step.
- **D-01 preserved:** deploy.yml untouched; no `needs:` coupling. The branch push also
  triggered deploy.yml's *build* job only (no production deploy — that job is gated on the
  `main` ref). A Python-test failure cannot block the frontend deploy.

## Deviations from plan (important)

The **first** CI run (run 27101490629) went red at the pytest step. This was NOT a
test-suite regression — it exposed two genuine clean-checkout gaps that Phase 142's
"clean-checkout green" proof (TPERF-03) **missed because it ran on maderas, whose `$HOME`
carried cached state the worktree-strip did not remove.** The GitHub runner was the first
truly clean environment. Both were fixed at the workflow level (the only file this phase
owns); the suite itself was not modified:

1. **Git LFS** — `.gitattributes` tracks all `*.csv` via Git LFS, so every fixture CSV and
   dbt seed checked out as LFS *pointer text* instead of data (`actions/checkout` defaults to
   `lfs: false`). Manifested as: `on_checklist` binder errors, agapostemon synonym not
   applied, `checklist_synonyms.csv` "found 2 data rows" of LFS-pointer lines, and missing
   distilled-sample rows (slash-compound, date/coord branches). **Fix:** `lfs: true` on the
   checkout step.
2. **DuckDB spatial extension** — the suite assumes spatial is pre-installed (`places_load.py`
   decision 97-01 does a bare `LOAD spatial`, no `INSTALL`). maderas had it cached in
   `~/.duckdb`; the clean runner did not → `Extension "…/spatial.duckdb_extension" not found`
   in `test_places_export`. **Fix:** a `Pre-install DuckDB spatial extension` step
   (`INSTALL spatial`) before pytest, replicating maderas's cached state.

Both fixes are squarely within Phase 143's TCI-03 mandate ("the CI job completes successfully
on a clean checkout") and the plan's anticipated red→fix-workflow→re-push loop. The re-run
(27101572396) was fully green.

**Follow-up worth surfacing (out of this phase's scope):** TPERF-03's clean-checkout claim is
only true on hosts that already have the duckdb spatial extension cached and LFS objects
pulled. `data/scripts/verify-clean-checkout.sh` strips worktree assets but not `~/.duckdb`,
and runs where LFS is already materialized — so it cannot catch either gap locally. If a
genuinely-clean local proof is wanted, that script (and possibly the TPERF-03 claim) should be
revisited — but the CI gate now provides the real clean-environment check continuously.

## Self-Check: PASSED
