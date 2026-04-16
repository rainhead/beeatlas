# Phase 59: Benchmark Baseline - Pattern Map

**Mapped:** 2026-04-16
**Files analyzed:** 2 (1 modified, 1 new)
**Analogs found:** 1 / 2

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `frontend/src/duckdb.ts` | utility/service | async-init | itself (modification) | exact — this IS the file |
| `BENCHMARK.md` | artifact (static doc) | n/a | none | no analog |

## Pattern Assignments

### `frontend/src/duckdb.ts` (modification — add instrumentation)

**This file is its own analog.** The task is to add `performance.now()` and `performance.memory` calls inline.

**Existing module-level state pattern** (lines 7-12):
```typescript
let _dbPromise: Promise<DuckDBTypes.AsyncDuckDB> | null = null;

let _tablesReadyResolve: (() => void) | null = null;
export const tablesReady: Promise<void> = new Promise(resolve => {
  _tablesReadyResolve = resolve;
});
```
Copy this pattern for the new module-level timing variable. Add directly after line 7:
```typescript
let _benchmarkT0 = 0;
```

**Existing `_init()` body** (lines 14-25) — instrumentation insertions marked:
```typescript
async function _init(): Promise<DuckDBTypes.AsyncDuckDB> {
  // INSERT: const t0 = performance.now(); + mem0 snapshot HERE (line 15 top)
  const duckdb = await import('@duckdb/duckdb-wasm');
  const MANUAL_BUNDLES: DuckDBTypes.DuckDBBundles = {
    mvp: { mainModule: duckdb_wasm,    mainWorker: mvp_worker },
    eh:  { mainModule: duckdb_wasm_eh, mainWorker: eh_worker  },
  };
  const bundle = await duckdb.selectBundle(MANUAL_BUNDLES);
  const worker = new Worker(bundle.mainWorker!);
  const db = new duckdb.AsyncDuckDB(new duckdb.ConsoleLogger(), worker);
  await db.instantiate(bundle.mainModule, bundle.pthreadWorker);
  // INSERT: const t1 + mem1 snapshot + console.log + _benchmarkT0 = t0 HERE (before return)
  return db;
}
```

**Existing `loadAllTables()` tail** (lines 75-76) — instrumentation insertion point:
```typescript
  // INSERT: tReady + mem2 + first-query benchmark + console.log HERE (before _tablesReadyResolve call)
  if (_tablesReadyResolve) _tablesReadyResolve();
}
```

Note: The first-query benchmark MUST run before `_tablesReadyResolve()` is called — or alternatively after, since `tablesReady` is used by callers, not by `loadAllTables` itself. Either placement is correct; placing it before the resolve keeps the benchmark contained inside `loadAllTables`. The research recommendation is to run it after `_tablesReadyResolve()` and before the function returns, which is also fine.

**TypeScript cast pattern for `performance.memory`** (no existing analog in codebase — first use):
```typescript
const mem = (performance as unknown as { memory?: { usedJSHeapSize: number } }).memory;
const heapMB = (mem?.usedJSHeapSize ?? 0) / 1_048_576;
```
Use this pattern three times (mem0, mem1, mem2). Inline cast is preferred over a `.d.ts` file because the instrumentation is explicitly temporary (removed in Phase 61).

**Existing `console.debug` pattern** (lines 67-72):
```typescript
console.debug('DuckDB table counts:',
  'ecdysis:', ecdysisCount.toArray()[0]?.toJSON(),
  ...
);
```
The benchmark logs should use `console.log` (not `console.debug`) with the `[BENCHMARK]` prefix so they are visible without enabling verbose DevTools output and are easy to locate by searching the console.

**`noUnusedLocals: true` constraint** (confirmed in `frontend/tsconfig.json` line 22):
Every `const t0`, `const t1`, `const mem0MB`, etc. must be consumed by a `console.log(...)` call in the same scope. Declare timing variables only where they can be logged; do not declare a variable and log it from a different scope via module-level state (exception: `_benchmarkT0` is module-level by necessity because `_init()` and `loadAllTables()` are separate functions).

---

### `BENCHMARK.md` (new file — repo root)

**No analog in the codebase** — first benchmark artifact.

**Structure from RESEARCH.md** (lines 259-284 of 59-RESEARCH.md). The file is a static Markdown table with two columns (DuckDB WASM baseline | wa-sqlite after migration) and six metric rows:

| Metric | DuckDB WASM (Phase 59 baseline) | wa-sqlite (Phase 61 after migration) |
|--------|---------------------------------|---------------------------------------|
| WASM instantiate time (ms) | ___ | ___ |
| tablesReady total time (ms) | ___ | ___ |
| First-query latency (ms) | ___ | ___ |
| Heap before init (MB) | ___ | ___ |
| Heap after instantiate (MB) | ___ | ___ |
| Heap after tablesReady (MB) | ___ | ___ |

The Phase 59 baseline column is filled manually by the developer after running `npm run dev` in Chrome and reading the `[BENCHMARK]` console output. The wa-sqlite column remains `___` until Phase 61.

---

## Shared Patterns

### TypeScript `noUnusedLocals` compliance
**Source:** `frontend/tsconfig.json` line 22 (`"noUnusedLocals": true`)
**Apply to:** Every timing variable added to `frontend/src/duckdb.ts`

Every `const tX = performance.now()` and `const memXMB = ...` must appear in a `console.log(...)` call within the same function scope. The only exception is `_benchmarkT0` which is module-level state used to carry T0 from `_init()` into `loadAllTables()`.

### console.log prefix convention
**Source:** Lines 67-72 of `frontend/src/duckdb.ts` (existing `console.debug` pattern)
**Apply to:** All benchmark log calls

Use `[BENCHMARK]` prefix and `console.log` (not `console.debug`) so output is visible at default DevTools verbosity. Format timings as `${value.toFixed(0)} ms` and heap values as `${value.toFixed(1)} MB`.

---

## No Analog Found

| File | Role | Data Flow | Reason |
|------|------|-----------|--------|
| `BENCHMARK.md` | artifact | n/a | No prior benchmark or measurement document exists in the repo |

---

## Metadata

**Analog search scope:** `frontend/src/` (Grep for `performance.now` — no results)
**Files scanned:** `frontend/src/duckdb.ts`, `frontend/tsconfig.json`
**Pattern extraction date:** 2026-04-16
