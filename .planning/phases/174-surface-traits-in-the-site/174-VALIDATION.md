---
phase: 174
slug: surface-traits-in-the-site
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-06-29
---

# Phase 174 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest (frontend/JS) + pytest 8.x (data pipeline) |
| **Config file** | `vitest.config.ts` · `data/pyproject.toml` |
| **Quick run command** | `npm test` (vitest) · `cd data && uv run pytest -m "not integration"` |
| **Full suite command** | `npm test && cd data && uv run pytest -m "not integration"` |
| **Estimated runtime** | ~30–60 seconds |

---

## Sampling Rate

- **After every task commit:** Run the relevant quick command (`npm test` for JS/template changes, `cd data && uv run pytest -m "not integration"` for `species_export.py`/dbt changes)
- **After every plan wave:** Run the full suite (both `npm test` and pytest)
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** ~60 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 174-01-xx | 01 | 1 | TRAIT-UI-05 | — / — | N/A | unit | `cd data && uv run pytest -m "not integration" tests/test_species_export.py` | ✅ | ⬜ pending |
| 174-02-xx | 02 | 2 | TRAIT-UI-01,02,03,04 | — / — | N/A | unit | `npm test` (data-species + species-index suites) | ✅ | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- Existing infrastructure covers all phase requirements. `data/tests/test_species_export.py`, `src/tests/data-species.test.ts`, `src/tests/species-index.test.ts`, and `src/tests/validate-species.test.ts` already exist and will be extended (not created) for the new trait fields.
- No new framework install required.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Trait definition-list renders on a real species detail page with provenance tooltips; index/genus/subgenus badges render and are scannable | TRAIT-UI-01..04 | Visual/interaction correctness (UI hint: yes — phase requires UAT) | `npm run dev`, open `/species/{a-specialist-species}/` and `/species/` index + a genus page; confirm trait rows omit absent traits, clepto hosts link where pages exist, badges show sociality + specialist, `title=` tooltips name the source |
| Transition nightly lands trait columns in S3 without tripping the byte-stability gate | TRAIT-UI-05 | One-time operator action on maderas (data-before-code release) | Operator runs `SKIP_INTEGRATION_GATE=1 bash data/nightly.sh` once after the species.json shape change ships |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references (none — existing infra)
- [ ] No watch-mode flags
- [ ] Feedback latency < 60s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
