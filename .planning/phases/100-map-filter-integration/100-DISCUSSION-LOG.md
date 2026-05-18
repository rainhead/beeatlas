# Phase 100: Map & Filter Integration - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-05-17
**Phase:** 100-map-filter-integration
**Areas discussed:** URL deep-link behavior, Click interaction precedence, Boundary mode / filter coupling, Place polygon visual style

---

## URL deep-link behavior

| Option | Description | Selected |
|--------|-------------|----------|
| Yes — auto-activate boundaries | `place=slug` implies `bm=places`; restoration shows the polygon + the filter chip | ✓ |
| No — filter chip only | `place=slug` applies chip but doesn't touch boundary mode | |
| Explicit `bm=places` required | Both params must be present to show boundaries | |

**User's choice:** Auto-activate — `place=slug` in URL implies `bm=places`
**Notes:** Most informative UX for users following deep-links from place pages.

---

## Click interaction precedence

| Option | Description | Selected |
|--------|-------------|----------|
| Occurrence dot wins | Point layer queried first; dot click opens sidebar; polygon only fires when no dot underneath | ✓ |
| Place polygon wins | Clicking polygon always activates place filter regardless of occurrence dots | |
| Both fire, dot takes priority | Same as option 1 in practice | |

**User's choice:** Occurrence dot wins — consistent with current interaction model

Follow-up — polygon clickable outside Places mode?

| Option | Description | Selected |
|--------|-------------|----------|
| No — polygon click only when mode is Places | Click handler only active when `boundaryMode === 'places'` | ✓ |
| Yes — polygon always clickable | Fill layer remains a hit target in any mode | |

**Notes:** No invisible click targets.

---

## Boundary mode / filter coupling

| Option | Description | Selected |
|--------|-------------|----------|
| Filter persists, boundaries hide | Switching mode keeps place chip active; consistent with county/ecoregion independence | ✓ |
| Switching clears the place filter | Mode change removes chip; simpler state model | |
| Prompt the user | Pop confirmation when switching away with active filter | |

**User's choice:** Filter persists independently of display mode

Follow-up — highlight active polygon when in Places mode?

| Option | Description | Selected |
|--------|-------------|----------|
| Yes — highlight active place polygon | Matching polygon shows selected-state fill when place filter is on and Places mode is active | ✓ |
| No — all polygons look the same | Chip is the only indicator | |

---

## Place polygon visual style

| Option | Description | Selected |
|--------|-------------|----------|
| Warm amber/orange | Distinct from the blue used by counties and ecoregions | ✓ |
| Purple/violet | Clearly distinct but unusual | |
| Builder's discretion | Any color clearly distinct from the existing two | |
| Show me existing colors first | Inspect current colors before deciding | |

**User's choice:** Warm amber/orange — "reads as curated place vs administrative boundary"
**Notes:** Both counties and ecoregions use the same blue (`rgba(44, 123, 229, ...)`), so amber is strongly distinct.

---

## Claude's Discretion

- Exact amber rgba values (within warm amber family)
- Whether to add a place-label symbol layer (not in requirements, likely omitted)
- Feature-state vs paint expression approach (follow existing county/ecoregion pattern)
- Mapbox source ID naming

## Deferred Ideas

- Multi-place filter chips with OR semantics (PRICH-02) — flagged as future milestone
- Place name labels on map polygons — out of scope for PMAP requirements
