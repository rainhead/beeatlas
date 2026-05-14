# Phase 087: Incremental Materialization Experiment — Pattern Map

**Mapped:** 2026-05-13
**Files analyzed:** 3 (1 modified, 1 new, 1 read-only reference)
**Analogs found:** 3 / 3

## File Classification

| File | New/Mod/Ref | Role | Data Flow | Closest Analog | Match Quality |
|------|-------------|------|-----------|----------------|---------------|
| `data/dbt/models/intermediate/int_combined.sql` | modified (experimental, reverted) | dbt SQL model (`materialized='table'`, UNION ALL of two ARMs) | batch / transform | itself (current state) + `data/dbt/models/intermediate/int_species_universe.sql` | exact (itself) |
| `.planning/phases/087-incremental-materialization-experiment/087-FINDINGS.md` | new | phase findings/recommendation doc (spike outcome) | document | `.planning/phases/086-port-remaining-transforms/086-VERIFICATION.md` (closest with YAML frontmatter + recommendation/deferred sections) | role-match |
| `data/dbt/run.sh` | read-only reference | pipeline driver script (uvx-pinned dbt wrapper) | request-response | itself (do NOT modify per Pitfall 5) | exact (itself) |

## Pattern Assignments

### `data/dbt/models/intermediate/int_combined.sql` (modified)

**Current config block to replace** (lines 1-6):

```sql
-- UNION ALL of ARM 1 (ecdysis FOJ samples + LEFT JOIN specimen_obs) and
-- ARM 2 (provisional WABA via ofv1718). Materialized as TABLE (not view) per
-- RESEARCH Pitfall 5: prevents re-evaluating the full UNION ALL on every spatial
-- join in the occurrences mart.
-- Mirrors export.py:135-197 (combined CTE).
{{ config(materialized='table') }}
```

**Experimental config to swap in** (per RESEARCH §Code Examples + Pitfall 3 ARM-2 handling):

```sql
{{ config(
    materialized='incremental',
    unique_key='ecdysis_id',
    incremental_strategy='delete+insert',
    on_schema_change='fail'
) }}
```

**ARM 1 `is_incremental()` watermark filter** to append after line 43 (`LEFT JOIN ... int_specimen_obs_base ...`) and before `UNION ALL`:

```sql
{% if is_incremental() %}
  WHERE e.modified > (SELECT COALESCE(MAX(modified), '1900-01-01') FROM {{ this }})
{% endif %}
```

**ARM 2 incremental skip** to append at end of file (after line 86 `WHERE sob.longitude IS NOT NULL AND sob.latitude IS NOT NULL`):

```sql
{% if is_incremental() %}
  AND FALSE  -- ARM 2 (NULL ecdysis_id) skipped on incremental runs; only rebuilds on --full-refresh
{% endif %}
```

**Sibling reference** — `data/dbt/models/intermediate/int_species_universe.sql` lines 1-10 shows the same `{{ config(materialized='table') }}` shape with a multi-line header comment explaining the materialization choice. The 087 experimental header should follow that pattern (prepend a "EXPERIMENTAL — Phase 087; revert unless Phase 88 adopts" comment block above `{{ config(...) }}`).

---

### `.planning/phases/087-incremental-materialization-experiment/087-FINDINGS.md` (new)

**Analog:** `.planning/phases/086-port-remaining-transforms/086-VERIFICATION.md`

**Frontmatter pattern** (086-VERIFICATION.md lines 1-11):

```yaml
---
phase: 087-incremental-materialization-experiment
verified: 2026-05-13T<HH:MM:SS>Z
status: passed   # spike phases pass when finding is recorded; recommendation does not have to be "adopt"
score: <n>/<n>
deferred: []     # or list any items punted to Phase 88
---
```

**Section skeleton** (mirroring 086-VERIFICATION §Goal Achievement + 086-05-SUMMARY frontmatter recommendation style):

