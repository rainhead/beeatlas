---
phase: 94
slug: species-genus-pages
status: draft
nyquist_compliant: true
wave_0_complete: true
created: 2026-05-15
---

# Phase 94 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest |
| **Config file** | `vitest.config.ts` |
| **Quick run command** | `npm test` |
| **Full suite command** | `npm run build && npm test` |
| **Estimated runtime** | ~10 seconds (tests) + ~30 seconds (build) |

---

## Sampling Rate

- **After every task commit:** Run `npm test`
- **After every plan wave:** Run `npm run build && npm test`
- **Before `/gsd-verify-work`:** Full suite must be green + spot-check generated pages exist at correct paths
- **Max feedback latency:** 45 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 94-01-01 | 01 | 1 | PIPE-01 | — | N/A | build | `npm run build && ls _site/species/Andrena/milwaukeensis/index.html` | ❌ W0 | ⬜ pending |
| 94-01-02 | 01 | 1 | URL-01/SPE-01 | — | N/A | build | `npm run build && ls _site/species/Andrena/milwaukeensis/index.html` | ❌ W0 | ⬜ pending |
| 94-01-03 | 01 | 1 | URL-02/GEN-01 | — | N/A | build | `npm run build && ls _site/species/Andrena/index.html` | ❌ W0 | ⬜ pending |
| 94-02-01 | 02 | 1 | SPE-02 | — | N/A | manual | Open `/species/Andrena/milwaukeensis/` and verify photo or fallback rendered | ✅ | ⬜ pending |
| 94-02-02 | 02 | 1 | SPE-03/GEN-02 | — | N/A | build | `npm run build && ls public/data/species-maps/Andrena/milwaukeensis.svg` | ✅ | ⬜ pending |
| 94-02-03 | 02 | 1 | SPE-04 | — | N/A | manual | Open `/species/Andrena/milwaukeensis/` and verify seasonality chart renders | ✅ | ⬜ pending |
| 94-03-01 | 03 | 2 | GEN-01/GEN-03 | — | N/A | manual | Open `/species/Andrena/` and verify species list with swatches and links | ✅ | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- Existing vitest infrastructure covers all automated checks.
- Build-based verification (`npm run build`) is the primary gate — Eleventy will error loudly if templates are broken.
- `_site/` is the build output; spot-check file existence at expected paths.
- Test stubs are embedded as TDD tasks in Plan 01 Task 2 (data-species.test.ts: speciesList/genusList/hexColor assertions) and Plan 03 Task 1 (build-output.test.ts: taxon-page existence + chunk assertions) — TDD-within-wave pattern, so no separate Wave 0 plan is required.

*Existing infrastructure covers all phase requirements.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Photo renders or placeholder shown | SPE-02 | Requires browser — image loading lazy, fallback is CSS-styled div | `npm run dev`, open `/species/Andrena/milwaukeensis/` in browser |
| Seasonality chart renders with month data | SPE-04 | LitElement component, requires browser rendering | `npm run dev`, open species page, inspect chart |
| Genus page species list with correct swatches | GEN-01/GEN-03 | Color swatch correctness requires visual verification | `npm run dev`, open `/species/Andrena/`, verify swatch colors match SVG map |
| "View N occurrences on the atlas" link | SPE-01/URL-01 | Deep-link behavior requires browser | Click link on species page, verify atlas filters to that species |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 45s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
