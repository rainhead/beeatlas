# Phase 59: Benchmark Baseline - Research

**Researched:** 2026-04-16
**Domain:** Browser performance measurement (performance.now, performance.memory) + DuckDB WASM init path instrumentation
**Confidence:** HIGH

## Summary

Phase 59 is a narrow instrumentation task with no user-visible output. The goal is to add `performance.now()` timestamps at three points inside `frontend/src/duckdb.ts` and record three `performance.memory.usedJSHeapSize` snapshots, then manually run the app in Chrome, read the console output, and commit the numbers into a new `BENCHMARK.md` at repo root.

All implementation decisions are fully locked in CONTEXT.md. The code change is approximately 10 lines of instrumentation in one file. The only technical subtleties are the TypeScript typing for `performance.memory` (non-standard, Chrome-only, absent from the standard `lib.dom.d.ts`) and choosing a first-query SQL that is fast but representative.

**Primary recommendation:** Cast `performance as any` or extend the `Performance` interface via a `.d.ts` declaration to access `.memory` without a TypeScript compile error. Use `SELECT COUNT(*) FROM ecdysis` as the first-query benchmark — it exercises the real query path without network I/O and matches the existing debug query already in `loadAllTables`.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D-01:** Capture two timing boundaries: (1) `_init()` start to `db.instantiate()` complete (WASM worker startup only); (2) `_init()` start to `tablesReady` resolve (full data load). Both needed to isolate WASM init cost from network/load cost.
- **D-02:** First-query latency = time to execute `SELECT COUNT(*) FROM ecdysis` (or similar fixed SQL) immediately after `tablesReady` resolves. Repeatable, no user interaction required.
- **D-03:** Use `performance.memory.usedJSHeapSize` (Chrome-only). Record at: before init, after `db.instantiate()`, after `tablesReady`. Document Chrome-only limitation in BENCHMARK.md.
- **D-04:** Add `performance.now()` timestamps inline in production `duckdb.ts` `_init()` and `loadAllTables()`. Instrumentation code removed in Phase 61.
- **D-05:** Record numbers in `BENCHMARK.md` at repo root. Two-column structure: DuckDB WASM (baseline) | wa-sqlite (after migration). Phase 59 fills baseline column only.

### Claude's Discretion
- Exact SQL query for first-query latency (SELECT COUNT(*) or a simple filter)
- Whether to `console.log` the measurements as well as recording them manually to BENCHMARK.md
- Number of measurement runs (single run is fine)

### Deferred Ideas (OUT OF SCOPE)
None — discussion stayed within phase scope.
</user_constraints>

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Timing instrumentation | Frontend (browser) | — | `performance.now()` is a browser API; measurements happen in the same execution context as the init path |
| Memory measurement | Frontend (browser) | — | `performance.memory` is a Chrome-specific extension to the browser Performance API |
| Benchmark artifact | Repo root (static file) | — | BENCHMARK.md is a developer reference document, not a deployed artifact |

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `performance.now()` | Browser built-in (W3C High Resolution Time L2) | Monotonic sub-millisecond timing | Standard API, available in all modern browsers, no import needed |
| `performance.memory` | Chrome-only non-standard extension | Heap size snapshots | Only option for JS heap measurement without external tooling; already decided in D-03 |
| `@duckdb/duckdb-wasm` | 1.33.1-dev20.0 (already installed) | The system being measured | No change to dependency |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `console.log` / `console.debug` | Browser built-in | Emit measured values to DevTools console | So the developer can read numbers without opening DevTools Performance panel |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `performance.memory.usedJSHeapSize` | Chrome DevTools Memory panel (manual heap snapshot) | DevTools panel gives more detail but requires manual steps; `performance.memory` is sufficient for a single-run baseline |
| Inline instrumentation in production code | Separate benchmark harness / test file | Harness wouldn't measure real Vite+worker wiring cost; inline is correct per D-04 |

**Installation:** No new packages needed. All APIs are browser built-ins.

