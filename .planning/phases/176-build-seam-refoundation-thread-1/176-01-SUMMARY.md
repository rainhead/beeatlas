---
phase: 176-build-seam-refoundation-thread-1
plan: "01"
subsystem: data-pipeline
tags: [artifacts, contract, manifest, stdlib, tdd]
dependency_graph:
  requires: []
  provides:
    - data/artifacts.toml (artifact contract)
    - data/artifacts.py (loader + CLI)
    - data/tests/test_artifacts.py (pytest suite)
  affects:
    - data/nightly.sh (future Plans 02-03 will wire this contract)
    - .github/workflows/deploy.yml (future Plan 04 will wire this contract)
tech_stack:
  added:
    - tomllib (stdlib TOML parser, Python 3.11+)
  patterns:
    - "Declarative TOML contract with stdlib-only Python loader (mirrors config.py pattern)"
    - "TDD RED/GREEN per task: bootstrap failing tests committed before implementation"
    - "Byte-exact manifest golden test as SC-3 regression floor"
key_files:
  created:
    - data/artifacts.toml
    - data/artifacts.py
    - data/tests/test_artifacts.py
  modified: []
decisions:
  - "render_manifest() is a public module function (not CLI-only) so tests call it directly without subprocess"
  - "load() does NOT validate — allows tests to load intentionally invalid tomls"
  - "Field defaults applied in load() for gzip/baseline_diff/build_time_fetch/build_time_fetch_optional/content_type; source_file/hash_basename/metadata_type are kind-specific required fields with no default"
  - "Synthetic name_map in golden test uses logical name (not hash_basename) as the value prefix — test correctness only, production uses hash_basename"
metrics:
  duration_minutes: ~30
  completed_date: "2026-07-02"
  tasks_completed: 3
  files_created: 3
  files_modified: 0
  tests_added: 20
---

# Phase 176 Plan 01: Declarative Artifact Contract Summary

Stdlib-only `artifacts.toml` + `artifacts.py` contract module establishing the
16-artifact manifest schema, fail-loud validation, and byte-exact manifest rendering
as the risk-free foundation Plans 02–04 depend on.

## What Was Built

**`data/artifacts.toml`** — 16 `[artifacts.<name>]` tables in manifest order (matching
`nightly.sh` heredoc). 14 hashed artifacts + 2 metadata artifacts. All 16 are
`provenance = "derived"` this phase; the schema supports `authoritative` for Phase 179
`notes.json`. Key non-obvious encodings:
- `occurrences_db` shares `hash_basename = "occurrences"` with `occurrences` (differs by .db extension)
- `places_meta` reads `source_file = "places.json"` but hashes under basename `places_meta`
- `species_hosts` is the sole `build_time_fetch_optional = true` artifact (pre-first-nightly guard)
- `collector_event_pages` is `baseline_diff = false` (too large, ~29 MB) but `build_time_fetch = true`

**`data/artifacts.py`** — stdlib-only module (tomllib/json/sys/argparse/pathlib).
Public API: `load()`, `validate()`, `hashed_artifacts()`, `metadata_artifacts()`,
`baseline_diff_artifacts()`, `build_time_fetch_artifacts()`, `authoritative_names()`,
`derived_names()`, `render_manifest()`. Five CLI verbs: `validate`, `publish-plan`,
`manifest`, `baseline-pull-plan`, `build-time-fetch`. Runs under bare `python3`
(no uv/venv) for CI compatibility (deploy.yml invariant).

**`data/tests/test_artifacts.py`** — 20 pytest tests. Three categories:
1. Real contract (3): load 16 artifacts, validate passes, manifest order
2. Fail-loud invariants (8): all validate() rules covered by a temp-toml test
3. SEAM-04 synthetic authoritative (2): valid auth artifact excluded from baseline; auth+baseline_diff raises
4. SC-3 regression floor (3): baseline 9-set == LOCAL_NAMES; source files match; btf 6-set == deploy.yml with species_hosts optional
5. Byte-exact manifest golden (1): render_manifest() == nightly.sh heredoc byte-exactly
6. Manifest coverage (2): missing and extra hashed key both raise ValueError

## Deviations from Plan

None — plan executed exactly as written.

TDD discipline followed per-task:
- Task 2 RED: minimal bootstrap test committed before artifacts.py (confirmed ModuleNotFoundError)
- Task 2 GREEN: artifacts.py implemented, bootstrap tests pass
- Task 3: full suite expanded test_artifacts.py; all 20 pass including randomized order

## Verification

- `python3 data/artifacts.py validate` → `OK: 16 artifacts (16 derived, 0 authoritative)` (exit 0)
- `python3 data/artifacts.py publish-plan | wc -l` → `14`
- `python3 data/artifacts.py build-time-fetch | wc -l` → `6`
- `cd data && uv run pytest tests/test_artifacts.py -q` → `20 passed`
- `cd data && uv run pytest tests/test_artifacts.py -q -p randomly` → `20 passed` (order-stable)
- All three invocations above use bare `python3` (stdlib-only import set confirmed)

## Known Stubs

None. This plan creates no consumer wiring — Plans 02-04 wire the contract.
The module is fully functional; `nightly.sh` and `deploy.yml` still use hardcoded
lists until those follow-on plans execute.

## Threat Flags

None. `artifacts.py` performs zero S3/subprocess I/O — it emits text only.
The CLAUDE.md invariant "Python knows nothing about S3" is satisfied.

## Self-Check: PASSED

| Item | Result |
|------|--------|
| data/artifacts.toml | FOUND |
| data/artifacts.py | FOUND |
| data/tests/test_artifacts.py | FOUND |
| Commit 6eace01b (artifacts.toml) | FOUND |
| Commit a1759450 (RED bootstrap tests) | FOUND |
| Commit a81e920f (artifacts.py GREEN) | FOUND |
| Commit 0c04b314 (full test suite) | FOUND |
