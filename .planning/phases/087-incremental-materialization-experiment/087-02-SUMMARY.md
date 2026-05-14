---
phase: 087-incremental-materialization-experiment
plan: 02
subsystem: data-pipeline
tags: [dbt, dbt-duckdb, incremental, duckdb, materialization, spike, findings, rollback]

# Dependency graph
requires:
  - phase: 087-incremental-materialization-experiment
    provides: Plan 01's four timed `run_results-*.json` captures + `timings.md` + `baseline-rowcount.txt` (47840) + `pre-experiment-sha.txt` (78de3f5) + the modified-but-uncommitted experimental `int_combined.sql`
provides:
  - 087-FINDINGS.md — the phase-level deliverable: evidence + unambiguous "keep full rebuilds" recommendation that Phase 88's planner reads in a single section
  - Byte-identical revert of data/dbt/models/intermediate/int_combined.sql against pre-experiment SHA 78de3f5 (verified via `git diff $PRE_SHA -- ...` returning empty)
  - Verified clean baseline rebuild + dbt test PASS=1 post-revert (the "tried and reverted, no trace" pattern from 087-RESEARCH Open Q1 fully realized)
affects: [088-cutover-and-cleanup, dbt-incremental-decision, nightly-rebuild-policy]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Findings-doc analog: phase-level VERIFICATION-style report (YAML frontmatter + Observable Truths table + Answers/Timings/Recommendation/Rollback sections) — Phase 88's planner consumes ## Recommendation directly"
    - "Byte-identical revert via `git checkout <pre-experiment-sha> -- <file>` is the safest pattern for spike rollback when the experiment was left uncommitted in the working tree"
    - "Belt-and-suspenders rebuild after revert: even when the SQL is git-clean, run `--full-refresh` to guarantee DuckDB's table metadata is re-typed as `sql table model` (not lingering 'incremental')"

key-files:
  created:
    - .planning/phases/087-incremental-materialization-experiment/087-FINDINGS.md
    - .planning/phases/087-incremental-materialization-experiment/087-02-SUMMARY.md
  modified:
    - data/dbt/models/intermediate/int_combined.sql  # reverted byte-identically to pre-experiment SHA 78de3f5

key-decisions:
  - "Recommendation: KEEP FULL REBUILDS for Phase 88 — four independently-sufficient evidence-anchored reasons (incremental+external unsupported by dbt-duckdb 1.10.1; wall-clock savings below 30% threshold; ARM 2 complexity tax with real bug surface; external mart dominates wall-clock end-to-end)"
  - "Rollback method: `git checkout 78de3f5 -- data/dbt/models/intermediate/int_combined.sql` (direct working-tree revert against the pre-experiment SHA, no commit-then-revert in git history per 087-RESEARCH Open Q1's 'tried and reverted, no trace' pattern)"
  - "Findings doc skeleton: 086-VERIFICATION.md analog (YAML frontmatter + Observable Truths table + per-section structure), not 086-05-SUMMARY (which is a per-plan execution record, not a phase-level outcome)"

patterns-established:
  - "Spike-phase recommendation pattern: evidence-anchored ## Recommendation section in 0XX-FINDINGS.md is the contract with the next phase; downstream planner reads one section and acts"
  - "Byte-identical revert assertion: `git diff <pre-experiment-sha> -- <file>` returning empty is the canonical check that a spike rollback is complete (stronger than 'looks reverted' visual inspection)"
  - "Rollback Status checklist: each box maps to a verifiable command result, not a vibes-based assertion; ticked only after the verifier runs the command"

requirements-completed:
  - TEST-03

# Metrics
duration: ~2min (1 findings-doc write + 1 git checkout + 1 dbt build + 1 dbt test + 1 row-count probe + 2 commits)
completed: 2026-05-13
---

# Phase 087 Plan 02: Findings + Rollback Summary

**Recorded the evidence-anchored "keep full rebuilds" recommendation in 087-FINDINGS.md and reverted `int_combined.sql` byte-identically to pre-experiment SHA 78de3f5 — Phase 88's planner can now read one section (`## Recommendation`) and act without re-running the experiment.**

## Performance