## Architecture Patterns

### System Architecture Diagram

```
Page load
    │
    ▼
getDuckDB()  ──────────────────────────────────────────────┐
    │                                                       │
    ▼  [T0: _init() start, MEM0: heap before]              │
_init()                                                     │
    │                                                       │
    ▼  [import + selectBundle + new Worker]                 │
db.instantiate()                                            │
    │                                                       │
    ▼  [T1: instantiate complete, MEM1: heap after WASM]   │
    return db                                               │
                                                            │
    ▼  (caller: bee-atlas.ts)                               │
loadAllTables(db, baseUrl)                                  │
    │                                                       │
    ▼  [parquet HTTP fetch + CREATE TABLE x2]               │
    │  [GeoJSON fetch + registerFileBuffer]                 │
    │  [CREATE TABLE counties, ecoregions]                  │
    │                                                       │
    ▼  [T2: tablesReady resolve, MEM2: heap after tables]  │
_tablesReadyResolve()                                       │
    │                                                       │
    ▼  [first-query benchmark: SELECT COUNT(*) FROM ecdysis]│
conn.query(SQL)  ──── T3: query complete ──────────────────┘
    │
    ▼
console.log(T1-T0, T2-T0, T3-T2, MEM0, MEM1, MEM2)
    │
    ▼  [developer reads console, fills BENCHMARK.md]
BENCHMARK.md (repo root, committed)
```

### Recommended Project Structure
No new directories. Changes confined to:
```
frontend/src/duckdb.ts    # instrumentation added (removed in Phase 61)
BENCHMARK.md              # new file at repo root, filled manually after run
```

### Pattern 1: performance.now() Bracketing
**What:** Record a timestamp before and after an async operation; subtract to get elapsed ms.
**When to use:** Any async boundary where wall-clock cost matters.
**Example:**
```typescript
// Source: W3C High Resolution Time Level 2 spec (browser built-in)
const t0 = performance.now();
await someAsyncOperation();
const t1 = performance.now();
console.log(`Operation took ${(t1 - t0).toFixed(1)} ms`);
```

### Pattern 2: performance.memory Access (TypeScript workaround)
**What:** `performance.memory` is absent from the standard TypeScript `lib.dom.d.ts` because it is a Chrome non-standard extension. Two approaches compile cleanly.
**When to use:** When you need heap snapshots in a Chrome-only dev workflow.

Option A — inline cast (minimal, suits temporary instrumentation):
```typescript
// Source: [ASSUMED] — standard TypeScript workaround pattern
const mem = (performance as unknown as { memory: { usedJSHeapSize: number } }).memory;
const heapMB = mem ? (mem.usedJSHeapSize / 1_048_576).toFixed(1) : 'n/a';
```

Option B — ambient declaration file (cleaner, but adds a file for temporary code):
```typescript
// frontend/src/performance-memory.d.ts
interface Performance {
  readonly memory?: {
    readonly usedJSHeapSize: number;
    readonly totalJSHeapSize: number;
    readonly jsHeapSizeLimit: number;
  };
}
```

**Recommendation:** Option A (inline cast). This instrumentation is explicitly temporary (removed in Phase 61). Adding a `.d.ts` file creates a file to delete later; an inline cast leaves no trace in the type system.

### Pattern 3: First-Query Benchmark After tablesReady
**What:** `tablesReady` resolves before the first-query measurement begins, so the measurement is isolated to query execution time only (no table creation cost).
**Example:**
```typescript
// After _tablesReadyResolve() call in loadAllTables:
const tQueryStart = performance.now();
const qConn = await db.connect();
await qConn.query('SELECT COUNT(*) FROM ecdysis');
await qConn.close();
const tQueryEnd = performance.now();
console.log(`First-query latency: ${(tQueryEnd - tQueryStart).toFixed(1)} ms`);
```

Note: `db` must be passed into `loadAllTables` — it already is (function signature is `loadAllTables(db, baseUrl)`).

