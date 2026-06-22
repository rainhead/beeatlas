---
phase: 157
slug: regions-dropdown-obscured-by-filter-button
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-06-21
---

# Phase 157 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest |
| **Config file** | `vite.config.ts` / `vitest` (existing) |
| **Quick run command** | `npm test` |
| **Full suite command** | `npm test` |
| **Estimated runtime** | ~30–60 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npm test`
- **After every plan wave:** Run `npm test`
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** ~60 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 157-01-01 | 01 | 1 | SC-3 (relocation, invariants) | — | N/A | source-analysis | `npm test` | ✅ src/tests/bee-atlas.test.ts | ⬜ pending |
| 157-01-02 | 01 | 1 | SC-2 (no z-index removal) | — | N/A | source-analysis | `npm test` | ✅ src/tests/bee-atlas.test.ts | ⬜ pending |
| 157-01-03 | 01 | 1 | SC-1, SC-4 (layout + dropdown above pane) | — | N/A | source-analysis + manual UAT | `npm test` | ✅ src/tests/bee-atlas.test.ts | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

*Existing infrastructure covers all phase requirements — vitest + the established `readFileSync` source-analysis pattern in `src/tests/bee-atlas.test.ts` and `src/tests/bee-map.test.ts`. No new framework or fixtures needed.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Regions dropdown fully visible/clickable above the filter button in the collapsed map | SC-1 | Pixel/stacking visibility can't be asserted without a live Mapbox render | Open `/app`, collapsed map, click Regions — all 4 options visible, filter button beside (not under) the menu; wide + narrow layouts |
| Regions dropdown above the expanded list pane | SC-1 | Same | Expand list pane, click Regions — menu fully above the list column |
| Regions dropdown above the expanded table pane; Mapbox attribution NOT bleeding over the table (Phase 108 regression guard) | SC-1, SC-2 | Same | Expand table pane, click Regions — menu above table; bottom-right attribution still visible and contained below the pane |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 60s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
