---
phase: 125
slug: species-visibility
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-05-29
---

# Phase 125 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | pytest |
| **Config file** | `data/pyproject.toml` |
| **Quick run command** | `cd data && uv run pytest tests/test_dbt_scaffold.py -x -k species` |
| **Full suite command** | `cd data && uv run pytest tests/test_species_export.py tests/test_species_maps.py tests/test_dbt_scaffold.py -x` |
| **Estimated runtime** | ~30 seconds |

---

## Sampling Rate

- **After every task commit:** Run `cd data && uv run pytest tests/test_dbt_scaffold.py -x -k species`
- **After every plan wave:** Run `cd data && uv run pytest tests/test_species_export.py tests/test_species_maps.py tests/test_dbt_scaffold.py -x`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 60 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 125-01-01 | 01 | 0 | SPV-01 | — | N/A | unit | `cd data && uv run pytest tests/test_dbt_scaffold.py -x -k off_checklist` | ❌ W0 | ⬜ pending |
| 125-01-02 | 01 | 0 | SPV-01 | — | N/A | unit | `cd data && uv run pytest tests/test_dbt_scaffold.py -x -k capitalized` | ❌ W0 | ⬜ pending |
| 125-01-03 | 01 | 1 | SPV-01 | — | N/A | unit (sandbox) | `cd data && uv run pytest tests/test_dbt_scaffold.py -x -k off_checklist` | ✅ W0 | ⬜ pending |
| 125-01-04 | 01 | 2 | SPV-02 | — | N/A | build artifact | `npm run build && test -f _site/species/Halictus/rubicundus/index.html` | manual | ⬜ pending |
| 125-01-05 | 01 | 2 | SPV-03 | — | N/A | unit | `cd data && uv run pytest tests/test_species_maps.py -x` | ✅ | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `data/tests/test_dbt_scaffold.py` — add `test_off_checklist_species_with_occurrences_have_specific_epithet` (SPV-01)
- [ ] `data/tests/test_dbt_scaffold.py` — add `test_off_checklist_species_scientificname_capitalized` (SPV-01)

*Existing test infrastructure in `test_species_export.py` and `test_species_maps.py` covers slug format and SVG generation without changes. SPV-02 static page verification is a post-build manual check.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Static pages exist for newly-visible species | SPV-02 | Eleventy build artifact; no automated integration test | `npm run build && test -f _site/species/Halictus/rubicundus/index.html` (verify one known new species) |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 60s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
