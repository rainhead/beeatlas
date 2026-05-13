# Phase 84: Tests, Diff & Findings — Research

**Researched:** 2026-05-12
**Domain:** dbt generic tests, model contracts, parquet/GeoJSON diffing, partial-run exploration, spike writeup
**Confidence:** HIGH (Phase 83 scaffolding is complete and running; most research is empirical — data already sampled from live sandbox)

## Summary

Phase 84 is the learning-capture phase of the v3.3 dbt Spike. The `data/dbt/` project is working:
23 models build in ~1.3 seconds, producing `occurrences.parquet` (47,883 rows), `counties.geojson`
(39 features), and `ecoregions.geojson` (66 features) in `data/dbt/target/sandbox/`. Phase 84
exercises dbt's test and contract surface on those models, runs a diff against `public/data/`,
explores partial-run behavior, and writes the go/no-go findings document.

Two empirical findings from the pre-research differ from Phase 83 assumptions and are load-bearing
for planning:

1. **dbt-core 1.10.20 regression (BLOCKER for Phase 84 wave 0):** The run.sh `1.10.*` wildcard
   now resolves to `1.10.20`, which fails with `KeyError: 'javascript'` in the macro parser when
   the `emit_feature_collection` macro is loaded. Pinning to `dbt-core==1.10.1` exactly fixes it
   (verified). Wave 0 of Phase 84 must pin the run.sh invocation to `==1.10.1`.

2. **Spatial diff baseline established:** The sandbox and `public/data/` occurrences.parquet have
   the same row count (47,883), the same column set (33 columns), and the same ecdysis-id key set.
   However, 84 rows differ in `county` assignment (zero differ in `ecoregion_l3`). All 84 affected
   rows sit on the Benton/Grant and Chelan/King county boundaries, where `ST_Within` returns `True`
   for two polygons simultaneously. This is a nondeterminism issue in both `export.py` and dbt
   (neither deduplicates the `with_county` LEFT JOIN before the fallback path). The diff is a
   **semantic divergence to investigate** (DIFF-03 classification: same code, nondeterministic
   ordering). The GeoJSON outputs differ only in JSON whitespace formatting (`export.py` adds spaces
   after `:` and `,`; the dbt COPY macro does not).

**Primary recommendation:** Structure Phase 84 as four sequential plans — (1) run.sh pin fix +
diff script + TEST-01 generic tests, (2) TEST-02 contract + TEST-03 re-expression, (3) PART-01/02
partial runs and lineage, (4) findings document body (FIND-01/02/03). Each plan produces a committed
artifact that extends `dbt-spike-findings.md`.

<user_constraints>
## User Constraints (from Phase 83 CONTEXT.md — applies equally to Phase 84)

### Locked Decisions (carry-forward from Phase 83)
- Slice = `occurrences.parquet` + `counties.geojson` + `ecoregions.geojson`; dbt outputs at
  `data/dbt/target/sandbox/`; diff target is `public/data/`.
- Findings doc is `.planning/research/dbt-spike-findings.md` (seeded in Phase 83, append-only).
- `bash data/dbt/run.sh` is the standard invocation (Python 3.14 fallback via uvx; see caveat below
  about 1.10.20 regression).
- Out of scope: changes to `data/run.py`, `data/nightly.sh`, `public/data/`,
  `scripts/validate-schema.mjs`, frontend, dbt CI integration. NO PRODUCTION CUTOVER.
- `int_combined` is a TABLE; all other models are views or external. 23-model DAG: 11 staging + 9
  intermediate + 3 marts.
- `samples.parquet` discrepancy documented in findings seed; folded into `occurrences.parquet`.

### Claude's Discretion
- How to structure the findings document sections (FIND-01, 02, 03).
- Whether to use a pytest module or a shell script for the diff harness.
- Which two subgraphs to demonstrate for PART-01.
- Which lineage artifact format to commit for PART-02.

