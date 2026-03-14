---
phase: 17
slug: frontend-data-layer
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-14
---

# Phase 17 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest |
| **Config file** | frontend/vite.config.ts |
| **Quick run command** | `cd frontend && npm run test -- --run` |
| **Full suite command** | `cd frontend && npm run test -- --run` |
| **Estimated runtime** | ~10 seconds |

---

## Sampling Rate

- **After every task commit:** Run `cd frontend && npm run test -- --run`
- **After every plan wave:** Run `cd frontend && npm run test -- --run`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** ~10 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 17-01-01 | 01 | 1 | Parquet county/ecoregion columns | unit | `cd frontend && npm run test -- --run` | ❌ W0 | ⬜ pending |
| 17-02-01 | 02 | 1 | FilterState selectedCounties/selectedEcoregions | unit | `cd frontend && npm run test -- --run` | ❌ W0 | ⬜ pending |
| 17-03-01 | 03 | 2 | region-layer.ts VectorLayer + hit detection | unit | `cd frontend && npm run test -- --run` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `frontend/src/lib/__tests__/parquet.test.ts` — stubs for Parquet column tests
- [ ] `frontend/src/lib/__tests__/filter.test.ts` — stubs for FilterState region tests
- [ ] `frontend/src/lib/__tests__/region-layer.test.ts` — stubs for region-layer tests

*Existing vitest infrastructure detected — no new framework install needed.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Browser console shows county/ecoregion_l3 on OL features | Phase 17 SC1 | Requires live Parquet load in browser | Open browser console after `npm run dev`, inspect a feature's properties |
| Clicking polygon interior registers hit | Phase 17 SC3 | Requires OL rendering in browser | Open map, click inside polygon, confirm click event fires |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 10s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
