---
phase: 151-pwa-manifest-installability
verified: 2026-06-19T00:00:00Z
status: passed
score: 4/4 must-haves verified
overrides_applied: 0
notes:
  - "Criterion 4 (offline cold-start) renders cached DATA + TABLE on a real iOS device; the offline BASEMAP renders blank because the Mapbox style + tiles are online-only and TOS-gated. This is a documented, accepted limitation deferred to Phase 154 (Mapbox Tile Caching), confirmed in ROADMAP.md and signed off in 151-HUMAN-UAT.md — not a Phase 151 defect."
  - "Android real-device offline cold-start was DEFERRED at UAT (no Android hardware). ROADMAP criterion 4 requires confirmation on 'a real device' (singular); the iOS device satisfies it. The beforeinstallprompt/Android code path was confirmed on desktop Chrome (same path)."
---

# Phase 151: PWA Manifest & Installability — Verification Report

**Phase Goal:** The `/app` route is installable as a PWA on Android (Chrome `beforeinstallprompt`) and iOS (static "Add to Home Screen" instructions); the installed app opens offline in standalone mode and renders the map from cache.
**Verified:** 2026-06-19
**Status:** passed (with documented basemap-offline note → Phase 154)
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths (ROADMAP Success Criteria)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | `/app/manifest.webmanifest` declares name, `start_url: /app/index.html` (NOT `/app/`), display:standalone, background_color, theme_color, and 192/512/maskable icons; no Chrome validation errors | ✓ VERIFIED | `public/app/manifest.webmanifest`: `start_url: /app/index.html`, `display: standalone`, both colors `#080d26`, icons 192/512(any)/512(maskable). Built into `_site/app/manifest.webmanifest`. UAT Scenario 1 (desktop Chrome): zero manifest validation errors, install affordance offered. |
| 2 | Android/Chrome in-app "Install" affordance (captured `beforeinstallprompt`, not a blocking modal) appears and installs | ✓ VERIFIED | `src/install-prompt.ts` captures `beforeinstallprompt` at module scope, `preventDefault()`s the mini-infobar, stashes the event, exposes `window.__pwaPrompt`. `bee-atlas` relays `_installable` → `bee-header` Install button → `install-prompt` CustomEvent → `__pwaPrompt()`. UAT confirmed the same code path triggered Chrome's native install dialog on desktop. Android real-device DEFERRED (no hardware) — criterion 4 requires only one real device (iOS satisfies). |
| 3 | iOS Safari shows static "Add to Home Screen" instructions; hidden when running standalone (`navigator.standalone`) | ✓ VERIFIED | `bee-atlas.isIosSafari()` (UA + MacIntel/maxTouchPoints, no version-sniff, browser-in-app exclusions) gated by `!isStandalone()` (display-mode + `navigator.standalone`). `_iosInstructable` → `bee-header` A2HS popover (Share glyph + 3 ordered steps). Button rendered only when `installable \|\| iosInstructable`, both false when standalone. UAT Scenario 3 (real iPhone): popover worked, standalone launch had no Safari chrome. |
| 4 | Installed app opens offline in standalone and renders map + table from cache (confirmed on a real device) | ✓ VERIFIED (with note) | UAT Scenario 3 (real iPhone, airplane mode, home-screen launch): standalone (no Safari chrome), cached occurrence **data + table render**. Offline machinery: wasm precached (`globPatterns` includes `wasm`), cache-direct prime (`prime-orchestrator.ts` + `manifest.ts` write to Cache Storage), inline worker reading wasm from cache (`sqlite.ts ?worker&inline`, `sqlite-worker.ts` `instantiateWasm`), data load decoupled from `map.on('load')` (`bee-map._loadOccurrenceData`). **Note:** offline basemap renders blank (Mapbox style/tiles online-only, TOS-gated) — documented as accepted, deferred to Phase 154. |

