# Phase 122: Worker GeoJSON Aggregation - Research

**Researched:** 2026-05-27
**Domain:** wa-sqlite worker performance, WASM-to-JS boundary crossing, transferable ArrayBuffers
**Confidence:** HIGH

## Summary

The current `sqlite-worker.ts` geo query fires a JS callback 92,802 times — once per row — via `sqlite3.exec(..., (row) => rows.push(row))`. Each callback is a WASM→JS boundary crossing. Measured cost in Firefox: 560–570 ms. The fix is to push aggregation into SQL using `json_group_array(json_object(...))` so SQLite returns a single TEXT row, yielding exactly one callback crossing. The JSON string is then encoded to a `Uint8Array` in the worker, transferred zero-copy as a transferable `ArrayBuffer` across the worker→main boundary, and decoded on the main thread.

The wa-sqlite `exec` API has **no batch-return mode** — the callback is the only row-delivery mechanism. However, this does not matter once aggregation is moved into SQL, because the aggregated query returns exactly one row.

The `loadOccurrenceGeoJSON (worker→main transfer): ~100–113 ms` cost recorded in benchmarks is structured-clone overhead on the GeoJSON FeatureCollection object graph (~92K features × properties). Transferring an `ArrayBuffer` instead eliminates that overhead entirely, replacing it with `TextEncoder.encode` in the worker (~5–15 MB) plus `JSON.parse` on the main thread. Both operations are single-pass and typically faster than structured clone of a large object graph; they also avoid creating the intermediate JS feature array in the worker heap before transfer.

The `_buildGeoJSONFromSQL` function moves from the worker to the main thread. The wire protocol changes: `geojson-result` currently carries `result` (a structured JS object); under this plan it carries `buffer` (a transferable `ArrayBuffer`) plus `byteLength`. The main thread decodes the buffer with `TextDecoder` and parses the JSON, then runs the equivalent of `_buildGeoJSONFromSQL` to produce the same `{ geojson, summary, taxaOptions }` shape.

**Primary recommendation:** Replace the per-row exec callback with a single `json_group_array(json_object(...))` aggregate query; transfer result as a transferable `ArrayBuffer`; decode and build GeoJSON on the main thread.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| SQL aggregation | Worker (WASM) | — | Runs inside SQLite WASM; zero JS involvement until final callback |
| JSON serialization | Worker (JS) | — | TextEncoder runs in worker thread, off main thread |
| ArrayBuffer transfer | Worker→Main boundary | — | postMessage transferList, zero-copy |
| GeoJSON build + taxonomy | Main thread (JS) | — | Moves here from worker; main thread parses JSON, builds feature array |
| Benchmark logging | Worker | Main thread (wall time) | No change from Phase 121 |

## Standard Stack

No new packages are introduced by this phase. All changes are to existing source files using APIs already present.

| Library | Version | Purpose | Status |
|---------|---------|---------|--------|
| wa-sqlite | 1.0.0 (latest) | SQLite in WASM with JS exec API | Already installed [VERIFIED: npm registry] |
| TextEncoder / TextDecoder | Web platform | UTF-8 encode/decode of JSON string | Built-in; no import needed |

## Package Legitimacy Audit

No packages are installed by this phase. Audit not applicable.

## Architecture Patterns

### System Architecture Diagram

```
Worker boot path (unchanged):
  fetch occurrences.db
  MemoryVFS seed → open_v2
           |
           v
  sqlite3.exec(db, GEO_AGG_SQL)     <-- one WASM→JS callback (was 92,802)
           |
           v
  single TEXT row: '[ {"lat":..., ...}, ... ]'
           |
           v
  TextEncoder.encode(jsonStr)  →  Uint8Array
           |
           v
  postMessage({ kind:'tables-ready', ... })    (worker still fires tables-ready)

'build-geojson' message path (changed):
  main→worker: { kind: 'build-geojson', id }
  worker: grab cached Uint8Array (or re-encode if needed)
  worker→main: postMessage({ kind:'geojson-result', id, buffer }, [buffer])
                                                              ^^^^^^^^^
                                                           transferList — zero copy
           |
           v
  main thread: TextDecoder.decode(buffer) → JSON.parse → _buildGeoJSONFromMain
```

