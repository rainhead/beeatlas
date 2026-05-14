---
phase: 087-incremental-materialization-experiment
verified: 2026-05-13T22:30:00Z
status: passed
score: 8/8 must-haves verified
overrides_applied: 0
---

# Phase 087: Incremental Materialization Experiment Verification Report

**Phase Goal:** The question of whether `materialized='incremental'` works with dbt-duckdb external materializations is answered with observed evidence, documented to inform the nightly.sh cutover decision.

**Verified:** 2026-05-13T22:30:00Z
**Status:** passed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| #   | Truth                                                                                                                                                                                                                | Status     | Evidence                                                                                                                                                                                                                                       |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | At least one model configured with `materialized='incremental'` (SC1)                                                                                                                                                | VERIFIED   | `run_results-incr-{full,noop,change}.json` each contain `model.beeatlas.int_combined` with `status=success`; `timings.md` records `int_combined materialization (log) \| sql incremental model` for all three incremental runs                |
| 2   | `dbt build` run twice (in fact, four times); second-run behavior recorded (SC1)                                                                                                                                      | VERIFIED   | Four `run_results-*.json` captures present (~19KB each, all parse): baseline, incr-full, incr-noop, incr-change. `timings.md` has 5 sections with wall-clock + per-node execution_time for every run                                            |
| 3   | Written finding answers: does incremental work with external? (SC2)                                                                                                                                                  | VERIFIED   | `087-FINDINGS.md ## Answers to ROADMAP Questions` Q1: **No** — cites dbt-duckdb README + open issue #74 since 2022; identifies that `marts/occurrences.sql` and `marts/species.sql` are `materialized='external'`                              |
| 4   | Written finding answers: does it measurably speed up nightly builds? (SC2)                                                                                                                                           | VERIFIED   | `087-FINDINGS.md ## Answers to ROADMAP Questions` Q2: **Negligibly** — int_combined node 0.236s → 0.132s (44% local), but wall-clock ~3% on `time` total, ~17% on dbt internal `Finished`, both below the 30% threshold from RESEARCH        |
| 5   | Written finding answers: wall-clock comparison (SC2)                                                                                                                                                                 | VERIFIED   | `087-FINDINGS.md ## Measured Timings` 4-row table: baseline 3.317s / incr-full 2.826s / incr-noop 2.410s / incr-change 2.582s wall-clock, plus per-node execution_time for int_combined + occurrences                                          |
| 6   | Clear recommendation for Phase 88 recorded (SC3)                                                                                                                                                                     | VERIFIED   | `087-FINDINGS.md ## Recommendation`: **"KEEP FULL REBUILDS — do not adopt `materialized='incremental'`"** with 4 evidence-anchored reasons. Parseable: `grep -Eq "full rebuilds"` PASSES                                                       |
| 7   | `int_combined.sql` reverted byte-identically to pre-experiment SHA                                                                                                                                                   | VERIFIED   | `git diff 78de3f544115288e331f30d051b65837c34e5dca -- data/dbt/models/intermediate/int_combined.sql` returns empty output. Current file head shows single-line `{{ config(materialized='table') }}` with no `is_incremental()` or `AND FALSE` |
| 8   | Post-revert `bash data/dbt/run.sh build` passes                                                                                                                                                                      | VERIFIED   | Live verification run: `bash data/dbt/run.sh build --select int_combined` returns exit 0, `Done. PASS=2 WARN=0 ERROR=0 SKIP=0`, int_combined logged as `sql table model` (not `sql incremental model`), finished in 0.36s                  |

**Score:** 8/8 truths verified

### Required Artifacts

| Artifact                                                | Expected                                                              | Status     | Details                                                                                  |
| ------------------------------------------------------- | --------------------------------------------------------------------- | ---------- | ---------------------------------------------------------------------------------------- |
| `087-FINDINGS.md`                                       | Phase deliverable with answers + recommendation                       | VERIFIED   | 88 lines; all 7 required sections present                                                |
| `timings.md`                                            | Per-node + wall-clock evidence for all runs                           | VERIFIED   | 5 sections (baseline, incr-full, incr-noop, incr-change, row counts) with full metrics |
| `run_results-baseline.json`                             | Pre-experiment table-materialized run capture                        | VERIFIED   | 19,125 bytes; int_combined node present with execution_time 0.236s                       |
| `run_results-incr-full.json`                            | First incremental --full-refresh capture                              | VERIFIED   | 19,279 bytes; int_combined execution_time 0.226s                                         |
| `run_results-incr-noop.json`                            | Incremental no-op capture                                             | VERIFIED   | 19,465 bytes; int_combined execution_time 0.132s                                         |
| `run_results-incr-change.json`                          | Incremental capture after source UPDATE+UPDATE-back                  | VERIFIED   | 19,465 bytes; int_combined execution_time 0.126s                                         |
| `baseline-rowcount.txt`                                 | Pre-experiment int_combined row count anchor                          | VERIFIED   | `47840`                                                                                  |
| `pre-experiment-sha.txt`                                | Pre-experiment git SHA for byte-identical revert check                | VERIFIED   | `78de3f544115288e331f30d051b65837c34e5dca` (resolvable git object)                       |
| `data/dbt/models/intermediate/int_combined.sql`         | Reverted to pre-experiment `materialized='table'` state              | VERIFIED   | `git diff $PRE_SHA -- <file>` empty; current head shows `{{ config(materialized='table') }}` |

