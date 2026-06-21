---
phase: 153
slug: occurrences-near-me
status: draft
nyquist_compliant: false
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

> Filled by the planner against the final PLAN.md task IDs. Rows below capture the requirement→verification intent the planner must honor.

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| TBD | 01 | 1 | NEAR-01 | — | N/A | unit | `npm test` | ✅ | ⬜ pending |
| TBD | 01 | 1 | NEAR-02 | — | N/A | unit | `npm test` | ✅ | ⬜ pending |
| TBD | 01 | 1 | NEAR-03 | — | N/A | unit | `npm test` | ✅ | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

*Existing infrastructure covers all phase requirements (Vitest is already configured; no new framework install needed).*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Tapping "Near me" triggers the OS geolocation prompt and, on a real GPS fix, filters to occurrences within 10 km | NEAR-01 | Requires a real device GPS fix and OS permission flow — not simulable in jsdom/Vitest | On a phone at a known location, open `/app`, tap "Near me", grant location, confirm map/list narrows to nearby occurrences |
| Denied/unavailable location surfaces the Phase 152 toast and leaves the chip inactive | NEAR-01 | Real permission-denied OS state | Deny location permission, tap "Near me", confirm toast appears and chip does not activate |
| `<200 ms` proximity query on the full occurrence set (timing log) | NEAR-02 | Performance assertion against the live worker + full DB | Activate "Near me", read the timing log in the console; confirm reported query time is under 200 ms |

*The proximity SQL (bbox + haversine), AND-composition logic, URL round-trip (`?near=1` parse/serialize), and the frozen-position one-shot activation flag are all unit-testable in Vitest.*

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
