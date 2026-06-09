# Phase 146: debounce URL updates when zooming and panning the map - Context

**Gathered:** 2026-06-09
**Status:** Ready for planning

<domain>
## Phase Boundary

Reduce the number of **browser history entries** created by map pan/zoom so the
back button isn't polluted by deliberate map exploration.

**Reframed from the original backlog goal (999.1).** Discussion + code scout
established that the goal as literally written ("debounce URL updates … rather
than on every frame") is *already implemented*: `_pushUrlStateDebounced()`
(`src/bee-atlas.ts:665-677`) already writes the live URL via `replaceState` on
each settled gesture and only commits a history entry via a 500 ms-debounced
`pushState`. URL writes never happen per-frame — Mapbox `moveend` fires once per
settled gesture.

The real, confirmed problem: **viewport `pushState` is the only `pushState` in
the whole app.** Every other URL write (initial load + all filter, selection,
and UI changes — ~18 `_replaceUrlState()` call sites) uses `replaceState` and
creates no history entry. So the back button navigates *only* between viewport
resting positions, and every deliberate pan/zoom more than 500 ms apart adds one
entry. That is the "too many history entries" churn this phase fixes.

**This phase changes only the viewport→history write logic in `<bee-atlas>`
(plus tests).** No new capability, no change to what's stored in the URL, no
change to filter/selection/UI write behavior.

</domain>

<decisions>
## Implementation Decisions

### History-entry model
- **D-01:** Replace the current "one `pushState` per settled gesture" behavior
  with **session-coalesced** history: a whole pan/zoom exploration session
  produces **exactly one** history entry, regardless of how many gestures it
  contains. (User explicitly chose this over: eliminating viewport history
  entirely, lengthening the debounce, or a movement-threshold gate.)
- **D-02:** Mechanism — track a "viewport session active" flag on `<bee-atlas>`.
  On a viewport move (`_onViewMoved` → settled `moveend`):
  - if **no** session is active → `pushState` (one new entry) and mark the
    session active;
  - if a session **is** active → `replaceState` onto that same entry (keeps the
    URL live without adding entries).
- **D-03:** A viewport session **resets** (next viewport move starts a fresh
  entry) whenever a **non-viewport state change** occurs — i.e. any of the
  existing `_replaceUrlState()` callers for filter changes, selections, boundary
  mode, pane state, and source toggles. Those non-viewport writes keep using
  `replaceState` exactly as today (they still create no entry of their own);
  they only flip the session flag off so the next exploration is delimited.

### Net effect
- **D-04:** Back-button entries become "one per exploration session, delimited
  by a meaningful (filter/selection/UI) action," instead of "one per deliberate
  gesture." The URL always reflects the current viewport (via the live
  `replaceState`), so reload/share/popstate restore are unaffected.

### Must-preserve invariants (do NOT regress — v4.9 map-init work just landed)
- **D-05:** Keep the `_filterResolving` suppression guard
  (`bee-atlas.ts:660,670`) — URL writes stay suppressed while a legacy taxon
  name is pending resolution, so the URL is never stranded at `?x=&y=&z=`.
- **D-06:** Keep the `_isRestoringFromHistory` guard (`_onViewMoved`,
  `bee-atlas.ts:780-785`) — viewport moves caused by history restoration must
  not write new URL state.
- **D-07:** `popstate` (`_onPopState`, `bee-atlas.ts:679`) must leave the
  session flag in a sane state — after navigating via back/forward, the next
  user pan/zoom should start a **new** entry (treat the session as not-active
  post-popstate), and any pending debounce timer must be cleared as it is today.

### Claude's Discretion
- Whether the first `pushState` of a session fires immediately on the first
  settled gesture or retains a short debounce to absorb an accidental nudge.
  Default lean: a short debounce on the *first* push (reuse/repurpose the
  existing 500 ms timer), `replaceState` live for the rest of the session.
  Research/planning may simplify to immediate-push if cleaner — the coalescing
  flag, not the timer, is what bounds entry count.
- Exact name of the session flag and where it's declared among the existing
  private fields (e.g. alongside `_mapMoveDebounce`, `bee-atlas.ts:76`).
- Whether `_mapMoveDebounce`/the 500 ms timer is kept, repurposed, or removed.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### URL/history write logic (the code under change)
- `src/bee-atlas.ts` §640-786 — URL-state section: `_buildCurrentParams()`,
  `_replaceUrlState()` (the ~18-site replaceState path), `_pushUrlStateDebounced()`
  (the sole pushState, the thing being redesigned), `_onPopState()`, `_onViewMoved()`.
- `src/bee-atlas.ts:76` — `_mapMoveDebounce` field declaration.
- `src/bee-map.ts:477-482` — `moveend` handler that emits the `view-moved` event
  upward (presenter; do not move URL logic here — see invariant below).
- `src/url-state.ts` §60-114 (`buildParams`) and §116-278 (`parseParams`) —
  what the URL encodes/decodes; unchanged by this phase but needed to understand
  what a history entry contains.

### Architecture invariants
- `CLAUDE.md` — "State ownership": `<bee-atlas>` owns all reactive state;
  `<bee-map>` is a pure presenter that emits events upward. The session flag and
  all `pushState`/`replaceState` logic stay in `<bee-atlas>`.

### Tests to extend
- `src/tests/url-state.test.ts` — round-trip buildParams/parseParams (viewport
  `x`/`y`/`z` covered).
- `src/tests/bee-atlas.test.ts` — state-ownership / coordinator tests; the new
  history-coalescing behavior belongs here.
- `src/tests/bee-map.test.ts` §77-100 — `moveend`→`view-moved` emission.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `_pushUrlStateDebounced()` / `_replaceUrlState()` / `_mapMoveDebounce`: the
  existing debounce scaffolding is the starting point — repurpose rather than
  rebuild.

### Established Patterns
- Single-writer URL model: only `<bee-atlas>` writes `window.history`. `pushState`
  is currently used in exactly one place (viewport); everything else is
  `replaceState`. The coalescing change keeps that single-writer discipline.
- `moveend` (not `move`) is the granularity — fires once per settled gesture, so
  there is no per-frame storm to debounce; coalescing is about *consecutive
  settled gestures within an exploration*, not frames.

### Integration Points
- `_onViewMoved` (viewport entry point) and every `_replaceUrlState()` caller
  (the session-reset trigger points). The change touches the entry/reset logic,
  not `buildParams`/`parseParams`.

</code_context>

<specifics>
## Specific Ideas

The desired UX: panning/zooming around to explore the map = one back-button step
to undo, not N. A filter change or selection ends one exploration session and
arms the next, so the back stack reads as a sequence of meaningful states rather
than a trail of camera positions.

</specifics>

<deferred>
## Deferred Ideas

- **Stop viewport history entries entirely** (replaceState-only for viewport) —
  considered and explicitly rejected in favor of session-coalescing (the user
  still wants viewport reachable via back).
- **Movement-threshold gate** (ignore micro-adjustments below a zoom/distance
  delta) — considered; not chosen for this phase. Could layer on later if
  session-coalescing alone proves insufficient.
- **Add explicit test for the (now-replaced) 500 ms debounce** — moot; the new
  coalescing behavior is what gets tested instead.

</deferred>

---

*Phase: 146-debounce-url-updates-when-zooming-and-panning-the-map*
*Context gathered: 2026-06-09*
