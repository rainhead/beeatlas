---
phase: 38
slug: unit-tests
status: complete
nyquist_compliant: true
wave_0_complete: false
created: 2026-04-06
audited: 2026-04-06
---

# Phase 38 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest 4.1.2 |
| **Config file** | `frontend/vitest.config.ts` |
| **Quick run command** | `cd frontend && npm test -- --run` |
| **Full suite command** | `cd /Users/rainhead/dev/beeatlas/frontend && npm test -- --run` |
| **Estimated runtime** | ~585ms |

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
| 38-01-01 | 01 | 1 | TEST-02 | T-38-01 | No PII in test fixtures; fake taxon/county names | unit | `cd frontend && npx vitest run src/tests/url-state.test.ts` | ✅ | ✅ green |
| 38-01-02 | 01 | 1 | TEST-03 | T-38-02 | buildFilterSQL escaping tested (single-quote doubling) | unit | `cd frontend && npx vitest run src/tests/filter.test.ts` | ✅ | ✅ green |
| 38-02-01 | 02 | 1 | TEST-04 | T-38-03 | No PII in render test fixtures | unit | `cd frontend && npx vitest run src/tests/bee-sidebar.test.ts` | ✅ | ✅ green |
| 38-02-02 | 02 | 1 | TEST-04 | — | N/A | integration | `cd frontend && npm test -- --run` | ✅ | ✅ green |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

Existing infrastructure covers all phase requirements. Vitest + happy-dom was established in Phase 33. No Wave 0 setup needed.

---

## Coverage Summary

| Requirement | Test File | Test Count | Status |
|-------------|-----------|------------|--------|
| TEST-02 | `frontend/src/tests/url-state.test.ts` | 20 tests | ✅ COVERED |
| TEST-03 | `frontend/src/tests/filter.test.ts` | 13 tests | ✅ COVERED |
| TEST-04 | `frontend/src/tests/bee-sidebar.test.ts` (render block) | 2 tests | ✅ COVERED |

**Total: 35 tests in phase 38. Full suite: 63 tests across 4 files, all passing.**

---

## Manual-Only Verifications

All phase behaviors have automated verification.

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify commands
- [x] Sampling continuity: all tasks have automated verify
- [x] Wave 0 not needed — infrastructure from Phase 33 covers all requirements
- [x] No watch-mode flags
- [x] Feedback latency < 1s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** approved 2026-04-06

---

## Validation Audit 2026-04-06

| Metric | Count |
|--------|-------|
| Requirements audited | 3 |
| Gaps found | 0 |
| Resolved | 0 |
| Escalated to manual | 0 |
| Tests passing | 63/63 |
