---
phase: 65
slug: ui-unification
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-04-17
---

# Phase 65 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest |
| **Config file** | `frontend/vite.config.ts` |
| **Quick run command** | `cd frontend && npm test -- --run` |
| **Full suite command** | `cd frontend && npm test -- --run` |
| **Estimated runtime** | ~10 seconds |

---

## Sampling Rate

- **After every task commit:** Run `cd frontend && npm test -- --run`
- **After every plan wave:** Run `cd frontend && npm test -- --run`
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 15 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 65-01-01 | 01 | 1 | OCC-08 | — | N/A | unit | `cd frontend && npm test -- --run filter.test.ts` | ✅ | ⬜ pending |
| 65-01-02 | 01 | 1 | OCC-09 | — | N/A | unit | `cd frontend && npm test -- --run bee-atlas.test.ts` | ✅ | ⬜ pending |
| 65-01-03 | 01 | 1 | OCC-10 | — | N/A | unit | `cd frontend && npm test -- --run bee-table.test.ts` | ✅ | ⬜ pending |
| 65-02-01 | 02 | 2 | OCC-08 | — | N/A | unit | `cd frontend && npm test -- --run bee-occurrence-detail.test.ts` | ❌ W0 | ⬜ pending |
| 65-02-02 | 02 | 2 | OCC-09 | — | N/A | unit | `cd frontend && npm test -- --run bee-sidebar.test.ts` | ✅ | ⬜ pending |
| 65-02-03 | 02 | 2 | OCC-10 | — | N/A | unit | `cd frontend && npm test -- --run` | ✅ | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `frontend/src/tests/bee-occurrence-detail.test.ts` — stubs for OCC-08 (new component tests)

*Existing vitest infrastructure covers all other phase requirements.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Layer-switching toggle absent from UI | OCC-09 | DOM visual check | Load app, confirm no layer toggle button in `<bee-header>` |
| `<bee-occurrence-detail>` renders specimen+sample mixed clusters correctly | OCC-08 | Visual + click interaction | Click a cluster with both ecdysis and sample-only rows; confirm specimen groups appear first, then sample-only entries below separator |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 15s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
