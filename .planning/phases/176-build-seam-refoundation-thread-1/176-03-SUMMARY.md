---
phase: 176-build-seam-refoundation-thread-1
plan: "03"
subsystem: data-pipeline
tags: [artifacts, contract, deploy, adr, seam]
dependency_graph:
  requires: [176-01]
  provides:
    - .github/workflows/deploy.yml (contract-driven build-time fetch)
    - docs/adr/0002-derived-vs-authoritative-artifacts.md
    - CLAUDE.md (artifacts.toml pointer + ADR 0002 reference)
  affects:
    - CI build job (deploy.yml fetch step)
tech_stack:
  added: []
  patterns:
    - "Contract-driven CI fetch loop: artifacts.py build-time-fetch | while IFS=$'\\t' read -r key local optional"
    - "Optional-flag tolerance: species_hosts pre-first-nightly guard preserved via emitted optional=true"
    - "ADR format matching 0001: Status / Context / Decision / Consequences"
key_files:
  created:
    - docs/adr/0002-derived-vs-authoritative-artifacts.md
  modified:
    - .github/workflows/deploy.yml
    - CLAUDE.md
decisions:
  - "Process substitution vs pipe: used pipe (plan spec); with GitHub Actions bash -e -o pipefail, exit 1 inside piped while exits subshell with 1 and pipefail propagates the failure"
  - "local as read variable name: safe outside functions (not a builtin call, just a variable name argument to read)"
  - "ADR stable-dir exclusion is documented as a scoped intentional exclusion, not a gap"
metrics:
  duration_minutes: ~15
  completed_date: "2026-07-02"
  tasks_completed: 2
  files_created: 1
  files_modified: 2
  tests_added: 0
---

# Phase 176 Plan 03: Deploy.yml Contract-Driven Fetch + ADR 0002 Summary

Contract-driven deploy.yml build-time fetch (6 keys loop, species_hosts tolerance
preserved) and ADR 0002 documenting derived-vs-authoritative schema-evolution regimes.

## What Was Built

**`.github/workflows/deploy.yml`** — "Fetch build-time data from S3" step rewritten.
Replaces 5 required `jq -r .<key>` fetches plus the guarded `species_hosts` conditional
with a single `python3 data/artifacts.py build-time-fetch | while IFS=$'\t' read -r key local optional` loop.
Loop logic: lookup `HASHED=$(jq -r --arg k "$key" '.[$k] // empty' /tmp/manifest.json)`;
if empty + optional=true → echo note and continue; if empty + required → `echo ERROR >&2; exit 1`;
otherwise `aws s3 cp .../data/$HASHED public/data/$local`. The `mkdir -p public/data`,
manifest S3 copy, and `cp /tmp/manifest.json public/data/manifest.json` (validate-db) are
all preserved. No setup-python or uv step added — stdlib-only runs under CI's bare python3.
Step comment updated to name data/artifacts.toml as the fetch-list source.

**`docs/adr/0002-derived-vs-authoritative-artifacts.md`** — 128-line ADR matching the 0001
format. Records:
- The three former hand-synced artifact sites and their elimination
- The documented exclusion of the three stable-directory recursive publishes
- The provenance classification rule (ultimate data source, not production mechanism)
- The two schema-evolution regimes with their distinct enforcement rules
- Machine enforcement points in `artifacts.py` (`validate()` rejects auth+baseline_diff;
  `baseline-pull-plan` structurally excludes authoritative artifacts)

**`CLAUDE.md`** — One-line Known-State pointer naming `data/artifacts.toml` as the single
declarative artifact contract and linking to ADR 0002.

## Deviations from Plan

None — plan executed exactly as written.

## Verification

- `python3 data/artifacts.py build-time-fetch | wc -l` → 6
- `python3 data/artifacts.py build-time-fetch | grep species_hosts` → `species_hosts	species_hosts.json	true`
- `grep -c 'SPECIES_FILE=$(jq' .github/workflows/deploy.yml` → 0
- `grep -c 'SPECIES_HOSTS_FILE=$(jq' .github/workflows/deploy.yml` → 0
- `grep -q 'artifacts.py build-time-fetch' .github/workflows/deploy.yml` → success
- `grep -q 'cp /tmp/manifest.json public/data/manifest.json' .github/workflows/deploy.yml` → success
- `yq '.' .github/workflows/deploy.yml` → YAML valid
- ADR exists, contains forward-only/FORBIDDEN/baseline_diff/artifacts.toml/stable-dir exclusion
- `grep -q 'artifacts.toml' CLAUDE.md` → success; `grep -q '0002-derived-vs-authoritative' CLAUDE.md` → success
- `cd data && uv run pytest tests/test_artifacts.py -q` → 20 passed

## Known Stubs

None. The contract-driven fetch is fully wired. The `authoritative` path is built but not yet
exercised end-to-end (first exercise: Phase 179 `notes.json`).

## Threat Flags

None. The deploy.yml change moves key selection from hardcoded shell to a contract-driven Python
emitter. No new network endpoints, auth paths, or trust boundaries are introduced; the same S3
role assumption and `vars.S3_BUCKET_NAME` are used. T-176-05 is mitigated as designed: the
6-row floor is tested by `tests/test_artifacts.py`; a contract drift trips pytest before deploy.

## Self-Check: PASSED

| Item | Result |
|------|--------|
| .github/workflows/deploy.yml | FOUND |
| docs/adr/0002-derived-vs-authoritative-artifacts.md | FOUND |
| CLAUDE.md (0002 reference) | FOUND |
| Commit 5c92e459 (deploy.yml contract loop) | FOUND |
| Commit 4f5d70ed (ADR 0002 + CLAUDE.md) | FOUND |
