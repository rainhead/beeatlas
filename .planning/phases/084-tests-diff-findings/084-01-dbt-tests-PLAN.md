---
phase: 084
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - data/dbt/models/staging/schema.yml
  - data/dbt/models/intermediate/schema.yml
  - data/dbt/models/marts/schema.yml
  - data/dbt/models/marts/occurrences.sql
  - .planning/phases/084-tests-diff-findings/084-TEST-FINDINGS.md
autonomous: true
requirements: [TEST-01, TEST-02, TEST-03]
must_haves:
  truths:
    - "`bash data/dbt/run.sh test` runs at least 3 classes of generic tests on slice models (not_null, unique, relationships) and writes per-test status to target/run_results.json"
    - "`bash data/dbt/run.sh build --select occurrences` enforces a model contract that pins both column names AND DuckDB types on the occurrences mart (or on int_combined if A1 falls through)"
    - "An intentional column rename in occurrences.sql causes `dbt build` to exit non-zero with a captured error message; reverting restores green build"
    - "A side-by-side comparison of validate-schema.mjs vs the dbt contract for the same invariant is recorded in 084-TEST-FINDINGS.md"
    - "The expected-fail unique test on stg_inat__observations.id is recorded as an awkward-fit finding (the test fails and that failure is the documented outcome)"
  artifacts:
    - path: "data/dbt/models/staging/schema.yml"
      provides: "Generic tests (not_null, unique) on stg_ecdysis__occurrences.catalog_number, stg_waba__observations.id, stg_inat__observations.id"
      contains: "version: 2"
    - path: "data/dbt/models/intermediate/schema.yml"
      provides: "Generic tests on int_id_modified.coreid (not_null+unique) and int_combined.is_provisional (not_null); a relationships test on int_ecdysis_base.ecdysis_id"
      contains: "version: 2"
    - path: "data/dbt/models/marts/schema.yml"
      provides: "TEST-02 contract block on occurrences (or int_combined per A1 fallback) with 33 (name, data_type) entries"
      contains: "contract:"
    - path: ".planning/phases/084-tests-diff-findings/084-TEST-FINDINGS.md"
      provides: "TEST-01/02/03 per-test outcomes plus validate-schema.mjs comparison; consumed by Plan 03 when consolidating into dbt-spike-findings.md"
      contains: "## TEST-01"
  key_links:
    - from: "data/dbt/models/staging/schema.yml"
      to: "data/dbt/target/run_results.json"
      via: "`bash data/dbt/run.sh test` populates run_results.json with one entry per data_test"
      pattern: "status.*(pass|fail|error)"
    - from: "data/dbt/models/marts/schema.yml"
      to: "data/dbt/models/marts/occurrences.sql"
      via: "Contract enforced: true gates the model's SELECT against the declared columns block"
      pattern: "contract:\\s*\\n\\s*enforced:\\s*true"
---

<objective>
Author the dbt test surface for the v3.3 slice: three classes of generic tests (TEST-01) on staging
and intermediate models, a model contract (TEST-02) on the occurrences mart with an intentional
column-rename drift demonstration, and a recorded comparison (TEST-03) of the dbt contract against
the existing `scripts/validate-schema.mjs` invariant for `occurrences.parquet`.

Purpose: Empirically exercise dbt's testing and contract surface on the spike slice so that Plan 03
can fold the per-test outcomes into the go/no-go findings. Every result — pass, fail, or
awkward-fit — is recorded; failures are the point, not a regression.

Output: schema.yml files in `data/dbt/models/{staging,intermediate,marts}/`, an enforced contract
on the chosen mart, a captured drift error message, and a `084-TEST-FINDINGS.md` scratch document
that Plan 03 will consolidate into `.planning/research/dbt-spike-findings.md`.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@.planning/ROADMAP.md
@.planning/REQUIREMENTS.md
@.planning/phases/084-tests-diff-findings/084-RESEARCH.md
@.planning/phases/084-tests-diff-findings/084-VALIDATION.md
@.planning/phases/083-scaffold-slice-port/083-CONTEXT.md
@.planning/research/dbt-spike-findings.md
@data/dbt/run.sh
@data/dbt/models/marts/occurrences.sql
@data/dbt/models/intermediate/int_combined.sql
@scripts/validate-schema.mjs
@./CLAUDE.md

