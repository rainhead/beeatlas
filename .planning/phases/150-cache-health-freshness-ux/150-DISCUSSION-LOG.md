# Phase 150: Cache Health & Freshness UX - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-06-18
**Phase:** 150-cache-health-freshness-ux
**Areas discussed:** Prime-progress mechanism, Ready-for-offline indicator, Freshness label + manifest.json caching, SW update prompt + storage size

---

## Prime-progress mechanism

### Q1: Progress unit

| Option | Description | Selected |
|---|---|---|
| Bytes (e.g. '12 / 23 MB cached') | Determinate, satisfying, honest about the dominant cost (DB ~99%). Requires content-length per asset. One number, one bar. | ✓ |
| Files (e.g. '3 of 7 cached') | Simpler instrumentation but misleading: DB dominates wall-clock yet counts as 1 of N. | |
| Both — files counter + bytes bar | Most informative but heaviest UI; misaligns with "quiet UI" preference. | |

**User's choice:** Bytes

### Q2: SW emit mechanism

| Option | Description | Selected |
|---|---|---|
| Page-side prime orchestrator (no SW changes) | Page fetches each known data URL via `fetch()` and streams `response.body.getReader()` while postMessage-ing byte progress to `<bee-atlas>`. SW's CacheFirst still caches as side effect. Zero new SW plumbing. | ✓ |
| Workbox plugin hooks in SW + postMessage | Custom plugin on runtime routes with requestWillFetch/cachedResponseWillBeUsed hooks; SW postMessages progress. Authoritative but complicates 149's silent-prime invariant. | |
| Page-side broadcast channel + SW byte count | Hybrid; splits source of truth and adds a 3rd communication channel. | |

**User's choice:** Page-side prime orchestrator

### Q3: Prime denominator

| Option | Description | Selected |
|---|---|---|
| `occurrences.db` + 3 GeoJSONs only | Matches ROADMAP criterion 1 and 149's data-artifacts cache. App shell is precached during SW install (binary "installed or not"). Honest denominator: the user is waiting on `/data/*` bytes. | ✓ |
| App shell + DB + GeoJSON (everything) | Include hashed JS/CSS in the bar. Tiny visual blip at the start; shell is already cached before bar can render. | |
| DB + GeoJSON + checklist.parquet + photos.json + species.json | Whole `/data/` payload. NOT in 149's runtime route; expanding scope is a v5.x decision. | |

**User's choice:** DB + 3 GeoJSONs only

---

## Ready-for-offline indicator

### Q1: Surface

| Option | Description | Selected |
|---|---|---|
| Small pill in `<bee-header>`, next to existing Offline pill | Reuses chrome surface (zero new component). Pill states: "Caching… 47%" → "Finish on WiFi" → "✓ Offline-ready". | ✓ |
| Banner/strip across top of `<bee-atlas>` | Higher visibility but louder; wastes affordance after first-run. | |
| New dedicated 'Storage / Offline' panel in `<bee-pane>` | Sidebar-style; good info-density but hidden by default. | |

**User's choice:** Pill in `<bee-header>`

### Q2: Ready compute logic

| Option | Description | Selected |
|---|---|---|
| Probe `caches.match()` for known asset set; progress bar inside header pill | Cache is sole source of truth; counter is decorative. On resume mid-prime, cache probe is the only honest read. | ✓ |
| Progress events drive ready; bar is separate transient overlay | Counter-based; loses honesty on resume. | |
| Both — counter drives bar during session, cache probe gates final ✓ | Most accurate but most code; two sources to reconcile. | |

**User's choice:** Cache-probe + inline header pill bar

### Q3: Incomplete-prime + offline state

| Option | Description | Selected |
|---|---|---|
| Header pill flips to "Finish on WiFi" + tooltip; blank-basemap overlay (149) covers map | Pill text changes state; map already explains offline via 149's overlay. No new modal. | ✓ |
| Inline alert under header explaining partial data | Louder; verges on editorializing. | |
| Block the table/queries until prime completes | Overly paternalistic; misaligns with "partial cache is still useful". | |

**User's choice:** Pill state change; rely on 149's overlay

---

## Freshness label + manifest.json caching

### Q1: manifest.json runtime cache strategy

| Option | Description | Selected |
|---|---|---|
| NetworkFirst, short timeout (~3 s), fallback to cache | Online: fresh generated_at; offline: cached manifest. New route on `src/sw.ts`. Closes 149's deferred item. | ✓ |
| StaleWhileRevalidate | Always serve cached first; first render shows stale; small file → latency win negligible, staleness flicker is the cost. | |
| Don't cache — always fetch | Offline = manifest load fails = app degrades. Hard reject. | |

