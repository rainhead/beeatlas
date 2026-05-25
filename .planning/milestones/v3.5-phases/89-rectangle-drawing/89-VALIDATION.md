---
phase: 89
slug: rectangle-drawing
status: approved
nyquist_compliant: true
wave_0_complete: true
created: 2026-05-14
approved: 2026-05-15
---

# Phase 89 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest |
| **Config file** | vite.config.ts |
| **Quick run command** | `npm test -- --run` |
| **Full suite command** | `npm test` |
| **Estimated runtime** | ~10 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npm test -- --run`
- **After every plan wave:** Run `npm test`
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 30 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 89-01-01 | 01 | 1 | SEL-01, SEL-02 | — | N/A | tdd | `npm test -- --run 2>&1 \| grep -E "(SEL-01\|SEL-02)" \| head -20` | ✅ | ⬜ pending |
| 89-01-02 | 01 | 1 | SEL-01, SEL-02 | — | N/A | tdd | `npm test -- --run 2>&1 \| tail -40` | ✅ | ⬜ pending |
| 89-01-03 | 01 | 1 | SEL-01 | — | N/A | unit | `npm test -- --run 2>&1 \| tail -20 && npx tsc --noEmit 2>&1 \| tail -20` | ✅ | ⬜ pending |
| 89-01-04 | 01 | 1 | SEL-01, SEL-02 | — | N/A | manual | n/a (human verify checkpoint) | ✅ | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- Existing infrastructure covers all phase requirements.

*The phase is primarily a visual gesture handler; no new test infrastructure needed.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Shift-drag draws rectangle tracking cursor in real time | SEL-02 | Visual gesture requires browser interaction | Open dev server, hold Shift, click and drag on map, verify rectangle outline appears and tracks cursor |
| BoxZoomHandler disabled (no zoom on shift-drag) | SEL-01 | Requires browser UI interaction | Hold Shift, drag on map, verify map does NOT zoom in on release |
| Releasing drag removes rectangle | SEL-01 | Visual ephemeral behavior | After shift-drag, verify rectangle disappears on mouseup |
| Plain drag pans normally | SEL-01 | Regression check via browser | Drag without Shift, verify map pans as expected |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags
- [x] Feedback latency < 30s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** retroactively approved 2026-05-25 (Phase 114)
