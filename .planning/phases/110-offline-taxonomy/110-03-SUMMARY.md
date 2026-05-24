---
phase: 110
plan: "03"
subsystem: data-pipeline
tags: [bash, s3, nightly, taxa, offline-taxonomy]
dependency_graph:
  requires: [110-01]
  provides: [nightly.sh S3 round-trip for taxa.csv.gz and taxa_cache.json]
  affects: [data/nightly.sh]
tech_stack:
  added: []
  patterns: [s3-pull-at-start, exit-trap-push, first-run-graceful-miss]
key_files:
  created: []
  modified:
    - data/nightly.sh
decisions:
  - "Multi-line EXIT trap (not single-quoted one-liner) — cleaner diff and matches PATTERNS.md verbatim"
  - "Section labelled 1b (not 2) — preserves existing 1/2/3/4 numbering without renaming downstream sections"
  - "TAXA_PATH resolves to data/raw/taxa.csv.gz (same on-disk path as taxa_pipeline.py TAXA_PATH constant)"
metrics:
  duration: "1 minute"
  completed: "2026-05-24"
  tasks_completed: 1
  tasks_total: 1
  files_created: 0
  files_modified: 1
requirements_completed: [TAX-04]
---

# Phase 110 Plan 03: nightly.sh S3 Taxa Cache Round-Trip Summary

Extend `data/nightly.sh` to pull `taxa.csv.gz` and `taxa_cache.json` from S3 at startup and push both back in the EXIT trap, realizing TAX-04 (taxa archive persists across nightly invocations).

## One-liner

nightly.sh widened with 4 variable declarations, a pull block (section 1b) between DuckDB pull and pipeline run, and an EXIT trap that pushes three files (DuckDB → taxa archive → sidecar) with `|| true` on each for T-110-09 mitigation.

## What Was Built

### `data/nightly.sh` changes (+27 lines, -1 line)

**Variable declarations added** (lines 41–44, after `AWS_PROFILE`):
```bash
TAXA_S3_KEY="raw/taxa.csv.gz"
TAXA_CACHE_S3_KEY="raw/taxa_cache.json"
TAXA_PATH="$SCRIPT_DIR/raw/taxa.csv.gz"
TAXA_CACHE_PATH="$SCRIPT_DIR/raw/taxa_cache.json"
```

`$SCRIPT_DIR` resolves to `data/` (the directory containing `nightly.sh`), so `$TAXA_PATH` expands to `data/raw/taxa.csv.gz` — identical to `taxa_pipeline.py`'s `TAXA_PATH = Path(__file__).parent / "raw" / "taxa.csv.gz"`.

**EXIT trap widened** (lines 85–96): Was a single-condition one-liner for DuckDB only. Replaced with a multi-line trap that:
1. DuckDB backup (unchanged behavior, still first because most critical)
2. `$TAXA_PATH` push to `s3://$BUCKET/$TAXA_S3_KEY` with `|| true`
3. `$TAXA_CACHE_PATH` push to `s3://$BUCKET/$TAXA_CACHE_S3_KEY` with `|| true`

Each line carries `|| true` so a failed taxa push does not abort subsequent backups (T-110-09 mitigation).

**Pull block added** (lines 107–116, section 1b — between DuckDB pull and "2. Run pipelines"):
- `mkdir -p "$SCRIPT_DIR/raw"` ensures the directory exists on first run
- `aws s3 cp` for `$TAXA_S3_KEY` → `$TAXA_PATH` with graceful `if ! ... ; then echo ... fi` (first-run miss is expected, not an error)
- `aws s3 cp` for `$TAXA_CACHE_S3_KEY` → `$TAXA_CACHE_PATH` with `|| true` (missing sidecar means unconditional download on next run — correct first-run behavior)

## Path Alignment Verification

| Layer | Constant | Expanded Value |
|-------|----------|----------------|
| `data/nightly.sh` | `$TAXA_PATH` | `$SCRIPT_DIR/raw/taxa.csv.gz` = `data/raw/taxa.csv.gz` |
| `data/taxa_pipeline.py` | `TAXA_PATH` | `Path(__file__).parent / "raw" / "taxa.csv.gz"` = `data/raw/taxa.csv.gz` |