### Recommended Project Structure

No structural changes. Only `src/sqlite-worker.ts` and `src/sqlite.ts` are modified.

### Pattern 1: SQL Aggregation to Single JSON Row

**What:** `json_group_array` + `json_object` fold N rows into one TEXT row entirely inside the SQLite WASM engine. The JS callback fires exactly once.

**When to use:** Whenever the full result set must cross the WASM→JS boundary and the number of rows is large.

**Verified:** `json_group_array` and `json_object` are built-in SQLite aggregate/scalar functions available since SQLite 3.38 (2022-02-22). wa-sqlite ^1.0.0 ships SQLite 3.46+ [ASSUMED — version embedded in wasm not checked here; json_group_array has been present since 3.9.0 (2015), so this is safe].

```typescript
// Source: src/sqlite-worker.ts (current) + SQLite docs json_group_array
const GEO_AGG_SQL =
  "SELECT json_group_array(json_object(" +
  "  'lat', lat, 'lon', lon," +
  "  'ecdysis_id', ecdysis_id," +
  "  'observation_id', observation_id," +
  "  'specimen_observation_id', specimen_observation_id," +
  "  'year', year," +
  "  'scientificName', scientificName," +
  "  'genus', genus," +
  "  'family', family," +
  "  'source', source" +
  ")) AS rows_json " +
  "FROM occurrences WHERE lat IS NOT NULL AND lon IS NOT NULL";

const geoRows: [string][] = [];
await sqlite3.exec(db, GEO_AGG_SQL, (row) => {
  geoRows.push(row as [string]);
});
// geoRows.length === 1; geoRows[0][0] is the full JSON string
const jsonStr = geoRows[0][0] as string;
```

### Pattern 2: Transferable ArrayBuffer via postMessage

**What:** Convert the JSON string to `Uint8Array` in the worker; pass the underlying `ArrayBuffer` in the postMessage transfer list. The main thread decodes with `TextDecoder`.

**When to use:** Any large blob crossing a worker boundary where structured clone would be expensive.

```typescript
// Worker side — after getting jsonStr from SQL:
const encoded: Uint8Array = new TextEncoder().encode(jsonStr);
const buffer: ArrayBuffer = encoded.buffer;
// Transfer ownership — buffer becomes detached in worker after this call
self.postMessage({ kind: 'geojson-result', id, buffer }, [buffer]);

// Main thread (sqlite.ts) — in the 'geojson-result' handler:
// e.data = { kind, id, buffer: ArrayBuffer }
const jsonStr = new TextDecoder().decode(msg.buffer as ArrayBuffer);
const parsed = JSON.parse(jsonStr) as RawRow[];
// pass to _buildGeoJSONFromMain(parsed)
```

The `postMessage` second argument `[buffer]` is the transfer list. [VERIFIED: MDN Web Docs — Worker.postMessage transferable objects]

### Pattern 3: Named vs Positional Column Access

**What:** `json_object('key', col)` embeds column names in the JSON. The receiver accesses values by name (`row.lat`) rather than position (`r[0]`).

**Impact on `_buildGeoJSONFromSQL`:** The function moves to the main thread and is renamed (e.g. `_buildGeoJSONFromRaw`). It accepts `unknown[]` (the `JSON.parse` result) and accesses each object by named key. The positional comment block (`0:lat, 1:lon, ...`) is deleted. The logic (feature construction, taxonomy sets, minYear/maxYear) is identical.

```typescript
// New main-thread parser shape (replaces positional access):
interface RawOccRow {
  lat: number;
  lon: number;
  ecdysis_id: number | null;
  observation_id: number | null;
  specimen_observation_id: number | null;
  year: number;
  scientificName: string | null;
  genus: string | null;
  family: string | null;
  source: string | null;
}
```

### Anti-Patterns to Avoid

