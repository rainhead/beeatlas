---
phase: 17
slug: frontend-data-layer
status: draft
nyquist_compliant: true
wave_0_complete: true
created: 2026-03-14
---

# Phase 17 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | None — no frontend test runner installed |
| **Automated gate** | `cd /Users/rainhead/dev/beeatlas/frontend && npm run build` (TypeScript compile + Vite build) |
| **Quick run command** | `cd /Users/rainhead/dev/beeatlas/frontend && npm run build` |
| **Full suite command** | `cd /Users/rainhead/dev/beeatlas/frontend && npm run build` |
| **Estimated runtime** | ~15 seconds |

No vitest, jest, or other frontend test runner is present in `frontend/package.json`. The TypeScript compiler (`tsc`) enforced by Vite build catches interface violations, missing properties, and type errors — this is the sole automated gate for Phase 17.

---

## Sampling Rate

- **After every task commit:** Run `cd /Users/rainhead/dev/beeatlas/frontend && npm run build`
- **After every plan wave:** Run `cd /Users/rainhead/dev/beeatlas/frontend && npm run build`
- **Before `/gsd:verify-work`:** Build must be green + browser console verification complete
- **Max feedback latency:** ~15 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | Status |
|---------|------|------|-------------|-----------|-------------------|--------|
| 17-01 T1 | 01 | 1 | Parquet county/ecoregion_l3 columns on specimen and sample features | build (type-check) | `cd /Users/rainhead/dev/beeatlas/frontend && npm run build` | ⬜ pending |
| 17-01 T2 | 01 | 1 | FilterState selectedCounties/selectedEcoregions; isFilterActive; matchesFilter | build (type-check) | `cd /Users/rainhead/dev/beeatlas/frontend && npm run build` | ⬜ pending |
| 17-02 T1 | 02 | 2 | region-layer.ts exports regionLayer, countySource, ecoregionSource, boundaryStyle | build (type-check) | `cd /Users/rainhead/dev/beeatlas/frontend && npm run build` | ⬜ pending |
| 17-02 T2 | 02 | 2 | Browser: county + ecoregion_l3 on OL features; no JS errors | checkpoint:human-verify | `cd /Users/rainhead/dev/beeatlas/frontend && npm run build` (pre-check) | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

None — `npm run build` infrastructure exists. No test framework scaffold needed.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Browser console shows county and ecoregion_l3 on specimen OL features | Phase 17 SC-1 | Requires live Parquet load in browser | Open browser console after `npm run dev`, run `specimenSource.getFeatures()[0].get('county')` and `.get('ecoregion_l3')` |
| Browser console shows county and ecoregion_l3 on sample OL features | Phase 17 SC-1 | Requires live Parquet load in browser | Open browser console after `npm run dev`, inspect sample feature properties |
| Clicking polygon interior registers hit | Phase 17 SC-3 | Requires OL rendering in browser | Phase 18 — region-layer not wired to map in Phase 17 |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify commands
- [x] No Wave 0 stubs required — build infrastructure exists
- [x] No vitest/jest references — framework not installed
- [x] No watch-mode flags
- [x] Feedback latency < 30s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