### Anti-Patterns to Avoid
- **Measuring from module import time:** The `tablesReady` promise is created at module load, before `_init()` is called. T0 must be set inside `_init()`, not at module level.
- **Using `Date.now()` instead of `performance.now()`:** `Date.now()` is ms-precision and subject to system clock adjustments. `performance.now()` is sub-ms and monotonic. [VERIFIED: MDN — performance.now() returns a DOMHighResTimeStamp]
- **Reading `performance.memory` in a non-Chrome browser:** Returns `undefined`. Guard with `if (mem)` or `?? 'n/a'` to avoid runtime errors in other environments.
- **Forgetting that `noUnusedLocals: true` is enabled:** All declared timing variables must be used (passed to `console.log`) or TypeScript will refuse to compile. Since the tsconfig has strict mode + `noUnusedLocals`, every `const t0 = ...` must appear in the log output.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Timing measurement | Custom clock | `performance.now()` | W3C standard, sub-millisecond, monotonic, available in all modern browsers |
| Memory measurement | Custom allocator tracking | `performance.memory.usedJSHeapSize` | Already decided in D-03; no alternative is feasible for a one-time dev measurement |

## Common Pitfalls

### Pitfall 1: TypeScript compile error on `performance.memory`
**What goes wrong:** `Property 'memory' does not exist on type 'Performance'` — strict TypeScript rejects the access.
**Why it happens:** `performance.memory` is a Chrome proprietary extension not in `lib.dom.d.ts`.
**How to avoid:** Use the inline cast in Pattern 2, Option A.
**Warning signs:** `tsc` or `vite build` fails immediately after adding `performance.memory`.

### Pitfall 2: Unused variable compile error
**What goes wrong:** TypeScript rejects `const t0 = performance.now()` if `t0` is never referenced.
**Why it happens:** `noUnusedLocals: true` in `tsconfig.json`.
**How to avoid:** Ensure every timing variable is passed to `console.log(...)` in the same scope.
**Warning signs:** TypeScript error on the variable declaration line.

### Pitfall 3: T0 placed too early (before `_init()` is actually called)
**What goes wrong:** `getDuckDB()` is called lazily (first call from `bee-atlas.ts`); if T0 is at module level, it captures page-load time, not init start time.
**Why it happens:** `_dbPromise` is `null` until first `getDuckDB()` call.
**How to avoid:** Place `const t0 = performance.now()` as the first line inside `async function _init()`.
**Warning signs:** Reported WASM instantiate time is implausibly long (includes time before user interaction).

### Pitfall 4: Memory values reported in bytes without conversion
**What goes wrong:** `usedJSHeapSize` is in bytes; reporting raw values (e.g., 52428800) in BENCHMARK.md is hard to read.
**Why it happens:** The API returns bytes by spec.
**How to avoid:** Divide by `1_048_576` and format as MB with one decimal place before logging.
**Warning signs:** Console shows 8-digit numbers instead of ~50 MB style values.

### Pitfall 5: First-query opens a new connection (cold vs warm)
**What goes wrong:** Opening a new `db.connect()` after tablesReady may include connection setup time that won't recur in real usage.
**Why it happens:** Connection pooling semantics in DuckDB WASM are not clearly documented.
**How to avoid:** This is acceptable for a baseline — the goal is a repeatable, comparable number. The same approach will be used for the wa-sqlite baseline in Phase 61. Document in BENCHMARK.md that the query uses a fresh connection.
**Warning signs:** N/A — this is an acceptable known limitation, not an error.

## Code Examples

