# Phase 153: Occurrences Near Me - Context (REVISED)

**Gathered:** 2026-06-20
**Revised:** 2026-06-21 — redesigned to reuse the existing shift-drag `selectionBounds` mechanism after UAT feedback. Supersedes the original haversine-circle / `?near=1` design (reverted in commit a4e269cb).
**Status:** Ready for planning

<domain>
## Phase Boundary

"Near me" is a one-tap convenience that resolves the user's GPS position into a **~10 km bounding box** and applies it as a **selection-bounds filter** — reusing the rectangle-selection mechanism that already exists end-to-end for shift-drag (`_selectionBounds` → `filter.ts` `boundsClause` → `SelectionState{type:'bounds'}` URL round-trip → restore). The trigger is a **geolocate-icon button inside the existing "County, ecoregion, or place" input**; the resolved bounds appear in that input as a removable chip (the existing county/ecoregion/place chip pattern). Because the bounds are explicit and already round-trip in the URL, a **shared link reproduces the exact same occurrences for any recipient — no GPS required**.

**In scope:** NEAR-01 (geolocate button in the where input → ~10 km bbox → selection-bounds filter, AND-composing), NEAR-02 (reuse the existing bbox `boundsClause` query path — no new proximity query), NEAR-03 (bounds round-trip in the URL via the existing selection serialization; shareable/reproducible; Phase 152 toast on denial).
**Out of scope:** surfacing the shift-drag rectangle *gesture* in the UI (backlog 999.1 — its URL round-trip already exists); a haversine circle; a configurable radius; a distance sort.

</domain>

<decisions>
## Implementation Decisions

### Reuse, not reinvent (NEAR-01/02/03)
- **D-01:** Near-me sets `_selectionBounds` — the SAME state shift-drag rectangle selection produces (`bee-atlas.ts:103`). It reuses the existing query `boundsClause` (`filter.ts:454`) and the existing `SelectionState{type:'bounds'}` URL serialization (`url-state.ts:83`) **as-is**. NO haversine, NO `nearMeCenter` threading, NO `?near=1` boolean, NO separate query function. This is the core of the redesign — near-me is a thin producer of a bounds selection.

### Box, not circle (NEAR-01)
- **D-02:** "Near me" computes a **bounding box of ±10 km around the user's position** (≈20 km square): `dLat = 10/111.32`, `dLon = 10/(111.32·cos(lat))`, box = `{west: lon−dLon, east: lon+dLon, south: lat−dLat, north: lat+dLat}`. The haversine circle is dropped. The ±10 km is a fixed default (tunable later); "within 10 km in any cardinal direction."

### Shareable URL — intentionally reverses old privacy stance (NEAR-03)
- **D-03:** The bounds round-trip in the URL via the **existing** selection-bounds param (`west,south,east,north`). A shared link reproduces the **identical** occurrence set; a recipient needs no GPS and no geolocation re-trigger on restore (the bounds are explicit, applied directly). This **deliberately reverses** the original D-07/NEAR-03 (coords-ephemeral, boolean `?near=1`, location-privacy threat model): a coarse ~20 km box around the user is in the shareable URL **by design**, because shareability/reproducibility is the goal. No `?near=1`, no coords-deferral machinery.

