---
phase: 72
slug: boundaries-and-interaction
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-04-27
---

# Phase 72 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 4.1.2 |
| **Config file** | `frontend/vite.config.ts` (test section) |
| **Quick run command** | `cd frontend && npx vitest run --reporter=verbose` |
| **Full suite command** | `cd frontend && npm test` |
| **Estimated runtime** | ~5 seconds |

---

## Sampling Rate

- **After every task commit:** Run `cd frontend && npx vitest run --reporter=verbose`
- **After every plan wave:** Run `cd frontend && npm test`
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 5 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 72-01-01 | 01 | 1 | SC-1 | — | N/A | manual | — | N/A | ⬜ pending |
| 72-01-02 | 01 | 1 | SC-2 | — | N/A | unit | `npx vitest run src/tests/bee-atlas.test.ts` | ❌ W0 | ⬜ pending |
| 72-01-03 | 01 | 1 | SC-3 | — | N/A | manual | — | N/A | ⬜ pending |
| 72-01-04 | 01 | 1 | SC-4/D-01 | — | N/A | unit | `npx vitest run src/tests/bee-atlas.test.ts` | ❌ W0 | ⬜ pending |
| 72-01-05 | 01 | 1 | SC-5 | — | N/A | unit | `npx vitest run src/tests/bee-atlas.test.ts` | ❌ W0 | ⬜ pending |
| 72-01-06 | 01 | 1 | SC-6 | — | N/A | unit | `npx vitest run src/tests/bee-atlas.test.ts` | ❌ W0 | ⬜ pending |
| 72-01-07 | 01 | 1 | SC-7 | — | N/A | unit | `npx vitest run src/tests/bee-atlas.test.ts` | ✅ | ⬜ pending |
| 72-01-08 | 01 | 1 | SC-8/D-02 | — | N/A | unit | `npx vitest run src/tests/bee-atlas.test.ts` | ✅ | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] Update mapbox-gl mock to include `addInteraction`, `removeInteraction`, `setLayoutProperty`, `setFeatureState`, `removeFeatureState` methods
- [ ] Add mock for `fetch` to return boundary GeoJSON test fixtures
- [ ] New test: boundary mode toggle calls setLayoutProperty for correct layers
- [ ] New test: cluster click handler emits map-click-occurrence (requires mock getClusterLeaves on source)

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| County/ecoregion GeoJSON render as fill+line layers | SC-1 | Visual rendering verification | Toggle boundary mode, verify polygons visible |
| Selected boundaries highlight with blue fill/stroke | SC-3 | Visual styling verification | Click region polygon, verify blue highlight |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 5s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
