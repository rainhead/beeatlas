---
phase: 52
slug: header-component
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-04-13
---

# Phase 52 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest |
| **Config file** | `frontend/vite.config.ts` |
| **Quick run command** | `cd frontend && npm test -- --run` |
| **Full suite command** | `cd frontend && npm test -- --run` |
| **Estimated runtime** | ~5 seconds |

---

## Sampling Rate

- **After every task commit:** Run `cd frontend && npm test -- --run`
- **After every plan wave:** Run `cd frontend && npm test -- --run`
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 10 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 52-01-01 | 01 | 1 | HDR-01 | — | N/A | unit | `cd frontend && npm test -- --run` | ❌ W0 | ⬜ pending |
| 52-01-02 | 01 | 1 | HDR-02 | — | N/A | unit | `cd frontend && npm test -- --run` | ❌ W0 | ⬜ pending |
| 52-01-03 | 01 | 1 | HDR-03 | — | N/A | unit | `cd frontend && npm test -- --run` | ❌ W0 | ⬜ pending |
| 52-01-04 | 01 | 2 | HDR-04 | — | N/A | manual | Visual viewport resize check | — | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `frontend/src/bee-header.test.ts` — stubs for HDR-01, HDR-02, HDR-03
- [ ] Existing `frontend/vite.config.ts` — vitest config already present

*Wave 0 only creates test stubs; existing vitest infrastructure is sufficient.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Hamburger collapses tabs on narrow viewport | HDR-04 | Requires browser resize; no headless DOM resize in vitest | Resize browser to <640px, confirm hamburger appears; click to expand, verify all tabs visible |
| URL params round-trip through header controls | HDR-01, HDR-03 | Requires browser navigation state | Click layer tab, verify `lm=` param updates; click view icon, verify `view=` param updates |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 10s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
