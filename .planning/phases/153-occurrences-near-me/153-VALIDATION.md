---
phase: 153
slug: occurrences-near-me
status: draft
nyquist_compliant: true
wave_0_complete: false
created: 2026-06-20
---

# Phase 153 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest |
| **Config file** | `vitest.config.ts` (existing) |
| **Quick run command** | `npm test` |
| **Full suite command** | `npm test && npm run build` |
| **Estimated runtime** | ~30 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npm test`
- **After every plan wave:** Run `npm test && npm run build`
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** ~30 seconds

---

## Per-Task Verification Map

> Filled by the planner against the final PLAN.md task IDs.

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 01-T1 | 01 | 1 | NEAR-01/02/03 | T-153-01 | Coords-never-serialized regression test (privacy) | unit (Wave 0 scaffold) | `npm test -- filter url-state` | ✅ | ⬜ pending |
| 01-T2 | 01 | 1 | NEAR-01, NEAR-02 | T-153-02 | isFinite-guarded numeric interpolation (SQL-injection mitigation); real-engine in-radius haversine count | unit | `npm test -- filter` | ✅ | ⬜ pending |
| 01-T3 | 01 | 1 | NEAR-03 | T-153-01 | `?near=1` boolean round-trip, no coordinate fragment | unit | `npm test -- url-state` | ✅ | ⬜ pending |
| 02-T1 | 02 | 2 | NEAR-01 | T-153-04 | Pure-presenter: `triggerGeolocate()` stores no state; standalone chip + dedicated `near-me-changed` event | unit (source-analysis + component) | `npm test -- bee-pane bee-map` | ✅ | ⬜ pending |
| 02-T2 | 02 | 2 | NEAR-01/02/03 | T-153-01, T-153-03 | Frozen center off FilterState; one-shot deferred query; denial deactivates chip | unit (source-analysis) + build | `npm test && npm run build` | ✅ | ⬜ pending |
| 02-T3 | 02 | 2 | NEAR-01/02/03 | T-153-01, T-153-04 | Privacy/freeze/pure-presenter/dedicated-event invariants asserted in source | unit (source-analysis) | `npm test` | ✅ | ⬜ pending |
| 03-T1 | 03 | 3 | NEAR-02 | T-153-05 | In-app `[near-me]` proximity timing log (measurement surface) | build | `npm test && npm run build` | ✅ | ⬜ pending |
| 03-T2 | 03 | 3 | NEAR-01/02/03 | T-153-01, T-153-05 | UAT checklist authored (six manual-only scenarios) | doc presence | `test -f 153-HUMAN-UAT.md` | ✅ | ⬜ pending |
| 03-T3 | 03 | 3 | NEAR-01/02/03 | T-153-01, T-153-05 | **MANUAL** real-device GPS + <200 ms timing log + URL privacy by eye | human-verify (BLOCKING, no auto-advance) | UAT — see Manual-Only below | ⚠️ | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

*Task IDs are `<plan>-T<n>` (e.g. `01-T2` = plan 153-01, Task 2).*

---

## Wave 0 Requirements

Wave 0 is folded into plan 153-01 Task 1 (it only extends existing Vitest files —
no new framework or harness). It writes the failing tests for:
- `nearMe` in `isFilterActive`; `buildFilterSQL` proximity-clause shape; null-center omission (filter.test.ts)
- real-engine in-radius haversine count against node:sqlite (filter-join-execution.test.ts — verified the engine supports `sin/radians/asin/power/sqrt/cos`)
- `near=1` round-trip + coords-never-serialized assertion (url-state.test.ts)

Each of the three test files' local `emptyFilter()` helper gains `nearMe: false`.

---

## Manual-Only Verifications

> Surfaced in `153-HUMAN-UAT.md` (plan 153-03, Task 3 — BLOCKING human-verify, `auto_advance: false`).

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Tapping "Near me" triggers the OS geolocation prompt and, on a real GPS fix, filters to occurrences within 10 km | NEAR-01 | Requires a real device GPS fix and OS permission flow — not simulable in jsdom/Vitest | On a phone at a known location, open `/app`, tap "Near me", grant location, confirm map/list narrows to nearby occurrences |
| Frozen set on a ~100 m walk; re-tap re-captures | NEAR-02 | Requires physical movement with live GPS | Walk while "Near me" is active; confirm the set does not shift; re-tap to re-capture |
| Denied/unavailable location surfaces the Phase 152 toast and leaves the chip inactive | NEAR-01 | Real permission-denied OS state | Deny location permission, tap "Near me", confirm toast appears and chip does not activate |
| `<200 ms` proximity query on the full occurrence set (timing log) | NEAR-02 | Performance assertion against the live worker + full DB | Activate "Near me", read the `[near-me] proximity query <ms> ms` console line; confirm under 200 ms |
| `?near=1` round-trip + no coordinates in URL (by eye) | NEAR-03 | Visual cross-check of the privacy mitigation on a real address bar | Confirm `?near=1` present and no lat/lon in the URL; reload re-defers; chip-remove clears it |

*The proximity SQL (bbox + haversine), AND-composition logic, URL round-trip (`?near=1` parse/serialize), the location-privacy invariant, and the frozen-position one-shot activation flag are all unit-testable in Vitest (plans 01/02). This file covers only the device-bound behaviors.*

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies (the lone exception is 03-T3, the BLOCKING human-verify checkpoint; its predecessor 03-T2 and the entire 01/02 set are automated)
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references (folded into 01-T1)
- [x] No watch-mode flags
- [x] Feedback latency < 30s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** planner-approved 2026-06-20
