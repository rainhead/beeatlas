---
phase: 64
slug: occurrencesource
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-04-17
---

# Phase 64 — Validation Strategy

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
| 64-01-01 | 01 | 1 | OCC-07 | — | N/A | unit | `cd frontend && npm test -- --run src/tests/bee-atlas.test.ts` | ✅ | ⬜ pending |
| 64-01-02 | 01 | 1 | OCC-07 | — | N/A | unit | `cd frontend && npm test -- --run src/tests/url-state.test.ts` | ✅ | ⬜ pending |
| 64-02-01 | 02 | 2 | OCC-07 | — | N/A | unit | `cd frontend && npm test -- --run` | ✅ | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

Existing infrastructure covers all phase requirements.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Map renders clusters from single source | OCC-07 | Requires browser/OL rendering | Open dev server, verify all occurrences render with correct IDs |
| URL centroid+radius encode/decode round-trip | OCC-07 | End-to-end URL state | Click cluster, copy URL, reload, verify sidebar shows correct records |
| Cluster tap targets ≥44px | OCC-07 | Visual/touch UI | Open on mobile or mobile emulator, verify cluster dots are large enough |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 15s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
