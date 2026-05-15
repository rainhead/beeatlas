---
phase: 92
slug: slug-migration-pipeline-prep
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-05-15
---

# Phase 92 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | pytest |
| **Config file** | `data/pyproject.toml` |
| **Quick run command** | `cd data && uv run pytest data/tests/test_species_export.py -q` |
| **Full suite command** | `cd data && uv run pytest` |
| **Estimated runtime** | ~10 seconds |

---

## Sampling Rate

- **After every task commit:** Run `cd data && uv run pytest data/tests/test_species_export.py -q`
- **After every plan wave:** Run `cd data && uv run pytest`
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 30 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 92-01-01 | 01 | 0 | PIPE-03 | — | N/A | unit | `cd data && uv run pytest data/tests/test_species_export.py -q` | ❌ W0 | ⬜ pending |
| 92-02-01 | 02 | 1 | PIPE-03 | — | N/A | unit | `cd data && uv run pytest data/tests/test_species_export.py -q` | ✅ | ⬜ pending |
| 92-02-02 | 02 | 1 | PIPE-03 | — | N/A | integration | `cd data && uv run python run.py && python -c "import json; d=json.load(open('../public/data/species.json')); assert all('/' in s['slug'] for s in d['species'] if s.get('specific_epithet'))"` | ✅ | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `data/tests/test_species_export.py` — slug format assertions for PIPE-03

*Existing pytest infrastructure covers all other phase requirements.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| `content/species-photos.toml` orphaned keys removed | PIPE-03 | TOML key audit requires human review of orphaned entries | Run `uv run python -m validate_species` and confirm zero orphan warnings |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
