# Phase 154: Mapbox Basemap Performance Cache - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-06-21
**Phase:** 154-mapbox-tile-caching-tos-gated
**Areas discussed:** Legal constraints (ToS research), Phase direction after finding, Cache strategy, Rollout

---

## Legal constraints — Mapbox ToS research

The user asked, before selecting discussion areas, what legal constraints had
been found regarding offline caching of Mapbox assets. None had — the phase had
been written around an unresolved "TOS-review gate" rather than verified terms.
A research agent fetched primary sources (Mapbox Product Terms 2026-06-17, master
ToS 2024-03-31, Mapbox docs).

**Finding:** Offline-first caching of Mapbox basemap assets on the **web SDK**
(GL JS) is **not licensed**. §1.9 bars caching "except as otherwise expressly
permitted"; §2.8.1 permits only a ≤30-day on-device cache populated live from the
APIs (not offline serving); offline map download is a **Mobile-SDK-only** product.
Two original success criteria were in tension with the terms: stripping
`access_token` (§1.1/§2.9.4) and the implicit no-attribution-offline assumption
(§1.4 has no offline exception).

---

## Phase direction after the finding

| Option | Description | Selected |
|--------|-------------|----------|
| Cancel + record ADR | Don't build; record legal finding, mark TILE-01/02 won't-do, close v5.0 with offline-basemap out of scope | |
| Build self-test-only behind flag | Build flag-off SW cache for local self-test only, never public | |
| Pursue Mapbox written OK first | Pause; contact Mapbox legal/sales for written web-offline confirmation | |
| Narrow to compliant perf cache | Drop "offline"; build a ToS-compliant network-first/SWR ≤30-day performance cache, attribution intact, token unchanged | ✓ |

**User's choice:** Narrow to compliant performance cache.
**Notes:** Claude flagged that even compliant, the practical perf benefit over the
browser HTTP cache is modest (faster warm loads on revisit), and that offline
basemap remains covered by Phase 149's graceful degradation.

---

## Cache strategy

| Option | Description | Selected |
|--------|-------------|----------|
| StaleWhileRevalidate | Serve cache instantly, revalidate in background — the real perf win, squarely a §2.8.1 perf cache | ✓ |
| NetworkFirst | Always fetch fresh, cache only on failure — ~no online benefit, used mainly offline (the use we're avoiding) | |
| CacheFirst + short TTL | Fastest repeat loads but serves stale tiles longest; matches existing data-artifacts route | |

**User's choice:** StaleWhileRevalidate.

---

## Rollout

| Option | Description | Selected |
|--------|-------------|----------|
| Keep flag, default off | Ship behind `beta_tile_cache` off; enable deliberately later | |
| Ship enabled by default | Compliant, so register route unconditionally and drop the flag | ✓ |
| Keep flag, default on | Active by default but retains a kill switch | |

**User's choice:** Ship enabled by default — drop the `beta_tile_cache` flag entirely.

---

## Claude's Discretion

- Exact host/URL match predicate(s); verify CORS (non-opaque) vs opaque responses in DevTools before finalizing `maxEntries`.
- TTL value and `maxEntries` within the ≤30-day legal bound.
- Test surface following existing sw route / build-output test patterns.

## Deferred Ideas

- True offline basemap via a Mobile SDK, written Mapbox confirmation, or a self-hostable tile source (MapLibre + Protomaps/OpenFreeMap) — future milestone.
