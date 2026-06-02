---
phase: 127-inactive-taxon-remapping
plan: "01"
subsystem: data-pipeline
tags: [inactive-taxon, remap, gate, dbt-seed, python]
dependency_graph:
  requires: [126-01, 126-02, 126-03]
  provides: [generate_inactive_remaps, check_inactive_gate, auto_synonyms.csv, inactive_unresolved.csv]
  affects: [data/run.py STEPS, data/resolve_taxon_ids.py, data/dbt/seeds/auto_synonyms.csv]
tech_stack:
  added: []
  patterns: [bridge-upsert-ON-CONFLICT, gate-step-after-producer-step, gitignored-writeback-csv, DuckDB-read_csv-header-True]
key_files:
  created:
    - data/tests/test_inactive_remap.py
  modified:
    - data/resolve_taxon_ids.py
    - data/run.py
    - data/.gitignore
decisions:
  - "Removed stale inactive-enumeration block (lines 258-273) from resolve_taxon_ids() — authoritative detection now lives in generate_inactive_remaps() against fresh taxa.csv.gz post taxa-download; leaving it caused confusing double-reporting against a stale dump"
  - "STEPS order: taxa-download -> inactive-remap -> inactive-gate -> taxon-lineage-extended (RD-01: runs against fresh taxa.csv.gz, bridge fully populated, D-10 upsert before dbt-build)"
  - "16 pre-existing test_resolve_taxon_ids.py failures are out of scope (dbt_sandbox.occurrence_synonyms missing from resolver_db fixture — CatalogException; pre-dated Phase 127)"
metrics:
  duration_seconds: 377
  completed_date: "2026-05-31"
  tasks_completed: 3
  files_changed: 4
---

# Phase 127 Plan 01: Inactive Taxon Remapping — Python Safety Net Summary

**One-liner:** Dormant inactive-taxon safety net: auto-remap 1-successor inactive bridge entries to auto_synonyms.csv + bridge UPSERT, hard-fail gate for unresolvable cases, wired as STEPS after taxa-download.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Wave 0 — failing unit tests (RED) | 7ed02df | data/tests/test_inactive_remap.py (new, 366 lines) |
| 2 | Implement generate_inactive_remaps() and check_inactive_gate() (GREEN) | 8e973d0 | data/resolve_taxon_ids.py |
| 3 | Wire STEPS in run.py and update gitignore | 67dec27 | data/run.py, data/.gitignore |

## What Was Built

### `generate_inactive_remaps()` (data/resolve_taxon_ids.py)

Detects inactive bridge taxon IDs via `bridge LEFT JOIN read_csv(taxa.csv.gz, header=True) WHERE t.active = false`, then for each inactive row:
- Fetches `GET /v1/taxa/{id}` via `_inat_get_with_retry(url, params={}, timeout=30)`
- Normalizes `current_synonymous_taxon_ids` with `or []` (Pitfall 3: handles None for active taxa)
- **Exactly 1 successor**: looks up successor name in taxa.csv.gz; if found, appends to auto_synonyms.csv rows and UPSERTs `lower(successor_name) -> successor_taxon_id` into the bridge (D-10 ON CONFLICT shape); if absent, triages with `reason=successor_not_in_taxa_csv`
- **0 successors**: triages with `reason=no_successor`
- **>=2 successors**: triages with `reason=split` (no silent guessing on a genuine split — D-08)
- Always writes `auto_synonyms.csv` with at least a header row (D-04 — dbt seed never breaks on 0-inactive run)
- Always overwrites `inactive_unresolved.csv` so stale empty file cannot mask new offenders (T-127-03)

### `check_inactive_gate()` (data/resolve_taxon_ids.py)

Mirrors `check_resolution_gate()` exactly: reads `inactive_unresolved.csv`, `sys.exit(actionable message with offending canonical_names)` on any rows — no KNOWN_NON_BEES-style escape hatch (D-07). Prints "inactive-gate: OK (0 unresolved inactive taxa)" when clear.

### Module constants added (data/resolve_taxon_ids.py lines 22-24)

```python
AUTO_SYNONYMS_CSV = Path(__file__).parent / "dbt/seeds/auto_synonyms.csv"
INACTIVE_UNRESOLVED_CSV = Path(__file__).parent / "inactive_unresolved.csv"
INAT_TAXA_ID_URL = "https://api.inaturalist.org/v1/taxa/{}"
```

### STEPS ordering (data/run.py lines 95-98)

