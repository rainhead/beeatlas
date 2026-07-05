# ADR 0010: Curator-Gated Audit-CSV Data-Integrity Policy (Prefer False-Split over False-Merge)

**Status:** Accepted (v4.7; migrated from `.planning/RETROSPECTIVE.md`)

---

## Context

Build-time decisions like name resolution and cross-source deduplication have asymmetric error costs on a scientific atlas: a **false merge** (conflating two distinct entities) corrupts the record and is credibility-critical; a **false split** (leaving two records unmerged) is merely incomplete.

## Decision

For build-time integrity decisions with a credibility-critical false-positive cost, **prefer a false-split over a false-merge**, and require **human sign-off**: emit candidate merges/resolutions to a **committed audit CSV**, and apply **nothing unreviewed**. A curator reviews the CSV; only reviewed rows take effect.

## Consequences

- The atlas never silently merges records on a heuristic; unreviewed candidates stay split and visible.
- The audit CSV is versioned in git, so every applied resolution has a reviewable provenance trail.
- This is the right risk posture for scientific data and should govern any future dedup/name-resolution feature.

---

*Source: `.planning/RETROSPECTIVE.md` §v4.7 (preserved at `docs/history/RETROSPECTIVE.md`).*
