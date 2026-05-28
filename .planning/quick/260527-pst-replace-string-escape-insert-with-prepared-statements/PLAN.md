---
slug: pst
title: Replace string-escape INSERT with wa-sqlite prepared statements
date: 2026-05-27
status: in_progress
---

# Replace string-escape INSERT with wa-sqlite prepared statements

## Goal

Eliminate 3.2M `_escapeSqlValue` calls and 186 large string allocations during the
INSERT phase in `src/sqlite-worker.ts`. The INSERT loop is currently the dominant cost
(~1229ms of the 2125ms load time).

## Context

- Current approach: 186 batches × string-build 500-row INSERT → `sqlite3.exec`
- wa-sqlite API confirmed: `prepare_v2` (async), `bind_collection` (sync), `step`
  (async), `reset` (async), `finalize` (async)
- `sqlite3.limit(db, 9, -1)` returns current `SQLITE_LIMIT_VARIABLE_NUMBER` (sync)
- SQLite 3.44.0 in the wa-sqlite build (limit is likely 32766, but query at runtime)

## Implementation

Replace `_insertRows` with a batched prepared-statement version:

```typescript
async function _insertRows(
  sqlite3: SQLiteAPI,
  db: number,
  table: string,
  rows: Record<string, unknown>[]
): Promise<void> {
  if (rows.length === 0) return;
  const cols = Object.keys(rows[0]!);

  const varLimit = sqlite3.limit(db, 9 /* SQLITE_LIMIT_VARIABLE_NUMBER */, -1);
  const BATCH = Math.max(1, Math.floor(varLimit / cols.length));

  const rowPlaceholder = '(' + cols.map(() => '?').join(',') + ')';
  const buildStmt = async (n: number) => {
    const sql = `INSERT INTO ${table} (${cols.join(',')}) VALUES ${Array(n).fill(rowPlaceholder).join(',')}`;
    return (await sqlite3.prepare_v2(db, sql))!.stmt;
  };

  await sqlite3.exec(db, 'BEGIN');
  try {
    const fullStmt = await buildStmt(BATCH);
    let remStmt: number | null = null;
    for (let i = 0; i < rows.length; i += BATCH) {
      const batch = rows.slice(i, i + BATCH);
      const stmt = batch.length === BATCH
        ? fullStmt
        : (remStmt ??= await buildStmt(batch.length));
      sqlite3.bind_collection(stmt, batch.flatMap(row => cols.map(c => row[c])));
      await sqlite3.step(stmt);
      await sqlite3.reset(stmt);
    }
    await sqlite3.finalize(fullStmt);
    if (remStmt !== null) await sqlite3.finalize(remStmt);
    await sqlite3.exec(db, 'COMMIT');
  } catch (err) {
    await sqlite3.exec(db, 'ROLLBACK').catch(() => {});
    throw err;
  }
}
```

## Tasks

- [ ] Replace `_insertRows` body with prepared-statement version
- [ ] Remove `_escapeSqlValue` function (unused after refactor)
- [ ] Remove `INSERT_BATCH` constant (unused after refactor)
- [ ] Update benchmark log: show dynamic BATCH size and batch count
- [ ] Run `npm test` — confirm no regressions (2 pre-existing failures in bee-atlas.test.ts are expected)
- [ ] Commit

## What stays

- `_serializedExec` / global `sqlite3.exec` override — still needed so concurrent
  message-handler `exec` calls don't race.
- All other benchmark logging unchanged.
