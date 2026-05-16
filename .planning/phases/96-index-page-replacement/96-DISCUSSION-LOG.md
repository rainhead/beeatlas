# Phase 96: Index Page Replacement - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-05-15
**Phase:** 96-index-page-replacement
**Areas discussed:** Old component cleanup

---

## Old component cleanup

| Option | Description | Selected |
|--------|-------------|----------|
| Delete in Phase 96 | Delete bee-species-page.ts, bee-species-filter.ts, species/url-state.ts, taxon-tree.njk, their test files; update entries/species.ts + arch.test.ts in the same phase | ✓ |
| Leave as dead code | Only replace species.njk template; leave old components and tests in place for a later cleanup task | |

**User's choice:** Delete in Phase 96
**Notes:** Accepted the recommended option without modification.

---

## Claude's Discretion

- **Filter mechanism**: Not discussed by user. Defaulted to genus/tribe page pattern — thin JS entry module (no Lit coordinator). Researcher/planner to confirm.
- **Index data structure**: Whether to add `familyIndex` to `_data/species.js` or group at Nunjucks template time — deferred to researcher/planner.
- **bee-species-card.ts / seasonality-viz.ts**: May also be unused after replacement; researcher to verify before deleting.

## Deferred Ideas

- None raised during discussion.
