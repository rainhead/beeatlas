# Phase 087 — Incremental Materialization Experiment Timings

Captured: 2026-05-13

This file records wall-clock and per-node `execution_time` (from
`run_results.json`) for the four measured `dbt build` runs in Plan 01.

Source captures (sibling files in this directory):
- `run_results-baseline.json` — pre-experiment full build (materialized='table')
- `run_results-incr-full.json` — first incremental build (--full-refresh)
- `run_results-incr-noop.json` — incremental no-op (no source change)
- `run_results-incr-change.json` — incremental run after UPDATE+UPDATE-back on `modified`

Per-node times are extracted from each `run_results-*.json` via
`jq '.results[] | select(.unique_id | test("int_combined|occurrences"))'`.

---

## baseline

Run with the unmodified `materialized='table'` config on `int_combined`.

| Field | Value |
|-------|-------|
| Command | `time bash data/dbt/run.sh build --select int_combined+ --full-refresh` |
| Wall-clock (`time` total) | 3.317s (user 2.96s + system 0.59s) |
| dbt internal `Finished running` | 0.91s |
| int_combined execution_time | 0.236s |
| occurrences execution_time | 0.362s |
| species execution_time | 0.027s |
| int_species_universe execution_time | 0.030s |
| int_species_geo_agg execution_time | 0.050s |
| not_null_int_combined_is_provisional | 0.020s (PASS) |
| int_combined materialization (log) | `sql table model` |
| Cache state | fs-cache flushed: sync ok, purge skipped (no sudo) |
| dbt result | `PASS=6 WARN=0 ERROR=0 SKIP=0 NO-OP=0 TOTAL=6` |
| Notes | Pre-experiment reference. `int_combined.sql` is unmodified `materialized='table'`. Row count anchor: 47,840 (see `baseline-rowcount.txt`). |
