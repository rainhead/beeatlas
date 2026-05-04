---
status: partial
phase: 077-lineage-coverage-expansion
source: [077-VERIFICATION.md]
started: 2026-05-04T05:09:19Z
updated: 2026-05-04T05:09:19Z
---

## Current Test

[awaiting human testing]

## Tests

### 1. Live pipeline produces ≥95% coverage on the production DB
expected: After `cd data && uv run python run.py`, the LIN-05 coverage SQL returns ≥0.95 against the live `data/beeatlas.duckdb`; `data/lineage_unresolved.csv` is populated with (canonical_name, reason, attempted_at) rows for the residual <5%.
result: [pending]

### 2. Confirm the regenerated data/lineage_unresolved.csv contents are reasonable
expected: After the live pipeline run, `data/lineage_unresolved.csv` contains only rows the user agrees should remain unresolved (extinct synonyms, taxonomic errata).
result: [pending]

## Summary

total: 2
passed: 0
issues: 0
pending: 2
skipped: 0
blocked: 0

## Gaps