### Deferred Ideas (OUT OF SCOPE)
- Production cutover (replacing `export.py`, retiring `validate-schema.mjs`).
- Multi-slice porting.
- dbt CI integration.
- Splitting `samples.parquet` out as a separate mart.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| TEST-01 | Three generic test classes (not_null, unique, relationships) on slice models; per-test pass/fail/awkward-fit recorded | Candidate columns identified; syntax verified via docs |
| TEST-02 | Model contract enforced on one output model; intentional-drift behavior documented | Contract syntax confirmed; occurrences mart is the recommended target |
| TEST-03 | At least one validate-schema.mjs / _apply_migrations invariant re-expressed as dbt test or contract; comparison documented | validate-schema.mjs column-presence check maps cleanly to contract columns block |
| DIFF-01 | Reproducible diff script: row counts, schema, key-set equality on ecdysis_id / inat observation_id | Empirically confirmed: same rows, same schema; key-set equality holds |
| DIFF-02 | Spatial-join discrepancies enumerated and root-caused | 84 county-only diffs found; root cause is boundary nondeterminism (ST_Within returns True for 2 polygons) |
| DIFF-03 | Every material difference classified (4 buckets) | GeoJSON whitespace = neutral/cosmetic; 84 county boundary rows = semantic divergence to investigate |
| PART-01 | dbt run --select on >= 2 subgraphs; parallelism documented | Proposed: staging+ and +occurrences; parallelism visible via thread logs |
| PART-02 | Lineage artifact captured and referenced from findings | dbt ls --resource-type model --output json is the recommended artifact format |
| FIND-01 | Findings doc has what worked / what was awkward / more-clearly / less-clearly sections | Seeded doc extended; FORMAT CSV workaround + samples.parquet discrepancy both land here |
| FIND-02 | Go/no-go/conditional recommendation with reasoning grounded in diff and test results | Template provided in Code Examples section |
| FIND-03 | Prerequisites list covering 5 areas (test coverage, schema, ingestion vs transform, orchestration, DuckDB-WASM impact) | Each area researched with a "Before cutover, X must be true" template |
</phase_requirements>

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| dbt generic tests (not_null, unique, relationships) | dbt schema.yml | — | Tests live in YAML files co-located with models; dbt evaluates them as SQL assertions at run time |
| Model contract enforcement | dbt schema.yml (config block) | — | Contract is a model-level config; dbt checks column types before writing the relation |
| Diff computation | pytest module (test_dbt_diff.py) | — | Mirrors existing test_dbt_scaffold.py pattern; uses real DuckDB for parquet diff; results visible in pytest output |
| GeoJSON diff | Python in pytest | — | json.loads + sorted feature lists; geometry string comparison via ST_AsGeoJSON |
| Partial-run demonstration | bash data/dbt/run.sh | — | --select syntax is a CLI feature; timing and thread logs written to target/run_results.json |
| Lineage artifact | dbt ls --resource-type model --output json | — | Committed as text in findings doc; no binary artifacts |
| Findings document | .planning/research/dbt-spike-findings.md | — | Append-only; seeded by Phase 83; Phase 84 fills in all To-Do sections |
| run.sh version pin (BLOCKER) | data/dbt/run.sh | — | Must be fixed in Wave 0 before any dbt command can run |

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `dbt-core` | `==1.10.1` (EXACT PIN — see Pitfall 1) | DAG runner, test evaluator, contract enforcer | 1.10.20 has a macro-parser regression; 1.10.1 is verified working |
| `dbt-duckdb` | `==1.10.1` | DuckDB adapter; already installed | Verified working with dbt-core 1.10.1 |
| `pytest` | already in dev group | Diff harness, assertions | Mirrors existing test_dbt_scaffold.py pattern |
| `duckdb` (Python) | `>=1.4,<2` (already pinned) | Parquet and in-memory diff SQL | Already in pyproject.toml |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `json` (stdlib) | — | GeoJSON FeatureCollection comparison | Always — no dependency needed |
| `pathlib` (stdlib) | — | Sandbox and public/data path resolution | Always |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| pytest diff module | Shell script (data/dbt/tests/diff_against_export.sh) | Pytest gives structured pass/fail output, rich assertions, and is consistent with existing test_dbt_scaffold.py; shell is more transparent for one-liners but harder to produce classification tables |
| pytest diff module | dbt singular test | Singular test couples diff to dbt build cycle; can't easily report classification into findings doc; harder to run standalone |
| `dbt ls --output json` | `dbt docs generate` + screenshot | dbt docs needs a browser; ls output is plaintext, committable, and readable in findings doc |
| dbt ls text format | `target/manifest.json` | manifest.json is ~100KB of binary-ish JSON, churn-prone; ls listing is 23 lines, stable |

**Installation:** No new packages needed — all dependencies already present.

## Architecture Patterns

### System Architecture Diagram

```
Phase 84 data flow:

  data/dbt/run.sh build             data/export.py (already ran)
         |                                  |
         v                                  v
  data/dbt/target/sandbox/          public/data/
    occurrences.parquet      DIFF     occurrences.parquet
    counties.geojson          <---->  counties.geojson
    ecoregions.geojson               ecoregions.geojson
         |
         |-- TEST-01 --> schema.yml generic tests (not_null, unique, relationships)
         |-- TEST-02 --> schema.yml contract: enforced: true on occurrences mart
         |-- PART-01 --> run.sh run --select staging+ ; run.sh run --select +occurrences
         |-- PART-02 --> run.sh ls --resource-type model --output json
         v
  data/tests/test_dbt_diff.py (pytest)
         |
         v
  .planning/research/dbt-spike-findings.md  (extended by each plan)
```

### Recommended Project Structure (additions in Phase 84)

```
data/
├── dbt/
│   ├── run.sh                         # MODIFIED in Wave 0: pin 1.10.* -> 1.10.1
│   ├── models/
│   │   ├── staging/
│   │   │   └── schema.yml             # NEW: generic tests (TEST-01)
│   │   ├── intermediate/
│   │   │   └── schema.yml             # NEW: generic tests on int_combined etc.
│   │   └── marts/
│   │       └── schema.yml             # NEW: contract on occurrences (TEST-02) + tests
├── tests/                             # (data/dbt/tests — existing shell assertions)
│   └── scaffold_assert.sh             # UNCHANGED
└── tests/ (data/tests — pytest)
    ├── test_dbt_scaffold.py           # UNCHANGED (6 existing tests)
    └── test_dbt_diff.py               # NEW: diff harness (DIFF-01, DIFF-02, DIFF-03)
.planning/research/
    └── dbt-spike-findings.md          # EXTENDED: all To-Do sections filled
```

### Pattern 1: dbt Generic Tests (TEST-01)

**What:** YAML-defined tests that dbt evaluates as SQL queries; failing tests return non-zero rows.
**Where results land:** `target/run_results.json` (per-test `status`: `pass` / `fail` / `error`);
also logged to stdout as `PASS N / FAIL N`.
**Invocation:** `bash data/dbt/run.sh test` (runs all tests) or
`bash data/dbt/run.sh test --select stg_ecdysis__occurrences` (one model).

```yaml
# data/dbt/models/staging/schema.yml
# Source: docs.getdbt.com/docs/build/data-tests (verified via ctx7)
version: 2

models:
  - name: stg_ecdysis__occurrences
    columns:
      - name: catalog_number
        description: Ecdysis catalog number — unique primary key in this dataset
        data_tests:
          - not_null
          - unique                # VERIFIED unique: 46,090 rows, 46,090 distinct catalog_numbers

  - name: stg_waba__observations
    columns:
      - name: id
        data_tests:
          - not_null
          - unique                # VERIFIED unique: 1,408 rows, 1,408 distinct ids

  - name: stg_inat__observations
    columns:
      - name: id
        data_tests:
          - not_null
          - unique                # NOTE: EXPECTED TO FAIL — 10,845 distinct vs 10,846 rows
                                  # (one duplicate inat observation_id exists)
                                  # Record as "awkward-fit" — iNat pipeline doesn't guarantee dedup
```

