# Phase 153: Occurrences Near Me - Research

**Researched:** 2026-06-20
**Domain:** Client-side geospatial proximity filtering (wa-sqlite worker) + Lit reactive state + URL round-trip
**Confidence:** HIGH

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D-01:** Tapping "Near me" puts the chip into an **active/pending state immediately**; the map/list holds (no result change) until the first GPS fix arrives, then filters. This is the GPS-fix barrier in user-visible form.
- **D-02:** On **denied or unavailable** location, **reuse the Phase 152 toast/banner** (`_locationError` / `_locationErrorKind: 'denied' | 'unavailable'`) and leave the chip inactive (do not strand it in a permanently-pending state). The rest of the app is unaffected.
- **D-03:** Tapping "Near me" **also activates the map's `GeolocateControl`** (programmatically `.trigger()` it). Near-me consumes the `_userLocation` the control relays upward — the control is the single source of the position; near-me does not open its own `getCurrentPosition`.
- **D-04:** The filtered set is **frozen at the position captured when the chip is activated**. The blue dot keeps tracking and may drift, but the near-me set does **not** re-query on every GPS fix. No throttling needed this phase.
- **D-05:** **Refresh = re-tap the chip.** No dedicated refresh affordance.
- **D-06:** "Near me" is a **standalone chip on its own line** in the filter summary — NOT grouped under Where/region. Renders as a removable chip when active (✕ removes it). Suggested read: `Near me · 10 km`.
- **D-07:** Add `nearMe: boolean` to `FilterState`; serialize as `?near=1` only when active (parse `near=1` → true). On restore, re-activate geolocation (trigger the control) and **defer the query until a fix arrives**. Coordinates never persisted. "Clear filters" sets `nearMe=false` and drops `near`.
- **D-08:** When zero occurrences fall within 10 km, **reuse the existing empty state**. No near-me-specific copy.

### Claude's Discretion
- The exact `FilterState` field name (`nearMe` suggested) and the chip's exact label/spacing.
- Whether the bbox pre-filter widens by the GPS `accuracy` value or uses a plain 10 km box — pick the simpler correct option.
- Whether the haversine runs as pure SQL or as a JS post-filter — **this phase's named research item** (resolved below: pure SQL recommended).
- The precise mechanics of the pending→active chip styling.

### Deferred Ideas (OUT OF SCOPE)
- Live-following near-me (re-query per GPS fix, throttled) — explicitly declined (D-04).
- Configurable/surfaced radius — 10 km is fixed.
- Distance sort / "nearest N" ranking — binary within-radius filter only.
- Recenter-button-as-refresh coupling — declined in favor of re-tap.
- Basemap tile caching (Phase 154).
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| NEAR-01 | "Near me" chip filters to occurrences within fixed 10 km radius; AND-composes with taxon/date/region/selection filters and the table/list view. | Bbox + haversine clause appended in `buildFilterSQL` composes automatically via `' AND '` (filter.ts:322). `nearMe` must be added to `isFilterActive` (filter.ts:233). The clause flows to ALL query paths that call `buildFilterSQL` — map (`queryVisibleGeoJSON`), table (`queryTablePage`), list (`queryListPage`), CSV (`queryAllFiltered`), bounds (`queryOccurrencesByBounds`) — so AND-composition with map + list/table is automatic. |
| NEAR-02 | Bbox SQL pre-filter + haversine distance check **in the worker**; waits for a GPS fix before firing; returns < 200 ms on full set. | **Empirically: pure-SQL haversine works** (`SELECT sin(1.0)` → `0.841…`). All SQL runs in the worker (sqlite.ts:77 `exec` → postMessage). Measured **12.7 ms** (bbox+haversine) / 34.3 ms (full-scan) on the real 97,648-row DB — both far under 200 ms. GPS-fix barrier via a `_nearMePending` flag + the existing `_filterGuard` stale-guard. |
| NEAR-03 | `?near=1` round-trips (coords ephemeral); restore re-activates geolocation and defers query until a fix; "Clear filters" clears the chip. | `buildParams`/`parseParams` (url-state.ts) get a boolean `near` param. Restore sets `nearMe=true` + triggers control + defers query (same pending flow as a fresh tap). "Clear filters" already nulls every FilterState field — `nearMe=false` joins them. |
</phase_requirements>

