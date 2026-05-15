---
status: partial
phase: 92-slug-migration-pipeline-prep
source: [92-VERIFICATION.md]
started: 2026-05-15T21:25:00Z
updated: 2026-05-15T21:25:00Z
---

## Current Test

[awaiting human testing]

## Tests

### 1. Full pipeline produces hierarchical slugs in species.json

expected: Running `bash data/dbt/run.sh build && cd data && uv run python run.py && npm run build` succeeds and `public/data/species.json` contains only `Genus/epithet`-format slugs (e.g. `Andrena/milwaukeensis`) for species-level rows — no flat `lowercase-dash` slugs remain. The `public/data/species-maps/` directory contains per-genus subdirectories (e.g. `Andrena/milwaukeensis.svg`).
result: [pending]

## Summary

total: 1
passed: 0
issues: 0
pending: 1
skipped: 0
blocked: 0

## Gaps