### Key Link Verification

| From                              | To                                | Via                                                  | Status | Details                                                                                                  |
| --------------------------------- | --------------------------------- | ---------------------------------------------------- | ------ | -------------------------------------------------------------------------------------------------------- |
| Phase 87 experiment               | Phase 88 cutover decision         | `087-FINDINGS.md ## Recommendation`                  | WIRED  | Recommendation section is the contract: "KEEP FULL REBUILDS" → Phase 88 invokes `dbt build` with no `--select` |
| `run_results-*.json` captures     | `timings.md` table                | `jq '.results[] | select(.unique_id | test(...))'`   | WIRED  | All 4 captures' int_combined execution_time values transcribed and match `jq` re-extraction (0.236/0.226/0.132/0.126s) |
| Plan frontmatter                  | TEST-03 requirement               | `requirements: - TEST-03` in both 087-01 and 087-02 | WIRED  | Both plan files contain TEST-03 in `requirements` and `requirements_addressed`                            |

### Requirements Coverage

| Requirement | Source Plan      | Description                                                                                                                                                                                                                                                | Status      | Evidence                                                                                                                                                            |
| ----------- | ---------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| TEST-03     | 087-01, 087-02   | `materialized='incremental'` is tested on dbt-duckdb with external materializations on at least one model in the slice. Observed behavior — does incremental work? does it speed up nightly builds? — is documented. If unsupported, limitation documented. | SATISFIED   | `087-FINDINGS.md` answers all three sub-questions with measured evidence; limitation documented (dbt-duckdb README + issue #74); recommendation = keep full rebuilds |

### Protected Files Verification

| File                                       | Expected                              | Status     | Evidence                                  |
| ------------------------------------------ | ------------------------------------- | ---------- | ----------------------------------------- |
| `data/dbt/run.sh`                          | Untouched during phase 087            | VERIFIED   | `git diff 78de3f5..HEAD -- <file>` empty  |
| `data/dbt/models/marts/occurrences.sql`    | Untouched during phase 087            | VERIFIED   | `git diff 78de3f5..HEAD -- <file>` empty  |
| `data/dbt/models/marts/species.sql`        | Untouched during phase 087            | VERIFIED   | `git diff 78de3f5..HEAD -- <file>` empty  |

### Behavioral Spot-Checks

| Behavior                                                                                  | Command                                                                | Result                                                                          | Status |
| ----------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- | ------------------------------------------------------------------------------- | ------ |
| `int_combined.sql` is byte-identical to pre-experiment SHA                                | `git diff 78de3f5 -- data/dbt/models/intermediate/int_combined.sql`    | empty output                                                                    | PASS   |
| Post-revert dbt build of int_combined passes                                              | `bash data/dbt/run.sh build --select int_combined`                     | exit 0; PASS=2; `sql table model`; finished in 0.36s                            | PASS   |
| Recommendation phrase parseable (Phase 88 planner contract)                               | `grep -Eq "(use incremental\|full rebuilds)" 087-FINDINGS.md`          | match found ("full rebuilds")                                                   | PASS   |
| All 4 run_results JSON files parse and contain int_combined model results                 | `jq '.results[] | select(.unique_id | test("int_combined"))' run_results-*.json` | all 4 files return non-empty int_combined record with execution_time + status | PASS   |
| Task commits exist                                                                        | `git log --oneline 1486033 e260819 f31ed8c 6da1df5 2916ded`            | all 5 commits resolve                                                            | PASS   |

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
| ---- | ---- | ------- | -------- | ------ |

None. No TBD/FIXME/XXX/TODO/HACK/PLACEHOLDER markers detected in phase artifacts.

### Human Verification Required

None. All checks are programmatically verifiable: file existence, JSON parse, byte-identical diff, dbt build exit code, grep parseability, row-count equality. No visual, real-time, or external-service items in scope.

### Gaps Summary

No gaps. The phase delivers the precise evidence + recommendation contract the ROADMAP set out:

- **SC1 (incremental configured + run twice + second-run behavior recorded):** SATISFIED. `int_combined` was configured `materialized='incremental'` with ARM 1 watermark + ARM 2 `AND FALSE` skip in the working tree (uncommitted by design, per the 087-RESEARCH "tried and reverted, no trace" pattern). Four runs are captured with `run_results-*.json`; `timings.md` documents the `sql table model` → `sql incremental model` transition in the dbt log output.
- **SC2 (written finding answers 3 questions):** SATISFIED. Q1 answered No with dbt-duckdb README citation; Q2 answered with measured ~3-17% wall-clock improvement (below 30% threshold); Q3 answered with 4-row timings table.
- **SC3 (clear recommendation for Phase 88):** SATISFIED. `## Recommendation` section reads "KEEP FULL REBUILDS — do not adopt `materialized='incremental'`" with 4 independently-sufficient reasons. Phase 88 planner can quote this verbatim.

Rollback is clean: int_combined.sql is byte-identical to pre-experiment SHA `78de3f5`, post-revert dbt build passes (live-verified), protected files (`data/dbt/run.sh`, marts/occurrences.sql, marts/species.sql) have zero diffs across the entire phase.

---

_Verified: 2026-05-13T22:30:00Z_
_Verifier: Claude (gsd-verifier)_
