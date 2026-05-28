---
slug: pst
status: complete
date: 2026-05-27
commit: f4c1cd6
---

# Summary

Replaced string-escape batched INSERT in `src/sqlite-worker.ts` with wa-sqlite
prepared statements.

## What changed

- `_insertRows` now uses `sqlite3.limit(db, 9, -1)` to query the runtime variable
  limit, then prepares a multi-row INSERT statement sized to fit within that limit
  (typically 1 full-batch statement + 1 remainder statement = 2 total prepares).
- `bind_collection` (synchronous) fills params; `step`/`reset` (async) execute each batch.
- Removed `_escapeSqlValue` (3.2M calls eliminated) and `INSERT_BATCH` constant.
- Benchmark log now reports dynamic batch size: `batches: N (size M)`.
- `_serializedExec` retained — still needed to prevent concurrent exec races in the
  message handler.

## Expected win

The ~1229ms INSERT was dominated by 3.2M `_escapeSqlValue` calls and 186 large string
allocations. Prepared statements eliminate both. Async op count depends on the SQLite
variable limit: if 32766, batch size = 936 rows → ~100 batches (was 186 exec calls but
far heavier per call). If 999, batch size = 28 → ~3,315 step/reset pairs.

Measure in the browser to confirm.
