---
phase: 153
slug: occurrences-near-me
status: passed
verified: 2026-06-21
method: interactive UAT (operator) + automated suite
---

# Phase 153 — Verification

**Goal:** "Near me" resolves the user's GPS position into a ~10 km box and applies it as a
spatial **filter**, reusing the existing bounds mechanism; the bounds round-trip in the URL
so a shared link reproduces the same occurrences.

**Verdict: PASSED** (operator UAT 2026-06-21 + build/test green).

## Requirements

| Req | Status | Evidence |
|-----|--------|----------|
| NEAR-01 | ✓ | Geolocate button inside the where input → ~10 km box → filters map + list + table; AND-composes with taxon/date. Operator-verified; real-engine test (`queryVisibleGeoJSON` returns only in-bounds points). |
| NEAR-02 | ✓ | Reuses the existing bbox `boundsClause` query path; no separate proximity query. |
| NEAR-03 | ✓ | Bounds round-trip in the URL (`sel=west,south,east,north`); a shared link reproduces the same occurrences with no recipient GPS (operator-verified). Chip ✕ / Clear filters clear the bounds. Phase 152 denial toast fires on denial (operator-verified; fixed this phase). |

## Notes
- The design changed mid-phase: the original haversine/`?near=1` approach was reverted; near-me was rebuilt to reuse the shift-drag `selectionBounds` mechanism (operator request), and bounds were promoted from a list-only *selection* to a true *filter* (map + list + table).
- Two UAT-found defects (map not filtering; restored URL leaving the map empty) were fixed inline with regression tests.
- DEFERRED: real-device iPhone check (Scenario 8) — does not block the goal.
- FOLLOW-UP: backlog Phase 999.8 — separate the spatial-bounds filter from per-record selection (rename off `_selectionBounds`, distinct URL param).

## Automated
- `npm run build`: green
- `npm test`: 792 passing