**User's choice:** NetworkFirst with ~3 s timeout

### Q2: Format + render location

| Option | Description | Selected |
|---|---|---|
| Relative if fresh, absolute if stale; sub-line in `<bee-header>` or tooltip on pill | "Today" / "3 days ago" / "Data as of Jun 15". Quick to read; honest staleness signal. | ✓ |
| Always absolute date | More precise but heavier visually; no relative-time logic. | |
| Inside Storage/Offline panel (sidebar) | Hides freshness behind a click; misaligns with "always visible" success criterion. | |

**User's choice:** Relative/absolute hybrid, header sub-line

### Q3: Update gate interpretation

| Option | Description | Selected |
|---|---|---|
| Label tracks `manifest.generated_at`; criterion satisfied for free | DB URL is content-hashed → new `generated_at` only ships with new DB → refresh alone never bumps. Simplest. | ✓ |
| Cache displayed date in localStorage; only swap after new DB confirmed cached | Stricter; defends against fresh-manifest/old-DB transient. More state to manage. | |
| Show two dates: "Data as of X (update available: Y)" | Most informative but out of scope. | |

**User's choice:** Track `generated_at` directly

---

## SW update prompt + storage size

### Q1: Update prompt surface

| Option | Description | Selected |
|---|---|---|
| Non-modal banner anchored bottom of `<bee-atlas>`, dismissible | workbox-window `onNeedRefresh` → `<bee-atlas>._updateAvailable` → banner. Dismiss = session-only. Tap = `messageSkipWaiting` + reload. Preserves no-skipWaiting invariant. | ✓ |
| Pill in `<bee-header>` | Visibility too low for an actionable affordance. | |
| Modal blocking dialog | Hard reject: criterion says "non-blocking". | |

**User's choice:** Bottom banner on `<bee-atlas>`

### Q2: Storage estimate location

| Option | Description | Selected |
|---|---|---|
| Tooltip on ready-pill / detail surface reached by clicking the pill | Single cluster surface (ready + freshness + storage + passive update affordance); header chrome stays lean. | ✓ |
| Always-visible caption in `<bee-header>` | Crowds the header on mobile; misaligns with quiet UI. | |
| Sidebar 'Storage / Offline' tab in `<bee-pane>` | Most info-dense but loses colocation with ready/freshness. | |

**User's choice:** Detail surface via ready-pill click

### Q3: workbox-window wiring + component split

| Option | Description | Selected |
|---|---|---|
| workbox-window in `src/sw-registration.ts`; detail surface inside `<bee-header>` | sw-registration already owns SW lifecycle; no new top-level component. | ✓ |
| New `src/sw-update.ts` + dedicated `<bee-cache-status>` component | Cleaner separation but adds a file + element; may be premature. | |
| workbox-window in `src/app-entry.ts`; detail in `<bee-pane>` | Mixes module concerns; pane buries the affordance. | |

**User's choice:** workbox-window in `sw-registration.ts`; popover in `<bee-header>`

---

## Claude's Discretion

- Exact pill / banner / sub-line copy and visual styling (within quiet-UI constraint).
- Exact popover layout (popover vs dropdown menu vs expanded inline area in header).
- Cache name for `manifest.json` runtime route (`data-manifest` vs reusing `data-artifacts`).
- Module placement of the prime orchestrator (own file vs in `app-entry.ts` vs in `cache-probe.ts`).
- Throttling cadence for progress postMessages (every chunk vs every N% vs every 100 KB).
- `<bee-header>` public `cacheState` property vs CustomEvent listener (both fit the state-owner invariant).
- `Intl` locale and relative/absolute threshold (default 7 days is a suggestion).
- Exact copy of byte-total pessimism: if `content-length` is absent on a response, what fallback total to render the bar against (planner picks).

## Deferred Ideas

- Expanding the runtime-cache asset set beyond DB + 3 GeoJSONs (`checklist.parquet`, `photos.json`, `species.json`, `species-maps/*`) — future v5.x scope conversation.
- Per-cache breakdown ("X MB shell + Y MB data") in storage popover — diagnostics only; not in criteria.
- `visibilitychange` re-probe — punted by 149 D-07; same here.
- Telemetry / diagnostics panel for failed prime attempts and last-successful-prime time.
- Localizing the freshness string beyond `en-US`.
- First-run onboarding overlay explaining offline-caching behavior.
- Always-visible "Online ✓" affordance (rejected, matches 149's posture).
- Tile-cache-aware storage estimate — depends on Phase 154.
