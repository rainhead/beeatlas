---
phase: 135
slug: name-reconciliation
status: approved
nyquist_compliant: true
wave_0_complete: false
created: 2026-06-04
---

# Phase 135 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.
> Derived from 135-RESEARCH.md §Validation Architecture.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | pytest (existing) + dbt schema tests |
| **Config file** | `data/pyproject.toml` `[tool.pytest]` section |
| **Quick run command** | `cd data && uv run pytest tests/test_resolve_checklist_names.py -x` |
| **Full suite command** | `cd data && uv run pytest tests/ -x` + `bash dbt/run.sh build` |
| **Estimated runtime** | ~35 min full suite (known debt — see deferred test-suite milestone); quick file ~seconds |

> ⚠️ The full pytest suite is ~35 min and carries 18 pre-existing red tests in
> `test_resolve_taxon_ids.py` / `test_dbt_diff.py` (deferred to the test-suite-improvements
> milestone — do NOT fix here). Sample with the **quick** per-file command during execution;
> reserve the full suite for wave merges and scope new tests to the new test files.

---

## Sampling Rate

- **After every task commit:** `cd data && uv run pytest tests/test_resolve_checklist_names.py -x` (or the new test file the task touches)
- **After every plan wave:** `cd data && uv run pytest tests/test_resolve_checklist_names.py tests/test_checklist_pipeline.py tests/test_canonical_name.py -x` + `bash dbt/run.sh build`
- **Before `/gsd:verify-work`:** New test files green + `bash dbt/run.sh build` green
- **Max feedback latency:** < 30s for the scoped per-file run

---

## Per-Task Verification Map

| Requirement | Behavior | Test Type | Automated Command | File Exists |
|-------------|----------|-----------|-------------------|-------------|
| RCN-01 | `normalize_scientific_name("Agapostemon texanus Cresson, 1872")` → `agapostemon texanus` | unit | `pytest tests/test_canonical_name.py -x` | ✅ existing |
| RCN-01 | Trailing-space `"Agapostemon texanus "` → `agapostemon texanus` | unit | `pytest tests/test_canonical_name.py -x -k trailing` | ❌ W0 (may add) |
| RCN-02 | Audit CSV committed; every name has a `source` tier + numeric confidence | integration | `pytest tests/test_resolve_checklist_names.py::test_audit_csv_covers_all_names -x` | ❌ W0 |
| RCN-03 | Nightly path (refresh=False) issues zero GBIF network calls | unit | `pytest tests/test_resolve_checklist_names.py::test_noop_without_refresh -x` | ❌ W0 |
| RCN-04 | Fuzzy candidates written to curator-review CSV | unit | `pytest tests/test_resolve_checklist_names.py::test_fuzzy_candidates_written -x` | ❌ W0 |
| RCN-04 | ≥ 13 fuzzy candidates surface (13-known-misspellings check) | integration | `pytest tests/test_resolve_checklist_names.py::test_at_least_13_fuzzy_candidates -x` | ❌ W0 |
| RCN-04 | No unreviewed fuzzy mapping is live in `occurrence_synonyms` | unit | `pytest tests/test_resolve_checklist_names.py::test_fuzzy_review_gate -x` | ❌ W0 |
| RCN-05 | `texanus/angelicus` resolves to computed LCA `taxon_id` (subgenus 606634, not genus 50086) | unit | `pytest tests/test_resolve_checklist_names.py::test_slash_lca -x` | ❌ W0 |
| RCN-05 | Verbatim `angelicus/texanus` string retained alongside resolved LCA | unit | `pytest tests/test_resolve_checklist_names.py::test_slash_verbatim_retained -x` | ❌ W0 |
| RCN-06 | `reconcile()` no longer called in active checklist load path | unit | `pytest tests/test_checklist_pipeline.py::test_no_active_reconcile_call -x` | ❌ W0 |
| RCN-06 | Single synonym source asserted (`checklist_synonyms.csv` retired) | unit | `pytest tests/test_checklist_pipeline.py::test_single_synonym_source -x` | ❌ W0 |
| RCN-07 | dbt build fails if any Anthophila `canonical_name` → >1 `taxon_id` | dbt test | `cd data && bash dbt/run.sh test --select assert_no_anthophila_homonyms` | ❌ W0 |

*Status legend: ✅ existing infra · ❌ W0 = created in Wave 0*

---

## Wave 0 Requirements

- [ ] `data/tests/test_resolve_checklist_names.py` — stubs for RCN-02, RCN-03, RCN-04, RCN-05
- [ ] `data/tests/test_checklist_pipeline.py` — add RCN-06 tests (`test_no_active_reconcile_call`, `test_single_synonym_source`)
- [ ] `data/dbt/tests/assert_no_anthophila_homonyms.sql` — RCN-07 homonym guard
- [ ] (optional) trailing-space case in `data/tests/test_canonical_name.py` — RCN-01

pytest + rapidfuzz + pygbif frameworks already installed (no framework install needed).

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Curator promotion of a GBIF/fuzzy candidate into `occurrence_synonyms.csv` | RCN-02/RCN-04 gate | The HUMAN-REVIEW GATE is intentionally human; automation would defeat its purpose | Reviewer sorts `checklist_name_resolution_audit.csv` by confidence, copies a row into `occurrence_synonyms.csv`, reruns `bash dbt/run.sh build` |
| One-time GBIF `--refresh` lookup produced the committed seed | RCN-03 | Network call is off-nightly; cannot run in CI offline | Run the refresh flag once with network; confirm committed seed updated and git-tracked |

---

## Validation Sign-Off

- [ ] All tasks have automated verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s (scoped per-file run)
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
