---
phase: 20
name: Pipeline Migration
status: context-captured
date: 2026-03-27
---

# Phase 20 Context: Pipeline Migration

## Domain

Port the five dlt pipelines from `~/dlt-inat-test/` into `data/`, consolidate `pyproject.toml` and `uv.lock`, wire `.dlt/config.toml`, and remove old pipeline modules. The result is a single working `data/` directory with all five dlt pipelines runnable locally against `data/beeatlas.duckdb`.

## Canonical References

- `~/dlt-inat-test/` — source prototype (5 pipeline files, `.dlt/config.toml`)
- `data/pyproject.toml` — to be replaced/consolidated
- `data/ecdysis/`, `data/inat/`, `data/links/`, `data/scripts/` — to be deleted
- `data/spatial.py`, `data/tests/` — to be deleted with old modules
- `.planning/REQUIREMENTS.md` — PIPE-08, PIPE-09, PIPE-10

## Decisions

### iNat API version
**Decision:** Keep v2 (as used in the prototype).
The prototype uses the iNat v2 API directly (not pyinaturalist), with explicit field extraction and correct coordinate handling via `geojson.coordinates`. The prior Key Decision against v2 was in the context of pyinaturalist's v2 wrapper — the prototype's direct REST usage with `DEFAULT_FIELDS` and explicit `_transform()` avoids those issues. **The Key Decision in PROJECT.md should be updated to reflect this change.**

### spatial.py and tests fate
**Decision:** Delete `data/spatial.py` and `data/tests/` together with the old pipeline modules.
`spatial.py` is superseded by the DuckDB spatial extension (Phase 21). The three test files (`test_inat_download.py`, `test_links_fetch.py`, `test_spatial.py`) cover code being deleted. No need to defer to Phase 24.

### html_cache_dir config
**Decision:** Use a project-relative path in the committed `.dlt/config.toml`.
Use `raw/ecdysis_cache` (relative to `data/`, the working directory for pipeline runs). This works for all users without per-machine override. The committed config replaces the absolute path (`/Users/rainhead/dev/beeatlas/data/raw/ecdysis_cache`) that exists in the prototype.

### pyproject.toml dep pruning
**Decision:** Match the prototype's deps exactly — prune all old deps.
Keep: `dlt[duckdb]`, `duckdb`, `requests`, `beautifulsoup4`, `geopandas`. Remove: `pandas`, `pyarrow`, `pyinaturalist`, `pyinaturalist-convert`, `pydwca`, `pydantic`, `sqlalchemy`, `pyogrio`. `pyarrow` comes transitively via dlt and doesn't need to be listed explicitly (Phase 21 will add it directly if needed).

### Pending todo: explicit iNat API fields
**Status:** Already resolved in prototype. `DEFAULT_FIELDS` is defined in `inaturalist_pipeline.py` with all required fields. Mark the todo (`2026-03-12-specify-explicit-fields-on-inat-api-calls.md`) as closed — the new pipeline addresses it by design.

## Implementation Notes

- Five pipeline files to copy into `data/`: `inaturalist_pipeline.py`, `ecdysis_pipeline.py`, `geographies_pipeline.py`, `projects_pipeline.py`, `anti_entropy_pipeline.py`
- `.dlt/config.toml` to copy and update `html_cache_dir` to `raw/ecdysis_cache`
- `dlthub_telemetry = true` in config — no change needed; leave as prototype default
- Working directory for pipeline runs: `data/` (so `db_path = "beeatlas.duckdb"` resolves to `data/beeatlas.duckdb`)
- Old modules in `data/` to delete: `ecdysis/`, `inat/`, `links/`, `scripts/`, `spatial.py`, `tests/`
- `data/Makefile` and `data/README.md` likely need updates; researcher should evaluate

## Deferred Ideas

*(None captured during discussion)*
