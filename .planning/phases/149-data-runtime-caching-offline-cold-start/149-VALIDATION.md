---
phase: 149
slug: data-runtime-caching-offline-cold-start
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-06-18
---

# Phase 149 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.
> Detailed dimensions and test mapping are derived from `149-RESEARCH.md` § Validation Architecture.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest 3.x (TypeScript), happy-dom; data/ pytest tier untouched in this phase |
| **Config file** | `vitest.config.ts` |
| **Quick run command** | `npm test -- --run` |
| **Full suite command** | `npm test -- --run && npm run build` |
| **Estimated runtime** | ~45 seconds (vitest fast tier + Vite production build) |

The production build is part of the verification surface because `src/tests/build-output.test.ts` asserts against `_site/app/sw.js` — that file only exists after `npm run build`.

---

## Sampling Rate

- **After every task commit:** Run `npm test -- --run` (vitest fast tier)
- **After every plan wave:** Run `npm test -- --run && npm run build` (build-output assertions need _site/)
- **Before `/gsd-verify-work`:** Full suite green + HUMAN-UAT checklist for the offline DevTools path
- **Max feedback latency:** ~45 seconds

---

## Per-Task Verification Map

> The planner populates this table from PLAN.md tasks once they exist. Each row should bind a task ID to a requirement (OFF-02 / OFF-03 / OFF-04 / OFF-05 / CACHE-05) and to a verifiable command (vitest spec, build-output assertion, or HUMAN-UAT line item).

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 149-XX-XX | XX | X | OFF-02/03/04/05 or CACHE-05 | — | runtime cache hit; no network; honest UI | unit / build-assert / human-uat | `npm test -- --run` or `vitest run <file>` | ⬜ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] Add `workbox-strategies`, `workbox-expiration`, `workbox-cacheable-response` (all `^7.4.1`) as devDependencies in `package.json` (research §1) — required before `src/sw.ts` will compile.
- [ ] Extend `src/tests/build-output.test.ts` with the new precache + runtime-route assertions described in research §10 (substring match for `data-artifacts`, route predicates, `maxEntries: 1`, `purgeOnQuotaError: true`).
- [ ] Add `src/tests/cache-probe.test.ts` (or extend an existing spec) covering the cold-start probe + `online` event re-prime path (mockable via `caches.match` stub + dispatchEvent).
- [ ] Add `src/tests/bee-header.test.ts` (or extend an existing spec) for the offline pill render/hide behavior driven by an `offline` property.
- [ ] Add `src/tests/bee-map.test.ts` (or extend an existing spec) for the offline-only blank-basemap overlay rendering.

*If existing fixtures already cover any of the above, the planner can collapse that row.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| `/app` cold-start fully offline after one online prime | OFF-02 | Requires real browser SW lifecycle + Cache Storage state | `npm run build && npm run preview` → visit `/app/index.html` online → DevTools Application > Service Workers shows activated → close + DevTools Network Offline → reload `/app/index.html` → map renders with dots, county/ecoregion overlays render, no network requests fired |
| Basemap renders blank with honest label offline | OFF-04 | Visual + map lifecycle | Offline reload `/app/index.html` → confirm map container is not crashed → bottom-left overlay reads the blank-basemap explanation |
| Online/offline pill flips on connectivity change | OFF-05 | Requires real navigator.onLine + browser events | DevTools Network Offline → pill appears in `<bee-header>` → Network Online → pill disappears; map remains usable in both states |
| Re-prime fires when DB is evicted then device reconnects | CACHE-05 | Requires Cache Storage manipulation | DevTools Application > Cache Storage > `data-artifacts` → delete the DB entry → reload `/app/index.html` while offline (map shows no dots) → toggle Network Online → confirm a background fetch repopulates `data-artifacts` with the DB |
| `navigator.storage.persist()` requested at first launch | CACHE-05 | Requires fresh-profile measurement | Clear site data → first visit `/app/index.html` → DevTools console shows the persist() result log; `localStorage['persist-asked']` set; second visit makes no further call |
| Prompt-to-reload invariant preserved | OFF-03 / SC-7 | Requires deploy + observe SW waiting | After deploy, with `/app` open, open DevTools Application > Service Workers and confirm a new SW enters `waiting` state (no skipWaiting/clientsClaim). UI prompt itself ships in Phase 150 — 149 only verifies the lifecycle is preserved. |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references (workbox packages + new test specs)
- [ ] No watch-mode flags (`npm test -- --run`, not `npm test`)
- [ ] Feedback latency < 60s for the fast tier
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