```yaml
# data/dbt/models/intermediate/schema.yml
version: 2

models:
  - name: int_id_modified
    columns:
      - name: coreid
        description: Ecdysis occurrence coreid — unique per row in this aggregate
        data_tests:
          - not_null
          - unique                # VERIFIED: 46,090 rows, 46,090 distinct coreids

  - name: int_combined
    columns:
      - name: is_provisional
        data_tests:
          - not_null             # should always be TRUE or FALSE, never NULL

  - name: int_ecdysis_base
    columns:
      - name: ecdysis_id
        data_tests:
          - relationships:
              to: ref('stg_ecdysis__occurrences')
              field: catalog_number   # ecdysis_id = catalog_number (int) cast relationship
                                      # NOTE: type mismatch (int vs varchar) — may be "awkward-fit"
```

**Per-test recording convention:** After running `bash data/dbt/run.sh test`, inspect
`target/run_results.json` and record in findings:
- `status: "pass"` → held
- `status: "fail"` → failed (note row count returned)
- `status: "error"` → couldn't be expressed cleanly (e.g., type mismatch)

**Awkward-fit example pre-identified:** The `stg_inat__observations.id` unique test will fail
(1 duplicate). This is expected — record as a finding: iNat pipeline dedup is not enforced by dbt.
The `relationships` test on `ecdysis_id → catalog_number` may error due to INTEGER vs VARCHAR type;
record type-cast awkwardness as a finding.

### Pattern 2: dbt Model Contract (TEST-02)

**What:** Declares column names + DuckDB types in schema.yml; dbt enforces schema before writing
the relation. If the model SELECT returns a different column set, the build ERRORs.
**Best candidate:** `occurrences` mart — 33 columns, highest payoff for CONTRACT enforcement.
`materialized='external'` models support contracts in dbt-duckdb 1.10.x [ASSUMED — see A1].

```yaml
# data/dbt/models/marts/schema.yml
# Source: docs.getdbt.com/docs/mesh/govern/model-contracts (verified via ctx7)
version: 2

models:
  - name: occurrences
    config:
      contract:
        enforced: true
    columns:
      - name: ecdysis_id
        data_type: integer
      - name: catalog_number
        data_type: varchar
      - name: lon
        data_type: double
      - name: lat
        data_type: double
      - name: date
        data_type: varchar
      - name: year
        data_type: bigint
      - name: month
        data_type: bigint
      - name: scientificName
        data_type: varchar
      - name: recordedBy
        data_type: varchar
      - name: fieldNumber
        data_type: varchar
      - name: genus
        data_type: varchar
      - name: family
        data_type: varchar
      - name: floralHost
        data_type: varchar
      - name: host_observation_id
        data_type: bigint
      - name: inat_host
        data_type: varchar
      - name: inat_quality_grade
        data_type: varchar
      - name: modified
        data_type: varchar
      - name: specimen_observation_id
        data_type: bigint
      - name: elevation_m
        data_type: integer
      - name: observation_id
        data_type: bigint
      - name: host_inat_login
        data_type: varchar
      - name: specimen_count
        data_type: integer
      - name: sample_id
        data_type: integer
      - name: sample_host
        data_type: varchar
      - name: specimen_inat_login
        data_type: varchar
      - name: specimen_inat_taxon_name
        data_type: varchar
      - name: specimen_inat_genus
        data_type: varchar
      - name: specimen_inat_family
        data_type: varchar
      - name: specimen_inat_quality_grade
        data_type: varchar
      - name: is_provisional
        data_type: boolean
      - name: canonical_name
        data_type: varchar
      - name: county
        data_type: varchar
      - name: ecoregion_l3
        data_type: varchar
```

**Intentional-drift test procedure (TEST-02):**
1. Commit the contract above. Verify `dbt build` passes.
2. Edit `occurrences.sql` to rename one column (e.g., `county` → `county_name`).
3. Run `dbt build`. Record: exit code, error message, which file the error appears in.
4. Revert the rename. Verify build returns to green.
5. Document in findings: error message shape, exit code (expected: non-zero), whether it appears
   in stdout vs `run_results.json`.

**Expected failure mode:** dbt-core will raise a `ContractBreakingChangeError` (or similar schema
mismatch error) before writing the relation. Exact error message should be captured verbatim.
[ASSUMED — A1 in Assumptions Log; behavior not empirically tested in Phase 83]

### Pattern 3: TEST-03 — Re-expressing validate-schema.mjs invariant

**The clearest mapping:** `validate-schema.mjs` checks that `occurrences.parquet` contains all 33
expected columns by name. The dbt model contract (Pattern 2 above) with `enforced: true` and a
full `columns:` block re-expresses this invariant more explicitly:
- `validate-schema.mjs`: checks column-name presence in the already-written file (post-hoc gate)
- dbt contract: blocks the build if the model produces a different schema (pre-hoc gate)

**What dbt expresses more clearly:** The contract declares both column names AND DuckDB types. The
JavaScript gate only checks names. If `year` changes from `BIGINT` to `INTEGER`, validate-schema.mjs
would pass; the dbt contract would fail.

**What dbt expresses less clearly:** validate-schema.mjs runs against the file as deployed to
`public/data/` (or CloudFront). The dbt contract only checks the sandbox output. The production
gate catches regressions after export; the contract catches them at build-time.

**Comparison framework for findings (TEST-03):**
```
Invariant: "occurrences.parquet must have exactly these 33 column names"

validate-schema.mjs:
  + Runs on actual production file (post-export gate)
  + Trivially readable (array literal of column names)
  - Type-blind (only checks presence, not data_type)
  - Decoupled from data transformation (runs at CI time, not pipeline time)
  - Written in JavaScript — different language from the pipeline

dbt contract:
  + Schema-typed (enforces both name and DuckDB type)
  + Pre-empts bad builds (fails before writing the parquet)
  + Declared alongside the model (co-location = better discoverability)
  - Only gates the sandbox output, not production deployment
  - Requires understanding dbt YAML contract syntax
```

### Pattern 4: Diff Harness (DIFF-01, DIFF-02, DIFF-03)

**Recommendation:** pytest module at `data/tests/test_dbt_diff.py`.

