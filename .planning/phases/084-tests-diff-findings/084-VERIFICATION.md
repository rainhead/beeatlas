---
phase: 084-tests-diff-findings
verified: 2026-05-13T23:00:00Z
status: human_needed
score: 4/5 must-haves verified
overrides_applied: 0
re_verification: false
human_verification:
  - test: "Confirm the stale comment in data/dbt/models/staging/schema.yml (lines 23–26) is acceptable as-is or should be corrected before the findings are considered final"
    expected: "Either the comment is updated to reflect the actual outcome (not_null failed due to 1 NULL id, unique passed) or the team accepts the stale pre-research prediction comment"
    why_human: "The comment says 'Expected to FAIL the unique test — one duplicate inat observation_id exists' but the actual test result was not_null FAILED (1 NULL id) and unique PASSED. The comment is factually wrong about which test fails and why, but this is a spike artifact not production code. Human must decide whether to accept the stale comment or require correction."
  - test: "Confirm SC2/DIFF-01 partial coverage on inat key-set is acceptable"
    expected: "Either accept that row-count + ecdysis anti-join provides sufficient indirect coverage, or require a host_observation_id anti-join test to be added to test_dbt_diff.py"
    why_human: "SC2 and DIFF-01 both explicitly require 'key-set equality on ecdysis_id / inat:<id>'. The test harness tests ecdysis_id thoroughly (count + full anti-join both ways) but has no explicit test for inat host_observation_id key-set equality. The indirect evidence is strong (row count equal + ecdysis key set equal implies sample rows match in count) but the literal requirement calls for direct inat key-set assertion."
---

# Phase 084: Tests, Diff & Findings Verification Report

**Phase Goal:** The spike's learning outcomes are captured — dbt's test/contract surface is exercised, sandbox outputs are diffed against `export.py`, partial-run behavior is documented, and a go/no-go recommendation is written grounded in evidence.

**Verified:** 2026-05-13T23:00:00Z
**Status:** human_needed
**Re-verification:** No — initial verification

---

## Goal Achievement

### Observable Truths (Success Criteria)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| SC1 | Three dbt generic-test classes attempted (`not_null`, `unique`, `relationships`) with per-test results recorded; at least one contract enforced with drift behavior documented | VERIFIED | `staging/schema.yml`: 6 generic tests (not_null + unique on 3 models). `intermediate/schema.yml`: not_null + unique on coreid, not_null on is_provisional, relationships on ecdysis_id. `marts/schema.yml`: 33-column contract with `enforced: true`. TEST-FINDINGS.md records 8 PASS / 1 FAIL / 1 ERROR with per-test awkward-fit analysis. Drift demo documented with verbatim compiler output showing `county` / `county_renamed` mismatch table. |
| SC2 | Reproducible diff script covers row counts, schema, and key-set equality on `ecdysis_id` / `inat:<id>`; spatial-join discrepancies enumerated and root-caused | PARTIAL | `data/tests/test_dbt_diff.py` has 9 test functions: row count (47,883 equal), schema (33 cols, names+types identical via DESCRIBE), ecdysis_id count + full anti-join both ways (0 rows). County diff: 84 rows across 4 boundary pairs root-caused as ST_Within nondeterminism in both implementations. Ecoregion diff: 0 rows. GeoJSON: feature counts + property names identical. **Gap:** No explicit test for `inat:<id>` (`host_observation_id`) key-set equality. DIFF-01 and SC2 both name this explicitly. The inat sample rows are constrained indirectly (row count 47,883 equal; 46,090 ecdysis → 1,793 sample rows in both) but no anti-join verifies the inat host_observation_id set is identical. |
| SC3 | Every material output difference classified as: schema-design improvement, latent bug uncovered, semantic divergence to investigate, or neutral/cosmetic | VERIFIED | DIFF-03 table in `084-DIFF-FINDINGS.md` and `dbt-spike-findings.md` §DIFF-03: GeoJSON whitespace formatting → neutral/cosmetic (DuckDB FORMAT CSV vs Python json.dumps). 84 county boundary rows → semantic divergence to investigate (ST_Within nondeterminism in both implementations). All other dimensions are identical (row count, schema, ecdysis_id, ecoregion_l3, GeoJSON feature counts and property names). All material differences are classified; no unclassified rows. |
| SC4 | `dbt run --select` exercised on at least two subgraphs; parallelism (or absence) documented; lineage artifact captured and referenced from findings | VERIFIED | Two subgraphs exercised: `staging+` (23 models, 19 built, 4 skipped by test propagation, Thread-1 through Thread-4 used) and `+occurrences` (21 models, Thread-1 through Thread-4 used). Parallelism correctly characterized: 4 threads used for DAG scheduling but DuckDB serializes execution on shared in-process connection. Lineage artifact: `084-lineage-listing.txt` (23 lines, beeatlas.staging/intermediate/marts format), referenced from findings §PART-02. |
| SC5 | `dbt-spike-findings.md` ends with concrete go/no-go/go-with-conditions recommendation and explicit prerequisites list covering all 5 required areas | VERIFIED | `dbt-spike-findings.md` line 332: `## Verdict` → `GO-WITH-CONDITIONS` with 4 evidence citations (§TEST-02 contract maturity, §DIFF-02 boundary nondeterminism, §FORMAT CSV fragility, §samples.parquet schema decision). Lines 350–392: `## Prerequisites for a Full-Rewrite Milestone (v3.4+)` → 5 subsections: `### Test coverage`, `### Schema decisions`, `### Ingestion-vs-transform boundaries`, `### Parallel-run / orchestration story`, `### DuckDB-WASM frontend impact`. Each begins with "Before cutover" and contains BeeAtlas-specific bullets. All 5 required areas satisfied. |

