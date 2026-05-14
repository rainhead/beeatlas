---
phase: 084
plan: 03
type: execute
wave: 2
depends_on: [084-01, 084-02]
files_modified:
  - .planning/research/dbt-spike-findings.md
  - .planning/phases/084-tests-diff-findings/084-lineage-listing.txt
autonomous: true
requirements: [PART-01, PART-02, FIND-01, FIND-02, FIND-03]
must_haves:
  truths:
    - "`bash data/dbt/run.sh build --select staging+` and `bash data/dbt/run.sh build --select +occurrences` both exit 0; thread_id evidence from target/run_results.json is recorded in findings"
    - "A `dbt ls --resource-type model` listing (23 lines, one per model) is captured at `.planning/phases/084-tests-diff-findings/084-lineage-listing.txt` and referenced from the findings doc"
    - "`.planning/research/dbt-spike-findings.md` ends with an explicit go / no-go / go-with-conditions verdict that cites diff and test evidence from 084-TEST-FINDINGS.md and 084-DIFF-FINDINGS.md"
    - "Findings prerequisites section enumerates ALL FIVE areas: test coverage, schema decisions, ingestion-vs-transform boundaries, parallel-run/orchestration story, DuckDB-WASM frontend impact"
    - "Findings include the existing samples.parquet discrepancy paragraph (already seeded) plus what-worked / what-was-awkward sections drawing from both Wave 1 plans' scratch files"
  artifacts:
    - path: ".planning/research/dbt-spike-findings.md"
      provides: "Final canonical findings doc with all FIND-01/02/03 sections, TEST-* and DIFF-* outcomes consolidated, PART-01/02 evidence inline, go/no-go verdict"
      contains: "## Verdict"
    - path: ".planning/phases/084-tests-diff-findings/084-lineage-listing.txt"
      provides: "Plaintext lineage artifact captured from dbt ls --resource-type model (23 model identifiers)"
      min_lines: 20
  key_links:
    - from: ".planning/research/dbt-spike-findings.md"
      to: ".planning/phases/084-tests-diff-findings/084-lineage-listing.txt"
      via: "Fenced code block in findings doc with relative path reference"
      pattern: "084-lineage-listing\\.txt"
    - from: ".planning/research/dbt-spike-findings.md"
      to: "data/tests/test_dbt_diff.py"
      via: "Findings cite the diff harness file path when reporting DIFF outcomes"
      pattern: "test_dbt_diff\\.py"
---

<objective>
Close the v3.3 dbt Spike. Exercise dbt's partial-run behavior on at least two subgraphs (PART-01),
capture a lineage artifact (PART-02), and write the canonical findings document
(`.planning/research/dbt-spike-findings.md`) covering what worked, what was awkward, the
samples.parquet schema discrepancy, the FORMAT-CSV GeoJSON workaround, a go / no-go / conditional
recommendation (FIND-02), and an explicit prerequisites list covering all five required areas
(FIND-03).

Purpose: This is the milestone deliverable. The two Wave 1 plans produced scratch documents
(`084-TEST-FINDINGS.md` and `084-DIFF-FINDINGS.md`); this plan consolidates them with the
existing seeded sections of `dbt-spike-findings.md` (Status, Slice Choice, Open Trade-Offs) into
one coherent narrative that ends with a concrete recommendation for the v3.4+ planner.

Output: a complete `.planning/research/dbt-spike-findings.md` with verdict, plus the
`084-lineage-listing.txt` referenced from it.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@.planning/ROADMAP.md
@.planning/REQUIREMENTS.md
@.planning/PROJECT.md
@.planning/phases/084-tests-diff-findings/084-RESEARCH.md
@.planning/phases/084-tests-diff-findings/084-VALIDATION.md
@.planning/phases/084-tests-diff-findings/084-TEST-FINDINGS.md
@.planning/phases/084-tests-diff-findings/084-DIFF-FINDINGS.md
@.planning/research/dbt-spike-findings.md
@.planning/phases/083-scaffold-slice-port/083-04-SUMMARY.md
@./CLAUDE.md

