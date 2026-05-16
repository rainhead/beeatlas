---
phase: 96
slug: index-page-replacement
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-05-16
---

# Phase 96 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest |
| **Config file** | vitest.config.ts |
| **Quick run command** | `npm test -- --run` |
| **Full suite command** | `npm test -- --run` |
| **Estimated runtime** | ~10 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npm test -- --run`
- **After every plan wave:** Run `npm test -- --run`
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 30 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 96-01-01 | 01 | 1 | IDX-01 | — | N/A | build | `npm run build` | ❌ W0 | ⬜ pending |
| 96-01-02 | 01 | 1 | IDX-02 | — | N/A | unit | `npm test -- --run` | ❌ W0 | ⬜ pending |
| 96-01-03 | 01 | 1 | IDX-03 | — | N/A | unit | `npm test -- --run` | ❌ W0 | ⬜ pending |
| 96-01-04 | 01 | 1 | IDX-04 | — | N/A | unit | `npm test -- --run` | ❌ W0 | ⬜ pending |
| 96-01-05 | 01 | 1 | URL-05 | — | N/A | unit | `npm test -- --run` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- Existing infrastructure covers all phase requirements (vitest + build already in place).

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Search input narrows genus/species in real time | IDX-02 | Browser interaction | Load `/species/`, type partial name, observe DOM update |
| Clicking genus navigates to `/species/{Genus}/` | IDX-03 | Browser navigation | Click genus link, verify URL changes |
| Clicking species navigates to `/species/{Genus}/{specificEpithet}/` | IDX-04 | Browser navigation | Click species link, verify URL |
| Old tree-nav + all-cards layout is gone | IDX-01 | Visual verification | Visit `/species/`, confirm no old `bee-taxon-nav` or `bee-species-card` elements |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
