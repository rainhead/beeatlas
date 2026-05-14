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

---

## incr-full

First build after converting `int_combined` to `materialized='incremental'`,
invoked with `--full-refresh` (rebuilds the table from scratch as an incremental
target — both ARMs execute because `is_incremental()` returns false during full
refresh).

| Field | Value |
|-------|-------|
| Command | `time bash data/dbt/run.sh build --select int_combined+ --full-refresh` |
| Wall-clock (`time` total) | 2.826s (user 3.21s + system 0.37s) |
| dbt internal `Finished running` | 0.83s |
| int_combined execution_time | 0.226s |
| occurrences execution_time | 0.379s |
| species execution_time | 0.026s |
| int_species_universe execution_time | 0.034s |
| int_species_geo_agg execution_time | 0.020s |
| not_null_int_combined_is_provisional | 0.020s (PASS) |
| int_combined materialization (log) | `sql incremental model` |
| dbt result | `PASS=6 WARN=0 ERROR=0 SKIP=0 NO-OP=0 TOTAL=6` |
| Notes | int_combined time essentially unchanged (0.236s → 0.226s). On `--full-refresh`, dbt drops + recreates the table; both ARMs execute. Cache was warm from baseline run. |

---

## incr-noop

Incremental run with no source data changes. `is_incremental()` is true,
ARM 1 watermark filter activates (no rows match because no `e.modified` is
greater than the current MAX), ARM 2 is short-circuited by `AND FALSE`.
dbt emits a `delete+insert` cycle that touches zero rows.

| Field | Value |
|-------|-------|
| Command | `time bash data/dbt/run.sh build --select int_combined+` |
| Wall-clock (`time` total) | 2.410s (user 2.89s + system 0.35s) |
| dbt internal `Finished running` | 0.75s |
| int_combined execution_time | 0.132s |
| occurrences execution_time | 0.385s |
| species execution_time | 0.028s |
| int_species_universe execution_time | 0.039s |
| int_species_geo_agg execution_time | 0.020s |
| not_null_int_combined_is_provisional | 0.019s (PASS) |
| int_combined materialization (log) | `sql incremental model` |
| dbt result | `PASS=6 WARN=0 ERROR=0 SKIP=0 NO-OP=0 TOTAL=6` |
| Notes | int_combined: 0.226s (incr-full) → 0.132s (incr-noop) ≈ 0.094s saved (~42% on this node). BUT downstream `occurrences` external mart unchanged at 0.385s — it rebuilds the full parquet regardless (Pitfall 2). Total chain savings: ~0.10s. |

---

## incr-change

Simulated data change: `UPDATE ecdysis_data.occurrences SET modified = NOW()
WHERE id = '5594056'` (original `modified = 2025-03-13 05:30:27 America/Los_Angeles`).
After the dbt build, the source UPDATE was reverted in the same task.

| Field | Value |
|-------|-------|
| Command | `time bash data/dbt/run.sh build --select int_combined+` |
| Wall-clock (`time` total) | 2.582s (user 2.96s + system 0.38s) |
| dbt internal `Finished running` | 0.80s |
| int_combined execution_time | 0.126s |
| occurrences execution_time | 0.420s |
| species execution_time | 0.032s |
| int_species_universe execution_time | 0.047s |
| int_species_geo_agg execution_time | 0.026s |
| not_null_int_combined_is_provisional | 0.019s (PASS) |
| int_combined materialization (log) | `sql incremental model` |
| Chosen source row | `ecdysis_data.occurrences.id = '5594056'` |
| Original `modified` | `2025-03-13 05:30:27 America/Los_Angeles` (restored post-run) |
| dbt result | `PASS=6 WARN=0 ERROR=0 SKIP=0 NO-OP=0 TOTAL=6` |
| Notes | Incremental cost essentially identical to no-op (0.132s → 0.126s). The single-row watermark match + delete+insert is negligibly cheaper than the no-op's empty delete+insert. |

---

## row counts

ARM 2 dedup assertion — numeric check that the incremental delete+insert cycle
plus the `AND FALSE` ARM 2 skip does not produce duplicates or row loss vs. the
pre-experiment `materialized='table'` baseline.

| Source | int_combined `COUNT(*)` | Notes |
|--------|--------------------------|-------|
| baseline (from `baseline-rowcount.txt`, Task 1) | 47840 | Pre-experiment materialized='table' build |
| current (post incr-noop + incr-change + UPDATE-back) | 47840 | After all four runs + source revert |
| diff (current - baseline) | 0 | Within ±1 tolerance — ARM 2 dedup holds |

The `AND FALSE` ARM 2 skip on incremental runs successfully prevents the NULL
unique_key duplication failure mode called out in 087-RESEARCH.md Pitfall 3.
The existing `not_null_int_combined_is_provisional` dbt test continues to pass
against the incremental int_combined (run via `bash data/dbt/run.sh test --select int_combined`).
