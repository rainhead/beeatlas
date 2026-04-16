---
phase: 57
slug: sidebar-display
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-04-15
---

# Phase 57 — Validation Strategy

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
| 57-01-01 | 01 | 1 | ELEV-05 | — | N/A | unit | `cd frontend && npm test -- --run` | ✅ | ⬜ pending |
| 57-01-02 | 01 | 1 | ELEV-05 | — | N/A | unit | `cd frontend && npm test -- --run` | ✅ | ⬜ pending |
| 57-01-03 | 01 | 2 | ELEV-06 | — | N/A | unit | `cd frontend && npm test -- --run` | ✅ | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

*Existing infrastructure covers all phase requirements.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Elevation row absent when null | ELEV-05 | Requires real DuckDB data in browser | Click a specimen with no elevation_m; verify no Elevation row appears in sidebar |
| Elevation row shows integer format | ELEV-05 | Visual verification | Click a specimen with elevation_m set; verify "1219 m" format (no decimal) |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 15s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
