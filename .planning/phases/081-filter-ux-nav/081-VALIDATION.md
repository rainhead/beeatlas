---
phase: 81
slug: filter-ux-nav
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-05-04
---

# Phase 81 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest 4.1.2 (+ happy-dom) |
| **Config file** | `vitest.config.ts` |
| **Quick run command** | `npm test -- --run src/tests/<file>.test.ts` |
| **Full suite command** | `npm test -- --run` |
| **Estimated runtime** | ~15s full suite |

---

## Sampling Rate

- **After every task commit:** Run targeted vitest file (`npm test -- --run src/tests/<file>.test.ts`)
- **After every plan wave:** Run `npm test -- --run` (full suite)
- **Before `/gsd-verify-work`:** Full suite green + `npm run build` green
- **Max feedback latency:** 15s

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 81-01-01 | 01 | 0 | LINK-01..04 | — | N/A | unit | `npm test -- --run src/tests/spa-link.test.ts` | ❌ W0 | ⬜ pending |
| 81-01-02 | 01 | 0 | FILT-01..07 | — | N/A | unit | `npm test -- --run src/tests/species-url-state.test.ts` | ❌ W0 | ⬜ pending |
| 81-01-03 | 01 | 0 | NAV-01..05 | — | N/A | unit | `npm test -- --run src/tests/bee-taxon-nav.test.ts` | ❌ W0 | ⬜ pending |
| 81-01-04 | 01 | 0 | FILT-01..07 | — | N/A | unit | `npm test -- --run src/tests/bee-species-filter.test.ts` | ❌ W0 | ⬜ pending |
| 81-01-05 | 01 | 0 | VIZ-01..05 | — | N/A | unit | `npm test -- --run src/tests/seasonality-viz.test.ts` | ❌ W0 | ⬜ pending |
| 81-01-06 | 01 | 0 | ARCH-04 | — | Forbidden imports blocked | unit | `npm test -- --run src/tests/arch.test.ts` | ✅ | ⬜ pending |

*Wave 0 RED tests for plans 02..05 land in Plan 01 per Phase 80 precedent. Each subsequent plan has a `<verify>` hook that re-runs the matching test file expecting GREEN.*

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `src/tests/spa-link.test.ts` — RED stubs for LINK-01..04 (round-trip via `parseParams`)
- [ ] `src/tests/species-url-state.test.ts` — RED stubs for FILT-01..07 round-trip
- [ ] `src/tests/bee-taxon-nav.test.ts` — RED stubs for NAV-01..05 (mute-not-hide, subgenus visibility, server-rendered <details>)
- [ ] `src/tests/bee-species-filter.test.ts` — RED stubs for FILT-01..07 (multi-select bind, breadcrumb, empty state)
- [ ] `src/tests/seasonality-viz.test.ts` — RED stubs for VIZ-01..05 (bar branch n≥5, fallback n<5, season-band tints, sample-size annotation, slice from `combined_vec`)
- [ ] `src/tests/arch.test.ts` — extended forbidden-import set covers `src/lib/spa-link.ts`

*Vitest infrastructure is already installed and exercised by Phase 80; no framework install needed.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Visual fidelity of season-band tints + sample-size star annotation matches BeeSearch | VIZ-03, VIZ-04 | Pixel/color comparison; no automated visual regression in repo | Run `npm run dev`; load `/species/`; spot-check 5 species at varying sample sizes; compare to BeeSearch reference if available |
| Keyboard-only navigation through `<details>` filter popovers and `<bee-taxon-nav>` tree | NAV-05, FILT-03 | A11y interaction is OS/browser dependent | `npm run dev`; tab through nav and filter; verify expand/collapse and checkbox toggling reach via keyboard alone |
| `replaceState` debounce vs. `pushState` discrete-action UX feel | FILT-06 | Subjective UX validation of typing-flow | Drag month-range inputs and toggle checkboxes; confirm history.back() lands on meaningful prior states |
| Filter performance with 735 cards × per-card `<seasonality-viz>` + `content-visibility:auto` | Pitfall #10 mitigation | Subjective scroll smoothness | Open `/species/` on a mid-tier laptop; scroll Andrena/Osmia subgenus list; confirm no jank |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 15s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