**Score:** 4/5 truths verified (SC2 PARTIAL; 4 fully VERIFIED, 1 PARTIAL)

---

### Required Artifacts

| Artifact | Status | Details |
|----------|--------|---------|
| `data/dbt/models/staging/schema.yml` | VERIFIED | Present (1,023 bytes). Contains not_null + unique on stg_ecdysis__occurrences.catalog_number, stg_waba__observations.id, stg_inat__observations.id. Substantive (all 3 test classes declared). |
| `data/dbt/models/intermediate/schema.yml` | VERIFIED | Present (958 bytes). Contains not_null + unique on int_id_modified.coreid, not_null on int_combined.is_provisional, relationships on int_ecdysis_base.ecdysis_id. |
| `data/dbt/models/marts/schema.yml` | VERIFIED | Present (1,890 bytes). Contains 33-column contract with DuckDB types and `config: contract: enforced: true`. Column count confirmed: `grep -c 'data_type:' = 33`. |
| `data/tests/test_dbt_diff.py` | VERIFIED | Present (9,993 bytes). 9 test functions (10 pytest items with parametrize). Substantive: real DuckDB queries via f-string SQL against actual parquet/GeoJSON files. Wired: skip guard references actual sandbox path, not a stub. |
| `.planning/phases/084-tests-diff-findings/084-TEST-FINDINGS.md` | VERIFIED | Present (8,745 bytes). All four sections complete: TEST-01 (results table + two awkward-fit write-ups), TEST-02 (A1 result + verbatim build output), TEST-02 Drift Demonstration (verbatim compiler error + mismatch table), TEST-03 (side-by-side comparison table). |
| `.planning/phases/084-tests-diff-findings/084-DIFF-FINDINGS.md` | VERIFIED | Present (7,776 bytes). All three sections complete: DIFF-01 (verbatim pytest output, 10 PASS), DIFF-02 (84-row boundary table + sample rows + root cause), DIFF-03 (8-row classification table). |
| `.planning/phases/084-tests-diff-findings/084-lineage-listing.txt` | VERIFIED | Present (888 bytes). 23 lines: 3 marts, 9 intermediate, 11 staging models in `beeatlas.<layer>.<name>` format. Referenced from findings §PART-02. |
| `.planning/research/dbt-spike-findings.md` | VERIFIED | Present (34,212 bytes, 392 lines). Contains all required sections: TEST-01 through TEST-03, DIFF-01 through DIFF-03, PART-01 through PART-02, FIND-01 sections (What Worked Well / What Was Awkward / More Clearly / Less Clearly / samples.parquet Discrepancy), FIND-02 Verdict (GO-WITH-CONDITIONS), FIND-03 Prerequisites (5 subsections). |

