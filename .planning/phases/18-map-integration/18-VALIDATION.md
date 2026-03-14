---
phase: 18
slug: map-integration
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-14
---

# Phase 18 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest (frontend TypeScript) |
| **Config file** | frontend/vite.config.ts |
| **Quick run command** | `cd frontend && npx tsc --noEmit` |
| **Full suite command** | `cd frontend && npx tsc --noEmit && npm run build` |
| **Estimated runtime** | ~10 seconds |

---

## Sampling Rate

- **After every task commit:** Run `cd frontend && npx tsc --noEmit`
- **After every plan wave:** Run `cd frontend && npx tsc --noEmit && npm run build`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 10 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 18-01-01 | 01 | 1 | MAP-09 | type-check | `cd frontend && npx tsc --noEmit` | ✅ | ⬜ pending |
| 18-01-02 | 01 | 1 | MAP-09 | build | `cd frontend && npm run build` | ✅ | ⬜ pending |
| 18-02-01 | 02 | 2 | MAP-10 | type-check | `cd frontend && npx tsc --noEmit` | ✅ | ⬜ pending |
| 18-02-02 | 02 | 2 | MAP-10, FILTER-05 | build | `cd frontend && npm run build` | ✅ | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

Existing infrastructure covers all phase requirements. No new test files needed — TypeScript type-checking and build validation are the primary automated gates for this UI-wiring phase.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Floating toggle renders in top-right, styled correctly | MAP-09 | Browser rendering | Load app, verify toggle appears at top-right of map |
| Clicking Off / Counties / Ecoregions updates overlay visibility | MAP-09 | Browser interaction | Click each button, verify boundary layer shows/hides |
| Polygon click adds region to filter, map repaints | MAP-10 | Browser interaction | Click a county polygon, verify specimen points outside filter disappear |
| Specimen/sample clicks take priority over polygon | MAP-10 | Browser interaction | Click a specimen dot inside a polygon, verify specimen sidebar (not region) shows |
| URL bm=, counties=, ecor= round-trip | FILTER-05 | Browser URL check | Apply region filter, copy URL, paste in new tab, verify same state restores |
| Clicking outside polygons clears region filter | MAP-10 | Browser interaction | Select a region, click open map, verify filter clears |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 10s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