**Why pytest over shell script:** DuckDB SQL in pytest produces structured assertions with clear
failure messages; shell scripts with `jq` or `python3 -c` one-liners are harder to classify
(DIFF-03) and harder to maintain. The existing `test_dbt_scaffold.py` is the pattern to mirror.

```python
# data/tests/test_dbt_diff.py  (skeleton — executor fills in values from research)
# Source: mirrors test_dbt_scaffold.py pattern [VERIFIED: data/tests/test_dbt_scaffold.py]
import json, duckdb
from pathlib import Path

SANDBOX = Path(__file__).resolve().parent.parent / "dbt" / "target" / "sandbox"
PUBLIC  = Path(__file__).resolve().parent.parent.parent / "public" / "data"

# DIFF-01: Row count equality
def test_occurrences_row_count_matches():
    """dbt sandbox occurrences.parquet has same row count as public/data/occurrences.parquet."""
    s = duckdb.execute(f"SELECT COUNT(*) FROM read_parquet('{SANDBOX}/occurrences.parquet')").fetchone()[0]
    p = duckdb.execute(f"SELECT COUNT(*) FROM read_parquet('{PUBLIC}/occurrences.parquet')").fetchone()[0]
    assert s == p, f"Row count mismatch: sandbox={s}, public={p}"
    # VERIFIED: both 47,883 [VERIFIED: pre-research empirical check]

# DIFF-01: Schema equality (column names and types)
def test_occurrences_schema_matches():
    """Column names in sandbox occurrences.parquet match public/data/occurrences.parquet."""
    s_cols = [r[0] for r in duckdb.execute(f"DESCRIBE SELECT * FROM read_parquet('{SANDBOX}/occurrences.parquet')").fetchall()]
    p_cols = [r[0] for r in duckdb.execute(f"DESCRIBE SELECT * FROM read_parquet('{PUBLIC}/occurrences.parquet')").fetchall()]
    assert s_cols == p_cols, f"Schema mismatch.\nSandbox: {s_cols}\nPublic: {p_cols}"
    # VERIFIED: identical 33-column set [VERIFIED: pre-research empirical check]

# DIFF-01: Key-set equality on ecdysis_id
def test_occurrences_ecdysis_key_set_matches():
    """Ecdysis-sourced rows have the same ecdysis_id key set in both files."""
    s = duckdb.execute(f"SELECT COUNT(DISTINCT ecdysis_id) FROM read_parquet('{SANDBOX}/occurrences.parquet') WHERE ecdysis_id IS NOT NULL").fetchone()[0]
    p = duckdb.execute(f"SELECT COUNT(DISTINCT ecdysis_id) FROM read_parquet('{PUBLIC}/occurrences.parquet') WHERE ecdysis_id IS NOT NULL").fetchone()[0]
    assert s == p, f"ecdysis_id key set size mismatch: sandbox={s}, public={p}"
    # VERIFIED: both 46,090 distinct ecdysis_ids [VERIFIED: pre-research empirical check]

# DIFF-02: Enumerate spatial discrepancies on county
def test_occurrences_county_spatial_diff():
    """
    Enumerate rows differing in county between sandbox and public/data.
    CLASSIFICATION (DIFF-03): semantic divergence to investigate.
    Root cause: ST_Within returns True for boundary polygons in both Benton/Grant
    and Chelan/King — nondeterministic JOIN ordering produces different winners.
    """
    q = f"""
    SELECT COUNT(*) AS diff_rows
    FROM read_parquet('{SANDBOX}/occurrences.parquet') s
    JOIN read_parquet('{PUBLIC}/occurrences.parquet') p ON s.ecdysis_id = p.ecdysis_id
    WHERE s.county != p.county
    """
    n = duckdb.execute(q).fetchone()[0]
    # Expect 84 rows to differ — this is a DOCUMENTED divergence, not a regression guard.
    # If this count changes, investigate new boundary-overlap cases.
    assert n == 84, f"Unexpected county diff count: {n} (expected 84 boundary-nondeterminism rows)"
    # VERIFIED: 84 rows [VERIFIED: pre-research empirical check]

# DIFF-02: No ecoregion differences
def test_occurrences_ecoregion_spatial_diff():
    """No rows differ in ecoregion_l3 assignment."""
    q = f"""
    SELECT COUNT(*) AS diff_rows
    FROM read_parquet('{SANDBOX}/occurrences.parquet') s
    JOIN read_parquet('{PUBLIC}/occurrences.parquet') p ON s.ecdysis_id = p.ecdysis_id
    WHERE s.ecoregion_l3 != p.ecoregion_l3
    """
    n = duckdb.execute(q).fetchone()[0]
    assert n == 0, f"{n} rows differ in ecoregion_l3 (expected 0)"
    # VERIFIED: 0 rows [VERIFIED: pre-research empirical check]

# DIFF-01: GeoJSON feature count equality
def test_counties_geojson_feature_count_matches():
    """counties.geojson has same feature count in sandbox and public/data."""
    s = json.loads((SANDBOX / "counties.geojson").read_text())
    p = json.loads((PUBLIC / "counties.geojson").read_text())
    assert len(s["features"]) == len(p["features"])
    # VERIFIED: both 39 features [VERIFIED: pre-research empirical check]

def test_geojson_property_names_match():
    """GeoJSON feature property keys are identical (NAME for counties, NA_L3NAME for ecoregions)."""
    for fname, prop in [("counties.geojson", "NAME"), ("ecoregions.geojson", "NA_L3NAME")]:
        s_names = sorted(f["properties"][prop] for f in json.loads((SANDBOX / fname).read_text())["features"])
        p_names = sorted(f["properties"][prop] for f in json.loads((PUBLIC / fname).read_text())["features"])
        assert s_names == p_names, f"{fname} {prop} name sets differ"
    # VERIFIED: county names match exactly; ecoregion names match exactly [VERIFIED: pre-research]
```

### Pattern 5: DIFF-03 Classification Table (in findings doc)

Each material difference gets a row in the findings doc:

