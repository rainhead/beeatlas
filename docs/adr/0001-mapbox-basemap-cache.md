# ADR 0001: Mapbox Basemap Cache — ToS Compliance Analysis

**Status:** Accepted (2026-06-21)

---

## Context

BeeAtlas serves a Mapbox GL JS (v3.24.1) basemap (`mapbox://styles/mapbox/outdoors-v12`) in the
`/app` progressive web app shell. Phase 154 considered adding a Workbox service worker route to
cache basemap assets — vector tiles, style JSON, sprites, and glyphs — for faster warm/repeat
map loads.

Before shipping, the Mapbox Product Terms ("Last Updated: June 17, 2026";
https://www.mapbox.com/legal/product-terms) were reviewed for caching permissions.

### §1.9 Default Restriction

§1.9 states that a customer may not "export, download, cache or store Licensed Map Content ...
except as otherwise expressly permitted." Silence equals prohibited. Any basemap caching
requires express permission.

### §3.31 — Licensed Map Content scope

§3.31 defines Licensed Map Content to include "map tile, static map image, style file, glyph,
and/or sprite." All basemap resources fetched by Mapbox GL JS are Licensed Map Content.

### §3.43 — Map Load billing

§3.43 defines a Map Load as a call to `new mapboxgl.Map()` (12-hour session). Web billing is
per Map Load, not per tile. This means tile-level caching does not alter billing accounting,
but the service worker must not interfere with the Map Load session path.

### §2.8.1 — On-Device Performance Cache Exception

§2.8.1 grants an explicit exception: a customer may maintain a cache of Licensed Map Content
on an end-user device, provided:

- the cache is populated **directly from the Mapping APIs** (no proxy, redistribution, or
  static-image substitution);
- the cached content is not retained for **more than 30 days**;
- the cache serves only **on-device** use (no external serving or redistribution).

Offline download is **not** granted by §2.8.1 for the web SDK. The offline download right
(pre-fetching tiles for offline map display) belongs exclusively to the Mapbox Mobile SDK
(native iOS/Android). This is confirmed at https://docs.mapbox.com/help/troubleshooting/mobile-offline/.

### §1.4 — Mandatory Attribution

§1.4 requires the Mapbox logo, "© Mapbox", "© OpenStreetMap", and "Improve this map" to be
visible at all times. §1.4 has **no offline exception** — attribution must be displayed even
when basemap tiles are served from cache.

### §1.1 and §2.9.4 — Credentials and Billing Integrity

§1.1 requires access only with authorized credentials. §2.9.4 prohibits modifying
billing/accounting code. Stripping or rewriting the `access_token` query parameter from
cached request URLs would conflict with both clauses.

### §1.3.9 — No fee reduction

§1.3.9 prohibits any action that "improperly decreases fees owed to Mapbox." The service
worker must not intercept Map Load session events or otherwise suppress Map Load accounting.

---

## Decision

**Ship a §2.8.1-compliant on-device performance cache using StaleWhileRevalidate in the `/app`
service worker. Do NOT ship offline basemap serving.**

The cache is a live-populated, short-TTL, per-device performance optimization: it serves
previously-fetched tiles instantly on repeat page loads while online, then revalidates from the
network in the background. This is not an offline feature.

**Verdict: web-SDK offline basemap serving is NOT licensed under the Mapbox Product Terms.**
True offline basemap display (pre-fetching tiles to display without a network connection) is a
Mobile-SDK-only right and is explicitly out of scope for this project under v5.0.

The implementation uses `StaleWhileRevalidate` from `workbox-strategies`:

```
registerRoute(
  ({ url }) => url.hostname === 'api.mapbox.com' && !url.pathname.startsWith('/map-sessions/'),
  new StaleWhileRevalidate({
    cacheName: 'mapbox-basemap',
    plugins: [
      new CacheableResponsePlugin({ statuses: [200] }),
      new ExpirationPlugin({ maxEntries: 150, maxAgeSeconds: 604800, purgeOnQuotaError: true }),
    ],
  })
);
```

---

## Compliance Checklist

The design satisfies every §2.8.1 / §1.4 requirement:

| Requirement | Clause | Implementation |
|-------------|--------|----------------|
| Cache populated live from Mapping APIs only | §2.8.1 | StaleWhileRevalidate fetches from `api.mapbox.com` on every cache miss and revalidates in background; no pre-fetch, proxy, or redistribution |
| TTL ≤ 30 days | §2.8.1 | `maxAgeSeconds: 604800` (7 days) — well within the 2,592,000-second ceiling |
| On-device use only | §2.8.1 | Cache Storage API is per-origin, per-device — cannot be shared or redistributed |
| 200-only caching (no opaque responses) | §2.8.1 / correctness | `CacheableResponsePlugin({ statuses: [200] })` — also suppresses StaleWhileRevalidate's default opaque allowance |
| Telemetry not intercepted | §2.9.4 / §1.3.9 | `url.hostname === 'api.mapbox.com'` strict equality — `events.mapbox.com` (telemetry host) never matches |
| Billing session path not intercepted | §2.9.4 / §1.3.9 | `!url.pathname.startsWith('/map-sessions/')` — Map Load session accounting passes through unmodified |
| `access_token` retained in cache key | §1.1 / §2.9.4 | No `cacheKeyWillBeUsed` plugin — token is not stripped or rewritten; URLs are stable per deployment |
| Mapbox attribution displayed | §1.4 | `attributionControl: true` in `src/bee-map.ts` (Mapbox GL JS default) — not suppressed; §1.4 has no offline exception |
| No fee reduction | §1.3.9 | Cache does not suppress or delay billing events; Map Loads are counted normally |

---

## Consequences

### Benefits

- Faster warm/repeat basemap loads on revisit to `/app` while online. The service worker cache
  is faster than the browser's own HTTP cache because it avoids the HTTP cache validation
  round-trip on conditional GET requests.
- Documented legal position for the caching behavior, reviewable on future Mapbox ToS updates.

### Limitations

- The perf benefit is modest over the browser's HTTP cache for users with fast connections.
- Offline basemap display remains gracefully degraded per Phase 149: tiles show as blank/gray
  when the device is offline, which is acceptable for the current field-use case.

### Deferred — True Offline Basemap

True offline basemap (pre-fetching tiles for display without a network connection) is
**out of scope for v5.0**. If this becomes a hard requirement, the compliant options are:

1. **Mapbox Mobile SDK** (native iOS/Android app) — offline download is a first-class right.
2. **Written Mapbox confirmation** that a web offline cache is permitted for this account.
3. **Self-hostable / openly-licensed tile source** — e.g., MapLibre GL JS with
   Protomaps or OpenFreeMap tiles, which carry no ToS restriction on offline caching.

The `mapbox-basemap` cache in the service worker is intentionally named to be separate from
`data-artifacts` and `data-manifest`, so it can be invalidated or replaced independently if
the tile source is ever changed.

---

*References: Mapbox Product Terms, Last Updated: June 17, 2026 — https://www.mapbox.com/legal/product-terms*
*Phase 154 — mapbox-tile-caching-tos-gated*