- **Callback accumulation with json_group_array query:** Do not push all rows into a JS array inside the exec callback; use `geoRows[0][0]` directly — there will be exactly one row.
- **Transferring the Uint8Array instead of its `.buffer`:** `Uint8Array` is not itself transferable; its `.buffer` (`ArrayBuffer`) is. Always pass `encoded.buffer` in the transfer list, not `encoded`.
- **Re-using the buffer after transfer:** After `postMessage(msg, [buffer])`, `buffer.byteLength === 0`. Cache the JSON string or Uint8Array before encoding if the worker needs to serve the same data again (it currently does not — `_geoJSON = null` is already the pattern).
- **Keeping `_buildGeoJSONFromSQL` in the worker:** Once the result is a JSON string, building the GeoJSON in the worker just means transferring a large object via structured clone anyway. Move the build to the main thread to avoid that cost.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Multi-row to single result | Custom chunking/batching JS loop | `json_group_array` SQL aggregate | SQLite materialises entirely in WASM memory; no JS loop cost |
| UTF-8 encoding of JSON | Manual byte conversion | `TextEncoder` (built-in) | Platform API, ~1 GB/s throughput, no allocation overhead |
| Transferable binary | SharedArrayBuffer + locks | `ArrayBuffer` in transfer list | Zero-copy, no shared memory complexity |

## Research Q&A (direct answers to the brief)

### Q1: Does wa-sqlite's `exec` support returning all rows at once?

**No.** `sqlite3.exec` (source: `src/sqlite-api.js` lines 431–443) is implemented as:

```js
sqlite3.exec = async function (db, sql, callback) {
  for await (const stmt of sqlite3.statements(db, sql)) {
    let columns;
    while (await sqlite3.step(stmt) === SQLite.SQLITE_ROW) {
      if (callback) {
        columns = columns ?? sqlite3.column_names(stmt);
        const row = sqlite3.row(stmt);
        await callback(row, columns);  // fires once per SQLITE_ROW
      }
    }
  }
  return SQLite.SQLITE_OK;
};
```

Each `sqlite3.step(stmt)` is an Emscripten `cwrap` call into WASM (`{ async }` = Asyncify). Each `callback(row, columns)` is a WASM→JS boundary crossing. There is no batch-return variant. `execWithParams` also accumulates rows via per-row push. There is no `get_table` equivalent.

**However:** If the SQL itself returns one row (via `json_group_array`), only one callback fires — the boundary crossing problem dissolves without needing a different API. [VERIFIED: wa-sqlite 1.0.0 source, `node_modules/wa-sqlite/src/sqlite-api.js`]

### Q2: json_group_array feasibility with exec

Yes, fully feasible. `json_group_array(json_object(...))` is a standard SQLite aggregate. The entire aggregation runs inside WASM. `sqlite3.exec` fires the callback exactly once (one output row). The column value comes back as a JavaScript `string` via `sqlite3.column_text` → `Module.cwrap(..., 'string')`. The string is already decoded from WASM UTF-8 memory by Emscripten's `cwrap` machinery before the callback receives it — there is no additional WASM memory read needed in JS. [VERIFIED: wa-sqlite source, sqlite-api.js `column_text` uses `'s'` return type in cwrap decl]

### Q3: ArrayBuffer transfer path

The fastest path from JSON string → transferable ArrayBuffer:

```
// Worker:
const encoded = new TextEncoder().encode(jsonStr);  // Uint8Array, UTF-8
const buffer = encoded.buffer;                       // ArrayBuffer
self.postMessage({ kind: 'geojson-result', id, buffer }, [buffer]);

// Main thread (sqlite.ts onmessage handler):
const jsonStr = new TextDecoder().decode(msg.buffer as ArrayBuffer);
const rows = JSON.parse(jsonStr) as RawOccRow[];
// then call _buildGeoJSONFromMain(rows)
```

The `[buffer]` transfer list causes the ArrayBuffer to be **neutered** in the worker (byteLength → 0) and **moved** to the main thread with zero copy. `postMessage` without a transfer list would structured-clone the buffer (copy), negating the gain.

