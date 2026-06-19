---
phase: 151-pwa-manifest-installability
plan: 02
subsystem: pwa/html-head
tags: [pwa, manifest, ios-meta, apple-touch-icon, theme-color, wave-1]
dependency_graph:
  requires:
    - public/app/manifest.webmanifest (Plan 01)
    - public/app/icons/apple-touch-icon-180.png (Plan 01)
    - src/tests/build-output.test.ts PWA assertions (Plan 01)
  provides:
    - _pages/app/index.html with manifest link + iOS meta block
  affects:
    - _site/app/index.html (manifest link + iOS meta in built output)
    - build-output.test.ts PWA link assertions (turned GREEN)
tech_stack:
  added: []
  patterns:
    - "Static declarative head tags — no script, no untrusted input"
    - "apple-mobile-web-app-* legacy meta set for iOS standalone (Safari ignores manifest display)"
    - "belt-and-suspenders theme-color meta alongside manifest theme_color field"
key_files:
  created: []
  modified:
    - _pages/app/index.html
decisions:
  - "apple-mobile-web-app-status-bar-style: black-translucent (overlays navy header per D-03); `black` is UAT fallback if overlap looks wrong"
  - "Kept existing <link rel=\"icon\" href=\"data:,\"> no-op favicon (per D-08 discretion)"
  - "Symlinked public/data/* from main repo into worktree to enable build (no-op for shipped code)"
metrics:
  duration: "~5 minutes"
  completed: "2026-06-19"
  tasks_completed: 1
  tasks_total: 1
  files_created: 0
  files_modified: 1
---

# Phase 151 Plan 02: Manifest Link + iOS Meta in /app Head Summary

**One-liner:** Wired `<link rel="manifest">` + five iOS PWA meta tags into `_pages/app/index.html` only; build-output link assertions (`_site/app/index.html links the manifest and apple-touch-icon` and `_site/index.html does NOT link a manifest`) turned GREEN (44/44 build-output tests pass).

## What Was Built

### Task 1: Add manifest link + iOS meta to the /app head (and only /app)

`_pages/app/index.html` head now contains:

```html
<link rel="manifest" href="/app/manifest.webmanifest" />
<!-- iOS standalone + status bar -->
<meta name="apple-mobile-web-app-capable" content="yes" />
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
<meta name="apple-mobile-web-app-title" content="BeeAtlas" />
<!-- iOS home-screen icon: 180x180, opaque -->
<link rel="apple-touch-icon" href="/app/icons/apple-touch-icon-180.png" />
<!-- theme color for browser chrome (belt-and-suspenders) -->
<meta name="theme-color" content="#080d26" />
```

`_pages/index.html` is untouched — no manifest link, no iOS meta (D-04 / no-PWA-on-/ guarantee preserved).

**Verification:**
- `grep -q 'rel="manifest"' _pages/app/index.html` — PASS
- `grep -q 'apple-mobile-web-app-capable' _pages/app/index.html` — PASS
- `grep -q 'rel="apple-touch-icon"' _pages/app/index.html` — PASS
- `! grep -q 'rel="manifest"' _pages/index.html` — PASS
- `npx vitest run src/tests/build-output.test.ts` — 44/44 PASS (including the 2 Wave 0 RED tests that turned GREEN)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocker] Worktree missing public/data/* for build**
- **Found during:** Task 1 verification (`npm run build`)
- **Issue:** The worktree's `public/data/` only had `places.geojson` and `places.json`; `_data/species.js` requires `species.json` at Eleventy startup, causing a fatal ENOENT before any HTML was emitted.
- **Fix:** Symlinked the 14 missing data files/directories from the main repo's `public/data/` into the worktree. These symlinks are worktree-local filesystem artifacts and are not committed — they don't affect the shipped code.
- **Files modified:** None committed; worktree-local symlinks only.
- **Commit:** N/A (no code change)

## Known Stubs

None — this plan makes no data wiring; it only adds declarative head tags that reference artifacts already committed in Plan 01.

## Threat Flags

None — all changes are static declarative head tags served over HTTPS. T-151-03 (manifest link leaking onto /) is fully mitigated: `_pages/app/index.html` has its own standalone `<head>` (not a shared partial), and the build-output negative assertion on `_site/index.html` is now GREEN.

## Self-Check: PASSED

- `_pages/app/index.html` modified: FOUND
- Commit `55ba973b` exists: `git log --oneline | grep 55ba973b` → FOUND
- `_site/app/index.html links manifest` test: PASSED (44/44 build-output tests pass)
- `_site/index.html does NOT link manifest` test: PASSED
