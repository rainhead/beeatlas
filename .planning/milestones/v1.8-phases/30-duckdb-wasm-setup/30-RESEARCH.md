# Phase 30: DuckDB WASM Setup - Research

**Researched:** 2026-03-30
**Domain:** @duckdb/duckdb-wasm initialization, Parquet/GeoJSON ingestion, Vite WASM config
**Confidence:** MEDIUM-HIGH (core init API HIGH; spatial extension availability MEDIUM due to conflicting sources)

## Summary

Phase 30 initializes a DuckDB WASM singleton on page load and loads four data assets — `ecdysis.parquet`, `samples.parquet`, `counties.geojson`, and `ecoregions.geojson` — into in-memory tables before the OL map renders. The current data layer uses `hyparquet` + `parquetReadObjects` with `onError` callbacks wired into `specimenSource.once('change', ...)`. Phase 30 replaces data loading at the source level; OL feature creation stays in Phase 31.

**Primary recommendation:** Use the EH bundle (`duckdb-eh.wasm`) with the MANUAL_BUNDLES Vite pattern (`?url` imports). This avoids the SharedArrayBuffer / COOP-COEP requirement entirely. Load Parquet via `registerFileURL` or direct `SELECT * FROM 'https://...'` SQL. Load GeoJSON via `INSTALL spatial; LOAD spatial; CREATE TABLE ... AS SELECT * FROM 'https://...'` — spatial extension is available in DuckDB WASM via `extensions.duckdb.org`, though with caveats noted below. Export a Promise-based singleton from `src/duckdb.ts`; `bee-map.ts` awaits it before constructing OL sources.

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| @duckdb/duckdb-wasm | 1.33.1-dev20.0 | In-browser DuckDB via WebAssembly | Official DuckDB WASM client; only option |

**Version verified:** `npm view @duckdb/duckdb-wasm version` → `1.33.1-dev20.0` (published 2026-03-26). The package uses `-dev` versioning tied to DuckDB core releases; this is the stable `latest` tag.

**Installation:**
```bash
npm install @duckdb/duckdb-wasm
```

No additional packages needed. `apache-arrow` is a peer dependency bundled inside `@duckdb/duckdb-wasm`; import `apache-arrow` types from the bundled copy if needed.

## Architecture Patterns

### Recommended Project Structure
```
frontend/src/
├── duckdb.ts            # NEW — DuckDB singleton; export initDuckDB(): Promise<AsyncDuckDB>
├── bee-map.ts           # MODIFIED — await initDuckDB() before constructing sources
├── parquet.ts           # UNCHANGED in Phase 30 (replaced in Phase 31)
└── ...
```

### Pattern 1: MANUAL_BUNDLES Vite Init (No COOP/COEP)
**What:** Import WASM and worker files with Vite's `?url` suffix; build a `MANUAL_BUNDLES` object; call `selectBundle` + `AsyncDuckDB`.
**When to use:** Always — this is the correct Vite pattern. CDN bundles (`getJsDelivrBundles`) require network at init time and bypass Vite's asset pipeline.

```typescript
// Source: @duckdb/duckdb-wasm README (official)
import * as duckdb from '@duckdb/duckdb-wasm';
import duckdb_wasm     from '@duckdb/duckdb-wasm/dist/duckdb-mvp.wasm?url';
import mvp_worker      from '@duckdb/duckdb-wasm/dist/duckdb-browser-mvp.worker.js?url';
import duckdb_wasm_eh  from '@duckdb/duckdb-wasm/dist/duckdb-eh.wasm?url';
import eh_worker       from '@duckdb/duckdb-wasm/dist/duckdb-browser-eh.worker.js?url';

const MANUAL_BUNDLES: duckdb.DuckDBBundles = {
  mvp: { mainModule: duckdb_wasm,    mainWorker: mvp_worker },
  eh:  { mainModule: duckdb_wasm_eh, mainWorker: eh_worker  },
};

export async function initDuckDB(): Promise<duckdb.AsyncDuckDB> {
  const bundle = await duckdb.selectBundle(MANUAL_BUNDLES);
  const worker = new Worker(bundle.mainWorker!);
  const db = new duckdb.AsyncDuckDB(new duckdb.ConsoleLogger(), worker);
  await db.instantiate(bundle.mainModule, bundle.pthreadWorker);
  return db;
}
```