| Difference | Sandbox Value | Public Value | Classification | Root Cause |
|------------|--------------|--------------|----------------|------------|
| GeoJSON whitespace | compact JSON (no spaces) | `json.dumps()` with spaces after `:`,`,` | Neutral / cosmetic | Python `json.dumps()` vs DuckDB COPY FORMAT CSV — different formatters |
| 84 county-boundary rows | varies by run | varies by run | Semantic divergence to investigate | `ST_Within` returns `True` for 2 polygons at polygon edges; no dedup in `with_county` LEFT JOIN; both export.py and dbt are nondeterministic here |
| Column order | matches | matches | — (identical) | — |
| Row count | 47,883 | 47,883 | — (identical) | — |
| Schema | 33 identical columns | 33 identical columns | — (identical) | — |

### Pattern 6: Partial Runs (PART-01)

**Two subgraphs to exercise:**

1. `staging+` — builds all 11 staging views and their downstream dependents. Demonstrates that
   the DAG respects the full dependency chain from source to marts.
   ```bash
   bash data/dbt/run.sh build --select "staging+"
   # Expected: 23 models (all), because all intermediates and marts depend on staging
   # Observe: thread logs in stdout show parallel execution across staging models
   ```

2. `+occurrences` — builds everything upstream of the `occurrences` mart plus the mart itself
   (excludes `counties_geo` and `ecoregions_geo` which share staging ancestors but are separate
   terminal nodes).
   ```bash
   bash data/dbt/run.sh build --select "+occurrences"
   # Expected: all 11 staging + all 9 intermediate + 1 mart = 21 models
   # Observe: counties_geo and ecoregions_geo are SKIP'd
   ```

**Parallelism documentation:** Run with `--threads 4` (default in profiles.yml) and capture the
`thread_id` field from `target/run_results.json` after each build. Multiple thread IDs in the
results confirm parallel execution. Also check stdout for `[Thread N]` prefixes.

**Baseline:** Full `dbt clean && dbt build` takes ~3 seconds (1s clean + 1.3s build).

### Pattern 7: Lineage Artifact (PART-02)

**Recommendation:** `dbt ls --resource-type model --output json`

This fails with the current `1.10.20` macro parser bug. After the run.sh pin fix lands in Wave 0,
capture the output and commit it inline in findings doc as a fenced code block.

```bash
bash data/dbt/run.sh ls --resource-type model
# Expected output (23 lines, one per model):
# beeatlas.marts.counties_geo
# beeatlas.marts.ecoregions_geo
# beeatlas.marts.occurrences
# beeatlas.intermediate.int_combined
# ... etc
```

Alternatively, `dbt ls --output json` produces structured JSON per model with `resource_type`,
`name`, `original_file_path`, and `depends_on`. More information but harder to read in a findings
doc. The plain listing is more readable; use that as the primary artifact.

### Pattern 8: FIND-03 Prerequisites Framework

**Shape:** Each prerequisite is a "Before cutover, X must be true" statement. For a findings doc
targeted at a future milestone planner (not an executive), a single-sentence bullet with a
one-paragraph elaboration is the right shape.

**Template for each of the 5 areas:**

```markdown
### Prerequisites for a Full-Rewrite Milestone (v3.4+)

Before committing to a full migration milestone, the following must be true:

**1. Test coverage**
Before cutover, every invariant currently enforced by `validate-schema.mjs` and
`data/run.py::_apply_migrations` must be re-expressed as a dbt test or contract,
with all tests passing green against the live `beeatlas.duckdb`.
- Blocker: dbt model contracts on `external` materialization need verification
  against the dbt-duckdb adapter docs.

**2. Schema decisions**
Before cutover, the `samples.parquet` vs `occurrences.parquet` question must be
resolved: does a full-rewrite milestone keep the FULL OUTER JOIN approach (one file),
or split specimens and samples into separate marts? The frontend SQLite schema in
`data/export.py` is the authority; any schema change requires a SQLite migration too.

**3. Ingestion-vs-transform boundaries**
Before cutover, it must be decided which pipeline steps remain as dlt/Python (ingestion)
and which move to dbt (transform). Recommended boundary: dlt fetchers stay; everything
in `export.py` moves to dbt. The `species_export.py`, `resolve_taxon_ids.py`, and
`feeds.py` must be evaluated separately — they are out of scope for v3.3.

**4. Parallel-run / orchestration story**
Before cutover, the cron orchestration story must be designed. `data/nightly.sh`
currently runs `export.py` as a monolith; the dbt equivalent would be
`dbt build` (potentially with `--threads N`). Partial parallelism within a single
`dbt build` run is available (observed in PART-01), but multi-process orchestration
(dbt + dlt running concurrently, or incremental runs) is untested.

**5. DuckDB-WASM frontend impact**
Before cutover, confirm the output schema of `occurrences.parquet` is unchanged.
The frontend reads this file via SQLite WASM (wa-sqlite + hyparquet). Any column
rename or type change is a breaking frontend change. The dbt contract (TEST-02)
is the mechanism for enforcing this — it must be in place and green before cutover.
```

### Anti-Patterns to Avoid

- **Running any dbt command before fixing the run.sh 1.10.* → 1.10.1 pin** — the macro parser bug
  (`KeyError: 'javascript'`) prevents ALL dbt operations including `dbt test`, `dbt ls`, and
  `dbt build`. Wave 0 task 1 must be the version pin fix.
- **Adding schema.yml without `version: 2`** — dbt 1.10 requires the version key; omitting it
  produces a silent parse failure.
- **Declaring a contract on `counties_geo` or `ecoregions_geo`** — these materialized as `table`
  in dbt_sandbox and their column set is `(name, geom)` — not the output shape. The `occurrences`
  mart is the right contract target.
- **Using `data_tests: unique` on `stg_inat__observations.id`** — there is one duplicate
  (10,845 distinct / 10,846 rows). The test will fail. Use this as a findings example of
  "awkward-fit: pipeline doesn't enforce uniqueness at source."
- **Committing `target/run_results.json`** — it is and must remain gitignored. Capture per-test
  results by quoting them verbatim in the findings doc text.
