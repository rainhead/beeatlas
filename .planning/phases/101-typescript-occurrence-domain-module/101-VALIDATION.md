---
phase: 101
slug: typescript-occurrence-domain-module
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-05-18
---

# Phase 101 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest |
| **Config file** | `vite.config.ts` (Vitest configured inline) |
| **Quick run command** | `npm test -- --reporter=verbose src/occurrence.test.ts` |
| **Full suite command** | `npm test` |
| **Estimated runtime** | ~10 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npm test -- --reporter=verbose src/occurrence.test.ts`
- **After every plan wave:** Run `npm test`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 10 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 101-01-01 | 01 | 0 | TS-03 | — | N/A | unit | `npm test -- src/occurrence.test.ts` | ❌ W0 | ⬜ pending |
| 101-01-02 | 01 | 1 | TS-01 | — | N/A | unit | `npm test -- src/occurrence.test.ts` | ✅ | ⬜ pending |
| 101-01-03 | 01 | 1 | TS-02 | — | N/A | unit | `npm test -- src/occurrence.test.ts` | ✅ | ⬜ pending |
| 101-01-04 | 01 | 2 | TS-01 | — | N/A | integration | `npm test` | ✅ | ⬜ pending |
| 101-01-05 | 01 | 2 | TS-02 | — | N/A | integration | `npm test` | ✅ | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `src/occurrence.test.ts` — stubs for TS-03 (occIdFromRow, parseOccId, isSpecimenBacked, isSampleOnly, isProvisional)

*Existing Vitest infrastructure covers all phase requirements.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| grep confirms no inline ID construction | TS-01 | Filesystem grep assertion | `grep -r '"ecdysis:"' src/` returns only `src/occurrence.ts` |
| grep confirms no inline inat construction | TS-01 | Filesystem grep assertion | `grep -r '"inat:"' src/` returns only `src/occurrence.ts` |
| No inline discriminant conditions remain | TS-02 | Source audit | Verify `bee-occurrence-detail.ts`, `bee-atlas.ts` use named predicates |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 10s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
