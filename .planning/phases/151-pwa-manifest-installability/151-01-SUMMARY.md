---
phase: 151-pwa-manifest-installability
plan: 01
subsystem: pwa/static-assets
tags: [pwa, manifest, icons, test-scaffolds, wave-0]
dependency_graph:
  requires: []
  provides:
    - public/app/manifest.webmanifest
    - public/app/icons/icon.svg
    - public/app/icons/icon-192.png
    - public/app/icons/icon-512.png
    - public/app/icons/icon-maskable-512.png
    - public/app/icons/apple-touch-icon-180.png
    - scripts/gen-app-icons.sh
    - src/tests/install-affordance.test.ts
    - src/tests/build-output.test.ts (extended with 3 PWA assertions)
  affects:
    - _site/app/manifest.webmanifest (via Vite publicDir passthrough on next build)
    - _site/app/icons/* (via Vite publicDir passthrough on next build)
tech_stack:
  added: []
  patterns:
    - "static asset via public/ -> Vite publicDir passthrough (same as public/app/sw.js)"
    - "SVG master + committed PNGs + non-build-wired regen script (D-07)"
    - "readFileSync source-analysis test (no DOM mount, per feedback_bee_atlas_test_mounting)"
key_files:
  created:
    - public/app/manifest.webmanifest
    - public/app/icons/icon.svg
    - public/app/icons/icon-192.png
    - public/app/icons/icon-512.png
    - public/app/icons/icon-maskable-512.png
    - public/app/icons/apple-touch-icon-180.png
    - scripts/gen-app-icons.sh
    - src/tests/install-affordance.test.ts
  modified:
    - src/tests/build-output.test.ts
decisions:
  - "Separate `any` and `maskable` manifest icon entries used (clearer + easier to assert than single `any maskable` string)"
  - "Bee glyph: vertical oval body (amber #f5c842) + dark stripes + wings (semi-transparent white) + head/antennae/stinger, all on full-bleed #2c7a2c green field"
  - "Wave 0 test structure: existsSync guard on install-prompt.ts so each assertion fails cleanly (not with a readFileSync ENOENT crash) when file is absent"
metrics:
  duration: "~3 minutes"
  completed: "2026-06-19"
  tasks_completed: 2
  tasks_total: 2
  files_created: 9
  files_modified: 1
---

# Phase 151 Plan 01: Static PWA Manifest, Icon Set, and Wave 0 Test Scaffolds Summary

**One-liner:** Static `manifest.webmanifest` (start_url=/app/index.html, colors=#080d26, D-01..D-06) + bee-glyph-on-green icon set (rsvg-convert committed PNGs) + Wave 0 RED test scaffolds for install-affordance and build-output.

## What Was Built

### Task 1: Static manifest + icon set + regen script

`public/app/manifest.webmanifest` — hand-authored static file with all locked fields:
- `start_url: "/app/index.html"` (D-01, CloudFront OAC 403 guard, not `/app`)
- `scope: "/app/"`, `display: "standalone"`, `name: "Washington Bee Atlas"`, `short_name: "BeeAtlas"` (D-02)
- `theme_color: "#080d26"`, `background_color: "#080d26"` (D-03, --header-bg navy)
- Three icon entries: 192x192 (any), 512x512 (any), 512x512 maskable (D-06)
- All icon `src` paths absolute `/app/icons/...`

`public/app/icons/icon.svg` — stylized bee SVG master on `#2c7a2c` full-bleed field:
- Bee body: vertical amber (#f5c842) oval with three dark stripe bands
- Dark thorax ellipse, amber head with dark eyes, white antennae with round tips
- Semi-transparent white wing pairs (upper larger, lower smaller)
- Amber stinger
- All critical content centered within maskable safe zone (radius = 40% = 204.8px at 512px)

Four committed PNG icons generated via `rsvg-convert`:
- `icon-192.png` (192x192, any)
- `icon-512.png` (512x512, any)
- `icon-maskable-512.png` (512x512, maskable — identical safe-zone master per D-06)
- `apple-touch-icon-180.png` (180x180, opaque green field, iOS home screen)

`scripts/gen-app-icons.sh` — `set -euo pipefail` bash script with `command -v rsvg-convert` check; regenerates all four PNGs. Marked executable. NOT wired into Eleventy/Vite build (D-07).

`eleventy.config.js` — UNCHANGED. `manifest: false` preserved.

### Task 2: Wave 0 test scaffolds

`src/tests/install-affordance.test.ts` (new) — pure source-string assertions, no DOM:
- 4 tests asserting `install-prompt.ts` contains `beforeinstallprompt`, `preventDefault`, `appinstalled` (RED — file absent until Plan 03)
- 5 tests asserting iOS gating strings in `bee-header.ts`/`bee-atlas.ts`: `navigator.standalone`, `display-mode: standalone`, `MacIntel`/`maxTouchPoints`, `CriOS`, `Safari` (RED — strings absent until Plan 03)
- All 9 tests RED as intended; uses `existsSync` guard to produce meaningful failures rather than ENOENT crashes

`src/tests/build-output.test.ts` (extended with 3 new tests inside the existing build-output describe block):
1. Manifest content assertion: name/short_name/start_url/scope/display/theme_color/background_color, 192x192+512x512 sizes, maskable icon present, all icon files exist on disk
2. `_site/app/index.html` manifest link + apple-mobile-web-app-capable + apple-touch-icon assertion (RED until Plan 02)
3. `_site/index.html` does NOT contain `rel="manifest"` (no-PWA-on-/ guarantee, D-04)

## Verification

- `manifest.webmanifest` parses as JSON with all locked fields: PASSED
- `start_url === '/app/index.html'`: PASSED
- `theme_color === background_color === '#080d26'`: PASSED
- Maskable icon declared: PASSED
- All 4 PNG files exist and are valid PNG: PASSED
- `icon.svg` exists: PASSED
- `scripts/gen-app-icons.sh` is executable, references `rsvg-convert`: PASSED
- `eleventy.config.js` unchanged (`manifest: false`): PASSED
- `install-affordance.test.ts`: 9/9 tests FAIL (intended RED — Plan 03 source absent)
- `build-output.test.ts` references `manifest.webmanifest` (3 occurrences): PASSED
- `arch.test.ts`: 6/6 tests PASS (no regressions)

## Deviations from Plan

None — plan executed exactly as written.

The one minor auto-fix: the initial SVG contained XML-illegal double hyphens (`--accent`, `--` in comments) which caused rsvg-convert to fail with "Double hyphen within comment" error. Fixed by rewriting comment text to remove double hyphens. This is an implementation detail, not a plan deviation.

## Known Stubs

None — manifest is fully wired with all required fields; PNGs are committed and valid.

## Threat Flags

None — this plan introduces only static, public, non-sensitive assets (manifest metadata + app icons). No new network endpoints, auth paths, or schema changes. The threat model (T-151-01: HTTPS/TLS integrity for static assets; T-151-02: public manifest metadata only) has no residual unmitigated risks.

## Self-Check: PASSED

All 9 created/modified files exist on disk. Both task commits (`cdb28a00`, `a10b3de3`) verified in git log.