- **Using `dbt docs generate` for lineage** — it requires `catalog.json` (needs a build first),
  then a browser; not a committable artifact. Use `dbt ls` instead.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Column-presence assertion in parquet | Custom Python column-check script | dbt contract `enforced: true` + `columns:` block | Native dbt feature; survives model refactors; co-located with model |
| Spatial diff (county/eco) | Custom spatial query harness | pytest + DuckDB SQL in test_dbt_diff.py | Same engine as the pipeline; DuckDB SQL is the right tool; already pattern-established |
| DAG visualization | Custom graphviz render | `dbt ls --resource-type model` output in findings doc | Plaintext, committable, readable; DAG structure is simple enough (23 nodes) |
| Test result extraction from run_results.json | jq pipeline | pytest assertions + stdout inspection | Pytest output is human-readable; run_results.json structure is complex JSON |

## Common Pitfalls

### Pitfall 1: dbt-core 1.10.20 macro parser regression (BLOCKER)

**What goes wrong:** All dbt commands fail with:
```
KeyError: 'javascript'
File ".../dbt/clients/jinja.py", line 205, in get_supported_languages
    ModelLanguage[item.value] for ...
```
**Why it happens:** `dbt-core==1.10.*` in `uvx --from` now resolves to `1.10.20`, which has a
regression in macro language detection triggered by `list({...})` syntax in
`emit_feature_collection.sql`.
**How to avoid:** Pin `run.sh` to use `uvx --from dbt-core==1.10.1` (exact, not wildcard).
**Verified fix:**
```bash
# In data/dbt/run.sh, change:
exec uvx --from dbt-core==1.10.* --with dbt-duckdb==1.10.1 dbt "$@"
# To:
exec uvx --from dbt-core==1.10.1 --with dbt-duckdb==1.10.1 dbt "$@"
```
[VERIFIED: dbt-core==1.10.1 build exits 0; dbt-core==1.10.20 fails]

**Warning signs:** `KeyError: 'javascript'` in any dbt command output.

### Pitfall 2: Contract enforcement on `external` materialization

**What goes wrong:** `contract: enforced: true` may not work with `materialized='external'` in
dbt-duckdb 1.10.1.
**Why it happens:** Contract enforcement requires dbt to inspect the actual relation schema after
build; external materializations write to a file, not a DuckDB schema relation.
**How to avoid:** Test the contract on the `occurrences` model early in Wave 1. If it errors on
`external`, fall back to declaring the contract on `int_combined` (which IS a DuckDB table in
`dbt_sandbox`) — different learning payoff but still satisfies TEST-02.
**Warning signs:** `ContractBreakingChangeError: Cannot determine actual schema for external materialization` or similar.
[ASSUMED — A1]

### Pitfall 3: dbt test `relationships` type mismatch

**What goes wrong:** `relationships` test on `int_ecdysis_base.ecdysis_id → stg_ecdysis__occurrences.catalog_number` errors because `ecdysis_id` is INTEGER and `catalog_number` is VARCHAR.
**Why it happens:** DuckDB does not auto-cast in the EXISTS subquery that `relationships` generates.
**How to avoid:** Use a dbt singular test instead — a custom SQL file that checks the relationship
with an explicit CAST. Or document as "awkward-fit: key type mismatch requires explicit cast in
dbt test". Either outcome is valid for TEST-01 findings.
**Warning signs:** `BinderError: Cannot compare INTEGER and VARCHAR` in test output.

### Pitfall 4: Sandbox stale after dbt-core version change

**What goes wrong:** After pinning run.sh to `1.10.1`, existing `target/` artifacts may be from
the `1.10.20` run (which failed before completing). A partial build may leave stale parquet.
**How to avoid:** Run `bash data/dbt/run.sh clean && bash data/dbt/run.sh build` after the version
pin fix to ensure a clean sandbox before any diff tests.
**Warning signs:** `test_occurrences_row_count_matches` fails with unexpected row counts.

### Pitfall 5: GeoJSON diff false positive from JSON key ordering

**What goes wrong:** Python `json.dumps()` and DuckDB COPY output may differ in object-key order
within feature properties. A naive string-equality check would report a diff.
**How to avoid:** Compare by parsing JSON and sorting features by property value — not by string
equality. The `test_geojson_property_names_match` pattern (sorted lists of names) is safe.
**Warning signs:** GeoJSON diff "fails" even though all feature names and geometries are correct.

### Pitfall 6: Missing `version: 2` in schema.yml breaks silently

**What goes wrong:** dbt parses the schema.yml but ignores the tests, producing "0 tests" without
an error.
**How to avoid:** Always include `version: 2` as the first line of any schema.yml.
**Warning signs:** `dbt test` reports `0 tests found` after adding schema.yml.

### Pitfall 7: beeatlas.duckdb symlink breaks for new worktree

**What goes wrong:** If Phase 84 is executed in a new git worktree, `data/beeatlas.duckdb` may be
the empty 274KB placeholder again (same issue as Phase 83 Plan 03).
**How to avoid:** Check `ls -lh data/beeatlas.duckdb` before running any dbt command. If it's
<1MB, replace with a symlink to the main repo's database.
**Warning signs:** Staging models fail with "schema does not exist".

## Code Examples

### Wave 0: Fix run.sh version pin

```bash
# In data/dbt/run.sh — change both exec lines:
# From:
exec uvx --from dbt-core==1.10.* --with dbt-duckdb==1.10.1 dbt "$@" [--flags]
# To:
exec uvx --from dbt-core==1.10.1 --with dbt-duckdb==1.10.1 dbt "$@" [--flags]
```

### Running dbt generic tests

```bash
# Run all tests (after schema.yml is added):
bash data/dbt/run.sh test

# Run tests on a specific model:
bash data/dbt/run.sh test --select stg_ecdysis__occurrences

# View per-test pass/fail in run_results.json:
uv run --project data python3 -c "
import json
results = json.loads(open('data/dbt/target/run_results.json').read())
for r in results['results']:
    if 'test' in r['unique_id']:
        print(r['unique_id'].split('.')[-1], '->', r['status'])
"
```

