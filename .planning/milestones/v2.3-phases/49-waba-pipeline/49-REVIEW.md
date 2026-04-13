---
phase: 49-waba-pipeline
reviewed: 2026-04-13T00:00:00Z
depth: standard
files_reviewed: 3
files_reviewed_list:
  - data/waba_pipeline.py
  - data/.dlt/config.toml
  - data/run.py
findings:
  critical: 0
  warning: 1
  info: 2
  total: 3
status: issues_found
---

# Phase 49: Code Review Report

**Reviewed:** 2026-04-13
**Depth:** standard
**Files Reviewed:** 3
**Status:** issues_found

## Summary

This phase adds `data/waba_pipeline.py` — a dlt-based pipeline that fetches WABA-catalogued observations from the iNaturalist v2 API using the `field:WABA=` filter — and wires it into `run.py` between the existing `inaturalist` and `projects` steps.

The implementation closely mirrors `inaturalist_pipeline.py` in structure, which is appropriate. The wiring in `run.py` is correct and the import aliasing cleanly avoids the name collision.

One logic gap: WABA observations land in a separate dlt dataset (`inaturalist_waba_data`) and are never touched by `anti_entropy_pipeline.py`, which only queries and updates `inaturalist_data`. Soft-deletion of removed WABA observations is therefore silently skipped.

---

## Warnings

### WR-01: Anti-entropy does not cover WABA observations

**File:** `data/anti_entropy_pipeline.py:27-36` (existing file, gap exposed by new pipeline)
**Issue:** `run_anti_entropy()` connects to `pipeline_name="inaturalist"` / `dataset_name="inaturalist_data"` and samples from `observations` in that dataset. WABA observations live in `inaturalist_waba_data.observations` (a separate DuckDB schema), so they are never sampled, re-verified, or soft-deleted by the anti-entropy step. If an observation is removed from the WABA field catalog on iNaturalist, it will persist in `inaturalist_waba_data` indefinitely with `is_deleted=False`.

**Fix:** Either (a) extend `_sample_observations` to union across both datasets, or (b) add a dedicated WABA anti-entropy pass that connects to `pipeline_name="waba"` / `dataset_name="inaturalist_waba_data"`. Option (b) is lower risk. Minimal sketch:

```python
def run_waba_anti_entropy(n: int = 50) -> None:
    pipeline = dlt.pipeline(
        pipeline_name="waba",
        destination=dlt.destinations.duckdb(DB_PATH),
        dataset_name="inaturalist_waba_data",
    )
    sampled = _sample_observations(pipeline, n)
    ...
```

---

## Info

### IN-01: `full_reload` path missing explanatory comments

**File:** `data/waba_pipeline.py:113-123`
**Issue:** The `inaturalist_pipeline.py` counterpart (lines 121-132) has two inline comments explaining why local package directories are cleared and why `_dlt_pipeline_state` is deleted. The `waba_pipeline.py` copy omits these comments. This is a minor maintainability gap — future readers won't know why this cleanup is necessary.

**Fix:** Mirror the comments from `inaturalist_pipeline.py`:
```python
if full_reload:
    # Drop any pending local packages to avoid stale merge SQL on missing tables
    import shutil
    from pathlib import Path
    pipeline_dir = Path(pipeline.working_dir)
    for subdir in ("load/new", "load/normalized", "normalize"):
        path = pipeline_dir / subdir
        if path.exists():
            shutil.rmtree(path)
            path.mkdir()
    # Delete destination state so pipeline.run() doesn't restore the old cursor
    with pipeline.sql_client() as client:
        client.execute_sql("DELETE FROM _dlt_pipeline_state WHERE pipeline_name = 'waba'")
```

### IN-02: `waba_source` return annotation is `-> None` but function yields

**File:** `data/waba_pipeline.py:46-48`
**Issue:** The function signature is `def waba_source(...) -> None:` but the body contains `yield from rest_api_resources(config)`, making it a generator. Python treats `-> None` as valid for generators but it misrepresents the return type. The same annotation exists in `inaturalist_pipeline.py`, so this is a consistent project pattern rather than a new regression — but worth noting for type-checking accuracy.

**Fix:** Use a more accurate annotation:
```python
from collections.abc import Iterator
def waba_source(...) -> Iterator:
```
Or simply omit the return annotation, matching how the dlt `@dlt.source` decorator is typically used.

---

_Reviewed: 2026-04-13_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
