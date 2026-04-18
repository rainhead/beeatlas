---
phase: 63-sqlite-data-layer
reviewed: 2026-04-17T17:01:25Z
depth: standard
files_reviewed: 9
files_reviewed_list:
  - frontend/src/sqlite.ts
  - frontend/src/bee-atlas.ts
  - frontend/src/filter.ts
  - frontend/src/tests/filter.test.ts
  - frontend/src/tests/bee-atlas.test.ts
  - frontend/src/tests/bee-header.test.ts
  - frontend/src/tests/bee-filter-toolbar.test.ts
  - frontend/src/tests/bee-sidebar.test.ts
  - frontend/src/tests/bee-table.test.ts
findings:
  critical: 1
  warning: 2
  info: 2
  total: 5
status: issues_found
---

# Phase 63: Code Review Report

**Reviewed:** 2026-04-17T17:01:25Z
**Depth:** standard
**Files Reviewed:** 9
**Status:** issues_found

## Summary

This phase introduces a SQLite data layer (wa-sqlite + MemoryVFS), replacing the DuckDB WASM approach. `sqlite.ts` creates a single unified `occurrences` table and loads it from parquet. `filter.ts` has been fully migrated to query `occurrences`. However, `bee-atlas.ts` still contains multiple SQL queries against the old two-table schema (`ecdysis` and `samples` tables), causing runtime failures whenever the summary, taxa options, collector options, or selection-restoration code paths execute.

Test coverage for `filter.ts` is thorough. The component-level tests (`bee-atlas`, `bee-header`, `bee-table`, `bee-sidebar`, `bee-filter-toolbar`) use source-scanning and DOM-interaction patterns that give good architectural regression protection.

## Critical Issues

### CR-01: Stale table names in `bee-atlas.ts` — queries reference non-existent `ecdysis` and `samples` tables

**File:** `frontend/src/bee-atlas.ts:318`

**Issue:** `sqlite.ts` creates exactly one table: `occurrences`. But `bee-atlas.ts` still contains six SQL statements that reference the old two-table schema (`ecdysis` / `samples`). These queries fail at runtime with "no such table". The affected code paths are:

- `_loadSummaryFromSQLite` (lines 311, 335, 357, 364) — summary stats, taxa options, county options, ecoregion options. All four queries fail silently (caught at line 370). In table-first view mode (URL param `?vm=table`) or when the user switches to table view before map data loads, the app renders with empty dropdowns and zero summary counts.
- `_loadCollectorOptions` (lines 386–387) — the `FROM ecdysis e LEFT JOIN samples s` query fails; collector filter autocomplete is always empty.
- `_restoreSelectionSamples` (line 756) — the `FROM ecdysis WHERE ...` query fails; sidebar never populates when specimen occurrences are restored from URL.

The errors are caught and logged (`console.error`) so the app doesn't crash, but the features are silently broken.

**Fix:** Replace every `FROM ecdysis` and `FROM samples`/`LEFT JOIN samples` reference with the unified `occurrences` table. The new schema has all columns from both old tables on the same row. For example:

```sql
-- _loadSummaryFromSQLite: summary stats
SELECT COUNT(*) AS total_specimens,
       COUNT(DISTINCT scientificName) AS species_count,
       COUNT(DISTINCT genus) AS genus_count,
       COUNT(DISTINCT family) AS family_count,
       MIN(year) AS earliest_year,
       MAX(year) AS latest_year
FROM occurrences
WHERE ecdysis_id IS NOT NULL   -- specimen rows only

-- _loadSummaryFromSQLite: taxa options
SELECT DISTINCT family, genus, scientificName
FROM occurrences
WHERE ecdysis_id IS NOT NULL
ORDER BY family, genus, scientificName

-- _loadSummaryFromSQLite: county options
SELECT DISTINCT county FROM occurrences WHERE county IS NOT NULL ORDER BY county

-- _loadSummaryFromSQLite: ecoregion options
SELECT DISTINCT ecoregion_l3 FROM occurrences WHERE ecoregion_l3 IS NOT NULL ORDER BY ecoregion_l3

-- _loadCollectorOptions: one recordedBy per observer (specimen rows only)
SELECT recordedBy, MIN(observer) AS observer
FROM occurrences
WHERE recordedBy IS NOT NULL AND ecdysis_id IS NOT NULL
GROUP BY recordedBy
ORDER BY recordedBy

-- _restoreSelectionSamples: fetch specimens by ID
SELECT ecdysis_id, year, month, scientificName, recordedBy, fieldNumber,
       host_observation_id, floralHost, inat_host, inat_quality_grade,
       specimen_observation_id, elevation_m
FROM occurrences
WHERE CAST(ecdysis_id AS TEXT) IN (${idList})
```

