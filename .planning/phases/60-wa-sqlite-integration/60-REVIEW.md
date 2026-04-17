---
phase: 60-wa-sqlite-integration
reviewed: 2026-04-16T00:00:00Z
depth: standard
files_reviewed: 8
files_reviewed_list:
  - frontend/src/sqlite.ts
  - frontend/src/bee-atlas.ts
  - frontend/src/features.ts
  - frontend/src/filter.ts
  - frontend/src/wa-sqlite.d.ts
  - frontend/vite.config.ts
  - frontend/src/tests/filter.test.ts
  - frontend/src/tests/bee-atlas.test.ts
findings:
  critical: 2
  warning: 4
  info: 3
  total: 9
status: issues_found
---

# Phase 60: Code Review Report

**Reviewed:** 2026-04-16
**Depth:** standard
**Files Reviewed:** 8
**Status:** issues_found

## Summary

This phase integrates wa-sqlite (Asyncify-based WASM) to replace hyparquet + DuckDB-WASM for
in-browser SQL queries. The architecture is sound: a singleton DB promise, a serialized exec
queue to handle Asyncify concurrency limits, and a `tablesReady` gate that lets callers await
table population before issuing queries. Filter SQL is built via string interpolation with
single-quote escaping and a column allowlist — mostly safe, but two injection paths remain open.
The test suite covers SQL generation well; cross-module integration paths are appropriately mocked.

Two critical injection issues stand out. Four warnings address logic gaps that can produce
incorrect results or silent failures. Three info items flag minor quality concerns.

---

## Critical Issues

### CR-01: SQL injection via unvalidated `yearFrom` / `yearTo` in `buildFilterSQL`

**File:** `frontend/src/filter.ts:244-251`

**Issue:** `f.yearFrom` and `f.yearTo` are typed as `number | null` but are interpolated directly
into SQL without any runtime validation that the value is actually an integer. The values come
from URL params (`parseParams`) and from `FilterChangedEvent` dispatched by child components. If
either is a non-integer number (e.g., `NaN`, `1e308`, `1.5`) or if the type assertion in the
event handler coerces a non-numeric string, the generated SQL will be malformed or — in the
event of a bug in a calling component — inject arbitrary SQL tokens.

Specifically in `bee-atlas.ts:615`, `elevMin` and `elevMax` are extracted with `(detail as any).elevMin`
casting, suggesting similar risk if a component sends an unexpected value.

```typescript
// Current — no runtime guard
if (f.yearFrom !== null) {
  ecdysisClauses.push(`year >= ${f.yearFrom}`);
  samplesClauses.push(`CAST(strftime('%Y', date) AS INTEGER) >= ${f.yearFrom}`);
}
```

**Fix:** Add an integer guard before interpolation:

```typescript
if (f.yearFrom !== null) {
  const y = Math.trunc(f.yearFrom);
  if (!Number.isFinite(y)) throw new Error(`Invalid yearFrom: ${f.yearFrom}`);
  ecdysisClauses.push(`year >= ${y}`);
  samplesClauses.push(`CAST(strftime('%Y', date) AS INTEGER) >= ${y}`);
}
// Same pattern for yearTo, elevMin, elevMax
```

Month values (derived from a `Set<number>`) are joined raw at line 255-256 and should get the
same treatment.

---

### CR-02: SQL injection via `idList` string construction in `_restoreSelectionSamples`

**File:** `frontend/src/bee-atlas.ts:756`

**Issue:** Even though ecdysis IDs are filtered with `/^\d+$/` at line 743 and again at line
748, the filtered IDs are then wrapped in single-quotes and concatenated into the SQL string:

```typescript
const idList = safeIds.map(id => `'${id}'`).join(',');
...
WHERE CAST(ecdysis_id AS TEXT) IN (${idList})
```

`ecdysis_id` is an INTEGER column; quoting integer values as strings causes SQLite to perform
implicit type coercion (`CAST(ecdysis_id AS TEXT)`), which works but is unnecessary. More
importantly, the pattern sets a dangerous precedent: the double regex guard (lines 743 and 748)
is the only thing standing between URL input and a SQL literal. The redundant second guard (line
748) suggests the author was uncertain this was safe — and indeed, if the regex ever widens or is
removed, injection opens up.

**Fix:** Use unquoted integer literals directly (the regex already guarantees digits-only strings):

```typescript
const idList = safeIds.join(',');
// ...
WHERE ecdysis_id IN (${idList})
```

This avoids the TEXT cast, is semantically correct for an INTEGER primary key, and removes the
single-quote wrapping that the double-guard was compensating for.

---

## Warnings

### WR-01: `_insertRows` does not commit on error — transaction left open on exception

**File:** `frontend/src/sqlite.ts:141-155`

**Issue:** `BEGIN` is issued at line 141, but if any `step` or `reset` call throws, `COMMIT` at
line 155 is never reached. wa-sqlite's in-memory VFS does not persist, so a leaked transaction
does not corrupt durable state, but all subsequent `exec` calls on the same `db` handle will
silently execute inside the open transaction. Since `_serializedExec` queues callers, an
aborted `BEGIN` will block or corrupt every subsequent query (`queryVisibleIds`, table queries,
summary queries) with subtle wrong-result bugs rather than clear errors.

**Fix:** Wrap the loop in try/finally:

```typescript
await sqlite3.exec(db, 'BEGIN');
try {
  for await (const stmt of sqlite3.statements(db, sql)) {
    for (const row of rows) {
      sqlite3.bind_collection(stmt, /* ... */);
      await sqlite3.step(stmt);
      sqlite3.reset(stmt);
    }
  }
  await sqlite3.exec(db, 'COMMIT');
} catch (err) {
  await sqlite3.exec(db, 'ROLLBACK');
  throw err;
}
```

