---
phase: 151
slug: pwa-manifest-installability
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-06-19
---

# Phase 151 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest (`vitest run`) |
| **Config file** | inline / `vitest.config.ts` (existing — `src/tests/*` discovered) |
| **Quick run command** | `VITEST_SKIP_BUILD=1 npm test` (skips the ~180s build in the build-output suite) |
| **Full suite command** | `npm test` (runs `npm run build` in build-output `beforeAll`) |
| **Estimated runtime** | ~30s quick · ~200s full (includes production build) |

---

## Sampling Rate

- **After every task commit:** Run `VITEST_SKIP_BUILD=1 npm test` (fast component/source tests)
- **After every plan wave:** Run `npm test` (full, includes build-output manifest assertions)
- **Before `/gsd-verify-work`:** Full suite green + Chrome DevTools → Application → Manifest shows no errors + `151-HUMAN-UAT.md` passed
- **Max feedback latency:** ~30 seconds (quick) / ~200 seconds (full)

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 151-01-01 | 01 | 0 | PWA-01/02 | — | N/A | unit (Wave 0) | `VITEST_SKIP_BUILD=1 npm test` | ❌ W0 | ⬜ pending |
| 151-01-02 | 01 | 1 | PWA-01 | — | N/A | post-build assertion | `npm test` | ✅ extend build-output.test.ts | ⬜ pending |
| 151-02-01 | 02 | 1 | PWA-01 | — | N/A | post-build assertion | `npm test` | ✅ extend build-output.test.ts | ⬜ pending |
| 151-03-01 | 03 | 1 | PWA-01 | — | beforeinstallprompt preventDefault + stash | source-analysis | `VITEST_SKIP_BUILD=1 npm test` | ❌ W0 (install-affordance.test.ts) | ⬜ pending |
| 151-03-02 | 03 | 1 | PWA-02 | — | iOS Safari + standalone gating | source-analysis | `VITEST_SKIP_BUILD=1 npm test` | ❌ W0 | ⬜ pending |
| 151-04-01 | 04 | 2 | PWA-03 | — | offline cold-start standalone | manual / human UAT | — (real device, airplane mode) | ❌ human-only (D-14) | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*
*Task IDs are indicative — the planner owns final plan/wave assignment; this map binds each PWA requirement to its verification surface.*

---

## Wave 0 Requirements

- [ ] `src/tests/install-affordance.test.ts` — source-analysis stubs: asserts `beforeinstallprompt` / `preventDefault` / `appinstalled` strings in `src/install-prompt.ts`, and iOS gating strings (`navigator.standalone`, `MacIntel`/`maxTouchPoints`, Safari) in `src/bee-header.ts` (covers PWA-01/PWA-02 logic presence)
- [ ] Extend `src/tests/build-output.test.ts` — manifest exists at `_site/app/manifest.webmanifest`, declares required keys + icon files exist, `<link rel="manifest">` + iOS meta on `_site/app/index.html`, and NOT on `_site/index.html` (covers PWA-01)
- [ ] `151-HUMAN-UAT.md` scaffold — real-device offline cold-start checklist (PWA-03)
- Framework install: none — Vitest already configured.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Offline cold-start in standalone renders map+table from cache | PWA-03 | Standalone display-mode + true offline launch cannot be simulated; depends on real OS install + cache eviction behavior (D-14) | Android Chrome: install via the in-app button → enable airplane mode → launch from home screen → confirm standalone (no browser chrome) + map + table render from cache. iOS Safari: Share → Add to Home Screen → airplane mode → launch → confirm standalone + render. Record in `151-HUMAN-UAT.md`. |
| Chrome installability (manifest valid, no errors) | PWA-01 | DevTools Application panel is a manual inspection surface | Production-build preview on localhost → DevTools → Application → Manifest → confirm zero validation errors and install affordance offered |
| iOS status-bar style appearance (`black` vs `black-translucent`) | PWA-02 | Visual appearance only resolvable on a real iOS device | Launch standalone on iOS → confirm status bar legibility against navy theme; adjust `apple-mobile-web-app-status-bar-style` if needed |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies (PWA-03 is the documented human-only exception per D-14)
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references (install-affordance.test.ts, build-output.test.ts extension, HUMAN-UAT scaffold)
- [ ] No watch-mode flags
- [ ] Feedback latency < 200s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
