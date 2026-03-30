---
phase: 22-orchestration
plan: 01
subsystem: data-pipeline
tags: [orchestration, python, pipeline, build]
dependency_graph:
  requires: []
  provides: [data/run.py, updated-build:data]
  affects: [CI/CD, package.json, scripts/build-data.sh]
tech_stack:
  added: []
  patterns: [Python pipeline orchestration, in-process function calls, fail-fast execution]
key_files:
  created:
    - data/run.py
  modified:
    - package.json
  deleted:
    - scripts/build-data.sh
decisions:
  - "No subprocess usage — pipelines imported and called directly for proper tracebacks and shared memory"
  - "Fail-fast execution — no try/except around steps; propagates full tracebacks"
  - "STEPS list ordered: geographies -> ecdysis -> ecdysis-links -> inaturalist -> projects -> export"
metrics:
  duration: "5min"
  completed: "2026-03-27"
  tasks_completed: 2
  files_changed: 3
requirements: [ORCH-01, ORCH-02]
---

# Phase 22 Plan 01: Pipeline Orchestration Runner Summary

Python pipeline runner `data/run.py` replaces `scripts/build-data.sh` as the single-command orchestrator, importing and calling each pipeline's load function directly in-process.

## What Was Built

- **`data/run.py`**: Imports `load_geographies`, `load_ecdysis`, `load_links`, `load_observations`, `load_projects`, and `export_all` from their respective modules. Defines a `STEPS` list of 6 `(name, callable)` tuples in the correct execution order. `main()` times each step and prints banners; fails fast on any error.
- **`package.json`**: `build:data` script updated from `bash scripts/build-data.sh` to `cd data && uv run python run.py`. All other scripts unchanged.
- **`scripts/build-data.sh`**: Deleted via `git rm`.

## Verification Results

1. `import run; print('import OK')` — PASS
2. `scripts/build-data.sh` deleted — PASS
3. `package.json` contains `cd data && uv run python run.py` — PASS
4. All pipeline modules independently importable — PASS
5. STEPS list: `['geographies', 'ecdysis', 'ecdysis-links', 'inaturalist', 'projects', 'export']` — PASS

## Deviations from Plan

None — plan executed exactly as written.

## Known Stubs

None.

## Self-Check: PASSED

- `data/run.py` exists: FOUND
- Commit `a4c0b57` (Task 1): FOUND
- Commit `6bfe3ed` (Task 2): FOUND
- `scripts/build-data.sh` does not exist: CONFIRMED