## Summary

Phase 153 adds a single boolean filter (`nearMe`) that, when active, restricts the occurrence set to points within 10 km of a **frozen** GPS position. The four moving parts are: (1) a `nearMe: boolean` field on `FilterState` + a separately-threaded ephemeral `{lat, lon}` center; (2) a bbox + haversine SQL clause in `buildFilterSQL`; (3) a standalone removable chip in `<bee-pane>`; (4) a `?near=1` URL round-trip plus an activation handler in `<bee-atlas>` that `.trigger()`s the GeolocateControl and defers the query until `_userLocation` is non-null.

**The phase's named research item is resolved empirically.** The roadmap flag hypothesized that MemoryVFS likely does **not** expose trig functions, pushing toward bbox-SQL + JS-haversine. **This hypothesis is wrong.** The exact `wa-sqlite.wasm` the worker loads (SQLite 3.44.0) was compiled with the math extension: `SELECT sin(1.0)` returns `0.8414709848078965`, and a full pure-SQL haversine over the real DB runs in 12.7 ms. **Recommendation: pure-SQL haversine with a bbox pre-filter, entirely inside `buildFilterSQL`.** This keeps all proximity logic in one place, runs in the worker (satisfying NEAR-02's "in the worker" wording), and needs no JS post-filter in `queryVisibleGeoJSON`. Note SC-3 in the roadmap *names* "JavaScript haversine post-filter" — flag this as a planner decision: the success criterion's prescribed mechanism is contradicted by the measured reality, and pure-SQL is strictly simpler and faster. (See Open Questions Q1.)

The hardest design question is **where the ephemeral center lives.** `FilterState` is serialized to the URL (`buildParams`); the captured lat/lon must NOT be (D-07: coordinates never persisted). Recommendation: keep `nearMe: boolean` on `FilterState` (serializable) and thread the captured `{lat, lon}` as a **separate argument** to the query functions — do NOT add coordinates to `FilterState`. `buildFilterSQL` gains an optional second parameter `nearMeCenter: {lat, lon} | null`.

**Primary recommendation:** Pure-SQL bbox+haversine clause in `buildFilterSQL(f, nearMeCenter?)`; `nearMe: boolean` on FilterState (serialized as `?near=1`); ephemeral center threaded as a non-serialized second arg; a `_nearMePending` flag on `<bee-atlas>` gates the deferred query, which fires from `_onUserLocationChanged` exactly once per activation through the existing `_filterGuard`.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Proximity SQL (bbox + haversine) | sqlite-worker (via `buildFilterSQL`) | — | NEAR-02 requires the distance check in the worker; SQL runs there already. |
| `nearMe` state ownership + activation | `<bee-atlas>` | — | State-owner invariant: all reactive filter state lives on `<bee-atlas>`. |
| GeolocateControl `.trigger()` | `<bee-map>` (hosts control) | `<bee-atlas>` (commands it) | Pure-presenter: `<bee-map>` owns the control instance; `<bee-atlas>` must reach it via a public method or prop. |
| Position capture (frozen center) | `<bee-atlas>` | — | Reads `_userLocation` (already owned here) at activation; snapshots into an ephemeral field. |
| Near-me chip render + remove | `<bee-pane>` | — | Presenter renders chip from props; emits event upward. |
| URL `?near=1` round-trip | `url-state.ts` (pure) | `<bee-atlas>` (calls it) | Serialization is a pure function of FilterState. |

## Standard Stack

No new packages. This phase is pure application code over the existing stack.

### Core (already installed — verified present in node_modules)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| wa-sqlite | 1.0.0 (vendored, SQLite **3.44.0**) | In-worker SQL engine; **math extension compiled in** | Already the frontend SQL engine; DuckDB-WASM explicitly rejected (project memory). |
| mapbox-gl | (installed) | `GeolocateControl` (Phase 152) | Provides the single source of position via `.trigger()`. |
| lit | (installed) | Reactive components | Existing component framework. |

**Installation:** None. No `npm install` required.

## Package Legitimacy Audit

Not applicable — this phase installs **no external packages**. All work is application code over the existing dependency set.

## Architecture Patterns

### System Architecture Diagram

