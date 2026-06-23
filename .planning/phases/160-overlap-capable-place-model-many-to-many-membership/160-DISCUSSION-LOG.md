# Phase 160: Overlap-capable place model (many-to-many membership) - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-06-23
**Phase:** 160-overlap-capable-place-model-many-to-many-membership
**Areas discussed:** Storage shape, Display, Counts

---

## Storage shape

| Option | Description | Selected |
|--------|-------------|----------|
| Array column on occurrences | `place_slugs` LIST on occurrences mart; frontend materializes as JSON text, filter via json_each/EXISTS; needs research on hyparquet→wa-sqlite list handling | |
| `occurrence_places` bridge relation | Drop place_slug; normalized occurrence×place mart + wa-sqlite table; filter via join/EXISTS | ✓ |
| Let research decide | Benchmark hyparquet + wa-sqlite list vs bridge, then pick | |

**User's choice:** `occurrence_places` bridge relation.
**Notes:** Clean relational model on both the dbt and wa-sqlite ends; avoids SQLite's lack of array types. Drops scalar `place_slug` from occurrences (contract 33→32). Join key + bridge artifact format deferred to research.

---

## Display

| Option | Description | Selected |
|--------|-------------|----------|
| Pure data/filter change | No UI changes; membership powers filter + counts only | |
| Show all places in detail | Sidebar occurrence detail lists every place the occurrence belongs to | ✓ |

**User's choice:** Show all places in detail.
**Notes:** Reuse the existing place-name lookup in bee-pane.ts.

---

## Counts

| Option | Description | Selected |
|--------|-------------|----------|
| Count toward every place | Occurrence in overlap of A and B counts for both; totals may exceed occurrence count | ✓ |
| Keep current semantics | Avoid double-counting (would need a reason) | |

**User's choice:** Count toward every place.
**Notes:** "How many bees recorded in this place" — double-membership counting is the correct semantic.

---

## Claude's Discretion / Research

- Join key between occurrences and occurrence_places (durable occurrence id, not internal `_row_id`).
- Bridge artifact format + wa-sqlite load/join path.
- List determinism (sort/dedupe) and empty-membership handling (zero bridge rows).

## Deferred Ideas

- Multi-place filter selection (PRICH-02) — still deferred.
- Containment-aware "primary place" ranking — later refinement.
- WDFW areas (161) / hikes (162) — the sources that consume this model.