### Running partial builds (PART-01)

```bash
# Subgraph 1: all staging and downstream
bash data/dbt/run.sh build --select "staging+"

# Subgraph 2: everything upstream of occurrences mart
bash data/dbt/run.sh build --select "+occurrences"

# Capture parallelism evidence:
uv run --project data python3 -c "
import json
results = json.loads(open('data/dbt/target/run_results.json').read())
thread_ids = sorted(set(r['thread_id'] for r in results['results']))
print('Threads used:', thread_ids)
for r in sorted(results['results'], key=lambda x: x['timing'][0]['started_at']):
    print(r['thread_id'], r['unique_id'].split('.')[-1])
"
```

### Capturing lineage artifact (PART-02)

```bash
bash data/dbt/run.sh ls --resource-type model
# Redirect to a file for findings:
bash data/dbt/run.sh ls --resource-type model > .planning/research/dbt-lineage-listing.txt
```

### Intentional contract drift test (TEST-02)

```python
# In a test script or verification step:
# 1. Add contract to schema.yml (Pattern 2 above)
# 2. Build succeeds (baseline)
# 3. Edit occurrences.sql: rename `county` to `county_name` in final SELECT
# 4. Run:
#    bash data/dbt/run.sh build --select occurrences
# 5. Capture output and exit code:
#    echo "Exit code: $?"
# 6. Revert the rename
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `tests:` key in schema.yml | `data_tests:` key | dbt-core 1.8 | `tests:` still works but is deprecated; use `data_tests:` to avoid future breakage |
| `accepted_values: [list]` syntax | `accepted_values: arguments: values: [list]` | dbt-core 1.10.5+ | Both work; `arguments:` is the current documented form |
| `dbt run` + `dbt test` separately | `dbt build` (runs both) | dbt-core 1.0 | `build` is the standard command; runs models then tests in dependency order |

**Deprecated/outdated:**
- `dbt-core==1.10.*` wildcard in `uvx --from` — resolves to `1.10.20` which has a macro-parser
  regression. Pin to `==1.10.1` exactly until dbt-core 1.10.x fixes the `javascript` KeyError.
- `tests:` key in schema.yml — deprecated in 1.8; use `data_tests:`.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `contract: enforced: true` works with `materialized='external'` in dbt-duckdb 1.10.1 | Pattern 2 (TEST-02), Pitfall 2 | Fall back to enforcing contract on `int_combined` (a real DuckDB table) — satisfies TEST-02 with slightly different learning |
| A2 | `dbt ls` works after the run.sh version pin fix (1.10.1) | Pattern 7 (PART-02) | PART-02 can fall back to `dbt list` (alias) or manual manifest.json inspection |
| A3 | The 84 county-diff rows are stable across dbt build runs (same 84 rows each time, not randomly different rows each run) | Pitfall 4, DIFF-02 root cause | If the 84 rows are different each run, the root cause is more complex (possibly CTE non-determinism beyond just JOIN ordering); investigation required |
| A4 | dbt-core 1.10.20's `javascript` KeyError is specific to the `list({...})` syntax in `emit_feature_collection.sql` and not a project-wide dbt-duckdb incompatibility | Pitfall 1 | If 1.10.1 also fails (unlikely — verified working once), escalate to finding an alternative macro implementation |

## Open Questions

1. **Does `contract: enforced: true` work with `materialized='external'`?**
   - What we know: dbt-duckdb 1.10.1 supports contracts for `table` and `view` materializations per docs
   - What's unclear: external materialization writes to a file, not a DuckDB schema — does dbt inspect the file's schema for contract validation?
   - Recommendation: Test in Wave 1 Task 1; if it fails, enforce contract on `int_combined` instead and document the limitation.

2. **Are the 84 county-diff rows stable across builds?**
   - What we know: One build produced 84 rows; same 84 rows detected by JOIN on ecdysis_id
   - What's unclear: If dbt re-runs `int_combined` (e.g., after `dbt clean`), does the row ordering change, producing different county assignments?
   - Recommendation: Run `dbt clean && dbt build` in Wave 0 and re-check the county diff count. If it's still 84, they're stable. Document in DIFF-02.

3. **What is the exact error message and exit code for a contract violation?**
   - What we know: dbt raises a build error before writing; exit code is non-zero
   - What's unclear: Exact error text, whether it appears in stdout or only `run_results.json`
   - Recommendation: Capture verbatim during TEST-02 intentional-drift experiment.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| `uvx` (uv tool) | run.sh dbt invocation | ✓ | current | — |
| `dbt-core==1.10.1` | run.sh after pin fix | ✓ (verified in isolation) | 1.10.1 | — |
| `dbt-duckdb==1.10.1` | adapter | ✓ | 1.10.1 | — |
| `data/beeatlas.duckdb` (108MB) | all dbt commands | ✓ (via symlink in worktree) | post-Phase-47 | If absent: symlink to main repo's copy |
| `data/dbt/target/sandbox/` (existing outputs) | diff tests | ✓ | from last build | `dbt clean && dbt build` to regenerate |
| `public/data/occurrences.parquet` | diff target | ✓ | 47,883 rows | — |
| `public/data/counties.geojson` | diff target | ✓ | 39 features | — |
| `public/data/ecoregions.geojson` | diff target | ✓ | 66 features | — |
| pytest | diff harness + tests | ✓ | in dev group | — |

**Missing dependencies with no fallback:** None blocking.

**Missing dependencies with fallback:** `dbt-core` version pin regression — fixed by Wave 0 task.

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | pytest (data/pyproject.toml dev group) + dbt test |
| Config file | `data/pyproject.toml` `[tool.pytest.ini_options]` (testpaths = ["tests"]) |
| Quick run command | `bash data/dbt/run.sh test && uv run --project data pytest data/tests/test_dbt_diff.py -x` |
| Full suite command | `bash data/dbt/run.sh build && bash data/dbt/run.sh test && uv run --project data pytest data/tests/ -x` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| TEST-01 | not_null, unique, relationships on slice models | dbt test | `bash data/dbt/run.sh test --select stg_ecdysis__occurrences+` | ❌ Wave 0 (schema.yml needed) |
| TEST-02 | contract enforced on occurrences; intentional drift observed | dbt build | `bash data/dbt/run.sh build --select occurrences` | ❌ Wave 0 (schema.yml + drift experiment) |
| TEST-03 | validate-schema.mjs invariant re-expressed | manual comparison | documented in findings | ❌ Wave 0 (analysis task) |
| DIFF-01 | row count, schema, key-set equality | pytest | `uv run --project data pytest data/tests/test_dbt_diff.py::test_occurrences_row_count_matches -xvs` | ❌ Wave 0 (test_dbt_diff.py needed) |
| DIFF-02 | 84 county-boundary diffs enumerated and root-caused | pytest | `uv run --project data pytest data/tests/test_dbt_diff.py::test_occurrences_county_spatial_diff -xvs` | ❌ Wave 0 |
| DIFF-03 | differences classified in findings | docs | classification table in dbt-spike-findings.md | ❌ Wave 0 (findings extension) |
| PART-01 | two partial builds documented | bash + manual | `bash data/dbt/run.sh build --select "staging+"` | ✅ (dbt already works; just need to capture output) |
| PART-02 | lineage artifact captured | bash + manual | `bash data/dbt/run.sh ls --resource-type model` | ❌ Wave 0 (blocked by 1.10.20 bug) |
| FIND-01 | findings what-worked / what-awkward sections | docs | n/a — manual authoring | ❌ Wave 0 (template seeded) |
| FIND-02 | go/no-go recommendation | docs | n/a | ❌ Wave 0 |
| FIND-03 | prerequisites list | docs | n/a | ❌ Wave 0 |

### Sampling Rate

- **Per task commit:** `bash data/dbt/run.sh build` (exit 0) + relevant pytest test(s) in `-x`
- **Per wave merge:** full `bash data/dbt/run.sh build && bash data/dbt/run.sh test && uv run --project data pytest data/tests/ -x`
- **Phase gate:** All dbt tests green + all pytest diff tests green + findings doc has all To-Do items checked

### Wave 0 Gaps

- [ ] `data/dbt/run.sh` — fix `1.10.*` → `1.10.1` (BLOCKER)
- [ ] `data/dbt/models/staging/schema.yml` — generic tests for TEST-01
- [ ] `data/dbt/models/intermediate/schema.yml` — generic tests for TEST-01
- [ ] `data/dbt/models/marts/schema.yml` — contract for TEST-02
- [ ] `data/tests/test_dbt_diff.py` — diff harness for DIFF-01/02/03
- [ ] `.planning/research/dbt-spike-findings.md` — body sections (extend seeded doc)

No new framework installs needed — pytest, duckdb, and dbt-duckdb are already present.

## Security Domain

Not applicable — local-only spike, no network exposure, no untrusted input. (Same assessment as Phase 83.)

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no | n/a |
| V3 Session Management | no | n/a |
| V4 Access Control | no | n/a |
| V5 Input Validation | no | All inputs are local DuckDB data and committed YAML |
| V6 Cryptography | no | n/a |

## Sources

### Primary (HIGH confidence)
- `data/dbt/target/sandbox/occurrences.parquet` — empirical row count / schema / key-set comparison [VERIFIED: pre-research Python session]
- `public/data/occurrences.parquet` — diff baseline [VERIFIED: pre-research Python session]
- `public/data/counties.geojson`, `public/data/ecoregions.geojson` — diff baseline [VERIFIED: pre-research Python session]
- `data/beeatlas.duckdb` — ST_Within boundary geometry test [VERIFIED: pre-research Python session]
- `data/dbt/run.sh` — confirmed 1.10.20 macro parser failure; confirmed 1.10.1 fix [VERIFIED: pre-research bash session]
- `data/tests/test_dbt_scaffold.py` — existing test pattern [VERIFIED: codebase read]
- `scripts/validate-schema.mjs` — validate-schema.mjs invariant for TEST-03 comparison [VERIFIED: codebase read]
- `.planning/phases/083-scaffold-slice-port/083-01-SUMMARY.md` through `083-04-SUMMARY.md` — Phase 83 execution outcomes [VERIFIED: codebase read]
- `data/dbt/target/run_results.json` — schema and structure [VERIFIED: codebase read]
- [dbt data tests docs](https://docs.getdbt.com/docs/build/data-tests) [CITED: ctx7 fetch, getdbt]
- [dbt model contracts](https://docs.getdbt.com/docs/mesh/govern/model-contracts) [CITED: ctx7 fetch, getdbt]

### Secondary (MEDIUM confidence)
- dbt-core 1.10.20 `KeyError: 'javascript'` — observed directly [VERIFIED: bash test]
- dbt generic test `relationships` syntax requiring `arguments:` in 1.10.5+ [CITED: ctx7 fetch, getdbt]

### Tertiary (LOW confidence)
- Contract enforcement behavior on `external` materialization — inferred from dbt docs, not tested [ASSUMED A1]

## Metadata

**Confidence breakdown:**
- run.sh version pin regression: HIGH (verified empirically)
- Diff baseline (row counts, schema, key-set): HIGH (verified empirically)
- DIFF-02 spatial root cause (boundary nondeterminism): HIGH (ST_Within returns True for both polygons at boundary point — verified)
- TEST-01 test candidates and expected outcomes: HIGH (key cardinalities verified against live DB)
- TEST-02 contract syntax: HIGH (cited from official docs)
- TEST-02 contract behavior on external materialization: LOW (ASSUMED A1)
- PART-01/02 partial run behavior: MEDIUM (pattern well-understood; `dbt ls` blocked until 1.10.1 fix)
- FIND-03 prerequisite framework: MEDIUM (based on spike learnings and project context)

**Research date:** 2026-05-12
**Valid until:** 2026-06-12 (30 days; dbt-duckdb adapter evolves ~monthly)
