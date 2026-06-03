---
phase: 132
slug: page-rebuild-subfamily-pages
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-06-02
---

# Phase 132 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | pytest (data pipeline) + dbt build/tests + vitest (JS) |
| **Config file** | `data/pyproject.toml`, `data/dbt/`, `vitest.config.*` |
| **Quick run command** | `cd data && uv run pytest <targeted test>` |
| **Full suite command** | `cd data && uv run pytest && bash data/dbt/run.sh build && cd .. && npm test` |
| **Estimated runtime** | ~TBD (planner to refine) |

---

## Sampling Rate

- **After every task commit:** Run targeted `uv run pytest` / `dbt build --select <model>`
- **After every plan wave:** Run full suite command
- **Before `/gsd:verify-work`:** Full suite must be green; `bash data/dbt/run.sh build` passes the contract gate
- **Max feedback latency:** TBD (planner to refine)

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| (planner fills) | | | PAGE-01..04 | | | | | | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

*(Planner to populate from RESEARCH Validation Architecture — e.g. dbt schema tests for the new `higher_taxa` model, a pytest baseline-equivalence fixture for the ≥5-taxa count spot-check, a collision-check unit test.)*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Subfamily page renders nested tribes→genera with by-genus map swatches | PAGE-02 | Visual layout | Build site, open `/species/subfamily/{Name}/`, confirm nested layout + map dot/swatch correspondence |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency target set
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