<interfaces>
## Already-existing content of dbt-spike-findings.md (seeded by Phase 83)

PRESERVE — do not rewrite:
1. `## Status` — Phase 83 seeded; this plan UPDATES to reflect Phase 84 complete
2. `## Slice Choice` — Phase 83 seeded; PRESERVE verbatim
3. `## Open Trade-Offs (for Phase 84)` — Phase 83 seeded with GeoJSON GDAL alternative and FORMAT CSV workaround; PRESERVE

REMOVE — this plan deletes the placeholder:
4. `## Phase 84 To-Do` — replaced by the consolidated sections below

## Sections this plan adds (in order)

- `## TEST-01 Generic Test Outcomes` (from 084-TEST-FINDINGS.md §TEST-01)
- `## TEST-02 Contract & Drift Demonstration` (from 084-TEST-FINDINGS.md §TEST-02)
- `## TEST-03 validate-schema.mjs Comparison` (from 084-TEST-FINDINGS.md §TEST-03)
- `## DIFF-01 Equality (row count, schema, key set)` (from 084-DIFF-FINDINGS.md §DIFF-01)
- `## DIFF-02 Spatial Divergence` (from 084-DIFF-FINDINGS.md §DIFF-02)
- `## DIFF-03 Classification Table` (from 084-DIFF-FINDINGS.md §DIFF-03)
- `## PART-01 Partial Run Behavior`
- `## PART-02 Lineage Artifact`
- `## What Worked Well` (FIND-01)
- `## What Was Awkward or Impossible` (FIND-01)
- `## Where dbt Expressed Things More Clearly Than Python` (FIND-01)
- `## Where dbt Expressed Things Less Clearly Than Python` (FIND-01)
- `## samples.parquet Discrepancy` (FIND-01 — pull from existing seed + 083-04-SUMMARY.md)
- `## Verdict` (FIND-02)
- `## Prerequisites for a Full-Rewrite Milestone (v3.4+)` (FIND-03 — five subsections)

## PART-01 subgraphs to exercise

1. `staging+` — all 11 staging + downstream (expected: 23 models built)
2. `+occurrences` — everything upstream of the occurrences mart (expected: 21 models; counties_geo and ecoregions_geo excluded)

## PART-02 lineage artifact

`bash data/dbt/run.sh ls --resource-type model` produces 23 lines, one per model. Capture to
`.planning/phases/084-tests-diff-findings/084-lineage-listing.txt`. Reference from findings as
a fenced code block (collapsed `<details>` block recommended for archival readability).

## FIND-03 five required areas (verbatim from REQUIREMENTS.md FIND-03)

1. test coverage
2. schema decisions
3. ingestion-vs-transform boundaries
4. parallel-run / orchestration story
5. DuckDB-WASM frontend impact

Template paragraphs for each area appear in 084-RESEARCH.md §Pattern 8 (lines 537-580). Adapt
with concrete evidence from this spike's outcomes — do not just paste the template.

## Verdict shape (FIND-02)

One of: GO / NO-GO / GO-WITH-CONDITIONS. Conditional is the likely outcome given the spike
findings (A1 may have required fallback; FORMAT-CSV GeoJSON workaround is fragile; samples.parquet
schema discrepancy needs a decision before cutover; 84-row boundary nondeterminism affects BOTH
implementations).

Verdict MUST cite specific evidence (test status, diff row counts, drift exit code) — grounded
in artifacts, not vibes.
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Exercise PART-01 partial runs and capture PART-02 lineage</name>
  <files>.planning/phases/084-tests-diff-findings/084-lineage-listing.txt</files>
  <read_first>
    - 084-RESEARCH.md §Pattern 6 (lines 491-516) for the verified partial-run invocations and expected model counts
    - 084-RESEARCH.md §Pattern 7 (lines 518-535) for the lineage artifact format
    - data/dbt/run.sh to confirm the invocation surface (verified working with dbt-core==1.10.1 pin)
    - 084-RESEARCH.md Pitfall 4 (rerun dbt clean && dbt build before diff tests to avoid stale state)
  </read_first>
  <action>