**Score:** 4/4 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `public/app/manifest.webmanifest` | Static manifest, correct start_url/display/colors/icons | ✓ VERIFIED | All fields present; ships to `_site/app/`; built copy = 625 bytes |
| `public/app/icons/icon-192.png`, `icon-512.png`, `icon-maskable-512.png`, `apple-touch-icon-180.png` | Committed PNG icon set | ✓ VERIFIED | All present + land in `_site/app/icons/`. icon-512 ≡ icon-maskable-512 (byte-identical) — intentional per D-06 (single safe-zone design serving both `any` and `maskable`) |
| `_pages/app/index.html` | manifest link + apple-* meta + apple-touch-icon on /app only | ✓ VERIFIED | `rel="manifest"`, `apple-mobile-web-app-capable/status-bar-style/title`, `apple-touch-icon`, `theme-color`. Root `_pages/index.html` has NONE (no-PWA-on-/ guarantee, D-04) |
| `src/install-prompt.ts` | beforeinstallprompt capture + `__pwaPrompt` handoff | ✓ VERIFIED | Module-scope capture, preventDefault, appinstalled handling, `window.__pwaPrompt` |
| `src/bee-atlas.ts` | `_installable`/`_iosInstructable` @state + event wiring | ✓ VERIFIED | State owned here; `pwa-installable/installed`, `install-prompt` listeners; `isStandalone()`/`isIosSafari()` gates |
| `src/bee-header.ts` | Install button + iOS A2HS popover (reuse cache chrome) | ✓ VERIFIED | `.install-btn`, `.ios-a2hs-popover` cloned from `.cache-popover`, Share glyph + 3 steps, `install-prompt` CustomEvent upward |
| `src/app-entry.ts` | side-effect import of install-prompt | ✓ VERIFIED | `import './install-prompt.ts'` (app entry only) |
| `151-HUMAN-UAT.md` | Real-device offline cold-start checklist | ✓ VERIFIED | status: approved; PWA-01/02/03 confirmed real iPhone + desktop Chrome |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|----|--------|---------|
| manifest | icon PNGs | `icons[].src` URLs | ✓ WIRED | `/app/icons/*.png` all resolve to committed files |
| install-prompt.ts | `window.__pwaPrompt` | window handoff | ✓ WIRED | `__pwaPrompt` assigned + consumed in bee-atlas |
| bee-atlas | bee-header | `.installable`/`.iosInstructable` property pass | ✓ WIRED | Lines 290-291 |
| bee-header | bee-atlas | `install-prompt` CustomEvent (Android click) | ✓ WIRED | dispatched in bee-header, handled in bee-atlas `_onInstallPrompt` |
| _pages/app/index.html | manifest | `<link rel="manifest">` | ✓ WIRED | Present in source + built `_site/app/index.html` |
| eleventy precache | wa-sqlite wasm | injectManifest globPatterns | ✓ WIRED | `wa-sqlite-Bkv7CwRB.wasm` in built `sw.js` precache (11 entries) |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|---------------|--------|--------------------|--------|
| bee-map occurrence layer / table | `_fullGeoJSON` | `loadOccurrenceGeoJSON()` via inline SQLite worker reading wasm + DB from Cache Storage | Yes (cached DB) — confirmed rendering offline on real iPhone | ✓ FLOWING |
| bee-map basemap | Mapbox style/tiles | `api.mapbox.com` (online-only) | No offline (by design, TOS-gated) | ⚠️ STATIC (deferred → Phase 154) |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Full suite green | `npm test` | 31 files / 742 tests passed | ✓ PASS |
| PWA-specific tests | `vitest run install-affordance.test.ts build-output.test.ts` | 54 passed | ✓ PASS |
| Production build | `npm run build` | succeeds; precache 11 entries (2536 KiB) | ✓ PASS |
| Built manifest present | inspect `_site/app/manifest.webmanifest` | present, 625 bytes, correct keys | ✓ PASS |
| wasm precached | grep `_site/app/sw.js` | `wa-sqlite-Bkv7CwRB.wasm` present | ✓ PASS |
| /app links manifest, / does not | grep built HTML | /app yes, / count 0 | ✓ PASS |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|-------------|--------|----------|
| PWA-01 | 151-01/02/03 | Manifest + Android installability via captured beforeinstallprompt | ✓ SATISFIED | Manifest valid (UAT Scenario 1, zero errors); install affordance code verified + exercised on desktop Chrome |
| PWA-02 | 151-02/03 | iOS inline A2HS instructions, only when not standalone | ✓ SATISFIED | UAT Scenario 3 real iPhone: popover worked, hidden in standalone |
| PWA-03 | 151-04 | Offline cold-start in standalone renders map+table from cache | ✓ SATISFIED (data+table) | UAT Scenario 3 real iPhone airplane-mode launch: standalone + cached data + table; basemap-offline deferred to Phase 154 (documented accepted limitation) |

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| — | — | None | — | No TBD/FIXME/XXX/TODO/HACK/PLACEHOLDER in any phase-modified file |

### Human Verification Required

None outstanding. The phase's blocking human UAT (`151-HUMAN-UAT.md`) is **APPROVED** — real iPhone + desktop Chrome, signed off by Peter Abrahamsen 2026-06-20. Android real-device offline cold-start is DEFERRED (no hardware) and carried to the v-next deferred list; it is not required by ROADMAP criterion 4 ("a real device", singular — iOS satisfies it).

### Deferred Items

| # | Item | Addressed In | Evidence |
|---|------|--------------|----------|
| 1 | Offline basemap (Mapbox tiles + style render blank offline) | Phase 154 | ROADMAP: "Phase 154: Mapbox Tile Caching (TOS-gated) — SW runtime-caches Mapbox tiles..."; UAT explicitly documents basemap-offline as the Phase 154 dependency, not a defect |
| 2 | Android real-device offline cold-start confirmation | v-next (opportunistic) | No Android hardware at UAT; criterion 4 satisfied by iOS; Android code path = desktop Chrome path (confirmed) |

### Gaps Summary

No gaps. All four ROADMAP success criteria are achieved in the codebase and confirmed by a blocking real-device human UAT:

1. Manifest is correct and Chrome-valid (start_url is the explicit `/app/index.html`, not the 403-prone trailing slash).
2. The Android install affordance is a captured-`beforeinstallprompt` in-app button (non-blocking), wired end-to-end and exercised on desktop Chrome.
3. The iOS A2HS instructions appear in Safari and are structurally hidden in standalone.
4. Offline cold-start on a real iPhone opens standalone and renders cached **data + table**. The offline basemap renders blank because Mapbox style/tiles are online-only and TOS-gated — a documented, accepted limitation that is the explicit scope of the downstream **Phase 154**, not a Phase 151 defect.

The five offline-caching defects surfaced during UAT (wasm precache, cache-direct prime, inline worker, data/basemap decouple, build-id surfacing) are all committed on `main` (`69097427`, `f81a4ed6`, `e77232a4`, `c980281c`, `d7308b71`) and verified here in source, in the production build, and via the green test suite (742) with dedicated regression guards in `build-output.test.ts`.

---

_Verified: 2026-06-19_
_Verifier: Claude (gsd-verifier)_
