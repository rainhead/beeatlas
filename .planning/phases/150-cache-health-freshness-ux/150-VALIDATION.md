---
phase: 150
slug: cache-health-freshness-ux
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-06-18
---

# Phase 150 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.
> Fills the `## Validation Architecture` section in 150-RESEARCH.md.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 4.1.8 + happy-dom 20.10.3 (existing) |
| **Config file** | vitest.config.ts at repo root |
| **Quick run command** | `npm test -- --run src/tests/<file>` |
| **Full suite command** | `npm test -- --run` |
| **Estimated runtime** | ~6–10 seconds (full suite, mirrors current baseline) |

Per CLAUDE.md: `npm test` before `git push`; only push on clean result. This phase carries the same gate.

---

## Sampling Rate

- **After every task commit:** Run the targeted unit/component test for the touched module (`npm test -- --run src/tests/<file>`).
- **After every plan wave:** Run the full suite (`npm test -- --run`).
- **Before `/gsd-verify-work`:** Full suite green + the `src/tests/build-output.test.ts` post-build gate (which runs `npm run build` and asserts compiled `_site/app/sw.js` shape) green.
- **Max feedback latency:** ~10 seconds for the full suite; ~2 seconds for a single targeted file. Acceptable per Nyquist.

---

## Per-Task Verification Map

(Concrete task IDs land when the planner emits PLAN.md files; the planner MUST populate this table during step 8 verification.)

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 150-XX-YY | XX | N | CACHE-01 | — | Ready-pill state transitions match cache contents | unit | `npm test -- --run src/tests/cache-state.test.ts` | ❌ W0 | ⬜ pending |
| 150-XX-YY | XX | N | CACHE-02 | — | Prime orchestrator emits monotonically increasing byte progress; sum matches Content-Length total | unit | `npm test -- --run src/tests/prime-orchestrator.test.ts` | ❌ W0 | ⬜ pending |
| 150-XX-YY | XX | N | CACHE-03 | — | `navigator.storage.estimate()` formatted as `"X.X MB stored on this device"`; quota caption only when non-null AND < 200 MB | unit | `npm test -- --run src/tests/cache-state.test.ts` | ❌ W0 | ⬜ pending |
| 150-XX-YY | XX | N | CACHE-04 | — | Date label tracks `manifest.generated_at`; relative-format <7d, absolute ≥7d, hidden when "local" sentinel or unparseable | unit | `npm test -- --run src/tests/freshness.test.ts` | ❌ W0 | ⬜ pending |
| 150-XX-YY | XX | N | OFF-03 (sub) | — | workbox-window `waiting` event → CustomEvent `sw-update-available` bubbles to `<bee-atlas>`; banner renders; tap calls `messageSkipWaiting()` + reload | unit + integration | `npm test -- --run src/tests/sw-update.test.ts` | ❌ W0 | ⬜ pending |
| 150-XX-YY | XX | N | CACHE-02 | — | Build-output gate: compiled `_site/app/sw.js` registers NetworkFirst route for `/data/manifest.json` AND contains a `message` listener gated to `event.data?.type === 'SKIP_WAITING'` (no top-level `self.skipWaiting()`) | post-build | `npm test -- --run src/tests/build-output.test.ts` | ✅ extend existing | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `src/tests/cache-state.test.ts` — ready-state probe + storage estimate formatting (new)
- [ ] `src/tests/prime-orchestrator.test.ts` — getReader byte-progress loop + content-length fallback + monotonic emission (new)
- [ ] `src/tests/freshness.test.ts` — relative/absolute date formatter; "local" sentinel handling (new)
- [ ] `src/tests/sw-update.test.ts` — workbox-window `waiting` event wiring + CustomEvent propagation + tap-to-reload flow (new; mocks `Workbox` from `workbox-window`)
- [ ] Extend `src/tests/build-output.test.ts` — assert NetworkFirst route for manifest.json + SKIP_WAITING message listener in compiled `_site/app/sw.js` (mirrors 148/149 pattern). The existing `does not contain skipWaiting` assertion MUST be rewritten per RESEARCH §workbox-window — naked `self.skipWaiting()` still banned, gated `if (event.data?.type === 'SKIP_WAITING') self.skipWaiting()` allowed.

happy-dom provides DOM globals; tests can stub `navigator.storage.estimate`, `caches.match`, `fetch` returning a `ReadableStream`, and the `workbox-window.Workbox` constructor.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Ready-pill transitions render correctly under real network (priming → ready → SW update waiting) on real device | CACHE-01, CACHE-02 | Visual / motion check; depends on actual asset bytes + real CloudFront `content-length` | On a clean profile, open `/app/index.html` over WiFi → observe pill goes "Caching… N%" → "✓ Offline-ready"; toggle DevTools offline mid-prime → pill flips to "Finish on WiFi" |
| iOS standalone PWA SW-update banner appears + reloads cleanly | CACHE-05 (sub of OFF-03) | iOS standalone-mode SW behavior differs from Safari tab; per ROADMAP Phase 152 phase-note flag and project memory `cloudfront-subdir-403-no-index-rewrite` | Install `/app` to iOS home screen, deploy a new SW version, reopen the installed app, verify the banner appears, tap, verify reload to new version |
| Storage estimate matches DevTools Application → Storage value | CACHE-03 | OS-reported estimate may differ from per-cache sum; visual sanity check | After full prime, open popover, compare `"X MB stored"` to DevTools Application → Storage usage |
| Freshness label updates only when DB content-hash actually changes (not on refresh) | CACHE-04 | Requires a real new nightly pipeline run to ship a new hash | After a nightly pipeline run produces a new `occurrences_<hash>.db`, open `/app` → verify the freshness label moves; refresh once without new pipeline → verify label does NOT change |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references (4 new test files + 1 extension to build-output.test.ts)
- [ ] No watch-mode flags (use `--run`, per existing CLAUDE.md gate `npm test before git push`)
- [ ] Feedback latency < 10 s
- [ ] `nyquist_compliant: true` set in frontmatter once planner populates concrete task IDs in the verification map

**Approval:** pending — planner populates task IDs in step 8.