### UI — geolocate button inside the "County, ecoregion, or place" input (NEAR-01)
- **D-04:** Replace the standalone chip with a **button**, right-aligned within/over the "County, ecoregion, or place" input (`_renderWhere`, `bee-pane.ts:1049` `.input-wrap`). The button **reuses the geolocate icon** (the crosshair used by `mapboxgl-ctrl-geolocate` / the Phase 152 `GeolocateControl`). Do NOT invent a new standalone affordance — fold it into this existing input. (See [[feedback_no_unrequested_ui_patterns]].)
- **D-05:** When near-me resolves, the active bounds render **in that input** as a removable chip in the existing `.chips` row of the where input-group (`bee-pane.ts:1024-1048`) — the same pattern county/ecoregion/place chips use, removable via ✕ (clears `_selectionBounds`). **The chip displays the geolocate crosshair icon** (the same icon reused for the trigger button), tying the two together visually — not a text label. ("Near me" text is the fallback only if the icon can't be reused.) User-confirmed 2026-06-21.

### Activation, freeze, denial
- **D-06:** Tapping the button triggers the Phase 152 `GeolocateControl` so the blue dot + accuracy ring appear (the control remains the single source of position); near-me consumes the relayed `_userLocation`. Keep the 152 granted-auto path.
- **D-07:** Freeze falls out for free — the bounds are an explicit snapshot, not a live query; the moving dot does not re-filter. Re-tap re-captures (recompute the box from the current position).
- **D-08:** On denied/unavailable location, surface the **existing Phase 152 toast** (`_locationError`/`_locationErrorKind`) and leave the button inactive / no bounds applied. **Fix the toast so it actually fires** (it failed in UAT). (User-selected.)

### AND-composition
- **D-09:** The bounds filter AND-composes with taxon/date/region filters exactly as shift-drag bounds already do (`boundsClause` is ANDed in the query). No new composition logic.

### Claude's Discretion
- Exact button placement/styling within the input (trailing-icon position), and how the geolocate crosshair icon is shared between the map control and the where-input button (extract to a shared SVG vs replicate).
- Whether the active bounds chip and a shift-drag-produced bounds chip render identically (they are the same `_selectionBounds`).

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Requirements & roadmap
- `.planning/REQUIREMENTS.md` §NEAR-01/02/03 (revised 2026-06-21 to the bounds-reuse design).
- `.planning/ROADMAP.md` (Phase 153 entry) — note SC-3's haversine wording is now obsolete; near-me reuses the existing bbox bounds path.

### The existing bounds mechanism this phase reuses (READ FIRST)
- `src/filter.ts:436-463` — `selectionBounds` parameter + `boundsClause` in the query (the filter near-me feeds).
- `src/url-state.ts:30, 63, 79-86` — `SelectionState{type:'bounds'}` serialize; the bounds URL round-trip already exists.
- `src/bee-atlas.ts:103` (`_selectionBounds` state), `:536, :884-913, :1169-1181` (selection restore/clear/query wiring), `:1240` (`_onRegionClick` shift-key path).
- `src/bee-map.ts:220-303` — shift-drag rectangle gesture (SEL-01/02) emitting `selection-drawn` with bounds (the analog producer near-me mirrors).
- `src/bee-pane.ts:1013-1066` (`_renderWhere`) — the "County, ecoregion, or place" input + its `.chips` row (`:1024-1048`) + `.input-wrap` (`:1049`) where the button goes; `.chip`/`.chip-remove` CSS at `:303-325`.

### Location substrate (Phase 152)
- `src/bee-map.ts:404-437` — the `GeolocateControl` instance + crosshair icon (to reuse) + granted-auto path.
- `.planning/phases/152-geolocatecontrol-location-state/152-CONTEXT.md` — `_userLocation` shape + the denial toast (`_locationError`/`_locationErrorKind`) D-08 reuses.

### Architecture invariants
- `/Users/rainhead/dev/beeatlas/CLAUDE.md` §"Architecture Invariants" — state-owner/pure-presenter, style-cache bypass when a filter/selection is active, `_filterQueryGeneration` race guard.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets (this phase is mostly reuse)
- **`selectionBounds` end-to-end**: query `boundsClause` (filter.ts), `_selectionBounds` state (bee-atlas), `SelectionState{type:'bounds'}` URL round-trip (url-state) — all already exist and are tested. Near-me only needs to PRODUCE a bounds object and feed it in.
- **GeolocateControl + crosshair icon** (Phase 152, bee-map.ts:404) — reused for both the blue dot and the where-input button's icon.
- **Where input-group chip pattern** (bee-pane.ts:1024-1048) — the active bounds chip reuses it; no new chip pattern.
- **Phase 152 denial toast** (`_locationError`/`_locationErrorKind`) — reused for D-08.

### Established Patterns
- Selection bounds AND-compose into the query via `boundsClause`; near-me inherits that automatically.
- `<bee-map>` is a pure presenter; the where-input button lives in `<bee-pane>` and emits upward to `<bee-atlas>`, which owns `_selectionBounds` and triggers the control (state-owner invariant).

### Integration Points
- New: a geolocate button in `bee-pane._renderWhere` emitting an event to `<bee-atlas>`; a `<bee-atlas>` handler that triggers the GeolocateControl, and on the resulting `_userLocation` computes the ±10 km box and sets `_selectionBounds` (then the existing query + URL paths fire). Denial → existing toast.

</code_context>

<specifics>
## Specific Ideas

- The unifying insight (user): near-me and shift-drag rectangle selection are the **same mechanism** — both produce a bounds selection that round-trips in the URL. Near-me is just a geolocated default box. The shift-drag bounds URL round-trip already exists; surfacing its *gesture* in the UI is backlog 999.1 and stays out of scope.
- Sharing semantics drove the reversal of the privacy model: a sent link must show the recipient the **sender's** occurrences, which requires explicit bounds in the URL — not a boolean that re-geolocates the recipient.
- UI lesson captured: do not introduce a new UI pattern (the standalone chip) without asking — fold into the existing input. [[feedback_no_unrequested_ui_patterns]]

</specifics>

<deferred>
## Deferred Ideas

- **Surfacing the shift-drag rectangle gesture in the UI** — backlog 999.1; the bounds URL round-trip already exists, so this is a discoverability/affordance task, separate from near-me.
- **Configurable box size / radius** — ±10 km is a fixed default.
- **Distance sort / nearest-N** — out of scope.
- **Superseded (reverted in a4e269cb):** the pure-SQL haversine circle, `?near=1` boolean, `nearMeCenter` threading, the coords-ephemeral privacy model, and the `<200 ms` timing log (the existing bbox query is already fast; no separate measurement surface needed).

</deferred>

---

*Phase: 153-occurrences-near-me (REVISED — bounds-reuse design)*
*Context revised: 2026-06-21*