---

### WR-02: `_loadSummaryFromSQLite` sets `_loading = false` on early-return path, masking an empty-table condition

**File:** `frontend/src/bee-atlas.ts:322`

**Issue:** When the summary query returns no rows (`summaryRow` has no keys), the method sets
`this._loading = false` and returns without populating `_summary`, `_taxaOptions`,
`_countyOptions`, or `_ecoregionOptions`. The UI will show an empty toolbar with no error
message. This silently succeeds on an empty or failed load — the user sees a spinner-free
but empty interface with no explanation.

**Fix:** Either set `_error` to indicate that data failed to load, or assert that the query
should always return one row (which is true for a `SELECT COUNT(*)` without GROUP BY):

```typescript
if (Object.keys(summaryRow).length === 0) {
  this._error = 'No data returned from database. The data files may be missing or corrupt.';
  this._loading = false;
  return;
}
```

---

### WR-03: `_loadSummaryFromSQLite` errors are swallowed silently without setting `_error`

**File:** `frontend/src/bee-atlas.ts:370-375`

**Issue:** The `catch` block logs the error but never sets `this._error`. If SQLite throws
during the summary or taxa queries (e.g., schema mismatch after a data pipeline change),
the app will appear to finish loading (spinner gone, `_loading = false` in `finally`) but
display no data and no error message. Users will see an empty map with no explanation.

**Fix:**

```typescript
} catch (err) {
  const code = (err as any)?.code;
  console.error('Failed to load summary from SQLite:', err, code !== undefined ? `(SQLite error code ${code})` : '');
  this._error = err instanceof Error ? err.message : String(err);
} finally {
  this._loading = false;
}
```

---

### WR-04: `_insertRows` column list derived from first row — mismatched schema if parquet rows have inconsistent keys

**File:** `frontend/src/sqlite.ts:137`

**Issue:** Column names are extracted from `Object.keys(rows[0]!)`. If any subsequent row has
keys in a different order (possible after parquet column pruning or schema evolution), those
rows will be inserted with wrong column alignment. `bind_collection` receives values positionally
mapped to `cols` derived from row 0, but row N is iterated with the same `cols` list, which is
fine as long as every row has the same keys in the same order. JavaScript object key order is
insertion-order for string keys in V8, and `parquetReadObjects` should produce consistent
column order, so this is low-probability in practice — but if it ever fires, the corruption is
silent.

**Fix:** Validate key sets are consistent, or use a more defensive mapping:

```typescript
for (const row of rows) {
  sqlite3.bind_collection(stmt, cols.map(c => {
    const v = row[c];  // explicit keyed lookup — already done; keep this
    // ...
  }) as any);
}
```

The current code actually does use `cols.map(c => row[c])` (keyed lookup), so this is safe as
long as `cols` contains the superset of all needed column names. The real risk is if a row is
missing a key that appears in `cols` — the lookup returns `undefined`, which the null-coalesce
on line 146 (`if (v == null) return null`) will handle correctly. Risk is low; flag as a
robustness note for future schema evolution handling.

---

## Info

### IN-01: Redundant double regex guard in `_restoreSelectionSamples`

**File:** `frontend/src/bee-atlas.ts:743` and `748`

**Issue:** `/^\d+$/` is applied twice to `ecdysisIds` — once at line 743 (inside the `.filter`
that builds `ecdysisIds`) and again at line 748 (building `safeIds` from the already-filtered
array). The second guard is dead code — `ecdysisIds` already contains only digit strings.

**Fix:** Remove the second `.filter`:

```typescript
const ecdysisIds = occIds
  .filter(id => id.startsWith('ecdysis:'))
  .map(id => id.slice('ecdysis:'.length))
  .filter(id => /^\d+$/.test(id));
if (ecdysisIds.length === 0) return;
// Use ecdysisIds directly — no need for safeIds
const idList = ecdysisIds.join(',');
```

---

### IN-02: `console.log` benchmark output left in production path

**File:** `frontend/src/sqlite.ts:46` and `123-127`

**Issue:** `[BENCHMARK]` log lines use `console.log` (not `console.debug`) and will appear in
production browser consoles. `console.debug` would be suppressed at the default log level in
most production environments. The benchmark data is useful during development but noisy in
production.

**Fix:** Change `console.log` to `console.debug` for benchmark lines, or gate them on
`import.meta.env.DEV`.

---

### IN-03: `wa-sqlite.d.ts` types all wa-sqlite APIs as `any`

**File:** `frontend/src/wa-sqlite.d.ts:1-13`

**Issue:** The ambient declaration types the factory return and all SQLite API methods as `any`.
This means `sqlite3.exec`, `sqlite3.statements`, `sqlite3.bind_collection`, `sqlite3.step`,
and `sqlite3.reset` are all untyped throughout the codebase. Type errors in call sites (e.g.,
wrong argument counts, missing callbacks) will not be caught at compile time.

**Fix:** This is a known limitation of the wa-sqlite package (no bundled types). For now,
consider adding minimal types for the methods actually used:

```typescript
interface SQLiteAPI {
  exec(db: number, sql: string, callback?: (rowValues: unknown[], columnNames: string[]) => void): Promise<void>;
  statements(db: number, sql: string): AsyncIterable<number>;
  bind_collection(stmt: number, values: (unknown)[]): void;
  step(stmt: number): Promise<number>;
  reset(stmt: number): void;
  open_v2(filename: string): Promise<number>;
  vfs_register(vfs: unknown, makeDefault?: boolean): void;
}
```

---

_Reviewed: 2026-04-16_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
