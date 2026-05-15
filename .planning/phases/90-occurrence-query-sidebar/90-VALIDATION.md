---
phase: 90
slug: occurrence-query-sidebar
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-05-14
---

# Phase 90 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest |
| **Config file** | vite.config.ts |
| **Quick run command** | `npm test` |
| **Full suite command** | `npm test` |
| **Estimated runtime** | ~10 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npm test`
- **After every plan wave:** Run `npm test`
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 15 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 90-01-01 | 01 | 1 | SEL-03 | — | N/A | unit | `npm test` | ❌ W0 | ⬜ pending |
| 90-01-02 | 01 | 1 | SEL-04 | — | N/A | manual | see manual table | N/A | ⬜ pending |
| 90-01-03 | 01 | 1 | SEL-05 | — | N/A | manual | see manual table | N/A | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- Existing infrastructure covers all phase requirements (vitest already configured).

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Sidebar opens with matched occurrences after rectangle release | SEL-04 | Requires Mapbox + wa-sqlite interaction in browser | Draw rectangle over known occurrence area; verify sidebar opens with correct entries |
| Zero-match rectangle shows no sidebar, no error | SEL-05 | Requires live map state | Draw rectangle over ocean/empty area; verify sidebar stays closed and no JS error |
| Filter state respected in query | SEL-03 | Requires active filter interaction | Apply a filter, draw rectangle; verify only filtered occurrences appear |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 15s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
