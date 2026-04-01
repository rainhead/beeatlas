# Phase 32: SQL Filter Layer - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-03-31
**Phase:** 32-sql-filter-layer
**Areas discussed:** Sample feature filtering

---

## Sample Feature Filtering

| Option | Description | Selected |
|--------|-------------|----------|
| All filters apply (preserve current behavior) | Year/month/county/ecoregion filter sample dots. Taxon filter ghosts all samples (no taxonomic data). Same as matchesFilter today. | ✓ |
| Only geographic/date filters apply | Year, month, county, ecoregion filter samples. Taxon filter ignored for samples — samples stay visible regardless of taxon selection. | |
| Samples always visible | No filters applied to sample dots at all — always shown regardless of active filters. | |

**User's choice:** All filters apply (preserve current behavior)
**Notes:** Preserving exact matchesFilter semantics — taxon filter ghosts samples since they lack family/genus/scientificName columns. Requires separate SQL query against samples table.

---

## Claude's Discretion

- Async gap state: keep previous visibleIds until new query resolves (smooth transition, no flash)
- Module organization for visibleIds state and SQL builder
- Console logging format for SQL WHERE clauses
- Debounce strategy for rapid filter changes

## Deferred Ideas

None.
