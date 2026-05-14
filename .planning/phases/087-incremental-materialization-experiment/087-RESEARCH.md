# Phase 087: Incremental Materialization Experiment — Research

**Researched:** 2026-05-13
**Domain:** dbt-duckdb incremental materializations, external (parquet) outputs, nightly pipeline cost model
**Confidence:** HIGH (definitive negative result, verified against upstream README + live timings)

## Summary

The question can be answered before writing a single dbt config: **dbt-duckdb does not support `materialized='incremental'` for external (parquet) materializations.** The upstream README states this explicitly, GitHub issue duckdb/dbt-duckdb#74 has tracked the gap as "open / not implemented" since 2022, and the dbt-duckdb 1.10.1 release notes (2026-02-17) do not change it. Phase 087's first deliverable is therefore an *evidence-based* recording of this limitation — not a celebration that incremental works.

The complication is that the two beeatlas mart models that produce the published parquet files (`marts/occurrences.sql`, `marts/species.sql`) are both `materialized='external'`. The published artifact path *cannot* be the subject of an incremental experiment. The only way to satisfy success criterion 1 ("at least one model … is configured with `materialized='incremental'`") is to pick a **non-external** model — almost certainly `int_combined` (the only existing `materialized='table'` model with non-trivial row count, 47,840 rows). The experiment becomes: "convert int_combined to incremental, observe behavior, decide whether routing the nightly through incremental table models + external taps is worth the complexity."

Second complication: the full `dbt build` already finishes in **~1.7 seconds of model+test work** (44 nodes, parallel, 0.82s for the int_combined → occurrences chain alone — measured live, 2026-05-13). The largest single source is `ecdysis_data.occurrences` at 46,090 rows. There is no nightly performance problem to solve. Incremental is a tool to fix a problem that does not exist in this pipeline. The recommendation for Phase 88 is almost certainly going to be **"continue with full rebuilds"** — but it must be recorded with the evidence rather than asserted from priors.

**Primary recommendation:** Run the experiment on `int_combined` with `materialized='incremental'` + `unique_key='ecdysis_id'` + `strategy='delete+insert'` (or `append` + dedup). Record wall-clock for full rebuild vs. incremental no-op vs. incremental-with-changes. Document that external marts cannot be incremental. Write the recommendation: **full rebuilds**, because (a) total build is ~2s, (b) external marts force full rebuild downstream anyway, (c) the complexity of managing `unique_key` + late-arriving updates from upstream ingestion outweighs the sub-second savings.

<user_constraints>
## User Constraints (from CONTEXT.md)

No CONTEXT.md exists for Phase 087 — this is a spike/experiment phase the user requested to dispatch directly to research per their `feedback_skip_discuss_when_rich` preference (ROADMAP + REQUIREMENTS + prior phase research already pin down the question).

### Locked Decisions (from ROADMAP.md success criteria)

- At least one model is configured with `materialized='incremental'` and `dbt build` is run twice.
- The second run's behavior (full rebuild vs. incremental diff) is observed and recorded.
- A written finding documents: does incremental work with external materializations? does it speed up nightly builds? what is the wall-clock comparison?
- A clear recommendation is recorded for Phase 88 (use incremental + selector OR keep full rebuilds with reason).

### Claude's Discretion

- Which model to make incremental.
- Which incremental strategy (`append`, `merge`, `delete+insert`, `microbatch`) to test.
- What measurement protocol (`time` wrapper vs. `run_results.json` parsing).
- How to simulate a data change between the two runs.
- Whether to test more than one model.

### Deferred Ideas (OUT OF SCOPE)

