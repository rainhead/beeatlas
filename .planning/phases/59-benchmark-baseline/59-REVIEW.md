---
phase: 59-benchmark-baseline
reviewed: 2026-04-16T00:00:00Z
depth: standard
files_reviewed: 2
files_reviewed_list:
  - BENCHMARK.md
  - frontend/src/duckdb.ts
findings:
  critical: 0
  warning: 3
  info: 1
  total: 4
status: issues_found
---

# Phase 59: Code Review Report

**Reviewed:** 2026-04-16
**Depth:** standard
**Files Reviewed:** 2
**Status:** issues_found

## Summary

Reviewed `BENCHMARK.md` (documentation, no code issues) and `frontend/src/duckdb.ts` (new DuckDB WASM initialization and benchmark instrumentation module). The module introduces several connection resource leaks: three separate connection handles are opened without `try/finally` guards, meaning exceptions during query execution will leave those connections unclosed. One additional concern is that the benchmark timing module-level variable `_benchmarkT0` is read by `loadAllTables` but only set by `_init`, with no guard against the case where they are called out of order.

`BENCHMARK.md` is a documentation artifact; no issues found there.

## Warnings

### WR-01: Connection leak in parquet table loading loop

**File:** `frontend/src/duckdb.ts:48-50`
**Issue:** Each loop iteration opens a connection with `db.connect()` but wraps neither the query nor the close in a `try/finally`. If `conn.query(...)` throws (e.g., network error fetching the parquet file, DuckDB internal error), `conn.close()` is never called. The GeoJSON block immediately below (lines 63–70) correctly uses `try/finally` for the same pattern; this block does not.
**Fix:**
```typescript
for (const [tableName, file] of [['ecdysis', 'ecdysis.parquet'], ['samples', 'samples.parquet']] as const) {
  await db.registerFileURL(file, `${baseUrl}/${file}`, DuckDBDataProtocol.HTTP, false);
  const conn = await db.connect();
  try {
    await conn.query(`CREATE TABLE ${tableName} AS SELECT * FROM '${file}'`);
  } finally {
    await conn.close();
  }
}
```

### WR-02: Connection leak in table-count debug block

**File:** `frontend/src/duckdb.ts:73-84`
**Issue:** `countConn` is opened on line 73 and closed on line 84, but there is no `try/finally`. If any of the four `countConn.query()` calls throw, the connection is leaked. This block runs in production (not test-only) so the leak would affect real users.
**Fix:**
```typescript
const countConn = await db.connect();
try {
  const ecdysisCount = await countConn.query('SELECT COUNT(*) as n FROM ecdysis');
  const samplesCount = await countConn.query('SELECT COUNT(*) as n FROM samples');
  const countiesCount = await countConn.query('SELECT COUNT(*) as n FROM counties');
  const ecoregionsCount = await countConn.query('SELECT COUNT(*) as n FROM ecoregions');
  console.debug('DuckDB table counts:',
    'ecdysis:', ecdysisCount.toArray()[0]?.toJSON(),
    'samples:', samplesCount.toArray()[0]?.toJSON(),
    'counties:', countiesCount.toArray()[0]?.toJSON(),
    'ecoregions:', ecoregionsCount.toArray()[0]?.toJSON(),
  );
} finally {
  await countConn.close();
}
```

### WR-03: Connection leak in benchmark first-query block

**File:** `frontend/src/duckdb.ts:91-95`
**Issue:** `qConn` is opened for the benchmark query but not guarded with `try/finally`. If `qConn.query('SELECT COUNT(*) FROM ecdysis')` throws, the connection is leaked.
**Fix:**
```typescript
const qConn = await db.connect();
try {
  await qConn.query('SELECT COUNT(*) FROM ecdysis');
} finally {
  await qConn.close();
}
```

## Info

### IN-01: `_benchmarkT0` has no guard against out-of-order calls

**File:** `frontend/src/duckdb.ts:34,98`
**Issue:** `_benchmarkT0` is set in `_init()` (line 34) and consumed in `loadAllTables()` (line 98). If `loadAllTables` is ever called without first awaiting `getDuckDB()` (which calls `_init`), `_benchmarkT0` remains 0 and the reported "tablesReady total time" will be a meaningless large number (current timestamp in ms since page load). The public API does not enforce that `getDuckDB()` must be called first.
**Fix:** Either document the calling contract explicitly, or initialize `_benchmarkT0` as `NaN` and add a guard in `loadAllTables`:
```typescript
let _benchmarkT0 = NaN;
// ...in loadAllTables, before the console.log:
if (!isNaN(_benchmarkT0)) {
  console.log(`[BENCHMARK] tablesReady: ${(tReady - _benchmarkT0).toFixed(0)} ms total from init start`, ...);
}
```

---

_Reviewed: 2026-04-16_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
