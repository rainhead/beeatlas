---
phase: 33
slug: test-infrastructure
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-04-04
---

# Phase 33 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest 4.x (being installed in this phase) |
| **Config file** | `frontend/vite.config.ts` (`test:` block added in Wave 1) |
| **Quick run command** | `cd frontend && npm test` |
| **Full suite command** | `cd frontend && npm test` |
| **Estimated runtime** | ~2 seconds |

---

## Sampling Rate

- **After every task commit:** Run `cd frontend && npm test`
- **After every plan wave:** Run `cd frontend && npm test`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 5 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 33-01-01 | 01 | 1 | TEST-01 | install | `cd frontend && npm test` | ❌ W0 | ⬜ pending |
| 33-01-02 | 01 | 1 | TEST-01 | config | `cd frontend && npm test` | ❌ W0 | ⬜ pending |
| 33-01-03 | 01 | 1 | TEST-01 | unit | `cd frontend && npm test` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `frontend/src/smoke.test.ts` — trivial passing test stub (the phase creates this)
- [ ] `vitest` + `happy-dom` installed in `frontend/package.json`
- [ ] `test:` block in `frontend/vite.config.ts`

*Note: This phase IS the Wave 0 — test infrastructure does not exist prior to execution.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| `npm test` exits non-zero on failure | TEST-01 | Requires introducing a deliberate failing test | Add `expect(1).toBe(2)` temporarily; confirm exit code 1; restore |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 5s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
