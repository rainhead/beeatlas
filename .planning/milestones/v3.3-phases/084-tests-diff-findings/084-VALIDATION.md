---
phase: 84
slug: tests-diff-findings
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-05-13
---

# Phase 84 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution. Derived from 084-RESEARCH.md §"Validation Architecture".

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | pytest (existing, `data/pyproject.toml` dev group) + `dbt test` |
| **Config file** | `data/pyproject.toml` `[tool.pytest.ini_options]` (testpaths = ["tests"]) |
| **Quick run command** | `bash data/dbt/run.sh test --select <model+> && uv run --project data pytest data/tests/test_dbt_diff.py -x` |
| **Full suite command** | `bash data/dbt/run.sh build && bash data/dbt/run.sh test && uv run --project data pytest data/tests/ -x` |
| **Estimated runtime** | ~15s quick / ~45s full |

---

## Sampling Rate

- **After every task commit:** Run quick command on the touched model / harness
- **After every plan wave:** Run full suite command
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** ~45 seconds

---

## Per-Task Verification Map

(Placeholder rows — planner fills `Task ID` and `Plan` columns once PLAN.md files exist. Test commands and File Exists are pre-populated from RESEARCH §"Phase Requirements → Test Map".)

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| TBD | 01 | 0 | n/a (pin fix) | — | n/a | smoke | `bash data/dbt/run.sh --version` exits 0 | ✅ | ⬜ pending |
| TBD | 02 | 1 | TEST-01 | — | n/a | dbt test | `bash data/dbt/run.sh test --select stg_ecdysis__occurrences+ stg_waba__observations+ stg_inat__observations+` | ❌ W1 (schema.yml) | ⬜ pending |
| TBD | 02 | 1 | TEST-02 | — | n/a | dbt build | `bash data/dbt/run.sh build --select occurrences` (contract enforced) | ❌ W1 (schema.yml + contract block) | ⬜ pending |
| TBD | 02 | 1 | TEST-02 drift demo | — | n/a | dbt build (expect fail) | drift commit + `bash data/dbt/run.sh build --select occurrences` exits non-zero | ❌ W1 | ⬜ pending |
| TBD | 02 | 1 | TEST-03 | — | n/a | docs analysis | comparison committed in dbt-spike-findings.md §TEST-03 | ❌ W1 | ⬜ pending |
| TBD | 03 | 2 | DIFF-01 | — | n/a | pytest | `uv run --project data pytest data/tests/test_dbt_diff.py::test_occurrences_row_count_matches -xvs` | ❌ W2 (test_dbt_diff.py) | ⬜ pending |
| TBD | 03 | 2 | DIFF-01 schema | — | n/a | pytest | `uv run --project data pytest data/tests/test_dbt_diff.py::test_occurrences_schema_matches -xvs` | ❌ W2 | ⬜ pending |
| TBD | 03 | 2 | DIFF-01 key-set | — | n/a | pytest | `uv run --project data pytest data/tests/test_dbt_diff.py::test_occurrences_key_set_equality -xvs` | ❌ W2 | ⬜ pending |
| TBD | 03 | 2 | DIFF-02 | — | n/a | pytest | `uv run --project data pytest data/tests/test_dbt_diff.py::test_occurrences_county_spatial_diff -xvs` | ❌ W2 | ⬜ pending |
| TBD | 03 | 2 | DIFF-02 geojson | — | n/a | pytest | `uv run --project data pytest data/tests/test_dbt_diff.py::test_geojson_feature_diff -xvs` | ❌ W2 | ⬜ pending |
| TBD | 03 | 2 | DIFF-03 | — | n/a | docs | classification table committed in dbt-spike-findings.md §DIFF-03 | ❌ W2 | ⬜ pending |
| TBD | 04 | 3 | PART-01 | — | n/a | bash + docs | partial-run log committed; ≥2 subgraphs exercised | ❌ W3 | ⬜ pending |
| TBD | 04 | 3 | PART-02 | — | n/a | bash + docs | `dbt ls --resource-type model` listing committed under findings | ❌ W3 | ⬜ pending |
| TBD | 04 | 3 | FIND-01 | — | n/a | docs | findings §what-worked / §what-awkward / §samples.parquet sections present | ❌ W3 | ⬜ pending |
| TBD | 04 | 3 | FIND-02 | — | n/a | docs | findings ends with go / no-go / conditional verdict | ❌ W3 | ⬜ pending |
| TBD | 04 | 3 | FIND-03 | — | n/a | docs | findings prerequisites list covers all 5 areas (test coverage, schema, ingest-vs-transform, parallel/orchestration, WASM frontend) | ❌ W3 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [x] `data/dbt/run.sh` — pin `dbt-core==1.10.1` exactly (committed before planner; fffc496)
- [ ] `data/dbt/models/staging/schema.yml` — generic tests for TEST-01 (Plan 02)
- [ ] `data/dbt/models/intermediate/schema.yml` — generic tests for TEST-01 (Plan 02)
- [ ] `data/dbt/models/marts/schema.yml` — contract for TEST-02 (Plan 02)
- [ ] `data/tests/test_dbt_diff.py` — diff harness for DIFF-01/02/03 (Plan 03)
- [ ] `.planning/research/dbt-spike-findings.md` — body sections (Plan 04 extends seed)

No new framework installs needed — pytest, duckdb, and dbt-duckdb are already present.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Findings doc reads well and conveys the spike's verdict | FIND-01, FIND-02, FIND-03 | Narrative quality is not automatable — automatable parts are checked via "all five prerequisite areas mentioned" structural assertion, but tone/coherence is manual review by the user | Read `.planning/research/dbt-spike-findings.md` end-to-end; confirm verdict aligns with diff/test evidence |
| Lineage artifact is interpretable | PART-02 | `dbt ls` output is rendered text — manually confirm it reads as a useful DAG enumeration | Read the lineage block referenced from findings; confirm it shows source → staging → intermediate → marts layering |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 45s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending (Task IDs filled after planner runs)
