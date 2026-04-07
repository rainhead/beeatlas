---
phase: 37
slug: sidebar-decomposition
status: complete
nyquist_compliant: true
wave_0_complete: true
created: 2026-04-04
audited: 2026-04-06
---

# Phase 37 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest 4.1.2 |
| **Config file** | `frontend/vitest.config.ts` |
| **Quick run command** | `cd frontend && npm test -- --run` |
| **Full suite command** | `cd /Users/rainhead/dev/beeatlas/frontend && npm test -- --run` |
| **Estimated runtime** | ~535ms |

---

## Sampling Rate

- **After every task commit:** Run `cd frontend && npm test -- --run`
- **After every plan wave:** Run `cd /Users/rainhead/dev/beeatlas/frontend && npm test -- --run`
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** ~1 second

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 37-01-T1 | 01 | 1 | DECOMP-01 | T-37-01 | filter values still flow through buildFilterSQL() escaping — no new injection path | source-analysis | `cd frontend && npm test -- --run` | ✅ | ✅ green |
| 37-01-T1 | 01 | 1 | DECOMP-02 | T-37-02 | Lit auto-escapes all rendered Sample data — no new XSS path | source-analysis + render | `cd frontend && npm test -- --run` | ✅ | ✅ green |
| 37-01-T1 | 01 | 1 | DECOMP-03 | T-37-02 | Lit auto-escapes all rendered SampleEvent data — no new XSS path | source-analysis | `cd frontend && npm test -- --run` | ✅ | ✅ green |
| 37-01-T2 | 01 | 1 | DECOMP-04 | — | N/A | source-analysis | `cd frontend && npm test -- --run` | ✅ | ✅ green |
| 37-02-T1 | 02 | 2 | DECOMP-04 | — | N/A | source-analysis | `cd frontend && npm test -- --run` | ✅ | ✅ green |
| 37-03-T1 | 03 | 3 | DECOMP-01/DECOMP-04 | T-37-03-01 | generation counter prevents stale async results from overwriting visibleEcdysisIds | source-analysis | `cd frontend && npm test -- --run` | ✅ | ✅ green |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

Existing infrastructure covers all phase requirements.

Test file `frontend/src/tests/bee-sidebar.test.ts` was created in Plan 01, Task 2 as a Wave 0 deliverable. All 4 DECOMP describe blocks were written before Plan 02 refactored bee-sidebar — providing a red-to-green target.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Filter chip removal produces no visual flicker | DECOMP-04 (race fix) | Async timing behavior requires browser observation; vitest/happy-dom cannot simulate DuckDB query latency | Start `cd frontend && npm run dev`, add county filter, remove chip — verify no flash of unfiltered specimens |
| URL state restores filter inputs after page load | DECOMP-01 | Requires browser popstate + URL parsing; not testable in happy-dom | Apply taxon filter, copy URL, open new tab — filter should restore |
| Browser back/forward restores filter state | DECOMP-01 | Requires browser history API; not testable in happy-dom | Apply filter, navigate back — filter should revert |

---

## Validation Sign-Off

- [x] All tasks have automated verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags
- [x] Feedback latency < 1s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** approved 2026-04-06

---

## Validation Audit 2026-04-06

| Metric | Count |
|--------|-------|
| Gaps found | 1 |
| Resolved | 1 |
| Escalated to manual | 0 |

Gap resolved: `37-03-T1` — added `describe('DECOMP-04-RACE')` source-analysis tests to `bee-sidebar.test.ts` asserting `_filterQueryGeneration` field presence and guard line. All 63 tests green.
