---
phase: 140
slug: checklist-taxonomy-fixture-distillation
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-06-06
---

# Phase 140 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | pytest (with `integration` marker + `addopts = "-m 'not integration'"` from Phase 139) |
| **Config file** | data/pyproject.toml `[tool.pytest.ini_options]` |
| **Quick run command** | `cd data && uv run pytest tests/test_checklist_pipeline.py tests/test_resolve_checklist_names.py -q` |
| **Full suite command** | `cd data && uv run pytest -q` (build-time tier; integration deselected by default) |
| **Estimated runtime** | target: the two touched files run in seconds, not minutes (per phase goal) |

---

## Sampling Rate

- **After every task commit:** Run the quick run command (the two affected test files)
- **After every plan wave:** Run the full build-time tier (`cd data && uv run pytest -q`)
- **Before `/gsd:verify-work`:** Build-time tier green for the two files; fast tier must pass with `data/raw/taxa.csv.gz` ABSENT (TFIXTURE-02 accept criterion)
- **Max feedback latency:** seconds (the whole point of this phase)

---

## Per-Task Verification Map

> The planner fills exact task IDs/commands. Required validation behaviors derived from RESEARCH.md:

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 140-XX-XX | XX | 1 | TFIXTURE-01 | — | N/A | unit | `cd data && uv run pytest tests/test_checklist_pipeline.py -q` | ✅ | ⬜ pending |
| 140-XX-XX | XX | 1 | TFIXTURE-01 | — | DB built once per file (shared in-memory conn) | unit | `cd data && uv run pytest tests/test_checklist_pipeline.py -q` | ✅ | ⬜ pending |
| 140-XX-XX | XX | 1 | TFIXTURE-02 | — | fast tier passes with raw/taxa.csv.gz absent | unit | `cd data && mv raw/taxa.csv.gz /tmp/ 2>/dev/null; uv run pytest tests/test_resolve_checklist_names.py -q; mv /tmp/taxa.csv.gz raw/ 2>/dev/null` | ✅ | ⬜ pending |
| 140-XX-XX | XX | 1 | TFIXTURE-04 | — | fixtures + provenance committed | doc/source | `test -d data/tests/fixtures && ls data/tests/fixtures` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `data/tests/fixtures/` directory created (does not exist yet)
- [ ] sample checklist CSV fixture (~9 rows per RESEARCH.md, covering all coord_flag + date_quality branches)
- [ ] tiny `taxa.csv.gz` ancestry subset fixture (~2 rows per RESEARCH.md)

*Existing pytest infrastructure (Phase 139 two-tier harness) covers the runner; only fixtures + the connection/path seams are new.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Wall-clock "runs in seconds" claim | TFIXTURE-01 | Precise timing is Phase 142's measured-after-number job; here it's a qualitative check | `cd data && uv run pytest tests/test_checklist_pipeline.py --durations=0` and eyeball that no test reparses the full CSV |

*Most phase behaviors have automated verification (deselection, fixture presence, absent-file pass).*

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references (fixtures dir + fixture files)
- [ ] No watch-mode flags
- [ ] Feedback latency < a few seconds
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
