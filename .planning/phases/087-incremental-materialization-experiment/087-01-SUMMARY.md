---
phase: 087-incremental-materialization-experiment
plan: 01
subsystem: data-pipeline
tags: [dbt, dbt-duckdb, incremental, duckdb, materialization, spike]

# Dependency graph
requires:
  - phase: 086-port-remaining-transforms
    provides: dbt project structure, `data/dbt/run.sh` pinned wrapper (dbt-core 1.10.1 + dbt-duckdb 1.10.1), `int_combined` model as the largest table-materialized intermediate (47,840 rows)
provides:
  - 4 timed `dbt build` captures (baseline + 3 incremental variants) as evidence for Phase 88 adoption decision
  - `pre-experiment-sha.txt` and `baseline-rowcount.txt` instrumentation sidecars
  - `timings.md` with per-node `execution_time` for all four runs and a numeric ARM 2 dedup assertion
  - Modified-but-uncommitted experimental `int_combined.sql` in the working tree (Plan 02 consumes + reverts)
affects: [087-02-plan, phase-088, dbt-incremental-decision, nightly-rebuild-policy]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Spike measurement protocol: capture run_results.json after every dbt build with a `--label` suffix into the phase dir"
    - "Cold fs-cache flush via `sync` + best-effort `sudo purge` documented in timings"
    - "Single read_only=True DuckDB connect for row-count queries avoids dbt's exclusive lock"

key-files:
  created:
    - .planning/phases/087-incremental-materialization-experiment/run_results-baseline.json
    - .planning/phases/087-incremental-materialization-experiment/run_results-incr-full.json
    - .planning/phases/087-incremental-materialization-experiment/run_results-incr-noop.json
    - .planning/phases/087-incremental-materialization-experiment/run_results-incr-change.json
    - .planning/phases/087-incremental-materialization-experiment/timings.md
    - .planning/phases/087-incremental-materialization-experiment/baseline-rowcount.txt
    - .planning/phases/087-incremental-materialization-experiment/pre-experiment-sha.txt
  modified:
    - data/dbt/models/intermediate/int_combined.sql  # modified-but-uncommitted; Plan 02 reverts

key-decisions:
  - "Run #2c picked row id='5594056' (lowest-id ecdysis_data.occurrences row); original modified='2025-03-13 05:30:27 America/Los_Angeles' was restored in the same task via UPDATE-back"
  - "fs-cache flush state: sync ok + purge skipped (no sudo available in non-interactive shell); documented in timings.md baseline row per 087-VALIDATION.md Manual-Only Verifications row 2"
  - "Experimental SQL is left uncommitted in the working tree at end of plan per 087-RESEARCH.md Open Q1 'tried and reverted, no trace' pattern — Plan 02 reverts via direct edit"
  - "ARM 2 dedup verified numerically (diff=0 vs baseline 47840 after both UPDATE+UPDATE-back and the incremental no-op + change cycle)"

patterns-established:
  - "Measurement protocol: 4 captures (baseline / incr-full / incr-noop / incr-change), each immediately cp'd to phase dir to survive the next dbt build overwriting target/run_results.json"
  - "ARM 2 incremental skip: `{% if is_incremental() %} AND FALSE {% endif %}` is the right guard for UNION-ALL models whose second arm sets unique_key=NULL"
  - "ARM 1 watermark filter: `{% if is_incremental() %} WHERE e.modified > (SELECT COALESCE(MAX(modified), '1900-01-01') FROM {{ this }}) {% endif %}` against a VARCHAR YYYY-MM-DD modified column relies on lexicographic monotonicity (verified)"

requirements-completed:
  - TEST-03

# Metrics
duration: ~5min (3 dbt builds + 1 test invocation + instrumentation; <1s of dbt work per build)
completed: 2026-05-13
---

# Phase 087 Plan 01: Incremental Materialization Experiment — Capture Summary

**Captured 4 timed `dbt build` runs converting `int_combined` from `materialized='table'` to `materialized='incremental'` with ARM 1 watermark + ARM 2 `AND FALSE` skip; measured int_combined node drop from 0.236s baseline to 0.132s incremental no-op (~0.10s saved on the node, capped by downstream external mart still rebuilding fully).**

## Performance

- **Duration:** ~5 minutes (dominated by uvx/dbt startup; per-build dbt work is sub-second)
- **Tasks:** 3 of 3 completed
- **Files modified (tracked):** 7 created + 1 modified-uncommitted