### Pattern 2: Singleton with Cached Promise
**What:** Module-level promise that resolves on first call and returns the same instance on subsequent calls.
**When to use:** Singleton needed — both `bee-map.ts` and future components share one DB instance.

```typescript
// src/duckdb.ts
let _dbPromise: Promise<duckdb.AsyncDuckDB> | null = null;

export function getDuckDB(): Promise<duckdb.AsyncDuckDB> {
  if (!_dbPromise) _dbPromise = initDuckDB();
  return _dbPromise;
}
```

### Pattern 3: Parquet Table Loading via registerFileURL
**What:** Register the CloudFront URL with `DuckDBDataProtocol.HTTP`, then `CREATE TABLE ... AS SELECT * FROM 'filename.parquet'`.
**When to use:** Preferred for Parquet — avoids fetching the full file as an ArrayBuffer before DuckDB sees it; DuckDB can do range requests for row-group pruning (though full scans are needed here).

```typescript
// Source: DuckDB WASM data ingestion docs (official)
import { DuckDBDataProtocol } from '@duckdb/duckdb-wasm';

async function loadParquet(db: duckdb.AsyncDuckDB, tableName: string, url: string) {
  await db.registerFileURL(`${tableName}.parquet`, url, DuckDBDataProtocol.HTTP, false);
  const conn = await db.connect();
  await conn.query(`CREATE TABLE ${tableName} AS SELECT * FROM '${tableName}.parquet'`);
  await conn.close();
}
```

**Alternative (simpler but materialises full file in JS first):**
```typescript
const res = await fetch(url);
const buf = new Uint8Array(await res.arrayBuffer());
await db.registerFileBuffer(`${tableName}.parquet`, buf);
const conn = await db.connect();
await conn.query(`CREATE TABLE ${tableName} AS SELECT * FROM '${tableName}.parquet'`);
await conn.close();
```
The `registerFileBuffer` approach is more reliable across CORS configurations — useful as a fallback if `registerFileURL` has issues with CloudFront.

### Pattern 4: GeoJSON Loading via Spatial Extension
**What:** `INSTALL spatial; LOAD spatial; CREATE TABLE ... AS SELECT * FROM 'https://...file.geojson'`
**When to use:** Required for `counties.geojson` and `ecoregions.geojson` per DUCK-02.

```typescript
async function loadGeoJSON(conn: duckdb.AsyncDuckDBConnection, tableName: string, url: string) {
  await conn.query(`INSTALL spatial; LOAD spatial;`);
  await conn.query(`CREATE TABLE ${tableName} AS SELECT * FROM '${url}'`);
}
```

**Spatial extension caveat (MEDIUM confidence):** The spatial extension is built for DuckDB WASM and served from `extensions.duckdb.org`. It requires a network fetch to load (`INSTALL` is a no-op in WASM; `LOAD` fetches `.duckdb_extension.wasm` at runtime). Confirmed working in multiple 2024-2025 examples. However, older discussions (2023) reported it as unavailable, and the official WASM extensions table page does NOT list spatial among bundled extensions — it must be fetched at `LOAD` time. CORS is not a problem for `extensions.duckdb.org` itself (it allows all origins). The known limitation: `ST_Read()` cannot read files registered via `registerFileBuffer/registerFileHandle` — use HTTP URLs directly instead, which works fine since the GeoJSON files are on CloudFront with CORS headers.

**Fallback if spatial extension fails:** Use `read_json_auto('url')` which loads the GeoJSON as a plain JSON table (preserving `properties` fields). This loses geometry but may be sufficient for Phase 30 since DUCK-02 says "available for future spatial SQL queries" — if spatial queries are deferred, a JSON table satisfies the requirement. This decision should be made during planning; recommended: attempt spatial first with graceful fallback log, flag as open question.

