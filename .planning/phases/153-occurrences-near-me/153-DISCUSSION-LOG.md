# Phase 153: Occurrences Near Me - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-06-20
**Phase:** 153-occurrences-near-me
**Areas discussed:** Pending/failure UX, Live vs frozen position, Chip placement, GeolocateControl coupling, Refresh affordance, Empty state

---

## Pending / failure UX

| Option | Description | Selected |
|--------|-------------|----------|
| Pending state + reuse toast | Chip shows active/loading immediately; map holds until fix, then filters. On denied/unavailable reuse Phase 152 toast, leave chip off. | ✓ |
| Optimistic, silent wait | Chip flips active instantly, no spinner, silent revert on failure. | |
| Block activation until fix | Force a location request first; chip only activates once a fix exists. | |

**User's choice:** Pending state + reuse toast
**Notes:** Most consistent with existing affordances; the Phase 152 denial toast (`_locationErrorKind`) is reused as-is.

---

## Live vs frozen position

| Option | Description | Selected |
|--------|-------------|----------|
| Live-follow (throttled) | Re-query on each GPS fix so the set tracks the walking collector; needs throttle/debounce. | |
| Freeze at activation | Capture position when toggled on; set stays put until re-toggled. No throttle needed. | ✓ |

**User's choice:** Freeze at activation
**Notes:** Sidesteps the throttle concern deferred from Phase 152 (D-05) — no per-fix re-query cost. The blue dot still tracks live; only the filtered set is frozen.

---

## Chip placement

| Option | Description | Selected |
|--------|-------------|----------|
| Standalone chip, own line | Dedicated near-me toggle chip, distinct from Where/region filters. | ✓ |
| Inside the Where section | Render alongside county/ecoregion/place chips in `_renderWhere()`. | |

**User's choice:** Standalone chip, own line
**Notes:** Reads as a distinct location-relative filter; avoids conceptually mixing GPS position with named-place filters.

---

## GeolocateControl coupling

| Option | Description | Selected |
|--------|-------------|----------|
| Activate tracking too | Near-me triggers the GeolocateControl; blue dot + ring appear; one tap = filter + visual anchor. | ✓ |
| Independent of control | Near-me only consumes `_userLocation` if it already exists; doesn't force the control on. | |

**User's choice:** Activate tracking too
**Notes:** Single tap gives both filter and "this is where you are" anchor; control remains the single source of position.

---

## Refresh affordance (follow-up — resolving freeze + tracking tension)

| Option | Description | Selected |
|--------|-------------|----------|
| Re-tap chip to re-capture | Toggle off/on re-captures current GPS position; chip is the refresh. | ✓ |
| Recenter button re-captures | Tapping the blue-dot recenter button also re-snaps the filter. | |
| No refresh — re-tap implied | Don't design refresh; assume re-tap is obvious, undocumented. | |

**User's choice:** Re-tap chip to re-capture
**Notes:** Simple, discoverable enough for a field tool; no coupling to the recenter button.

---

## Empty state (follow-up)

| Option | Description | Selected |
|--------|-------------|----------|
| Reuse existing empty state | Whatever the map/list/table already shows when a filter matches nothing. | ✓ |
| Near-me-specific message | Tailored "No occurrences within 10 km of you" copy. | |

**User's choice:** Reuse existing empty state
**Notes:** Consistent with other filters; no new copy to maintain.

---

## Claude's Discretion

- Exact `FilterState` field name (`nearMe` suggested) and chip label/spacing.
- Whether the bbox pre-filter widens by GPS `accuracy` or uses a plain 10 km box (haversine enforces the true radius regardless).
- Pure-SQL vs JS haversine — the phase's named research item (`SELECT sin(1.0)` MemoryVFS probe), not a user decision.
- Pending→active chip styling mechanics.

## Deferred Ideas

- Live-following near-me (throttled re-query per fix) — declined in favor of freeze-at-activation.
- Configurable/surfaced radius — 10 km fixed by requirements.
- Distance sort / "nearest N" ranking — near-me is binary within-radius, not a ranking.
- Recenter-button-as-refresh coupling — declined in favor of re-tap.