Run a clean baseline build, then exercise two subgraphs and capture the lineage listing.

Step 1. Run `bash data/dbt/run.sh clean` then `bash data/dbt/run.sh build`. Confirm exit 0 and
23/23 models built. Note the build duration from stdout for later inclusion in findings.

Step 2. Subgraph A — run `bash data/dbt/run.sh build --select staging+ 2>&1 | tee
/tmp/084-part-staging.log`. Confirm exit 0. Extract thread evidence: use the inline Python
snippet from 084-RESEARCH.md "Capturing parallelism evidence" (lines 723-735) to print sorted
`thread_id` values and the per-model execution order from `data/dbt/target/run_results.json`.
Save the snippet output to `/tmp/084-part-staging-threads.txt`.

Step 3. Subgraph B — run `bash data/dbt/run.sh build --select +occurrences 2>&1 | tee
/tmp/084-part-occurrences.log`. Confirm exit 0. The two geo marts (`counties_geo`,
`ecoregions_geo`) must be excluded — grep the log to verify their names do not appear in the
run set, and assert the model count is 21 not 23. Save thread evidence to
`/tmp/084-part-occurrences-threads.txt` using the same snippet.

Step 4. Capture the lineage artifact (PART-02): `bash data/dbt/run.sh ls --resource-type model
> .planning/phases/084-tests-diff-findings/084-lineage-listing.txt`. The file MUST have at
least 20 lines (we know there are 23 models from Phase 83 Plan 04). Trim trailing whitespace
if dbt emits any blank lines.

Step 5. Do NOT commit `target/run_results.json` or any `target/` file (all gitignored). Do NOT
modify dbt project files. The only file created in this task is `084-lineage-listing.txt`.
  </action>
  <verify>
    <automated>bash data/dbt/run.sh clean && bash data/dbt/run.sh build 2>&1 | grep -E "(Done\.|PASS=23|ERROR=0)" && bash data/dbt/run.sh build --select staging+ 2>&1 | tee /tmp/084-staging.log | grep -E "Done\.|PASS=23" && bash data/dbt/run.sh build --select +occurrences 2>&1 | tee /tmp/084-occ.log | grep -E "Done\.|PASS=21" && bash data/dbt/run.sh ls --resource-type model > .planning/phases/084-tests-diff-findings/084-lineage-listing.txt && [ "$(grep -v '^$' .planning/phases/084-tests-diff-findings/084-lineage-listing.txt | wc -l)" -ge 20 ]</automated>
  </verify>
  <acceptance_criteria>
    - `bash data/dbt/run.sh clean && bash data/dbt/run.sh build` exits 0 with PASS=23
    - `bash data/dbt/run.sh build --select staging+` exits 0 reporting 23 models (staging+ encompasses everything downstream)
    - `bash data/dbt/run.sh build --select +occurrences` exits 0 reporting 21 models (counties_geo and ecoregions_geo excluded — grep both names absent from the build log run set)
    - `.planning/phases/084-tests-diff-findings/084-lineage-listing.txt` exists with at least 20 non-blank lines, each a fully-qualified model identifier (e.g., `beeatlas.marts.occurrences`)
    - Thread evidence captured to /tmp/ files for transcription in Task 2
    - `git status data/dbt/` shows no changes to dbt project files
  </acceptance_criteria>
  <done>
Two subgraphs exercised; lineage artifact captured at 084-lineage-listing.txt; thread evidence
extracted from run_results.json into /tmp/ files for transcription into findings in Task 2.
  </done>
</task>

<task type="auto">
  <name>Task 2: Consolidate Wave 1 scratch findings into dbt-spike-findings.md (FIND-01 + PART sections)</name>
  <files>.planning/research/dbt-spike-findings.md</files>
  <read_first>
    - .planning/research/dbt-spike-findings.md (current state — seeded by Phase 83)
    - .planning/phases/084-tests-diff-findings/084-TEST-FINDINGS.md (Plan 01 output)
    - .planning/phases/084-tests-diff-findings/084-DIFF-FINDINGS.md (Plan 02 output)
    - .planning/phases/084-tests-diff-findings/084-lineage-listing.txt (Task 1 output)
    - /tmp/084-part-staging-threads.txt and /tmp/084-part-occurrences-threads.txt (Task 1 evidence)
    - .planning/phases/083-scaffold-slice-port/083-04-SUMMARY.md (samples.parquet discrepancy and FORMAT CSV background)
  </read_first>
  <action>
