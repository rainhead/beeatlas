---
phase: 60
slug: wa-sqlite-integration
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-04-16
---

# Phase 60 — Validation Strategy

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
- **Before `/gsd-verify-work`:** Full suite must be green (all 165 tests pass)
- **Max feedback latency:** ~10 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 60-01-01 | 01 | 1 | — | — | N/A | unit | `cd frontend && npm test -- --run` | ✅ | ⬜ pending |
| 60-01-02 | 01 | 1 | — | — | N/A | unit | `cd frontend && npm test -- --run` | ✅ | ⬜ pending |
| 60-01-03 | 01 | 1 | — | — | N/A | unit | `cd frontend && npm test -- --run` | ✅ | ⬜ pending |
| 60-02-01 | 02 | 2 | — | — | N/A | unit | `cd frontend && npm test -- --run` | ✅ | ⬜ pending |
| 60-02-02 | 02 | 2 | — | — | N/A | unit | `cd frontend && npm test -- --run` | ✅ | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- Existing infrastructure covers all phase requirements.

*Tests exist for duckdb.ts, filter.ts, bee-atlas.ts — mocks need path updates from `'../duckdb.ts'` to `'../sqlite.ts'` as part of implementation.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| BENCHMARK.md wa-sqlite column filled | Success criterion 6 | Performance measurement requires real browser | Run dev server, open browser, open DevTools → Performance tab, record page load, record init/query/heap metrics, fill BENCHMARK.md |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 10s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
