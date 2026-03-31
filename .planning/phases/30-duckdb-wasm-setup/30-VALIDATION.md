---
phase: 30
slug: duckdb-wasm-setup
status: draft
nyquist_compliant: false
wave_0_complete: true
created: 2026-03-31
---

# Phase 30 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | None (frontend has no unit test setup) |
| **Config file** | none — no new test files needed this phase |
| **Quick run command** | `cd frontend && npm run build` |
| **Full suite command** | `cd frontend && npm run build` + manual browser smoke test |
| **Estimated runtime** | ~15 seconds (build) |

---

## Sampling Rate

- **After every task commit:** Run `cd frontend && npm run build` (TypeScript compile gate, must exit 0)
- **After every plan wave:** Run build + open browser devtools and run `SELECT COUNT(*) FROM ecdysis` in DuckDB console
- **Before `/gsd:verify-work`:** Full browser smoke test — all four tables queryable, loading overlay behavior correct

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 30-01-01 | 01 | 1 | DUCK-04 | build | `cd frontend && npm run build` | ✅ | ⬜ pending |
| 30-01-02 | 01 | 1 | DUCK-01 | build+smoke | `cd frontend && npm run build` + devtools | ✅ | ⬜ pending |
| 30-01-03 | 01 | 1 | DUCK-02 | build+smoke | `cd frontend && npm run build` + devtools | ✅ | ⬜ pending |
| 30-01-04 | 01 | 1 | DUCK-03 | build+visual | `cd frontend && npm run build` + browser | ✅ | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

None — existing `npm run build` infrastructure covers all phase requirements. No new test files needed.

*Existing infrastructure covers all phase requirements.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| `SELECT COUNT(*) FROM ecdysis` > 45000 | DUCK-01 | Browser runtime — DuckDB WASM executes in browser, not Node | Open devtools → `window.__duckdb` or expose db in console → run query |
| `SELECT COUNT(*) FROM samples` > 9000 | DUCK-01 | Browser runtime | Same as above |
| `SELECT COUNT(*) FROM counties` non-zero | DUCK-02 | Browser runtime | Same as above |
| `SELECT COUNT(*) FROM ecoregions` non-zero | DUCK-02 | Browser runtime | Same as above |
| Loading overlay visible during init, gone after tables ready | DUCK-03 | Visual browser behavior | Throttle network in devtools → reload → observe overlay lifecycle |
| No COOP/COEP errors in devtools console | DUCK-04 | Browser console check | Open devtools Console tab, reload, verify no SharedArrayBuffer or cross-origin errors |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify (`npm run build`) or manual smoke steps documented
- [ ] Sampling continuity: build gate after every task commit
- [ ] Wave 0 covers all MISSING references — no missing infrastructure
- [ ] No watch-mode flags
- [ ] Feedback latency < 20s (build is ~15s)
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
