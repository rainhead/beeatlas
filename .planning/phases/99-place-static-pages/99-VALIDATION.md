---
phase: 99
slug: place-static-pages
status: draft
nyquist_compliant: true
wave_0_complete: true
created: 2026-05-17
---

# Phase 99 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest |
| **Config file** | vite.config.ts |
| **Quick run command** | `npm test` |
| **Full suite command** | `npm run build && npm test` |
| **Estimated runtime** | ~30 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npm test`
- **After every plan wave:** Run `npm run build && npm test`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 30 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 99-01-01 | 01 | 1 | PPAGE-01, PPAGE-02 | — | N/A | edit | manual diff | ✅ | ⬜ pending |
| 99-01-02 | 01 | 1 | PPAGE-01, PPAGE-02 | — | N/A | unit (RED) | `VITEST_SKIP_BUILD=1 npx vitest run src/tests/data-places.test.ts` | ❌ W0 | ⬜ pending |
| 99-01-03 | 01 | 1 | PPAGE-01, PPAGE-02 | — | N/A | build-output (RED) | `npx vitest run src/tests/build-output.test.ts` | ❌ W0 | ⬜ pending |
| 99-02-01 | 02 | 2 | PPAGE-01, PPAGE-02 | — | N/A | unit (GREEN) | `VITEST_SKIP_BUILD=1 npx vitest run src/tests/data-places.test.ts` | ✅ | ⬜ pending |
| 99-02-02 | 02 | 2 | PPAGE-01, PPAGE-02 | — | N/A | build-output (GREEN) | `npm test` | ✅ | ⬜ pending |
| 99-02-03 | 02 | 2 | PPAGE-01, PPAGE-02 | — | N/A | build | `npm run build` | ✅ | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `src/tests/data-places.test.ts` — unit tests for `_data/places.js` export shape (Plan 99-01 Task 2)
- [ ] New assertions in `src/tests/build-output.test.ts` — places index/detail build output (Plan 99-01 Task 3)

These are created as RED tests in Wave 1 (Plan 99-01) and turned GREEN by Wave 2 (Plan 99-02).

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| `/places.html` lists all places with correct data | PPAGE-01 | UI verification | Open `/places.html` and confirm name, land owner, permit status, specimen count appear for each place |
| Per-place page shows SVG occurrence map | PPAGE-02 | Visual check | Open `/places/{slug}.html` and verify SVG map renders correctly |
| Deep-link opens main map with place pre-filtered | PPAGE-02 | Interactive behavior | Click the "view on map" link and confirm place polygon filtering activates |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
