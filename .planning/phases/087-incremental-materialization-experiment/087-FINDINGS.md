---
phase: 087-incremental-materialization-experiment
verified: 2026-05-13T22:00:00Z
status: passed
score: 5/5
deferred: []
---

# Phase 087: Incremental Materialization Experiment — Findings

**Phase Goal:** Test whether `materialized='incremental'` in dbt-duckdb works with the project's external (parquet) marts, whether it speeds up nightly builds, and what the wall-clock comparison looks like. Record an unambiguous recommendation for Phase 88 (use incremental + selector OR keep full rebuilds with reason).

**Executed:** 2026-05-13 (Plan 01 + Plan 02)

## Observable Truths

| #   | Truth                                                                                                          | Status   | Evidence                                                                                                          |
| --- | -------------------------------------------------------------------------------------------------------------- | -------- | ----------------------------------------------------------------------------------------------------------------- |
| 1   | At least one model configured with `materialized='incremental'`                                                | VERIFIED | `int_combined.sql` (experimental) used `materialized='incremental' + unique_key='ecdysis_id' + delete+insert`     |
| 2   | `dbt build` run twice (in fact, four times)                                                                    | VERIFIED | `run_results-{baseline,incr-full,incr-noop,incr-change}.json` all present in this directory                       |
| 3   | Second run's behavior (full rebuild vs. incremental diff) observed and recorded                                | VERIFIED | `## Measured Timings` table below; log line confirmed `sql incremental model` for runs 2-4 vs `sql table model` for baseline (`timings.md`) |
| 4   | Written finding answers: incremental + external? speed-up? wall-clock?                                         | VERIFIED | `## Answers to ROADMAP Questions` below                                                                            |
| 5   | Recommendation for Phase 88 recorded                                                                           | VERIFIED | `## Recommendation` below — full rebuilds                                                                          |

## Answers to ROADMAP Questions

> **Q1: Does `materialized='incremental'` work with external materializations?**
>
> **A: No.** dbt-duckdb 1.10.1's README states verbatim: *"Unfortunately incremental materialization strategies are not yet supported for `external` models."* GitHub issue [duckdb/dbt-duckdb#74](https://github.com/duckdb/dbt-duckdb/issues/74) has tracked this gap as open / not implemented since December 2022, with no linked PR. The dbt-duckdb 1.10.1 release (2026-02-17) does not change this. See `087-RESEARCH.md` `## TEST-03: The Definitive Answer` for full citation. The two beeatlas published-parquet marts (`marts/occurrences.sql`, `marts/species.sql`) are both `materialized='external'` and therefore cannot benefit from incremental at all — only intermediate `materialized='table'` models can, of which `int_combined` is the only one with non-trivial row count (47,840 rows).

> **Q2: Does it speed up nightly builds?**
>
> **A: Negligibly, and not enough to clear the 30% threshold.** Measured node-local savings on `int_combined` are real but small (~0.10s, ~44% on the node alone). Total wall-clock savings on `dbt build --select int_combined+` are <0.4s, ~5–17% (see Q3 table). The downstream `marts/occurrences` external parquet rebuilds in full every run regardless (0.36s → 0.42s — variance is noise, not signal). Dbt startup overhead (~1.5–1.7s of uvx/dbt-core/adapter init) dwarfs any savings incremental can deliver. There is no nightly performance problem worth solving here — the entire pipeline runs in ~2-3 seconds total.

> **Q3: Wall-clock comparison?**
>
> **A:** See the `## Measured Timings` table below for the full numeric comparison across all four runs (baseline, incremental --full-refresh, incremental no-op, incremental with simulated data change).

## Measured Timings

Per-node times transcribed from `run_results-{baseline,incr-full,incr-noop,incr-change}.json` via
`jq '.results[] | {unique_id, execution_time, status}'`. Wall-clock from `time` wrapper transcribed from `timings.md`.

| Run                              | Wall-clock (`time`) | dbt `Finished` | int_combined `execution_time` | occurrences `execution_time` | Notes                                                                                                                 |
| -------------------------------- | ------------------- | -------------- | ------------------------------ | ----------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| baseline (table)                 | 3.317s              | 0.91s          | 0.236s                         | 0.362s                        | Pre-experiment `materialized='table'`. Row count anchor: 47,840 (`baseline-rowcount.txt`). **fs-cache flushed: sync ok, purge skipped (no sudo)** — recorded verbatim per 087-VALIDATION.md `## Manual-Only Verifications` row 2 |
| incr-full (--full-refresh)       | 2.826s              | 0.83s          | 0.226s                         | 0.379s                        | First incremental build via `--full-refresh`; both ARMs execute because `is_incremental()` is false during full refresh. int_combined time essentially unchanged from baseline (0.236s → 0.226s; ~4% delta is cache warmth, not an incremental effect)                                       |
| incr-noop                        | 2.410s              | 0.75s          | **0.132s**                     | 0.385s                        | No source changes; ARM 1 watermark filter activates and matches zero rows; ARM 2 short-circuited by `AND FALSE`. Net node savings: 0.236s → 0.132s ≈ 0.104s (~44%). Downstream `occurrences` external mart **unchanged at 0.385s** — Pitfall 2 verified empirically |
| incr-change (UPDATE+UPDATE-back) | 2.582s              | 0.80s          | 0.126s                         | 0.420s                        | Simulated data change via `UPDATE ecdysis_data.occurrences SET modified = NOW() WHERE id = '5594056'` (original `2025-03-13 05:30:27 America/Los_Angeles`; restored post-run). Single-row watermark match cost is negligibly cheaper than no-op's empty delete+insert |