```markdown
# Phase 087: Incremental Materialization Experiment — Findings

**Phase Goal:** [from ROADMAP success criteria 1-4]
**Researched + Executed:** 2026-05-13

## Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | At least one model configured with `materialized='incremental'` | VERIFIED | `int_combined.sql` config block |
| 2 | `dbt build` run twice | VERIFIED | run_results-{baseline,incr-full,incr-noop,incr-change}.json captured |
| 3 | Second run's behavior observed and recorded | VERIFIED | per-node execution_time table below |
| 4 | Written finding answers: incremental + external? speed-up? wall-clock? | VERIFIED | see "Answers to ROADMAP Questions" |
| 5 | Recommendation for Phase 88 recorded | VERIFIED | see "Recommendation" |

## Answers to ROADMAP Questions

> Q1: Does `materialized='incremental'` work with external materializations?
> A: No. [evidence: dbt-duckdb 1.10.1 README + issue #74]

> Q2: Does it speed up nightly builds?
> A: [measured wall-clock comparison]

> Q3: Wall-clock comparison?
> A: [table: baseline vs incr-full vs incr-noop vs incr-change]

## Measured Timings

| Run | Wall-clock (`time`) | int_combined execution_time | occurrences execution_time | Notes |
|-----|---------------------|------------------------------|-----------------------------|-------|
| baseline (table) | | | | |
| incr-full (first incremental run) | | | | |
| incr-noop (no source changes) | | | | |
| incr-change (UPDATE+UPDATE-back on `modified`) | | | | |

## Recommendation for Phase 88

**[ADOPT INCREMENTAL | KEEP FULL REBUILDS]** because [evidence-anchored reason from Decision Criteria].

Required follow-up if adopted: [e.g., Phase 88 CLEAN-02 column drop requires one-shot `--full-refresh` per Pitfall 4].

## Rollback Status

- [ ] `data/dbt/models/intermediate/int_combined.sql` reverted to `materialized='table'`
- [ ] `bash data/dbt/run.sh build --select int_combined+ --full-refresh` succeeded post-revert
- [ ] `dbt_sandbox.int_combined` row count matches pre-experiment (47,840)
```

**Why this analog (not 086-05-SUMMARY.md):** 086-05-SUMMARY is a per-plan execution summary; 086-VERIFICATION is a phase-level outcome doc with frontmatter, observable-truths table, and deferred-items list — closer match for "findings of a spike with a recommendation downstream phases will read."

---

### `data/dbt/run.sh` (read-only reference)

**Current shape** (lines 1-35, full file):

```bash
#!/usr/bin/env bash
# Wrapper: ensures dbt finds in-repo profiles.yml regardless of cwd.
# A1 fallback: dbt-duckdb 1.10.1 is incompatible with Python 3.14 ...
set -euo pipefail
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
export DBT_PROFILES_DIR="${DBT_PROFILES_DIR:-$DIR}"
export DBT_PROJECT_DIR="${DBT_PROJECT_DIR:-$DIR}"
cd "$DIR"
mkdir -p "$DIR/target/sandbox"
case "${1:-}" in
  --version|--help|-h|"")
    exec uvx --from dbt-core==1.10.1 --with dbt-duckdb==1.10.1 dbt "$@"
    ;;
  *)
    exec uvx --from dbt-core==1.10.1 --with dbt-duckdb==1.10.1 dbt "$@" --profiles-dir "$DIR" --project-dir "$DIR"
    ;;
esac
```

**What `bash data/dbt/run.sh build` actually does:**
1. `cd` into `data/dbt/`
2. Ensures `target/sandbox/` exists (DuckDB `COPY` cannot create directories)
3. Invokes `uvx --from dbt-core==1.10.1 --with dbt-duckdb==1.10.1 dbt build --profiles-dir <data/dbt> --project-dir <data/dbt>`
4. Forwards any extra args (e.g., `--select int_combined+`, `--full-refresh`)

**Pattern for experimental invocations** (per RESEARCH §Measurement Protocol):

```bash
time bash data/dbt/run.sh build --select int_combined+ --full-refresh
cp data/dbt/target/run_results.json \
   .planning/phases/087-incremental-materialization-experiment/run_results-baseline.json
```

**HARD RULE (RESEARCH Pitfall 5):** Do NOT modify `data/dbt/run.sh` during the experiment. The version pin is load-bearing — touching it invalidates all timings.

## Shared Patterns

### dbt model header comment style
**Source:** `data/dbt/models/intermediate/int_species_universe.sql` lines 1-10 and `int_combined.sql` lines 1-5
**Apply to:** the experimental int_combined edit
**Pattern:** multi-line `--` comment block above `{{ config(...) }}` explaining materialization rationale; the 087 edit should prepend a clearly-marked `-- EXPERIMENTAL — Phase 087: revert unless Phase 88 adopts.` block above the new config.

### run_results.json capture for measurement
**Source:** RESEARCH §Code Examples "Capturing timings into a findings table"
**Apply to:** every measured `dbt build` invocation in Phase 087
**Pattern:** copy `data/dbt/target/run_results.json` to `.planning/phases/087-incremental-materialization-experiment/run_results-<label>.json` immediately after each run (the next `dbt build` overwrites it).

## No Analog Found

None. All three files have viable analogs (two are the file itself in its current state; the findings doc has 086-VERIFICATION.md as a structural model).

## Metadata

**Analog search scope:**
- `data/dbt/models/intermediate/` (12 SQL models)
- `.planning/phases/085-pre-cutover-groundwork/` and `.planning/phases/086-port-remaining-transforms/` (SUMMARY + VERIFICATION docs)
- `data/dbt/run.sh` (single file, current pin verified)

**Files read:** 5 (RESEARCH.md, int_combined.sql, int_species_universe.sql header, 086-VERIFICATION.md, 085-VERIFICATION.md, 086-05-SUMMARY.md frontmatter, run.sh)

**Pattern extraction date:** 2026-05-13
