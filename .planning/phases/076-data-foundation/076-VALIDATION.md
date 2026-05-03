---
phase: 76
slug: data-foundation
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-05-02
---

# Phase 76 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution. Filled in by the planner; gsd-planner is expected to expand the Per-Task Verification Map and Wave 0 sections from the plans it produces.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | pytest (data/) — managed via `uv` per `data/pyproject.toml` |
| **Config file** | `data/pyproject.toml` (testpaths = ["tests"]) |
| **Quick run command** | `cd data && uv run pytest tests/test_checklist_pipeline.py tests/test_taxon_lineage.py -x` |
| **Full suite command** | `cd data && uv run pytest` |
| **Estimated runtime** | ~30 seconds (target — programmatic DuckDB fixtures, no network) |

---

## Sampling Rate

- **After every task commit:** Run `cd data && uv run pytest tests/test_checklist_pipeline.py tests/test_taxon_lineage.py -x`
- **After every plan wave:** Run `cd data && uv run pytest`
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 30 seconds

---

## Per-Task Verification Map

*To be populated by the planner. Each task in each PLAN.md should have a row mapping to a runnable pytest target plus a grep/file-existence acceptance criterion.*

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| TBD     | TBD  | TBD  | TBD         | —          | N/A             | unit      | TBD               | ❌ W0        | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `data/tests/test_checklist_pipeline.py` — stubs for CHECK-01..06 (load + canonicalize + reconcile)
- [ ] `data/tests/test_taxon_lineage.py` — stubs for TAX-01..04 (extended lineage walk + COALESCE precedence)
- [ ] `data/tests/conftest.py` — extend programmatic DuckDB fixture with checklist + extended-lineage seed rows + disagreement fixtures (`Lasioglossum (Dialictus) zonulum` ↔ `Lasioglossum zonulum`, authority-bearing variant, six known live trinomials)

*Existing pytest infrastructure already in place (`data/pyproject.toml`, `data/tests/conftest.py`); Wave 0 adds new test files only.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| `checklist_unmatched.csv` is reviewable after first real run | CHECK-04, CHECK-06 | Output depends on live ecdysis data | After Wave N: `cd data && uv run python run.py`; inspect `data/checklist_unmatched.csv`; expect <50 entries on first run |
| `data/checklists/README.md` provenance prose reads correctly | CHECK-01 | Subjective text | `cat data/checklists/README.md` and confirm Bartholomew et al. 2024 (JHR 97, DOI 10.3897/jhr.97.129013) provenance + supplement format note + manual-extraction step + two-column shape note |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