```
  [User taps "Near me" chip in <bee-pane>]
            │  emits near-me-changed (or filter-changed w/ nearMe)
            ▼
  <bee-atlas>._onNearMeToggle()
            │
            ├─ set _filterState.nearMe = true            (chip → pending/active)
            ├─ set _nearMePending = true                  (GPS-fix barrier flag)
            ├─ command <bee-map> to .trigger() control     (D-03)
            └─ IF _userLocation already non-null:          (fast path — fix already in hand)
                    capture center, clear _nearMePending, run guarded query

  [GeolocateControl fires 'geolocate' → <bee-map> emits user-location-changed]
            ▼
  <bee-atlas>._onUserLocationChanged(e)
            │  stores _userLocation (existing)
            └─ IF _nearMePending:                          (deferred-query trigger)
                    _nearMeCenter = { lat, lon } (FROZEN — D-04)
                    _nearMePending = false                 (one-shot: subsequent fixes do NOT re-query)
                    _runFilterQuery()                      (through _filterGuard)

  _runFilterQuery() ──► queryVisibleGeoJSON(_filterState, _nearMeCenter)
                              │
                              ▼
                    buildFilterSQL(f, nearMeCenter)
                              │  appends: lat/lon bbox AND pure-SQL haversine <= 10
                              ▼
                    sqlite3.exec(db, sql)  ──RPC──►  [sqlite-worker: SQL runs here]
                              │
                              ▼
                    filtered GeoJSON + ids ──► map + list/table re-render

  [URL]  buildParams(...) appends near=1 when _filterState.nearMe
         parseParams(...) reads near=1 → filter.nearMe=true (coords NEVER in URL)
         restore path: nearMe=true → set _nearMePending → trigger control → defer
```

### Pattern 1: Pure-SQL bbox + haversine clause in `buildFilterSQL`
**What:** Append two clauses when `nearMe && nearMeCenter`: a cheap lat/lon bbox pre-filter (lets SQLite skip the trig for far rows), then the exact haversine.
**When to use:** Always, when `nearMe` is active and a center is provided.
**Where:** `filter.ts` `buildFilterSQL`, after the elevation block (around line 320), before the join at line 322.
**Example:**
```typescript
// Source: VERIFIED empirically against public/data/occurrences.db (97,648 rows, 12.7 ms)
// Signature change: buildFilterSQL(f: FilterState, nearMeCenter: { lat: number; lon: number } | null = null)
const NEAR_RADIUS_KM = 10.0;
const EARTH_KM = 6371.0;
if (f.nearMe && nearMeCenter !== null) {
  const { lat, lon } = nearMeCenter;            // numbers from GeolocationCoordinates — no string escaping
  const dLat = NEAR_RADIUS_KM / 111.32;          // ≈ 0.0898° — latitude degrees per km is ~constant
  const cosLat = Math.cos(lat * Math.PI / 180);  // longitude correction at this latitude
  const dLon = NEAR_RADIUS_KM / (111.32 * cosLat); // ≈ 0.133° at lat 47.6 (WA)
  // Bbox pre-filter — coarse, lets the planner skip trig on the ~95% of rows far away.
  occurrenceClauses.push(
    `lat BETWEEN ${lat - dLat} AND ${lat + dLat} ` +
    `AND lon BETWEEN ${lon - dLon} AND ${lon + dLon}`
  );
  // Exact haversine — pure SQL (math extension confirmed: SELECT sin(1.0) => 0.841…).
  occurrenceClauses.push(
    `${EARTH_KM} * 2 * asin(sqrt(` +
    `power(sin(radians(lat - ${lat}) / 2), 2) + ` +
    `cos(radians(${lat})) * cos(radians(lat)) * ` +
    `power(sin(radians(lon - (${lon})) / 2), 2))) <= ${NEAR_RADIUS_KM}`
  );
}
```
**Note on `lat`/`lon` qualification:** the invariant at filter.ts:246 says clauses qualify the occurrences table as `o`. Existing clauses use bare `lat`/`lon` (e.g. `queryOccurrencesByBounds` at line 457, `queryListPage` boundsClause at 412) because `lat`/`lon` exist only in `occurrences`, not `taxa` — so bare references are unambiguous. Follow the existing convention (bare `lat`/`lon`), matching the bounds clauses already in the file.

