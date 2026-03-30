---
phase: 20-pipeline-migration
plan: "01"
subsystem: data-pipeline
tags: [dlt, pipeline, migration, ecdysis, inat, geographies]
dependency_graph:
  requires: []
  provides: [data/inaturalist_pipeline.py, data/ecdysis_pipeline.py, data/geographies_pipeline.py, data/projects_pipeline.py, data/anti_entropy_pipeline.py, data/.dlt/config.toml]
  affects: [data/pyproject.toml, data/uv.lock, data/.gitignore, data/README.md, .planning/PROJECT.md]
tech_stack:
  added: [dlt[duckdb]>=1.23.0, duckdb, requests, beautifulsoup4, geopandas]
  patterns: [dlt REST API source, dlt incremental loading, dlt merge write disposition]
key_files:
  created:
    - data/inaturalist_pipeline.py
    - data/ecdysis_pipeline.py
    - data/geographies_pipeline.py
    - data/projects_pipeline.py
    - data/anti_entropy_pipeline.py
    - data/.dlt/config.toml
    - data/README.md
  modified:
    - data/pyproject.toml
    - data/uv.lock
    - data/.gitignore
    - .planning/PROJECT.md
  deleted:
    - data/ecdysis/ (entire module)
    - data/inat/ (entire module)
    - data/links/ (entire module)
    - data/scripts/ (entire module)
    - data/spatial.py
    - data/tests/ (entire directory)
    - data/Makefile
decisions:
  - "dlt pipelines copied verbatim from prototype — no code modifications"
  - "html_cache_dir uses relative path raw/ecdysis_cache (not absolute prototype path)"
  - "iNat v2 REST API used directly via dlt REST source (not pyinaturalist)"
  - "pyarrow omitted from pyproject.toml — comes transitively via dlt"
metrics:
  duration: 4min
  completed: "2026-03-27"
  tasks_completed: 3
  files_changed: 20
---

# Phase 20 Plan 01: Pipeline Migration — Copy dlt Pipelines Summary

## One-liner

Five dlt pipeline files copied verbatim from prototype into data/, pyproject.toml replaced with five consolidated deps, old pandas/pyinaturalist modules deleted, .dlt/config.toml created with relative html_cache_dir.

## What Was Built

The dlt-based pipeline architecture is now installed in `data/`:

- **inaturalist_pipeline.py** — iNat v2 REST source with incremental `updated_at` cursor, `is_deleted` soft-delete flag, and `DEFAULT_FIELDS` for explicit field selection
- **ecdysis_pipeline.py** — Ecdysis DarwinCore ZIP download + iNat link scraping with HTML disk cache
- **geographies_pipeline.py** — Geographic boundary loader (EPA ecoregions, TIGER counties/states, StatsCan provinces)
- **projects_pipeline.py** — iNat project name lookup for project join table
- **anti_entropy_pipeline.py** — Harmonic-decay sampling of existing observations + soft-delete for removed records
- **data/.dlt/config.toml** — Centralized config for all four sources with relative paths

Old modules (`ecdysis/`, `inat/`, `links/`, `scripts/`, `spatial.py`, `tests/`, `Makefile`) are gone. `pyproject.toml` now lists exactly five dlt-compatible deps. `uv sync` completes cleanly and all imports resolve.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Copy pipeline files and create config | c05aafc | 5 pipeline files + data/.dlt/config.toml |
| 2 | Replace pyproject.toml, delete old modules, update .gitignore | 47efd11 | pyproject.toml, uv.lock, .gitignore, 18 deleted |
| 3 | Write README, update PROJECT.md, close pending todo | f2a6993 | data/README.md, .planning/PROJECT.md, todo moved |

## Decisions Made

- **Verbatim copy**: Pipeline files copied byte-identical from prototype — no code changes. Any adaptation needed is deferred to the plan that needs it.
- **html_cache_dir relative path**: `raw/ecdysis_cache` works for all users (cwd=data/ during pipeline runs); the prototype's absolute path was machine-specific.
- **iNat v2 REST direct**: The prototype's `DEFAULT_FIELDS` + `geojson.coordinates` pattern makes explicit field selection clean. Updated PROJECT.md key decision accordingly.
- **pyarrow not listed**: Comes transitively via dlt; Phase 21 may add it explicitly if needed for Parquet export.

## Deviations from Plan

None — plan executed exactly as written.

## Known Stubs

None — this plan establishes the pipeline architecture. The pipelines are runnable locally but CI integration (Makefile, build-data.sh, GitHub Actions workflow) is addressed in Plan 02.
