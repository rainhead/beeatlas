# Phase 164: Sidebar occurrence list ignores the `src=` source filter - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-06-24
**Phase:** 164-sidebar-list-ignores-src-source-filter
**Areas discussed:** Consistency scope, State model, Map mechanism, All-off behavior

---

## Consistency scope

| Option | Description | Selected |
|--------|-------------|----------|
| All count-bearing views | List + summary count + CSV export + table view all honor `src=`. One predicate, no view disagrees. | ✓ |
| Sidebar list only | Narrowest fix — just make the list match the map. Count/CSV/table keep ignoring `src=`. | |

**User's choice:** All count-bearing views
**Notes:** All four run through `buildFilterSQL` → same root cause. Caveat captured in CONTEXT: the "count" to fix is the filter-result count (`_filteredRowCount`), not the all-time summary stats in `_loadSummaryFromSQLite`.

---

## State model

| Option | Description | Selected |
|--------|-------------|----------|
| Promote to FilterState | First-class `FilterState` field (like `bounds` in Phase 156), folded into `buildFilterSQL` + `isFilterActive`; keeps `src=` serialization. | ✓ |
| Keep separate, thread in | Leave `hiddenSources` as separate UI state; pass as extra arg. Smaller diff but source stays second-class; `isFilterActive` won't see it. | |

**User's choice:** Promote to FilterState
**Notes:** URL `src=` param name/format unchanged; round-trip must stay consistent.

---

## Map mechanism

| Option | Description | Selected |
|--------|-------------|----------|
| Leave map as-is | Keep the map's in-memory `_visibleBySource`; SQL predicate added only to the re-querying views. | ✓ |
| Converge map to SQL | Drive map source filtering from SQL too — forces re-query per toggle and breaks clustering/ghost. | |

**User's choice:** Leave map as-is
**Notes:** User pressed twice on *why* the map differs and whether it was a perf issue. It is **not** perf — it's structural: the map holds the full universe in `_fullGeoJSON` for mapbox source-level clustering + the ghost layer. Convergence would resurrect deselected-source points as dimmed ghost dots (full-set-minus-visibleIds, source-blind). Derived constraint D-04 recorded: the map must KEEP `_visibleBySource` even after source joins FilterState, or the ghost-dot bug returns.

---

## All-off behavior

| Option | Description | Selected |
|--------|-------------|----------|
| Honest empty (zero) | All 4 sources off → list + count + CSV + table show zero, matching the map's empty render. | ✓ |
| All-off = show all | Treat "everything deselected" as "no source filter" — would diverge from the map. | |

**User's choice:** Honest empty (zero)
**Notes:** Matches the map; "show all" would reintroduce the exact map/list disagreement this phase fixes.

---

## Claude's Discretion

- Exact SQL shape of the source predicate (`source IN (...)` vs `source NOT IN (...)`) and its placement in `buildFilterSQL`, subject to the existing `o.`-alias invariant.

## Deferred Ideas

None — discussion stayed within phase scope. (Phase 165 separately tracks the duplicate-occ_id list-rendering bug.)
