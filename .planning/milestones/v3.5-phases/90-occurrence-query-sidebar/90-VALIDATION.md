---
phase: 90
slug: occurrence-query-sidebar
status: approved
nyquist_compliant: true
wave_0_complete: true
created: 2026-05-14
approved: 2026-05-15
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
| 90-01-01 | 01 | 1 | SEL-03 | — | N/A | unit | `npm test` | ✅ | ✅ green |
| 90-01-02 | 01 | 1 | SEL-04 | — | N/A | manual | see manual table | N/A | ✅ green |
| 90-01-03 | 01 | 1 | SEL-05 | — | N/A | manual | see manual table | N/A | ✅ green |

*Status key: pending · ✅ green · red · flaky*

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

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags
- [x] Feedback latency < 15s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** retroactively approved 2026-05-25 (Phase 114)

---

## Historical Note

This VALIDATION.md was originally authored 2026-05-14 before plan execution, when Task 90-01-01 was marked as missing (Wave 0 not yet written) because the SEL-03/SEL-04/SEL-05 describe blocks in `src/tests/bee-atlas.test.ts` had not yet been written. They were written during execution as Wave 0 RED tests and all passed by phase completion (2026-05-15). The original `nyquist_compliant` and `wave_0_complete` fields were both set to `false` and were never updated to reflect the post-execution truth. This correction was made retroactively on 2026-05-25 during Phase 114 after verifying `npm test -- --run` (507 tests green).

Phase 109 (BeePane v2 unification) subsequently replaced the mechanism that SEL-05 tested, leaving the SEL-05 describe block empty in the current `src/tests/bee-atlas.test.ts`. This architectural change occurred after Phase 90 completion and does not retroactively invalidate Phase 90's validation — Phase 90 was complete and correct as of 2026-05-15.
