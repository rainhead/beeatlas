---
name: Work vs. Learning — the site's two halves
description: Structural reframe — split the site into a prospective "work" surface and a retrospective "learning" surface; why occurrence `source` is the wrong UI primitive
type: project
date: 2026-06-24
---

## The reframe

The site presents one unit: the **occurrence–sample pair** (with cardinality slop — zero-to-many
occurrences per sample, possibly no sample, multiple iNat observations per occurrence). The three
real entities behind it are **people, samples, and occurrences**.

A volunteer cares about that unit along **orthogonal facets** — *who collected it, where, what
taxon, when*, and *whose work it is* (mine → the project's → the broader community's). These are
co-equal axes, not a hierarchy.

## Why `source` is the wrong primitive

`source` (the five `int_combined` categories — see `docs/domain-model.md`) flattens overlapping
subsets into one **mutually-exclusive bucket** and pushes that plumbing detail up into the UI. It
collides the *provenance/attribution* facet ("whose work") with implementation accidents
(catalogued-vs-not, which pipeline arm). A volunteer never thinks in `source`; they think in the
facets above. The frontend re-interprets `source` in three independent ad-hoc switches
(`src/filter.ts` + `src/bee-map.ts`, `src/bee-occurrence-detail.ts`, `src/style.ts`).

**The `source` rebuild is the substrate, not the goal** — it's the prerequisite that lets the data
be expressed as collector-attributed occurrence–sample pairs with an ID-status lifecycle, which is
what the "work" surface needs. **Shipped as Phase 170** (`source` → `tier` + `record_type`).

## The two halves

Echoes the two distinct goals in `project-goals-liveness-community.md`:

- **Learning** (retrospective / reference): "what is this bee, what's out there, what's been
  found, which species might my Agapostemon be." Central object = the **taxon**, occurrences as
  evidence. Runs entirely on existing occurrence data.
- **Work** (prospective / personal): "what have I contributed, where are the gaps, where do I go
  next." Central object = **me + places**. **Least served by other tools → biggest differentiation.**

Both work use cases are reachable on **public data without auth** — "my work" needs only
*self-identification* (pick your iNat handle), not authentication. That dissolves the assumed
auth blocker.

See seeds under [roadmap-seeds/](roadmap-seeds/): `me-and-my-progress.md`, `where-to-go-next.md`,
and `collection-event-coordination.md` (the community half of "work").