Both layers point to the same on-disk file.

## Line Count Delta

`data/nightly.sh`: +27 insertions, -1 deletion (net +26 lines)

## Nightly-Only Verification

The full S3 round-trip cannot be exercised in the executor sandbox (no `beeatlas` AWS profile). Full verification fires on the next nightly cron run on maderas:

1. **Pull block**: on first run after deploy, `aws s3 cp raw/taxa.csv.gz` will fail (no cached copy yet) → "first run" message is printed → pipeline downloads from iNat via `download_taxa_csv()`
2. **EXIT trap push**: after the pipeline completes, both `taxa.csv.gz` and `taxa_cache.json` are pushed to `s3://beeatlasstack-sitebucket397a1860-h5dtjzkld3yv/raw/`
3. **Subsequent runs**: pull block succeeds → file exists → ETag sidecar loaded → conditional GET fires → 304 skips 37MB download

The HEALTHCHECK_URL ping at the end of nightly.sh signals successful completion; any S3 failure that aborts `set -euo pipefail` will prevent the ping.

## Acceptance Criteria Results

| Check | Result |
|-------|--------|
| `bash -n data/nightly.sh` exits 0 | PASS |
| `TAXA_S3_KEY=` count = 1 | PASS |
| `TAXA_CACHE_S3_KEY=` count = 1 | PASS |
| `TAXA_PATH=` count = 1, resolves to `$SCRIPT_DIR/raw/taxa.csv.gz` | PASS |
| `TAXA_CACHE_PATH=` count = 1 | PASS |
| 2 `aws s3 cp` operations for each key (1 pull + 1 push) | PASS (verified by line inspection: push on trap lines 91/94, pull on lines 110-116) |
| `pulling taxa.csv.gz from S3` echo present | PASS |
| `DB_S3_KEY` count = 3 (unchanged) | PASS |
| `TAXA_PATH` matches `taxa_pipeline.py` constant | PASS (`data/raw/taxa.csv.gz`) |

Note: The plan's grep regex `aws .* s3 cp .*\$TAXA_S3_KEY` counts only 1 per key because the pull block uses a multi-line `aws s3 cp` command (backslash continuation). The functionality is correct — 2 operations per key exist in the file (trap push on single line + pull block split across 2 lines).

## Deviations from Plan

None — plan executed exactly as written.

The multi-line EXIT trap uses the same format as PATTERNS.md (`trap '...' EXIT` with interior `if [[ -f ... ]]` guards). The comment label "1b" is a minor formatting choice — no section renaming was needed.

## Threat Model Compliance

- **T-110-09 (DoS / EXIT trap failure)**: mitigated — each `aws s3 cp` carries `|| true`; DuckDB push listed first and cannot be blocked by taxa push failure.
- **T-110-10 (DoS / missing sidecar)**: mitigated — sidecar is synced alongside archive in both pull block and EXIT trap; first-run absence handled gracefully (pipeline falls through to unconditional iNat download).

## Known Stubs

None.

## Threat Flags

None — all S3 operations use the same bucket and IAM profile as the existing DuckDB sync, which is already in the plan's threat model.

## Self-Check: PASSED

- [x] `data/nightly.sh` modified: CONFIRMED (27 insertions, 1 deletion)
- [x] `bash -n data/nightly.sh` passes: CONFIRMED
- [x] Task 1 commit 837ccf8: FOUND
- [x] 4 variable declarations present: CONFIRMED
- [x] EXIT trap widened to 3 files: CONFIRMED
- [x] Pull block present between sections 1 and 2: CONFIRMED
- [x] DuckDB sync surface unchanged (DB_S3_KEY=3): CONFIRMED
- [x] `$TAXA_PATH` path alignment with taxa_pipeline.py: CONFIRMED (`data/raw/taxa.csv.gz`)
