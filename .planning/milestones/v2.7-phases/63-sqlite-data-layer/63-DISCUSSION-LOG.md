# Phase 63: SQLite Data Layer - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-04-17
**Phase:** 63-sqlite-data-layer
**Areas discussed:** Year/month for sample-only rows, layerMode in Phase 63

---

## Year/Month for Sample-Only Rows

| Option | Description | Selected |
|--------|-------------|----------|
| Exclude naturally | year >= X excludes null year rows; no strftime needed | ✓ |
| Include via strftime | Derive year/month from date for rows where year/month IS NULL | |

**User's choice:** Exclude naturally — year and month filters use SQL null semantics.
**Notes:** Same decision applied consistently to both year and month filters.

---

## layerMode in Phase 63

| Option | Description | Selected |
|--------|-------------|----------|
| Keep layerMode, narrow table | specimens: ecdysis_id IS NOT NULL; samples: observation_id IS NOT NULL | ✓ |
| Drop layerMode now | Simplify to unified queries, pull Phase 65 scope forward | |

**User's choice:** Keep layerMode, narrow table.
**Notes:** samples mode uses `observation_id IS NOT NULL` (not `ecdysis_id IS NULL`) so linked rows appear in both modes, matching the old behavior of the separate samples table.

---

## Claude's Discretion

- `buildFilterSQL` return type: `{ occurrenceWhere: string }` replacing `{ ecdysisWhere, samplesWhere }`
- Filter tests updated to use `occurrenceWhere`; ghost clause (`1 = 0`) tests removed
- `queryVisibleIds` return type unchanged; implementation queries unified table twice with `ecdysis_id IS NOT NULL` / `observation_id IS NOT NULL`
- `loadAllTables` renamed to `loadOccurrencesTable` (or equivalent)

## Deferred Ideas

None.