The main thread receives the `ArrayBuffer` as `msg.buffer`. `TextDecoder.decode` does not copy — it reads directly from the buffer. `JSON.parse` is the only remaining allocation-heavy step. [VERIFIED: MDN spec, structuredClone / transferable objects; CITED: https://developer.mozilla.org/en-US/docs/Web/API/Web_Workers_API/Transferable_objects]

### Q4: What is the 93–113 ms "loadOccurrenceGeoJSON" transfer cost?

The `features.ts` benchmark line `loadOccurrenceGeoJSON (worker→main transfer)` is **the end-to-end time** from sending the `build-geojson` postMessage to receiving `geojson-result`, measured on the main thread. It includes:

1. Message dispatch latency (~1 ms)
2. Worker processing time (currently trivial — just `_geoJSON` reference, no re-computation)
3. **Structured clone of the GeoJSON object**: ~92K `Feature` objects, each with `type`, `geometry` (with `coordinates` array), and `properties` (3 keys). This is the dominant cost.

The spec for `postMessage` without a transfer list performs the structured clone algorithm on the entire message payload. A FeatureCollection with 92K features is a deep object graph. Replacing it with a transferred `ArrayBuffer` eliminates the clone entirely — the buffer move is O(1). Transfer time will drop to near-zero; `TextDecoder.decode` + `JSON.parse` on the main thread will become the new cost, expected to be 15–50 ms total for a 5–10 MB payload. [ASSUMED — no direct measurement; inference from Web platform spec and known JSON.parse throughput]

### Q5: json_group_array memory — WASM heap concern

SQLite's `json_group_array` accumulates the result string in SQLite's internal memory (the C heap managed by Emscripten's `_sqlite3_malloc`). For 92,802 rows × ~10 columns of mixed types, a rough estimate:

- Per-row JSON: ~120–160 bytes (lat/lon as floats, IDs as ints, strings ~20 chars avg)
- Total: ~11–15 MB for the JSON aggregate string

**Is this a problem?** wa-sqlite's WASM module uses Emscripten's default memory model. The default initial WASM memory is 16 MB; it grows dynamically via `memory.grow`. The existing 24 MB `.db` ArrayBuffer is already in the worker heap (seeded into MemoryVFS). SQLite's page cache for a read-only scan of a 24 MB DB will use additional WASM heap. Emscripten WebAssembly.Memory is limited to the JS engine's ArrayBuffer size limit (~2 GB in practice). The peak heap during `json_group_array` will be roughly:

- 24 MB: DB file buffer (in MemoryVFS)
- SQLite page cache: ~1–4 MB (SQLite default page size 4096 B; the DB is read-only so no journal)
- json_group_array accumulation: ~11–15 MB

Total peak: ~37–43 MB. This is well within practical WASM heap limits. No explicit heap size flag is needed. [ASSUMED — estimate; measurement recommended at the benchmark checkpoint]

**Comparison to current approach:** Currently the worker builds 92K JS `Feature` objects before transfer (~30–50 MB of JS heap). Moving GeoJSON build to the main thread reduces peak worker heap — the worker only holds the ~11–15 MB JSON string transiently before `TextEncoder.encode` (which produces another ~11–15 MB Uint8Array); both are freed after transfer. Net peak worker heap may actually be lower than current approach.

**SQLITE_LIMIT_LENGTH:** SQLite has a default string length limit of `SQLITE_MAX_LENGTH` = 1,000,000,000 bytes (1 GB), far above our output size. No limit change required. [CITED: https://www.sqlite.org/limits.html]

### Q6: IDBBatchAtomicVFS / OPFS persistence

Out of scope for this phase. Noted as follow-up: persisting the DB in OPFS would eliminate the ~85–700 ms fetch on subsequent visits. IDBBatchAtomicVFS is included in wa-sqlite 1.0.0 (`src/examples/IDBBatchAtomicVFS.js`). Defer to a future phase.

### Q7: Column index order and named access

**Current:** `_buildGeoJSONFromSQL` uses positional indices 0–9 (lat, lon, ecdysis_id, observation_id, specimen_observation_id, year, scientificName, genus, family, source). This is fragile — SQL column order must match exactly.

**After this phase:** `json_object` embeds names in the JSON payload. The receiver uses named access (`row.lat`, `row.ecdysis_id`, etc.). `_buildGeoJSONFromSQL` is deleted from the worker. A new function `_buildGeoJSONFromRaw(rows: RawOccRow[])` on the main thread replaces it with identical logic but named property access.

The function moves from `src/sqlite-worker.ts` to `src/features.ts` (or a new internal helper). The `features.ts` `loadOccurrenceGeoJSON` export calls `_buildGeoJSONFromRaw` after decoding the buffer. The `OccurrenceProperties`, `DataSummary`, `TaxonOption` type exports and all downstream consumers are unchanged.

## Common Pitfalls

### Pitfall 1: Forgetting the transfer list

**What goes wrong:** `self.postMessage({ kind: 'geojson-result', id, buffer })` without `[buffer]` — the ArrayBuffer is structured-cloned (copied) instead of transferred. Transfer time is O(n), not O(1).
**Why it happens:** The transfer list is an easy-to-miss second argument.
**How to avoid:** Always write `self.postMessage(msg, [msg.buffer])` and add a comment noting it is a transfer.
**Warning signs:** `buffer.byteLength` is still non-zero in the worker after postMessage — it should be 0 if correctly transferred.

### Pitfall 2: Using `encoded` (Uint8Array) in transfer list instead of `encoded.buffer`

**What goes wrong:** `Uint8Array` is a view; it is not itself in the Transferable Objects list. `postMessage(msg, [encoded])` throws or silently copies.
**How to avoid:** Always pass `encoded.buffer` (the underlying `ArrayBuffer`) in the transfer list.

### Pitfall 3: json_group_array returns NULL when no rows match

**What goes wrong:** If the WHERE clause matches zero rows, `json_group_array` returns SQL NULL (not `'[]'`). `geoRows[0][0]` would be `null`, and `JSON.parse(null)` throws.
**How to avoid:** Use `COALESCE(json_group_array(...), '[]')` or handle null in the callback: `const jsonStr = (geoRows[0]?.[0] as string | null) ?? '[]'`.

### Pitfall 4: `_buildGeoJSONFromSQL` still references positional columns

**What goes wrong:** If the existing positional function is re-used against `JSON.parse` output, every access (`r[0]`, `r[1]`) returns `undefined` — JSON.parse produces objects, not arrays.
**How to avoid:** Write a new named-access function; delete the old one in the same commit.

### Pitfall 5: TypeScript type of the received message buffer

**What goes wrong:** `msg.buffer` is typed as `unknown` or `ArrayBuffer | undefined` in the current `WorkerMsg` type in `sqlite.ts`. Without updating the type, `TextDecoder.decode(msg.buffer)` will produce a TypeScript error.
**How to avoid:** Extend `WorkerMsg` to include `buffer?: ArrayBuffer` and add a runtime guard before decode.

## Code Examples

### Full worker geo query (new)

```typescript
// Source: src/sqlite-worker.ts (to be written)
const GEO_AGG_SQL =
  "SELECT COALESCE(json_group_array(json_object(" +
  "  'lat', CAST(lat AS REAL)," +
  "  'lon', CAST(lon AS REAL)," +
  "  'ecdysis_id', ecdysis_id," +
  "  'observation_id', observation_id," +
  "  'specimen_observation_id', specimen_observation_id," +
  "  'year', year," +
  "  'scientificName', scientificName," +
  "  'genus', genus," +
  "  'family', family," +
  "  'source', source" +
  ")), '[]') AS rows_json " +
  "FROM occurrences WHERE lat IS NOT NULL AND lon IS NOT NULL";

const tGeo0 = performance.now();
let jsonStr = '[]';
await sqlite3.exec(db, GEO_AGG_SQL, (row) => {
  jsonStr = (row[0] as string | null) ?? '[]';
});
const tGeo1 = performance.now();
logs.push(`[BENCHMARK] SQL geo agg query: ${(tGeo1 - tGeo0).toFixed(0)} ms`);

const tEncode0 = performance.now();
const encoded = new TextEncoder().encode(jsonStr);
const buffer = encoded.buffer;
const tEncode1 = performance.now();
logs.push(`[BENCHMARK] TextEncoder.encode: ${(tEncode1 - tEncode0).toFixed(0)} ms | ${(buffer.byteLength / 1024 / 1024).toFixed(1)} MB`);
```

### Worker build-geojson handler (new)

```typescript
// Source: src/sqlite-worker.ts (to be written)
} else if (kind === 'build-geojson') {
  const buf = _geoBuffer;
  _geoBuffer = null; // transfer ownership to main thread
  if (buf == null) {
    self.postMessage({ kind: 'exec-error', id, message: 'geo buffer already consumed' });
    return;
  }
  // Transfer zero-copy — buf.byteLength will be 0 in worker after this
  self.postMessage({ kind: 'geojson-result', id, buffer: buf }, [buf]);
}
```

### Main thread decode (sqlite.ts onmessage handler, new geojson-result branch)

```typescript
// Source: src/sqlite.ts (to be written)
} else if (msg.kind === 'geojson-result') {
  const p = _pending.get(msg.id!);
  if (!p) return;
  _pending.delete(msg.id!);
  p.resolve(msg.buffer as ArrayBuffer);  // pass raw buffer to caller
}
```

### Main thread decode and build (features.ts, new)

```typescript
// Source: src/features.ts (to be written)
export async function loadOccurrenceGeoJSON(): Promise<{...}> {
  await tablesReady;
  const tPost0 = performance.now();
  const buffer = await _load() as ArrayBuffer;
  const tPost1 = performance.now();
  console.log(`[BENCHMARK] loadOccurrenceGeoJSON buffer transfer: ${(tPost1 - tPost0).toFixed(0)} ms | ${(buffer.byteLength / 1024 / 1024).toFixed(1)} MB`);

  const tDecode0 = performance.now();
  const jsonStr = new TextDecoder().decode(buffer);
  const rows = JSON.parse(jsonStr) as RawOccRow[];
  const result = _buildGeoJSONFromRaw(rows);
  const tDecode1 = performance.now();
  console.log(`[BENCHMARK] decode+build GeoJSON: ${(tDecode1 - tDecode0).toFixed(0)} ms | features: ${result.geojson.features.length}`);

  return result;
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Parquet parse + INSERT loop | Prebuilt SQLite DB via MemoryVFS | Phase 121 | ~48% load time reduction |
| Per-row JS callback (92K crossings) | json_group_array single crossing | **Phase 122** | ~570 ms → ~50–100 ms (estimated) |
| Structured clone of GeoJSON object | ArrayBuffer transfer | **Phase 122** | ~100 ms → ~15–50 ms (estimated) |

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | json_group_array query will take ~50–100 ms (down from ~570 ms) | State of the Art | Could be less or more; benchmark required at verify step |
| A2 | TextDecoder.decode + JSON.parse will take ~15–50 ms | Q4 / Code Examples | Could be higher on slower devices; benchmark required |
| A3 | Peak WASM heap during aggregation is ~37–43 MB | Q5 | Could be higher if page cache is larger; measure in benchmark |
| A4 | wa-sqlite 1.0.0 embeds SQLite >= 3.9.0 (json_group_array present) | Q2 | If SQLite < 3.9.0 the query would error; extremely unlikely |
| A5 | CAST(lat/lon AS REAL) is not needed — they are already REAL in the schema | Code Examples | If stored as TEXT, lat/lon comparison would be string; verify schema |

## Open Questions

1. **Schema column types for lat/lon**
   - What we know: the pipeline writes `lat`, `lon` as numeric columns in occurrences; the WHERE clause `lat IS NOT NULL` is already in production
   - What's unclear: whether SQLite's `json_object` will serialize them as JSON numbers or strings (depends on declared affinity)
   - Recommendation: include `CAST(lat AS REAL), CAST(lon AS REAL)` defensively, or verify with `PRAGMA table_info(occurrences)` in a task

2. **Wire protocol type change for `geojson-result`**
   - What we know: currently `geojson-result` carries `result: unknown` (a full JS object); changing it to `buffer: ArrayBuffer` is a breaking change to the internal protocol
   - What's unclear: whether any other code path reads `geojson-result` besides `sqlite.ts`
   - Recommendation: grep for `geojson-result` before the task to confirm it is only consumed in `sqlite.ts`

## Environment Availability

Step 2.6 SKIPPED — this phase makes no changes to build tooling, pipeline, or external services. All changes are to `src/sqlite-worker.ts`, `src/sqlite.ts`, and `src/features.ts` using existing installed dependencies.

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Vitest 4.1.2 |
| Config file | `vite.config.ts` (`test.environment: 'happy-dom'`) |
| Quick run command | `npm test` |
| Full suite command | `npm test` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| PERF-GEO-01 | json_group_array query returns correct row shape | unit | `npm test` (new test in `src/tests/`) | ❌ Wave 0 |
| PERF-GEO-02 | ArrayBuffer transfer delivers correct GeoJSON to main thread | integration | manual browser benchmark | manual-only |
| PERF-GEO-03 | _buildGeoJSONFromRaw produces same result as _buildGeoJSONFromSQL | unit | `npm test` | ❌ Wave 0 |

The existing `bee-atlas.test.ts` mocks `sqlite.ts` and `features.ts` entirely — it will not be affected by this change. The new unit tests for `_buildGeoJSONFromRaw` can be added to `src/tests/`.

### Sampling Rate

- **Per task commit:** `npm test`
- **Per wave merge:** `npm test`
- **Phase gate:** Full suite green + browser benchmark showing SQL geo query < 150 ms in Firefox warm-cache run

### Wave 0 Gaps

- [ ] `src/tests/build-geojson.test.ts` — unit test for `_buildGeoJSONFromRaw` covering: correct feature count, correct occId derivation, null lat/lon skip, summary counts, taxaOptions shape

## Security Domain

This phase makes no changes to authentication, input validation, cryptography, or access control. No ASVS categories apply. `security_enforcement` default = enabled, but no new threat surface is introduced.

## Sources

### Primary (HIGH confidence)

- wa-sqlite 1.0.0 source — `node_modules/wa-sqlite/src/sqlite-api.js` — exec implementation, row iteration, column_text cwrap
- wa-sqlite 1.0.0 types — `node_modules/wa-sqlite/src/types/index.d.ts` — SQLiteAPI interface
- `src/sqlite-worker.ts` (Phase 121 output) — current exec loop, column order, benchmark lines
- `src/sqlite.ts` — wire protocol, WorkerMsg type, loadOccurrenceGeoJSON
- `src/features.ts` — loadOccurrenceGeoJSON consumer, benchmark log
- `.planning/quick/260527-spike-prebuilt-sqlite-vfs/FINDINGS.md` — benchmark baseline numbers
- `.planning/phases/121-prebuilt-sqlite-load/121-03-SUMMARY.md` — Firefox benchmark: SQL geo query 560–570 ms, transfer ~100–113 ms

### Secondary (MEDIUM confidence)

- MDN Web Docs — Transferable objects / Worker.postMessage transfer list [CITED: https://developer.mozilla.org/en-US/docs/Web/API/Web_Workers_API/Transferable_objects]
- SQLite docs — json_group_array, json_object, SQLITE_MAX_LENGTH [CITED: https://www.sqlite.org/json1.html, https://www.sqlite.org/limits.html]

### Tertiary (LOW confidence)

- Estimated decode+build times (A1, A2) — inference from platform benchmarks, not measured in this project

## Metadata

**Confidence breakdown:**
- wa-sqlite exec API: HIGH — read directly from installed source
- json_group_array feasibility: HIGH — standard SQLite built-in since 3.9.0 (2015)
- ArrayBuffer transfer mechanics: HIGH — Web platform spec, confirmed in MDN
- Performance estimates: LOW — inference only; measurement required at benchmark checkpoint

**Research date:** 2026-05-27
**Valid until:** 2026-06-27 (stable APIs)
