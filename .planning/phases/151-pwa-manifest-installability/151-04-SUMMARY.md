---
phase: 151-pwa-manifest-installability
plan: "04"
subsystem: pwa-offline-uat
tags: [pwa, offline, uat, human-verify, pwa-03, service-worker, wa-sqlite, mapbox]
dependency_graph:
  requires: ["151-02", "151-03"]
  provides: ["pwa-03-verified", "offline-cold-start-working"]
  affects: [".planning/phases/151-pwa-manifest-installability/151-HUMAN-UAT.md"]
tech_stack:
  added: []
  patterns: ["human-verify-checkpoint", "real-device-uat", "build-id-diagnostic"]
key_files:
  created:
    - .planning/phases/151-pwa-manifest-installability/151-HUMAN-UAT.md
  modified: []
decisions:
  - "PWA-01/02/03 verified on real iOS device + desktop Chrome; Android deferred (no hardware)."
  - "Offline cold-start renders cached data + table; offline basemap is a Phase 154 (TOS-gated) dependency, not a defect."
requirements_completed: [PWA-03]
status: complete
verified: 2026-06-20
---

# Plan 151-04 — Human UAT: PWA Offline Cold-Start & Installability

## Outcome

PWA-01, PWA-02, PWA-03 verified on real devices (2026-06-20). The offline cold-start UAT
did its job: it caught that offline cold-start had never actually worked on a real device
(Phases 147–149 were DevTools-validated only). Five offline-caching defects were found and
fixed before sign-off — see `151-HUMAN-UAT.md` "UAT Findings & Fixes":

1. wasm not precached (`69097427`)
2. data caches never populated on uncontrolled first load (`f81a4ed6`)
3. worker script wouldn't load offline on iOS → inline worker + cache-loaded wasm (`e77232a4`)
4. data load coupled to the basemap `map.on('load')` → decoupled (`c980281c`)
5. build-id in the cache popover for stale-PWA diagnosis (build-number commit)

## Verification

- **Task 1** — `151-HUMAN-UAT.md` authored (3 scenarios, real-device checklist). Committed `72fad605`.
- **Task 2** — Blocking human-verify checkpoint. Operator confirmed on a real iPhone: install via
  Add-to-Home-Screen, standalone launch, and offline cold-start now renders cached data + table.
  Desktop Chrome confirmed manifest validity + in-app install. Recorded PASS in `151-HUMAN-UAT.md`.

## Deferred

- Offline basemap (Mapbox tiles/style) → Phase 154 (TOS-gated).
- Optional offline dots-on-blank-map via local fallback style.
- Android real-device offline cold-start (no device at verification).
- Revisit no-`skipWaiting`/`clientsClaim` update stickiness (esp. iOS) as its own item.
