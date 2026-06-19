---
phase: 151-pwa-manifest-installability
plan: "03"
subsystem: pwa-install-affordance
tags: [pwa, install, beforeinstallprompt, ios-a2hs, bee-header, bee-atlas]
dependency_graph:
  requires: ["151-01"]
  provides: ["pwa-install-ui", "window.__pwaPrompt", "install-affordance-tests-green"]
  affects: ["src/install-prompt.ts", "src/app-entry.ts", "src/bee-atlas.ts", "src/bee-header.ts"]
tech_stack:
  added: []
  patterns: ["early-window-capture (mirrors sw-registration.ts)", "state-owner-presenter-relay (bee-atlas → bee-header)", "cache-popover-chrome-reuse"]
key_files:
  created:
    - src/install-prompt.ts
  modified:
    - src/app-entry.ts
    - src/bee-atlas.ts
    - src/bee-header.ts
decisions:
  - "isStandalone() + isIosSafari() placed as module-level functions in bee-atlas.ts so install-affordance.test.ts source-analysis assertions find the strings without mounting a component"
  - "iOS popover mounted adjacent to the iosInstructable branch in render() rather than separately, to keep both popovers parallel in the DOM tree (matches cache-popover placement)"
  - "_standaloneQuery stored as non-reactive private field to avoid triggering re-renders on construction; listener fires on mode change only"
metrics:
  duration_minutes: 20
  completed_date: "2026-06-19"
  tasks_completed: 3
  tasks_total: 3
  files_changed: 4
---

# Phase 151 Plan 03: Install Affordance Implementation Summary

**One-liner:** Beforeinstallprompt early-capture module + state relay through bee-atlas to a quiet Install button + iOS A2HS popover in bee-header, reusing cache-popover chrome verbatim.

## Tasks Completed

| Task | Name | Commit | Key Files |
|------|------|--------|-----------|
| 1 | install-prompt.ts — capture beforeinstallprompt + __pwaPrompt | fab52a24 | src/install-prompt.ts (new), src/app-entry.ts |
| 2 | bee-atlas.ts — _installable/_iosInstructable state + relay | 9af78141 | src/bee-atlas.ts |
| 3 | bee-header.ts — Install button + iOS A2HS popover | 28b514b0 | src/bee-header.ts |

## What Was Built

**src/install-prompt.ts** (new): Module-scope `beforeinstallprompt` capture that calls `e.preventDefault()` (suppresses mini-infobar, D-09), stashes the event, dispatches `pwa-installable`. On `appinstalled` dispatches `pwa-installed` and clears stash. Exposes `window.__pwaPrompt` async handoff mirroring the `window.__wb` pattern from sw-registration.ts. Includes local `BeforeInstallPromptEvent` interface (lib.dom does not ship it). Imported ONLY from app-entry.ts — structural no-PWA-on-/ guarantee (D-04).

**src/bee-atlas.ts** (modified): Module-level `isStandalone()` (checks `display-mode: standalone` media query AND `navigator.standalone`) and `isIosSafari()` (iPad/iPhone/iPod UA OR MacIntel+maxTouchPoints for iPadOS, Safari present, CriOS/FxiOS/EdgiOS/GSA/FBAN exclusions, no version-sniff per D-12). Added `_installable` and `_iosInstructable` @state, `_standaloneQuery` MediaQueryList field. connectedCallback registers `pwa-installable`/`pwa-installed` window listeners, `install-prompt` host listener, and `display-mode: standalone` change listener (all removed in disconnectedCallback). Handlers: `_onPwaInstallable` (gated on `!isStandalone()`), `_onPwaInstalled`, `_onInstallPrompt` (calls `window.__pwaPrompt?.()`), `_onStandaloneChange`. render() passes `.installable` and `.iosInstructable` to `<bee-header>`.

**src/bee-header.ts** (modified): Added `installable`/`iosInstructable` @property and `_iosPopoverOpen` @state. Install button (`.icon-btn install-btn`, 44px, currentColor white, green focus ring): Android branch dispatches `install-prompt` (bubbles/composed); iOS branch toggles `_iosPopoverOpen` with `aria-haspopup="dialog"` and `aria-expanded`. Quiet chrome when neither flag is set. iOS A2HS popover clones `.cache-popover` shell (role=dialog, aria-modal=false, 44px ✕ dismiss, Share glyph, 3-step copy). `_onDocumentClick` and `_onDocumentKeydown` extended to also dismiss `_iosPopoverOpen`. `_renderIosPopover()` method added. Button placement: `[Offline pill?] [Install] [Cache] [GitHub]`.

## Verification

- `VITEST_SKIP_BUILD=1 npm test`: **646 tests passed / 44 skipped** (9 install-affordance.test.ts assertions all green)
- Pre-existing `data-species.test.ts` failure (missing `public/data/species.json` in worktree) is unrelated to this plan
- All 9 Wave 0 RED assertions from install-affordance.test.ts now pass GREEN:
  - install-prompt.ts exists, contains `beforeinstallprompt`, `preventDefault`, `appinstalled`
  - bee-atlas.ts / bee-header.ts contain `navigator.standalone`, `display-mode: standalone`, `MacIntel`, `maxTouchPoints`, `CriOS`, `Safari`

## Deviations from Plan

None — plan executed exactly as written.

## Known Stubs

None. All install affordance wiring is complete. The Install button will only become visible when `beforeinstallprompt` fires (Android) or when `isIosSafari() && !isStandalone()` (iOS), which requires a real device/browser — not a stub condition.

## Threat Flags

None beyond those already documented in the plan's threat_model (T-151-05/06/07). No new network endpoints, auth paths, or file access patterns introduced.

## Self-Check

Files created/modified:
- [x] src/install-prompt.ts exists
- [x] src/app-entry.ts contains `install-prompt`
- [x] src/bee-atlas.ts contains `_installable`, `_iosInstructable`, `__pwaPrompt`, `isStandalone`, `isIosSafari`
- [x] src/bee-header.ts contains `installable`, `iosInstructable`, `_iosPopoverOpen`, `install-btn`, `install-prompt`

Commits verified:
- [x] fab52a24 (Task 1 — install-prompt.ts)
- [x] 9af78141 (Task 2 — bee-atlas.ts)
- [x] 28b514b0 (Task 3 — bee-header.ts)

## Self-Check: PASSED