<interfaces>
<!-- Key facts the executor needs without re-deriving them from source. -->

## Column inventory for the contract (TEST-02)
The full 33-column (name, data_type) list for `occurrences` is enumerated in 084-RESEARCH.md
§Pattern 2 — copy verbatim. The same 33 names appear in `scripts/validate-schema.mjs` EXPECTED
list (line 23-42) — use that as the cross-check.

## Verified test cardinalities (from 084-RESEARCH.md §Pattern 1)
- `stg_ecdysis__occurrences.catalog_number` — 46,090 distinct / 46,090 rows → `unique` PASS expected
- `stg_waba__observations.id` — 1,408 distinct / 1,408 rows → `unique` PASS expected
- `stg_inat__observations.id` — 10,845 distinct / 10,846 rows → `unique` **FAIL** expected (awkward-fit)
- `int_id_modified.coreid` — 46,090 distinct / 46,090 rows → `unique` PASS expected
- `int_ecdysis_base.ecdysis_id → stg_ecdysis__occurrences.catalog_number` — INTEGER vs VARCHAR → `relationships` **ERROR** expected (BinderError); record as awkward-fit type mismatch

## dbt YAML conventions
- Every schema.yml must start with `version: 2` — silent parse failure otherwise (Pitfall 6)
- Use `data_tests:` not `tests:` (deprecated in 1.8; current syntax)
- Generic test invocations: bare names (`- not_null`, `- unique`) or namespaced
  (`- relationships:\n    to: ref('stg_x')\n    field: y`)

## Contract syntax (TEST-02)
The contract block lives inside `config:` at the model level in schema.yml; columns block requires
both `name` and `data_type` (DuckDB types: integer, bigint, double, varchar, boolean).

## Open Question A1 (verify Wave 1 Task 1)
Whether `contract: enforced: true` works with `materialized='external'` (the current occurrences
materialization). If it errors with "Cannot determine schema for external materialization" or
similar, fall back to declaring the contract on `int_combined` (a real DuckDB table per Phase 83
Plan 03 SUMMARY). Either path satisfies TEST-02; record the chosen path in 084-TEST-FINDINGS.md.

## Findings scratch file (consumed by Plan 03)
Plan 03 will read `.planning/phases/084-tests-diff-findings/084-TEST-FINDINGS.md` and merge
its sections into `.planning/research/dbt-spike-findings.md`. This plan MUST NOT write to
`dbt-spike-findings.md` directly (avoids merge conflict with Plan 02 which runs in parallel).
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Author generic-test schema.yml files for TEST-01</name>
  <files>data/dbt/models/staging/schema.yml, data/dbt/models/intermediate/schema.yml, data/dbt/models/marts/schema.yml</files>
  <read_first>
    - 084-RESEARCH.md §Pattern 1 (lines 174-251) for the verified test candidates and expected outcomes
    - data/dbt/models/staging/stg_ecdysis__occurrences.sql, stg_waba__observations.sql, stg_inat__observations.sql (column names referenced by the tests)
    - data/dbt/models/intermediate/int_id_modified.sql, int_combined.sql, int_ecdysis_base.sql (column names referenced by tests)
    - 084-RESEARCH.md §Pitfall 6 (silent parse failure if `version: 2` is missing)
    - 084-RESEARCH.md §Pitfall 3 (relationships test type mismatch behavior)
  </read_first>
  <action>
Create three schema.yml files. All three MUST begin with `version: 2` as the first non-comment line.

`data/dbt/models/staging/schema.yml`: a top-level `models:` list with one entry per tested
staging model. Add `data_tests: [not_null, unique]` to `stg_ecdysis__occurrences.catalog_number`
(expected PASS), `stg_waba__observations.id` (expected PASS), and `stg_inat__observations.id`
(expected FAIL — this is the documented awkward-fit per TEST-01; include a `description:` field
on the id column noting the expected failure so a future reader understands the intent).