---

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `084-TEST-FINDINGS.md` | `dbt-spike-findings.md` | Plan 03 consolidation | WIRED | TEST-01, TEST-02, TEST-03 sections verbatim in findings doc (lines 39–127) |
| `084-DIFF-FINDINGS.md` | `dbt-spike-findings.md` | Plan 03 consolidation | WIRED | DIFF-01, DIFF-02, DIFF-03 sections in findings doc (lines 128–197) |
| `084-lineage-listing.txt` | `dbt-spike-findings.md` | Referenced §PART-02 | WIRED | Line 260: "committed to `.planning/phases/084-tests-diff-findings/084-lineage-listing.txt`" with embedded 23-model list |
| `data/tests/test_dbt_diff.py` | `data/dbt/target/sandbox/occurrences.parquet` | `SANDBOX` path constant | WIRED | Path constant defined at line 23; `_SANDBOX_GUARD` skipif references it; all 6 sandbox-dependent tests use it |
| `marts/schema.yml` contract | `data/dbt/models/marts/occurrences.sql` | dbt contract enforcement | WIRED | `occurrences.sql` line 13 uses `materialized='external'`; `schema.yml` declares `config: contract: enforced: true` for the `occurrences` model |

---

### Data-Flow Trace (Level 4)

Not applicable — this is a spike/findings phase. No frontend-wired components render dynamic data from these artifacts. The `test_dbt_diff.py` file reads real parquet files via DuckDB queries (not stub returns), confirmed by the substantive SQL in all 9 test functions.

---

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| test_dbt_diff.py is syntactically valid Python | `python3 -c "import ast; ast.parse(open('/Users/rainhead/dev/beeatlas/data/tests/test_dbt_diff.py').read())"` | No output (parse success) | PASS |
| All 3 generic test classes present in schema files | grep counts: not_null=5, unique=7, relationships=1 | All 3 classes confirmed present | PASS |
| Contract is enforced on occurrences | `grep 'enforced: true' data/dbt/models/marts/schema.yml` | Line found | PASS |
| Lineage listing has 23 lines (3 layers) | `wc -l 084-lineage-listing.txt` | 23 lines; 11 staging + 9 intermediate + 3 marts | PASS |
| Verdict section exists in findings | `grep '## Verdict' dbt-spike-findings.md` | Line 332 | PASS |
| All 5 prerequisite subsections exist | `grep '### ' dbt-spike-findings.md` | Test coverage, Schema decisions, Ingestion-vs-transform boundaries, Parallel-run / orchestration story, DuckDB-WASM frontend impact | PASS |

---

### Probe Execution

Step 7c: SKIPPED — this is a documentation/findings phase. No `scripts/*/tests/probe-*.sh` files are declared in the plan or exist for this phase. The primary verifiable artifacts are Markdown findings documents and the `test_dbt_diff.py` harness (which requires a live DuckDB sandbox at `data/dbt/target/sandbox/` to run meaningfully and cannot be run without first executing `bash data/dbt/run.sh build`).

---

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|-------------|--------|----------|
| TEST-01 | Plan 01 | At least three generic test classes (`not_null`, `unique`, `relationships`) attempted; per-test results recorded | SATISFIED | All 3 classes in schema.yml files; 10-row results table with pass/fail/error in TEST-FINDINGS.md and findings doc |
| TEST-02 | Plan 01 | Model contract declared and enforced on ≥1 output model; drift behavior observed and documented | SATISFIED | 33-column contract with `enforced: true` on `occurrences` mart; drift demo with verbatim Compilation Error output in TEST-FINDINGS.md |
| TEST-03 | Plan 01 | At least one validate-schema.mjs / _apply_migrations invariant re-expressed as dbt test or contract; comparison recorded | SATISFIED | Side-by-side comparison table in TEST-FINDINGS.md §TEST-03 and findings doc §TEST-03 |
| DIFF-01 | Plan 02 | Reproducible diff script: row counts, column schema, key-set equality on `ecdysis_id` / `inat:<id>` | PARTIAL | Row count + schema + ecdysis_id anti-join: all present and green. **Missing:** explicit `host_observation_id` (inat sample) key-set anti-join |
| DIFF-02 | Plan 02 | Spatial-join discrepancies (county/ecoregion_l3) enumerated and root-caused | SATISFIED | 84-row county divergence: 4 boundary pairs identified, ST_Within root cause documented. 0-row ecoregion divergence confirmed |
| DIFF-03 | Plan 02 | Every material output difference classified into one of 4 buckets | SATISFIED | DIFF-03 table: 2 non-identical outputs classified (GeoJSON whitespace = neutral/cosmetic; 84 county rows = semantic divergence to investigate). No unclassified material differences |
| PART-01 | Plan 03 | `dbt run --select` exercised on ≥2 subgraphs; parallelism documented | SATISFIED | `staging+` (23 models) and `+occurrences` (21 models) both exercised; Thread-1..4 evidence in findings §PART-01 |
| PART-02 | Plan 03 | Lineage artifact captured and referenced from findings | SATISFIED | `084-lineage-listing.txt` (23 models, 3 layers); referenced at findings §PART-02 |
| FIND-01 | Plan 03 | Findings doc has: what worked well, what was awkward, more clearly, less clearly sections | SATISFIED | All 4 sections present at lines 294, 303, 312, 319 of findings doc |
| FIND-02 | Plan 03 | Concrete go/no-go/go-with-conditions recommendation grounded in diff and test results | SATISFIED | `## Verdict` at line 332: GO-WITH-CONDITIONS with 4 evidence citations traceable to diff and test sections |
| FIND-03 | Plan 03 | Prerequisites list covering 5 specific areas | SATISFIED | `## Prerequisites` at line 350 with all 5 required subsections present |

