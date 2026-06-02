---
status: partial
phase: 110-offline-taxonomy
source: [110-VERIFICATION.md]
started: 2026-05-24T00:42:12Z
updated: 2026-05-24T00:42:12Z
---

## Current Test

[awaiting human testing — both items require the next nightly run on maderas]

## Tests

### 1. S3 round-trip runtime test

expected: After the next nightly run on maderas, `taxa.csv.gz` and `taxa_cache.json` appear in the S3 bucket (`s3://beeatlasstack-sitebucket397a1860-h5dtjzkld3yv/raw/`). On the subsequent nightly run, `download_taxa_csv()` receives HTTP 304 and logs the "unchanged" message (no re-download).
result: [pending]

### 2. Production-scale ancestry walk

expected: Running `load_taxon_lineage_extended()` against the real 37MB `taxa.csv.gz` produces `inaturalist_data.taxon_lineage_extended` with a row count in the expected range (~8,000–15,000 active Anthophila taxa). No DuckDB errors. Column order is `(taxon_id, family, subfamily, tribe, genus, subgenus)`.
result: [pending]

## Summary

total: 2
passed: 0
issues: 0
pending: 2
skipped: 0
blocked: 0

## Gaps