## Accomplishments

- **All 4 captures show int_combined status=success** with no schema or test regressions.
- **ARM 2 dedup held numerically:** baseline 47840 rows = post-experiment 47840 rows (diff=0), well within the ±1 tolerance the plan demanded. The `{% if is_incremental() %} AND FALSE {% endif %}` guard on ARM 2 successfully avoids the Pitfall 3 NULL-unique_key duplication failure mode.
- **Confirmed the negative-result hypothesis from 087-RESEARCH.md:** downstream `occurrences` external mart rebuilt fully on every run regardless of int_combined's materialization (0.36s → 0.38s → 0.39s → 0.42s — variance is noise, not signal). Pitfall 2 verified empirically.
- **Confirmed the version-pin invariant:** `data/dbt/run.sh` untouched; all 4 runs used `dbt-core==1.10.1 + dbt-duckdb==1.10.1`.

## Headline Numbers

| Run | Wall-clock (`time`) | dbt `Finished` | int_combined | occurrences | int_combined log line |
|-----|---------------------|----------------|--------------|-------------|------------------------|
| baseline (table) | 3.317s | 0.91s | **0.236s** | 0.362s | `sql table model` |
| incr-full (--full-refresh) | 2.826s | 0.83s | 0.226s | 0.379s | `sql incremental model` |
| incr-noop | 2.410s | 0.75s | **0.132s** | 0.385s | `sql incremental model` |
| incr-change (UPDATE+UPDATE-back) | 2.582s | 0.80s | 0.126s | 0.420s | `sql incremental model` |

**Node-local savings:** 0.236s → 0.132s ≈ 0.104s (~44% on the int_combined node alone).
**End-to-end savings on `int_combined+`:** sub-100ms; downstream `occurrences` external mart consumes most of the wall-clock and rebuilds fully every run.

## ARM 2 Dedup Numeric Assertion

| Source | int_combined COUNT(*) |
|--------|------------------------|
| baseline (`baseline-rowcount.txt`) | 47840 |
| post incr-noop + incr-change + UPDATE-back | 47840 |
| diff | 0 |

`bash data/dbt/run.sh test --select int_combined` returned PASS=1 against the incremental model (`not_null_int_combined_is_provisional`).

## Cache State on Baseline

`fs-cache flushed: sync ok, purge skipped (no sudo)` — recorded verbatim in `timings.md` `## baseline` row. The non-interactive `sudo -n purge` failed cleanly (no password prompt blocked execution); `sync` always succeeded. This matches the planned fallback path documented in `<execution_notes>`.

## Task Commits

1. **Task 1: Baseline + sidecars** — `1486033` (feat) — captured `run_results-baseline.json`, `baseline-rowcount.txt`, `pre-experiment-sha.txt`, initial `timings.md ## baseline`
2. **Task 2: Incremental --full-refresh** — `e260819` (feat) — modified `int_combined.sql` (uncommitted), captured `run_results-incr-full.json`, appended `## incr-full` section
3. **Task 3: No-op + data-change + ARM 2 dedup** — `f31ed8c` (feat) — captured `run_results-incr-noop.json` and `run_results-incr-change.json`, appended `## incr-noop`, `## incr-change`, `## row counts` sections, ran `dbt test --select int_combined` (PASS)

## Files Created/Modified

- `run_results-baseline.json` — pre-experiment full build (materialized='table')
- `run_results-incr-full.json` — first incremental build via --full-refresh
- `run_results-incr-noop.json` — incremental no-op (no source change)
- `run_results-incr-change.json` — incremental build after UPDATE+UPDATE-back
- `timings.md` — 5 sections (baseline / incr-full / incr-noop / incr-change / row counts) + cache-flush note
- `baseline-rowcount.txt` — single integer `47840`
- `pre-experiment-sha.txt` — `78de3f544115288e331f30d051b65837c34e5dca` (resolvable git object)
- `data/dbt/models/intermediate/int_combined.sql` — **modified-but-uncommitted** experimental incremental config + ARM 1 watermark + ARM 2 `AND FALSE` skip; Plan 02 reverts via direct edit per 087-RESEARCH Open Q1

## Open Observations for Plan 02 Findings Doc

