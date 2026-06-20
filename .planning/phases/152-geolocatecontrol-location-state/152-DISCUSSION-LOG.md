# Phase 152: GeolocateControl + Location State - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-06-20
**Phase:** 152-geolocatecontrol-location-state
**Areas discussed:** Activation timing, Denied/error UX, Location state cadence, Other map controls

---

## Activation timing

| Option | Description | Selected |
|--------|-------------|----------|
| User-clicks-control only | Permission prompt fires only on tap; standard Mapbox behavior | |
| Auto-trigger on /app load | `.trigger()` on map load, prompting immediately; aggressive on first visit | |
| Auto-trigger only if already granted | Permissions API check on load; auto-activate if `granted`, else wait for click | ✓ |

**User's choice:** Auto-trigger only if already granted.
**Notes:** Best of both — no cold permission prompt on first visit, instant dot on return visits.

---

## Denied / error UX (LOC-03)

| Option | Description | Selected |
|--------|-------------|----------|
| App-level toast/banner | Reuse app-level transient message (like offline/cache UI) explaining block + re-enable | ✓ |
| Mapbox built-in only | Native disabled state + tooltip via `title`; minimal but easy to miss | |
| Inline near the control | Custom message anchored to control on `error`; needs custom positioning | |

**User's choice:** App-level toast/banner.

---

## Location state cadence

| Option | Description | Selected |
|--------|-------------|----------|
| Update on every fix | Relay each geolocate event; latest position always reflected | |
| Update on every fix, defer throttling to Phase 153 | Emit every fix now (simplest, correct); throttle when 153 consumes it | ✓ |
| First fix only for now | Store only first position; 153 upgrades; minimal churn but stale dot + rework | |

**User's choice:** Update on every fix; defer throttling to Phase 153.
**Notes:** User probed whether frequent updates cost full bee-atlas re-renders and DB re-queries. Investigation confirmed: (1) Lit reactive update re-runs `render()` + lit-html diff only, no DOM rebuild; (2) the blue dot/accuracy ring are drawn natively by GeolocateControl and don't depend on lifted state at all; (3) DB queries are decoupled from the render cycle — `_runFilterQuery()` only fires from explicit mutation handlers, never a lifecycle hook — so `_userLocation` updates incur zero SQLite-worker traffic. Throttling only matters in Phase 153 where "near me" re-queries on position change.

---

## Other map controls

| Option | Description | Selected |
|--------|-------------|----------|
| GeolocateControl only | Stay scoped to LOC-01/02/03; top-right default; note nav as deferred | ✓ |
| Also add NavigationControl | Add zoom +/- + compass; slight scope expansion | |

**User's choice:** GeolocateControl only.

---

## Claude's Discretion

- Exact `_userLocation` shape (minimal `{ lat, lon, accuracy }` vs. richer, anticipating Phase 153 haversine).
- Denial-message copy and whether to reuse an existing banner component or add a new one.
- Whether position-unavailable (no GPS) gets distinct copy from permission-denied.

## Deferred Ideas

- NavigationControl (zoom + compass) — future map-UX polish phase if wanted on touch.
- Position-stream throttling/debounce — Phase 153, where it has a real query cost.