### Instrumented _init() function
```typescript
// Source: inline — instrumentation of existing duckdb.ts pattern
async function _init(): Promise<DuckDBTypes.AsyncDuckDB> {
  const t0 = performance.now();
  const mem0MB = ((performance as unknown as { memory?: { usedJSHeapSize: number } }).memory?.usedJSHeapSize ?? 0) / 1_048_576;

  const duckdb = await import('@duckdb/duckdb-wasm');
  const MANUAL_BUNDLES: DuckDBTypes.DuckDBBundles = {
    mvp: { mainModule: duckdb_wasm,    mainWorker: mvp_worker },
    eh:  { mainModule: duckdb_wasm_eh, mainWorker: eh_worker  },
  };
  const bundle = await duckdb.selectBundle(MANUAL_BUNDLES);
  const worker = new Worker(bundle.mainWorker!);
  const db = new duckdb.AsyncDuckDB(new duckdb.ConsoleLogger(), worker);
  await db.instantiate(bundle.mainModule, bundle.pthreadWorker);

  const t1 = performance.now();
  const mem1MB = ((performance as unknown as { memory?: { usedJSHeapSize: number } }).memory?.usedJSHeapSize ?? 0) / 1_048_576;
  console.log(`[BENCHMARK] WASM instantiate: ${(t1 - t0).toFixed(0)} ms | heap: ${mem0MB.toFixed(1)} → ${mem1MB.toFixed(1)} MB`);

  // Store t0 for tablesReady measurement in loadAllTables
  _benchmarkT0 = t0;

  return db;
}
```

Note: `_benchmarkT0` needs to be a module-level variable (e.g., `let _benchmarkT0 = 0`) so `loadAllTables` can compute the total elapsed time from init start.

### Instrumented loadAllTables() tail (after _tablesReadyResolve)
```typescript
// At the end of loadAllTables(), after _tablesReadyResolve():
const tReady = performance.now();
const mem2MB = ((performance as unknown as { memory?: { usedJSHeapSize: number } }).memory?.usedJSHeapSize ?? 0) / 1_048_576;

const tQueryStart = performance.now();
const qConn = await db.connect();
await qConn.query('SELECT COUNT(*) FROM ecdysis');
await qConn.close();
const tQueryEnd = performance.now();

console.log(
  `[BENCHMARK] tablesReady: ${(tReady - _benchmarkT0).toFixed(0)} ms total from init start`,
  `| heap after tables: ${mem2MB.toFixed(1)} MB`,
  `| first-query latency: ${(tQueryEnd - tQueryStart).toFixed(0)} ms`,
);
```

### BENCHMARK.md template
```markdown
# BeeAtlas Performance Benchmark

Measures the DuckDB WASM initialization and query path.
Recorded manually from Chrome DevTools console after running `npm run dev`.
All timings: wall-clock milliseconds via `performance.now()`.
Memory: Chrome-only `performance.memory.usedJSHeapSize`, reported in MB.
A fresh connection is opened for the first-query latency measurement.

## Results

| Metric | DuckDB WASM (Phase 59 baseline) | wa-sqlite (Phase 61 after migration) |
|--------|---------------------------------|---------------------------------------|
| WASM instantiate time (ms) | ___ | ___ |
| tablesReady total time (ms) | ___ | ___ |
| First-query latency (ms) | ___ | ___ |
| Heap before init (MB) | ___ | ___ |
| Heap after instantiate (MB) | ___ | ___ |
| Heap after tablesReady (MB) | ___ | ___ |

## Notes

- Measured on: [machine / Chrome version / date]
- Network: [local dev server — no real network latency]
- Data files: ecdysis.parquet, samples.parquet, counties.geojson, ecoregions.geojson
```

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest 4.1.2 |
| Config file | `frontend/vite.config.ts` (test section) |
| Quick run command | `cd frontend && npm test` |
| Full suite command | `cd frontend && npm test` |

### Phase Requirements → Test Map

This phase has no functional requirements — it is a measurement-only phase. The "success criteria" are:
1. Numbers are captured and committed to BENCHMARK.md
2. The instrumentation code compiles without TypeScript errors
3. The instrumented app runs without runtime errors

