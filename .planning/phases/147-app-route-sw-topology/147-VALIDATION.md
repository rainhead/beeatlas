---
phase: 147
slug: app-route-sw-topology
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-06-10
---

# Phase 147 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest `^4.1.2` (root, `happy-dom`) + ts-node CDK assertion (infra) |
| **Config file** | `vite.config.ts` (root `test` block) |
| **Quick run command** | `VITEST_SKIP_BUILD=1 npm test` (skips slow build-output tests) |
| **Full suite command** | `npm test` (root) + `cd infra && npx ts-node test/beeatlas-stack.test.ts` |
| **Estimated runtime** | ~Quick: seconds · Full: includes a production build |

---

## Sampling Rate

- **After every task commit:** Run `VITEST_SKIP_BUILD=1 npm test`
- **After every plan wave:** Run `npm test` + `cd infra && npx ts-node test/beeatlas-stack.test.ts`
- **Before `/gsd:verify-work`:** Full suite green + CDK assertion passes + HUMAN-UAT `curl -I` spot-check
- **Max feedback latency:** seconds (quick tier)

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| W0 | — | 0 | ROUTE-03 | — | N/A | unit (CDK assertion) | `cd infra && npx ts-node test/beeatlas-stack.test.ts` | ❌ W0 create | ⬜ pending |
| W0 | — | 0 | ROUTE-01 | — | N/A | build-output | `npm test` (build-output.test.ts) | ❌ W0 extend | ⬜ pending |
| route-01 | TBD | TBD | ROUTE-01 | — | N/A | build-output | `npm test` | ⬜ | ⬜ pending |
| route-02 | TBD | TBD | ROUTE-02 | — | N/A | manual (DevTools, D-11) | `npm run build && npm run preview` | N/A | ⬜ pending |
| route-03 | TBD | TBD | ROUTE-03 | — | N/A | CDK template assertion | `cd infra && npx ts-node test/beeatlas-stack.test.ts` | ⬜ | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `infra/test/beeatlas-stack.test.ts` — CDK `Template.fromStack` assertion that no-cache CloudFront behaviors exist for `/app/sw.js` and `/app/manifest.webmanifest` (ROUTE-03)
- [ ] Extend `src/tests/build-output.test.ts` — assert `_site/app/index.html` exists and references a hashed `/assets/app-entry-*.js` chunk (ROUTE-01)

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| SW attached to `/app`, none on `/`; SW initiates a `/data/*` fetch | ROUTE-02 | Service workers only register over https/localhost; DevTools Application/Network inspection is not scriptable in CI | D-11: `npm run build && npm run preview`; in DevTools → Application → Service Workers confirm SW on `/app` and none on `/`; Network tab shows SW as initiator for a `/data/*` request |
| Live CloudFront `Cache-Control: no-cache` on `/app/sw.js` + `/app/manifest.webmanifest` | ROUTE-03 | Confirms real distribution behavior post-deploy (assertion catches synth regressions; curl confirms reality) | D-10: post-deploy `curl -I https://<dist>/app/sw.js` recorded in HUMAN-UAT |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency acceptable (quick tier in seconds)
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