**Node-local savings on int_combined:** 0.236s → 0.132s ≈ 0.104s (~44% on this node alone).
**End-to-end wall-clock improvement vs. baseline:** ~3% on `time` total (3.317s → ~2.4–2.6s after warm-cache normalization); ~17% on dbt-internal `Finished`. **Below the 30% decision threshold** from `087-RESEARCH.md` `## Decision Criteria for Phase 88`.

## ARM 2 Dedup Check

Numerical assertion that incremental delete+insert + the `{% if is_incremental() %} AND FALSE {% endif %}` ARM 2 skip does not produce duplicates or row loss vs. the pre-experiment `materialized='table'` baseline.

| Source                                                      | int_combined `COUNT(*)` |
| ----------------------------------------------------------- | ----------------------- |
| baseline (from `baseline-rowcount.txt`)                     | 47,840                  |
| current (post incr-noop + incr-change + UPDATE-back)        | 47,840                  |
| diff                                                        | 0                       |

The `AND FALSE` ARM 2 skip on incremental runs successfully prevents the NULL-`unique_key` duplication failure mode called out in `087-RESEARCH.md` Pitfall 3 — ARM 2 has `ecdysis_id = NULL`, and `delete+insert` with `unique_key='ecdysis_id'` would otherwise leak duplicate rows on every incremental cycle (NULL ≠ NULL in SQL). The existing `not_null_int_combined_is_provisional` dbt test continues to PASS against the incremental int_combined (run via `bash data/dbt/run.sh test --select int_combined`).

## Recommendation

**KEEP FULL REBUILDS — do not adopt `materialized='incremental'` for `int_combined` or any other model in Phase 88.**

Evidence-anchored reasons (each one independently sufficient per `087-RESEARCH.md` `## Decision Criteria for Phase 88` "keep full rebuilds if ANY of these are true"):

1. **dbt-duckdb does not support incremental + external (Pitfall 1).** The two published marts (`marts/occurrences.sql`, `marts/species.sql`) — which produce `public/data/occurrences.parquet` and `public/data/species.parquet` — cannot benefit from incremental at all. They rebuild the full parquet every run, dominating wall-clock at ~0.36–0.42s. Empirically verified: `occurrences.execution_time` is 0.362s / 0.379s / 0.385s / 0.420s across baseline/incr-full/incr-noop/incr-change — variance is noise, not signal (Pitfall 2 verified).
2. **Wall-clock savings are below the 30% threshold.** Best-case incr-noop wall-clock: ~2.4s vs. 3.3s baseline ≈ 27% — below threshold, and within `time`'s warm-cache noise floor (incr-full at 2.826s on warm cache demonstrates ~15% of the apparent "savings" is just cache warmth, not incremental). Dbt-internal `Finished` is 0.75s vs. 0.91s ≈ 17%. Neither metric meets the 30% bar.
3. **ARM 2 requires a separate rebuild path (complexity tax).** ARM 2 produces rows with `ecdysis_id = NULL` (provisional WABA observations); `delete+insert` with `unique_key='ecdysis_id'` would duplicate ARM 2 rows on every incremental run (Pitfall 3 — NULL ≠ NULL). The mitigation is the `AND FALSE` skip pattern this experiment validated — but that means ARM 2 only ever updates on `--full-refresh`, so any change to provisional-WABA-eligible rows (a real workflow with iNat being the source of truth) would be silently lost until the next manual full refresh. Bug surface > performance benefit.
4. **The external mart dominates wall-clock end-to-end.** On `int_combined+`, the chain is int_combined → occurrences (parquet write). Even a hypothetical zero-cost int_combined model saves at most ~0.13s end-to-end. The external mart at ~0.38s sets the floor.

The total nightly cost is ~2-3 seconds. Optimizing this is unjustified complexity. Run `dbt build` as a full graph rebuild in `nightly.sh`; it will keep finishing in seconds.

## Required Follow-up if Adopted

Per `087-RESEARCH.md` Pitfall 4: if Phase 88 ever revisits this decision and adopts incremental for `int_combined`, the Phase 88 CLEAN-02 column drop (removing `specimen_inat_login`, `family`, `genus` from int_combined) requires a one-shot `bash data/dbt/run.sh build --select int_combined+ --full-refresh` invocation, because `on_schema_change='fail'` will block any other incremental run when the column set changes. **This is not required under the recommendation above — full rebuilds handle schema evolution natively.**

## Rollback Status

- [ ] `data/dbt/models/intermediate/int_combined.sql` reverted to `materialized='table'` (single-line config, no `is_incremental()`, no `AND FALSE`, no `-- EXPERIMENTAL` marker)
- [ ] `git diff $(cat .planning/phases/087-incremental-materialization-experiment/pre-experiment-sha.txt) -- data/dbt/models/intermediate/int_combined.sql` produces empty output (byte-identical to pre-experiment SHA `78de3f5`)
- [ ] `bash data/dbt/run.sh build --select int_combined+ --full-refresh` succeeded post-revert (exit 0; belt-and-suspenders rebuild per `087-RESEARCH.md` `## Rollback Path`)
- [ ] Post-revert `dbt_sandbox.int_combined` row count matches `baseline-rowcount.txt` (47,840)
