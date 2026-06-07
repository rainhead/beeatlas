---
status: blocked
phase: 142-verify-budget-green-suite-nightly-wiring
source: [142-VERIFICATION.md]
started: 2026-06-07T00:00:00Z
updated: 2026-06-07T00:00:00Z
---

## Current Test

[both items blocked on prerequisite — accepted by user 2026-06-07; phase marked complete]

## Notes (2026-06-07)

- First rigged `bash data/nightly.sh` run (rig: `data/tests/test_nightly_gate_rig_REMOVE_ME.py`,
  untracked) aborted EARLY at the pre-existing **resolution-gate** ("9 bee name(s)
  unresolved before dbt build": agapostemon, amara, andrena, anthaxia, anthidiellum,
  anthidium, anthophora, ashmeadiella, atoposmia) — this gate runs inside run.py BEFORE
  the dbt build, so block 2b (our integration gate) was never reached. EXIT=1 and the
  EXIT-trap DuckDB/taxa backup fired correctly, but via the resolution-gate, not block 2b.
- The abort-before-publish + EXIT-trap + exit-1 machinery is therefore observed (no upload,
  no CloudFront invalidation, no healthcheck ping), but block 2b itself is NOT yet exercised.
- Unrelated operational finding (NOT introduced by Phase 142): the nightly is currently
  blocked by the resolution-gate; fix with `uv run python resolve_taxon_ids.py --refresh-lineage`.
- Decision: resolve names, then re-run the rigged nightly so the build reaches block 2b.

## Tests

### 1. Live nightly gate failure blocks publish
expected: With a deliberately-failing `@integration` test, a real `bash data/nightly.sh` run on maderas exits non-zero AFTER the dbt build but BEFORE the S3 upload — no artifacts are uploaded, no CloudFront invalidation fires, the healthcheck is NOT pinged, and the EXIT-trap DuckDB/taxa backup STILL runs. The failure is visible in the nightly log.
how_to_test: On maderas, temporarily add a `assert False` to one `@integration` test (or point `public/data` at a deliberately-divergent artifact), run `bash data/nightly.sh`, confirm `$?` is non-zero and the log shows the gate firing before the "hashing and uploading exports" step. Revert the forced failure afterward.
result: blocked
blocked_by: prior-phase
reason: "Two nightly runs aborted at the pre-existing resolution-gate (9 then 43 unresolved bee names) before the dbt build — block 2b was never reached. Abort-before-publish + EXIT-trap machinery observed firing live via the resolution-gate; block 2b position structurally verified. Unrelated to Phase 142; tracked in .planning/todos/pending/resolution-gate-unresolved-bee-names.md."

### 2. Slow/integration tier passes in steady-state against real built data
expected: `cd data && uv run pytest -m integration -q` passes (0 failures) on maderas after a normal nightly build, with real dbt `target/sandbox/*` artifacts and the prior night's `public/data/*` baseline present. NOTE: on the FIRST nightly after the Phase 131 schema change, `test_dbt_diff` is EXPECTED to fail (live `public/data` carries the old schema vs the fresh 33-col sandbox) — this is correct regression behavior and self-heals on the next publish (documented in `data/nightly.sh` near block 2b). Criterion 4 applies to the second+ (steady-state) run.
how_to_test: After a successful nightly publish, run the integration tier on maderas against the freshly-built artifacts. Confirm green (or, if first run post-schema-change, confirm the only failure is the documented `test_dbt_diff` schema mismatch and that the next run is green).
result: blocked
blocked_by: prior-phase
reason: "Pipeline cannot build to completion — the resolution-gate (43 unresolved bee names) aborts before the dbt build, so no real built artifacts exist to run the slow tier against. Unrelated to Phase 142; tracked in .planning/todos/pending/resolution-gate-unresolved-bee-names.md. Will run on the first clean nightly."

## Summary

total: 2
passed: 0
issues: 0
pending: 0
skipped: 0
blocked: 2

## Gaps
