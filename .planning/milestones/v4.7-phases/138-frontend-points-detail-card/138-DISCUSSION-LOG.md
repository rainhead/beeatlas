# Phase 138: Frontend Points & Detail Card - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-06-08
**Phase:** 138-frontend-points-detail-card
**Areas discussed:** Point color & recency, Detail card layout, Detail-field plumbing

---

## Gray-area selection

User selected (multiSelect) Point color & recency, Detail card layout, Detail-field plumbing.
Not selected: Source label & legend (handled via derived defaults — keep "Checklist records" label, no legend).

---

## Point color & recency

| Question | Options | Selected |
|----------|---------|----------|
| Unclustered checklist point coloring | Distinct flat hue (override recency) / Follow recency like others | Distinct flat hue ✓ |
| Which hue | Green (carry over county-fill ~rgba(44,122,44)) / A new distinct color | Green (carry over) ✓ |

**Notes:** Distinct flat green chosen because the map colors all points by recency today (not source), checklist dates are coarse (most would land in 'earlier' gray), and green preserves the county-fill association. Derived: checklist clusters with other sources (so green only shows unclustered); selected points keep green + standard selection ring; same radius/stroke.

---

## Detail card layout

| Question | Options | Selected |
|----------|---------|----------|
| Verbatim vs accepted name when they differ | Accepted prominent / verbatim muted · Verbatim prominent / accepted parens · Inline det. annotation | Inline det. annotation ✓ |
| Attribution presentation | Plain muted citation line / Linked citation | Plain muted citation line ✓ |
| Show collapsed_count | Show when N>1 / Don't show | Show when N>1 ✓ |
| Date rendering | Roman-month precision-aware / ISO precision-aware | Roman-month precision-aware ✓ |

**Notes:** Inline form `{accepted} (det. as {verbatim})` mirrors the herbarium "det." convention. Date precision is recoverable from the date string length, so date_quality need not be plumbed. Verified Phase 137 ARM 4 populates recordedBy, canonical_name, taxon_id but not verbatim_name/locality/collapsed_count.

---

## Detail-field plumbing

| Question | Options | Selected |
|----------|---------|----------|
| How card gets verbatim_name, locality, collapsed_count | Promote into occurrences contract (34→37) / Lazy-fetch from checklist parquet by checklist_id | Promote into contract ✓ |

**Notes:** Promotion is consistent with how every other source's detail fields are exposed (all live in the occurrences contract). Lazy-fetch would introduce a detail-fetch path no other source has. date_quality excluded — precision recoverable from date string.

---

## Claude's Discretion

- Exact green shade/opacity, circle radius, optional contrast stroke (planner picks precise paint).
- Source ordering within the toggle list.

## Deferred Ideas

- Map legend for source/recency colors (no legend exists today — separate capability).
- Renaming the checklist source label (kept as "Checklist records").
- Linked/DOI attribution for Bartholomew et al. 2024 (plain text this phase).
- **Research flags (not user decisions):** reconcile `checklist_count` (raw mart vs deduped occurrences) for UIX-04 double-count; confirm `date_quality` distribution so month-precision dates aren't silently dropped.
