---
phase: 119
slug: map-display-source-filter-detail-view
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-05-25
---

# Phase 119 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 2.x (happy-dom environment) |
| **Config file** | `vite.config.ts` (test section) |
| **Quick run command** | `npm test` |
| **Full suite command** | `npm test` |
| **Estimated runtime** | ~10 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npm test`
- **After every plan wave:** Run `npm test`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** ~10 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 119-01-01 | 01 | 0 | MAP-03 | — | Source values validated against fixed enum during URL parsing | unit | `npm test` | ❌ W0 | ⬜ pending |
| 119-01-02 | 01 | 0 | MAP-01 | — | N/A | unit | `npm test` | ❌ W0 | ⬜ pending |
| 119-01-03 | 01 | 0 | MAP-02 | — | N/A | unit | `npm test` | ❌ W0 | ⬜ pending |
| 119-01-04 | 01 | 0 | DET-01 | — | N/A | unit | `npm test` | ❌ W0 | ⬜ pending |
| 119-xx-xx | TBD | 1 | MAP-01 | — | N/A | unit | `npm test` | ✅ | ⬜ pending |
| 119-xx-xx | TBD | 1 | MAP-02 | — | N/A | unit | `npm test` | ✅ | ⬜ pending |
| 119-xx-xx | TBD | 1 | MAP-03 | — | N/A | unit | `npm test` | ✅ | ⬜ pending |
| 119-xx-xx | TBD | 1 | DET-01 | — | N/A | unit | `npm test` | ✅ | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `src/tests/url-state.test.ts` — add MAP-03 tests: `src=ecdysis` round-trips, `src` absent when empty, multiple hidden sources
- [ ] `src/tests/bee-atlas.test.ts` — add MAP-01 test: `bee-map.ts` contains amber `#e8a020` in `unclustered-point` paint; add MAP-02 test: `bee-pane.ts` contains `source-filter-changed`; add DET-01 test: `bee-occurrence-detail.ts` dispatches `_renderInatObs` for `source === 'inat_obs'`
- [ ] `src/tests/bee-pane.test.ts` — add MAP-02 test: `bee-pane.ts` has `hiddenSources` property; contains checkboxes for all three sources

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| iNat obs amber points visible on map | MAP-01 | Visual; Mapbox GL renders at runtime | Load dev server, navigate to a location with iNat obs; confirm amber/gold points distinct from gray Ecdysis/WABA |
| Source toggle hides points immediately | MAP-02 | Runtime Mapbox filter behavior | Toggle each checkbox; confirm points disappear/reappear without page reload |
| URL src param shared URL restores state | MAP-03 | Browser navigation behavior | Check a source, copy URL, paste in new tab; confirm same sources hidden |
| iNat obs detail view renders correctly | DET-01 | UI rendering | Click an amber point; confirm observer, date, host (if present), image (if CC), iNat link |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 15s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