`data/dbt/models/intermediate/schema.yml`: model entries for `int_id_modified` (`data_tests:
[not_null, unique]` on `coreid`, both expected PASS), `int_combined` (`data_tests: [not_null]`
on `is_provisional`, expected PASS), and `int_ecdysis_base` with a `relationships` test on
`ecdysis_id` pointing `to: ref('stg_ecdysis__occurrences')` and `field: catalog_number`
(expected ERROR due to INTEGER vs VARCHAR type mismatch — leave it as written; the error IS the
TEST-01 finding for awkward-fit relationship checks).

`data/dbt/models/marts/schema.yml`: empty `models:` list with `version: 2` for now — Task 2 fills
in the contract. Use `data_tests:` not the deprecated `tests:` key throughout.

Do not modify any .sql model. Do not run `dbt test` yet — Task 2 runs the full test suite once
the marts contract is in place.
  </action>
  <verify>
    <automated>bash data/dbt/run.sh parse 2>&1 | tee /tmp/084-01-parse.log; grep -E "(Encountered an error|Compilation Error|silent)" /tmp/084-01-parse.log; ! grep -E "(Encountered an error|Compilation Error)" /tmp/084-01-parse.log</automated>
  </verify>
  <acceptance_criteria>
    - All three schema.yml files exist and begin with `version: 2`
    - `bash data/dbt/run.sh parse` exits 0 (silent-parse-failure guard: see Pitfall 6)
    - `bash data/dbt/run.sh ls --resource-type test 2>&1 | grep -v '^#' | wc -l` returns >= 5 (3 unique/not_null + 1 relationships + 1 not_null on is_provisional, minimum)
    - `grep -c '^version: 2' data/dbt/models/staging/schema.yml data/dbt/models/intermediate/schema.yml data/dbt/models/marts/schema.yml` returns 3
    - No `tests:` key (deprecated) appears in any schema.yml; only `data_tests:`
  </acceptance_criteria>
  <done>
Three schema.yml files written with version: 2 + data_tests blocks; `dbt parse` succeeds;
`dbt ls --resource-type test` enumerates at least 5 generic tests across the layers.
  </done>
</task>

<task type="auto">
  <name>Task 2: Add contract to occurrences mart (TEST-02) and run full test suite</name>
  <files>data/dbt/models/marts/schema.yml, data/dbt/models/intermediate/schema.yml, .planning/phases/084-tests-diff-findings/084-TEST-FINDINGS.md</files>
  <read_first>
    - 084-RESEARCH.md §Pattern 2 (lines 254-337) for the verbatim 33-column contract block
    - 084-RESEARCH.md §Pitfall 2 (A1 risk: contract on external materialization may not work; fallback to int_combined)
    - scripts/validate-schema.mjs lines 23-42 for the canonical 33-column name list (cross-check)
    - data/dbt/models/marts/occurrences.sql (the SELECT projection that the contract must agree with)
    - data/dbt/models/intermediate/int_combined.sql (fallback contract target if A1 fails)
  </read_first>
  <action>
Edit `data/dbt/models/marts/schema.yml` to add a model entry for `occurrences` with the contract
block from RESEARCH §Pattern 2 — 33 `(name, data_type)` entries matching the model's final
SELECT and the validate-schema.mjs EXPECTED list. Set `config: contract: enforced: true`.

Run `bash data/dbt/run.sh build --select occurrences`. Two outcomes are valid:

A. Build succeeds → A1 confirmed; contract works on `materialized='external'`. Record outcome
in 084-TEST-FINDINGS.md §TEST-02 with the green-build stdout/exit-code captured.

B. Build fails with a "contract not supported on external materialization" (or similar) error →
A1 falsified. Move the contract block to `int_combined` in
`data/dbt/models/intermediate/schema.yml` instead (same 33-column shape, since int_combined is
the upstream of occurrences and carries the same projection). Re-run `dbt build --select
int_combined`; this MUST succeed. Record the A1 fallback outcome verbatim in
084-TEST-FINDINGS.md §TEST-02.

After whichever path succeeds, run the full test suite once: `bash data/dbt/run.sh test`.
Capture per-test status from `data/dbt/target/run_results.json` (test entries only) into
084-TEST-FINDINGS.md §TEST-01 as a markdown table: test_name | model | status | row_count |
classification (pass / fail / error → awkward-fit). The 1 duplicate inat id and the
relationships type-mismatch ERROR are pre-classified awkward-fits — record them as such, do
NOT remove them from schema.yml.