### Pattern 2: Ephemeral center threaded as a separate argument (NOT on FilterState)
**What:** `nearMe: boolean` is serializable and lives on `FilterState`. The captured `{lat, lon}` is ephemeral (D-07: never persisted) and lives as a private `_nearMeCenter` on `<bee-atlas>`, passed explicitly to query functions.
**Why:** Putting coordinates on `FilterState` would (a) risk them leaking into `buildParams`, violating D-07, and (b) make `FilterState` equality/round-trip tests lie. Keeping `nearMe` boolean-only preserves the clean URL contract.
**Threading:** `buildFilterSQL(f, nearMeCenter?)` gains an optional second param defaulting `null`. Each caller that needs proximity passes it: `queryVisibleGeoJSON(f, nearMeCenter)`, `queryTablePage(f, …, nearMeCenter)`, `queryListPage(f, …, nearMeCenter)`, `queryAllFiltered(f, sortBy, nearMeCenter)`, `queryOccurrencesByBounds(f, bounds, nearMeCenter)`. `<bee-atlas>` passes `this._nearMeCenter` everywhere it currently passes `this._filterState`.

### Pattern 3: GPS-fix barrier via a one-shot pending flag
**What:** Activation sets `_nearMePending = true`. The next `_userLocation` update captures the center, flips the flag off, and fires the query. Because it's one-shot, subsequent GPS fixes (the drifting dot) do NOT re-query — this *is* the freeze (D-04) and removes any need for throttling.
**When to use:** Both fresh-tap activation and URL restore (`?near=1`) use the identical pending flow.
**Fast path:** If `_userLocation` is already non-null at tap time (returning user, granted permission, dot already up), skip the wait: capture immediately and query in the same handler.

### Anti-Patterns to Avoid
- **Re-querying on every GPS fix** — violates D-04 (freeze). The one-shot `_nearMePending` flag prevents this; do NOT call `_runFilterQuery()` unconditionally from `_onUserLocationChanged`.
- **Storing lat/lon on FilterState** — violates D-07 (coords never persisted) and would leak into `buildParams`. Thread as a separate arg.
- **JS post-filter in `queryVisibleGeoJSON`** — unnecessary given pure-SQL works; would split proximity logic across two files and skip the other query paths (table/list/CSV), breaking AND-composition there.
- **Opening a second `getCurrentPosition`** — violates D-03 (single source of position). Consume `_userLocation` only.
- **Forgetting `isFilterActive`** — if `nearMe` is not added to `isFilterActive` (filter.ts:233), `queryVisibleGeoJSON` returns `null` early (line 331) and the map shows ALL points despite an active chip.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Great-circle distance | A JS haversine loop over returned rows | Pure-SQL `asin/sqrt/radians/sin/cos` in `buildFilterSQL` | Math extension is compiled in (verified); SQL runs in-worker, filters before serialization, and reaches all query paths. |
| Stale async query discard | A new pending/generation counter | Existing `_filterGuard` (makeStaleGuard, stale-guard.ts) | Already wraps `_runFilterQuery`; the deferred near-me query slots in unchanged. |
| Geolocation acquisition | New `navigator.geolocation.getCurrentPosition` | Existing GeolocateControl + `_userLocation` relay (Phase 152) | D-03: single source of position; control already handles offline GPS, permission, accuracy ring. |
| Denial/unavailable UX | New error banner | Existing `_locationError` / `_locationErrorKind` toast (Phase 152 D-04) | D-02: reuse verbatim. |
| Removable chip UI | New chip component | Existing `.chip` / `.chip-remove` CSS (bee-pane.ts:303-325) | D-06: same removable-chip affordance, rendered standalone. |

**Key insight:** Almost everything this phase needs already exists. The genuinely new code is ~3 clauses of SQL, one boolean on FilterState, one URL param, one chip, and one activation/deferral handler. Resist building parallel infrastructure.

## Runtime State Inventory

Not a rename/refactor/migration phase — **omitted** (greenfield feature on existing substrate).

## Common Pitfalls

