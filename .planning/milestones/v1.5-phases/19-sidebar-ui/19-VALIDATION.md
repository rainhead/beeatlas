---
phase: 19
slug: sidebar-ui
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-18
---

# Phase 19 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest (existing) |
| **Config file** | `frontend/vite.config.ts` |
| **Quick run command** | `npm run typecheck` (from `frontend/`) |
| **Full suite command** | `npm run build` (from project root) |
| **Estimated runtime** | ~5 seconds (typecheck), ~15 seconds (build) |

---

## Sampling Rate

- **After every task commit:** Run `npm run typecheck`
- **After every plan wave:** Run `npm run build`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 15 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 19-01-01 | 01 | 1 | FILTER-03 | type-check | `npm run typecheck` | ✅ | ⬜ pending |
| 19-01-02 | 01 | 1 | FILTER-04 | type-check | `npm run typecheck` | ✅ | ⬜ pending |
| 19-01-03 | 01 | 1 | FILTER-06 | type-check | `npm run typecheck` | ✅ | ⬜ pending |
| 19-02-01 | 02 | 2 | FILTER-03, FILTER-04 | build | `npm run build` | ✅ | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

Existing infrastructure covers all phase requirements — vitest + TypeScript type-checking already configured.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Typing in county autocomplete shows matching county names | FILTER-03 | Browser datalist interaction | Open app, type "King" in county input, confirm dropdown shows "King County" |
| Selecting ecoregion adds chip with "ecoregion" type label | FILTER-04 | Visual chip rendering | Select "Cascades" from ecoregion input, confirm chip shows "Cascades · ecoregion" |
| Removing chip deselects region and map updates | FILTER-03, FILTER-04 | Map interaction | Click × on a county chip, confirm map immediately re-renders with expanded specimen set |
| Clear filters removes all region chips | FILTER-06 | Multi-state reset | Add county + ecoregion chips, click "Clear filters", confirm all chips gone and filter cleared |
| Boundary toggle in sidebar controls region layer | Context | UI interaction | Click Counties in sidebar toggle, confirm county boundaries appear on map |
| Floating toggle removed from map | Context | Visual inspection | Confirm no Off/Counties/Ecoregions button group floats on map corner |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 15s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