Do NOT commit `target/run_results.json` (gitignored). Quote test rows verbatim in the findings
scratch file.
  </action>
  <verify>
    <automated>bash data/dbt/run.sh build --select occurrences int_combined 2>&1 | tee /tmp/084-01-build.log; grep -E "(PASS|ERROR=0|Done\.)" /tmp/084-01-build.log; bash data/dbt/run.sh test 2>&1 | tee /tmp/084-01-test.log; uv run --project data python3 -c "import json; r=json.loads(open('data/dbt/target/run_results.json').read()); tests=[x for x in r['results'] if 'test' in x['unique_id']]; assert len(tests) >= 5, f'expected >=5 tests, got {len(tests)}'; print('test count:', len(tests))"</automated>
  </verify>
  <acceptance_criteria>
    - `data/dbt/models/marts/schema.yml` OR `data/dbt/models/intermediate/schema.yml` contains `contract:\n      enforced: true` and at least 30 `name:`/`data_type:` pairs (count via `grep -c 'data_type:'` on the chosen file ≥ 30)
    - `bash data/dbt/run.sh build --select <contract-target>` exits 0
    - `bash data/dbt/run.sh test` runs and writes target/run_results.json with at least 5 test entries
    - 084-TEST-FINDINGS.md §TEST-01 contains a markdown table with one row per generic test executed, including verbatim status from run_results.json
    - 084-TEST-FINDINGS.md §TEST-02 records the chosen contract target and whether A1 held (occurrences) or fell back (int_combined)
    - Neither `target/run_results.json` nor `target/manifest.json` is staged for commit (`git check-ignore` agrees with .gitignore)
  </acceptance_criteria>
  <done>
Contract on the chosen mart/intermediate is enforced; `dbt build` exits 0; `dbt test` produces
results captured verbatim in 084-TEST-FINDINGS.md; A1 outcome recorded.
  </done>
</task>

<task type="auto">
  <name>Task 3: TEST-02 drift demo + TEST-03 validate-schema comparison</name>
  <files>data/dbt/models/marts/occurrences.sql (drift edit, reverted), data/dbt/models/intermediate/int_combined.sql (fallback drift edit, reverted), .planning/phases/084-tests-diff-findings/084-TEST-FINDINGS.md</files>
  <read_first>
    - 084-RESEARCH.md §Pattern 2 "Intentional-drift test procedure" (lines 339-349)
    - 084-RESEARCH.md §Pattern 3 (TEST-03 re-expression framework, lines 351-385)
    - data/dbt/models/marts/occurrences.sql — locate the final SELECT's `county` column reference
    - scripts/validate-schema.mjs lines 14-91 — for the validate-schema.mjs side of the TEST-03 comparison
  </read_first>
  <action>
Perform the intentional drift experiment for TEST-02:

1. On a temporary worktree state (NOT committed to main), edit the contract target's source SQL
   to rename one declared column. If the contract is on `occurrences`, edit
   `data/dbt/models/marts/occurrences.sql` and rename `county` to `county_renamed` in the final
   SELECT (and only there; do NOT propagate the rename to upstream models or to the contract).
   If the contract is on `int_combined`, edit `data/dbt/models/intermediate/int_combined.sql`
   to rename any one column referenced in the contract.
2. Run `bash data/dbt/run.sh build --select <contract-target> 2>&1 | tee /tmp/084-drift.log`.
   The build MUST exit non-zero. Capture the exact error message text (the
   `ContractBreakingChangeError` or analogous dbt-duckdb error) from the log.
3. Revert the rename via `git checkout -- <edited-file>`. Re-run `bash data/dbt/run.sh build
   --select <contract-target>`; this MUST exit 0.
4. Append a §TEST-02 Drift Demonstration subsection to `084-TEST-FINDINGS.md` containing:
   exit code from step 2, the verbatim error message (fenced bash block), confirmation that
   step 3 returned the build to green.