Edit `.planning/research/dbt-spike-findings.md` in-place. PRESERVE `## Status`, `## Slice
Choice`, and `## Open Trade-Offs (for Phase 84)`. REMOVE `## Phase 84 To-Do` (replaced by the
consolidated sections below).

Update the `## Status` body to: "Phase 83 and Phase 84 complete. Slice ported end-to-end;
tests, diff, and findings recorded. See Verdict section for the recommendation."

After the preserved seeded sections, append the following H2 sections in this order. For
each, fold content from the scratch files verbatim where the scratch already says the right
thing — these sections are aggregation, not re-derivation.

1. `## TEST-01 Generic Test Outcomes` — copy the per-test table from 084-TEST-FINDINGS.md §TEST-01 verbatim.
2. `## TEST-02 Contract & Drift Demonstration` — copy 084-TEST-FINDINGS.md §TEST-02 including the A1 outcome (whether the contract held on `occurrences` or fell back to `int_combined`) and the drift error message verbatim in a fenced block.
3. `## TEST-03 validate-schema.mjs Comparison` — copy 084-TEST-FINDINGS.md §TEST-03 verbatim.
4. `## DIFF-01 Equality` — copy 084-DIFF-FINDINGS.md §DIFF-01 verbatim.
5. `## DIFF-02 Spatial Divergence` — copy 084-DIFF-FINDINGS.md §DIFF-02 verbatim. Confirm the 84-row count and the boundary-nondeterminism root cause are both present.
6. `## DIFF-03 Classification Table` — copy the classification table verbatim from 084-DIFF-FINDINGS.md §DIFF-03.
7. `## PART-01 Partial Run Behavior` — paragraph naming the two subgraphs exercised (`staging+` → 23 models, `+occurrences` → 21 models). Include the thread evidence from /tmp/084-part-*-threads.txt in fenced blocks. Add a one-sentence parallelism observation grounded in the captured thread_ids (e.g., "dbt-duckdb serializes model execution on the single shared DuckDB connection — `--threads 4` produced thread_id variety but no wall-clock speedup on this 23-model slice; total wall time was X seconds for the full graph").
8. `## PART-02 Lineage Artifact` — paragraph referencing `.planning/phases/084-tests-diff-findings/084-lineage-listing.txt` with a relative-path link, followed by the file's contents inlined inside a collapsed `<details><summary>23 models</summary><pre>...</pre></details>` block for archival.
9. `## What Worked Well` (FIND-01) — bullet list. Include: dbt scaffolding rolled clean with run.sh wrapper; staging/intermediate/marts layering mapped onto export.py's CTEs naturally; generic tests caught the iNat duplicate id immediately; contract surfaced type-level invariants that validate-schema.mjs misses; `--select` subgraphs are usable for ad-hoc model exploration.
10. `## What Was Awkward or Impossible` (FIND-01) — bullet list. Include: FORMAT CSV workaround for raw-JSON GeoJSON emission (cite 083-04-SUMMARY.md); A1 contract-on-external behavior (cite actual outcome from §TEST-02); `relationships` test type mismatch (INTEGER vs VARCHAR — cite §TEST-01 awkward-fit row); samples.parquet conceptual fragmentation (point forward to §samples.parquet Discrepancy); 84-row boundary nondeterminism affects BOTH implementations and dbt cannot fix it (cite §DIFF-02); dbt-core 1.10.20 macro-parser regression required exact pin to 1.10.1 (cite 084-RESEARCH §Pitfall 1).
11. `## Where dbt Expressed Things More Clearly Than Python` (FIND-01) — bullets: `ref()` lineage replaces hand-managed CTE ordering in export.py; YAML data_tests beat ad-hoc pytest assertions for invariants like uniqueness; contract types (INTEGER vs VARCHAR) catch what validate-schema.mjs name-only check misses; `--select` subgraphs replace commenting blocks of `export.py` to skip work.
12. `## Where dbt Expressed Things Less Clearly Than Python` (FIND-01) — bullets: `emit_feature_collection` macro is more code than Python's `json.dumps`; debugging post-hook failures requires reading `target/compiled/` SQL; dbt-duckdb version pin sensitivity (1.10.20 regression) adds operational risk vs Python's simpler dependency story; the `_apply_migrations()` migration story has no obvious dbt analog (Python imperative > YAML declarative for one-shot DDL).
13. `## samples.parquet Discrepancy` (FIND-01) — write ~150 words. REQUIREMENTS.md and ROADMAP.md name `samples.parquet` as a separate output; `export.py` does not emit one — samples are folded into `occurrences.parquet` as the sample-side of the FULL OUTER JOIN; dbt faithfully reproduced this. Frame as a schema decision the v3.4+ planner must make: either keep one-file fold (matches frontend SQLite consumers today, simpler for joins) or split into two marts (cleaner conceptual model, requires frontend changes and a validate-schema.mjs update). Reference 083-04-SUMMARY.md.