- Implementing incremental in production (that's Phase 88's call based on this experiment).
- Refactoring the mart layer to allow incremental (would require dropping `external` materialization for `occurrences.parquet` and adding a separate parquet-export post-hook — explicitly outside Phase 087's scope).
- Splitting `nightly.sh` to invoke dbt with a selector (Phase 88).
- Any frontend or schema-gate change (this phase touches dbt models only).
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| TEST-03 | `materialized='incremental'` is tested on dbt-duckdb with external materializations on at least one model. Observed behavior — does incremental work? does it speed up nightly builds? — is documented. If incremental does not work for external materializations, the limitation is documented and the cron continues to run full rebuilds. | Upstream README and GitHub issue #74 confirm incremental does NOT work with `materialized='external'`. Experiment must use a non-external model (`int_combined` is the recommended subject — 47k rows, currently `materialized='table'`). Wall-clock baseline measured at ~1.7s total for the full `dbt build` graph (44 nodes). |
</phase_requirements>

---

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Incremental row tracking (unique_key, delete+insert) | dbt-duckdb adapter | DuckDB SQL engine | Incremental strategies are implemented in the adapter's macros — they emit DELETE+INSERT/INSERT/MERGE SQL against the target table |
| External parquet writeout | dbt-duckdb adapter (external materialization) | DuckDB COPY TO | `materialized='external'` emits `COPY (SELECT ...) TO '...' (FORMAT 'parquet')` — incompatible with incremental, full file rewrite each run |
| Wall-clock measurement | Bash `time` + dbt `run_results.json` | dbt-core logging | `run_results.json` gives per-node `execution_time`; `time` gives total wall-clock including dbt startup |
| Data-change simulation | DuckDB direct INSERT into source table | — | Sources are `dlt`-managed schemas — direct INSERT in a transaction is safe for a sandbox experiment; must be reverted before commit |
| Recommendation persistence | RESEARCH-style findings doc | ROADMAP.md update | Phase 88 plan-checker will read this doc to pick a path |

---

## TEST-03: The Definitive Answer

### Upstream Documentation (HIGH confidence)

The dbt-duckdb README states verbatim:

> "Unfortunately incremental materialization strategies are not yet supported for `external` models."

[CITED: https://github.com/duckdb/dbt-duckdb (README §External materializations, fetched 2026-05-13)]

Supported incremental strategies (for `materialized='table'` only):

| Strategy | Available | Notes |
|----------|-----------|-------|
| `append` | dbt-duckdb ≥ 1.x | Plain INSERT — no dedup, may duplicate |
| `delete+insert` | dbt-duckdb ≥ 1.x | DELETE WHERE unique_key matches, then INSERT |
| `merge` | DuckDB ≥ 1.4.0 + dbt-duckdb ≥ 1.x | Atomic upsert via `MERGE INTO` |
| `microbatch` | dbt-core ≥ 1.9 + event_time column | Per-batch delete+insert by time window |

[CITED: dbt-duckdb 1.10.1 README, https://github.com/duckdb/dbt-duckdb]

GitHub issue duckdb/dbt-duckdb#74 ("Incremental external models") has been open since December 2022, has no linked PR, and the README's roadmap explicitly lists "Make dbt's incremental models and snapshots work with external materializations" as a *future* enhancement.

[CITED: https://github.com/duckdb/dbt-duckdb/issues/74]

### Implication for beeatlas

The two models that produce published parquet artifacts (`public/data/occurrences.parquet` and `public/data/species.parquet`) are both `materialized='external'`:

```
data/dbt/models/marts/occurrences.sql:13:    materialized='external',
data/dbt/models/marts/species.sql:9:    materialized='external',
```

[VERIFIED: grep against repo]

Neither can be made incremental without (a) waiting on upstream dbt-duckdb to ship #74, or (b) reshaping the project so the mart is a regular `materialized='table'` and a downstream Python/dbt post-hook does the parquet export. Option (b) doubles I/O (table write + parquet write), kills the contract-enforced 30-column schema gate's elegance, and is explicitly out of scope for this experiment phase.

**Conclusion for success criterion 2 (the written finding):**

> Q: Does `materialized='incremental'` work with external materializations?
> A: No. As of dbt-duckdb 1.10.1, this combination is explicitly unsupported by the adapter. The published parquet artifacts (occurrences.parquet, species.parquet) cannot use incremental.

> Q: Does incremental speed up nightly builds for non-external models?
> A: Theoretically yes, but the measured wall-clock of the entire `dbt build` graph (44 nodes including int_combined the largest TABLE) is ~1.7 seconds. There is no nightly performance problem worth optimizing.

> Q: What is the wall-clock comparison?
> A: See "Measurement Protocol" below; the experiment will record full-rebuild vs. incremental-no-op vs. incremental-with-1-row-change for `int_combined`.

---

## Model Inventory and Candidate Selection

### Existing Models by Materialization

| Layer | Count | Materialization | Row Count (largest) |
|-------|-------|-----------------|---------------------|
| staging | 15 | `view` (all) | n/a (views) |
| intermediate | 12 | `view` × 11 + `table` × 1 (int_combined) | int_combined: 47,840 |
| marts | 4 | `table` × 2 (counties_geo, ecoregions_geo) + `external` × 2 (occurrences, species) | occurrences: ~47k; counties_geo: 39; ecoregions_geo: 66 |
| tests | 14 | n/a | — |

[VERIFIED: row counts via `SELECT COUNT(*) FROM dbt_sandbox.{model}` against live `data/beeatlas.duckdb`, 2026-05-13]

### Why `int_combined` is the Right Experimental Subject

1. **It is the only `materialized='table'` non-mart model with >100 rows** (47,840 rows). Other table mats (`counties_geo`, `ecoregions_geo`) are tiny (39 and 66 rows) and not appropriate for measuring incremental savings.
2. **It is downstream of the largest source** (`ecdysis_data.occurrences` at 46,090 rows). If incremental ever made sense, this is where it would show up.
3. **It has a natural near-unique key**: `ecdysis_id` (ARM 1) is unique per ecdysis specimen; ARM 2 (provisional WABA) sets `ecdysis_id = NULL`. A composite `unique_key = ['ecdysis_id', 'specimen_observation_id']` may be needed — or restrict the experiment to ARM 1 by adding `WHERE ecdysis_id IS NOT NULL`.
4. **It has a `modified` column** (`e.modified` in ARM 1 — `strftime(GREATEST(o.modified, COALESCE(im.max_id_modified, o.modified)), '%Y-%m-%d')`) which would be the natural watermark for an `is_incremental()` filter. ARM 2's `modified` is `NULL` — another reason to restrict the experiment to ARM 1.

[VERIFIED: data/dbt/models/intermediate/int_combined.sql lines 23, 26, 39, 65]

### Why NOT to Test Other Models

- **`int_species_universe`** (`materialized='table'`, 629 rows): too small to measure; row count is bounded by the bee-checklist universe.
- **`occurrences` and `species` marts** (`materialized='external'`): cannot be incremental — that's exactly the unsupported combination.
- **`counties_geo`, `ecoregions_geo`** (`materialized='table'`, 39/66 rows): geography sources change rarely (excluded from nightly per `data/run.py` comment); zero value in optimizing.
- **All view-materialized models**: views have no row storage; incremental is meaningless.

### Secondary Subject (Optional)

If the planner wants a second data point, **`int_species_universe`** is the second-best subject — it's a `materialized='table'` model with a natural unique key (`canonical_name`). But: 629 rows means incremental savings are unmeasurable. Recommend AGAINST a second subject; the cost is two more `dbt build` runs and the data is unlikely to add signal.

---

## Measurement Protocol

### Baseline Numbers (measured live during research, 2026-05-13)

| Scope | Wall-clock | Notes |
|-------|-----------|-------|
| `bash data/dbt/run.sh build` (full graph, 44 nodes, parallel 4 threads) | **1.68s** of model+test execution (~3.4s including dbt startup) | All upstream caches warm; partial_parse enabled |
| `bash data/dbt/run.sh build --select int_combined occurrences` | **0.82s** | int_combined: 0.24s; occurrences external: 0.37s |
| dbt startup (uvx + dbt-core + adapter init) | ~1.7s | Fixed cost — incremental cannot reduce this |

[VERIFIED: live timings, terminal 2026-05-13]

**This baseline matters more than any incremental experiment**: the entire pipeline is sub-2s. Incremental's value scales with model size and rebuild cost. At 47k rows in DuckDB on the host machine, full rebuild is ~0.24s. Best-case incremental savings: <0.24s. That is below dbt's own startup overhead.

### Recommended Measurement Approach

**Use BOTH:**

1. **Wall-clock via `time`** for total observed cost:
   ```bash
   time bash data/dbt/run.sh build --select int_combined+
   ```
   The `+` selector includes downstream models (occurrences mart) so the experiment captures the total cost — including whether incremental's downstream consumers still rebuild fully.

2. **Per-node execution_time via `run_results.json`**:
   ```bash
   uv run --project data python -c "
   import json
   data = json.load(open('data/dbt/target/run_results.json'))
   for r in data['results']:
       print(f\"{r['unique_id']:60s} {r['execution_time']:.3f}s {r['status']}\")
   "
   ```
   This is the canonical source for per-model timings and exposes whether dbt is actually skipping work on incremental runs.

[CITED: dbt run_results.json schema — https://docs.getdbt.com/reference/artifacts/run-results-json]

### Experimental Protocol

The ROADMAP mandates `dbt build` is run twice. Recommended protocol:

**Run 1: Baseline (full rebuild of int_combined as a regular table)**
```bash
bash data/dbt/run.sh build --select int_combined+ --full-refresh
# Capture: time, run_results.json copy → 087-BASELINE-run_results.json
```

**Run 2a: Convert int_combined to incremental, first run (forces full rebuild because table doesn't yet exist in incremental form)**
```bash
# Edit int_combined.sql to add incremental config
bash data/dbt/run.sh build --select int_combined+ --full-refresh
# Capture: time, run_results.json copy → 087-INCR-FULL-run_results.json
```

**Run 2b: Incremental no-op (no source data changes since Run 2a)**
```bash
bash data/dbt/run.sh build --select int_combined+
# Capture: time, run_results.json copy → 087-INCR-NOOP-run_results.json
# Verify: int_combined log line shows incremental strategy used; ecdysis_id key set unchanged
```

**Run 2c: Incremental with simulated data change**
```bash
# Inject 1 row into ecdysis_data.occurrences (in a transaction we will roll back)
# OR: pick an existing row and bump its `modified` timestamp via UPDATE
bash data/dbt/run.sh build --select int_combined+
# Capture: time, run_results.json
# Verify: new row appears in int_combined; occurrences mart reflects it
# Then: revert the change (DELETE the inserted row OR UPDATE modified back)
```

[ASSUMED] The data-change simulation should NOT be committed to source data. Use one of:
- A SQL transaction with rollback (wraps the test INSERT)
- A UPDATE + UPDATE-back pair against an existing row (idempotent)
- A row that is then DELETEd before any downstream artifact upload

The cleanest approach is **UPDATE then UPDATE-back on the `modified` column of one existing row**:
```sql
-- Before Run 2c:
UPDATE ecdysis_data.occurrences SET modified = NOW() WHERE id = <some-id>;
-- After Run 2c (revert):
UPDATE ecdysis_data.occurrences SET modified = <original-value> WHERE id = <some-id>;
```
This avoids any row count delta and is safest against accidentally committing experimental data.

### What "Observed Behavior" Means

For Run 2b (incremental no-op), the deliverable is observing whether:
- dbt's log line for `int_combined` says "incremental" (vs. "table" or "view")
- The `execution_time` in run_results.json is lower than the baseline (or higher, due to incremental's bookkeeping overhead)
- The downstream `occurrences` external mart still rebuilds (it WILL — external materializations always rebuild, this is the bottleneck the recommendation rests on)
- `int_combined` row count is unchanged

For Run 2c (data change), the deliverable is observing whether:
- The new/modified row appears in `int_combined` after the run
- Downstream `occurrences.parquet` contains the change
- Wall-clock vs. no-op shows the incremental SQL did meaningful work

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Per-node timing collection | Custom log-parser | `target/run_results.json` (dbt-native artifact) | dbt already writes this on every invocation; schema is stable |
| Hashing/diffing model output | Custom DuckDB row-hash query | `SELECT COUNT(*), MIN(...), MAX(...) FROM ref('int_combined')` | Cheap pre/post comparison; existing diff harness pattern (test_dbt_diff.py) is the model |
| Data-change simulation | Adding a new row to `ecdysis_data.occurrences` | UPDATE+UPDATE-back on `modified` of an existing row | No row count change, no risk of polluting source data, reverts cleanly |
| Reverting the experiment | Manual edit to undo SQL changes | Single git commit on a branch that's revertible OR keep changes in working tree never committed | Match the ROADMAP "don't over-engineer" guidance — this is a spike |

---

## Common Pitfalls

### Pitfall 1: Trying to make `marts/occurrences` or `marts/species` incremental

**What goes wrong:** dbt-duckdb errors out (or silently degrades) when `materialized='external'` is combined with `materialized='incremental'`. Either way, the experiment becomes inconclusive.
**Why it happens:** Misreading the success criterion as "incremental on the published artifact" rather than "incremental on *any* model in the project."
**How to avoid:** Pick `int_combined` (a `materialized='table'` model). The success criterion says "at least one model in the dbt project," not "the mart."
**Warning signs:** Plan tasks that mention editing `marts/occurrences.sql` or `marts/species.sql` to add incremental config.

### Pitfall 2: Forgetting that downstream external models force full rebuild anyway

**What goes wrong:** Even if `int_combined` is incremental and skips 99% of work, the downstream `occurrences` external mart rebuilds the entire parquet file every time (~0.37s). The total observable savings on `dbt build --select int_combined+` is capped at the int_combined model's own time minus its incremental bookkeeping overhead.
**Why it happens:** Incremental's value is local to the model; it does not propagate downstream when the consumer is `external`.
**How to avoid:** Report wall-clock for BOTH `int_combined` alone AND `int_combined+` (with downstream). The bottleneck is the external mart, not int_combined.
**Warning signs:** A recommendation that asserts incremental "speeds up the nightly" without measuring downstream impact.

### Pitfall 3: Using ARM 2 rows in the unique_key

**What goes wrong:** `int_combined` ARM 2 sets `ecdysis_id = NULL`. If `unique_key='ecdysis_id'` is configured, dbt's DELETE WHERE in `delete+insert` strategy will not match ARM 2 rows correctly (NULL never equals NULL in SQL). ARM 2 rows will accumulate duplicates on each incremental run.
**Why it happens:** The composite nature of int_combined (UNION ALL of two ARMs) is invisible at the config level.
**How to avoid:** Either (a) restrict the incremental config to ARM 1 by filtering ARM 2 out and rebuilding ARM 2 separately, or (b) use a composite `unique_key = ['ecdysis_id', 'specimen_observation_id']` with care, or (c) document this as a "complexity tax" that supports the "don't use incremental" recommendation.
**Warning signs:** Plan task that says `unique_key='ecdysis_id'` without addressing ARM 2.

### Pitfall 4: Schema evolution + parquet schema validation gate

**What goes wrong:** If `int_combined` is incremental and its column set changes (e.g., a Phase 88 CLEAN-02 drop of `specimen_inat_login/family/genus`), the next incremental run errors out: dbt incremental cannot evolve schema on the fly without `on_schema_change` config.
**Why it happens:** Incremental tables persist their schema; DDL changes require `--full-refresh` or `on_schema_change='append_new_columns'`/`'sync_all_columns'`.
**How to avoid:** Even if this phase ships incremental for int_combined, Phase 88 (which drops 3 columns from int_combined per CLEAN-02 deferred cleanup) WILL need a `--full-refresh`. Add to the recommendation: "if incremental is adopted, Phase 88's column drop requires a one-shot `--full-refresh` invocation."
**Warning signs:** Recommendation that says "use incremental forever" without acknowledging the Phase 88 cleanup.

### Pitfall 5: dbt-core / dbt-duckdb version pin

**What goes wrong:** Running `bash data/dbt/run.sh build` after a system change picks up dbt-core 1.10.20 (which has a `KeyError: 'javascript'` regression), invalidating any incremental experiment timings.
**Why it happens:** `run.sh` pins `uvx --from dbt-core==1.10.1 --with dbt-duckdb==1.10.1` — but a planner who edits the wrapper to "test a newer version" breaks the experiment.
**How to avoid:** Do NOT modify the pin in `data/dbt/run.sh`. All experiment runs use the same wrapper.
**Warning signs:** Plan task that touches `data/dbt/run.sh`.
[VERIFIED: v3.3-ROADMAP §Key Decisions, also called out in 086-RESEARCH.md Pitfall 10]

### Pitfall 6: Over-engineering the spike

**What goes wrong:** Building a benchmark harness, parsing JSON, generating graphs, writing 1000 lines of plan when the deliverable is "a written finding." This is a spike; the right output is a 100-line findings doc with a 3-line recommendation.
**Why it happens:** Researcher/planner instincts toward thoroughness when the actual question has a known-with-HIGH-confidence negative answer.
**How to avoid:** The plan should be 1-2 waves max. Wave 1: convert int_combined to incremental, run twice, capture timings, write findings doc. Optional Wave 2: revert the experimental change. That's it.
**Warning signs:** Plan with >5 tasks, or tasks that mention multiple models, multiple strategies, or comparison matrices.

---

## Code Examples

### Converting int_combined to incremental (the experimental change)

```sql
-- data/dbt/models/intermediate/int_combined.sql (EXPERIMENTAL — Phase 087)
-- IMPORTANT: This is a spike. Revert after Phase 087 completes unless Phase 88 adopts.
{{ config(
    materialized='incremental',
    unique_key='ecdysis_id',           -- ARM 1 PK; ARM 2 has NULL ecdysis_id
    incremental_strategy='delete+insert',
    on_schema_change='fail'             -- fail fast if schema drifts; force --full-refresh
) }}

-- ARM 1: Ecdysis rows
SELECT
    e.ecdysis_id,
    ...
FROM {{ ref('int_ecdysis_base') }} e
FULL OUTER JOIN {{ ref('int_samples_base') }} s ON e.host_observation_id = s.observation_id
LEFT JOIN {{ ref('int_specimen_obs_base') }} sob ON sob.waba_obs_id = e.specimen_observation_id
{% if is_incremental() %}
  WHERE e.modified > (SELECT COALESCE(MAX(modified), '1900-01-01') FROM {{ this }})
{% endif %}

UNION ALL

-- ARM 2: Provisional WABA rows — NOTE: ecdysis_id IS NULL here.
-- With delete+insert + unique_key='ecdysis_id', NULL!=NULL so ARM 2 rows will
-- duplicate on every incremental run. EITHER (a) accept it for the spike and
-- record the bug, OR (b) WHERE FALSE this arm during incremental runs and accept
-- that ARM 2 needs a separate rebuild path.
SELECT
    NULL AS ecdysis_id,
    ...
FROM {{ ref('int_provisional_waba_ids') }} p
...
{% if is_incremental() %}
  WHERE FALSE  -- skip ARM 2 in incremental runs; ARM 2 only repopulates on --full-refresh
{% endif %}
```

[CITED: dbt-duckdb 1.10.1 incremental config schema — https://github.com/duckdb/dbt-duckdb#incremental-materializations]

### Capturing timings into a findings table

```bash
# After each dbt build run:
cp data/dbt/target/run_results.json \
   .planning/phases/087-incremental-materialization-experiment/run_results-${RUN_LABEL}.json

# Extract per-model timings:
uv run --project data python <<'PY'
import json, sys
labels = ['baseline', 'incr-full', 'incr-noop', 'incr-change']
for label in labels:
    path = f'.planning/phases/087-incremental-materialization-experiment/run_results-{label}.json'
    try:
        data = json.load(open(path))
    except FileNotFoundError:
        continue
    print(f'\n=== {label} ===')
    for r in data['results']:
        if 'int_combined' in r['unique_id'] or 'occurrences' in r['unique_id']:
            print(f"  {r['unique_id']:60s} {r['execution_time']:.3f}s {r['status']}")
PY
```

### Verifying incremental was actually used (not silently full-rebuilt)

```bash
# After Run 2b (incremental no-op), check the log:
bash data/dbt/run.sh build --select int_combined 2>&1 | grep -E "int_combined.*(incremental|table)"
# Expected: "incremental model" not "table model"
```

---

## Decision Criteria for Phase 88

Format the recommendation for Phase 88's plan-checker to consume directly:

### Adopt incremental if ALL of these are true:

- [ ] Wall-clock for `dbt build --select int_combined+` drops by ≥ 30% on the incremental no-op run (Run 2b) vs. baseline (Run 1).
- [ ] The downstream `occurrences` external mart still produces byte-identical parquet output (verified via `sha256sum public/data/occurrences.parquet`).
- [ ] No duplicate rows appear in int_combined after the no-op run (count check + ARM 2 dedup check).
- [ ] The Phase 88 CLEAN-02 column drop is accommodated by a documented `--full-refresh` step in nightly.sh.

### Keep full rebuilds if ANY of these are true:

- [ ] Wall-clock savings are < 30% (likely outcome given current ~2s total build).
- [ ] ARM 2 row handling requires a separate rebuild path (complexity tax).
- [ ] Incremental adds bookkeeping overhead that exceeds savings on small-data runs.
- [ ] The downstream external mart still dominates wall-clock (likely — external is ~0.37s of the ~0.82s for the int_combined+occurrences chain).

**Expected outcome (HIGH confidence based on baseline data):** Full rebuilds. The total build is too small for incremental to matter; the external mart layer is the bottleneck and cannot be incremental; ARM 2 introduces complexity for no payoff.

---

## Rollback Path

The experiment is a single-file edit. Rollback is git-level:

1. **Before Wave 1:** Create a feature branch (or work in a working-tree change without committing if the executor prefers).
2. **The only file modified:** `data/dbt/models/intermediate/int_combined.sql` (add incremental config block, modify the WHERE clause with `is_incremental()` filter).
3. **Optional second file:** the findings doc in `.planning/phases/087-incremental-materialization-experiment/`.
4. **After observations are captured:** `git revert <commit>` (if committed) OR `git checkout -- data/dbt/models/intermediate/int_combined.sql` (if uncommitted).
5. **Verify rollback:** `bash data/dbt/run.sh build --select int_combined+` returns to ~0.82s baseline; `dbt_sandbox.int_combined` is regenerated as a table (not an incremental table).

[ASSUMED] The git-level rollback is sufficient; no DuckDB-level cleanup is needed because `int_combined` is rebuilt fresh by the post-rollback `dbt build` (DuckDB will overwrite the existing table). If the table persists as "incremental" type in DuckDB metadata after the revert, `--full-refresh` clears it.

**Belt-and-suspenders rollback step**: After reverting the SQL, run `bash data/dbt/run.sh build --select int_combined+ --full-refresh` to guarantee the model is rebuilt as a fresh table.

---

## Runtime State Inventory

This is an experiment phase, not a rename/refactor — but the change DOES affect runtime DuckDB state (an existing table is replaced with an incremental table). Coverage of the categories:

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | `dbt_sandbox.int_combined` in `data/beeatlas.duckdb` is rewritten as an incremental table during the experiment | Belt-and-suspenders `--full-refresh` at rollback restores table-typed model |
| Live service config | None — no n8n, no Tailscale, no scheduled tasks for this experiment | None |
| OS-registered state | None — experiment runs interactively from a terminal, not via cron | None (Phase 88 may introduce cron-level changes; out of scope here) |
| Secrets/env vars | None — dbt reads `DB_PATH` from env if set but no new secrets needed | None |
| Build artifacts | `data/dbt/target/run_results.json` is overwritten on every dbt invocation — captured copies must be saved to phase dir before next run | Copy `run_results.json` to `.planning/phases/087-.../run_results-{label}.json` after each measured run |

**Nothing else found in any category** — this is a contained, single-file SQL experiment with no external integrations.

---

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | pytest 9.0.3 (via `uv run --project data pytest`) + dbt's own test runner |
| Config file | `data/pyproject.toml` |
| Quick run command | `uv run --project data pytest data/tests/test_dbt_diff.py -x` |
| Full suite command | `bash data/dbt/run.sh build && uv run --project data pytest data/tests/ -x` |
| dbt build command | `bash data/dbt/run.sh build` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| TEST-03 | `int_combined` builds successfully with `materialized='incremental'` | dbt build smoke | `bash data/dbt/run.sh build --select int_combined+` (Wave 1) | n/a — runtime check |
| TEST-03 | No duplicate rows in `int_combined` after incremental no-op run | dbt singular test | `bash data/dbt/run.sh test --select int_combined` (existing tests cover this) | ✅ (existing `not_null_int_combined_is_provisional`) |
| TEST-03 | Downstream `occurrences.parquet` schema unchanged (30 cols) after incremental run | diff regression | `uv run --project data pytest data/tests/test_dbt_diff.py::test_occurrences_schema_matches -x` (this test currently fails for CLEAN-02 reasons unrelated to incremental — see Phase 086 verification) | ✅ (existing) |
| TEST-03 | Findings doc records observed wall-clock and recommendation | manual review | — | ❌ Wave 1 (will be `087-FINDINGS.md` or similar) |
| TEST-03 | Experiment leaves the codebase in pre-experiment state OR a committed incremental config | manual / git status check | `git status data/dbt/models/intermediate/int_combined.sql` | n/a |

### Sampling Rate

- **Per task commit (Wave 1):** `bash data/dbt/run.sh build --select int_combined+` — confirms model still builds.
- **Per phase gate:** `bash data/dbt/run.sh build` (full) + `uv run --project data pytest data/tests/test_dbt_diff.py -x` — confirms no regressions.
- **Findings deliverable:** the written `087-FINDINGS.md` doc with recommendation, suitable for Phase 88's planner.

### Wave 0 Gaps

None. The existing test infrastructure (dbt's `test` command + `test_dbt_diff.py`) is sufficient. The only new artifact is the findings doc itself.

*(If a Wave 0 is needed at all in the plan, it would only be to copy the baseline `run_results.json` from a pre-change `dbt build` for comparison — which is a 1-task wave.)*

---

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| uvx + dbt-core==1.10.1 + dbt-duckdb==1.10.1 | All dbt invocations | ✓ | 1.10.1 (pinned in run.sh) | — |
| `data/beeatlas.duckdb` | Source data for int_combined | ✓ | Live data (46,090 ecdysis rows, 47,840 int_combined rows) | — |
| `bash`, `time`, `python` (uv-managed) | Measurement protocol | ✓ | macOS Darwin 25.4.0 | — |

**No missing dependencies.** The experiment is fully runnable on the developer's existing workstation.

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | UPDATE+UPDATE-back on `ecdysis_data.occurrences.modified` is the cleanest way to simulate a data change without polluting source data | Measurement Protocol | Low — alternative is INSERT+DELETE inside a transaction; either works |
| A2 | git-level rollback restores DuckDB table type without needing manual `--full-refresh` | Rollback Path | Low — belt-and-suspenders `--full-refresh` is included as a safety step |
| A3 | The 30% wall-clock improvement threshold is the right decision criterion | Decision Criteria | Medium — could be argued either way; user may want to override |
| A4 | Phase 088 CLEAN-02 column drop is the only future schema change that affects this experiment's adoption decision | Pitfall 4 | Low — other phases that touch int_combined columns are speculative |

**Verified claims (not assumed):**
- dbt-duckdb 1.10.1 explicitly does NOT support incremental + external [CITED: README + issue #74]
- Full `dbt build` wall-clock is ~1.7s of model+test work (~3.4s with dbt startup) [VERIFIED: live timing 2026-05-13]
- `int_combined` is 47,840 rows; `occurrences` source is 46,090 rows [VERIFIED: live DuckDB query]
- `int_combined` is the only `materialized='table'` non-mart intermediate model with substantial row count [VERIFIED: grep + row counts]
- ARM 2 rows in int_combined have `ecdysis_id = NULL` and `modified = NULL` [VERIFIED: int_combined.sql lines 49, 65]
- Both `marts/occurrences.sql` and `marts/species.sql` are `materialized='external'` [VERIFIED: grep against files]

---

## Open Questions (RESOLVED)

1. **Should the experimental incremental config be committed (then reverted) or kept uncommitted?**
   - What we know: the change is a single file; either pattern works.
   - **RESOLVED:** Plan 01 leaves the experimental SQL change *uncommitted* during measurement; Plan 02 captures the pre-experiment SHA and reverts via direct edit (no commit-then-revert in git history). Keeps the experiment as a clean "tried and reverted, no trace" pattern. The findings doc carries the historical record instead of git history.

2. **Should the findings doc live as `087-FINDINGS.md` or be folded into the phase's verification report?**
   - What we know: the ROADMAP says "a written finding documents…" — a standalone doc is the cleanest fit.
   - **RESOLVED:** Standalone `.planning/phases/087-incremental-materialization-experiment/087-FINDINGS.md`, consumed by Phase 88's planner via direct reference. Skeleton follows the `086-VERIFICATION.md` shape per 087-PATTERNS.md.

3. **Does the planner want to include `int_species_universe` as a secondary experimental subject?**
   - What we know: 629 rows means no measurable timing signal.
   - **RESOLVED:** NO. Single subject `int_combined` only. Adding `int_species_universe` would double the work for zero additional signal.

---

## Sources

### Primary (HIGH confidence)

- https://github.com/duckdb/dbt-duckdb — README (fetched 2026-05-13): explicit statement that incremental + external is not supported; complete list of supported incremental strategies; roadmap item for future support
- https://github.com/duckdb/dbt-duckdb/issues/74 — "Incremental external models" issue, open since 2022, no PR
- https://docs.getdbt.com/reference/resource-configs/duckdb-configs — dbt Developer Hub DuckDB config reference
- `data/dbt/dbt_project.yml`, `data/dbt/profiles.yml`, `data/dbt/run.sh` — current dbt project config
- `data/dbt/models/marts/occurrences.sql`, `data/dbt/models/marts/species.sql` — confirmed both are `materialized='external'`
- `data/dbt/models/intermediate/int_combined.sql` — confirmed `materialized='table'`, ARM 1 + ARM 2 UNION ALL structure, `ecdysis_id` and `modified` column shape
- `data/beeatlas.duckdb` — queried live for row counts (2026-05-13)
- Live `bash data/dbt/run.sh build` timing — ~1.68s model+test, 0.82s for int_combined+occurrences (2026-05-13)
- `.planning/REQUIREMENTS.md` line 42 — TEST-03 verbatim requirement text
- `.planning/ROADMAP.md` lines 487-494 — Phase 087 success criteria

### Secondary (MEDIUM confidence)

- https://duckdb.org/2025/04/04/dbt-duckdb — DuckDB official blog post on dbt-duckdb (April 2025)
- `.planning/phases/086-port-remaining-transforms/086-RESEARCH.md` — dbt project structure context, version pin rationale (Pitfall 10), profiles.yml structure
- `.planning/phases/086-port-remaining-transforms/086-VERIFICATION.md` — current `dbt build` PASS=44 state, deferred CLEAN-02 column-drop context

### Tertiary (LOW confidence)

- WebSearch results on "dbt-duckdb incremental external materialization" (2026-05-13) — corroborates primary but not used as sole basis for any claim

---

## Metadata

**Confidence breakdown:**
- TEST-03 negative answer (incremental + external not supported): **HIGH** — verified against upstream README and open issue, no contradicting evidence in any source
- Recommended experimental subject (int_combined): **HIGH** — only viable candidate by elimination, row counts and config verified
- Wall-clock baseline (~1.7s total build): **HIGH** — measured live during research
- Recommended experimental protocol (4 runs, run_results.json capture): **MEDIUM** — pattern is established but exact label names are advisory
- Decision criteria for Phase 88 (30% threshold): **MEDIUM** — defensible but arguable; user may want different thresholds
- Rollback path (git + `--full-refresh`): **HIGH** — straightforward, no external state to clean up

**Research date:** 2026-05-13
**Valid until:** Until dbt-duckdb ships #74 (incremental external models) — at that point this research becomes obsolete and the experiment should be re-run with the new feature. As of dbt-duckdb 1.10.1 (released 2026-02-17) this is not on the immediate roadmap.