### Pitfall 1: `isFilterActive` not updated → near-me silently shows all points
**What goes wrong:** Chip appears active but the map shows every occurrence.
**Why it happens:** `queryVisibleGeoJSON` early-returns `null` when `!isFilterActive(f)` (filter.ts:331). `isFilterActive` (filter.ts:233) enumerates every field explicitly; a new field is invisible to it unless added. The parallel copy of this OR-chain in `url-state.ts:188` (`hasFilter`) and `parseParams`/`buildParams` must also learn about `near`.
**How to avoid:** Add `|| f.nearMe` to `isFilterActive` AND update the three url-state.ts spots (`buildParams` set, `parseParams` parse, `hasFilter` guard). Wave-0 test: `isFilterActive({...empty, nearMe:true}) === true`.
**Warning signs:** Chip active, map unchanged; or `?near=1` present but filter object absent after parse.

### Pitfall 2: Querying before a fix arrives → empty/garbage result
**What goes wrong:** Activation fires `_runFilterQuery()` immediately, but `_nearMeCenter` is null → `buildFilterSQL` skips the proximity clause → near-me appears to match everything (or, if you query with a null center defensively, matches nothing).
**Why it happens:** GPS fix is async; the first fix can be hundreds of ms to seconds after `.trigger()`.
**How to avoid:** The pending-flag barrier (Pattern 3). Do NOT run the query at tap time unless `_userLocation` is already non-null. Capture center in `_onUserLocationChanged`, then query.
**Warning signs:** Map filters momentarily then "snaps" to the real set, or shows all points while chip is active.

### Pitfall 3: Drifting dot re-queries (freeze violation)
**What goes wrong:** Every GPS fix re-runs the proximity query, the set shifts under the user, battery/CPU churn.
**Why it happens:** `_onUserLocationChanged` re-querying unconditionally.
**How to avoid:** One-shot `_nearMePending` — capture + flip off + query exactly once per activation. Subsequent fixes update `_userLocation` (blue dot) but do nothing to the filter. This is the Phase-152-D-05 throttle concern resolved by design (D-04).

### Pitfall 4: `.trigger()` called before control `_setup` resolves → silent no-op
**What goes wrong:** Programmatic `.trigger()` from the chip does nothing; no dot, no fix, chip stuck pending.
**Why it happens:** Mapbox GeolocateControl sets its internal `_setup` flag asynchronously after `navigator.permissions.query` resolves; a synchronous `.trigger()` finds `_setup===false` and no-ops. **This exact gotcha is already documented in bee-map.ts:418-426** (the Phase 152 auto-trigger wraps `.trigger()` in a `.then()`).
**How to avoid:** When `<bee-atlas>` commands the control, the control should already be set up (map long since initialized by the time the user can tap a chip), so a direct call is usually fine — but mirror the Phase 152 robustness: expose a `<bee-map>` method that calls `.trigger()` and tolerates the not-yet-setup case, or check permission state first. Verify on a real device (the chip-tap path differs from the auto-trigger path).

### Pitfall 5: Coordinates leak into the URL
**What goes wrong:** `?near=1&...` accidentally carries lat/lon; privacy violation (D-07).
**Why it happens:** Adding coordinates to `FilterState`, which `buildParams` iterates.
**How to avoid:** `FilterState.nearMe` is a bare boolean; the center lives off-FilterState (Pattern 2). Wave-0 test: round-trip a `nearMe:true` filter through `buildParams`→`parseParams` and assert the param string contains `near=1` and **no** numeric coordinate fragments.

### Pitfall 6: SC-3's prescribed "JS haversine" vs measured pure-SQL reality
**What goes wrong:** Plan faithfully implements a JS post-filter because SC-3 says so, adding complexity and missing the table/list/CSV paths.
**Why it happens:** The roadmap success criterion was written before the empirical probe; it assumed MemoryVFS lacks trig.
**How to avoid:** See Open Questions Q1 — recommend pure-SQL; let the planner/operator confirm the SC-3 wording is superseded. The *intent* (in-worker, <200 ms) is fully met by pure-SQL.

## Code Examples

### Empirical verification: math functions + haversine in the worker's exact wasm
```
$ node (loading node_modules/wa-sqlite/dist/wa-sqlite.wasm + MemoryVFS, bytes supplied directly)
OK   version       => 3.44.0
OK   sin           => 0.8414709848078965
OK   cos           => 1
OK   radians       => 3.141592653589793
OK   pi            => 3.141592653589793
OK   acos          => 0
OK   sqrt          => 1.4142135623730951
OK   power         => 1024
OK   haversine_km  => 13.407240899587192   (two test WA points ~13 km apart)
```
`sqlite_compileoption_used('ENABLE_MATH_FUNCTIONS')` returns `0` (compile-option diagnostics omitted from this build), but the **functions themselves are registered and execute** — the functional probe is authoritative.