| Behavior | Test Type | Notes |
|----------|-----------|-------|
| TypeScript compiles cleanly | Automated (tsc via vite build) | Run `cd frontend && npm run build` to verify |
| Instrumentation does not break existing tests | Automated (Vitest) | Existing test suite passes with `npm test` |
| Numbers recorded in BENCHMARK.md | Manual | Developer runs app in Chrome, reads console, fills BENCHMARK.md |

### Wave 0 Gaps
None — existing test infrastructure covers all phase requirements. No new test files needed for this phase.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | The inline `(performance as unknown as {...}).memory` cast pattern compiles cleanly under the project's strict TypeScript config | Architecture Patterns, Pattern 2 | TypeScript error at build time; fallback is ambient `.d.ts` declaration (Option B in Pattern 2) |
| A2 | `SELECT COUNT(*) FROM ecdysis` executes in under 1 second after tablesReady (making it a practical first-query benchmark) | Code Examples | If it takes longer, a lighter query like `SELECT 1` should be substituted; but count queries on in-memory tables are typically sub-100ms |

## Open Questions

1. **Should the console output prefix `[BENCHMARK]` to make it easy to find?**
   - What we know: The existing debug output uses `console.debug('DuckDB table counts:', ...)` without a prefix.
   - What's unclear: Whether a distinct prefix helps or creates noise.
   - Recommendation: Yes — use `[BENCHMARK]` prefix so the developer can search the console output unambiguously. Low cost, high findability.

2. **Should `_benchmarkT0` be a module-level variable or passed as a parameter?**
   - What we know: `loadAllTables` receives `db` and `baseUrl` as parameters; `_init()` and `loadAllTables` are in the same module.
   - What's unclear: Whether passing timing state through module-level variables is acceptable for temporary instrumentation.
   - Recommendation: Module-level `let _benchmarkT0 = 0` is acceptable — this is temporary dev instrumentation, not production state architecture. The alternative (passing `t0` as a parameter to `loadAllTables`) would require changing the exported function signature, which is a larger change.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Chrome browser | `performance.memory` measurement | Assumed available on developer machine | Any modern Chrome | No fallback — `performance.memory` is Chrome-only. Other browsers will log `0 MB` for heap values (guarded with `?? 0`). |
| `frontend/src/duckdb.ts` | Instrumentation target | ✓ | Current | — |
| Vitest | TypeScript compile validation | ✓ | 4.1.2 | — |

**Missing dependencies with no fallback:**
- Chrome is required to capture real `performance.memory` values. The code will compile and run in other browsers, but heap values will be `0`. Document in BENCHMARK.md that measurement must be taken in Chrome.

## Sources

### Primary (HIGH confidence)
- `frontend/src/duckdb.ts` — actual source being instrumented, read directly
- `frontend/tsconfig.json` — confirms `noUnusedLocals: true` and strict mode (pitfall verification)
- `frontend/package.json` — confirms DuckDB WASM version 1.33.1-dev20.0 and Vitest 4.1.2

### Secondary (MEDIUM confidence)
- W3C High Resolution Time Level 2 — `performance.now()` specification [CITED: https://www.w3.org/TR/hr-time-2/]
- MDN `performance.now()` — confirms sub-millisecond, monotonic [CITED: https://developer.mozilla.org/en-US/docs/Web/API/Performance/now]
- Chrome `performance.memory` — Chrome proprietary, not in TypeScript lib.dom.d.ts [CITED: https://developer.chrome.com/docs/devtools/memory-problems/memory-101]

### Tertiary (LOW confidence / ASSUMED)
- TypeScript inline cast pattern for non-standard APIs [ASSUMED] — standard community practice but not verified against this specific tsconfig in this session

## Metadata

**Confidence breakdown:**
- Instrumentation approach: HIGH — source file read directly, API well-understood
- TypeScript cast pattern: MEDIUM — standard pattern, unverified against this exact tsconfig
- `performance.memory` Chrome availability: HIGH — Chrome-only is well-documented

**Research date:** 2026-04-16
**Valid until:** 2026-10-16 (stable APIs — performance.now is long-established; DuckDB WASM version pinned in package.json)