### Pattern 5: Loading Overlay Integration
**What:** Set `_dataLoading = true` before DuckDB init starts; set to `false` when all four tables are ready. Error overlay on catch.
**Current pattern (from bee-map.ts line 752):** `specimenSource.once('change', () => { this._dataLoading = false; ... })`. Phase 30 replaces this with an explicit `await` on the DuckDB init promise.

```typescript
// In BeeMap.connectedCallback() or firstUpdated():
try {
  const db = await getDuckDB();
  await loadAllTables(db);
  this._dataLoading = false;
} catch (err) {
  this._dataError = (err as Error).message;
  this._dataLoading = false;
}
```

### Anti-Patterns to Avoid
- **Using CDN bundles in Vite:** `getJsDelivrBundles()` hits `cdn.jsdelivr.net` at runtime and bypasses Vite's asset pipeline — WASM files won't be in the production build.
- **Threads bundle without COOP/COEP:** The `threads` variant requires `Cross-Origin-Embedder-Policy: require-corp` + `Cross-Origin-Opener-Policy: same-origin`. CloudFront would need these headers added to the default behavior. The EH bundle avoids this entirely.
- **Calling `registerFileBuffer` for ST_Read:** Spatial extension `ST_Read()` cannot handle files registered via `registerFile*` — only HTTP URLs work with spatial.
- **Opening a new connection per query:** Connections are lightweight but workers are not — one `AsyncDuckDB` instance, open connection for bulk loading then close, reopen for queries as needed.
- **Multi-statement strings in `conn.query()`:** The `query()` API may not support semicolon-separated multi-statement strings reliably — use separate `await conn.query(...)` calls per statement.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Browser Parquet parsing | Custom fetch+decode | `@duckdb/duckdb-wasm` PARQUET scan | DuckDB handles columnar encoding, nested types, data types correctly |
| Bundle selection | Browser feature detection | `duckdb.selectBundle()` | Already detects EH vs MVP support correctly |
| WASM file serving | Manual copy to public/ | Vite `?url` imports | Vite handles content-hashing and correct MIME types automatically |
| Arrow result conversion | Custom Arrow parser | `.toArray().map(r => r.toJSON())` | Arrow tables from query() have built-in JSON conversion |

## Common Pitfalls

### Pitfall 1: Missing `?url` Suffix on WASM Imports
**What goes wrong:** Vite tries to inline the WASM file as a data URL or fails to resolve it — init crashes with "Failed to fetch" or "Wrong content type."
**Why it happens:** Without `?url`, Vite treats `.wasm` files as binary assets to inline, not as separate files to serve.
**How to avoid:** All four imports (`duckdb-mvp.wasm`, `duckdb-browser-mvp.worker.js`, `duckdb-eh.wasm`, `duckdb-browser-eh.worker.js`) must have the `?url` suffix.
**Warning signs:** TypeScript error "Module 'x.wasm' cannot be imported using this construct" or runtime "Failed to execute 'postMessage'" on the Worker.

### Pitfall 2: COOP/COEP Header Confusion
**What goes wrong:** Developer chooses the `threads` bundle (multi-threaded) but doesn't add COOP/COEP headers; browser blocks SharedArrayBuffer with a cryptic error.
**Why it happens:** The threads bundle depends on SharedArrayBuffer, which requires cross-origin isolation.
**How to avoid:** Use EH bundle (DUCK-04 explicitly names this choice). If threads are ever needed later, add COOP/COEP headers to both Vite dev server config and CloudFront ResponseHeadersPolicy.
**Warning signs:** Console error "SharedArrayBuffer is not defined" or "Cross-Origin-Opener-Policy header ... does not permit cross-origin isolation."

### Pitfall 3: Spatial Extension Network Failure
**What goes wrong:** `LOAD spatial` fails in a test environment without internet access or if `extensions.duckdb.org` is unreachable.
**Why it happens:** `LOAD spatial` makes a fetch to `extensions.duckdb.org` at runtime — it requires network.
**How to avoid:** Wrap `LOAD spatial` in a try/catch; log a clear error; plan a fallback (read_json_auto for GeoJSON, or defer spatial tables to post-load). Note: production CloudFront deployment will have network access, so this mainly affects offline dev.
**Warning signs:** `Error: Extension "spatial" not found` or timeout fetching `.duckdb_extension.wasm`.

