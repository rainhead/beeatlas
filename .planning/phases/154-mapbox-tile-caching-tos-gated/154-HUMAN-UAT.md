---
status: partial
phase: 154-mapbox-tile-caching-tos-gated
source: [154-VERIFICATION.md]
started: 2026-06-21T23:17:08Z
updated: 2026-06-21T23:17:08Z
---

# Phase 154 — Human Verification (Mapbox Basemap Performance Cache)

All automated checks passed (7/7 must-haves; 51/51 build-output assertions green).
The 3 items below require a real browser with a live `VITE_MAPBOX_TOKEN` — they confirm
the cache behaves as designed against real Mapbox traffic. Run `npm run dev`, open
`/app/`, and use Chrome DevTools.

## Current Test

[awaiting human testing]

## Tests

### 1. Cache Storage population
expected: After loading the map on `/app/`, DevTools → Application → Cache Storage shows a `mapbox-basemap` cache. Stored request URLs are from `api.mapbox.com`, are CORS/non-opaque (status 200, not "opaque"), and **retain** the `?access_token=...` query param in the key. No `events.mapbox.com` or `/map-sessions/` entries appear.
result: [pending]

### 2. Warm-reload cache hit + attribution
expected: Reload the page (still online). In DevTools → Network, basemap tile/style requests are served "(from ServiceWorker)" / "(ServiceWorker)". The basemap renders, and the Mapbox attribution control (Mapbox logo + © Mapbox + © OpenStreetMap + Improve this map) remains visible.
result: [pending]

### 3. Tile host confirmation
expected: In DevTools → Network (filter `mapbox`), confirm Mapbox GL JS v3 (outdoors-v12) routes tile/style/sprite/glyph fetches through `api.mapbox.com` (not `tiles.mapbox.com`), validating that the `url.hostname === 'api.mapbox.com'` predicate covers real basemap traffic.
result: [pending]

## Summary

total: 3
passed: 0
issues: 0
pending: 3
skipped: 0
blocked: 0

## Gaps