- **External marts cap any incremental savings:** `occurrences.execution_time` is 0.36–0.42s across all 4 runs regardless of int_combined materialization. Even a hypothetical instant int_combined would save < 250ms end-to-end on `int_combined+`. Confirms 087-RESEARCH §Pitfall 2.
- **Wall-clock total is dominated by dbt/uvx startup (~1.5–1.7s), not by model work.** Of the ~2.4–3.3s observed total, dbt itself reports only ~0.75–0.91s of model+test execution. Incremental cannot reduce startup.
- **Node-local savings are real but small (~100ms).** At nightly cadence (1 run/day), this saves ~36s/year. At hourly cadence (24 runs/day), ~14 minutes/year. The complexity cost (ARM 2 skip guard, watermark filter, --full-refresh required for Phase 88's CLEAN-02 column drop, on_schema_change='fail' forcing manual intervention on schema drift) is not justified by this savings profile.
- **`incr-full` int_combined time (0.226s) is ~4% lower than baseline (0.236s) on the same workload** — this is fs-cache warmth, not an incremental effect. Use this as the noise floor when assessing the 0.10s no-op savings: ratio is ~5× the noise, so the savings signal is real, just small.
- **Expected recommendation for Phase 88:** keep full rebuilds. All 4 of 087-RESEARCH `## Decision Criteria` adopt-criteria fail: wall-clock < 30% improvement (got ~3% on `time` total, ~17% on dbt internal); external mart dominates; ARM 2 needs a separate rebuild path; Phase 88 CLEAN-02 requires --full-refresh anyway.

## Decisions Made

See `key-decisions` in frontmatter. Notably:

- **Data-change row pick:** lowest-id `ecdysis_data.occurrences` row (`id='5594056'`). Original `modified` timestamp was restored to `2025-03-13 05:30:27 America/Los_Angeles` (a tz-aware timestamp; `datetime` + `pytz.timezone('America/Los_Angeles').localize(...)` used for the revert UPDATE to preserve the exact original tz-aware value).
- **DuckDB connection mode:** all row-count probes used `read_only=True`; the source UPDATE+UPDATE-back used `read_only=False` (a single short-lived write transaction per direction). This avoided any lock contention with the subsequent `dbt build` invocations.

## Deviations from Plan

None - plan executed exactly as written.

The plan's `<execution_notes>` anticipated two of the three potential deviation points and pre-resolved them:
1. The `sudo purge` fallback (silently skipped) was the documented fallback in `<execution_notes>` — not a Rule-1/2/3 deviation.
2. The DuckDB lock-contention avoidance via `read_only=True` was the documented pattern — not a deviation.
3. Leaving `int_combined.sql` modified-but-uncommitted at end-of-plan was the documented Plan 02 contract — not a deviation.

## Issues Encountered

- **`pytz` was needed for the UPDATE-back to preserve America/Los_Angeles tz-awareness on the `modified` column.** `data/pyproject.toml` already transitively depends on `pytz` via `pendulum`/`dlt`, so `uv run --project data python` had it on the path with no further work. No deviation — used existing dependency.
- **`pandas`/`numpy` were not on the `data/` uv environment.** Initial sanity-check used `con.execute(...).fetchdf()` which requires pandas; switched to `fetchall()` for tuple-based reads. No effect on results.

## Next Plan Readiness

Plan 02 has all required inputs:

- `pre-experiment-sha.txt` (`78de3f5…`) — for the byte-identical revert assertion (`git diff <sha> -- data/dbt/models/intermediate/int_combined.sql`)
- `baseline-rowcount.txt` (`47840`) — for post-revert row-count check after Plan 02's `--full-refresh`
- 4 `run_results-*.json` captures with per-node execution_time — input to the findings doc's "Measured Timings" table
- `timings.md` — already in the shape required by 087-PATTERNS.md `### 087-FINDINGS.md` "Measured Timings"
- Modified-but-uncommitted `int_combined.sql` in the working tree — Plan 02 reverts via direct edit (no commit-then-revert in git history)

Recommendation Plan 02 should land in `087-FINDINGS.md`: **KEEP FULL REBUILDS.** Evidence in this summary supports it on every decision criterion.

## Self-Check: PASSED

All 8 referenced files exist (4 run_results captures + timings.md + 2 sidecars + this SUMMARY).
All 3 referenced task commits resolve (`1486033`, `e260819`, `f31ed8c`).

---
*Phase: 087-incremental-materialization-experiment*
*Plan: 01*
*Completed: 2026-05-13*
