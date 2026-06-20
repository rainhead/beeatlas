# Phase 152: GeolocateControl + Location State - Context

**Gathered:** 2026-06-20
**Status:** Ready for planning

<domain>
## Phase Boundary

Add a Mapbox `GeolocateControl` to the `/app` map: blue dot + accuracy ring + recenter button, working offline via GPS. Location is owned by `<bee-atlas>` as `@state _userLocation`; `<bee-map>` hosts the control and relays position upward via a `composed` CustomEvent (state-owner/pure-presenter invariant). Denied or unavailable permission degrades gracefully without affecting the rest of the app.

**In scope:** LOC-01 (control + config + offline GPS), LOC-02 (state ownership + relay), LOC-03 (graceful denial).
**Out of scope:** "Near me" filtering and any consumption of `_userLocation` (Phase 153); position-stream throttling (Phase 153, where it has a real cost); additional map controls.

</domain>

<decisions>
## Implementation Decisions

### Control configuration (locked by LOC-01)
- **D-01:** `GeolocateControl` configured with `trackUserLocation: true`, `positionOptions: { enableHighAccuracy: true }`, `showAccuracyCircle: true`. Blue dot + accuracy ring + recenter are the control's native rendering — they do NOT depend on `_userLocation` being lifted to `<bee-atlas>`.
- **D-02:** Control placement is **top-right** (Mapbox default). Only `attributionControl: true` exists today (`bee-map.ts:388`); no other controls present.

### Activation timing
- **D-03:** Auto-activate **only if permission is already granted**. On map load, check the Permissions API (`navigator.permissions.query({ name: 'geolocation' })`); if `state === 'granted'`, programmatically `.trigger()` the control so returning users get an instant dot with no prompt. If `prompt`/`denied`, do nothing — the OS permission prompt fires only when the user taps the control. Rationale: no unsolicited cold permission prompt on first `/app` visit, instant location on return visits.

### Denied / unavailable UX (LOC-03)
- **D-04:** The "brief explanation" surfaces as an **app-level toast/banner** (consistent with existing app-level affordances like the offline/cache UI in `<bee-atlas>`), explaining location is blocked and how to re-enable. Triggered off the control's `error` event relayed upward. The native disabled control state remains as the in-map affordance; the toast adds discoverability. The rest of the app (map, filters, table) is unaffected.

### Location state cadence
- **D-05:** `_userLocation` updates on **every GPS fix** (relay each `geolocate` event). No throttling in this phase. This is safe because DB queries are decoupled from Lit's reactive render cycle — `_runFilterQuery()` is only ever called explicitly from mutation handlers (`bee-atlas.ts:431, 652, 1019, 1107, 1131, 1170, 1220, 1340, 1371`), never from `updated()`/`willUpdate()` (bee-atlas has no such hook). So a `_userLocation` update costs at most a redundant `bee-atlas.render()` + lit-html diff (no DOM churn, no SQLite-worker traffic). Throttling/debounce is deferred to **Phase 153**, where "near me" will wire a handler that re-queries on position change — that is where the cost becomes real.

### Relay mechanism (locked by LOC-02)
- **D-06:** `<bee-map>` emits, never stores. Reuse the existing `_emit()` helper (`bee-map.ts:164`, already `composed: true, bubbles: true`) to dispatch `user-location-changed`; bind `@user-location-changed=${this._onUserLocationChanged}` on `<bee-map>` in `bee-atlas.render()` (alongside the existing `@view-moved`, `@map-click-*`, etc. bindings at `bee-atlas.ts:312-320`). The CustomEvent detail carries the position (lat/lon/accuracy). A source-analysis test must assert `<bee-map>` emits (does not store) the location (Success Criterion 3).

