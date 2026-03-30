# Phase 24: Tech Debt Audit - Context

**Gathered:** 2026-03-27
**Status:** Ready for planning

<domain>
## Phase Boundary

Review every item in PROJECT.md's "Known tech debt" section against the new dlt-based architecture. Assign each a disposition: **closed** (resolved by prior phases), **updated** (still live but description needs revision for new architecture), or **carried forward** (unchanged). Update PROJECT.md in-place to reflect the current state. Fixes and CI/infra changes are deferred to future phases — this phase is documentation and triage only.

</domain>

<decisions>
## Implementation Decisions

### Output location
- **D-01:** Update PROJECT.md "Known tech debt" section in-place — it is the canonical source, not a separate audit doc
- **D-02:** Remove fully resolved items from the section (don't accumulate noise); add a brief rationale inline as a comment or parenthetical before removing, captured in the commit message

### Fix vs. document
- **D-03:** This phase does NOT fix code — it audits and records dispositions only
- **D-04:** Trivial fixes (typo, stale docs) should be noted as "trivially fixable" in their disposition, but not executed here; the planner may include them as optional cleanup tasks if they are truly one-liners with no risk

### New debt discovery
- **D-05:** Surface newly identified debt items found during the review (e.g., dlt migration may have introduced new debt around state management, error handling, or CI integration gaps)
- **D-06:** New items get added to PROJECT.md "Known tech debt" with the same format as existing items

### Closed item handling
- **D-07:** Items fully resolved by the dlt migration (Phases 20–23) are removed from the list; the commit message records what was closed and why

### Scope of review
- **D-08:** Review is against the seven existing items in PROJECT.md plus any obvious new debt visible from reading the dlt pipeline code and export layer

### Claude's Discretion
- Exact wording of updated debt item descriptions
- Whether to group surviving items by severity or domain
- Depth of codebase scan for new debt discovery

</decisions>

<specifics>
## Specific Ideas

No specific requirements — user deferred all gray areas to defaults.

</specifics>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Tech debt source of truth
- `.planning/PROJECT.md` §"Known tech debt" — The seven existing items to audit; this file will be updated in-place as the phase output

### Architecture delivered by prior phases
- `.planning/phases/20-pipeline-migration/` — dlt pipeline migration context and plans
- `.planning/phases/21-parquet-and-geojson-export/` — Export layer and schema validation changes
- `.planning/phases/22-orchestration/` — Local orchestration replacing build-data.sh
- `.planning/phases/23-frontend-simplification/` — Links.parquet removal, inat_observation_id from features

### Requirements
- `.planning/REQUIREMENTS.md` §DEBT-01 — Acceptance criterion for this phase

</canonical_refs>

<deferred>
## Deferred Ideas

- Fixing the `speicmenLayer` typo in bee-map.ts — trivially executable but deferred to a cleanup task or future phase
- CI integration for dlt pipelines (S3, pipeline triggers) — out of scope for v1.6 per PROJECT.md
- DuckDB persistence strategy for production — explicitly deferred per milestone scope

</deferred>

---

*Phase: 24-tech-debt-audit*
*Context gathered: 2026-03-27*