## Warnings

### WR-01: `_loadCollectorOptions` has no error handling — a query failure leaves `_collectorOptions` in a partially-cleared state

**File:** `frontend/src/bee-atlas.ts:378`

**Issue:** `_loadCollectorOptions` sets `this._collectorOptions = []` at line 383, then immediately fires the exec query. If the query throws, the empty array stays — which is incorrect (the old options are gone). There is no `try/catch`, so the error propagates to the caller (`_onDataLoaded` / `_onSampleDataLoaded`) which also has no catch for this call. The rejection is an unhandled promise rejection in production.

**Fix:**

```typescript
private async _loadCollectorOptions(): Promise<void> {
  await tablesReady;
  const { sqlite3, db } = await getDB();
  const newOptions: CollectorEntry[] = [];
  try {
    await sqlite3.exec(db, `...`, (rowValues, columnNames) => {
      // push to newOptions
    });
    this._collectorOptions = newOptions;  // only update on success
  } catch (err) {
    console.error('Failed to load collector options:', err);
    // leave _collectorOptions unchanged
  }
}
```

### WR-02: `_insertRows` in `sqlite.ts` does not roll back on step failure — transaction may be left open

**File:** `frontend/src/sqlite.ts:127`

**Issue:** `_insertRows` begins a transaction with `BEGIN` (line 127) and commits with `COMMIT` (line 141). If `sqlite3.step(stmt)` throws for any row (e.g., a type constraint violation), the `await sqlite3.exec(db, 'COMMIT')` is never reached. The transaction is left open; subsequent `BEGIN` calls will return `SQLITE_ERROR` ("cannot start a transaction within a transaction"), causing all subsequent insert/query operations to fail for the lifetime of the DB connection.

In the current codebase this is only called once at startup, so a failure here means the whole load fails (caught by the caller). However, if `_insertRows` is ever reused, an uncaught step error would silently corrupt the DB state.

**Fix:**

```typescript
await sqlite3.exec(db, 'BEGIN');
try {
  for await (const stmt of sqlite3.statements(db, sql)) {
    for (const row of rows) {
      sqlite3.bind_collection(stmt, cols.map(c => { /* ... */ }) as any);
      await sqlite3.step(stmt);
      sqlite3.reset(stmt);
    }
  }
  await sqlite3.exec(db, 'COMMIT');
} catch (err) {
  await sqlite3.exec(db, 'ROLLBACK').catch(() => {});
  throw err;
}
```

## Info

### IN-01: Unnecessary `(detail as any)` cast in `_onFilterChanged`

**File:** `frontend/src/bee-atlas.ts:615`

**Issue:** Lines 615–616 access `(detail as any).elevMin` and `(detail as any).elevMax`, but `FilterChangedEvent` (defined in `bee-sidebar.ts:61`) already declares both fields. The `as any` bypass is vestigial — possibly from before the fields were added to the interface.

**Fix:**

```typescript
// Before
elevMin: (detail as any).elevMin ?? null,
elevMax: (detail as any).elevMax ?? null,

// After
elevMin: detail.elevMin,
elevMax: detail.elevMax,
```

### IN-02: `console.log` benchmark output in production code path

**File:** `frontend/src/sqlite.ts:46,109-113`

**Issue:** `sqlite.ts` contains two `console.log` calls (lines 46 and 109–113) that emit timing and heap data on every page load. These are useful during development but noisy in production. The benchmark at line 106 also fires a no-op `SELECT COUNT(*)` purely to measure first-query latency.

**Fix:** Guard behind a dev-only flag or convert to `console.debug` (which is suppressible in production builds). The benchmark query at line 106 could be removed or wrapped in `if (import.meta.env.DEV)`.

---

_Reviewed: 2026-04-17T17:01:25Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
