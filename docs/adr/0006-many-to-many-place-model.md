# ADR 0006: Many-to-Many Place Model

**Status:** Accepted (v5.2 / Phase 160; migrated from `.planning/RETROSPECTIVE.md`)

---

## Context

Occurrences were originally assigned a single scalar `place_slug`. But places genuinely overlap — there are 16 real cases where a WDFW wildlife area and another place both contain the same occurrence. One-place-per-occurrence was an implementation artifact, not domain truth.

## Decision

Place membership is **many-to-many**: an occurrence belongs to **every** place it falls within, modeled via the separately-contracted **`marts/occurrence_places`** bridge keyed on `occ_id`. The scalar `place_slug` is dropped (Phase 160). (Also recorded in the `project_place_model_many_to_many` memory.)

## Rejected

- Clipping overlaps to preserve single membership — discards real containment relationships to satisfy an implementation constraint.

## Consequences

- The bridge join key mirrors the `occ_id` priority vocabulary — positionally coupled with `src/occurrence.ts` and `src/filter.ts`; change all three together (see [docs/domain-model.md](../domain-model.md)).
- "Regions" (the map-UI label) query place membership through the bridge, not a scalar column.

---

*Source: `.planning/RETROSPECTIVE.md` §v5.2 (preserved at `docs/history/RETROSPECTIVE.md`).*