### Claude's Discretion
- Exact `_userLocation` shape (e.g. `{ lat, lon, accuracy }` vs richer) — pick the minimal shape that satisfies the relay test and anticipates Phase 153's haversine needs.
- Toast/banner copy and exact reuse vs. new component for the denial message.
- Whether the `error`-event → toast path also covers position-unavailable (no GPS) vs. permission-denied with distinct copy.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Requirements & roadmap
- `.planning/REQUIREMENTS.md` §LOC-01/02/03 — the three locked requirements for this phase.
- `.planning/ROADMAP.md` (Phase 152 entry, ~line 1251) — goal, success criteria, and the **research flag**: iOS standalone-mode geolocation permission behavior differs from a Safari tab and must be verified on a real device at execution time (not simulable).

### Architecture invariants
- `/Users/rainhead/dev/beeatlas/CLAUDE.md` §"Architecture Invariants" — state-owner/pure-presenter rule (`<bee-atlas>` owns reactive state; `<bee-map>` is a pure presenter receiving props + emitting events). LOC-02 is a direct restatement of this.

### Code touchpoints
- `src/bee-map.ts:380` (`firstUpdated`/map init) — where `new mapboxgl.Map(...)` + `attributionControl` live; GeolocateControl is added here.
- `src/bee-map.ts:164` (`_emit`) — the composed-event helper to reuse for `user-location-changed`.
- `src/bee-atlas.ts:301-321` (`<bee-map>` binding block) — where the new `@user-location-changed` listener and (if needed) any prop pass-down attach.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `_emit<T>(name, detail)` (`bee-map.ts:164`): already dispatches `bubbles: true, composed: true` CustomEvents — directly satisfies LOC-02's relay requirement.
- App-level UX affordances in `<bee-atlas>` (offline/cache/update banners — see `_offline`, `_cacheState`, `_updateAvailable` state at `bee-atlas.ts:110-117`): a pattern to follow for the denial toast/banner (D-04).
- `@state` + property-passthrough pattern: every reactive field on `<bee-atlas>` flows to children via `.prop=${...}` bindings; `_userLocation` follows the same pattern.

### Established Patterns
- DB queries are **decoupled from the render cycle** — only `_runFilterQuery()` hits the SQLite worker, and only from explicit handlers. New reactive state does not incur query cost (basis for D-05).
- `<bee-map>` receives all state as input-only `@property`/passed props and emits events upward — no upward mutation. New location flow must preserve this.
- Map source/layer setup waits on `this._map.on('load', ...)` (online only); the data load is decoupled from the basemap (Phase 151 offline fix). GeolocateControl is a control, not a style layer — it can be added at map construction and works without the style loading (relevant to offline GPS, LOC-01).

### Integration Points
- New `@state _userLocation` on `<bee-atlas>`; new `@user-location-changed` binding on `<bee-map>` in `bee-atlas.render()`.
- `GeolocateControl` instance added in `bee-map.ts` `firstUpdated`, wired to `geolocate`/`error`/`trackuserlocationstart`/`trackuserlocationend` events that call `_emit('user-location-changed', ...)`.
- Permissions API check for the granted-only auto-trigger (D-03).

</code_context>

<specifics>
## Specific Ideas

- v5.0 is "Offline Field Mode" — the consumer is a volunteer collector in the field. This framed activation (no aggressive cold prompt) and offline-GPS importance.
- Phase 153 ("Near me") is the known downstream consumer of `_userLocation`; cadence and shape decisions anticipate it but the feature is explicitly out of scope here.

</specifics>

<deferred>
## Deferred Ideas

- **NavigationControl (zoom +/- + compass):** considered as a touch-field-app convenience; declined to keep this phase scoped to the LOC requirements. Candidate for a future map-UX polish phase if explicit zoom buttons prove wanted on touch.
- **Position-stream throttling/debounce:** belongs in Phase 153 where position changes trigger DB re-queries; no value in Phase 152.

</deferred>

---

*Phase: 152-geolocatecontrol-location-state*
*Context gathered: 2026-06-20*
