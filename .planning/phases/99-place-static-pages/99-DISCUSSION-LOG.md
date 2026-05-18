# Phase 99: Place Static Pages - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-05-17
**Phase:** 99-place-static-pages
**Areas discussed:** Permit status display (scope clarification only), overall layout (Claude's discretion)

---

## Permit Status Display

| Option | Description | Selected |
|--------|-------------|----------|
| Color-coded badge | `<span>` chip per row, CSS only, status computed in Nunjucks | |
| Text-only status column | Plain text column, simplest implementation | |
| Out of scope | Permits removed from v3.7 milestone entirely | ✓ |

**User's choice:** Permits are not part of this milestone — no permit table at all.
**Notes:** User confirmed this immediately when the permit question was raised. Scope is name + land owner + specimen count + SVG map + deep-link only. REQUIREMENTS.md and ROADMAP.md need updating to remove the permit table clause from PPAGE-02's description.

---

## Index Page Layout and Detail Page Structure

| Option | Description | Selected |
|--------|-------------|----------|
| Claude's discretion | Follow species page patterns | ✓ |

**User's choice:** "Do something sensible."
**Notes:** Delegated entirely to Claude. Decisions logged in CONTEXT.md §Claude's Discretion.

---

## Claude's Discretion

- Index page: compact list following species index (no cards, no table with sort)
- Detail page: SVG map in media-grid at top, metadata below, deep-link at bottom
- CSS: new `src/styles/places.css` following `src/styles/species.css`
- No JS entry on either page

## Deferred Ideas

- Permit table — removed from v3.7; may resurface in v3.8+
- Per-place species breakdown (PRICH-01) — future milestone
- iNaturalist place URL link-out (PRICH-03) — future milestone
