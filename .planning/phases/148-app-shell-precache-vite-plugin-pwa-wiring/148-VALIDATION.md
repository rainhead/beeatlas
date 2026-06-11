---
phase: 148
slug: app-shell-precache-vite-plugin-pwa-wiring
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-06-11
---

# Phase 148 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest ^4.1.2 (already installed) |
| **Config file** | `vite.config.ts` (test section; `exclude` covers `_site/`, `infra/`) |
| **Quick run command** | `VITEST_SKIP_BUILD=1 npm test` |
| **Full suite command** | `npm test` (runs full production build + build-output assertions) |
| **Estimated runtime** | ~60–120 seconds (full suite includes `npm run build`) |

---

## Sampling Rate

- **After every task commit:** Run `VITEST_SKIP_BUILD=1 npm test` (fast — unit/non-build tests only)
- **After every plan wave:** Run `npm test` (full build + build-output assertions)
- **Before `/gsd:verify-work`:** Full suite must be green (all build-output precache assertions pass)
- **Max feedback latency:** ~120 seconds (full suite, build-inclusive)

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 148-01-01 | 01 | 1 | OFF-01 (crit 1) | — | `_site/app/sw.js` has injected precache manifest (literal `self.__WB_MANIFEST` is replaced) | build-output | `npm test` | ❌ W0 | ⬜ pending |
| 148-01-02 | 01 | 1 | OFF-01 (crit 3) | — | `maximumFileSizeToCacheInBytes >= 30000000` in `eleventy.config.js` | build-output (config read) | `npm test` | ❌ W0 | ⬜ pending |
| 148-01-03 | 01 | 1 | OFF-01 (crit 4) | — | every precached URL exists as a file under `_site/` | build-output | `npm test` | ❌ W0 | ⬜ pending |
| 148-01-04 | 01 | 1 | OFF-01 (crit 2) | — | JS/CSS served from `(ServiceWorker)` offline | manual (HUMAN-UAT) | DevTools → Network offline | N/A | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

The three new build-output assertions (OFF-01 criteria 1, 3, 4) are the RED tests that define done.
They are written against `src/tests/build-output.test.ts` and fail until the plugin is wired and
`src/sw.ts` produces an injected manifest at `_site/app/sw.js`.

- [ ] Three new `test(...)` blocks in `src/tests/build-output.test.ts` — criteria 1 (injected manifest), 3 (≥30 MB cap in `eleventy.config.js`), 4 (every precached URL exists under `_site/`)
- [ ] `src/sw.ts` created (new injectManifest source — exists before RED assertions can pass)

No new framework install needed (Vitest already present).

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| JS/CSS served from `(ServiceWorker)` offline | OFF-01 (crit 2) | Requires a real browser SW lifecycle + DevTools offline toggle; no headless build assertion can prove a live offline navigation | After `npm run build`, serve `_site/` locally; visit `http://localhost:<port>/app/index.html` once online; in DevTools → Network toggle offline; reload; confirm JS/CSS rows show `(ServiceWorker)` with no network errors. Record in HUMAN-UAT (mirrors Phase 147 D-11). |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 120s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