### Pitfall 4: Arrow BigInt Serialization
**What goes wrong:** `JSON.stringify(row.toJSON())` throws "Do not know how to serialize a BigInt" for integer columns that DuckDB represents as Arrow `Int64`.
**Why it happens:** Arrow `Int64` maps to JavaScript `BigInt`, not `number`.
**How to avoid:** Either use a replacer function (`(k, v) => typeof v === 'bigint' ? Number(v) : v`) or cast to `INTEGER` in the SQL query. For Phase 30 (table creation only, no JS consumption of results), this only matters if you add debug queries. Relevant for Phase 31 when rows are read back.

### Pitfall 5: Multi-Statement Query Strings
**What goes wrong:** `conn.query('INSTALL spatial; LOAD spatial;')` may silently execute only the first statement or throw.
**Why it happens:** The `query()` API processes one statement. Behavior with semicolons is inconsistent.
**How to avoid:** Call each SQL statement in a separate `await conn.query(...)` call. Or use `conn.send()` which supports multi-statement.
**Warning signs:** `LOAD spatial` appears to succeed but `SELECT ST_Point(0,0)` errors "Function ST_Point does not exist."

### Pitfall 6: CORS for Parquet on CloudFront
**What goes wrong:** `registerFileURL(..., DuckDBDataProtocol.HTTP, false)` or direct SQL `FROM 'https://beeatlas.net/data/ecdysis.parquet'` fails with a CORS error.
**Why it happens:** The browser enforces CORS on fetch requests from WASM workers.
**How to avoid:** CloudFront already has `dataCorsPolicy` with `accessControlAllowOrigins: ['*']` on the `/data/*` behavior — this is already correct. Verify by checking response headers on a data URL. No changes to CDK infrastructure needed for Parquet CORS.
**Warning signs:** DevTools Network tab shows `ecdysis.parquet` request with `CORS error` status; console shows "No 'Access-Control-Allow-Origin' header."

## Code Examples

### Complete `src/duckdb.ts` Singleton Module (Vite + EH Bundle)
```typescript
// Source: @duckdb/duckdb-wasm README (official) + data ingestion docs
import * as duckdb from '@duckdb/duckdb-wasm';
import duckdb_wasm     from '@duckdb/duckdb-wasm/dist/duckdb-mvp.wasm?url';
import mvp_worker      from '@duckdb/duckdb-wasm/dist/duckdb-browser-mvp.worker.js?url';
import duckdb_wasm_eh  from '@duckdb/duckdb-wasm/dist/duckdb-eh.wasm?url';
import eh_worker       from '@duckdb/duckdb-wasm/dist/duckdb-browser-eh.worker.js?url';
import { DuckDBDataProtocol } from '@duckdb/duckdb-wasm';

const MANUAL_BUNDLES: duckdb.DuckDBBundles = {
  mvp: { mainModule: duckdb_wasm,    mainWorker: mvp_worker },
  eh:  { mainModule: duckdb_wasm_eh, mainWorker: eh_worker  },
};

let _dbPromise: Promise<duckdb.AsyncDuckDB> | null = null;

async function _init(): Promise<duckdb.AsyncDuckDB> {
  const bundle = await duckdb.selectBundle(MANUAL_BUNDLES);
  const worker = new Worker(bundle.mainWorker!);
  const db = new duckdb.AsyncDuckDB(new duckdb.ConsoleLogger(), worker);
  await db.instantiate(bundle.mainModule, bundle.pthreadWorker);
  return db;
}

export function getDuckDB(): Promise<duckdb.AsyncDuckDB> {
  if (!_dbPromise) _dbPromise = _init();
  return _dbPromise;
}

export async function loadAllTables(db: duckdb.AsyncDuckDB, baseUrl: string): Promise<void> {
  // Load parquet tables
  for (const [table, file] of [['ecdysis', 'ecdysis.parquet'], ['samples', 'samples.parquet']] as const) {
    await db.registerFileURL(`${file}`, `${baseUrl}/${file}`, DuckDBDataProtocol.HTTP, false);
    const conn = await db.connect();
    await conn.query(`CREATE TABLE ${table} AS SELECT * FROM '${file}'`);
    await conn.close();
  }
  // Load spatial tables (GeoJSON via spatial extension)
  const conn = await db.connect();
  await conn.query(`INSTALL spatial`);
  await conn.query(`LOAD spatial`);
  await conn.query(`CREATE TABLE counties AS SELECT * FROM '${baseUrl}/counties.geojson'`);
  await conn.query(`CREATE TABLE ecoregions AS SELECT * FROM '${baseUrl}/ecoregions.geojson'`);
  await conn.close();
}
```

