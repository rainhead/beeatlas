---
phase: 36
slug: bee-atlas-root-component
status: draft
nyquist_compliant: true
wave_0_complete: false
created: 2026-04-04
---

# Phase 36 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest |
| **Config file** | `frontend/vite.config.ts` (test block) |
| **Quick run command** | `cd frontend && npm test -- --run` |
| **Full suite command** | `cd frontend && npm test -- --run` |
| **Estimated runtime** | ~5 seconds |

---

## Sampling Rate

- **After every task commit:** Run `cd frontend && npm test -- --run`
- **After every plan wave:** Run `cd frontend && npm test -- --run`
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** ~5 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 36-01-01 | 01 | 1 | ARCH-01 | — | N/A | build | `cd frontend && npm run build` | ❌ W0 | ⬜ pending |
| 36-01-02 | 01 | 1 | ARCH-02 | — | N/A | unit | `cd frontend && npm test -- --run` | ❌ W0 | ⬜ pending |
| 36-01-03 | 01 | 2 | ARCH-03 | — | N/A | unit | `cd frontend && npm test -- --run` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `frontend/src/tests/bee-atlas.test.ts` — stubs for ARCH-01, ARCH-02, ARCH-03

*Existing vitest infrastructure covers the framework; only test files are needed.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Map renders correctly with data in browser | ARCH-01 | Requires live DuckDB WASM + CloudFront data | Load app, confirm specimen dots appear, click cluster, sidebar shows details |
| Filter state propagates correctly end-to-end | ARCH-03 | Full event flow requires browser | Apply taxon filter, confirm correct dots remain; clear filters, all dots return |
| URL round-trip after refactor | ARCH-02 | Requires browser history API | Copy URL with filter params, open new tab, confirm same state |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 5s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
