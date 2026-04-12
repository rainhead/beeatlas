---
quick_task: 260412-kpe
date: 2026-04-12
commit: 10915b3
files_modified:
  - data/export.py
  - data/tests/test_export.py
---

# Quick Task 260412-kpe: Fix export o.modified binder error

## What Was Done

Fixed a DuckDB binder error in `data/export.py` that prevented `nightly.sh` from completing, which in turn left stale parquet on S3/CloudFront and caused CI schema validation to fail.

**Root cause:** Line 111 of `export.py` referenced `o.modified` inside `GREATEST(o.modified, im.max_id_modified)`, but `ecdysis_data.occurrences` has no `modified` column. Only `ecdysis_data.identifications` has `modified`.

**Fix 1 — `data/export.py` line 111:** Changed `strftime(GREATEST(o.modified, im.max_id_modified), '%Y-%m-%d') AS modified` to `strftime(im.max_id_modified, '%Y-%m-%d') AS modified`.

**Fix 2 — `data/tests/test_export.py` `EXPECTED_ECDYSIS_COLS`:** Added `inat_host`, `inat_quality_grade`, and `modified` to the expected column list to match `scripts/validate-schema.mjs` (the authoritative schema source).

## Verification

`uv run pytest data/tests/test_export.py -q` — 6 passed.
