---
status: partial
phase: 142-verify-budget-green-suite-nightly-wiring
source: [142-VERIFICATION.md]
started: 2026-06-07T00:00:00Z
updated: 2026-06-07T00:00:00Z
---

## Current Test

[awaiting human testing on maderas]

## Tests

### 1. Live nightly gate failure blocks publish
expected: With a deliberately-failing `@integration` test, a real `bash data/nightly.sh` run on maderas exits non-zero AFTER the dbt build but BEFORE the S3 upload — no artifacts are uploaded, no CloudFront invalidation fires, the healthcheck is NOT pinged, and the EXIT-trap DuckDB/taxa backup STILL runs. The failure is visible in the nightly log.
how_to_test: On maderas, temporarily add a `assert False` to one `@integration` test (or point `public/data` at a deliberately-divergent artifact), run `bash data/nightly.sh`, confirm `$?` is non-zero and the log shows the gate firing before the "hashing and uploading exports" step. Revert the forced failure afterward.
result: [pending]

### 2. Slow/integration tier passes in steady-state against real built data
expected: `cd data && uv run pytest -m integration -q` passes (0 failures) on maderas after a normal nightly build, with real dbt `target/sandbox/*` artifacts and the prior night's `public/data/*` baseline present. NOTE: on the FIRST nightly after the Phase 131 schema change, `test_dbt_diff` is EXPECTED to fail (live `public/data` carries the old schema vs the fresh 33-col sandbox) — this is correct regression behavior and self-heals on the next publish (documented in `data/nightly.sh` near block 2b). Criterion 4 applies to the second+ (steady-state) run.
how_to_test: After a successful nightly publish, run the integration tier on maderas against the freshly-built artifacts. Confirm green (or, if first run post-schema-change, confirm the only failure is the documented `test_dbt_diff` schema mismatch and that the next run is green).
result: [pending]

## Summary

total: 2
passed: 0
issues: 0
pending: 2
skipped: 0
blocked: 0

## Gaps
