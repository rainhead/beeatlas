---
phase: 63-sqlite-data-layer
fixed_at: 2026-04-17T17:15:00Z
review_path: .planning/phases/63-sqlite-data-layer/63-REVIEW.md
iteration: 1
findings_in_scope: 3
fixed: 2
skipped: 1
status: partial
---

# Phase 63: Code Review Fix Report

**Fixed at:** 2026-04-17T17:15:00Z
**Source review:** .planning/phases/63-sqlite-data-layer/63-REVIEW.md
**Iteration:** 1

**Summary:**
- Findings in scope: 3 (CR-01, WR-01, WR-02)
- Fixed: 2 (CR-01, WR-02)
- Skipped: 1 (WR-01 — absorbed into CR-01 fix)

## Fixed Issues

### CR-01: Stale table names in `bee-atlas.ts` — queries reference non-existent `ecdysis` and `samples` tables

**Files modified:** `frontend/src/bee-atlas.ts`
**Commit:** 16ce5c3
**Applied fix:** Replaced all six SQL statements that referenced the old two-table schema (`ecdysis`, `samples`) with queries against the unified `occurrences` table:
- `_loadSummaryFromSQLite` summary stats: `FROM ecdysis` → `FROM occurrences WHERE ecdysis_id IS NOT NULL`
- `_loadSummaryFromSQLite` taxa options: same table rename + `WHERE ecdysis_id IS NOT NULL` filter
- `_loadSummaryFromSQLite` county options: `FROM ecdysis` → `FROM occurrences`
- `_loadSummaryFromSQLite` ecoregion options: `FROM ecdysis` → `FROM occurrences`
- `_loadCollectorOptions`: replaced `FROM ecdysis e LEFT JOIN samples s ON ...` with `FROM occurrences WHERE ecdysis_id IS NOT NULL`; also added try/catch error handling (absorbing WR-01)
- `_restoreSelectionSamples`: `FROM ecdysis` → `FROM occurrences`

### WR-02: `_insertRows` in `sqlite.ts` does not roll back on step failure — transaction may be left open

**Files modified:** `frontend/src/sqlite.ts`
**Commit:** 5b84db5
**Applied fix:** Wrapped the `for await` insert loop and `COMMIT` in a `try/catch`. On any thrown error, `ROLLBACK` is issued (with `.catch(() => {})` to suppress errors if the transaction is already gone), then the error is re-thrown so the caller is notified.

## Skipped Issues

### WR-01: `_loadCollectorOptions` has no error handling — a query failure leaves `_collectorOptions` in a partially-cleared state

**File:** `frontend/src/bee-atlas.ts:378`
**Reason:** Absorbed into CR-01 fix. The rewrite of `_loadCollectorOptions` to use the `occurrences` table (CR-01) simultaneously introduced the try/catch + staging-array pattern recommended by WR-01. The two fixes were applied atomically in the same edit. No separate commit was needed.
**Original issue:** `_loadCollectorOptions` cleared `_collectorOptions` before firing the query, leaving an empty array if the query threw.

---

_Fixed: 2026-04-17T17:15:00Z_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 1_
