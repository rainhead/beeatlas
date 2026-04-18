# Phase 64: OccurrenceSource - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-04-17
**Phase:** 64-occurrencesource
**Areas discussed:** Layer architecture, Click handler / URL encoding, Feature properties

---

## Layer Architecture

| Option | Description | Selected |
|--------|-------------|----------|
| Single cluster layer | OccurrenceSource feeds Cluster → VectorLayer; all occurrences cluster together with recency coloring | ✓ |
| Cluster + flat layer, same source | One source, two layers filtered by feature ID prefix in style function | |

**User's choice:** Single cluster layer — with the note that clusters should be much tighter/smaller than they currently are.

**Follow-up — cluster size:**

| Option | Description | Selected |
|--------|-------------|----------|
| Claude's discretion (~20–25px) | Noticeably tighter without overlapping at typical zoom | |
| Very tight (10–15px) | Only cluster when nearly overlapping | |
| Keep 40px | No visual change | |

**User's choice (free text):** "Just big enough to be reasonable tap targets on mobile" — interpreted as: minimize cluster distance while ensuring rendered dot diameter ≥ 44px.

---

## Click Handler / URL Encoding

**Context surfaced during discussion:** Tapping a large cluster currently produces a URL with every occurrence ID encoded (`o=ecdysis:1,ecdysis:2,...`), which exceeds URL length limits on some systems. User confirmed this should be fixed in Phase 64.

**Resolution approach selected:** Centroid + radius encoding for clusters.

| Question | Options | Selected |
|----------|---------|----------|
| Mixed cluster (specimens + sample-only) | Show all in sidebar / Specimens only | Show all in sidebar |
| Radius source | Furthest feature from centroid / Pixel distance at click zoom | Furthest feature from centroid |

**Notes:** Single-feature clicks keep the existing `o=ecdysis:1234` / `o=inat:5678` format. Cluster clicks encode as `o=@lon,lat,radiusM`. URL restore uses a spatial (equirectangular) query against the `occurrences` table.

---

## Feature Properties

| Option | Description | Selected |
|--------|-------------|----------|
| All columns | Every column from occurrences table; nulls where not applicable | ✓ |
| Type-scoped columns | Only columns relevant to the feature's type | |

**Context:** User initially assumed the sidebar re-queries SQLite on click (it does not — it reads from OL feature properties via `buildSamples()`). After clarification, user deferred to Claude's discretion; "all columns" is the simplest implementation and future roadmap items will revisit the data flow.

**User's choice:** "Whatever is easier for you" → all columns (Claude's discretion).

---

## Claude's Discretion

- Exact cluster `distance` parameter value (target ≈ 20px; tune for ≥ 44px tap target)
- `SelectionState` discriminated union shape in `url-state.ts`
- Equirectangular approximation for SQLite spatial restore query
- `layerMode` left as no-op property (not removed until Phase 65)

## Deferred Ideas

- Click-to-sidebar data flow revisit (future roadmap)
- `makeSampleDotStyleFn` cleanup (Phase 65)