- **Duration:** ~2 minutes
- **Started:** 2026-05-13T22:00:00Z (approximate; first FINDINGS write)
- **Completed:** 2026-05-14T05:23:19Z (last commit timestamp; off-wall-clock interval reflects measurement timestamp, not actual interactive duration)
- **Tasks:** 2 of 2 completed
- **Files modified (tracked):** 2 (1 created findings doc + 1 reverted SQL)

## Accomplishments

- **087-FINDINGS.md (88 lines) written** with full evidence transcription from the four `run_results-*.json` captures and `timings.md`. Contains all five required sections: Observable Truths (5/5 VERIFIED), Answers to ROADMAP Questions (Q1/Q2/Q3 with evidence citations), Measured Timings (4-row table with wall-clock + per-node times + cache-state note `fs-cache flushed: sync ok, purge skipped`), ARM 2 Dedup Check (47840 = 47840), Recommendation (KEEP FULL REBUILDS with 4 independent reasons), Required Follow-up if Adopted (Pitfall 4 — CLEAN-02 --full-refresh), Rollback Status (4/4 ticked).
- **Byte-identical revert verified.** `git diff 78de3f544115288e331f30d051b65837c34e5dca -- data/dbt/models/intermediate/int_combined.sql` returns empty. The pre-experiment "EXPERIMENTAL — Phase 087" marker comment, `materialized='incremental'` config, ARM 1 `is_incremental()` watermark, and ARM 2 `AND FALSE` skip are all gone — the file is byte-identical to the head of `033a271 feat(083-03)`, the only commit that has ever touched it.
- **Belt-and-suspenders rebuild succeeded.** `bash data/dbt/run.sh build --select int_combined+ --full-refresh` returned exit 0, `Done. PASS=6 WARN=0 ERROR=0 SKIP=0`, with int_combined logged as `sql table model` (the pre-experiment shape, not `sql incremental model`).
- **Post-revert row count anchors to baseline.** `SELECT COUNT(*) FROM dbt_sandbox.int_combined` = **47840** = `baseline-rowcount.txt` exactly. dbt test `not_null_int_combined_is_provisional` PASS=1.
- **Forbidden files untouched across the entire phase:** `data/dbt/run.sh`, `data/dbt/models/marts/occurrences.sql`, `data/dbt/models/marts/species.sql` all return empty `git diff` (Pitfall 5 / Pitfall 1 invariants held).

## Recommendation Headline

**Phase 88: full rebuilds — keep `bash data/dbt/run.sh build` as a full graph rebuild in `nightly.sh`. Do not adopt `materialized='incremental'` for any model.**

Four evidence-anchored reasons (any one independently sufficient per 087-RESEARCH `## Decision Criteria for Phase 88`):