Verdict and Prerequisites sections are written in Task 3.

Style: H2 sections, one short intro paragraph per section then bullets or table. No emoji. Use
relative paths in references (the doc lives at `.planning/research/`).
  </action>
  <verify>
    <automated>F=.planning/research/dbt-spike-findings.md; for h in '^## Status' '^## Slice Choice' '^## Open Trade-Offs' '^## TEST-01' '^## TEST-02' '^## TEST-03' '^## DIFF-01' '^## DIFF-02' '^## DIFF-03' '^## PART-01' '^## PART-02' '^## What Worked' '^## What Was Awkward' '^## Where dbt Expressed Things More Clearly' '^## Where dbt Expressed Things Less Clearly' '^## samples.parquet'; do grep -q "$h" "$F" || (echo "MISSING: $h"; exit 1); done; ! grep -q 'Phase 84 To-Do' "$F"</automated>
  </verify>
  <acceptance_criteria>
    - All preserved sections (Status, Slice Choice, Open Trade-Offs) still present in dbt-spike-findings.md
    - `## Phase 84 To-Do` is GONE
    - All 13 new H2 sections listed in Task 2 action exist with non-empty bodies (grep confirms each header)
    - PART-01 section contains both subgraph names (`staging+` and `+occurrences`) and at least one fenced thread-evidence block
    - PART-02 section references `084-lineage-listing.txt` by path and includes the listing inline (`<details>` or fenced block)
    - samples.parquet section references both export.py's actual behavior AND the REQUIREMENTS.md naming convention
    - No new files created in this task beyond the in-place edit
  </acceptance_criteria>
  <done>
13 consolidation sections written; PART-01 thread evidence and PART-02 lineage artifact
embedded; findings doc 90% complete pending Verdict and Prerequisites in Task 3.
  </done>
</task>

<task type="auto">
  <name>Task 3: Write Verdict (FIND-02) and Prerequisites (FIND-03)</name>
  <files>.planning/research/dbt-spike-findings.md</files>
  <read_first>
    - .planning/research/dbt-spike-findings.md (Task 2 output — read entire current state)
    - 084-RESEARCH.md §Pattern 8 (lines 537-580) for the FIND-03 prerequisites framework template
    - 084-TEST-FINDINGS.md §TEST-02 (A1 outcome — drives whether the verdict is GO or GO-WITH-CONDITIONS)
    - 084-DIFF-FINDINGS.md §DIFF-02 (84-row boundary divergence — a verdict input)
    - .planning/STATE.md "project_duckdb_wasm_direction.md" memory reference (for FIND-03 area 5)
  </read_first>
  <action>
Append two final H2 sections to `.planning/research/dbt-spike-findings.md`.

