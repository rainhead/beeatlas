---
status: partial
phase: 175-floral-host-provenance
source: [175-VERIFICATION.md]
started: 2026-06-30T18:56:06Z
updated: 2026-06-30T19:20:00Z
---

## Current Test

[render verified locally against real data 2026-06-30; operational prod-publish confirmation pending]

## Tests

### 1. "Collected from" block renders correctly
expected: On a covered species page the "Collected from" section renders below the Traits fact-sheet — flower families ordered by distinct-sample count desc (family-name tiebreak), genera nested (middot-separated, capped), "(+N more families)" footer past the family cap, host names autoescaped. Species with no host data omit the block.
result: passed — verified 2026-06-30 via local QA against a REAL species_hosts.json built from local taxa.csv.gz + dbt_sandbox.int_ecdysis_base (539 covered species). Checked Bombus mixtus (28 families, +N cap), Osmia lignaria (no cap), Stelis pavonina (block omitted). 0 genus==family violations (WR-01 rank-guard holds), deterministic ordering confirmed.

### 2. Operational: sidecar reaches prod via the nightly + deploy path
expected: After the first nightly run following the code deploy, the live manifest gains a `species_hosts` key, deploy.yml fetches it to public/data/species_hosts.json, and the prod species pages render the block. Until then the deploy.yml `// empty` guard keeps the code deploy green with the block absent.
result: [pending — operational confirmation only; render logic already verified in test 1]

## Summary

total: 2
passed: 1
issues: 0
pending: 1
skipped: 0
blocked: 0

## Gaps