### Empirical performance against the real DB (public/data/occurrences.db, 97,648 rows)
```
total rows                          => 97648
rows with lat/lon                   => 97648   (100% geocoded)
lat range                           => 33.28 .. 49.14
lon range                           => -124.79 .. -111.14
near-me match (Seattle, 10km)       => 5106
pure-SQL bbox+haversine time        => 12.7 ms
pure-SQL full-scan haversine time   => 34.3 ms   (no bbox — still well under 200 ms)
```
Both under the 200 ms budget by an order of magnitude. The bbox pre-filter gives ~3× speedup essentially for free, so include it (it also satisfies SC-3's "bbox SQL pre-filter" wording).

### Bbox degree deltas at WA latitudes (longitude correction)
```
lat=45.5: dLat=0.0898°, dLon=0.1282°  (cos=0.7009)
lat=47.6: dLat=0.0898°, dLon=0.1332°  (cos=0.6743)
lat=49.0: dLat=0.0898°, dLon=0.1369°  (cos=0.6561)
```
`dLat = 10 / 111.32 ≈ 0.0898°` (constant); `dLon = 10 / (111.32 · cos(lat))`. The bbox is a coarse pre-filter only — the haversine enforces the true 10 km circle — so a plain (non-accuracy-widened) box is the simpler correct option (Claude's discretion in CONTEXT.md). Do **not** widen by `accuracy`: the bbox can be slightly generous without affecting correctness (haversine still cuts at 10 km), and widening adds complexity for no behavioral gain.

## State of the Art

| Old Approach (roadmap hypothesis) | Current Approach (measured) | When Changed | Impact |
|--------------|------------------|--------------|--------|
| MemoryVFS likely lacks trig → use JS haversine post-filter | wa-sqlite build has math extension → pure-SQL haversine | Verified 2026-06-20 this session | Single-file proximity logic, all query paths covered, 12.7 ms. |

**Not deprecated, but superseded:** SC-3's "JavaScript haversine post-filter" mechanism. The intent (in-worker, <200 ms) is met better by pure-SQL.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Worker-RPC serialization overhead (postMessage of ~5k filtered rows) keeps total under 200 ms in-browser, as the Node probe excludes it. | Performance | Low — the SQL is 12.7 ms; `queryVisibleGeoJSON` already serializes comparable filtered sets (e.g. a broad taxon filter) within budget today. Verify with the timing log SC-3 requires. |
| A2 | `<bee-map>` will expose a public method (or accept a prop edge) for `<bee-atlas>` to command `.trigger()`; the control instance is local to `firstUpdated` today (bee-map.ts:396). | Activation flow | Low — straightforward to lift `geolocate` to an instance field + add a `triggerGeolocate()` method, preserving pure-presenter (command in, no state stored). |

## Open Questions

1. **SC-3 wording: pure-SQL haversine vs the prescribed JS post-filter.**
   - What we know: The math extension is compiled in; pure-SQL haversine runs in 12.7 ms in the worker; it covers map + table + list + CSV in one place.
   - What's unclear: SC-3 literally says "JavaScript haversine post-filter in the worker." This was written assuming trig was unavailable.
   - Recommendation: **Implement pure-SQL** (bbox SQL pre-filter + SQL haversine, both in the worker). It satisfies SC-3's intent (in-worker proximity, bbox pre-filter, <200 ms) and is strictly simpler. The planner should note the SC-3 mechanism is superseded by measurement, and the verification step should assert the timing-log <200 ms result rather than the implementation language.

2. **Where `<bee-atlas>` reaches the GeolocateControl to `.trigger()` it.**
   - What we know: The control is constructed locally in `bee-map.ts:firstUpdated`; `<bee-atlas>` has no element ref pattern (no `@query`/`querySelector` in bee-atlas.ts).
   - What's unclear: Method-on-bee-map vs. a reactive `triggerGeolocate` counter prop.
   - Recommendation: Add a public `triggerGeolocate()` method on `<bee-map>` (lifts `geolocate` to an instance field) and call it from `<bee-atlas>` via a `@query('bee-map')` ref or an existing element handle. A method keeps the imperative "do this now" semantics clean and preserves pure-presenter (no upward state).

3. **Does the near-me chip ride the existing `filter-changed` event or a dedicated `near-me-changed`?**
   - What we know: `_emitFilter` (bee-pane.ts:569) builds `FilterChangedEvent` from bee-pane's local `@state` mirrors; `FilterChangedEvent` (filter.ts:370) has no `nearMe`. The chip is standalone (D-06), not part of the Who/Where/When inputs bee-pane mirrors.
   - Recommendation: A **dedicated `near-me-changed` (boolean) event** is cleaner than threading `nearMe` through the whole `_emitFilter` mirror machinery — the chip's activation is conceptually distinct (it triggers geolocation, not just a SQL clause). `<bee-atlas>._onNearMeToggle` then mutates `_filterState.nearMe` and runs the activation flow. Adding `nearMe` to `FilterChangedEvent` + the bee-pane mirror is also viable but pulls geolocation-triggering side effects into the generic filter path. Planner's call; dedicated event recommended.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| wa-sqlite math extension (trig) | Pure-SQL haversine (NEAR-02) | ✓ | SQLite 3.44.0, verified `sin(1.0)` | JS haversine post-filter (if ever rebuilt without it) |
| `public/data/occurrences.db` | Performance verification | ✓ | 97,648 rows, 100% geocoded | — |
| GeolocateControl + `_userLocation` | Position source (D-03) | ✓ | Phase 152 (Complete) | — |
| `_locationError` denial toast | Failure UX (D-02) | ✓ | Phase 152 (Complete) | — |

**Missing dependencies with no fallback:** None.
**Missing dependencies with fallback:** None needed — the primary path (pure-SQL) is available.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest |
| Config file | `vite.config.ts` / project default (existing `src/tests/*.test.ts`) |
| Quick run command | `npm test -- filter url-state` |
| Full suite command | `npm test` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| NEAR-01 | `nearMe:true` makes `isFilterActive` true | unit | `npm test -- filter` | ✅ extend src/tests/filter.test.ts |
| NEAR-01 | `buildFilterSQL(f, center)` emits bbox + haversine clauses AND-joined | unit | `npm test -- filter` | ✅ extend filter.test.ts |
| NEAR-01 | `buildFilterSQL(f, null)` omits proximity clause even when `nearMe:true` | unit | `npm test -- filter` | ✅ extend filter.test.ts |
| NEAR-02 | haversine SQL returns correct in-radius count on a known fixture (or computed expected) | unit | `npm test -- filter` | ✅ (string-shape assert; runtime <200 ms verified via in-app timing log) |
| NEAR-03 | `nearMe:true` round-trips as `near=1`; coords absent from params | unit | `npm test -- url-state` | ✅ extend src/tests/url-state.test.ts |
| NEAR-03 | `parseParams('?near=1')` yields `filter.nearMe === true` | unit | `npm test -- url-state` | ✅ extend url-state.test.ts |
| NEAR-01/02/03 | Activation flow: tap → trigger → defer → query once; freeze on subsequent fixes | component/manual | UAT (UI hint: yes) | ⚠️ manual — see Wave 0 |

### Sampling Rate
- **Per task commit:** `npm test -- filter url-state`
- **Per wave merge:** `npm test` (full suite)
- **Phase gate:** Full suite green + manual UAT (UI hint: yes — phase must not auto-advance past UAT per project memory `feedback_uat_ui_phases`).

### Wave 0 Gaps
- [ ] Extend `src/tests/filter.test.ts` — `nearMe` in `isFilterActive`; `buildFilterSQL` proximity clause shape (bbox + haversine, present only with non-null center); null-center omission.
- [ ] Extend `src/tests/url-state.test.ts` — `near=1` round-trip; coords-never-serialized assertion; `parseParams` `near` → `nearMe`.
- [ ] (Optional) extend `src/tests/geolocation.test.ts` — activation/deferral/freeze handler logic if unit-testable without a live control; otherwise covered by manual UAT.
- [ ] Manual UAT checklist (real device, like Phase 152's `152-HUMAN-UAT.md`) — chip pending→active, frozen set on walk, denial toast reuse, `?near=1` restore, "Clear filters".

*Existing `filter.test.ts` and `url-state.test.ts` already follow the exact `buildFilterSQL`/`buildParams`→`parseParams` assertion patterns — extension is low-risk.*

## Security Domain

> `security_enforcement` not explicitly disabled — included.

### Applicable ASVS Categories
| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V5 Input Validation | yes | `lat`/`lon` come from `GeolocationCoordinates` (browser-validated numbers); Phase 152 already validates `isFinite(accuracy) && accuracy >= 0` (bee-atlas.ts:996). Apply the same `isFinite` guard to lat/lon before interpolating into SQL. |
| V6 Cryptography | no | — |
| V2 Auth / V3 Session / V4 Access Control | no | Static client-only app; no auth surface. |

### Known Threat Patterns for {wa-sqlite string-interpolated SQL}
| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| SQL injection via lat/lon | Tampering | lat/lon are JS numbers from `GeolocationCoordinates`, never strings; interpolated as bare numerics like the existing `yearFrom`/`elevMin` clauses (no user-typed strings reach this clause). Guard with `isFinite()` before building SQL to reject `NaN`/`Infinity` that would produce malformed SQL. |
| Location privacy leak | Information Disclosure | D-07 + Pattern 2: coordinates never serialized to URL/history; only the boolean `near=1` persists. Wave-0 test asserts no coordinate fragment in `buildParams` output. |

## Sources

### Primary (HIGH confidence)
- **Empirical probe** (this session) — `node` loading the worker's exact `wa-sqlite.wasm` (1.0.0, SQLite 3.44.0) + `MemoryVFS`, supplying wasm/db bytes directly: `SELECT sin(1.0)` → `0.841…`; full haversine over `public/data/occurrences.db` (97,648 rows) → 12.7 ms bbox+haversine / 34.3 ms full-scan.
- **Codebase reads** — `src/filter.ts`, `src/url-state.ts`, `src/stale-guard.ts`, `src/sqlite-worker.ts`, `src/sqlite.ts`, `src/bee-atlas.ts`, `src/bee-pane.ts`, `src/bee-map.ts`, `src/style.ts`, `src/tests/filter.test.ts`, `src/tests/url-state.test.ts`.
- **CONTEXT.md** (153 + 152), **REQUIREMENTS.md**, **ROADMAP.md** Phase 153 entry.
- **CLAUDE.md** — Architecture Invariants (state-owner/pure-presenter, style-cache bypass, `_filterQueryGeneration` race guard).

### Secondary (MEDIUM confidence)
- SQLite math-function semantics (haversine via `asin/sqrt/radians/sin/cos`) — standard; cross-checked by the functional probe.

### Tertiary (LOW confidence)
- None — all load-bearing claims verified empirically against the actual artifacts.

## Project Constraints (from CLAUDE.md)
- **State ownership:** `<bee-atlas>` owns all reactive state; `<bee-map>`/`<bee-sidebar>` are pure presenters. → `nearMe`, `_nearMePending`, `_nearMeCenter` live on `<bee-atlas>`; commanding `.trigger()` must not store state in `<bee-map>`.
- **Style cache bypass when `filterState` active:** `nearMe` makes the filter active → ensure the new boolean participates in whatever check gates cache bypass (it flows through `isFilterActive`, which is the active-filter signal).
- **Filter race guard:** `_filterQueryGeneration` / `makeStaleGuard` — the deferred near-me query must go through the existing `_filterGuard` so a re-tap or filter change discards a stale in-flight result.
- **ID format:** `ecdysis:<int>` / `inat:<int>` — unaffected; near-me filters by geometry, not ID.
- **Static hosting only / no server runtime:** satisfied — all client-side.
- **Run `npm test` before push; UI-hint phases don't auto-advance past UAT.**

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — no new packages; existing stack inspected.
- Haversine approach: HIGH — empirically verified against the worker's exact wasm + real DB.
- Performance: HIGH — measured 12.7 ms; only A1 (worker-RPC serialization) unverified, low risk.
- Architecture/integration: HIGH — all touchpoints read and confirmed at the cited line numbers.
- Activation flow / event shape: MEDIUM — two viable designs (Q2, Q3); recommendations given, planner's call.

**Research date:** 2026-06-20
**Valid until:** 2026-07-20 (stable; only risk is a wa-sqlite rebuild dropping the math extension — re-run `SELECT sin(1.0)` if the dependency is bumped).