Then write the TEST-03 comparison to `084-TEST-FINDINGS.md` §TEST-03 using the framework from
RESEARCH §Pattern 3:
- Invariant under comparison: "occurrences.parquet must have these 33 column names"
- Two-column comparison table: validate-schema.mjs (cite specific lines 23-42 of the file, note
  it is type-blind and runs post-export) vs dbt contract (cite the chosen schema.yml file, note
  it is type-aware and gates pre-build).
- Verdict sentence: which one expresses the invariant more clearly, and which one is broader in
  scope (e.g., production deploy gate vs. build-time gate).

This task is documentation-heavy. No source-code commit beyond the revert. Do not modify
scripts/validate-schema.mjs (out of scope per spike discipline).
  </action>
  <verify>
    <automated>test -f .planning/phases/084-tests-diff-findings/084-TEST-FINDINGS.md && grep -q '^## TEST-01' .planning/phases/084-tests-diff-findings/084-TEST-FINDINGS.md && grep -q '^## TEST-02' .planning/phases/084-tests-diff-findings/084-TEST-FINDINGS.md && grep -q 'Drift' .planning/phases/084-tests-diff-findings/084-TEST-FINDINGS.md && grep -q '^## TEST-03' .planning/phases/084-tests-diff-findings/084-TEST-FINDINGS.md && grep -q 'validate-schema' .planning/phases/084-tests-diff-findings/084-TEST-FINDINGS.md && bash data/dbt/run.sh build --select occurrences int_combined 2>&1 | grep -E '(PASS|Done\.|ERROR=0)'</automated>
  </verify>
  <acceptance_criteria>
    - 084-TEST-FINDINGS.md has H2 sections `## TEST-01`, `## TEST-02`, `## TEST-02 Drift Demonstration` (or subsection of TEST-02), and `## TEST-03`
    - §TEST-02 Drift Demonstration contains a non-zero exit code AND a verbatim error block from the drifted build
    - After Task 3 completes, `git status data/dbt/models/marts/occurrences.sql data/dbt/models/intermediate/int_combined.sql` shows no unstaged changes (revert was clean)
    - Post-revert `bash data/dbt/run.sh build` exits 0 (proves the experiment was reversible)
    - §TEST-03 contains side-by-side comparison citing both `scripts/validate-schema.mjs` and the chosen `schema.yml` file by path, with a verdict sentence
    - `scripts/validate-schema.mjs` is unmodified (`git diff scripts/validate-schema.mjs` is empty — spike discipline guard)
  </acceptance_criteria>
  <done>
Drift exit code + error captured; baseline restored to green; TEST-03 comparison written.
084-TEST-FINDINGS.md complete with all three TEST sections; ready for Plan 03 consolidation.
  </done>
</task>

</tasks>

<threat_model>
applies: false
justification: Local-only spike — no auth, network, or untrusted input. dbt and pytest run
against local files in `data/beeatlas.duckdb`, `data/dbt/`, and the project tree. No production
surface touched per v3.3 scope discipline.
</threat_model>

<verification>
After all three tasks: a final `bash data/dbt/run.sh build && bash data/dbt/run.sh test` must
exit 0 (build green, tests run — some will fail per the awkward-fit design, but that is the
documented outcome captured in run_results.json). The three schema.yml files are committed; the
findings scratch file `084-TEST-FINDINGS.md` is committed; the contract target SQL files are
unmodified relative to main (drift was reverted).
</verification>

<success_criteria>
- TEST-01: At least three generic-test classes (not_null, unique, relationships) attempted; per-test status recorded verbatim in 084-TEST-FINDINGS.md §TEST-01
- TEST-02: Contract enforced on occurrences (A1 confirmed) or int_combined (A1 fallback); drift experiment produces non-zero exit + captured error message; baseline restored
- TEST-03: validate-schema.mjs vs dbt contract comparison written with verdict sentence
- No production-surface file modified (`scripts/validate-schema.mjs`, `data/run.py`, `data/nightly.sh`, `public/data/` are unchanged)
- `bash data/dbt/run.sh build` exits 0; `bash data/dbt/run.sh test` runs and produces run_results.json
</success_criteria>

<output>
After completion, create `.planning/phases/084-tests-diff-findings/084-01-SUMMARY.md`.
</output>