Section 1: `## Verdict` (FIND-02). Write ~250-400 words. Pick ONE of:
- **GO**: all tests passed cleanly, contract worked on the intended target, diff was clean, no schema-design blockers
- **GO-WITH-CONDITIONS**: most things worked but specific prerequisites must be met before cutover (most likely outcome given the spike findings)
- **NO-GO**: blockers severe enough that the dbt approach is not viable for BeeAtlas

The verdict label MUST appear in the first sentence as bold (e.g., `**Recommendation: GO-WITH-CONDITIONS**`).

The body of the verdict MUST cite at least four specific pieces of evidence from earlier
sections, each with the section reference. Required citations:
- TEST-02 outcome (whether A1 held or fell back) — what does this say about contract maturity in dbt-duckdb?
- DIFF-02 84-row divergence (and its presence in BOTH implementations) — what does this say about correctness?
- FORMAT CSV GeoJSON workaround (cite §Open Trade-Offs and §What Was Awkward) — what does this say about dbt's fit for non-tabular outputs?
- samples.parquet discrepancy (§samples.parquet Discrepancy) — what schema decision must precede any rewrite?

End with a single-sentence summary of what the next milestone (v3.4+) should do or NOT do
based on this spike. The summary must be actionable for a planner, not aspirational.

Section 2: `## Prerequisites for a Full-Rewrite Milestone (v3.4+)` (FIND-03). Write five
H3 subsections, one per required area. Each subsection ~100-150 words. Use the
"Before cutover, X must be true" sentence shape from 084-RESEARCH.md §Pattern 8 as the FIRST
sentence of each H3 body. Then 2-4 bullets of concrete sub-requirements specific to BeeAtlas.

The five required H3 subsections (verbatim names):

### Test coverage
First sentence: "Before cutover, every invariant currently enforced by `validate-schema.mjs`
and `data/run.py::_apply_migrations` must be re-expressed as a dbt test or contract." Then
bullets: which invariants exist (cite scripts/validate-schema.mjs and 084-TEST-FINDINGS.md
§TEST-01); what dbt-duckdb gaps remain (A1 outcome from §TEST-02); whether `_apply_migrations`
patterns map to dbt at all (probably not — call this out).

### Schema decisions
First sentence: "Before cutover, the `samples.parquet` vs `occurrences.parquet` shape and any
column renames must be locked." Then bullets: keep the one-file fold or split into two marts
(cite §samples.parquet Discrepancy); impact on the frontend SQLite schema (cite §validate-schema.mjs
EXPECTED list); contract enforcement target (cite §TEST-02 A1 outcome).

### Ingestion-vs-transform boundaries
First sentence: "Before cutover, the boundary between dlt-style ingestion and dbt-style
transform must be drawn explicitly." Then bullets: what stays dlt (raw HTTP fetchers — name
the modules); what moves to dbt (transform-only — name `export.py`, `species_export.py`); how
the seam works (probably: dlt writes raw schemas, dbt reads as `source()`).

### Parallel-run / orchestration story
First sentence: "Before cutover, the cron orchestration story for `data/nightly.sh` must be
designed to integrate `dbt build` cleanly." Then bullets: what wall-clock cost looks like (cite
§PART-01); incremental-materialization story (largely untested in this spike — call out as
known unknown); error-handling and retries (current shell script uses `set -euo pipefail`;
dbt has its own exit-code surface).

### DuckDB-WASM frontend impact
First sentence: "Before cutover, confirm the output schema of `occurrences.parquet` is
unchanged so the wa-sqlite frontend (per
.planning/projects/-Users-rainhead-dev-beeatlas-memory project_duckdb_wasm_direction.md memory)
keeps working." Then bullets: contract becomes the schema gate (cite §TEST-02); validate-schema.mjs
either stays or is retired (cite §TEST-03); frontend column drift detection is currently a CI
gate — preserve that property.

