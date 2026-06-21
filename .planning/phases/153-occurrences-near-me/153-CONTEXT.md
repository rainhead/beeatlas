# Phase 153: Occurrences Near Me - Context

**Gathered:** 2026-06-20
**Status:** Ready for planning

<domain>
## Phase Boundary

A standalone "Near me" chip filters occurrences to those within a fixed **10 km** radius of the user's GPS position. The filter AND-composes with all existing taxon/date/region/selection filters and applies to the map and the list/table view. The proximity query runs as a **bbox SQL pre-filter + haversine distance check** and fires only **after a GPS fix** (barrier analogous to `taxaReady` / the `_filterQueryGeneration` stale-guard). State round-trips in the URL as a boolean `?near=1` (coordinates are ephemeral); "Clear filters" removes the chip and the param.

**In scope:** NEAR-01 (10 km chip + AND-composition), NEAR-02 (bbox + haversine, GPS-fix barrier, <200 ms), NEAR-03 (`?near=1` round-trip, restore re-activates geolocation and defers query, clearable).
**Out of scope:** configurable/surfaced radius (fixed 10 km is locked); a separate distance-sort or "nearest N" ranking; basemap tile caching (Phase 154); live-following the moving user (explicitly declined — see D-04).

</domain>

<decisions>
## Implementation Decisions

### Pending / failure UX (NEAR-02, NEAR-03)
- **D-01:** Tapping "Near me" puts the chip into an **active/pending state immediately**; the map/list holds (no result change) until the first GPS fix arrives, then filters. This is the GPS-fix barrier in user-visible form.
- **D-02:** On **denied or unavailable** location, **reuse the Phase 152 toast/banner** (`_locationError` / `_locationErrorKind: 'denied' | 'unavailable'`, D-04 of Phase 152) and leave the chip inactive (do not strand it in a permanently-pending state). The rest of the app is unaffected.

### Activation ↔ GeolocateControl coupling (NEAR-01)
- **D-03:** Tapping "Near me" **also activates the map's `GeolocateControl`** (programmatically `.trigger()` it) so the blue dot + accuracy ring appear and recenter — one tap gives both the filter and the visual "this is where you are" anchor. Near-me consumes the `_userLocation` the control relays upward (the control is the single source of the position; near-me does not open its own `getCurrentPosition`).

### Position capture: freeze, not follow (NEAR-02)
- **D-04:** The filtered set is **frozen at the position captured when the chip is activated**. The blue dot keeps tracking and may drift, but the near-me set does **not** re-query on every GPS fix. This sidesteps the throttle/debounce concern deferred from Phase 152 (D-05) — with a frozen snapshot there is no per-fix re-query cost, so no throttling is needed in this phase.
- **D-05:** **Refresh = re-tap the chip.** Toggling near-me off then on re-captures the current GPS position. No dedicated refresh affordance, no coupling to the recenter button for re-capture. (Re-tap is the intended, sufficient mechanism for a field tool.)

### Chip UI (NEAR-01)
- **D-06:** "Near me" is a **standalone chip on its own line** in the filter summary — a distinct location-relative filter, **not** grouped under the Where/region section with county/ecoregion/place chips. It renders as a removable chip when active (✕ removes it, same removable-chip affordance as other filters). Suggested read: `Near me · 10 km`.

### URL round-trip (NEAR-03)
- **D-07:** Add `nearMe: boolean` to `FilterState`; serialize as `?near=1` only when active (parse `near=1` → true). On restore from `?near=1`, **re-activate geolocation (trigger the control) and defer the query until a fix arrives** — same pending-then-filter flow as a fresh tap. Coordinates are never persisted. "Clear filters" sets `nearMe=false` and drops `near` from the URL, like every other filter.

### Empty result state
- **D-08:** When zero occurrences fall within 10 km, **reuse the existing empty state** (whatever the map/list/table already shows when a filter matches nothing). No near-me-specific copy.

### Claude's Discretion
- The exact `FilterState` field name (`nearMe` suggested) and the chip's exact label/spacing.
- Whether the bbox pre-filter widens by the GPS `accuracy` value or uses a plain 10 km box (lat/lon degree deltas). The bbox is only a coarse pre-filter; the haversine post-filter enforces the true 10 km — pick the simpler correct option.
- Whether the haversine runs as pure SQL (if MemoryVFS exposes trig — see research flag) or as a JS post-filter over returned rows in `queryVisibleGeoJSON`. This is the phase's named research item, not a user decision.
- The precise mechanics of the pending→active chip styling.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Requirements & roadmap
- `.planning/REQUIREMENTS.md` §NEAR-01/NEAR-02/NEAR-03 — the three locked requirements for this phase.
- `.planning/ROADMAP.md` (Phase 153 entry, ~line 1271) — goal, success criteria, and the **research flag**: run `SELECT sin(1.0)` in the wa-sqlite worker to verify whether MemoryVFS exposes trig functions before choosing pure-SQL vs JS haversine.