### Arrow Result to Plain Object
```typescript
// Source: DuckDB WASM query API docs
const conn = await db.connect();
const result = await conn.query<{count: arrow.Int32}>(`SELECT COUNT(*) as count FROM ecdysis`);
const rows = result.toArray().map(r => r.toJSON());
console.log(rows[0]?.count); // number or BigInt depending on column type
await conn.close();
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| CDN bundle via `getJsDelivrBundles()` | MANUAL_BUNDLES with `?url` Vite imports | Since Vite support added | WASM files served from own origin, no CDN dependency |
| httpfs extension for remote Parquet | Built-in HTTP fetch via `registerFileURL` / direct SQL | Since ~v0.9 | No extension needed for Parquet from URLs |
| Threads bundle (SharedArrayBuffer) | EH bundle (single-threaded, no COOP/COEP) | Design choice | No header changes required on CloudFront |

**Deprecated/outdated:**
- `getJsDelivrBundles()` pattern: Works but requires CDN access at init time; MANUAL_BUNDLES is the Vite-idiomatic approach.
- httpfs extension for remote Parquet: Not needed; DuckDB WASM has built-in HTTP fetch for registered URLs.

## Open Questions

1. **Spatial extension reliability in this version (1.33.1-dev20.0)**
   - What we know: Multiple sources confirm `LOAD spatial` works in DuckDB WASM; spatial extension is built for WASM. However one early GitHub discussion (2023, may be outdated) said it was not available.
   - What's unclear: Whether version 1.33.1-dev20.0 ships with spatial extension built and hosted on extensions.duckdb.org for the matching version hash.
   - Recommendation: Plan the implementation with `LOAD spatial` + try/catch fallback. If spatial fails, fall back to `read_json_auto` for GeoJSON (loses geometry column but preserves properties needed for filter queries). Add an explicit integration smoke test: `SELECT COUNT(*) FROM counties` after load.

2. **Multi-statement behavior in conn.query()**
   - What we know: Documentation is ambiguous about multi-statement query strings.
   - What's unclear: Whether `conn.query('INSTALL spatial; LOAD spatial;')` works or silently drops the second statement.
   - Recommendation: Use separate `await conn.query()` calls for each statement to be safe. Confirmed approach in multiple working examples.

3. **GeoJSON column schema from spatial extension**
   - What we know: `ST_Read` / direct GeoJSON read via spatial extension creates a `geom` column of type `GEOMETRY` plus all `properties` fields flattened.
   - What's unclear: Exact column names from counties.geojson and ecoregions.geojson (depends on GeoJSON `properties` keys).
   - Recommendation: Run `DESCRIBE counties` in the browser console as a smoke test during implementation. The columns `NAME` (counties) and `NA_L3NAME` (ecoregions) are already used in `bee-map.ts` for OL click handling.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js 24 | npm install, vite build | ✓ | 24.12.0 | — |
| npm | package install | ✓ | 11.6.2 | — |
| extensions.duckdb.org | LOAD spatial (runtime) | Network-dependent | — | read_json_auto fallback |
| CloudFront CORS headers | Parquet fetch from WASM worker | ✓ (existing /data/* policy) | — | — |

**No blocking missing dependencies.** The only runtime network dependency is `extensions.duckdb.org` for `LOAD spatial`, which is reachable in production. Offline dev would need a fallback.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | None currently (frontend has no test setup) |
| Config file | none — Wave 0 gap |
| Quick run command | `npm run build` (TypeScript compile gate only) |
| Full suite command | Manual browser smoke test via devtools console |

**Note:** DUCK-03 ("all data loading completes before map renders") and DUCK-04 ("no COOP/COEP errors") are browser runtime behaviors that cannot be verified by a unit test framework. The success criteria are observable in Chrome/Firefox devtools.

### Phase Requirements to Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| DUCK-01 | `SELECT COUNT(*) FROM ecdysis` > 45000; `SELECT COUNT(*) FROM samples` > 9000 | manual/smoke | devtools console query | N/A |
| DUCK-02 | `SELECT COUNT(*) FROM counties` and `SELECT COUNT(*) FROM ecoregions` return non-zero | manual/smoke | devtools console query | N/A |
| DUCK-03 | Loading overlay present during init, gone when tables ready; error overlay on failure | manual/visual | browser observation | N/A |
| DUCK-04 | No COOP/COEP console errors; EH bundle loads cleanly | manual/visual | devtools console check | N/A |

### Sampling Rate
- **Per task commit:** `npm run build` from `frontend/` (TypeScript compile gate, exit 0)
- **Phase gate:** Manual browser smoke test — open devtools console, run `SELECT COUNT(*) FROM ecdysis`, verify row count and no errors

### Wave 0 Gaps
None for test infrastructure — the validation approach is build-gate + browser smoke test, which requires no new test files. The planner should include a manual verification step as the final task.

## Project Constraints (from CLAUDE.md)

- Node.js major version in `.nvmrc` (currently 24) must be consistent across `.nvmrc`, workflows, `package.json` engines field, and Dockerfiles.
- No new README or documentation files unless explicitly requested.
- Keep documentation concise; link to source files rather than duplicating config.

## Sources

### Primary (HIGH confidence)
- @duckdb/duckdb-wasm README (raw.githubusercontent.com) — MANUAL_BUNDLES Vite init pattern
- DuckDB WASM Data Ingestion docs (duckdb.org/docs/current/clients/wasm/data_ingestion.html) — registerFileURL, registerFileBuffer, DuckDBDataProtocol
- DuckDB WASM Query docs (duckdb.org/docs/current/clients/wasm/query.html) — conn.query(), conn.connect(), result.toArray()
- npm registry — version 1.33.1-dev20.0 confirmed current (2026-03-26)

### Secondary (MEDIUM confidence)
- duckdb-wasm-examples/duckdbwasm-vitebrowser (GitHub) — Vite ?url import pattern in practice
- DuckDB WASM Extensions blog post (duckdb.org/2023/12/18/duckdb-extensions-in-wasm) — LOAD semantics, spatial extension available
- GitHub discussion #1621 (duckdb/duckdb-wasm) — confirmed spatial INSTALL/LOAD + GeoJSON URL pattern
- Multiple 2024-2025 articles (camptocamp-geo dev.to, tobilg.com) — spatial LOAD working examples

### Tertiary (LOW confidence)
- GitHub discussion #1531 (duckdb/duckdb-wasm, 2023) — claimed spatial not in WASM; likely outdated
- DuckDB WASM extensions page official table — does NOT list spatial (possibly outdated or spatial is dynamically loaded not bundled)

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — version confirmed via npm registry
- Architecture (init pattern): HIGH — from official README, multiple confirmed examples
- Parquet loading: HIGH — from official data ingestion docs
- GeoJSON/spatial extension: MEDIUM — conflicting sources; confirmed in 2024-2025 examples but older sources and official extensions table are contradictory
- Pitfalls: HIGH for WASM/Vite pitfalls; MEDIUM for spatial extension edge cases

**Research date:** 2026-03-30
**Valid until:** 2026-04-30 (duckdb-wasm uses -dev versioning; spatial extension availability could change)
