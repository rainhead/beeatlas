---
phase: 154
slug: mapbox-tile-caching-tos-gated
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-06-21
---

# Phase 154 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest |
| **Config file** | `vite.config.ts` |
| **Quick run command** | `npm test -- src/tests/build-output.test.ts` |
| **Full suite command** | `npm test` |
| **Estimated runtime** | ~30–90s (build-output runs `npm run build` in `beforeAll`) |

---

## Sampling Rate

- **After every task commit:** Run `npm test -- src/tests/build-output.test.ts`
- **After every plan wave:** Run `npm test`
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** ~90 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 154-01-01 | 01 | 1 | TILE-01 | — | SW registers SWR route, `mapbox-basemap` cacheName, matches `api.mapbox.com` | source assertion (`_site/app/sw.js`) | `npm test -- src/tests/build-output.test.ts` | ❌ W0 | ⬜ pending |
| 154-01-02 | 01 | 1 | TILE-01 | — | `events.mapbox.com` and `/map-sessions/` NOT intercepted | source assertion | `npm test -- src/tests/build-output.test.ts` | ❌ W0 | ⬜ pending |
| 154-01-03 | 01 | 1 | TILE-01 | — | `maxAgeSeconds` ≤ 2,592,000 (30d); `maxEntries` bounded; 200-only; token NOT stripped (no `cacheKeyWillBeUsed`) | source assertion | `npm test -- src/tests/build-output.test.ts` | ❌ W0 | ⬜ pending |
| 154-01-04 | 01 | 1 | TILE-01 | — | Mapbox attribution remains visible (not suppressed in `bee-map.ts`) | source assertion / grep | `grep -nE 'attributionControl' src/bee-map.ts` (absence ⇒ GL JS default = on) | ✅ | ⬜ pending |
| 154-02-01 | 02 | 1 | TILE-02 | — | ADR `docs/adr/0001-mapbox-basemap-cache.md` exists with ToS verdict + compliance checklist | file existence + content assertion | `npm test -- src/tests/build-output.test.ts` | ❌ W0 | ⬜ pending |
| 154-02-02 | 02 | 1 | TILE-02 | — | `CLAUDE.md` "Known State" contains basemap-cache pointer | source assertion | `grep -q 'mapbox-basemap' CLAUDE.md` | ✅ | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] New assertions in `src/tests/build-output.test.ts` — extend the existing `describe.skipIf(SKIP_BUILD)` block (shares the single `npm run build` invocation) to cover the cache name, `api.mapbox.com` match, `events.mapbox.com` + `/map-sessions/` exclusion, `maxAgeSeconds` ≤ 30d, token-not-stripped, and ADR-file existence.
- [ ] No new test file needed.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Mapbox basemap responses are non-opaque (CORS) and served from `mapbox-basemap` cache on warm reload | TILE-01 | Requires a real browser + Mapbox token; CORS/opaque status only observable in DevTools | DevTools → Network: confirm `api.mapbox.com` tile responses carry `Access-Control-Allow-Origin`; DevTools → Application → Cache Storage: confirm `mapbox-basemap` keys retain `access_token`; reload and confirm tiles served from SW cache |
| `tiles.mapbox.com` is genuinely absent from outdoors-v12 requests | TILE-01 | Host list confirmed by bundle inspection; live confirmation needs DevTools | DevTools → Network: filter `mapbox`, confirm all basemap assets are `api.mapbox.com` |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 90s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