After writing, do a final read-through of the entire `dbt-spike-findings.md` to confirm:
the verdict is reachable from the evidence, the prerequisites are specific not generic, and
the Status section reflects "Phase 84 complete."
  </action>
  <verify>
    <automated>F=.planning/research/dbt-spike-findings.md; grep -q '^## Verdict' "$F" && grep -q '^## Prerequisites for a Full-Rewrite Milestone' "$F" && grep -qE '\*\*Recommendation: (GO|NO-GO|GO-WITH-CONDITIONS)' "$F" && grep -q '^### Test coverage' "$F" && grep -q '^### Schema decisions' "$F" && grep -q '^### Ingestion-vs-transform boundaries' "$F" && grep -q '^### Parallel-run / orchestration story' "$F" && grep -q '^### DuckDB-WASM frontend impact' "$F" && grep -q 'Before cutover' "$F"</automated>
  </verify>
  <acceptance_criteria>
    - `## Verdict` section exists with `**Recommendation: <GO|NO-GO|GO-WITH-CONDITIONS>**` in the first sentence (regex `\*\*Recommendation: (GO|NO-GO|GO-WITH-CONDITIONS)\*\*`)
    - Verdict body cites at least 4 specific earlier sections by name (grep for `§TEST-02`, `§DIFF-02`, `§Open Trade-Offs`, `§samples.parquet` or equivalent phrasings)
    - `## Prerequisites for a Full-Rewrite Milestone (v3.4+)` exists with exactly 5 H3 subsections named verbatim: Test coverage, Schema decisions, Ingestion-vs-transform boundaries, Parallel-run / orchestration story, DuckDB-WASM frontend impact
    - Each H3 starts with a "Before cutover" sentence (grep -c "Before cutover" returns ≥ 5)
    - The wa-sqlite/DuckDB-WASM subsection references the project_duckdb_wasm_direction memory
    - `## Status` section content reflects "Phase 84 complete" (not the original Phase-83-seeded text)
    - `git diff scripts/validate-schema.mjs data/run.py data/nightly.sh public/data/` is empty (spike-discipline guard)
  </acceptance_criteria>
  <done>
Verdict and Prerequisites sections written. dbt-spike-findings.md is the milestone deliverable
of v3.3, ready for the user to read end-to-end before deciding v3.4+ scope.
  </done>
</task>

</tasks>

<threat_model>
applies: false
justification: Local-only spike — no auth, network, or untrusted input. Plan 03 runs dbt CLI
commands against the local DuckDB, captures plain-text artifacts, and edits markdown. No
production surface touched per v3.3 scope discipline.
</threat_model>

<verification>
After all three tasks:
- `bash data/dbt/run.sh build --select staging+` and `bash data/dbt/run.sh build --select +occurrences` both exit 0 (PART-01)
- `.planning/phases/084-tests-diff-findings/084-lineage-listing.txt` exists with ≥ 20 lines (PART-02)
- `.planning/research/dbt-spike-findings.md` contains all H2 sections from Tasks 2 and 3 + the preserved Phase-83 seeded sections; `## Phase 84 To-Do` is gone; Verdict has a `**Recommendation:** <label>` line; Prerequisites has 5 H3 subsections
- No production-surface file modified (`scripts/validate-schema.mjs`, `data/run.py`, `data/nightly.sh`, `public/data/` all unchanged)
- The v3.3 milestone is in a "ready to close" state: a user can read `dbt-spike-findings.md` end-to-end and walk away with a clear go/no-go answer + actionable prerequisites
</verification>

<success_criteria>
- PART-01: ≥ 2 subgraphs exercised (`staging+` and `+occurrences`), thread-id evidence captured in findings
- PART-02: lineage artifact at `084-lineage-listing.txt`, referenced from findings as a `<details>` block
- FIND-01: 4 sub-sections (worked / awkward / more-clearly / less-clearly) + samples.parquet discrepancy section, all populated from Wave 1 scratch + 083 SUMMARYs
- FIND-02: explicit GO / NO-GO / GO-WITH-CONDITIONS verdict in first sentence, with ≥ 4 evidence citations
- FIND-03: 5 H3 subsections each starting with "Before cutover", concrete to BeeAtlas (not generic)
- Findings doc reads as a coherent narrative end-to-end, not a copy-paste pastiche (user-facing quality bar)
</success_criteria>

<output>
After completion, create `.planning/phases/084-tests-diff-findings/084-03-SUMMARY.md`.
</output>