### Prior-phase context (the location substrate this phase consumes)
- `.planning/phases/152-geolocatecontrol-location-state/152-CONTEXT.md` — defines `_userLocation: { lat, lon, accuracy }` (shape chosen to anticipate this haversine work), the relay event, the granted-only auto-trigger, and the denial toast (D-04) that D-02 above reuses.

### Architecture invariants
- `/Users/rainhead/dev/beeatlas/CLAUDE.md` §"Architecture Invariants" — state-owner/pure-presenter rule, the **style-cache bypass** rule (cache must be bypassed when `filterState` is active — near-me is a new active-filter source), and the **filter race guard** (`_filterQueryGeneration` / `makeStaleGuard`) that the GPS-fix-deferred query must respect.

### Code touchpoints (from codebase scout)
- `src/filter.ts:13-25` (`FilterState`), `:251-324` (`buildFilterSQL` AND-composition — add bbox clause), `:326-355` (`queryVisibleGeoJSON` — where the haversine post-filter goes; `lat`/`lon` columns available).
- `src/bee-atlas.ts:121-126` (`_userLocation` / `_locationError` state), `:167` (`userLocation` getter), `:591-597` (`_runFilterQuery` + `_filterGuard`), `:986-1000` (`_onUserLocationChanged` — currently does NOT re-query; D-04 keeps it that way), `:1274-1313` (`_onFilterChanged`).
- `src/url-state.ts:60-114` (`buildParams` — serialize `near=1`), `:116-278` (`parseParams` — parse `near`).
- `src/bee-pane.ts:926-1062` (chip render patterns), `:303-325` (`.chip` / `.chip-remove` CSS) — note D-06 wants a standalone chip, NOT inside `_renderWhere`.
- `src/bee-map.ts:406-427` (geolocate event + auto-trigger) — the `.trigger()` path D-03/D-07 reuse.
- `src/stale-guard.ts` — the `makeStaleGuard` race guard.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- **Phase 152 location substrate:** `_userLocation` ({lat, lon, accuracy}), the `user-location-changed` relay, and the granted-only `.trigger()` path — near-me consumes these directly rather than opening its own geolocation.
- **Denial toast/banner** (`_locationError` / `_locationErrorKind`) — reused verbatim for D-02; no new failure UI.
- **Removable-chip pattern** (`bee-pane.ts` chips + `.chip`/`.chip-remove` CSS) — the near-me chip follows the same remove/emit-`filter-changed` mechanics, just rendered standalone (D-06).
- **`makeStaleGuard` / `_filterGuard`** — already discards stale async query results; the GPS-fix-deferred near-me query slots into the same guarded `_runFilterQuery()` path.

### Established Patterns
- Filters AND-compose by joining WHERE clauses in `buildFilterSQL` (`' AND '`); a bbox clause is one more pushed clause — composition is automatic.
- `queryVisibleGeoJSON` materializes rows then builds GeoJSON; the haversine post-filter (if JS) inserts between materialization and feature push.
- DB queries are decoupled from Lit's render cycle — only explicit handlers call `_runFilterQuery()`. Freeze-at-activation (D-04) means location updates still do NOT trigger re-query (preserves Phase 152's D-05 stance).
- **Style-cache bypass:** near-me active = `filterState` active → the mapbox-gl style cache must be bypassed (Architecture Invariant); confirm the new boolean participates in that check.

### Integration Points
- `nearMe: boolean` added to `FilterState` (filter.ts) → serialized/parsed in url-state.ts → bbox clause in `buildFilterSQL` → haversine in `queryVisibleGeoJSON` → standalone chip in bee-pane → activation handler in bee-atlas that `.trigger()`s the control (via bee-map) and fires the deferred guarded query once `_userLocation` is non-null.

</code_context>

<specifics>
## Specific Ideas

- Consumer framing (carried from Phase 152): v5.0 "Offline Field Mode" — a volunteer collector standing in a field asking "what's been found right here?" This drove freeze-at-activation (you snapshot where you're collecting, not a continuously-shifting set) and the single-tap filter+blue-dot coupling.
- The "freeze + still-tracking dot" tension was raised and resolved deliberately: the dot is a live visual anchor; the filtered set is a deliberate snapshot you refresh by re-tapping.

</specifics>

<deferred>
## Deferred Ideas

- **Live-following near-me (re-query per GPS fix, throttled):** considered and explicitly declined in favor of freeze-at-activation (D-04). If field use shows collectors want a continuously-updating set, a future phase could add it with the throttle/debounce that Phase 152 D-05 anticipated.
- **Configurable/surfaced radius:** 10 km is fixed by requirements; a user-adjustable radius is a separate future capability.
- **Distance sort / "nearest N" ranking:** near-me is a binary within-radius filter, not a ranking; ordering by distance is out of scope.
- **Recenter-button-as-refresh coupling:** declined (D-05) in favor of re-tap; revisit only if re-tap proves non-obvious in the field.

</deferred>

---

*Phase: 153-occurrences-near-me*
*Context gathered: 2026-06-20*