Final STEPS order per RD-01:
```
resolve-taxon-ids -> resolution-gate -> taxa-download ->
inactive-remap -> inactive-gate -> taxon-lineage-extended -> ... -> dbt-build
```

**Why this ordering:** inactive-remap runs against fresh `taxa.csv.gz` (downloaded by taxa-download, not yesterday's S3 pre-pull); bridge is fully populated by resolve-taxon-ids; D-10 bridge upsert completes before dbt-build reads the bridge.

### Gitignore additions (data/.gitignore)

Added to "# Pipeline writeback files" block:
- `inactive_unresolved.csv` — triage report, overwritten each run (D-12)
- `dbt/seeds/auto_synonyms.csv` — path-relative form matching raw/taxa.csv.gz convention (Pitfall 5: bare `auto_synonyms.csv` would not match the file at `data/dbt/seeds/`)

## Removed: Stale Inactive-Enumeration Block

The existing block in `resolve_taxon_ids()` (original lines 258-273) that ran:
```python
# bridge LEFT JOIN taxa.csv.gz WHERE active = false
# print inactive count + per-row details
```
**was removed.** Reason: after Phase 127, `generate_inactive_remaps()` is the authoritative inactive detection and runs against today's fresh `taxa.csv.gz`. The old block ran against yesterday's stale dump (before `taxa-download`), creating confusing double-reporting with different counts. Per RESEARCH open-question-1 recommendation.

## Pre-existing test_resolve_taxon_ids.py Failures (OUT OF SCOPE)

16 tests in `data/tests/test_resolve_taxon_ids.py` fail with `CatalogException: schema "dbt_sandbox" does not exist`. These failures **pre-date Phase 127** — the `resolver_db` fixture does not create `dbt_sandbox.occurrence_synonyms`, which `_names_to_resolve()` queries. These are excluded per RESEARCH open-question-3 and the plan's verification directive: `--ignore` is not needed for the new tests (test_inactive_remap.py), which are fully isolated from `resolve_taxon_ids()` (Pitfall 4 compliance).

The new `inactive_remap_db` fixture deliberately does NOT call `resolve_taxon_ids()` — it tests `generate_inactive_remaps()` in isolation with a pre-seeded bridge, avoiding the dbt_sandbox gap entirely.

## Test Coverage

All 7 unit tests in `data/tests/test_inactive_remap.py` pass:

| Test | Behavior Covered |
|------|-----------------|
| `test_single_successor_writes_auto_synonyms` | ITR-01: 1-successor -> auto_synonyms row + bridge upsert |
| `test_zero_inactive_writes_header_only` | D-04: 0 inactive -> header-only auto_synonyms.csv |
| `test_zero_successors_writes_triage` | ITR-02: no_successor reason |
| `test_split_writes_triage` | ITR-02: split reason |
| `test_successor_not_in_taxa_csv` | ITR-02: successor_not_in_taxa_csv reason |
| `test_inactive_gate_blocks` | ITR-02: gate sys.exit with offending name in message |
| `test_inactive_gate_passes_empty` | ITR-02: gate OK on header-only CSV |

## Deviations from Plan

### Auto-fixed Issues

None — plan executed exactly as written.

### Notable implementation choices

- `inactive_remap_db` fixture patches `resolve_taxon_ids.__file__` to `tmp_path / "resolve_taxon_ids.py"` so `Path(__file__).parent` resolves to `tmp_path`, making `raw/taxa.csv.gz` and writeback paths resolve correctly in isolation.
- `auto_synonyms.csv` parent directory created with `mkdir(parents=True, exist_ok=True)` — `dbt/seeds/` does not exist on first run.

## Threat Surface Scan

No new network endpoints, auth paths, or trust boundaries introduced beyond those documented in the plan's `<threat_model>`. T-127-01 (SQL injection via API values) mitigated: all DuckDB writes use parameterized `?` placeholders. T-127-02 (malformed API response) mitigated: `or []` normalization + empty `results` guard + HTTPError -> api_error triage. T-127-03 (gate bypass) mitigated: always-overwrite of triage CSV + sys.exit on any row.

## Self-Check: PASSED

- data/tests/test_inactive_remap.py: FOUND
- data/resolve_taxon_ids.py: FOUND
- data/run.py: FOUND
- data/.gitignore: FOUND
- Commit 7ed02df (RED tests): FOUND
- Commit 8e973d0 (GREEN implementation): FOUND
- Commit 67dec27 (STEPS wiring): FOUND
