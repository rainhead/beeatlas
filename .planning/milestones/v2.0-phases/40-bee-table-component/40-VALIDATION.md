---
phase: 40
slug: bee-table-component
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-04-07
---

# Phase 40 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest |
| **Config file** | frontend/vite.config.ts |
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
| 40-01-01 | 01 | 0 | TABLE-01 | — | N/A | unit | `cd frontend && npm test -- --run` | ❌ W0 | ⬜ pending |
| 40-01-02 | 01 | 1 | TABLE-02 | — | N/A | unit | `cd frontend && npm test -- --run` | ❌ W0 | ⬜ pending |
| 40-01-03 | 01 | 1 | TABLE-03 | — | N/A | unit | `cd frontend && npm test -- --run` | ❌ W0 | ⬜ pending |
| 40-01-04 | 01 | 2 | TABLE-04 | — | N/A | unit | `cd frontend && npm test -- --run` | ❌ W0 | ⬜ pending |
| 40-01-05 | 01 | 2 | TABLE-05 | — | N/A | unit | `cd frontend && npm test -- --run` | ❌ W0 | ⬜ pending |
| 40-01-06 | 01 | 3 | TABLE-06 | — | N/A | unit | `cd frontend && npm test -- --run` | ❌ W0 | ⬜ pending |
| 40-01-07 | 01 | 3 | TABLE-07 | — | N/A | manual | Visual verification in browser | — | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `frontend/src/components/bee-table.test.ts` — stubs for TABLE-01 through TABLE-07
- [ ] Vitest already installed — no new framework needed

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Column header sort click toggles direction | TABLE-05 | Requires real DuckDB WASM interaction | Click column header twice, verify row order reverses |
| Row count indicator accuracy under filter | TABLE-03 | Requires integration with filter state | Apply filter, verify count matches map dots |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 15s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