1. **dbt-duckdb 1.10.1 does not support incremental + external** (README + open issue #74 since 2022) — the two published marts (`marts/occurrences.sql`, `marts/species.sql`) cannot benefit at all.
2. **Wall-clock savings below 30% threshold** — incr-noop is ~3% on `time` total (3.317s → 2.410s, mostly cache warmth not incremental), ~17% on dbt-internal `Finished` (0.91s → 0.75s).
3. **ARM 2 complexity tax with real bug surface** — `unique_key='ecdysis_id'` + ARM 2's NULL ecdysis_id forces the `AND FALSE` skip pattern, which silently drops provisional-WABA-source-data changes until the next manual `--full-refresh`.
4. **External mart dominates wall-clock end-to-end** — `marts/occurrences` rebuilds full parquet every run regardless (0.36–0.42s across all four runs; variance is noise, not signal).

## Task Commits

1. **Task 1: Write 087-FINDINGS.md with evidence + recommendation** — `6da1df5` (docs) — 88-line findings doc; all 5 required section headers + cache-state note + recommendation phrase "full rebuilds" + ≥60 lines (gate PASS)
2. **Task 2: Revert int_combined.sql byte-identically + verify clean baseline build** — `2916ded` (docs) — ticks all 4 Rollback Status checkboxes; the SQL revert itself produces no diff against HEAD (HEAD already matches pre-experiment SHA at that file), so the commit only carries the documentation tick

## Files Created/Modified

- **Created:** `.planning/phases/087-incremental-materialization-experiment/087-FINDINGS.md` — Phase 87's evidence + recommendation deliverable; consumed by Phase 88's planner
- **Created:** `.planning/phases/087-incremental-materialization-experiment/087-02-SUMMARY.md` — this file
- **Modified (then reverted byte-identically):** `data/dbt/models/intermediate/int_combined.sql` — Plan 01's experimental incremental config + ARM 1 watermark + ARM 2 `AND FALSE` skip removed via `git checkout 78de3f5 -- ...`; working tree is now byte-identical to pre-experiment SHA

## Decisions Made

See `key-decisions` in frontmatter. Most load-bearing:

- **Rollback method: direct working-tree revert via `git checkout <pre-sha> -- <file>`** rather than `git revert <experimental-hash>` (Plan 01 never committed the experimental SQL, so there's no hash to revert). This realizes the "tried and reverted, no trace" pattern from 087-RESEARCH Open Q1 — the only git-historical evidence of the experiment is the findings doc and the four run_results captures.
- **Recommendation framing: 4 independent reasons** rather than a single dominant reason — each one individually meets the "keep full rebuilds if ANY of these are true" criterion from 087-RESEARCH `## Decision Criteria for Phase 88`. The Phase 88 planner can quote any one without needing the full chain.

## Deviations from Plan

None - plan executed exactly as written.

The plan anticipated the choice between `git revert <hash>` and `git checkout <pre-sha> -- ...` in Task 2's action block; the latter was the right choice because Plan 01 left the change uncommitted in the working tree (confirmed by `git log --oneline -- data/dbt/models/intermediate/int_combined.sql | head -3` showing only `033a271 feat(083-03)` from the original 086-port phase — no Phase 087 commit on that file). No Rule 1/2/3 deviations triggered.

## Issues Encountered

- **`data/checklist_unmatched.csv` and `.planning/config.json` were dirty before this plan started.** Neither is part of Plan 02's `<files>` scope, so both were left untouched (scope-boundary rule). The `git status --short` at end-of-plan shows `M data/checklist_unmatched.csv` is unchanged — not introduced by this work.

## Self-Check

- 087-FINDINGS.md exists and contains: `## Observable Truths`, `## Answers to ROADMAP Questions`, `## Measured Timings`, `## ARM 2 Dedup Check`, `## Recommendation`, `## Required Follow-up if Adopted`, `## Rollback Status`. Cache-state phrase `fs-cache flushed` is present. Recommendation phrase `full rebuilds` is present. File is 88 lines (≥60 required).
- `int_combined.sql` byte-identical to pre-experiment SHA `78de3f544115288e331f30d051b65837c34e5dca` (`git diff $PRE_SHA -- ...` empty).
- `bash data/dbt/run.sh build --select int_combined+ --full-refresh` exit 0, PASS=6, int_combined logged as `sql table model`.
- `bash data/dbt/run.sh test --select int_combined` exit 0, PASS=1.
- Post-revert row count 47840 = baseline-rowcount.txt 47840.
- `data/dbt/run.sh`, `data/dbt/models/marts/occurrences.sql`, `data/dbt/models/marts/species.sql` all `git diff` empty.
- Two task commits resolve (`6da1df5`, `2916ded`).

## Self-Check: PASSED

## Next Phase Readiness

Phase 088 has everything it needs:

- **`087-FINDINGS.md` `## Recommendation`** — single section, evidence-anchored, "KEEP FULL REBUILDS" with 4 independent reasons. Phase 88's planner quotes this and proceeds with `dbt build` (no `--select`) in `nightly.sh`.
- **Working tree clean for Phase 88 dbt work** — `int_combined.sql` is byte-identical to pre-experiment shape, ready for Phase 88's CLEAN-02 column drop (drop `specimen_inat_login`, `family`, `genus` from int_combined). The deferred Phase 088 work can edit this file without untangling any incremental-config leftovers.
- **Historical evidence preserved on disk** — all 4 `run_results-*.json` captures + `timings.md` + `baseline-rowcount.txt` + `pre-experiment-sha.txt` remain in `.planning/phases/087-incremental-materialization-experiment/` for any future re-evaluation (e.g., if dbt-duckdb ever ships #74).

---
*Phase: 087-incremental-materialization-experiment*
*Plan: 02*
*Completed: 2026-05-13*