**Requirements satisfied:** 10/11 (DIFF-01 PARTIAL)

---

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `data/dbt/models/staging/schema.yml` | 23–26 | Stale pre-research prediction comment: says "Expected to FAIL the unique test — one duplicate inat observation_id exists" but actual outcome was not_null FAILED (1 NULL id), unique PASSED | WARNING | Comment is factually incorrect about which test fails and why. Anyone reading schema.yml gets the wrong mental model. The code behavior is correct (not_null test does fail), only the explanation is wrong. No formal debt marker (TBD/FIXME/XXX). Spike artifact; not blocking correctness. |

No `TBD`, `FIXME`, or `XXX` markers found in any phase-modified files.

---

### Human Verification Required

#### 1. Accept or correct stale schema.yml comment

**Test:** Read `data/dbt/models/staging/schema.yml` lines 23–26. The description says "Expected to FAIL the unique test — 10,845 distinct values vs 10,846 rows (one duplicate inat observation_id exists)." Compare against the actual test outcome documented in `084-TEST-FINDINGS.md` §TEST-01: the `unique` test PASSED; the `not_null` test FAILED due to 1 NULL id (not a duplicate).

**Expected:** Either the comment is updated to say "not_null FAILS (1 NULL id); unique PASSES (NULL is not counted as a duplicate in SQL DISTINCT)" — or the team explicitly accepts the stale comment as a spike artifact that will be corrected in the v3.4+ rewrite.

**Why human:** This is a quality/acceptance call on spike documentation. The tests themselves are correct; only the inline description is misleading. The verifier cannot determine whether the team's tolerance for stale comments in spike code is high or low.

#### 2. Accept or require inat key-set test in diff harness

**Test:** Review `data/tests/test_dbt_diff.py`. Confirm that `test_occurrences_ecdysis_key_set_matches` and `test_occurrences_ecdysis_id_join_full` exist and cover ecdysis_id thoroughly. Confirm there is NO corresponding `host_observation_id` anti-join test for inat sample rows.

**Expected:** Either the team accepts the indirect coverage (row count equality + ecdysis anti-join arithmetically constrains inat rows) as sufficient for a spike, or they require adding a `test_occurrences_inat_key_set_matches` function with a `host_observation_id` anti-join before considering DIFF-01 and SC2 fully satisfied.

**Why human:** Both DIFF-01 (REQUIREMENTS.md) and SC2 (ROADMAP.md) explicitly say "key-set equality on ecdysis_id / inat:<id>". Whether indirect arithmetic reasoning satisfies an explicit requirement is a judgment call — the literal text of the success criterion was not met, but the practical evidence is strong.

---

### Gaps Summary

No hard BLOCKER gaps were found. The phase goal is substantially achieved:

- All 7 required artifacts exist on disk with substantive content (not stubs)
- All 11 requirements are mapped to evidence; 10/11 are fully satisfied
- The verdict is concrete and grounded in evidence from the diff and test sections
- The prerequisites list covers all 5 required areas with BeeAtlas-specific bullets
- All documented commits are present in git history (5ba7023, 43c78fd, 202cb76, 1a98239, a54d5ad, 3f9d00e, c5d8ce2)

The two human-verification items are quality/acceptance calls, not missing deliverables:

1. A stale comment in `staging/schema.yml` describes the wrong test class failing, which is misleading but does not affect the correctness of the code or the validity of the findings.
2. The `inat:<id>` key-set is not directly tested in `test_dbt_diff.py`. This is a partial miss against the explicit wording of DIFF-01 and SC2. The indirect evidence is strong but the literal requirement was for a direct assertion.

---

_Verified: 2026-05-13T23:00:00Z_
_Verifier: Claude (gsd-verifier)_
