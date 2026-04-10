---
status: complete
phase: 42-feed-generator-core
source: 42-01-SUMMARY.md
started: 2026-04-10T00:00:00Z
updated: 2026-04-10T00:00:00Z
---

## Current Test

[testing complete]

## Tests

### 1. Automated tests pass
expected: Running `cd data && uv run pytest tests/test_feeds.py -q` shows 7 passed, 0 failed.
result: pass

### 2. Feed file written from real DB
expected: Running `cd data && uv run python -m feeds` (requires beeatlas.duckdb) creates `frontend/public/data/feeds/determinations.xml`. The script prints something like "wrote N entries" and exits without error.
result: pass
reported: "feeds/determinations.xml: 40,868 entries, 15,671,089 bytes"

### 3. Feed entries have correct fields
expected: Opening `frontend/public/data/feeds/determinations.xml` shows Atom entries each containing a taxon name + determiner in the title (e.g. "Eucera sp. — determined by Jane Smith"), a summary with collector and collection date, and a link to an ecdysis.org URL with an `occid=` parameter.
result: pass

### 4. Pipeline integration
expected: `run.py` includes feeds as the final step. Running `grep feeds data/run.py` shows both the import and the STEPS entry. The step name "feeds" appears after "export" in the STEPS list.
result: pass

## Summary

total: 4
passed: 4
issues: 0
pending: 0
skipped: 0
blocked: 0

## Gaps

[none]
