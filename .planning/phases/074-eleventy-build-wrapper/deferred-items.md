# Phase 074 — Deferred Items

Issues found during execution that are out-of-scope for the current plan.

## 074-01: Local parquet schema is stale (missing `sample_host`)

**Found during:** Task 1, `npm run validate-schema` step.

**Symptom:** Local `public/data/occurrences.parquet` (mtime 2026-04-20) was
written by an older pipeline run that predates the addition of the
`sample_host` column to `EXPECTED` in `scripts/validate-schema.mjs`. Running
`npm run validate-schema` against the local file fails:

```
x occurrences.parquet: missing columns: sample_host
```

**Verified not caused by hoist:** Inspected the parquet directly with
hyparquet immediately after the hoist; the column is genuinely absent in
the on-disk file. CloudFront-served parquet has the column (validate-schema
falls through to CloudFront when the local file is removed and reports
`ok occurrences.parquet`). The path edit (`../frontend/public/data/` →
`../public/data/`) in `scripts/validate-schema.mjs` is functioning
correctly — it found and read the stale file. This is pre-existing
developer-local state, not a regression introduced by Plan 074-01.

**Impact on Plan 074-01 verify:** The `npm run validate-schema` step in
Task 1's `<verify>` block exits non-zero (because of the local file),
and the `npm run build` step in Task 2's `<verify>` block also exits
non-zero (because `build` chains validate-schema). To execute Task 2's
build verification, the stale local parquet was temporarily moved aside
(allowing CloudFront fallback). It was restored after the build verify
passed. Production CI is unaffected (CI has no local parquet and always
hits CloudFront).

**Resolution path:** Re-run the data pipeline locally
(`cd data && uv run python run.py`) to regenerate
`public/data/occurrences.parquet` with the current schema. Out of scope
for Phase 074 — Phase 074 is purely a build-system hoist.

**Owner:** Project owner — refresh local parquet at convenience.
